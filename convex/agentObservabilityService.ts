/**
 * The numbers behind the agent observability screens.
 *
 * The agent analytics query reported lifetime totals and a mean latency. Neither
 * answers the question somebody actually opens the screen with — "is this worse
 * than last week?" — and the mean in particular hides the complaint: the run in
 * twenty that takes thirty seconds is the one people notice, and a mean over a
 * thousand fast runs buries it completely.
 *
 * Kept out of `agentRuns.ts` so the arithmetic can be tested against a
 * hand-computed sample rather than trusted because a query returned something.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The shape these functions need from a run, structurally — not the whole record. */
export type ObservabilityRun = {
  status: string;
  startedAt: number;
  completedAt?: number;
  costGBP?: number;
  error?: string;
  finalOutput?: string;
  agentVersionId?: string;
};

export type LatencySummary = {
  /** What a run usually takes. */
  medianMs: number;
  /** What the slowest one in twenty takes. */
  p95Ms: number;
  averageMs: number;
  sampleSize: number;
};

/**
 * Nearest-rank percentile. Chosen over interpolation because these are shown as
 * "1 in 20 takes over 31s" — a real observed run, not a number between two of
 * them that nobody ever waited for.
 */
export function percentile(values: ReadonlyArray<number>, p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

export function summariseLatency(values: ReadonlyArray<number>): LatencySummary {
  if (values.length === 0) {
    return { medianMs: 0, p95Ms: 0, averageMs: 0, sampleSize: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    medianMs: percentile(values, 50),
    p95Ms: percentile(values, 95),
    averageMs: total / values.length,
    sampleSize: values.length,
  };
}

export type DayBucket = {
  /** Midnight UTC for the day, so the screen can format it in the reader's locale. */
  dayStartMs: number;
  total: number;
  succeeded: number;
  failed: number;
  costGBP: number;
};

function startOfUtcDay(timestamp: number): number {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

/**
 * One bucket per day, including days where nothing ran.
 *
 * The empty days matter: a chart that silently omits them draws a quiet weekend
 * as though it were continuous weekday traffic, and the shape is the whole point
 * of the chart.
 */
export function buildDailySeries(
  runs: ReadonlyArray<ObservabilityRun>,
  options: { days: number; now: number }
): DayBucket[] {
  const todayStart = startOfUtcDay(options.now);
  const buckets = new Map<number, DayBucket>();

  for (let offset = options.days - 1; offset >= 0; offset -= 1) {
    const dayStartMs = todayStart - offset * DAY_MS;
    buckets.set(dayStartMs, { dayStartMs, total: 0, succeeded: 0, failed: 0, costGBP: 0 });
  }

  for (const run of runs) {
    const bucket = buckets.get(startOfUtcDay(run.startedAt));
    if (!bucket) continue;
    bucket.total += 1;
    bucket.costGBP += run.costGBP ?? 0;
    if (run.status === "SUCCESS") bucket.succeeded += 1;
    if (run.status === "FAILED" || run.status === "CANCELLED") bucket.failed += 1;
  }

  return [...buckets.values()].sort((left, right) => left.dayStartMs - right.dayStartMs);
}

/**
 * The days on which this agent started running a different configuration.
 *
 * Taken from the runs themselves rather than from when a version row was
 * written, because what the chart is being asked is "did the shape change when
 * the agent did" — and that is the day the new configuration first carried
 * traffic, which is not always the day somebody saved it.
 */
export function findVersionChangeDays(runs: ReadonlyArray<ObservabilityRun>): number[] {
  const ordered = [...runs].sort((left, right) => left.startedAt - right.startedAt);
  const days = new Set<number>();
  let previousVersion: string | undefined;
  let seenFirst = false;

  for (const run of ordered) {
    const version = run.agentVersionId ?? "unversioned";
    // The first run in the window is not a change: there is nothing before it
    // to have changed from, and marking it would put a marker on day one of
    // every chart.
    if (seenFirst && version !== previousVersion) {
      days.add(startOfUtcDay(run.startedAt));
    }
    previousVersion = version;
    seenFirst = true;
  }

  return [...days].sort((left, right) => left - right);
}

export type PeriodTotals = {
  runs: number;
  succeeded: number;
  failed: number;
  costGBP: number;
  successRate: number;
  costPerRunGBP: number;
};

export function summarisePeriod(runs: ReadonlyArray<ObservabilityRun>): PeriodTotals {
  let succeeded = 0;
  let failed = 0;
  let costGBP = 0;

  for (const run of runs) {
    if (run.status === "SUCCESS") succeeded += 1;
    if (run.status === "FAILED" || run.status === "CANCELLED") failed += 1;
    costGBP += run.costGBP ?? 0;
  }

  const settled = succeeded + failed;
  return {
    runs: runs.length,
    succeeded,
    failed,
    costGBP,
    successRate: settled > 0 ? succeeded / settled : 0,
    costPerRunGBP: runs.length > 0 ? costGBP / runs.length : 0,
  };
}

/**
 * Split a sample into the window being reported and the one before it, so every
 * headline number can carry a change rather than standing alone.
 */
export function splitByPeriod(
  runs: ReadonlyArray<ObservabilityRun>,
  options: { days: number; now: number }
): { current: ObservabilityRun[]; previous: ObservabilityRun[] } {
  const windowMs = options.days * DAY_MS;
  const currentFrom = options.now - windowMs;
  const previousFrom = currentFrom - windowMs;

  const current: ObservabilityRun[] = [];
  const previous: ObservabilityRun[] = [];

  for (const run of runs) {
    if (run.startedAt >= currentFrom) current.push(run);
    else if (run.startedAt >= previousFrom) previous.push(run);
  }

  return { current, previous };
}

export type FailureGroupInput = {
  failureKey: string;
  message: string;
  at: number;
  runId?: string;
};

export type FailureGroup = {
  failureKey: string;
  label: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  runIds: string[];
};

/** How many example runs a group carries, so one noisy failure cannot bloat the payload. */
const MAX_EXAMPLE_RUNS = 20;

/**
 * Failures grouped by cause rather than by wording, worst first.
 *
 * The label shown is the shortest message in the group: the one least likely to
 * be carrying an id or a stack fragment that applies to only one occurrence.
 */
export function groupFailures(entries: ReadonlyArray<FailureGroupInput>): FailureGroup[] {
  const groups = new Map<string, FailureGroup & { messages: string[] }>();

  for (const entry of entries) {
    const existing = groups.get(entry.failureKey);
    if (!existing) {
      groups.set(entry.failureKey, {
        failureKey: entry.failureKey,
        label: entry.message,
        count: 1,
        firstSeenAt: entry.at,
        lastSeenAt: entry.at,
        runIds: entry.runId ? [entry.runId] : [],
        messages: [entry.message],
      });
      continue;
    }

    existing.count += 1;
    existing.firstSeenAt = Math.min(existing.firstSeenAt, entry.at);
    existing.lastSeenAt = Math.max(existing.lastSeenAt, entry.at);
    existing.messages.push(entry.message);
    if (entry.runId && existing.runIds.length < MAX_EXAMPLE_RUNS) {
      existing.runIds.push(entry.runId);
    }
  }

  return [...groups.values()]
    .map(({ messages, ...group }) => ({
      ...group,
      label: pickShortest(messages) ?? group.label,
    }))
    .sort((left, right) => right.count - left.count || right.lastSeenAt - left.lastSeenAt);
}

function pickShortest(messages: ReadonlyArray<string>): string | undefined {
  let shortest: string | undefined;
  for (const message of messages) {
    const trimmed = message.trim();
    if (!trimmed) continue;
    if (shortest === undefined || trimmed.length < shortest.length) shortest = trimmed;
  }
  return shortest;
}
