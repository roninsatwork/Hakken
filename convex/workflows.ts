import { v } from "convex/values";
import { mutation, query, action, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated Admin Request");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized: System level clearance required.");
    }

    return await ctx.db.query("workflows").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated Admin Request");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw new Error("Workflow not found");

    return workflow;
  },
});

export const internalGet = internalQuery({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw new Error("Workflow not found");
    return workflow;
  },
});

export const createWorkflow = mutation({
  args: { 
    name: v.string(), 
    description: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const newWorkflowId = await ctx.db.insert("workflows", {
      name: args.name,
      description: args.description,
      isActive: true,
      triggerType: "MANUAL",
      nodes: "[]",
      edges: "[]",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
    });

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_WORKFLOW",
      actorId: userId as any,
      entityType: "workflows",
      entityId: newWorkflowId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ name: args.name })
    });

    return newWorkflowId;
  },
});

export const updateWorkflow = mutation({
  args: { 
    id: v.id("workflows"), 
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    triggerType: v.optional(v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE"))),
    nodes: v.optional(v.string()),
    edges: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const { id, ...updates } = args;
    
    await ctx.db.patch(id, { 
      ...updates,
      updatedAt: Date.now()
    });
    
    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_WORKFLOW",
      actorId: userId as any,
      entityType: "workflows",
      entityId: id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ updatedFields: Object.keys(updates) })
    });

    return id;
  },
});

export const deleteWorkflow = mutation({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const workflow = await ctx.db.get(args.id);

    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      actionType: "DELETE_WORKFLOW",
      actorId: userId as any,
      entityType: "workflows",
      entityId: args.id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ name: workflow?.name })
    });

    return true;
  },
});

export const triggerManualRun = mutation({
  args: { 
    id: v.id("workflows"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"workflowExecutions">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    // 1. Create Execution Record
    const executionId = await ctx.runMutation(internal.workflowExecutions.createExecution, {
      workflowId: args.id,
      triggerType: "MANUAL",
      startedBy: userId,
    });

    // 2. Schedule the execution in the background
    await ctx.scheduler.runAfter(0, internal.workflowRuntime.startWorkflow, {
      workflowId: args.id,
      executionId: executionId,
      initialInput: args.initialInput,
    });

    return executionId;
  },
});

export const runManualSync = action({
  args: {
    workflowId: v.id("workflows"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const user = await ctx.runQuery(api.users.getUserById, { id: userId as any });
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    // 1. Create execution record
    const executionId = await ctx.runMutation(api.workflows.triggerManualRun, {
      id: args.workflowId,
      initialInput: args.initialInput,
    });

    // 2. Run the workflow
    return await ctx.runAction(internal.workflowRuntime.startWorkflow, {
      workflowId: args.workflowId,
      executionId: executionId,
      initialInput: args.initialInput,
    });
  },
});
