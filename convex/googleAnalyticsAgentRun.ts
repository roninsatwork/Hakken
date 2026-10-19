import { collectPageDays } from "./googleAnalyticsPageSeries";
import { collectPageLists, pageListJobs, type PageListsJob } from "./googleAnalyticsPageLists";
import { collectActionFunnels, type FunnelsJob } from "./googleAnalyticsActionFunnels";
import { v, type ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import { STEP_MEMORY_MB, memoryMb, memoryNow } from "./utils/stepMemory";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { failureSummary, lastMoved, ROLE_RUN_LIVE_MS } from "./roleRuns";
import { shiftDay } from "./searchConsoleDays";
import { addressConversions, siteAddresses } from "./googleAnalyticsApi";
import { SALE_EVENT } from "./utils/analyticsAddresses";
import { prepareAnalyticsCountry } from "./googleAnalyticsCountries";
import { collectTitles } from "./googleAnalyticsTitles";
import { count, days, finishRun } from "./searchConsoleAgentRun";
import { bookStep, stepKey } from "./collectionSteps";
import {
  DAYS_PER_STEP,
  STEP_BUDGET_MS,
  analyticsWindow,
  collectDays,
  collectPeriod,
  dueJobs,
  newestWholeDayIn,
  openSession,
  type PeriodJob,
  type StepResult,
} from "./googleAnalyticsCollect";
import { COUNTED_WITH, LISTED_WITH } from "./googleAnalyticsSchema";
import { NIGHT_MS, afterTheHour } from "./googleAnalyticsBudget";
import { countriesKeptReady } from "./searchConsoleCountries";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * The Google Analytics: Collector Agent's job (docs/plans/active/google-analytics-plan.md
 * §4.1, GA21): what an agent holding the role "Google Analytics Collector"
 * does when its schedule — "Google Analytics: Data Collection Scheduler",
 * daily at 04:00 local, Search Console's time — or Run starts it. Built as
 * the Search Console: Collector Agent is (`searchConsoleAgentRun.ts`).
 *
 * **A run of its own for each website** connected to Google Analytics, a few
 * seconds apart, each in steps of a few minutes — so no run, and no number of
 * websites, meets an action's ten minutes. Each website's run fetches its
 * days (`googleAnalyticsCollect.ts`), then asks Google for its ready-made
 * lists: the 7 and 30 days every run, the 90 days and 12 months once a week.
 * Free — Google charges nothing and no model is called — so every connected
 * website every day, whatever its company's collection schedule.
 *
 * **A newly connected website starts at once** (§10, Q15): saving what counts
 * starts a run for that website alone (`startFirstCollection`), so a client
 * never meets an empty page for a night.
 *
 * One schedule's runs at a time: a run started while any of the agent's runs
 * is still going stops at once, saying so.
 */

export const GOOGLE_ANALYTICS_ROLE = "GOOGLE_ANALYTICS_COLLECTOR";

/**
 * Websites' runs start spread out, never all at once (ga-stored-figures-plan.md
 * SF19): two minutes apart, closer when there are many, all within the first
 * 12 minutes — a run waiting longer to start would read as stalled
 * (`ROLE_RUN_LIVE_MS`) — and never closer than five seconds.
 */
const STAGGER_MS = 5_000;
const MOST_GAP_MS = 2 * 60 * 1000;
const SPREAD_MS = 12 * 60 * 1000;

/** The gap between websites' runs starting, for this many websites. */
export function startGap(websites: number): number {
  return Math.max(STAGGER_MS, Math.min(MOST_GAP_MS, Math.floor(SPREAD_MS / Math.max(1, websites))));
}

/** How often a step saves its place as it goes (`collectionSteps.notePlace`, RR1). */
const SAVE_EVERY_MS = 10_000;

/** Connections read per page when listing every connected website. */
const CONNECTIONS_PER_READ = 500;

/**
 * A website's run through the night (docs/plans/active/ga-stored-figures-plan.md
 * SF17–SF20): once its budget for the hour is spent — or Google refuses for
 * an allowance that refreshes "within an hour but not necessarily on the
 * whole hour boundaries" (Google's quota page) — it asks nothing more for an
 * hour and two minutes, looking in every ten minutes so it reads as going
 * (`ROLE_RUN_LIVE_MS`), then carries on where it left off. No run waits on a
 * person (AGENTS.md); past the night it stops, and the next night asks again.
 */
const LOOK_IN_MS = 10 * 60 * 1000;
// The night and the hour's wait are the budget's, shared with the two-year fills (ga-big-site-reliability-plan.md BR7).
export { NIGHT_MS, afterTheHour } from "./googleAnalyticsBudget";

const NOT_HISTORY = "The newest day and the last two again; a website with nothing held gets the 60 days kept, and its 90 days and 12 months are asked of Google ready-made.";

