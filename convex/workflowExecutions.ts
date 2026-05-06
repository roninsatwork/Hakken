import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const createExecution = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    triggerType: v.string(),
    startedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("workflowExecutions", {
      workflowId: args.workflowId,
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
    status: v.union(v.literal("PENDING"), v.literal("RUNNING"), v.literal("SUCCESS"), v.literal("FAILED")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingSteps = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution", (q) =>
        q.eq("executionId", args.executionId).eq("nodeId", args.nodeId)
      )
      .collect();
    const existing = existingSteps.sort((a,b) => b.startedAt - a.startedAt)[0];

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        ...(args.status === "RUNNING" && !existing.startedAt ? { startedAt: Date.now() } : {}),
        ...(args.status !== "RUNNING" ? { completedAt: Date.now() } : {}),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("workflowExecutionSteps", {
        ...args,
        startedAt: Date.now(),
        ...(args.status !== "RUNNING" ? { completedAt: Date.now() } : {}),
      });
    }
  },
});

export const getSteps = internalQuery({
  args: { executionId: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .take(10000);
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
    const steps = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId).eq("nodeId", args.nodeId))
      .collect();
      
    const pendingStep = steps
      .filter((s) => s.status === "PENDING")
      .sort((a, b) => a.startedAt - b.startedAt)[0]; // Oldest first to process sequentially
      
    if (!pendingStep) return null;
    
    await ctx.db.patch(pendingStep._id, {
        status: "RUNNING",
        startedAt: Date.now()
    });
    
    return { stepId: pendingStep._id, input: pendingStep.input };
  }
});
