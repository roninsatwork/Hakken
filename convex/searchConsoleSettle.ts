"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { failureSummary } from "./roleRuns";
import { count, days, finishRun } from "./searchConsoleAgentRun";
import { rollUpSite } from "./searchConsoleSync";
import { buildSitePeriods } from "./searchConsolePeriods";

/**
 * A website's run settles after its days are in (search-console-plan.md
 * §14.3): days past 90 roll into their weeks and weeks past 12 months into
 * their months, then the ready-made periods and the charts' weeks are added
 * up again. In the Node runtime, which gives an action room for a website's
 * 90 days of keyword-and-page pairs at once — the default runtime's memory is
 * too small for a website of a few thousand pairs a day (reviewed 2026-10-03).
 */
export const settleSite = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    connectionId: v.id("searchConsoleConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const state = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId: args.connectionId });
      if (!state || !state.newestDay || !state.oldestDay || state.clearing) {
        await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", args.summary);
        return null;
      }
      const rolled = await rollUpSite(ctx, state.companyWebsiteId, state.newestDay);
      const written = await buildSitePeriods(ctx, state.companyWebsiteId, state.newestDay, state.oldestDay);
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId: args.runId,
        companyId: args.companyId,
        heading: "Kept and added up",
        detail: `${count(rolled)} ${rolled === 1 ? "day or week" : "days and weeks"} rolled up; the 7-, 30- and 90-day and 12-month lists rebuilt (${count(written)} records), to ${days(state.newestDay, state.newestDay)}.`,
        failed: false,
      });
      await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", args.summary);
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", `The days came in, but adding them up stopped: ${failureSummary(error)} The next run adds them up again.`);
    }
    return null;
  },
});