type Site = { connectionId: Id<"googleAnalyticsConnections">; companyId: Id<"companies">; host: string; property: string };

/** Whether a connection's own run is still going: the daily run leaves it alone, so nothing is collected twice. */
function collectingNow(run: Doc<"agentRuns"> | null, now: number): boolean {
  return run !== null && (run.status === "QUEUED" || run.status === "RUNNING") && now - lastMoved(run) < ROLE_RUN_LIVE_MS;
}

/** Whether a website's run is still queued or running: a cancelled one stops at its next step. */
export const runGoing = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    return run !== null && (run.status === "QUEUED" || run.status === "RUNNING");
  },
});

/**
 * What the Collector's run collects: every website connected to Google
 * Analytics with what counts saved, the one longest since it was collected
 * first, so one a run did not reach goes first in the next.
 */
export const agentCollections = internalQuery({
  args: {},
  returns: v.array(v.object({
    connectionId: v.id("googleAnalyticsConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    property: v.string(),
  })),
  handler: async (ctx) => {
    const connected: Doc<"googleAnalyticsConnections">[] = [];
    for (let after = 0; ;) {
      const page = await ctx.db
        .query("googleAnalyticsConnections")
        .withIndex("by_status", (q) => q.eq("status", "CONNECTED").gt("_creationTime", after))
        .take(CONNECTIONS_PER_READ);
      connected.push(...page);
      if (page.length < CONNECTIONS_PER_READ) break;
      after = page[page.length - 1]._creationTime;
    }
    const now = Date.now();
    const out: Site[] = [];
    for (const connection of connected.sort((left, right) => (left.lastCollectedAt ?? 0) - (right.lastCollectedAt ?? 0))) {
      // Switched off on the website's Schedules page: kept, not collected (website-schedules-plan.md, WS4).
      if (!connection.property || connection.clearing || connection.switchedOff) continue;
      if (connection.collecting && collectingNow(await ctx.db.get(connection.collecting.runId), now)) continue;
      const website = await ctx.db.get(connection.websiteId);
      out.push({
        connectionId: connection._id,
        companyId: connection.companyId,
        host: website?.displayHost ?? website?.host ?? connection.property,
        property: connection.property,
      });
    }
    return out;
  },
});

/** The run the schedule or Run starts: one run of its own for each connected website. */
export const runGoogleAnalyticsCollectorNow = internalAction({
  args: { runId: v.id("agentRuns"), workflowExecutionId: v.optional(v.id("workflowExecutions")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
    try {
      const turn = await ctx.runMutation(internal.roleRuns.takeRoleTurn, { runId: args.runId });
      if (!turn.ok) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", turn.message);
        return null;
      }
      const sites = await ctx.runQuery(internal.googleAnalyticsAgentRun.agentCollections, {});
      if (sites.length === 0) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", "No website is connected to Google Analytics, so there was nothing to collect.");
        return null;
      }
      const hosts = sites.map((site) => site.host).join(", ");
      await ctx.runMutation(internal.roleRuns.recordObservation, {
        runId: args.runId,
        text: `${sites.length === 1 ? "1 website is" : `${sites.length} websites are`} connected to Google Analytics: ${hosts}. Each gets a run of its own.`,
      });
      const gap = startGap(sites.length);
      for (const [index, site] of sites.entries()) {
        const started = await ctx.runMutation(internal.googleAnalyticsAgentRun.startSiteRun, { parentRunId: args.runId, ...site, delayMs: index * gap });
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: site.companyId,
          heading: site.host,
          detail: started === "CLEARING"
            ? "Not started yet: its figures are being cleared for its main home country, and it is collected again once they are gone."
            : started === "LISTING"
              ? "Not started yet: its events are read again first, with those that read as enquiries, and then it is collected again, whole."
              : started ? `Its own run started: ${days(started.from, started.top)}.` : "Not started: it was disconnected meanwhile.",
          failed: false,
        });
      }
      await finishRun(
        ctx,
        args.runId,
        args.workflowExecutionId,
        "SUCCESS",
        `Started a run of its own for ${sites.length === 1 ? "the 1 website" : `each of the ${sites.length} websites`} connected to Google Analytics: ${hosts}. ${NOT_HISTORY}`,
      );
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", failureSummary(error));
    }
    return null;
  },
});

