import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { pageChartTableValidator } from "./utils/assistantPageCharts";

/**
 * The charts a conversation started with, for Ask Hakken to redraw (`assistantPageChartHandlers.ts`,
 * ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 9). Apart from the tool, as the tool registry is imported
 * by the browser's code, which must never reach a module that defines functions.
 */

/** The charts the run's conversation started with, and the page they were on; none for a conversation of another company. */
export const pageChartsOfRunInternal = internalQuery({
  args: { runId: v.id("agentRuns"), companyId: v.id("companies") },
  returns: v.union(v.null(), v.object({ path: v.string(), charts: v.array(pageChartTableValidator) })),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run?.threadId) return null;
    const thread = await ctx.db.get(run.threadId);
    if (!thread || thread.companyId !== args.companyId || !thread.startedOn) return null;
    return { path: thread.startedOn.path, charts: thread.startedOn.charts ?? [] };
  },
});
