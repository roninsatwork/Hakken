import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { closeRoleRun } from "./roleRuns";
import { closeStep } from "./collectionSteps";
import { fillAfterCollection } from "./googleAnalyticsFillAfter";
import { forgetCountedHistory } from "./insightHistoryForget";
import { COUNTED_WITH } from "./googleAnalyticsSchema";

/**
 * A website's Google Analytics run has one closing, whatever its ending
 * (docs/plans/active/collection-reliability-plan.md, RR1): finished, failed,
 * cut short by the night, cancelled, or ended by its watch after the platform
 * stopped its steps too often. It runs once, in one transaction with the run's
 * end, so a run never finishes without it.
 *
 * Until 2026-10-15 only a whole run had all of it, and a run cut short by the
 * night half: a run the platform stopped had none, so kordatackle.com's page
 * said "Collecting its first 90 days" for good, its days never rolled on, and
 * its two-year fill — which "New and returning visitors a day" is drawn from —
 * never started.
 *
 * - `WHOLE`: every list asked. What was collected and when, the weekly lists'
 *   date, the days rolled on, the screens' lists rebuilt, tracking health on
 *   the first run and weekly, and the night's two-year fills.
 * - `DAYS`: the days in, the lists part-way. The same, but the weekly lists'
 *   date; the next run's lists start at `listsFrom`, so the same last lists are
 *   never the ones left out. The fills start too unless the night's allowance
 *   is spent (`fills: false`).
 * - `NONE`: stopped before any day came in. Only the collecting mark goes.
 */

const reachedValidator = v.union(v.literal("WHOLE"), v.literal("DAYS"), v.literal("NONE"));
type Reached = "WHOLE" | "DAYS" | "NONE";

export const closeArgs = {
  connectionId: v.id("googleAnalyticsConnections"),
  property: v.string(),
  runId: v.id("agentRuns"),
  workflowExecutionId: v.optional(v.id("workflowExecutions")),
  /** The run's watched chain (`collectionSteps.ts`), closed with it: only while the closing step is its booking. */
  stepKey: v.string(),
  booking: v.optional(v.number()),
  status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
  summary: v.string(),
  reached: reachedValidator,
  weekly: v.boolean(),
  recount: v.boolean(),
  /** Every address's visits over the 30 days, asked with the weekly lists: the strangers check. */
  hostVisits: v.optional(v.array(v.object({ host: v.string(), visits: v.number() }))),
  /** The listed events and sales on every address over the 30 days, asked with them: tracking health's conversions elsewhere. */
  hostConversions: v.optional(v.array(v.object({ host: v.string(), conversions: v.number() }))),
  /** When the night's run began (ga-big-site-reliability-plan.md BR7): the two-year fills follow a night's run only. */
  nightFrom: v.optional(v.number()),
  /** The list the next run starts from: where this one stopped, or the first it left out. */
  listsFrom: v.optional(v.string()),
  /** Whether the fills may start: not when the night's allowance is what stopped the run. */
  fills: v.boolean(),
};

type CloseArgs = {
  connectionId: Doc<"googleAnalyticsConnections">["_id"];
  property: string;
  reached: Reached;
  weekly: boolean;
  recount: boolean;
  hostVisits?: Array<{ host: string; visits: number }>;
  hostConversions?: Array<{ host: string; conversions: number }>;
  nightFrom?: number;
  listsFrom?: string;
  fills: boolean;
  runId?: Doc<"agentRuns">["_id"];
};

export const closeSiteRun = internalMutation({
  args: closeArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const open = run !== null && (run.status === "QUEUED" || run.status === "RUNNING");
    // Closed once: a second ending — the watch's and the step's own, say — finds the run ended and leaves it.
    if (open) {
      await closeConnection(ctx, args);
      await closeRoleRun(ctx, { runId: args.runId, ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}), status: args.status, summary: args.summary });
    } else {
      // Ended already — cancelled from Admin, or by its watch: its collecting mark still goes.
      await clearCollectingOf(ctx, args.connectionId, args.runId);
    }
    // A step the watch replaced never closes the chain that replaced it.
    await closeStep(ctx, args.stepKey, args.booking);
    return null;
  },
});

async function clearCollectingOf(ctx: MutationCtx, connectionId: Doc<"googleAnalyticsConnections">["_id"], runId: Doc<"agentRuns">["_id"]): Promise<void> {
  const connection = await ctx.db.get(connectionId);
  if (connection?.collecting?.runId === runId) await ctx.db.patch(connection._id, { collecting: undefined, updatedAt: Date.now() });
}