/** One website's run, under the agent, and its first step; null when the website is no longer connected. */
async function beginSiteRun(
  ctx: MutationCtx,
  agentId: Id<"agents">,
  site: Site,
  delayMs: number,
  /** Started by the night's run (BR7): its two-year fills start after it. */
  night = false,
): Promise<{ runId: Id<"agentRuns">; from: string; top: string } | "CLEARING" | "LISTING" | null> {
  const connection = await ctx.db.get(site.connectionId);
  if (!connection || connection.status !== "CONNECTED" || connection.property !== site.property || connection.switchedOff) return null;
  // Its figures must be its main home country's: when not, they are cleared and this run waits for the clearing's (§18.6.1).
  if (connection.clearing || (await prepareAnalyticsCountry(ctx, connection)) === "SWITCHING") return "CLEARING";
  // Figures counted another way are collected again, whole, by Google's own counts (conversions-back-in-time-plan.md BT4).
  // Events listed before Hakken listed as it does now — with those that read as enquiries, and the other addresses a
  // conversion counts on (conversion-addresses-plan.md) — are listed afresh first, which then starts this run again:
  // whole only when the addresses whose conversions count moved.
  const recount = connection.countedWith !== COUNTED_WITH;
  if (connection.listedWith !== LISTED_WITH) {
    await ctx.scheduler.runAfter(0, internal.googleAnalyticsConnect.readWhatCounts, { connectionId: connection._id, thenCollect: true });
    return "LISTING";
  }
  const now = Date.now();
  const top = newestWholeDayIn(now, connection.timeZone ?? "Europe/London");
  const window = recount ? analyticsWindow(undefined, undefined, top) : analyticsWindow(connection.newestDay, connection.oldestDay, top);
  // Each other home country's days, from where it stands (ga-stored-figures-plan.md SF7): a new one's 90 days, then its new days.
  const hold = await ctx.db.get(connection.companyWebsiteId);
  const others = hold && !isTrackedHold(hold) ? await countriesKeptReady(ctx, hold) : [];
  const countryFrom = others.map((country) => {
    const held = connection.countryHistory?.find((one) => one.country === country);
    return { country, from: (recount ? analyticsWindow(undefined, undefined, top) : analyticsWindow(held?.newestDay, held?.oldestDay, top)).from };
  });
  const runId = await ctx.db.insert("agentRuns", {
    agentId,
    triggerType: "EVENT",
    objective: recount
      ? `Collect ${site.host}'s Google Analytics (${site.property}) again, whole, its conversions counted by Google's own counts: its days ${days(window.from, window.top)}, then every ready-made list. ${NOT_HISTORY}`
      : `Collect ${site.host}'s Google Analytics (${site.property}): its days ${days(window.from, window.top)}, then its ready-made lists. ${NOT_HISTORY}`,
    title: `Google Analytics: ${site.host}`,
    status: "QUEUED",
    companyId: site.companyId,
    startedAt: now,
    updatedAt: now,
  });
  const workflowExecutionId = await ctx.db.insert("workflowExecutions", {
    agentId,
    agentRunId: runId,
    triggerType: "EVENT",
    status: "RUNNING",
    startedAt: now,
  });
  // The days this run fetches, so its page and Collection pipeline can say how far it has got.
  await ctx.db.patch(connection._id, { collecting: { runId, from: window.from, top: window.top } });
  // Its first step, watched (collection-reliability-plan.md, RR1).
  const first: CollectSiteStepArgs = {
    runId,
    workflowExecutionId,
    ...site,
    from: window.from,
    top: window.top,
    to: window.top,
    weekly: false,
    jobAt: 0,
    rows: 0,
    requests: 0,
    recount,
    countryFrom,
    begunAt: now,
    ...(connection.listsFrom ? { listsFrom: connection.listsFrom } : {}),
    ...(night ? { night: true } : {}),
  };
  await bookStep(ctx, { key: runStepKey(site.connectionId), chain: "GA_RUN", runId, args: first, place: placeOf(first, []), delayMs });
  return { runId, from: window.from, top: window.top };
}

export const startSiteRun = internalMutation({
  args: {
    parentRunId: v.id("agentRuns"),
    connectionId: v.id("googleAnalyticsConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    property: v.string(),
    delayMs: v.number(),
  },
  returns: v.union(v.null(), v.literal("CLEARING"), v.literal("LISTING"), v.object({ runId: v.id("agentRuns"), from: v.string(), top: v.string() })),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentRunId);
    if (!parent) return null;
    const { parentRunId: _parent, delayMs, ...site } = args;
    return await beginSiteRun(ctx, parent.agentId, site, delayMs, true);
  },
});

/**
 * A newly connected website's first collection, started at once (§10, Q15)
 * as a run of the Google Analytics: Collector Agent for that website alone.
 * Without the agent — not created yet, or switched off — nothing starts, and
 * the website waits for the agent's first run.
 */
export async function startFirstCollection(
  ctx: MutationCtx,
  connection: Doc<"googleAnalyticsConnections">,
): Promise<"STARTED" | "NO_AGENT" | "AGENT_OFF"> {
  const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", GOOGLE_ANALYTICS_ROLE)).first();
  if (!agent) return "NO_AGENT";
  if (agent.isActive === false) return "AGENT_OFF";
  const website = await ctx.db.get(connection.websiteId);
  const started = await beginSiteRun(ctx, agent._id, {
    connectionId: connection._id,
    companyId: connection.companyId,
    host: website?.displayHost ?? website?.host ?? connection.property ?? "",
    property: connection.property ?? "",
  }, 0);
  // Clearing for its main home country starts it again once done (`clearFigures`).
  return started ? "STARTED" : "NO_AGENT";
}

