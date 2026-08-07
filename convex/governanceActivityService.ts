/**
 * What the AI actually did, over a stretch of days.
 *
 * The standing view answers "is anything wrong". It could not answer "what has
 * this thing been doing", and a compliance screen whose every figure is a count
 * of problems reads as blank whenever the answer is nought — Anthony, 2026-08-06:
 * *"its factual and boring."* The record was always there; nothing was reading it.
 *
 * Every figure here still comes from a row somebody can go and look at. A run
 * happened or it did not; a tool call read something or changed it. Nothing on
 * this screen is modelled, smoothed or projected.
 *
 * Kept free of database access so the buckets and the thresholds can be tested
 * directly, the same way `governanceDashboardService` is.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

/** The ranges the screen offers. Longer than ninety days is an evidence pack, not a dashboard. */
export const RANGE_DAYS = [7, 30, 90] as const;

export type RangeDays = (typeof RANGE_DAYS)[number];

export function isRangeDays(value: number): value is RangeDays {
  return (RANGE_DAYS as readonly number[]).includes(value);
}

export type SideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";

/**
 * What became of a run.
 *
 * `WAITED` is not a status any run holds. A run that parked on an approval and
 * was then let through ends its life as a success, so counting the status alone
 * would report that human oversight had happened nought times on a platform
 * where it happens daily — the one claim on this screen nobody can afford to get
 * wrong. It is derived from whether an approval was ever raised against the run.
 *
 * `UNFINISHED` covers failed and cancelled together, because the reader's
 * question is "did it do the thing", and both answers are no. Which of the two
 * it was is on the run itself.
 */
export type RunOutcome = "FINISHED" | "WAITED" | "UNFINISHED" | "IN_FLIGHT";

export function classifyRun(status: string, neededAPerson: boolean): RunOutcome {
  // Failure outranks oversight on purpose: a run a person approved and which
  // then fell over is a failure, and colouring it as oversight would dress a
  // fault up as a control working.
  if (status === "FAILED" || status === "CANCELLED") return "UNFINISHED";
  if (status === "QUEUED" || status === "RUNNING") return "IN_FLIGHT";
  if (neededAPerson) return "WAITED";
  return "FINISHED";
}

