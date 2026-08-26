import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalQuery, internalMutation, httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { validateWorkflowEdgesJson, validateWorkflowNodesJson } from "./utils/workflowTypes";
import { appError } from "./utils/appError";
import { superAdminAction, superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { getNextWorkflowScheduleRunAt } from "./workflowScheduleService";
import { constantTimeEqual } from "./utils/security";
import { getErrorMessage } from "./utils/lang";



const PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH = 20_000;

function workflowInputTooLargeResponse() {
  return new Response(JSON.stringify({
    error: `Workflow input cannot exceed ${PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH} characters.`,
  }), {
    status: 413,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A workflow as the editor is allowed to see it: everything but the secret.
 *
 * `webhookSecret` is what a caller signs a trigger with, and the schema's own
 * note says a leaked one can be replayed into unbounded runs. Both read
 * surfaces were handing whole rows out with it attached. Super-admin only, so
 * this was never wide open — but the editor has no use for the secret, and a
 * value that never leaves the server cannot leak from a screen.
 *
 * Declaring the shape is not enough on its own: a Convex return validator
 * refuses an unexpected field rather than dropping it, so the row is narrowed
 * on the way out and the validator makes forgetting that a failure.
 */
const clientWorkflowValidator = v.object({
  _id: v.id("workflows"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  isActive: v.boolean(),
  triggerType: v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE")),
  nodes: v.optional(v.string()),
  edges: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.optional(v.id("users")),
  companyId: v.optional(v.id("companies")),
  webhookWindowStart: v.optional(v.number()),
  webhookCountInWindow: v.optional(v.number()),
});

function toClientWorkflow(workflow: Doc<"workflows">) {
  const { webhookSecret: _webhookSecret, ...rest } = workflow;
  return rest;
}

export const list = superAdminQuery({
  args: {},
  returns: v.array(clientWorkflowValidator),
  handler: async (ctx) => {
    return (await ctx.db.query("workflows").order("desc").take(10000)).map(toClientWorkflow);
  },
});

export const getPaginatedWorkflows = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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

export const get = superAdminQuery({
  args: { id: v.id("workflows") },
  returns: clientWorkflowValidator,
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw appError("NOT_FOUND", "Workflow not found");

    return toClientWorkflow(workflow);
  },
});

export const internalGet = internalQuery({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw appError("NOT_FOUND", "Workflow not found");
    return workflow;
  },
});

export const createWorkflow = superAdminMutation({
  args: { 
    name: v.string(), 
    description: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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

export const updateWorkflow = superAdminMutation({
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
    const { userId } = ctx;

    const { id, ...updates } = args;

    const workflow = await ctx.db.get(id);
    if (!workflow) throw appError("NOT_FOUND", "Workflow not found");

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

export const deleteWorkflow = superAdminMutation({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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

export const triggerManualRun = superAdminMutation({
  args: { 
    id: v.id("workflows"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"workflowExecutions">> => {
    const { userId } = ctx;

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
      throw appError("NOT_FOUND", "Workflow not found or not configured for public triggers.");
    }
    if (workflow.companyId !== args.companyId) {
      throw appError("NOT_FOUND", "Workflow not found or not configured for public triggers.");
    }

    const initialInput = args.initialInput?.trim();
    if (initialInput && initialInput.length > PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH) {
      throw appError("INVALID_INPUT", `Workflow input cannot exceed ${PUBLIC_WORKFLOW_RUN_INPUT_MAX_LENGTH} characters.`);
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

export const runManualSync = superAdminAction({
  args: {
    workflowId: v.id("workflows"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
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

/** How many webhook triggers one workflow accepts per hour. Enough for any
 * integration this platform runs; a leaked secret stops being a blank cheque
 * (2026-08 audit). */
export const WORKFLOW_WEBHOOK_TRIGGERS_PER_HOUR = 60;

/**
 * The webhook's admission gate: one hourly window per workflow, counted on
 * the workflow row in the same shape as the kiosk's session window. Runs as
 * its own mutation so a refusal — and its single once-per-window audit row —
 * commits even though the HTTP action then answers 429.
 */
export const reserveWebhookTrigger = internalMutation({
  args: { workflowId: v.id("workflows") },
  handler: async (ctx, args): Promise<{ ok: boolean; retryAfterSeconds?: number }> => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) return { ok: false, retryAfterSeconds: 3600 };

    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const windowStart = workflow.webhookWindowStart ?? 0;
    const windowAge = now - windowStart;
    const inWindow = windowAge < hour ? workflow.webhookCountInWindow ?? 0 : 0;

    if (inWindow >= WORKFLOW_WEBHOOK_TRIGGERS_PER_HOUR) {
      if (inWindow === WORKFLOW_WEBHOOK_TRIGGERS_PER_HOUR) {
        await ctx.db.insert("auditLogs", {
          actionType: "RATE_LIMITED_WORKFLOW_WEBHOOK",
          entityId: args.workflowId.toString(),
          entityType: "workflows",
          companyId: workflow.companyId,
          timestamp: now,
          metadata: JSON.stringify({ perHour: WORKFLOW_WEBHOOK_TRIGGERS_PER_HOUR }),
        });
        await ctx.db.patch(workflow._id, { webhookCountInWindow: inWindow + 1 });
      }
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((hour - windowAge) / 1000)) };
    }

    await ctx.db.patch(workflow._id, {
      webhookWindowStart: inWindow === 0 ? now : windowStart,
      webhookCountInWindow: inWindow + 1,
    });
    return { ok: true };
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

    // Only after the secret has been proven: a caller without the secret must
    // not be able to spend a workflow's hourly allowance.
    const reservation = await ctx.runMutation(internal.workflows.reserveWebhookTrigger, {
      workflowId: workflow._id,
    });
    if (!reservation.ok) {
      return new Response(JSON.stringify({ error: "Too many webhook triggers for this workflow. Try again later." }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(reservation.retryAfterSeconds ?? 3600),
        },
      });
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
    return new Response(JSON.stringify({ error: getErrorMessage(error, "Unknown error") }), { status: 500 });
  }
});

export const getWebhookSecret = superAdminQuery({
  args: { id: v.id("workflows") },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.id);
    if (!workflow) throw appError("NOT_FOUND", "Workflow not found");

    return workflow.webhookSecret || null;
  },
});