/** Why a website's run stopped, in plain words. */
function stoppedBecause(reason: string, host: string): string {
  switch (reason) {
    case "REVOKED":
      return `Google stopped letting the connected account read ${host}'s Google Analytics. Connect it again from its Google Analytics page.`;
    case "UNREADABLE":
      return `The stored Google sign-in for ${host} can't be read any more. Connect it again from its Google Analytics page.`;
    case "NOT_CONFIGURED":
      return "Google Analytics isn't set up on this platform any more, so nothing can be collected.";
    default:
      return `Google answered ${host}'s asks with an error, so its run stopped: ${reason}. Nothing is lost: the next run asks again.`;
  }
}

/** A website's run's step: where it stands, carried from one step to the next. */
export const collectSiteStepArgs = {
  runId: v.id("agentRuns"),
  workflowExecutionId: v.id("workflowExecutions"),
  connectionId: v.id("googleAnalyticsConnections"),
  companyId: v.id("companies"),
  host: v.string(),
  property: v.string(),
  from: v.string(),
  top: v.string(),
  /** The newest day still to fetch; null once the days are in and the ready-made lists are being asked. */
  to: v.union(v.string(), v.null()),
  /** Whether this run asks the weekly lists too, decided as the days finish. */
  weekly: v.boolean(),
  /** The next ready-made list to ask, as its place in the run's lists. */
  jobAt: v.number(),
  rows: v.number(),
  requests: v.number(),
  /** Collected again, whole, by Google's own counts (BT4): every list, and the connection marked so when done. */
  recount: v.optional(v.boolean()),
  /** Each other home country's first day to fetch (SF7), worked out as the run starts so every step agrees. */
  countryFrom: v.optional(v.array(v.object({ country: v.string(), from: v.string() }))),
  /** When the run began, for the night it may take (`NIGHT_MS`). */
  begunAt: v.optional(v.number()),
  /** Waiting for the hour to turn (SF17, SF20): nothing is asked of Google before this time. */
  resumeAt: v.optional(v.number()),
  /** The ready-made list to start from, where the last run cut short by the night stopped (`jobKey`). */
  listsFrom: v.optional(v.string()),
  /**
   * Started by the night's run, not by connecting (ga-big-site-reliability-plan.md BR7): only then do the two-year
   * fills start after it.
   */
  night: v.optional(v.boolean()),
  /** The booking this step is (`collectionSteps.ts`, RR1): missing on a step booked before the watch. */
  booking: v.optional(v.number()),
  /** Its watch gave up carrying it on: the run's closing alone (RR1). */
  closeOnly: v.optional(v.boolean()),
  /** The lists left out after the platform stopped them three times, by `jobKey`: the next run starts with the first. */
  skipped: v.optional(v.array(v.string())),
};
export type CollectSiteStepArgs = ObjectType<typeof collectSiteStepArgs>;

/** A website's run's watched chain (`collectionSteps.ts`): one a connection, written over by each run. */
export function runStepKey(connectionId: Id<"googleAnalyticsConnections">): string {
  return stepKey("GA_RUN", connectionId);
}

/** Where a run is, in plain words: the same place started again is another try at it (RR1). */
function placeOf(args: Pick<CollectSiteStepArgs, "to" | "jobAt">, jobs: readonly Job[]): string {
  if (args.to !== null) return `the days to ${args.to}`;
  const job = jobs[args.jobAt];
  return job ? `list ${args.jobAt + 1} of ${jobs.length} (${jobName(job)})` : "the run's end";
}

/** A job, in plain words, for the run's lines. */
function jobName(job: Job): string {
  const of = "country" in job && job.country ? `, ${job.country.toUpperCase()}` : "";
  if ("days" in job) return `${job.country.toUpperCase()} days ${job.from} to ${job.to}`;
  if ("funnels" in job) return "what people did before converting, 12 months";
  if ("pages" in job) return `the page lists, ${job.period} days, ${job.device || "every device"}${of}`;
  return `${job.list}, ${job.period} days, ${job.which === "NOW" ? "now" : job.which === "BEFORE" ? "the span before" : "a year before"}${of}`;
}

/**
 * One step of a website's run: its days a week at a time, newest first, then
 * its ready-made lists one after another, until the step's few minutes are
 * up; what is left goes to the next step, an action of its own — in the Node
 * runtime (`googleAnalyticsSteps.collectSiteStep`, BR4), where a big website's
 * lists fit.
 *
 * Watched (collection-reliability-plan.md, RR1): its place is saved after each
 * week and each list, so a step the platform stops is started again from
 * there by its watch — the second time that one job alone, carefully; the
 * third time it is left out, saying so, and the next run starts with it. Every
 * ending goes through the run's one closing (`googleAnalyticsRunEnd.ts`).
 */
