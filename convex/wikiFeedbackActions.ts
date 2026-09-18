"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { runDecisions } from "./decisionActions";
import { questionKey } from "./wikiFeedbackService";

/**
 * The real-question Decision (decisions-typesafe-plan.md, Phase F.4).
 *
 * The Unanswered list is written by a mutation, which cannot ask a model;
 * so the greeting-list rule writes first and this judges after. It only
 * ever corrects the list when the Decision acts and disagrees with the
 * rule: a real question the rule dropped is logged, a non-question the rule
 * logged is dismissed. Off, or unsure, or agreeing: nothing changes.
 */
export const judgeUnansweredQuestion = internalAction({
  args: {
    companyId: v.optional(v.id("companies")),
    question: v.string(),
    ruleSaysReal: v.boolean(),
  },
  handler: async (ctx, args): Promise<void> => {
    const result = (await runDecisions(ctx, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      subject: { kind: "question", id: questionKey(args.question) || "empty" },
      state: { question: args.question.slice(0, 600) },
      requests: [{ key: "wiki.real-question", fallback: () => ({ kind: "yes-no", yes: args.ruleSaysReal }) }],
    }))["wiki.real-question"];
    if (result.verdict !== "ACT" || result.answer.kind !== "yes-no") return;
    if (result.answer.yes === args.ruleSaysReal) return;
    await ctx.runMutation(internal.wikiFeedback.recordJudgedGapInternal, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      question: args.question,
      real: result.answer.yes,
    });
  },
});
