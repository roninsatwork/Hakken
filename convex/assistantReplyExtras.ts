import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { hakkenTaskProposalValidator } from "./hakkenTaskSchema";
import { answerChartValidator, chartFromToolCalls } from "./utils/assistantCharts";
import { lookupValidator, lookupsFromToolCalls } from "./utils/assistantLookups";
import { proposalFromToolCalls } from "./utils/hakkenTaskProposals";

/**
 * What an Ask Hakken reply carries under its words, read once from the run's
 * own record of its tool calls — which survives a hand-over to a later
 * segment, as memory would not: the "Looked up" line
 * (assistant-foundation-plan.md, item 7), a change proposed for the reader's
 * tap (hakken-tasks-plan.md, item 1.2) and the chart drawn under it (2.1).
 */
export const runExtrasInternal = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.object({
    lookedUp: v.array(lookupValidator),
    taskProposal: v.union(v.null(), hakkenTaskProposalValidator),
    chart: v.union(v.null(), answerChartValidator),
  }),
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("agentToolCalls")
      .withIndex("by_run_started", (q) => q.eq("runId", args.runId))
      .take(200);
    return {
      lookedUp: lookupsFromToolCalls(calls),
      taskProposal: proposalFromToolCalls(calls) ?? null,
      chart: chartFromToolCalls(calls) ?? null,
    };
  },
});
