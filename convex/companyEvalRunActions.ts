"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import {
  combineGradeSamples,
  parseGradeVerdict,
  selectGraderModel,
  type GradeVerdict,
} from "./agentEvalGradingService";
import { calculateModelCostGBP } from "./aiCostService";

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
/** More than this is a runaway, not a confidence interval. */
const MAX_SAMPLE_COUNT = 5;

/**
 * What the run cost, in pounds.
 *
 * Reuses the catalogue rates and `calculateModelCostGBP` rather than inventing a
 * second cost calculation. A model with no pricing contributes zero, which understates
 * rather than invents — the model catalogue already warns separately about unpriced
 * models.
 */
async function calculateRunCostGBP(
  ctx: { runQuery: (ref: typeof internal.aiModels.getModelByIdInternal, args: { modelId: string }) => Promise<{
    standardInputCostBelow200k?: number;
    standardInputCostAbove200k?: number;
    cachedInputCostBelow200k?: number;
    cachedInputCostAbove200k?: number;
    outputResponseCost?: number;
  } | null> },
  args: {
    tokens: { answerIn: number; answerOut: number; gradeIn: number; gradeOut: number };
    answerModelId?: string;
    graderModelId?: string;
  },
) {
  const answerRates = args.answerModelId
    ? await ctx.runQuery(internal.aiModels.getModelByIdInternal, { modelId: args.answerModelId })
    : null;
  const graderRates = args.graderModelId
    ? await ctx.runQuery(internal.aiModels.getModelByIdInternal, { modelId: args.graderModelId })
    : null;

  return calculateModelCostGBP({
    inputTokens: args.tokens.answerIn,
    outputTokens: args.tokens.answerOut,
    rates: answerRates,
  }) + calculateModelCostGBP({
    inputTokens: args.tokens.gradeIn,
    outputTokens: args.tokens.gradeOut,
    rates: graderRates,
  });
}

export type CompanyCheckRunResult = {
  status: "PASSED" | "FAILED" | "NEEDS_REVIEW";
  score: number;
};

export const runCompanyCheck = internalAction({
  args: {
    evalCaseId: v.id("companyEvalCases"),
    /** Absent for a platform check: the thread has no company, and the
     * answer comes from the global brain alone. */
    companyId: v.optional(v.id("companies")),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<CompanyCheckRunResult> => {
    const evalCase = await ctx.runQuery(internal.companyEvals.getCaseForRunInternal, {
      evalCaseId: args.evalCaseId,
    });
    if (!evalCase) throw new Error("Eval case not found");

    // Opt-in repeat sampling. One ask cannot tell a check that always passes from one
    // that passes two times in three, and the second is a check that fails one
    // conversation in three. Bounded, because each sample is two more provider calls.
    const sampleCount = Math.min(Math.max(Math.round(evalCase.sampleCount ?? 1), 1), MAX_SAMPLE_COUNT);

    try {
      const verdicts: GradeVerdict[] = [];
      const tokens = { answerIn: 0, answerOut: 0, gradeIn: 0, gradeOut: 0 };
      let lastAnswer = "";
      let lastEvidenceJson: string | undefined;
      let answerModelId: string | undefined;
      let graderModelId: string | undefined;
      let anySampleProducedNoAnswer = false;

      for (let sample = 0; sample < sampleCount; sample += 1) {
        const threadId = await ctx.runMutation(internal.companyEvals.createEvalThreadInternal, {
          ...(args.companyId ? { companyId: args.companyId } : {}),
          evalCaseId: args.evalCaseId,
          userId: args.userId,
        });

        await ctx.runAction(internal.aiChat.generateSonaeResponse, {
          threadId,
          content: evalCase.prompt,
        });

        const outcome = await ctx.runQuery(internal.companyEvals.getEvalThreadOutcomeInternal, {
          threadId,
        });
        tokens.answerIn += outcome.inputTokens;
        tokens.answerOut += outcome.outputTokens;
        answerModelId = outcome.modelUsed ?? answerModelId;

        // "Asked, and said nothing" is a failure of the assistant, not of the run, so
        // it counts as a failing sample. Grading the placeholder would spend a call to
        // be told the obvious.
        if (outcome.answer.trim().length === 0) {
          anySampleProducedNoAnswer = true;
          lastAnswer = "The company AI produced no readable answer.";
          verdicts.push({ pass: false, reason: "The company AI produced no readable answer." });
          break;
        }

        lastAnswer = outcome.answer;
        lastEvidenceJson = outcome.evidenceJson;

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
          answer: lastAnswer,
        });

        let gradingResponse;
        let gradedIndependently = grader.independent;
        try {
          gradingResponse = await generateTextWithResolvedModel({
            model: graderConfig,
            contents: [{ type: "text", text: gradingPrompt }],
            temperature: 0,
          });
          graderModelId = graderConfig.modelId;
        } catch (gradingError: unknown) {
          // The independent grader is preferred, not required. A second model that is
          // out of credits or unreachable is our problem, not the assistant's, and
          // failing the check for it would report a billing state as an AI fault.
          // Fall back to the model that produced the answer and say the grade is not
          // independent — the same honesty the agent grader applies when a deployment
          // has only one model.
          if (!grader.independent) throw gradingError;
          const fallbackConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            requestedModelId: outcome.modelUsed ?? undefined,
            companyId: args.companyId,
            useCase: "chat",
          });
          gradingResponse = await generateTextWithResolvedModel({
            model: fallbackConfig,
            contents: [{ type: "text", text: gradingPrompt }],
            temperature: 0,
          });
          graderModelId = fallbackConfig.modelId;
          gradedIndependently = false;
        }

        tokens.gradeIn += gradingResponse.inputTokens ?? 0;
        tokens.gradeOut += gradingResponse.outputTokens ?? 0;

        const verdict = parseGradeVerdict(gradingResponse.text || "");
        const independenceNote = gradedIndependently
          ? `Graded by ${graderConfig.modelId}.`
          : "Graded by the model that produced the answer, so this grade is not independent.";
        verdicts.push({ ...verdict, reason: `${verdict.reason} ${independenceNote}` });

        // Every sample has to pass, so a failure settles it. Continuing would spend
        // real money to confirm a result already decided.
        if (!verdict.pass) break;
      }

      const combined = combineGradeSamples(verdicts);
      const costGBP = await calculateRunCostGBP(ctx, { tokens, answerModelId, graderModelId });

      return await ctx.runMutation(internal.companyEvals.recordGradedRunInternal, {
        evalCaseId: args.evalCaseId,
        userId: args.userId,
        answer: lastAnswer,
        evidenceJson: anySampleProducedNoAnswer ? undefined : lastEvidenceJson,
        judgePassed: combined.pass,
        judgeDetail: sampleCount > 1
          ? `${combined.reason} Asked ${verdicts.length} of ${sampleCount} times.`
          : combined.reason,
        answerFailed: anySampleProducedNoAnswer,
        resolvedModelId: answerModelId,
        tokenUsageJson: JSON.stringify({
          samples: verdicts.length,
          answerInputTokens: tokens.answerIn,
          answerOutputTokens: tokens.answerOut,
          gradingInputTokens: tokens.gradeIn,
          gradingOutputTokens: tokens.gradeOut,
        }),
        costJson: JSON.stringify({ currency: "GBP", totalGBP: costGBP }),
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
