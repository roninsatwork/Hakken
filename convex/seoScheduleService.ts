import { getNextWorkflowScheduleRunAt, shouldRunWorkflowSchedule } from "./workflowScheduleService";
import { appError } from "./utils/appError";
import type { Doc } from "./_generated/dataModel";

/**
 * The cadences an SEO pull may run at.
 *
 * Narrower than the platform's own set on purpose. An hourly pull, or a list of
 * exact times, is money on a service billed per call and returns numbers that
 * have not moved — which is why `SeoScheduleFields` offers these four and the
 * generic workflow builder is not used for this job.
 */
const SEO_CADENCES = new Set(["daily", "weekly", "fortnightly", "monthly"]);

/**
 * Refuse an interval an SEO schedule may not run at.
 *
 * **Here rather than only in the control**, because the screen was the only
 * thing enforcing it and the screen was wrong: the website override was built
 * on the generic builder until 2026-09-22 and wrote hourly and targeted-time
 * intervals straight through, which this mutation accepted without looking. A
 * limit that lives in a form is a limit the next caller does not have.
 *
 * Silent about anything it cannot parse. A legacy or hand-written interval is
 * the schedule system's business, not this one's, and refusing rows it does not
 * understand would break websites that already work.
 */
export function assertSeoInterval(intervalStr: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(intervalStr);
  } catch {
    return;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return;

  const config = parsed as { version?: unknown; kind?: unknown; cadence?: unknown };
  if (config.version !== 2) return;

  if (config.kind === "targetedTimes") {
    throw appError(
      "INVALID_INPUT",
      "SEO data is pulled on a cadence, not at a list of exact times.",
    );
  }
  if (config.kind === "recurring" && typeof config.cadence === "string"
    && !SEO_CADENCES.has(config.cadence)) {
    throw appError(
      "INVALID_INPUT",
      "SEO data can be pulled daily, weekly, fortnightly or monthly.",
    );
  }
}

/**
 * When a website's numbers get pulled, resolved against the schedule it follows.
 *
 * **Nothing here invents a schedule format.** The company's cadence is a
 * `schedules` row, a website's override is an `intervalStr` in the same format,
 * and both are read with `workflowScheduleService` — the helpers the workflow
 * dispatcher has always used. This file only answers which of the two applies
 * and what that means for a host several companies are watching.
 *
 * That matters because the first version of this did invent one: a parallel
 * cadence enum, a parallel active flag and a parallel next-run calculation,
 * none of which any dispatcher read. Anthony, 2026-09-21: *"why does this not
 * work like the agent schedules — I did say re-use, don't build new."*
 */

export type ResolvedSource = "WEBSITE" | "COMPANY" | "NONE";

export type ResolvedWebsiteSchedule = {
  /** Whether anything is pulled for this website at all. */
  active: boolean;
  /** The interval actually in force, or null when nothing is scheduled. */
  intervalStr: string | null;
  /** Where that came from, so a screen can say rather than imply. */
  source: ResolvedSource;
  /** When the next pull falls, or null when nothing is scheduled. */
  nextRunAt: number | null;
};

type CompanySchedule = Pick<Doc<"schedules">, "intervalStr" | "isActive" | "lastRunTs"> | null | undefined;
type WebsiteOverride = {
  refreshIntervalStr?: string;
  collectionEnabled?: boolean;
} | null | undefined;

/**
 * What one website actually runs at.
 *
 * A website with no override follows its company's schedule row. A website with
 * one stops following — for the interval, the switch, or both independently,
 * because wanting one site watched more closely is not the same as wanting it
 * switched off.
 *
 * No company schedule at all means nothing is pulled. That is deliberately not
 * the same as "pulled slowly": a company nobody has scheduled should cost
 * nothing, so shipping the fetcher does not start spending on every client at
 * once.
 */
export function resolveWebsiteSchedule(
  companySchedule: CompanySchedule,
  website: WebsiteOverride,
  now: Date = new Date(),
): ResolvedWebsiteSchedule {
  const intervalStr = website?.refreshIntervalStr ?? companySchedule?.intervalStr ?? null;
  const source: ResolvedSource = website?.refreshIntervalStr
    ? "WEBSITE"
    : companySchedule?.intervalStr
      ? "COMPANY"
      : "NONE";

  const active = (website?.collectionEnabled ?? companySchedule?.isActive ?? false) && intervalStr !== null;

  return {
    active,
    intervalStr,
    source,
    nextRunAt: active && intervalStr
      ? getNextWorkflowScheduleRunAt({ intervalStr, lastRunTs: companySchedule?.lastRunTs, now })
        ?? null
      : null,
  };
}

/** Whether this website is due a pull right now. The dispatcher's own check. */
export function isWebsiteDue(
  companySchedule: CompanySchedule,
  website: WebsiteOverride,
  lastPulledAt: number | undefined,
  now: Date = new Date(),
): boolean {
  const resolved = resolveWebsiteSchedule(companySchedule, website, now);
  if (!resolved.active || !resolved.intervalStr) return false;

  return shouldRunWorkflowSchedule({
    intervalStr: resolved.intervalStr,
    lastRunTs: lastPulledAt,
    now,
  });
}

/**
 * When a host shared by several companies is next pulled, and for whom.
 *
 * One website, one record, one pull — so the host's real rate is whichever
 * watcher wants it soonest. That is the "fastest watcher sets the pace" rule,
 * and expressing it as the *soonest next run* rather than a ranking of cadence
 * words is what lets it use the existing schedule format, which can say
 * "Mondays at 02:00" and has no single speed to rank.
 *
 * Watchers that are switched off are left out entirely rather than treated as
 * slow: off means nothing is pulled for them, and counting them would schedule
 * work nobody asked for.
 */
export function soonestPull<T>(
  watchers: ReadonlyArray<{ resolved: ResolvedWebsiteSchedule; watcher: T }>,
): { nextRunAt: number; driver: T } | null {
  let best: { nextRunAt: number; driver: T } | null = null;

  for (const { resolved, watcher } of watchers) {
    if (!resolved.active || resolved.nextRunAt === null) continue;
    if (best === null || resolved.nextRunAt < best.nextRunAt) {
      best = { nextRunAt: resolved.nextRunAt, driver: watcher };
    }
  }

  return best;
}
