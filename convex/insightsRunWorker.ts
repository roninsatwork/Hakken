"use node";

import { appError } from "./utils/appError";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { insightsStepArgs } from "./insightsAsk";
import { stepKey } from "./collectionSteps";
import { INSIGHTS_STEPS } from "./insightsRunSteps";
import { finishRun } from "./searchConsoleAgentRun";
import { memoryNow } from "./utils/stepMemory";
import { historyStateValidator } from "./utils/insightHistoryRun";

/** The existing collection watch carries stopped Insights steps from their saved arguments. */
export const continueRun = internalAction({
  args: {
    ...insightsStepArgs,
    stage: v.union(...INSIGHTS_STEPS.map((step) => v.literal(step))),
    booking: v.number(), closeOnly: v.optional(v.boolean()),
    pagesChanged: v.optional(v.array(v.object({ kind: v.string(), page: v.string() }))),
    round: v.optional(v.number()), week: v.optional(v.string()), today: v.optional(v.string()),
    history: v.optional(historyStateValidator),
    afterPart: v.optional(v.number()), afterAttempt: v.optional(v.number()),
    decideAttempt: v.optional(v.number()),
    ownerRemaining: v.optional(v.number()), ownerStalls: v.optional(v.number()),
    competingAttempt: v.optional(v.number()), competingAt: v.optional(v.number()), competingSignature: v.optional(v.string()), competingProblems: v.optional(v.array(v.string())),
    counts: v.optional(v.object({ facts: v.number(), candidates: v.number(), written: v.number(), published: v.number(), sentBack: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { stage, booking, closeOnly, pagesChanged = [], round, history, week, today, counts, afterPart, afterAttempt, decideAttempt, ownerRemaining, ownerStalls, competingAttempt, competingAt, competingSignature, competingProblems, ...given } = args;
    const run = { ...given, chainBooking: booking };
    const key = stepKey("INSIGHTS", run.holdId);
    const start = await ctx.runMutation(internal.collectionSteps.stepStarted, { key, booking });
    if (!start.go) return null;
    if (await ctx.runQuery(internal.insightsRunSteps.runEnded, { runId: run.runId })) {
      await ctx.runMutation(internal.collectionSteps.closeChain, { key, booking, ...memoryNow() });
      return null;
    }
    if (start.skip || closeOnly) {
      await finishRun(ctx, run.runId, run.workflowExecutionId, "FAILED", `${run.host}: ${stage} stopped repeatedly. Completed results remain available; the whole section has not refreshed.`);
      await ctx.runMutation(internal.collectionSteps.closeChain, { key, booking, ...memoryNow() });
      return null;
    }
    if (stage === "GATHER") await ctx.runAction(internal.insightsRun.runWebsite, run);
    else {
      const watchId = await ctx.runMutation(internal.insightsRunSteps.bookInsightsWatch, { ...run, step: stage });
      if (stage === "HISTORY") {
        if (!history) throw appError("INVALID_INPUT", "The history step has no saved position.");
        await ctx.runAction(internal.insightHistorySteps.fillForRun, { ...run, watchId, pagesChanged, history });
      } else if (stage === "PICK") await ctx.runAction(internal.insightCompetingJudge.pickWebsite, { ...run, watchId, pagesChanged, ...(round ? { round } : {}), ...(ownerRemaining === undefined ? {} : { ownerRemaining }), ...(ownerStalls === undefined ? {} : { ownerStalls }) });
      else if (stage === "GROUPS") await ctx.runAction(internal.insightCompetingSteps.prepareGroups, { ...run, watchId, pagesChanged, ...(competingAttempt === undefined ? {} : { competingAttempt }), ...(competingAt === undefined ? {} : { competingAt }), ...(competingSignature === undefined ? {} : { competingSignature }), ...(competingProblems === undefined ? {} : { competingProblems }) });
      else if (stage === "DECIDE") await ctx.runAction(internal.insightsRun.decideWebsite, { ...run, watchId, pagesChanged, ...(decideAttempt === undefined ? {} : { decideAttempt }) });
      else await ctx.runAction(internal.insightsRunAfter.afterWeek, { ...run, watchId, week: week ?? "", today: today ?? "", ...(afterPart === undefined ? {} : { afterPart }), ...(afterAttempt === undefined ? {} : { afterAttempt }), counts: counts ?? { facts: 0, candidates: 0, written: 0, published: 0, sentBack: 0 } });
    }
    // A successful hand-on has a new booking; closing this one cannot close its successor.
    const finished = await ctx.runQuery(internal.insightsRunSteps.runEnded, { runId: run.runId });
    if (finished) await ctx.runMutation(internal.collectionSteps.closeChain, { key, booking, ...memoryNow() });
    return null;
  },
});
