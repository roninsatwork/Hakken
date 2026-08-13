"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";

/**
 * Ask the questions that are due, and record what came back.
 *
 * Runs on the same minute cron as workflow schedules rather than a second
 * clock. Each question is asked on its own so one provider failure does not
 * take the rest of the batch with it — a failed run is recorded and
 * rescheduled, and the previous answer is kept, because an outage is not
 * evidence that anything changed.
 *
 * Every function here declares what it returns. An action that calls back
 * into its own api through runQuery/runMutation without saying so makes the
 * type inference circular, and Convex resolves that by degrading the whole
 * generated `api` to `any` — which silently strips types from every caller
 * in the app, not just this file.
 */

/** A batch bound, so a backlog cannot turn one tick into an unbounded spend. */
const SCHEDULED_QUESTION_BATCH_LIMIT = 10;

export const askDueQuestions = internalAction({
  args: {},
  handler: async (ctx): Promise<{ asked: number }> => {
    const due: Array<Doc<"scheduledQuestions">> = await ctx.runQuery(
      internal.scheduledQuestions.getDueQuestions,
      { now: Date.now(), limit: SCHEDULED_QUESTION_BATCH_LIMIT },
    );

    for (const question of due) {
      try {
        const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
          requestedModelId: question.modelId,
          companyId: question.companyId,
          useCase: "chat",
        });

        const response = await generateTextWithResolvedModel({
          model: modelConfig,
          contents: [{ type: "text", text: question.question }],
        });

        await ctx.runMutation(internal.scheduledQuestions.recordAnswer, {
          questionId: question._id,
          answer: response.text || "",
        });
      } catch (error) {
        const normalized = normalizeAiRuntimeError(error, "Asking the question failed.");
        console.error("Scheduled question failed", { questionId: question._id, error: normalized });
        await ctx.runMutation(internal.scheduledQuestions.recordFailure, {
          questionId: question._id,
          error: typeof normalized.error === "string" ? normalized.error : "Asking the question failed.",
        });
      }
    }

    return { asked: due.length };
  },
});
