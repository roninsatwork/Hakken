import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { hasAnswerChanged } from "./scheduledQuestionService";
import { getNextWorkflowScheduleRunAt, shouldRunWorkflowSchedule } from "./workflowScheduleService";

/**
 * Questions Sonae re-asks, so somebody is told when the answer moves.
 *
 * The scheduler could already run an agent; it could not watch an answer.
 * This rides the same cron and the same interval rules as workflow
 * schedules rather than introducing a second clock.
 *
 * Every run costs money, so a question is off unless somebody switched it
 * on, and the interval is chosen rather than inferred.
 */

const intervalValidator = v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"));

const QUESTION_MAX_LENGTH = 500;

function normaliseQuestion(question: string) {
  const trimmed = question.trim();
  if (!trimmed) throw new Error("A scheduled question needs a question.");
  if (trimmed.length > QUESTION_MAX_LENGTH) {
    throw new Error(`A scheduled question cannot exceed ${QUESTION_MAX_LENGTH} characters.`);
  }
  return trimmed;
}

export const listQuestions = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const { companyId } = ctx;
    if (!companyId) return [];

    return await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_company_created", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(100);
  },
});

export const createQuestion = tenantMutation({
  args: {
    question: v.string(),
    intervalStr: intervalValidator,
    modelId: v.optional(v.string()),
    raisesTask: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { companyId, userId } = ctx;
    if (!companyId) throw new Error("A scheduled question needs a workspace.");

    const now = Date.now();
    return await ctx.db.insert("scheduledQuestions", {
      companyId,
      question: normaliseQuestion(args.question),
      modelId: args.modelId,
      intervalStr: args.intervalStr,
      // Off until somebody switches it on: a question that starts running
      // the moment it is typed spends money nobody agreed to.
      isActive: false,
      raisesTask: args.raisesTask ?? false,
      ownerUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setQuestionActive = tenantMutation({
  args: { questionId: v.id("scheduledQuestions"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const { companyId } = ctx;
    const question = await ctx.db.get(args.questionId);
    if (!question || question.companyId !== companyId) throw new Error("That question could not be found.");

    const now = Date.now();
    await ctx.db.patch(args.questionId, {
      isActive: args.isActive,
      // Switching on for the first time asks straight away, to take the
      // baseline the next run will be compared against. Without it you would
      // switch on a weekly question and wait a week to find out whether it
      // even works. Switching off clears the time so a paused question
      // cannot be picked up by the dispatcher.
      nextRunAt: args.isActive
        ? (question.lastAskedAt === undefined
            ? now
            : getNextWorkflowScheduleRunAt({ intervalStr: question.intervalStr, lastRunTs: question.lastAskedAt, now: new Date(now) }))
        : undefined,
      updatedAt: now,
    });
  },
});

export const deleteQuestion = tenantMutation({
  args: { questionId: v.id("scheduledQuestions") },
  handler: async (ctx, args) => {
    const { companyId } = ctx;
    const question = await ctx.db.get(args.questionId);
    if (!question || question.companyId !== companyId) throw new Error("That question could not be found.");
    await ctx.db.delete(args.questionId);
  },
});

/** Questions due a run. Read by the dispatcher on the existing cron. */
export const getDueQuestions = internalQuery({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, args): Promise<Array<Doc<"scheduledQuestions">>> => {
    const due = await ctx.db
      .query("scheduledQuestions")
      .withIndex("by_active_next_run", (q) => q.eq("isActive", true).lte("nextRunAt", args.now))
      .take(args.limit);

    return due.filter((question) =>
      shouldRunWorkflowSchedule({
        intervalStr: question.intervalStr,
        lastRunTs: question.lastAskedAt,
        now: new Date(args.now),
      }),
    );
  },
});

/**
 * Record what came back, and tell somebody if it moved.
 *
 * Reports rather than judges: the platform says the answer changed and keeps
 * both, it does not decide whether the change is good. A first answer is
 * never a change, or every question would alert once on setup.
 */
export const recordAnswer = internalMutation({
  args: {
    questionId: v.id("scheduledQuestions"),
    answer: v.string(),
  },
  handler: async (ctx, args): Promise<{ changed: boolean }> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return { changed: false };

    const now = Date.now();
    const changed = hasAnswerChanged(question.lastAnswer, args.answer);

    await ctx.db.patch(args.questionId, {
      lastAnswer: args.answer,
      lastAskedAt: now,
      lastError: undefined,
      ...(changed ? { lastChangedAt: now } : {}),
      nextRunAt: getNextWorkflowScheduleRunAt({
        intervalStr: question.intervalStr,
        lastRunTs: now,
        now: new Date(now),
      }),
      updatedAt: now,
    });

    if (!changed) return { changed: false };

    await ctx.runMutation(internal.notifications.notifyUserInternal, {
      userId: question.ownerUserId,
      companyId: question.companyId,
      kind: "SCHEDULED_ANSWER_CHANGED",
      title: "An answer you are watching has changed",
      body: question.question,
      href: "/app/watching",
    });

    if (question.raisesTask) {
      await ctx.runMutation(internal.tasks.createTaskInternal, {
        companyId: question.companyId,
        title: `Check: ${question.question}`,
        detail: args.answer.slice(0, 1000),
        assigneeUserId: question.ownerUserId,
        createdBySource: "WORKFLOW",
        sourceUrl: "/app/watching",
      });
    }

    return { changed: true };
  },
});

/**
 * A run that failed is recorded and rescheduled rather than left silent.
 *
 * The previous answer is kept: a provider outage is not evidence that the
 * answer changed, and overwriting it would raise a false alert next time.
 */
export const recordFailure = internalMutation({
  args: { questionId: v.id("scheduledQuestions"), error: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return;

    const now = Date.now();
    await ctx.db.patch(args.questionId, {
      lastAskedAt: now,
      lastError: args.error.slice(0, 500),
      nextRunAt: getNextWorkflowScheduleRunAt({
        intervalStr: question.intervalStr,
        lastRunTs: now,
        now: new Date(now),
      }),
      updatedAt: now,
    });
  },
});
