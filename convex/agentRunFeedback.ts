import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { adminMutation, adminQuery, tenantMutation } from "./tenantFunctions";
import { paginationResultValidator } from "convex/server";
import { rowShape } from "./utils/rowShape";
import { assertAdminCanAccessCompany } from "./authz";
import { getSelfImprovementConfig } from "./selfImprovementConfig";
import { appError } from "./utils/appError";

const FEEDBACK_COMMENT_LIMIT = 2000;
const FEEDBACK_PAGE_LIMIT = 500;

const feedbackRatingValidator = v.union(
  v.literal("POSITIVE"),
  v.literal("NEGATIVE"),
  v.literal("NEUTRAL")
);

const feedbackLabelValidator = v.union(
  v.literal("GOOD_ANSWER"),
  v.literal("INCORRECT"),
  v.literal("MISSED_CONTEXT"),
  v.literal("WRONG_TOOL"),
  v.literal("BAD_TOOL_ARGS"),
  v.literal("UNSAFE_SUGGESTION"),
  v.literal("TOO_EXPENSIVE"),
  v.literal("TOO_SLOW"),
  v.literal("NEEDS_APPROVAL_POLICY_CHANGE"),
  v.literal("SHOULD_BECOME_EVAL")
);

function normalizeComment(comment?: string) {
  const trimmed = comment?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, FEEDBACK_COMMENT_LIMIT);
}

function uniqueLabels(labels: Array<
  | "GOOD_ANSWER"
  | "INCORRECT"
  | "MISSED_CONTEXT"
  | "WRONG_TOOL"
  | "BAD_TOOL_ARGS"
  | "UNSAFE_SUGGESTION"
  | "TOO_EXPENSIVE"
  | "TOO_SLOW"
  | "NEEDS_APPROVAL_POLICY_CHANGE"
  | "SHOULD_BECOME_EVAL"
>) {
  return Array.from(new Set(labels));
}

export const upsertForRun = adminMutation({
  args: {
    runId: v.id("agentRuns"),
    rating: feedbackRatingValidator,
    labels: v.array(feedbackLabelValidator),
    comment: v.optional(v.string()),
  },
  returns: v.id("agentRunFeedback"),
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND", "Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    const now = Date.now();
    const labels = uniqueLabels(args.labels);
    const comment = normalizeComment(args.comment);
    const existing = await ctx.db
      .query("agentRunFeedback")
      .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        labels,
        comment,
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "UPDATE_AGENT_RUN_FEEDBACK",
        entityId: existing._id,
        entityType: "agentRunFeedback",
        companyId: run.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          runId: args.runId,
          rating: args.rating,
          labels,
        }),
      });
      return existing._id;
    }

    const feedbackId = await ctx.db.insert("agentRunFeedback", {
      runId: args.runId,
      agentId: run.agentId,
      companyId: run.companyId,
      userId,
      rating: args.rating,
      labels,
      comment,
      source: "ADMIN",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_AGENT_RUN_FEEDBACK",
      entityId: feedbackId,
      entityType: "agentRunFeedback",
      companyId: run.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        runId: args.runId,
        rating: args.rating,
        labels,
      }),
    });

    return feedbackId;
  },
});

/**
 * The end-user's version of the same verdict (self-improvement plan,
 * Phase 3). Restricted to runs whose conversation the caller actually owns,
 * to the two ratings a thumbs control can express, and to the labels an end
 * user could mean. It lands in the same table so the run screens show
 * operator and user feedback side by side, told apart by `source`.
 */
export const upsertForRunAsEndUser = tenantMutation({
  args: {
    runId: v.id("agentRuns"),
    rating: v.union(v.literal("POSITIVE"), v.literal("NEGATIVE")),
    labels: v.array(v.union(
      v.literal("GOOD_ANSWER"),
      v.literal("INCORRECT"),
      v.literal("MISSED_CONTEXT")
    )),
    comment: v.optional(v.string()),
  },
  returns: v.id("agentRunFeedback"),
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    // The same switch that governs the chat rating controls: off means
    // collection stops, not just the buttons — a stale client that still
    // shows them must not keep writing.
    const config = await getSelfImprovementConfig(ctx.db);
    if (!config.endUserFeedback) throw appError("MODULE_DISABLED", "Feedback is switched off");

    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND", "Run not found");

    // Ownership, not role: the run was answering this person's conversation.
    const thread = run.threadId ? await ctx.db.get(run.threadId) : null;
    const ownsRun = run.userId === userId || (thread !== null && thread.userId === userId);
    if (!ownsRun) throw appError("UNAUTHORIZED", "Unauthorized");
    if (user.role !== "SUPER_ADMIN" && run.companyId && run.companyId !== ctx.companyId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
    }

    const now = Date.now();
    const labels = uniqueLabels(args.labels);
    const comment = normalizeComment(args.comment);
    const existing = await ctx.db
      .query("agentRunFeedback")
      .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        labels,
        comment,
        source: "END_USER",
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "UPDATE_AGENT_RUN_FEEDBACK",
        entityId: existing._id,
        entityType: "agentRunFeedback",
        companyId: run.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          runId: args.runId,
          rating: args.rating,
          labels,
          source: "END_USER",
        }),
      });
      return existing._id;
    }

    const feedbackId = await ctx.db.insert("agentRunFeedback", {
      runId: args.runId,
      agentId: run.agentId,
      companyId: run.companyId,
      userId,
      rating: args.rating,
      labels,
      comment,
      source: "END_USER",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_AGENT_RUN_FEEDBACK",
      entityId: feedbackId,
      entityType: "agentRunFeedback",
      companyId: run.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        runId: args.runId,
        rating: args.rating,
        labels,
        source: "END_USER",
      }),
    });
    return feedbackId;
  },
});

export const getForRun = adminQuery({
  args: {
    runId: v.id("agentRuns"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(rowShape.agentRunFeedback),
  handler: async (ctx, args) => {
    const { user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND", "Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    return await ctx.db
      .query("agentRunFeedback")
      .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getMineForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
  },
  returns: v.array(rowShape.agentRunFeedback),
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    if (user.role === "ADMIN" && !user.companyId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
    }

    const feedback = await ctx.db
      .query("agentRunFeedback")
      .withIndex("by_user_agent_updated", (q) => q.eq("userId", userId).eq("agentId", args.agentId))
      .order("desc")
      .take(FEEDBACK_PAGE_LIMIT);

    if (user.role === "SUPER_ADMIN") {
      return feedback;
    }

    return feedback.filter((entry) => entry.companyId === user.companyId);
  },
});

