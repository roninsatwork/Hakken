import type { Expression, FilterBuilder, NamedTableInfo } from "convex/server";
import { getNextWorkflowScheduleRunAt, shouldRunWorkflowSchedule } from "./workflowScheduleService";
import { appError } from "./utils/appError";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * A company's collection schedule: the `schedules` row behind its Collection
 * schedule screen, whose switch says whether the company collects at all.
 * Shared rather than looked up afresh by each caller — it was, four times over.
 */
export async function companyCollectionSchedule(
  ctx: { db: QueryCtx["db"] },
  companyId: Id<"companies">,
): Promise<Doc<"schedules"> | null> {
  return await ctx.db.query("schedules").withIndex("by_company_agent", (q) => q.eq("companyId", companyId)).first();
}

/**
 * Whether a `schedules` row starts runs — an agent's or a workflow's — rather
 * than holding one company's Collection schedule.
 *
 * A row with a company is that company's setting: whether it collects, and
 * how often. It wakes nothing. The DataForSEO Planner reads it on each of its
 * own runs and queues what has come due, and the Planner and the Collector
 * each run on their own agent schedule — two agents, two agent schedules
 * (Anthony, 2026-09-25). So the dispatcher, the Schedules list and the health
 * checks leave these rows out.
 *
 * Until then each row also named the Collector, a leftover of the first,
 * one-agent design, and the dispatcher woke the Collector for it — which sent
 * a queue nothing had filled, because nothing woke the Planner.
 */
export function startsRuns(q: FilterBuilder<NamedTableInfo<DataModel, "schedules">>): Expression<boolean> {
  return q.eq(q.field("companyId"), undefined);
}

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

/** Schedules read for one DataForSEO agent; there is one each in practice. */
const AGENT_SCHEDULES_READ = 20;

type AgentRun = Pick<Doc<"schedules">, "intervalStr" | "nextRunAt">;

/**
 * The two DataForSEO agents' own schedules, as the dispatcher will run them —
 * what decides when any company's work is actually planned and sent. An agent
 * missing or switched off has none: the dispatcher skips it.
 */
export type CollectionTimetable = {
  /** Live queues only what each company's schedule says is due; Test queues everything, every run. */
  plannerLive: boolean;
  planner: AgentRun[];
  collector: AgentRun[];
};

export async function collectionTimetable(ctx: { db: QueryCtx["db"] }): Promise<CollectionTimetable> {
  const runsOf = async (role: "DATAFORSEO_PLANNER" | "DATAFORSEO_COLLECTOR") => {
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", role)).first();
    if (!agent || agent.isActive === false) return { agent, runs: [] as AgentRun[] };
    const rows = await ctx.db
      .query("schedules")
      .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
      .take(AGENT_SCHEDULES_READ);
    return { agent, runs: rows.filter((row) => row.isActive && row.companyId === undefined) };
  };
  const planner = await runsOf("DATAFORSEO_PLANNER");
  const collector = await runsOf("DATAFORSEO_COLLECTOR");
  return { plannerLive: planner.agent?.plannerMode === "LIVE", planner: planner.runs, collector: collector.runs };
}

/** When a company's work is next sent, or why nothing will send it. */
export type NextCollection = { at: number } | { at: null; why: "OFF" | "NOT_SCHEDULED" };

/**
 * When a company's work is next sent to DataForSEO.
 *
 * Three times in a row, because since 2026-09-25 a company's own schedule
 * wakes nothing: the company falls due by its schedule; the Planner's first
 * run at or after that queues its work; the Collector's first run after that
 * sends it. A Collector run in the same minute as the Planner's finds nothing
 * written yet, which is why it is the one after that counts. In Test mode the
 * Planner queues everything on every run, so the company counts as due now.
 *
 * Judged from the company's own schedule: a website set to its own faster
 * schedule can be collected sooner. Nothing is due while collection is off,
 * and nothing is sent while either agent has no schedule.
 */
export function nextCollection(
  timetable: CollectionTimetable,
  companySchedule: Pick<Doc<"schedules">, "intervalStr" | "isActive"> | null,
  lastCollectedAt: number | undefined,
  now: Date,
): NextCollection {
  if (!companySchedule?.isActive) return { at: null, why: "OFF" };
  const nowMs = now.getTime();
  const dueAt = !timetable.plannerLive
    || shouldRunWorkflowSchedule({ intervalStr: companySchedule.intervalStr, lastRunTs: lastCollectedAt, now })
    ? nowMs
    : getNextWorkflowScheduleRunAt({ intervalStr: companySchedule.intervalStr, now });
  if (dueAt === undefined) return { at: null, why: "NOT_SCHEDULED" };

  const plannedAt = soonest(timetable.planner.map((run) => runFrom(run, dueAt, nowMs)));
  if (plannedAt === null) return { at: null, why: "NOT_SCHEDULED" };
  const sentAt = soonest(timetable.collector.map((run) =>
    getNextWorkflowScheduleRunAt({ intervalStr: run.intervalStr, now: new Date(plannedAt) }) ?? null));
  return sentAt === null ? { at: null, why: "NOT_SCHEDULED" } : { at: sentAt };
}

/**
 * An agent schedule's first run at or after a time: from now, the run the
 * dispatcher has written down; from later, its timetable's own.
 */
function runFrom(run: AgentRun, fromMs: number, nowMs: number): number | null {
  if (fromMs <= nowMs && run.nextRunAt !== undefined) return Math.max(run.nextRunAt, nowMs);
  return getNextWorkflowScheduleRunAt({ intervalStr: run.intervalStr, now: new Date(Math.max(fromMs, nowMs) - 1) }) ?? null;
}

function soonest(times: ReadonlyArray<number | null>): number | null {
  let best: number | null = null;
  for (const at of times) if (at !== null && (best === null || at < best)) best = at;
  return best;
}

/**
 * A company's collection as the admin screens show it: its schedule, its
 * newest collection, and when its work is next sent (`nextCollection`).
 */
export async function companyCollectionState(
  ctx: { db: QueryCtx["db"] },
  companyId: Id<"companies">,
  timetable: CollectionTimetable,
  now: Date,
): Promise<{ schedule: Doc<"schedules"> | null; latest: Doc<"seoCollectionCycles"> | null; next: NextCollection }> {
  const schedule = await companyCollectionSchedule(ctx, companyId);
  const latest = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
    .order("desc")
    .first();
  // A collection that failed outright collected nothing, so the company is due
  // again — the Planner's own rule for a website (`seoCollectionDue.ts`).
  const lastCollectedAt = latest && latest.status !== "FAILED" ? latest.startedAt : undefined;
  return { schedule, latest, next: nextCollection(timetable, schedule, lastCollectedAt, now) };
}
