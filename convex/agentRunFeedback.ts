import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";

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

export const upsertForRun = mutation({
  args: {
    runId: v.id("agentRuns"),
    rating: feedbackRatingValidator,
    labels: v.array(feedbackLabelValidator),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
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

export const getForRun = query({
  args: {
    runId: v.id("agentRuns"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    return await ctx.db
      .query("agentRunFeedback")
      .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getMineForAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    if (user.role === "ADMIN" && !user.companyId) {
      throw new Error("Unauthorized");
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

