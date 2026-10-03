"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { count, countryLabel, days, finishRun } from "./searchConsoleAgentRun";
import { rollUpSite } from "./searchConsoleRollups";
import { buildSitePeriods } from "./searchConsolePeriods";

/**
 * A website's run settles after its days are in (search-console-plan.md
 * §14.3): days past 90 roll into their weeks and weeks past 12 months into
 * their months, then the ready-made periods and the charts' weeks are added
 * up again. In the Node runtime, which gives an action room for a website's
 * 90 days of keyword-and-page pairs at once — the default runtime's memory is
 * too small for a website of a few thousand pairs a day (reviewed 2026-10-03).
 *
 * All countries first, then each country kept ready (§16), exactly the same
 * way from its own held days — each country an action of its own, so no one
 * action holds more than one country's days or meets an action's ten
 * minutes however many countries a website keeps ready.
 */
export const settleSite = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    connectionId: v.id("searchConsoleConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    summary: v.string(),
    /** The country kept ready this settle adds up; missing for all countries, which go first. */
    country: v.optional(v.string()),
    /** The countries still to add up after this one; worked out once all countries are done. */
    countries: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finish = async () => await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", args.summary);
    try {
      const state = await ctx.runQuery(internal.searchConsoleSync.stepState, {
        connectionId: args.connectionId,
        ...(args.country === undefined ? {} : { country: args.country }),
      });
      if (!state || state.clearing) {
        await finish();
        return null;
      }
      if (state.newestDay && state.oldestDay && state.kept) {
        const rolled = await rollUpSite(ctx, state.companyWebsiteId, state.newestDay, args.country);
        const written = await buildSitePeriods(ctx, state.companyWebsiteId, state.newestDay, state.oldestDay, args.country);
        await ctx.runMutation(internal.roleRuns.logRunLine, {
          runId: args.runId,
          companyId: args.companyId,
          heading: args.country === undefined ? "Kept and added up" : `Kept and added up, ${countryLabel(args.country)}`,
          detail: `${count(rolled)} ${rolled === 1 ? "day or week" : "days and weeks"} rolled up; the 7-, 30- and 90-day and 12-month lists rebuilt (${count(written)} records), to ${days(state.newestDay, state.newestDay)}.`,
          failed: false,
        });
      } else if (args.country === undefined) {
        // Nothing held for all countries: nothing for any country either.
        await finish();
        return null;
      }
      const left = args.country === undefined ? state.countries : (args.countries ?? []);
      if (left.length > 0) {
        await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.settleSite, { ...args, country: left[0], countries: left.slice(1) });
        return null;
      }
      await finish();
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", `The days came in, but adding them up stopped: ${failureSummary(error)} The next run adds them up again.`);
    }
    return null;
  },
});