export type DayBucket = {
  /** ISO date, UTC. The screen decides how to write it; this decides which day it was. */
  date: string;
  finished: number;
  waited: number;
  unfinished: number;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day a moment fell on, as an ISO date. */
export function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Runs per day, with every day present.
 *
 * Days with no runs are emitted as zeroes rather than skipped. A chart that
 * omits its quiet days draws a weekend as though it never happened, which turns
 * an idle Sunday into a straight line between two Fridays — a shape the estate
 * never had.
 */
export function bucketRunsByDay(
  runs: Array<{ id: string; startedAt: number; status: string }>,
  runIdsNeedingAPerson: ReadonlySet<string>,
  now: number,
  days: number,
): DayBucket[] {
  const buckets = new Map<string, DayBucket>();

  // Walk back from today so the last bucket is the day the reader is having.
  for (let back = days - 1; back >= 0; back--) {
    const date = dayKey(now - back * DAY_MS);
    buckets.set(date, { date, finished: 0, waited: 0, unfinished: 0 });
  }

  for (const run of runs) {
    const bucket = buckets.get(dayKey(run.startedAt));
    if (!bucket) continue;

    const outcome = classifyRun(run.status, runIdsNeedingAPerson.has(run.id));
    if (outcome === "FINISHED") bucket.finished += 1;
    else if (outcome === "WAITED") bucket.waited += 1;
    else if (outcome === "UNFINISHED") bucket.unfinished += 1;
    // In-flight runs are left off. They are a few minutes old and will land in
    // one of the other three; charting them would show today's column sagging
    // and recovering on refresh.
  }

  return [...buckets.values()];
}

export type SideEffectSummary = {
  read: number;
  write: number;
  external: number;
  destructive: number;
  total: number;
  /** Whole percent of actions that only read. The most reassuring figure on the screen, when it is high. */
  readShare: number;
};

/**
 * What the AI was allowed to touch.
 *
 * Every tool call is already stamped with this at the point it runs, because the
 * runtime needs it to decide what requires a person. It has never been shown to
 * anybody. "Eighty-eight percent of what it did was read-only" is the sentence
 * an auditor is actually looking for, and it was sitting one query away.
 */
export function summariseSideEffects(levels: SideEffectLevel[]): SideEffectSummary {
  const count = (level: SideEffectLevel) => levels.filter((entry) => entry === level).length;

  const read = count("READ");
  const total = levels.length;

  return {
    read,
    write: count("WRITE"),
    external: count("EXTERNAL"),
    destructive: count("DESTRUCTIVE"),
    total,
    // Nought actions is not "nought percent read-only" — that reads as an
    // accusation. With nothing to describe, the share is a hundred by default
    // and the screen shows the empty state instead.
    readShare: total === 0 ? 100 : Math.round((read / total) * 100),
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export type OversightSummary = {
  /** Approvals a person actually answered in the window. */
  decided: number;
  approved: number;
  refused: number;
  /** Still waiting, whenever they were raised. */
  waiting: number;
  /** Typical minutes from asking to an answer. Null when nobody has answered one yet. */
  medianMinutes: number | null;
};

/**
 * Whether oversight is real or ornamental.
 *
 * The count alone cannot tell those apart — a queue nobody opens and a queue
 * answered in four minutes both report the same number of pending items at
 * nought. How long a decision takes is the part that says a person is there.
 */
export function summariseOversight(
  approvals: Array<{ status: string; requestedAt: number; reviewedAt?: number }>,
): OversightSummary {
  const answered = approvals.filter(
    (approval) => approval.status === "APPROVED" || approval.status === "REJECTED",
  );

  const waits = answered
    .filter((approval) => typeof approval.reviewedAt === "number")
    .map((approval) => ((approval.reviewedAt as number) - approval.requestedAt) / 60000);

  const middle = median(waits);

  return {
    decided: answered.length,
    approved: answered.filter((approval) => approval.status === "APPROVED").length,
    refused: answered.filter((approval) => approval.status === "REJECTED").length,
    waiting: approvals.filter((approval) => approval.status === "PENDING").length,
    medianMinutes: middle === null ? null : Math.round(middle),
  };
}

export type BusiestSystem = {
  id: string;
  name: string;
  risk: string;
  runs: number;
};

/**
 * Which systems are actually running.
 *
 * The register lists what exists; this says what is busy, and the two are
 * routinely different. An assistant nobody has run in a year and one running
 * four hundred times a month are one row each on the register, and only one of
 * them being unrated is urgent.
 *
 * Carries the rating alongside the count so that urgency is visible in the same
 * glance rather than two screens apart.
 */
export function rankBusiestSystems(
  systems: Array<{ id: string; name: string; risk: string }>,
  runsById: Map<string, number>,
  limit = 5,
): BusiestSystem[] {
  return systems
    .map((system) => ({ ...system, runs: runsById.get(system.id) ?? 0 }))
    .filter((system) => system.runs > 0)
    .sort((a, b) => (b.runs !== a.runs ? b.runs - a.runs : a.name.localeCompare(b.name)))
    .slice(0, limit);
}

export type RiskMix = { high: number; medium: number; low: number; unrated: number };

/** The estate by rating. A single grey bar is the shape of an estate nobody has classified. */
export function countRiskMix(risks: string[]): RiskMix {
  const count = (risk: string) => risks.filter((entry) => entry === risk).length;

  return {
    high: count("HIGH"),
    medium: count("MEDIUM"),
    low: count("LOW"),
    unrated: count("UNRATED"),
  };
}

/** Runs a day, to one decimal. The headline figure only means something at a rate. */
export function runsPerDay(total: number, days: number): number {
  if (days <= 0) return 0;
  return Math.round((total / days) * 10) / 10;
}
