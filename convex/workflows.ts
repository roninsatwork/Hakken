import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalQuery, internalMutation, action, httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { validateWorkflowEdgesJson, validateWorkflowNodesJson } from "./utils/workflowTypes";
import { requireSuperAdmin } from "./authz";
import { requireActionSuperAdmin } from "./actionAuth";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH = 20_000;

function workflowInputTooLargeResponse() {
  return new Response(JSON.stringify({
    error: `Workflow input cannot exceed ${PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH} characters.`,
  }), {
    status: 413,
    headers: { "Content-Type": "application/json" },
  });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized: System level clearance required.", "Unauthenticated Admin Request");

    return await ctx.db.query("workflows").order("desc").take(10000);
  },
});

export const getPaginatedWorkflows = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized: System level clearance required.", "Unauthenticated Admin Request");

    const searchTerm = args.searchTerm?.trim();

    return searchTerm
      ? await ctx.db
        .query("workflows")
        .withSearchIndex("search_name", (q) => q.search("name", searchTerm))
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("workflows")
        .withIndex("by_createdAt")
        .order("desc")
        .paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

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
    const { userId } = await requireSuperAdmin(ctx);

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
      actorId: userId,
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
    const { userId } = await requireSuperAdmin(ctx);

    const { id, ...updates } = args;

    const workflow = await ctx.db.get(id);
    if (!workflow) throw new Error("Workflow not found");

    let webhookSecret = workflow.webhookSecret;
    if ((updates.triggerType === "WEBHOOK" || (workflow.triggerType === "WEBHOOK" && !updates.triggerType)) && !webhookSecret) {
       webhookSecret = crypto.randomUUID();
    }
    
    const parsedNodes = args.nodes ? validateWorkflowNodesJson(args.nodes) : undefined;
    if (args.edges) validateWorkflowEdgesJson(args.edges);

    await ctx.db.patch(id, { 
      ...updates,
      ...(webhookSecret && { webhookSecret }),
      updatedAt: Date.now()
    });
    
    // Sync Scheduling Table
    if (parsedNodes) {
      const triggerNode = parsedNodes.find((node) => node.type === 'triggerNode');
      const triggerType = triggerNode?.data?._triggerType || 'MANUAL';
      
      const existingSchedule = await ctx.db.query("schedules")
        .withIndex("by_workflow", q => q.eq("workflowId", id))
        .first();

      if (triggerType === 'SCHEDULE') {
        const intervalStr = triggerNode?.data?._scheduleInterval || 'daily';
        const isActive = args.isActive !== false;
        const nextRunAt = isActive
          ? getNextWorkflowScheduleRunAt({
              intervalStr,
              lastRunTs: existingSchedule?.lastRunTs,
              now: new Date(),
            })
          : undefined;
        if (existingSchedule) {
          await ctx.db.patch(existingSchedule._id, { intervalStr, isActive, nextRunAt });
        } else {
          await ctx.db.insert("schedules", {
            name: `Workflow ${id} Schedule`,
            workflowId: id,
            intervalStr,
            isActive,
            nextRunAt,
            createdBy: userId,
            createdAt: Date.now(),
          });
        }
      } else {
        if (existingSchedule) {
           await ctx.db.delete(existingSchedule._id);
        }
      }
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_WORKFLOW",
      actorId: userId,
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
    const { userId } = await requireSuperAdmin(ctx);

    const workflow = await ctx.db.get(args.id);

    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      actionType: "DELETE_WORKFLOW",
      actorId: userId,
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
    const { userId } = await requireSuperAdmin(ctx);

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

export const createPublicWorkflowRunInternal = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    companyId: v.id("companies"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ executionId: Id<"workflowExecutions">; status: "RUNNING" }> => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow || !workflow.isActive || workflow.triggerType !== "WEBHOOK") {
      throw new Error("Workflow not found or not configured for public triggers.");
    }
    if (workflow.companyId !== args.companyId) {
      throw new Error("Workflow not found or not configured for public triggers.");
    }

    const initialInput = args.initialInput?.trim();
    if (initialInput && initialInput.length > PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH) {
      throw new Error(`Workflow input cannot exceed ${PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH} characters.`);
    }

    const executionId = await ctx.runMutation(internal.workflowExecutions.createExecution, {
      workflowId: args.workflowId,
      companyId: args.companyId,
      triggerType: "WEBHOOK",
      startedBy: workflow.createdBy,
    });

    await ctx.scheduler.runAfter(0, internal.workflowRuntime.startWorkflow, {
      workflowId: args.workflowId,
      executionId,
      initialInput,
    });

    return { executionId, status: "RUNNING" };
  },
});

export const runManualSync = action({
  args: {
    workflowId: v.id("workflows"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    await requireActionSuperAdmin(ctx, "Unauthorized", "Unauthenticated");

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

export const handleWebhook = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const workflowId = url.searchParams.get("workflowId");

  if (!workflowId) {
    return new Response(JSON.stringify({ error: "Missing workflowId parameter" }), { status: 400 });
  }

  try {
    const workflow = await ctx.runQuery(internal.workflows.internalGet, { id: workflowId as Id<"workflows"> });
    if (!workflow || !workflow.isActive || workflow.triggerType !== 'WEBHOOK') {
       return new Response(JSON.stringify({ error: "Workflow not found or not configured for webhooks" }), { status: 404 });
    }

    // 🛡️ SECURITY: Webhook secret verification (prevent trigger spoofing)
    // Enforce webhook secret strictly via headers (x-sonae-secret), completely omitting URL param checking to avoid credential leak via proxy logs.
    const secretHeader = request.headers.get("x-sonae-secret");
    const providedSecret = secretHeader || "";

    const expectedSecret = workflow.webhookSecret || "";
    const isSecretValid = expectedSecret !== "" && constantTimeEqual(providedSecret, expectedSecret);

    if (!isSecretValid) {
       return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing webhook secret" }), { status: 401 });
    }

    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    if (contentLength !== undefined && Number.isFinite(contentLength) && contentLength > PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH) {
      return workflowInputTooLargeResponse();
    }

    const payload = await request.text();
    if (payload.length > PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH) {
      return workflowInputTooLargeResponse();
    }
    
    const executionId = await ctx.runMutation(internal.workflowExecutions.createExecution, {
      workflowId: workflow._id,
      companyId: workflow.companyId,
      triggerType: "WEBHOOK",
      startedBy: workflow.createdBy, // Run as creator
    });

    // Schedule execution immediately 
    // We cannot reliably call runAction in httpAction inside some envs without scheduler
    // wait, runAction is fine too. Let's use scheduler to avoid blocking the webhook response
    
    await ctx.runAction(internal.workflowRuntime.startWorkflow, {
       workflowId: workflow._id,
       executionId: executionId,
       initialInput: payload,
    });

    return new Response(JSON.stringify({ success: true, executionId }), {
       status: 200,
       headers: { "Content-Type": "application/json" }
     });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), { status: 500 });
  }
});

export const getWebhookSecret = query({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw new Error("Workflow not found");

    return workflow.webhookSecret || null;
  },
});
