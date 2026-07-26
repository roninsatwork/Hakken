"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import { parseGradeVerdict, selectGraderModel } from "./agentEvalGradingService";

/**
 * Run one company check for real.
 *
 * Two things make this a test rather than paperwork, and both were absent before.
 *
 * The answer comes from the **real** company assistant. The question is sent down
 * `generateSonaeResponse`, the same path a customer message takes, so the answer is
 * produced with the same system prompt, rules, skills, memories and retrieval the
 * live assistant has. The previous batch runner wrote a template string describing
 * the check and then scored that string, so it graded the system's own description
 * of the test rather than the assistant's behaviour.
 *
 * The grade comes from a **different** model. A model marking its own homework
 * favours its own output, and one that has just confidently said something wrong is
 * the least likely thing to notice. Where a deployment has only one enabled model
 * the grade is still recorded, and it says on the record that it is not
 * independent — rather than letting a weaker grade read like a full one.
 *
 * An unreadable grade fails, via `parseGradeVerdict`. A grade nobody can interpret
 * is not evidence the assistant works, and this result feeds the readiness gates.
 */
/**
 * Annotated rather than inferred. The handler calls a mutation whose own return
 * type is inferred, and letting this one infer from that closes a loop through the
 * generated api types that TypeScript resolves by degrading the whole data model
 * to a union of every table.
 */
export type CompanyCheckRunResult = {
  status: "PASSED" | "FAILED" | "NEEDS_REVIEW";
  score: number;
};

export const runCompanyCheck = internalAction({
  args: {
    evalCaseId: v.id("companyEvalCases"),
    companyId: v.id("companies"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<CompanyCheckRunResult> => {
    const evalCase = await ctx.runQuery(internal.companyEvals.getCaseForRunInternal, {
      evalCaseId: args.evalCaseId,
    });
    if (!evalCase) throw new Error("Eval case not found");

    try {
      const threadId = await ctx.runMutation(internal.companyEvals.createEvalThreadInternal, {
        companyId: args.companyId,
        evalCaseId: args.evalCaseId,
        userId: args.userId,
      });

      await ctx.runAction(internal.ai.generateSonaeResponse, {
        threadId,
        content: evalCase.prompt,
      });

      const outcome = await ctx.runQuery(internal.companyEvals.getEvalThreadOutcomeInternal, {
        threadId,
      });
      // An empty answer is a failure to record, not a reason to abandon the run.
      // Recording nothing would leave the check reading "never run", which is a
      // different and more forgiving fact than "asked, and said nothing".
      const answerFailed = outcome.answer.trim().length === 0;
      const answer = answerFailed
        ? "The company AI produced no readable answer."
        : outcome.answer;

      // Nothing was said, so there is nothing for a grader or a rule to judge.
      // Grading the placeholder would spend a provider call to be told the
      // obvious, and the rules would pass against text the assistant never wrote.
      if (answerFailed) {
        return await ctx.runMutation(internal.companyEvals.recordGradedRunInternal, {
          evalCaseId: args.evalCaseId,
          userId: args.userId,
          answer,
          judgePassed: false,
          judgeDetail: "The company AI produced no readable answer, so nothing could be graded.",
          answerFailed: true,
          resolvedModelId: outcome.modelUsed,
        });
      }

      // Text-capable only. Every enabled model would include the embedding model,
      // and a grader cannot be a model that produces vectors.
      const enabledModelIds = await ctx.runQuery(internal.aiModels.getEnabledTextModelIdsInternal, {});
      const grader = selectGraderModel({
        targetModelId: outcome.modelUsed ?? "",
        enabledModelIds,
      });
      const graderConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        requestedModelId: grader.modelId || undefined,
        companyId: args.companyId,
        useCase: "chat",
      });

      const gradingPrompt = buildCompanyCheckGradingPrompt({
        question: evalCase.prompt,
        expectedBehavior: evalCase.expectedBehavior,
        answer,
      });

      let gradingResponse;
      let gradedIndependently = grader.independent;
      try {
        gradingResponse = await generateTextWithResolvedModel({
          model: graderConfig,
          contents: [{ type: "text", text: gradingPrompt }],
          temperature: 0,
        });
      } catch (gradingError: unknown) {
        // The independent grader is preferred, not required. A second model that is
        // out of credits or unreachable is our problem, not the assistant's, and
        // failing the check for it would report a billing state as an AI fault.
        // Fall back to the model that produced the answer and say the grade is not
        // independent — the same honesty the agent grader applies when a deployment
        // has only one model.
        if (!grader.independent) throw gradingError;
        gradingResponse = await generateTextWithResolvedModel({
          model: await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            requestedModelId: outcome.modelUsed ?? undefined,
            companyId: args.companyId,
            useCase: "chat",
          }),
          contents: [{ type: "text", text: gradingPrompt }],
          temperature: 0,
        });
        gradedIndependently = false;
      }

      const verdict = parseGradeVerdict(gradingResponse.text || "");
      const independenceNote = gradedIndependently
        ? `Graded by ${graderConfig.modelId}.`
        : "Graded by the model that produced the answer, so this grade is not independent.";

      return await ctx.runMutation(internal.companyEvals.recordGradedRunInternal, {
        evalCaseId: args.evalCaseId,
        userId: args.userId,
        answer,
        evidenceJson: outcome.evidenceJson,
        judgePassed: verdict.pass,
        judgeDetail: `${verdict.reason} ${independenceNote}`,
        judgeNotes: gradingResponse.text || undefined,
        resolvedModelId: outcome.modelUsed,
        tokenUsageJson: JSON.stringify({
          answerInputTokens: outcome.inputTokens,
          answerOutputTokens: outcome.outputTokens,
          gradingInputTokens: gradingResponse.inputTokens ?? 0,
          gradingOutputTokens: gradingResponse.outputTokens ?? 0,
        }),
      });
    } catch (error: unknown) {
      // Recorded as **not tested**, not as a failure. A failure is a judgement
      // about the answer; an unreachable provider is a judgement about us. Marking
      // it failed would tell an admin their AI is broken when what broke was the
      // run, and a not-tested check still refuses to clear the readiness gates — so
      // nothing goes green on the strength of it either way.
      //
      // It is recorded rather than left silent, so the reason is on the check
      // instead of only in a log.
      const errorMessage = normalizeAiRuntimeError(error, "The company AI could not be reached.").error;
      return await ctx.runMutation(internal.companyEvals.recordGradedRunInternal, {
        evalCaseId: args.evalCaseId,
        userId: args.userId,
        answer: errorMessage,
        judgeNotes: errorMessage,
        // No judge verdict, and the rules are not run against an error message.
        answerFailed: true,
      });
    }
  },
});

/**
 * What the grader is asked.
 *
 * Deliberately says the grader did not write the answer, and asks for strict JSON
 * so `parseGradeVerdict` can fail closed on anything else.
 */
export function buildCompanyCheckGradingPrompt(args: {
  question: string;
  expectedBehavior: string;
  answer: string;
}) {
  return [
    "You are grading an AI assistant's answer against a description of what a good answer must do.",
    "You did not write the answer. Judge it strictly against the description.",
    "Return strict JSON only with this shape:",
    "{\"pass\": boolean, \"reason\": string, \"confidence\": number}",
    "",
    `Question asked: ${args.question}`,
    `What a good answer must do: ${args.expectedBehavior}`,
    `Assistant's answer: ${args.answer}`,
  ].join("\n");
}
