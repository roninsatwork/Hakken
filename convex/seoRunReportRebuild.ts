import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { DAY_MS, reportOf } from "./seoRunEstimate";

/**
 * Work the recent runs' reports out again (finish-off plan, item 15).
 *
 * A report worked out before 2026-10-05 did not keep what its run bought for
 * the company's competitors (`trackedCostUsd` in `runReportFields`), so a
 * company's "a month from now" (`newestPrices`) priced competitors' crawls,
 * link lists and whole keyword lists — no longer bought — as if they still
 * were, until the runs that bought them aged out. Run once on each deployment
 * after this is deployed:
 *
 *     npx convex run seoRunReportRebuild:rebuildRecentRunReports '{}'
 *
 * A page of runs at a time, newest first, back as far as `days` (45 by
 * default: a daily company's month and more, what the estimate reads); each
 * report a few seconds after the last, so a burst never crowds the Collector.
 */

const RUNS_PER_PAGE = 100;
const REPORT_SPACING_MS = 3_000;
const DEFAULT_DAYS = 45;

export const rebuildRecentRunReports = internalMutation({
  args: {
    days: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    /** Reports booked by the pages before this one: where this page's are spaced from. */
    booked: v.optional(v.number()),
  },
  returns: v.object({ booked: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const days = args.days ?? DEFAULT_DAYS;
    const since = Date.now() - days * DAY_MS;
    const page = await ctx.db.query("seoCollectionCycles").order("desc").paginate({ cursor: args.cursor ?? null, numItems: RUNS_PER_PAGE });
    let booked = args.booked ?? 0;
    for (const cycle of page.page) {
      if (cycle.startedAt < since || !(await reportOf(ctx, cycle._id))) continue;
      await ctx.scheduler.runAfter(booked * REPORT_SPACING_MS, internal.seoRunReports.buildRunReport, { cycleId: cycle._id });
      booked += 1;
    }
    // Newest first: a page wholly older than the window is the end of it.
    const done = page.isDone || page.page.every((cycle) => cycle.startedAt < since);
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.seoRunReportRebuild.rebuildRecentRunReports, { days, cursor: page.continueCursor, booked });
    }
    return { booked, done };
  },
});
