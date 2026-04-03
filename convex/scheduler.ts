import { v } from "convex/values";
import { mutation, query, action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getSchedules = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    
    // We fetch all schedules. Assume admin access or scoped later.
    const schedules = await ctx.db.query("schedules").order("desc").collect();
    
    // Enrich with workflow names
    return await Promise.all(
      schedules.map(async (s) => {
        const wf = await ctx.db.get(s.workflowId);
        return {
          ...s,
          workflowName: wf?.name || "Deleted Workflow"
        };
      })
    );
  },
});

export const createSchedule = mutation({
  args: {
    name: v.string(),
    workflowId: v.id("workflows"),
    intervalStr: v.string(), // e.g. "daily", "weekly"
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await ctx.db.insert("schedules", {
      name: args.name,
      workflowId: args.workflowId,
      intervalStr: args.intervalStr,
      isActive: args.isActive,
      createdAt: Date.now(),
      createdBy: userId,
    });
  },
});

export const getSchedule = query({
  args: { scheduleId: v.id("schedules") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    return await ctx.db.get(args.scheduleId);
  },
});

export const updateSchedule = mutation({
  args: {
    scheduleId: v.id("schedules"),
    name: v.string(),
    workflowId: v.id("workflows"),
    intervalStr: v.string(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.scheduleId, {
      name: args.name,
      workflowId: args.workflowId,
      intervalStr: args.intervalStr,
      isActive: args.isActive,
    });
    return true;
  },
});

export const toggleSchedule = mutation({
  args: {
    scheduleId: v.id("schedules"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.scheduleId, {
      isActive: args.isActive
    });
    return true;
  },
});

export const deleteSchedule = mutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.delete(args.scheduleId);
    return true;
  },
});

export const manualRunWorkflow = mutation({
  args: {
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Create execution log entry
    const executionId = await ctx.db.insert("workflowExecutions", {
      workflowId: args.workflowId,
      status: "RUNNING",
      triggerType: "MANUAL",
      startedAt: Date.now(),
      startedBy: userId,
    });

    // In a real execution environment, we would queue the workflow runtime here:
    // await ctx.scheduler.runAfter(0, internal.workflowRuntime.executeNodeGraph, { workflowId: args.workflowId, executionId });

    // For now, since the actual workflow execution engine is deeply tied to the visual nodes,
    // we simply simulate a successful run to prove the logging works.
    await ctx.scheduler.runAfter(2000, internal.scheduler.completeSimulation, {
       executionId,
       success: true
    });

    return executionId;
  },
});

export const completeSimulation = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, {
      status: args.success ? "SUCCESS" : "FAILED",
      completedAt: Date.now(),
      state: JSON.stringify({ note: "Autonomous backend heartbeat succeeded." })
    });
  }
});

// For Logs View
export const getWorkflowExecutions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const execs = await ctx.db.query("workflowExecutions").order("desc").take(50);
    
    // Enrich
    return await Promise.all(
      execs.map(async (e) => {
        const wf = await ctx.db.get(e.workflowId);
        const user = await ctx.db.get(e.startedBy);
        return {
          ...e,
          workflowName: wf?.name || "Deleted Workflow",
          startedByName: user?.name || user?.email || "System"
        };
      })
    );
  }
});

export const getWorkflowExecution = query({
  args: { executionId: v.id("workflowExecutions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const exec = await ctx.db.get(args.executionId);
    if (!exec) return null;

    const wf = await ctx.db.get(exec.workflowId);
    const user = await ctx.db.get(exec.startedBy);

    return {
      ...exec,
      workflowName: wf?.name || "Deleted Workflow",
      startedByName: user?.name || user?.email || "System"
    };
  }
});
