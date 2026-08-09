import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const EXECUTION_STEP_LIST_LIMIT = 500;

export const createExecution = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    companyId: v.optional(v.id("companies")),
    triggerType: v.string(),
    // Optional since erasure can take the name off a workflow: the execution
    // still happened, and recording it as nobody is truer than refusing it.
    startedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("workflowExecutions", {
      workflowId: args.workflowId,
      companyId: args.companyId,
      triggerType: args.triggerType,
      status: "RUNNING",
      startedAt: Date.now(),
      startedBy: args.startedBy,
    });
  },
});

export const updateExecutionStatus = internalMutation({
  args: {
    id: v.id("workflowExecutions"),
    status: v.union(v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    state: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      ...(args.status !== "RUNNING" ? { completedAt: Date.now() } : {}),
    });
  },
});

export const upsertStep = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    agentId: v.optional(v.id("agents")),
    input: v.string(),
    output: v.optional(v.string()),
    // PENDING_APPROVAL is a state the engine produces, so a write path that
    // cannot express it is a write path that cannot round-trip its own data.
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("PENDING_APPROVAL"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution_node_started", (q) =>
        q.eq("executionId", args.executionId).eq("nodeId", args.nodeId)
      )
      .order("desc")
      .first();

    // A step waiting on a person has not completed. Stamping `completedAt` on it
    // would make it look finished to anything reading the timeline.
    const isOpen = args.status === "RUNNING" || args.status === "PENDING_APPROVAL";

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        ...(args.status === "RUNNING" && !existing.startedAt ? { startedAt: Date.now() } : {}),
        ...(isOpen ? {} : { completedAt: Date.now() }),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("workflowExecutionSteps", {
        ...args,
        startedAt: Date.now(),
        ...(isOpen ? {} : { completedAt: Date.now() }),
      });
    }
  },
});

export const getSteps = internalQuery({
  args: { executionId: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution_started", (q) => q.eq("executionId", args.executionId))
      .order("asc")
      .take(EXECUTION_STEP_LIST_LIMIT);
  },
});

export const getExecution = internalQuery({
  args: { id: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const claimNextPendingStep = internalMutation({
  args: { executionId: v.id("workflowExecutions"), nodeId: v.string() },
  handler: async (ctx, args) => {
    const pendingStep = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution_node_status_started", (q) =>
        q.eq("executionId", args.executionId).eq("nodeId", args.nodeId).eq("status", "PENDING")
      )
      .order("asc")
      .first();
      
    if (!pendingStep) return null;
    
    await ctx.db.patch(pendingStep._id, {
        status: "RUNNING",
        startedAt: Date.now()
    });

    return { stepId: pendingStep._id, input: pendingStep.input, attempt: pendingStep.attempt ?? 1 };
  }
});

/**
 * Put a transiently-failed step back in the queue for another try.
 *
 * Returning the step to PENDING re-arms `claimNextPendingStep` — the retry
 * flows through the exact claim path a first attempt does, so fan-out
 * collision safety applies unchanged. The error that caused the retry is kept
 * on the step: a retry that eventually succeeds should still show what it
 * survived. The parent execution is deliberately untouched — it is still
 * running, just not yet successful.
 */
export const requeueStepForRetry = internalMutation({
  args: {
    stepId: v.id("workflowExecutionSteps"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const step = await ctx.db.get(args.stepId);
    if (!step || step.status !== "RUNNING") return null;

    const nextAttempt = (step.attempt ?? 1) + 1;
    await ctx.db.patch(step._id, {
      status: "PENDING",
      attempt: nextAttempt,
      error: args.error,
    });
    return { nextAttempt };
  },
});