export async function collectSiteStepHandler(ctx: ActionCtx, args: CollectSiteStepArgs): Promise<null> {
  const key = runStepKey(args.connectionId);
  const begun = await ctx.runMutation(internal.collectionSteps.stepStarted, { key, ...(args.booking !== undefined ? { booking: args.booking } : {}) });
  if (!begun.go) return null;
  const skipped = [...(args.skipped ?? [])];
  const close = async (status: "SUCCESS" | "FAILED", summary: string, reached: "WHOLE" | "DAYS" | "NONE", more: { weekly?: boolean; hostVisits?: Array<{ host: string; visits: number }>; hostConversions?: Array<{ host: string; conversions: number }>; listsFrom?: string; fills?: boolean } = {}) =>
    await ctx.runMutation(internal.googleAnalyticsRunEnd.closeSiteRun, {
      connectionId: args.connectionId,
      property: args.property,
      runId: args.runId,
      workflowExecutionId: args.workflowExecutionId,
      stepKey: key,
      ...(args.booking !== undefined ? { booking: args.booking } : {}),
      status,
      summary,
      reached,
      weekly: more.weekly ?? args.weekly,
      recount: args.recount === true,
      ...(more.hostVisits ? { hostVisits: more.hostVisits } : {}),
      ...(more.hostConversions ? { hostConversions: more.hostConversions } : {}),
      // The night's run: the two-year fills follow it, inside the same night (BR7).
      ...(args.night ? { nightFrom: args.begunAt ?? Date.now() } : {}),
      ...(more.listsFrom ?? skipped[0] ? { listsFrom: more.listsFrom ?? skipped[0] } : {}),
      fills: more.fills ?? true,
    });
  // How far the run got before this step: its days in once `to` is null, some of them once it moved from the top.
  const reachedSoFar = (to: string | null): "DAYS" | "NONE" => (to === null || to !== args.top ? "DAYS" : "NONE");
  // A run cancelled from Admin asks Google for nothing more, whatever step was waiting: its chain closes and its
  // collecting mark goes (the run is ended already, so nothing else of the closing runs).
  if (!(await ctx.runQuery(internal.googleAnalyticsAgentRun.runGoing, { runId: args.runId }))) {
    await close("FAILED", `${args.host}'s run was ended before it finished.`, "NONE");
    return null;
  }
  const handOn = async (next: CollectSiteStepArgs, place: string, delayMs = 0) =>
    await ctx.runMutation(internal.collectionSteps.handOn, { ...memoryNow(),
      key, chain: "GA_RUN", runId: args.runId, args: next, place, delayMs, ...(args.booking !== undefined ? { from: args.booking } : {}),
    });
  // Its watch gave up carrying it on: what it has is kept, and the run ends saying so — the next night starting from the
  // list it had reached, so the same lists are never the ones left out.
  if (args.closeOnly) {
    const target = args.to === null ? await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId }) : null;
    const reached = target ? jobsFor(args.weekly, target.others, target.shop, countryDayJobs(args.countryFrom ?? [], args.top), args.listsFrom)[args.jobAt] : undefined;
    await close(
      "FAILED",
      `The platform kept stopping ${args.host}'s run, so it ended with what it had collected; the next run starts again from there.`,
      reachedSoFar(args.to),
      reached && !("days" in reached) ? { listsFrom: jobKey(reached) } : {},
    );
    return null;
  }
  // Waiting for the hour to turn: looks in, so the run reads as going, and asks Google nothing.
  if (args.resumeAt !== undefined && Date.now() < args.resumeAt) {
    await handOn(args, "waiting for the hour", Math.min(LOOK_IN_MS, args.resumeAt - Date.now()));
    return null;
  }
  const started = Date.now();
  if (args.to === args.top && args.resumeAt === undefined) await ctx.runMutation(internal.roleRuns.markRunStarted, { runId: args.runId });
  try {
    const target = await ctx.runQuery(internal.googleAnalyticsCollect.collectTarget, { connectionId: args.connectionId });
    if (!target || target.status !== "CONNECTED" || target.property !== args.property || target.clearing) {
      await close("SUCCESS", `Nothing collected for ${args.host}: it was disconnected, or another property chosen, before its run finished.`, "NONE");
      return null;
    }
    if (!target.owned) {
      await ctx.runMutation(internal.googleAnalyticsConnect.noteProblem, { connectionId: args.connectionId, problem: "NOT_OWNED" });
      await close("SUCCESS", `${args.host} is no longer one of the company's own websites, so it isn't collected.`, "NONE");
      return null;
    }
    const opened = await openSession(ctx, args.connectionId);
    if (!opened.ok) {
      await close("FAILED", stoppedBecause(opened.problem, args.host), reachedSoFar(args.to));
      return null;
    }
    const open = opened.session;

    let to = args.to;
    let weekly = args.weekly;
    let jobAt = args.jobAt;
    let rows = args.rows;
    const countryDays = countryDayJobs(args.countryFrom ?? [], args.top);
    let jobs: Job[] = to === null ? jobsFor(weekly, target.others, target.shop, countryDays, args.listsFrom) : [];
    const { resumeAt: _waited, ...going } = args;
    const now = (): CollectSiteStepArgs => ({ ...going, to, weekly, jobAt, rows, requests: args.requests + open.requests, ...(skipped.length > 0 ? { skipped } : {}) });
    // The place saved as the step goes, at most every `SAVE_EVERY_MS` (RR1): a step the platform stops is started again
    // from within that of where it died, without a write after every one of a run's few hundred small jobs.
    let savedAt = Date.now();
    // False when this step is no longer the chain's booking — its watch started it again — so it stops at once (RR4).
    const saved = async (now_ = false): Promise<boolean> => {
      if (!now_ && Date.now() - savedAt < SAVE_EVERY_MS) return true;
      savedAt = Date.now();
      return await ctx.runMutation(internal.collectionSteps.notePlace, { ...memoryNow(),
        key, ...(args.booking !== undefined ? { booking: args.booking } : {}), args: now(), place: placeOf({ to, jobAt }, jobs),
      });
    };
    const line = async (heading: string, detail: string, failed = false) =>
      await ctx.runMutation(internal.roleRuns.logRunLine, { runId: args.runId, companyId: args.companyId, heading, detail, failed });
    const stop = async (result: Extract<StepResult, { ok: false }>) => {
      if (result.access) {
        await ctx.runMutation(internal.googleAnalyticsConnect.noteProblem, { connectionId: args.connectionId, problem: "NO_ACCESS" });
        await close("FAILED", `The Google account connected for ${args.host} can no longer read ${args.property} in Google Analytics. Connect it again from its Google Analytics page.`, reachedSoFar(to));
      } else if (result.wait) {
        // The hour's budget spent, or Google refusing for an allowance that refreshes within the hour (SF17, SF20).
        const resumeAt = afterTheHour(Date.now());
        if (resumeAt - (args.begunAt ?? Date.now()) > NIGHT_MS) {
          // What costs Google nothing is finished now — the days rolled on, the screens' lists rebuilt — and the next
          // night's lists start where this one stopped, so the same last lists are never the ones left out.
          const next = to === null ? jobs[jobAt] : undefined;
          await close(
            "SUCCESS",
            `Collected ${args.host} as far as the night allowed: ${result.reason}. The rest waits for tomorrow night's run, which starts where this one stopped; nothing is lost.`,
            reachedSoFar(to),
            { ...(next && !("days" in next) ? { listsFrom: jobKey(next) } : {}), fills: false },
          );
          return;
        }
        const at = new Date(resumeAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
        await line("Waiting for the hour", `Kept inside Google's allowances: ${result.reason}. Nothing more is asked of Google until ${at}, when the run carries on where it left off.`);
        await handOn({ ...now(), resumeAt }, "waiting for the hour", Math.min(LOOK_IN_MS, resumeAt - Date.now()));
      } else if (result.busy) {
        await ctx.runMutation(internal.googleAnalyticsConnect.noteProblem, { connectionId: args.connectionId, problem: "GOOGLE_BUSY" });
        // Google's own words go with it, so a limit reached reads as which one (conversions-back-in-time-plan.md, phase 5).
        await close("FAILED", `Google was too busy to answer for ${args.host}. Nothing is lost: the next run asks again. Google said: ${result.reason}`, reachedSoFar(to));
      } else {
        await close("FAILED", stoppedBecause(result.reason, args.host), reachedSoFar(to));
      }
    };
    // The days done: from here the ready-made lists, every one every night (Anthony, 2026-10-14: "I want everything
    // once a day"), the 90 days and 12 months, the page titles and tracking health's weekly checks too (SF17).
    const daysDone = () => {
      weekly = true;
      jobs = jobsFor(weekly, target.others, target.shop, countryDays, args.listsFrom);
    };

    // Stopped by the platform three times at one place: that place is left out, saying so, and the run goes on (RR1).
    // At the run's end — the page titles and every address's visits — those are left out, and the run closes.
    let endLeftOut = false;
    if (begun.skip) {
      if (to !== null) {
        const stepFrom = shiftDay(to, -(DAYS_PER_STEP - 1)) > args.from ? shiftDay(to, -(DAYS_PER_STEP - 1)) : args.from;
        await line(days(stepFrom, to), "Left out: the platform stopped this week's step three times. The next run fetches these days again.", true);
        to = stepFrom > args.from ? shiftDay(stepFrom, -1) : null;
        if (to === null) daysDone();
      } else if (jobAt < jobs.length) {
        await line("Left out", `${jobName(jobs[jobAt])}: the platform stopped it three times, so it keeps what was built before, and the next run asks it first.`, true);
        skipped.push(jobKey(jobs[jobAt]));
        jobAt += 1;
      } else {
        await line("Left out", "The page titles and every address's visits: the platform stopped them three times, so last week's stay.", true);
        endLeftOut = true;
      }
      // Saved at once, past the throttle: stopped again at the next job, its watch starts after the place left out.
      if (!(await saved(true))) return null;
    }

    // The second try at one place: that job alone in this step, so it has the step's memory and time to itself (RR1).
    const careful = begun.careful;
    // The page lists' slots, read once a step for each date range and device's parts.
    const pageSlots = new Map<string, Record<string, { slot: number; hash: string; from: string; to: string }>>();
    // A big website's groups of pages, likewise: asked once a step for each date range and device's parts.
    const pageGroups = new Map<string, string[][] | null>();
    let done = 0;
    // A step whose memory has grown by a quarter of what a step may hold hands on to a fresh one between jobs, rather
    // than slowing as it fills until the platform stops it (the rehearsal at ten times kordatackle.com, 2026-10-15: two
    // steps so full they ran past an action's ten minutes, each list then done at once in a step of its own). Growth
    // since the step began, not the whole: the runtime's own share is there before any job.
    const memoryAtStart = memoryMb() ?? 0;
    const roomy = () => (memoryMb() ?? 0) - memoryAtStart < STEP_MEMORY_MB / 4;
    while (Date.now() - started < STEP_BUDGET_MS && !(careful && done > 0) && (done === 0 || roomy())) {
      if (to !== null) {
        const stepFrom = shiftDay(to, -(DAYS_PER_STEP - 1)) > args.from ? shiftDay(to, -(DAYS_PER_STEP - 1)) : args.from;
        const result = await collectDays(ctx, open, args.connectionId, target, { from: stepFrom, to });
        if (!result.ok) {
          await stop(result);
          return null;
        }
        rows += result.rows;
        // Each page over time, once the website's pages are held (ga-stored-figures-plan.md SF5).
        const pages = target.pagesHeld ? await collectPageDays(ctx, open, args.connectionId, target, { from: stepFrom, to }) : null;
        if (pages && !pages.ok) {
          await stop(pages);
          return null;
        }
        await line(days(stepFrom, to), pages ? `The totals and channels by device: ${count(result.rows)} rows; each page by device: ${count(pages.rows)} rows.` : `The totals and channels by device: ${count(result.rows)} rows.`);
        to = stepFrom > args.from ? shiftDay(stepFrom, -1) : null;
        if (to === null) daysDone();
        done += 1;
        if (!(await saved())) return null;
        continue;
      }
      if (jobAt >= jobs.length) {
        // With the weekly lists, each page's title (§18.6.3): a title Google could not give waits for next week.
        if (weekly && !endLeftOut) {
          const titles = await collectTitles(ctx, open, args.connectionId, target, args.top);
          await line(
            "Page titles",
            titles.ok
              ? `${count(titles.titled)} pages' titles, each as Google Analytics saw it most over the last 90 days.`
              : `Google couldn't give the pages' titles this week, so last week's stay: ${titles.reason}`,
            !titles.ok,
          );
        }
        // With the weekly lists, every address's visits, for tracking health's strangers check (§6, check 8).
        const hosts = weekly && !endLeftOut ? await siteAddresses(open.accessToken, args.property, target.addresses[0] ?? args.host, args.top) : null;
        // And the listed events and sales on every address, for its conversions elsewhere check (conversion-addresses-plan.md).
        const conversions = weekly && !endLeftOut && target.events.length > 0
          ? await addressConversions(open.accessToken, args.property, [...new Set([...target.events, SALE_EVENT])], args.top, [target.country])
          : null;
        await line(
          "Ready-made lists",
          `${jobs.length} lists asked of Google ready-made: the last ${weekly ? "7 and 30 days, 90 days and 12 months" : "7 and 30 days"}, each with the span before${weekly ? ", and the 90 days and 12 months a year before" : ""}. A list whose figures did not move was left as it was.${skipped.length > 0 ? ` ${skipped.length === 1 ? "One was" : `${count(skipped.length)} were`} left out; the next run asks ${skipped.length === 1 ? "it" : "them"} first.` : ""}`,
          skipped.length > 0,
        );
        await close(
          "SUCCESS",
          `Collected ${args.host}, ${days(args.from, args.top)}: ${count(rows)} rows from ${count(args.requests + open.requests)} asks to Google. ${NOT_HISTORY}`,
          "WHOLE",
          { weekly, ...(hosts?.ok ? { hostVisits: hosts.found.visits.slice(0, 50) } : {}), ...(conversions?.ok ? { hostConversions: conversions.found.slice(0, 50) } : {}) },
        );
        return null;
      }
      const job = jobs[jobAt];
      if ("days" in job) {
        // Another home country's days, and each of its pages once they are held (SF7).
        const result = await collectDays(ctx, open, args.connectionId, target, { from: job.from, to: job.to }, undefined, job.country);
        if (!result.ok) {
          await stop(result);
          return null;
        }
        const held = target.countryHistory.find((one) => one.country === job.country)?.pagesHeld === true;
        const pages = held ? await collectPageDays(ctx, open, args.connectionId, target, { from: job.from, to: job.to }, job.country) : null;
        if (pages && !pages.ok) {
          await stop(pages);
          return null;
        }
        await line(`${job.country.toUpperCase()}: ${days(job.from, job.to)}`, `The totals and channels by device for visitors in ${job.country.toUpperCase()}: ${count(result.rows)} rows${pages ? `; each page by device: ${count(pages.rows)} rows` : ""}.`);
        rows += result.rows + (pages?.rows ?? 0);
        jobAt += 1;
        done += 1;
        if (!(await saved())) return null;
        continue;
      }
      const result = "funnels" in job
        ? await collectActionFunnels(ctx, open, target, args.top)
        : "pages" in job
          ? await collectPageLists(ctx, open, args.connectionId, target, job, args.top, { careful, slots: pageSlots, groups: pageGroups })
          : await collectPeriod(ctx, open, args.connectionId, target, job, args.top, { careful });
      if (!result.ok) {
        await stop(result);
        return null;
      }
      // Google's row limit is never passed in silence (RR2): the list keeps what came, and the run says so.
      if (result.cut) await line("Google's row limit", `${jobName(job)}: Google's answer reached the most rows it gives at once, so the smallest rows past it are not in this list.`, true);
      // A funnel Google would not hold to the conversion addresses was asked the old way: said, never silent.
      if (result.narrowed) await line("Conversions on other addresses", `Google refused "People who converted after it" with conversions on ${result.narrowed.join(", ")}, so it was asked on the website's own address: conversions there aren't in it.`, true);
      rows += result.rows;
      jobAt += 1;
      done += 1;
      if (!(await saved())) return null;
    }
    // The step's few minutes are up, or its careful job done: the rest in a step of its own.
    await handOn(now(), placeOf({ to, jobAt }, jobs));
  } catch (error: unknown) {
    await close("FAILED", failureSummary(error), reachedSoFar(args.to));
  }
  return null;
}