/**
 * A run its watch gave up on, whose closing step was stopped too (`collectionSteps.carryOn`): the run is ended
 * there, and its collecting mark goes here, so its page never says it is collecting for good (kordatackle.com,
 * 15 October). What it collected stays; the next run carries on from it.
 */
export const clearCollecting = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), runId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearCollectingOf(ctx, args.connectionId, args.runId);
    return null;
  },
});

/** What a run's closing does to its connection, as far as the run reached. */
export async function closeConnection(ctx: MutationCtx, args: CloseArgs): Promise<void> {
  const connection = await ctx.db.get(args.connectionId);
  if (!connection) return;
  const now = Date.now();
  // Another property chosen, or a newer run's mark: only this run's collecting mark goes.
  if (connection.property !== args.property) return;
  const ours = !args.runId || !connection.collecting || connection.collecting.runId === args.runId;
  if (args.reached === "NONE") {
    if (ours && connection.collecting) await ctx.db.patch(connection._id, { collecting: undefined, updatedAt: now });
    return;
  }
  const whole = args.reached === "WHOLE";
  const first = connection.backfilledAt === undefined;
  // The addresses whose conversions count moved while this run was collecting (conversion-addresses-plan.md): what it
  // collected before then was counted the old way, so the figures stay to be collected again, whole, by the next run.
  const run = args.runId ? await ctx.db.get(args.runId) : null;
  const movedSince = connection.addressesMovedAt !== undefined && (run?.startedAt ?? 0) < connection.addressesMovedAt;
  // Insights' months counted the old way are asked again on its next run (BT6).
  if (whole && args.recount) await forgetCountedHistory(ctx, connection.companyWebsiteId);
  await ctx.db.patch(connection._id, {
    ...(args.hostVisits ? { hostVisits: args.hostVisits } : {}),
    ...(args.hostConversions ? { hostConversions: args.hostConversions } : {}),
    ...(whole && args.recount && !movedSince ? { countedWith: COUNTED_WITH } : {}),
    lastCollectedAt: now,
    ...(whole ? { dailyPeriodsAt: now } : {}),
    ...(whole && args.weekly ? { weeklyPeriodsAt: now } : {}),
    // The days are in: a first collection's 60 days count as its first, whole or not.
    ...(first ? { backfilledAt: now } : {}),
    ...(ours ? { collecting: undefined } : {}),
    // A whole run asked every list: the next starts from the first again, or from the first it left out.
    listsFrom: args.listsFrom,
    ...(whole ? { problem: undefined, problemAt: undefined, problemDetail: undefined } : {}),
    updatedAt: now,
  });
  // The past rolled on (ga-stored-figures-plan.md SF2): days past 90 into weeks, weeks past a year into months;
  // each week, the pages quiet for two years cleared (SF5).
  if (connection.newestDay) await ctx.scheduler.runAfter(0, internal.googleAnalyticsHistory.rollHistory, { companyWebsiteId: connection.companyWebsiteId, newest: connection.newestDay });
  if (connection.newestDay && whole && args.weekly) await ctx.scheduler.runAfter(0, internal.googleAnalyticsPageSeries.dropOldPageSeries, { companyWebsiteId: connection.companyWebsiteId, newest: connection.newestDay });
  // What screens asked of Google live is held until now (GA23): the ready-made lists are fresher.
  await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.dropLive, { companyWebsiteId: connection.companyWebsiteId });
  // Tracking health when the first collection is in, and every week (GA11).
  if (first || (whole && args.weekly)) await ctx.scheduler.runAfter(0, internal.googleAnalyticsHealth.runHealthChecks, { connectionId: connection._id });
  // Each page's visits sit beside Search Console's clicks in the website's page list (§4.6).
  await ctx.scheduler.runAfter(0, internal.holdPages.requestRebuild, { holdId: connection.companyWebsiteId });
  // A home country taken off the website's list goes (§18.6.1).
  await ctx.scheduler.runAfter(0, internal.googleAnalyticsCountries.dropCountriesNotKept, { companyWebsiteId: connection.companyWebsiteId });
  if (args.nightFrom !== undefined && args.fills) await fillAfterCollection(ctx, connection, args.nightFrom);
}