/** Another home country's days, a step's worth (ga-stored-figures-plan.md SF7). */
type CountryDaysJob = { days: true; country: string; from: string; to: string };
type Job = PeriodJob | PageListsJob | CountryDaysJob | FunnelsJob;

/** Each other home country's days, newest first, a week at a time: from the run's start, so the same every step. */
function countryDayJobs(countryFrom: ReadonlyArray<{ country: string; from: string }>, top: string): CountryDaysJob[] {
  return countryFrom.flatMap(({ country, from }) => {
    const out: CountryDaysJob[] = [];
    for (let to = top; to >= from;) {
      const stepFrom = shiftDay(to, -(DAYS_PER_STEP - 1)) > from ? shiftDay(to, -(DAYS_PER_STEP - 1)) : from;
      out.push({ days: true, country, from: stepFrom, to });
      to = shiftDay(stepFrom, -1);
    }
    return out;
  });
}

/**
 * What a run asks once the main home country's days are in, in order: each
 * other home country's days, the ready-made lists — the main home country's,
 * then each other's — the shared page lists (ga-stored-figures-plan.md
 * SF13), each country's, and each action's funnel
 * (ga-conversions-visitors-plan.md CV4): the same every step of the run.
 */
function jobsFor(weekly: boolean, others: readonly string[], shop: boolean, countryDays: readonly CountryDaysJob[], listsFrom?: string): Job[] {
  const lists: Job[] = [
    ...dueJobs({ weeklyPeriodsAt: weekly ? undefined : Date.now(), shop }, Date.now(), others),
    ...pageListJobs(weekly, others),
    // What people did before converting, over 12 months, once the events' 12 months are in (ga-conversions-visitors-plan.md CV4).
    ...(weekly ? [{ funnels: true } as const] : []),
  ];
  return [...countryDays, ...startingAt(lists, listsFrom)];
}

/** A ready-made list's key, the same every night for the same list: its fields in order. */
export function jobKey(job: Job): string {
  return JSON.stringify(Object.keys(job).sort().map((key) => [key, (job as Record<string, unknown>)[key]]));
}

/** The lists from the one a run cut short stopped at, then round to those before it; as they were when it is gone. */
export function startingAt<T extends Job>(lists: readonly T[], from: string | undefined): T[] {
  const at = from ? lists.findIndex((job) => jobKey(job) === from) : -1;
  return at > 0 ? [...lists.slice(at), ...lists.slice(0, at)] : [...lists];
}
