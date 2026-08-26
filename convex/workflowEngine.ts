import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  parseWorkflowEdges,
  parseWorkflowNodes,
  parseWorkflowOutput,
  parseWorkflowState,
  type WorkflowStatePayload,
} from "./utils/workflowTypes";
import { getNextWorkflowScheduleRunAt, shouldRunWorkflowSchedule } from "./workflowScheduleService";
import { resolveRunObjective } from "./agentObjectiveService";
import {
  APPROVAL_EXPIRY_CONFIG_KEY,
  getApprovalExpiredMessage,
  isApprovalExpired,
  parseApprovalExpiryConfig,
} from "./approvalExpiryService";
import { appError } from "./utils/appError";

/**
 * Maximum items an iterator node may fan out to in a single execution.
 * Each item becomes its own PENDING step and its own scheduled worker, so this
 * bounds both database writes and scheduler pressure for one node.
 */
export const MAX_ITERATOR_FAN_OUT = 100;

const allowedWorkflowTables = [
  // template:remove:start properties
  "properties",
  // template:remove:end
  "threads",
  "messages",
  "widgets",
  "knowledgeDocuments",
  "knowledgeChunks",
  "aiRules",
  "agentLogs",
  "agentTransactions",
  // template:remove:start arcade
  "arcadeScores",
  // template:remove:end
  // template:remove:start salesReports
  "salesReports",
  // template:remove:end
] as const;

type WorkflowDbTable = (typeof allowedWorkflowTables)[number];
type TenantScopedRecord = { companyId?: Id<"companies"> };
type WorkflowDbSelectQuery = {
  indexName: string;
  equals: Array<{ field: string; value: unknown }>;
  order: "asc" | "desc";
  limit: number;
};

const WORKFLOW_DB_SELECT_LIMIT = 100;
const ACTIVE_WORKFLOW_SCHEDULE_DISPATCH_LIMIT = 500;
/** One sweep's worth. The cron runs every 15 minutes, so a backlog drains fast. */
const WORKFLOW_APPROVAL_EXPIRY_SWEEP_LIMIT = 100;

function getQueryValue(query: WorkflowDbSelectQuery, field: string) {
  return query.equals.find((filter) => filter.field === field)?.value;
}

function getRequiredStringQueryValue(query: WorkflowDbSelectQuery, field: string) {
  const value = getQueryValue(query, field);
  if (typeof value !== "string" || value.trim() === "") {
    throw appError("INVALID_INPUT", `Database SELECT index '${query.indexName}' requires string filter '${field}'.`);
  }
  return value;
}

function getSelectLimit(query: WorkflowDbSelectQuery) {
  if (!Number.isFinite(query.limit) || query.limit < 1 || query.limit > WORKFLOW_DB_SELECT_LIMIT) {
    throw appError("INVALID_INPUT", `Database SELECT limit must be between 1 and ${WORKFLOW_DB_SELECT_LIMIT}.`);
  }
  return Math.floor(query.limit);
}

function getWorkflowCompanyFilter(query: WorkflowDbSelectQuery, workflowCompanyId: Id<"companies"> | undefined) {
  const requestedCompanyId = getQueryValue(query, "companyId");
  if (typeof requestedCompanyId !== "undefined" && typeof requestedCompanyId !== "string") {
    throw appError("INVALID_INPUT", "Database SELECT companyId filter must be a string.");
  }
  if (workflowCompanyId && requestedCompanyId && requestedCompanyId !== workflowCompanyId) {
    throw appError("UNAUTHORIZED", "Unauthorized: Cannot query a foreign company index.");
  }
  const companyId = requestedCompanyId || workflowCompanyId;
  if (!companyId) {
    throw appError("INVALID_INPUT", "Database SELECT requires an explicit companyId filter for this index.");
  }
  return companyId as Id<"companies">;
}

function ensureTenantRows<T extends TenantScopedRecord>(
  rows: T[],
  workflowCompanyId: Id<"companies"> | undefined
) {
  if (!workflowCompanyId) return rows;
  return rows.filter((row) => row.companyId === workflowCompanyId);
}

async function executeIndexedSelect(ctx: MutationCtx, args: {
  tableName: string;
  query: WorkflowDbSelectQuery | undefined;
  workflowCompanyId: Id<"companies"> | undefined;
  isSuperAdmin: boolean;
}) {
  if (!args.query) {
    throw appError("INVALID_INPUT", "Database SELECT requires a target document ID or an indexed query contract.");
  }

  const query = args.query;
  const limit = getSelectLimit(query);
  const order = query.order;

  switch (args.tableName) {
    // template:remove:start properties
    case "properties": {
      if (query.indexName === "by_company") {
        const companyId = getWorkflowCompanyFilter(query, args.isSuperAdmin ? undefined : args.workflowCompanyId);
        return await ctx.db
          .query("properties")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .order(order)
          .take(limit);
      }
      if (query.indexName === "by_rightmoveId") {
        const rows = await ctx.db
          .query("properties")
          .withIndex("by_rightmoveId", (q) => q.eq("rightmoveId", getRequiredStringQueryValue(query, "rightmoveId")))
          .take(limit);
        return ensureTenantRows(rows, args.isSuperAdmin ? undefined : args.workflowCompanyId);
      }
      if (query.indexName === "by_runId") {
        const rows = await ctx.db
          .query("properties")
          .withIndex("by_runId", (q) => q.eq("runId", getRequiredStringQueryValue(query, "runId")))
          .take(limit);
        return ensureTenantRows(rows, args.isSuperAdmin ? undefined : args.workflowCompanyId);
      }
      break;
    }
    // template:remove:end
    case "companies": {
      if (!args.isSuperAdmin) break;
      if (query.indexName === "by_name") {
        return await ctx.db
          .query("companies")
          .withIndex("by_name", (q) => q.eq("name", getRequiredStringQueryValue(query, "name")))
          .take(limit);
      }
      if (query.indexName === "by_plan") {
        return await ctx.db
          .query("companies")
          .withIndex("by_plan", (q) => q.eq("planId", getRequiredStringQueryValue(query, "planId") as Id<"plans">))
          .take(limit);
      }
      break;
    }
    case "threads": {
      if (query.indexName === "by_company") {
        const companyId = getWorkflowCompanyFilter(query, args.isSuperAdmin ? undefined : args.workflowCompanyId);
        return await ctx.db
          .query("threads")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .order(order)
          .take(limit);
      }
      if (query.indexName === "by_user") {
        const rows = await ctx.db
          .query("threads")
          .withIndex("by_user", (q) => q.eq("userId", getRequiredStringQueryValue(query, "userId") as Id<"users">))
          .order(order)
          .take(limit);
        return ensureTenantRows(rows, args.isSuperAdmin ? undefined : args.workflowCompanyId);
      }
      if (query.indexName === "by_widget") {
        const rows = await ctx.db
          .query("threads")
          .withIndex("by_widget", (q) => q.eq("widgetId", getRequiredStringQueryValue(query, "widgetId") as Id<"widgets">))
          .order(order)
          .take(limit);
        return ensureTenantRows(rows, args.isSuperAdmin ? undefined : args.workflowCompanyId);
      }
      break;
    }
    case "messages": {
      if (query.indexName === "by_thread") {
        const threadId = getRequiredStringQueryValue(query, "threadId") as Id<"threads">;
        const thread = await ctx.db.get(threadId);
        if (!thread) return [];
        if (!args.isSuperAdmin && thread.companyId !== args.workflowCompanyId) {
          throw appError("UNAUTHORIZED", "Unauthorized: Access denied to foreign company thread.");
        }
        return await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", threadId))
          .order(order)
          .take(limit);
      }
      if (query.indexName === "by_company_role_created") {
        const companyId = getWorkflowCompanyFilter(query, args.isSuperAdmin ? undefined : args.workflowCompanyId);
        const role = getRequiredStringQueryValue(query, "role");
        if (role !== "user" && role !== "assistant") {
          throw appError("INVALID_INPUT", "Database SELECT messages role must be 'user' or 'assistant'.");
        }
        return await ctx.db
          .query("messages")
          .withIndex("by_company_role_created", (q) => q.eq("companyId", companyId).eq("role", role))
          .order(order)
          .take(limit);
      }
      break;
    }
    case "knowledgeDocuments": {
      if (query.indexName === "by_company") {
        const companyId = getWorkflowCompanyFilter(query, args.isSuperAdmin ? undefined : args.workflowCompanyId);
        return await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_company", (q) => q.eq("companyId", companyId))
          .order(order)
          .take(limit);
      }
      if (query.indexName === "by_agent") {
        const rows = await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_agent", (q) => q.eq("agentId", getRequiredStringQueryValue(query, "agentId") as Id<"agents">))
          .order(order)
          .take(limit);
        return ensureTenantRows(rows, args.isSuperAdmin ? undefined : args.workflowCompanyId);
      }
      if (query.indexName === "by_thread") {
        const rows = await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_thread", (q) => q.eq("threadId", getRequiredStringQueryValue(query, "threadId") as Id<"threads">))
          .order(order)
          .take(limit);
        return ensureTenantRows(rows, args.isSuperAdmin ? undefined : args.workflowCompanyId);
      }
      if (query.indexName === "by_status") {
        if (!args.isSuperAdmin) {
          throw appError("UNAUTHORIZED", "Unauthorized: status-wide knowledge document queries require SUPER_ADMIN.");
        }
        const status = getRequiredStringQueryValue(query, "status");
        if (status !== "pending" && status !== "processing" && status !== "ready" && status !== "failed") {
          throw appError("INVALID_INPUT", "Database SELECT knowledge status is invalid.");
        }
        return await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order(order)
          .take(limit);
      }
      break;
    }
    case "knowledgeChunks": {
      if (query.indexName === "by_document") {
        const documentId = getRequiredStringQueryValue(query, "documentId") as Id<"knowledgeDocuments">;
        const document = await ctx.db.get(documentId);
        if (!document) return [];
        if (!args.isSuperAdmin && document.companyId !== args.workflowCompanyId) {
          throw appError("UNAUTHORIZED", "Unauthorized: Access denied to foreign company knowledge document.");
        }
        return await ctx.db
          .query("knowledgeChunks")
          .withIndex("by_document", (q) => q.eq("documentId", documentId))
          .take(limit);
      }
      break;
    }
    case "aiRules": {
      if (query.indexName === "by_company_created") {
        const companyId = getWorkflowCompanyFilter(query, args.isSuperAdmin ? undefined : args.workflowCompanyId);
        return await ctx.db
          .query("aiRules")
          .withIndex("by_company_created", (q) => q.eq("companyId", companyId))
          .order(order)
          .take(limit);
      }
      if (query.indexName === "by_agent_company_created") {
        const companyId = getWorkflowCompanyFilter(query, args.isSuperAdmin ? undefined : args.workflowCompanyId);
        return await ctx.db
          .query("aiRules")
          .withIndex("by_agent_company_created", (q) =>
            q.eq("agentId", getRequiredStringQueryValue(query, "agentId") as Id<"agents">).eq("companyId", companyId)
          )
          .order(order)
          .take(limit);
      }
      break;
    }
    case "users": {
      if (!args.isSuperAdmin) break;
      if (query.indexName === "by_company") {
        const companyId = getWorkflowCompanyFilter(query, undefined);
        return await ctx.db.query("users").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(limit);
      }
      if (query.indexName === "email") {
        return await ctx.db.query("users").withIndex("email", (q) => q.eq("email", getRequiredStringQueryValue(query, "email"))).take(limit);
      }
      break;
    }
    case "agents": {
      if (!args.isSuperAdmin) break;
      if (query.indexName === "by_active_created") {
        const isActive = getQueryValue(query, "isActive");
        if (typeof isActive !== "boolean") throw appError("INVALID_INPUT", "Database SELECT agents isActive filter must be boolean.");
        return await ctx.db.query("agents").withIndex("by_active_created", (q) => q.eq("isActive", isActive)).order(order).take(limit);
      }
      break;
    }
    case "aiTools": {
      if (!args.isSuperAdmin) break;
      if (query.indexName === "by_createdAt") {
        return await ctx.db.query("aiTools").withIndex("by_createdAt").order(order).take(limit);
      }
      break;
    }
  }

  throw appError("INVALID_INPUT", `Unsupported indexed SELECT contract '${args.tableName}.${query.indexName}'.`);
}

async function getLatestExecutionStep(
  ctx: MutationCtx,
  args: { executionId: Id<"workflowExecutions">; nodeId: string }
) {
  return await ctx.db
    .query("workflowExecutionSteps")
    .withIndex("by_execution_node_started", (q) => q.eq("executionId", args.executionId).eq("nodeId", args.nodeId))
    .order("desc")
    .first();
}

async function getLatestExecutionStepByStatus(
  ctx: MutationCtx,
  args: {
    executionId: Id<"workflowExecutions">;
    nodeId: string;
    status: Doc<"workflowExecutionSteps">["status"];
  }
) {
  return await ctx.db
    .query("workflowExecutionSteps")
    .withIndex("by_execution_node_status_started", (q) =>
      q.eq("executionId", args.executionId).eq("nodeId", args.nodeId).eq("status", args.status)
    )
    .order("desc")
    .first();
}

async function hasExecutionStepWithStatus(
  ctx: MutationCtx,
  args: { executionId: Id<"workflowExecutions">; status: Doc<"workflowExecutionSteps">["status"] }
) {
  const step = await ctx.db
    .query("workflowExecutionSteps")
    .withIndex("by_execution_status_started", (q) => q.eq("executionId", args.executionId).eq("status", args.status))
    .first();

  return step !== null;
}

export const initExecution = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    executionId: v.id("workflowExecutions"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) throw appError("NOT_FOUND", "Workflow not found");
    // Read so each step can carry the tenant. Steps are queried across executions
    // now, and a company filter cannot reach through to the parent.
    const execution = await ctx.db.get(args.executionId);

    const nodes = parseWorkflowNodes(workflow.nodes);
    const edges = parseWorkflowEdges(workflow.edges);

    if (nodes.length === 0) {
      await ctx.db.patch(args.executionId, {
        status: "SUCCESS",
        state: JSON.stringify({ message: "No nodes to execute" }),
        completedAt: Date.now()
      });
      return [];
    }

    // Initialize global payload with a trigger block
    const initialPayload = {
      trigger: parseWorkflowState(args.initialInput)
    };

    await ctx.db.patch(args.executionId, {
      state: JSON.stringify(initialPayload)
    });

    // Find starting nodes (nodes with no incoming edges)
    const targetNodes = new Set(edges.map((edge) => edge.target));
    const startingNodes = nodes.filter((node) => !targetNodes.has(node.id));

    // For each starting node, create a PENDING step
    for (const node of startingNodes) {
      await ctx.db.insert("workflowExecutionSteps", {
        executionId: args.executionId,
        nodeId: node.id,
        agentId: node.data?._agentId,
        companyId: execution?.companyId,
        input: JSON.stringify(initialPayload),
        status: "PENDING",
        startedAt: Date.now(),
      });
    }

    return startingNodes.map((node) => node.id);
  },
});

// Core logic extracted so multiple mutations can call it without nesting ctx.runMutation which is forbidden
async function processNodeFinalization(ctx: MutationCtx, args: { executionId: Id<"workflowExecutions">, nodeId: string, stepId?: Id<"workflowExecutionSteps">, outputData: string }) {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "RUNNING") return [];

    const workflow = await ctx.db.get(execution.workflowId!);
    if (!workflow) return [];

    const nodes = parseWorkflowNodes(workflow.nodes);
    const edges = parseWorkflowEdges(workflow.edges);

    let step: Doc<"workflowExecutionSteps"> | null | undefined = null;
    if (args.stepId) {
        step = await ctx.db.get(args.stepId);
    } else {
        step = await getLatestExecutionStep(ctx, args);
    }

    let nextStatus: Doc<"workflowExecutionSteps">["status"] = "SUCCESS";
    let halt = false;
    let evaluatedBranch: string | null = null;
    
    const parsedOut = parseWorkflowOutput(args.outputData);
    if (parsedOut._system?.halt) {
      nextStatus = "PENDING_APPROVAL";
      halt = true;
    }
    if (parsedOut.evaluated !== undefined && parsedOut.evaluated !== null) {
      evaluatedBranch = parsedOut.evaluated.toString();
    }

    if (step) {
      await ctx.db.patch(step._id, {
        status: nextStatus,
        output: args.outputData,
        completedAt: nextStatus === "SUCCESS" ? Date.now() : undefined,
      });
    }

    if (halt) return []; 

    const currentPayload = parseWorkflowState(execution.state);
    const nodeDataObj = parsedOut;
    if (!currentPayload.nodes) currentPayload.nodes = {};
    currentPayload.nodes[args.nodeId] = { output: nodeDataObj };

    await ctx.db.patch(args.executionId, {
        state: JSON.stringify(currentPayload)
    });

    let outgoingEdges = edges.filter((edge) => edge.source === args.nodeId);
    
    // Logic Router specifically pushes to explicit node IDs instead of unreliable edge string labels
    if (evaluatedBranch !== null) {
       outgoingEdges = outgoingEdges.filter((edge) => edge.target === evaluatedBranch);
    }
    const downstreamNodeIds = outgoingEdges.map((edge) => edge.target);

    const readyToSchedule: string[] = [];
    
    for (const dId of downstreamNodeIds) {
      const incomingEdges = edges.filter((edge) => edge.target === dId);
      let allDependenciesSatisfied = true;
      const nextNodeDef = nodes.find((node) => node.id === dId);

      if (nextNodeDef?.type === 'mergeNode' && nextNodeDef.data?._mergeConfig?.mode === 'WAIT_FOR_ANY') {
         allDependenciesSatisfied = false;
         for (const edge of incomingEdges) {
            const depStep = await getLatestExecutionStep(ctx, {
              executionId: args.executionId,
              nodeId: edge.source,
            });
              
            if (depStep && depStep.status === "SUCCESS") {
               allDependenciesSatisfied = true;
               break;
            }
         }

         // Block duplicate duplicate executions if WAIT_FOR_ANY already fired from a sister path
         if (allDependenciesSatisfied) {
            const existingMergeAttempt = await getLatestExecutionStep(ctx, {
              executionId: args.executionId,
              nodeId: dId,
            });
            if (existingMergeAttempt) {
               allDependenciesSatisfied = false; 
            }
         }
      } else {
         for (const edge of incomingEdges) {
            const depStep = await getLatestExecutionStep(ctx, {
              executionId: args.executionId,
              nodeId: edge.source,
            });
              
            if (!depStep || depStep.status !== "SUCCESS") {
              allDependenciesSatisfied = false;
              break;
            }
         }
      }

      if (allDependenciesSatisfied) {
        const nextNodeDef = nodes.find((node) => node.id === dId);
        
        let targetPayloads: WorkflowStatePayload[] = [currentPayload];

        // Native Fan-Out for Iterator Nodes
        if (nodeDataObj._system?.isIterator && Array.isArray(nodeDataObj.items)) {
           // Bound the fan-out explicitly. An iterator over an unbounded
           // upstream result would otherwise schedule one worker per item with
           // no ceiling. Fail loudly rather than silently truncating, so a
           // workflow never reports SUCCESS having processed part of its input.
           if (nodeDataObj.items.length > MAX_ITERATOR_FAN_OUT) {
              throw appError("INVALID_INPUT", `Iterator node ${args.nodeId} produced ${nodeDataObj.items.length} items, ` +
                `exceeding the ${MAX_ITERATOR_FAN_OUT} item fan-out limit.`);
           }
           targetPayloads = nodeDataObj.items.map((item, i) => ({
               ...currentPayload,
               nodes: {
                  ...currentPayload.nodes,
                  [args.nodeId]: { output: { item, index: i, items: nodeDataObj.items } }
               }
           }));
        }

        for (const payload of targetPayloads) {
            await ctx.db.insert("workflowExecutionSteps", {
              executionId: args.executionId,
              nodeId: dId,
              agentId: nextNodeDef?.data?._agentId,
              companyId: execution.companyId,
              input: JSON.stringify(payload),
              status: "PENDING",
              startedAt: Date.now(),
            });

            // One scheduled worker per PENDING step. `executeNode` claims
            // exactly one step via `claimNextPendingStep`, so scheduling the
            // node once for an N-item fan-out ran only the first item and left
            // the rest PENDING forever — which also kept the execution from
            // ever reaching SUCCESS.
            readyToSchedule.push(dId);
        }
      }
    }

    if (readyToSchedule.length === 0) {
      const hasIncompleteStep =
        (await hasExecutionStepWithStatus(ctx, { executionId: args.executionId, status: "PENDING" })) ||
        (await hasExecutionStepWithStatus(ctx, { executionId: args.executionId, status: "RUNNING" })) ||
        (await hasExecutionStepWithStatus(ctx, { executionId: args.executionId, status: "PENDING_APPROVAL" }));

      if (!hasIncompleteStep) {
        await ctx.db.patch(args.executionId, {
            status: "SUCCESS",
            completedAt: Date.now()
        });
      }
    }

    return readyToSchedule;
}

export const finalizeNodeStep = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    stepId: v.optional(v.id("workflowExecutionSteps")),
    outputData: v.string(), 
  },
  handler: async (ctx, args) => processNodeFinalization(ctx, args)
});

export const resumeNodeStep = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    // Manually force a PENDING_APPROVAL step to DONE and resume downstream
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "RUNNING") throw appError("CONFLICT", "Execution is not running");

    const step = await getLatestExecutionStepByStatus(ctx, {
      executionId: args.executionId,
      nodeId: args.nodeId,
      status: "PENDING_APPROVAL",
    });

    if (!step || step.status !== "PENDING_APPROVAL") throw appError("CONFLICT", "Step is not pending approval");

    // Resume with the node's *own* output, marked approved.
    //
    // This used to finalize with a bare `{_system:{approved,fromHalt}}`, which
    // overwrote the step's stored output and published that placeholder into
    // `execution.state` under this node. So the approval node's `message` and
    // `previewData` were destroyed at the moment of approval, and any downstream
    // template reading `{{nodes.<id>.output.previewData}}` resolved to nothing —
    // which means the preview field offered in the config drawer broke the first
    // time anyone used it.
    const haltedOutput = parseWorkflowOutput(step.output ?? "{}");
    const resumedOutput = {
      ...haltedOutput,
      _system: {
        ...(haltedOutput._system ?? {}),
        // The halt is over, so it must not read as still halted.
        halt: false,
        approved: true,
        fromHalt: true,
      },
    };

    return await processNodeFinalization(ctx, {
      executionId: args.executionId,
      nodeId: args.nodeId,
      stepId: step._id,
      outputData: JSON.stringify(resumedOutput),
    });
  }
});

/**
 * Refuse a halted approval step.
 *
 * Its own mutation rather than a call to `failNodeStep` with no `stepId`. That
 * fallback resolves the *latest* step for the node in any status, which on a
 * fanned-out iterator node is not necessarily the one waiting for a decision — so
 * a rejection could mark a completed sibling as failed and leave the halted step
 * pending for ever. Resolving by status, the same way `resumeNodeStep` does, makes
 * that impossible rather than unlikely.
 *
 * Failing the whole execution is deliberate. The old error text read "Branch
 * terminated", which the code never did — it always failed the parent execution.
 * Partial-branch failure is a different feature, and inventing it here to make an
 * error message true would be the wrong way round.
 */
export const rejectNodeApproval = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const step = await getLatestExecutionStepByStatus(ctx, {
      executionId: args.executionId,
      nodeId: args.nodeId,
      status: "PENDING_APPROVAL",
    });
    if (!step) throw appError("CONFLICT", "Step is not pending approval");

    const now = Date.now();
    const error = args.reason?.trim()
      ? `An administrator refused this step: ${args.reason.trim()}`
      : "An administrator refused this step.";

    await ctx.db.patch(step._id, {
      status: "FAILED",
      error,
      completedAt: now,
    });

    await ctx.db.patch(args.executionId, {
      status: "FAILED",
      completedAt: now,
    });

    return step._id;
  },
});

/**
 * Give up on workflow steps nobody answered.
 *
 * A halted step waited indefinitely: the completeness check counts
 * `PENDING_APPROVAL` as incomplete, so the parent execution stayed `RUNNING` for
 * ever, and no cron or health signal ever looked at it. The only thing that
 * eventually touched one was the retention purge — minimum thirty days — which
 * deleted the execution outright, so it was never completed, never failed and
 * never reported.
 *
 * Shares the platform window with agent approvals, because it is the same
 * question: how long does the platform wait for a person before it acts.
 */
export const expireStaleWorkflowApprovals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", APPROVAL_EXPIRY_CONFIG_KEY))
      .first();
    const expiryHours = parseApprovalExpiryConfig(config?.value).expiryHours;

    const halted = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_status_started", (q) => q.eq("status", "PENDING_APPROVAL"))
      .take(WORKFLOW_APPROVAL_EXPIRY_SWEEP_LIMIT);

    let expiredExecutions = 0;
    const handled = new Set<string>();

    for (const step of halted) {
      if (!isApprovalExpired({ requestedAt: step.startedAt, now, expiryHours })) continue;
      if (handled.has(step.executionId)) continue;

      const execution = await ctx.db.get(step.executionId);
      // Anything already finished has been dealt with by something else.
      if (!execution || execution.status !== "RUNNING") continue;

      handled.add(step.executionId);
      expiredExecutions += 1;
      const error = getApprovalExpiredMessage(expiryHours);

      // Every halted step of that execution, not just this one: leaving siblings
      // waiting would keep the execution incomplete with nothing able to settle it.
      const executionSteps = await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution_status_started", (q) =>
          q.eq("executionId", step.executionId).eq("status", "PENDING_APPROVAL"))
        .take(WORKFLOW_APPROVAL_EXPIRY_SWEEP_LIMIT);

      for (const stale of executionSteps) {
        await ctx.db.patch(stale._id, {
          status: "FAILED",
          error,
          completedAt: now,
        });
      }

      await ctx.db.patch(step.executionId, {
        status: "FAILED",
        completedAt: now,
      });
    }

    return { examined: halted.length, expiredExecutions };
  },
});

export const failNodeStep = internalMutation({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    stepId: v.optional(v.id("workflowExecutionSteps")),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    let targetStep: Doc<"workflowExecutionSteps"> | null | undefined = null;
    if (args.stepId) {
        targetStep = await ctx.db.get(args.stepId);
    } else {
        targetStep = await getLatestExecutionStep(ctx, args);
    }

    if (targetStep) {
      await ctx.db.patch(targetStep._id, {
        status: "FAILED",
        error: args.error,
        completedAt: Date.now(),
      });
    }

    await ctx.db.patch(args.executionId, {
      status: "FAILED",
      completedAt: Date.now(),
    });
  },
});

export const linkAgentRunToStep = internalMutation({
  args: {
    stepId: v.id("workflowExecutionSteps"),
    agentRunId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stepId, {
      agentRunId: args.agentRunId,
    });
  },
});

export const executeDatabaseOperation = internalMutation({
  args: {
    tableName: v.string(),
    operation: v.union(v.literal("INSERT"), v.literal("UPDATE"), v.literal("DELETE"), v.literal("SELECT")),
    docId: v.optional(v.string()),
    query: v.optional(v.object({
      indexName: v.string(),
      equals: v.array(v.object({
        field: v.string(),
        value: v.any(),
      })),
      order: v.union(v.literal("asc"), v.literal("desc")),
      limit: v.number(),
    })),
    data: v.optional(v.any()),
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) throw appError("NOT_FOUND", "Workflow not found.");

    // A workflow whose creator was erased gets the tightest treatment rather
    // than the loosest: no user means no super-admin reach and no tenant, so
    // the checks below refuse it.
    const user = workflow.createdBy ? await ctx.db.get(workflow.createdBy) : null;
    const table = args.tableName as WorkflowDbTable;

    if (!user || user.role !== "SUPER_ADMIN") {
      // 🛡️ BOLA Enforcer: Restrict non-SUPER_ADMIN workflows strictly to allowlisted tables
      if (!allowedWorkflowTables.includes(table)) {
        throw appError("UNAUTHORIZED", `Unauthorized: Access to system table '${args.tableName}' is strictly restricted.`);
      }

      const companyId = user?.companyId;
      if (!companyId) {
        throw appError("UNAUTHORIZED", "Unauthorized: Workflow creator has no company tenant context.");
      }

      // Enforce tenant boundary on operations
      if (args.operation === "SELECT") {
        if (args.docId) {
          const doc = await ctx.db.get(args.docId as Id<WorkflowDbTable>) as TenantScopedRecord | null;
          if (!doc) return { error: "Document not found" };
          if (doc.companyId !== companyId) {
            throw appError("UNAUTHORIZED", "Unauthorized: Access denied to foreign company document.");
          }
          return doc;
        } else {
          return await executeIndexedSelect(ctx, {
            tableName: args.tableName,
            query: args.query,
            workflowCompanyId: companyId,
            isSuperAdmin: false,
          });
        }
      } else if (args.operation === "INSERT") {
        const insertData = args.data || {};
        if (insertData.companyId && insertData.companyId !== companyId) {
          throw appError("UNAUTHORIZED", "Unauthorized: Cannot insert records for a foreign company.");
        }
        insertData.companyId = companyId; // Force correct tenant ID
        const id = await ctx.db.insert(table, insertData);
        return { id };
      } else if (args.operation === "UPDATE") {
        if (!args.docId) throw appError("INVALID_INPUT", "Document ID required for UPDATE");
        const doc = await ctx.db.get(args.docId as Id<WorkflowDbTable>) as TenantScopedRecord | null;
        if (!doc) throw appError("NOT_FOUND", "Document not found");
        if (doc.companyId !== companyId) {
          throw appError("UNAUTHORIZED", "Unauthorized: Cannot update a foreign company document.");
        }
        const updateData = args.data || {};
        if (updateData.companyId && updateData.companyId !== companyId) {
          throw appError("UNAUTHORIZED", "Unauthorized: Cannot modify company association.");
        }
        updateData.companyId = companyId; // Safeguard company Id mapping
        await ctx.db.patch(args.docId as Id<WorkflowDbTable>, updateData);
        return { id: args.docId };
      } else if (args.operation === "DELETE") {
        if (!args.docId) throw appError("INVALID_INPUT", "Document ID required for DELETE");
        const doc = await ctx.db.get(args.docId as Id<WorkflowDbTable>) as TenantScopedRecord | null;
        if (!doc) throw appError("NOT_FOUND", "Document not found");
        if (doc.companyId !== companyId) {
          throw appError("UNAUTHORIZED", "Unauthorized: Cannot delete a foreign company document.");
        }
        await ctx.db.delete(args.docId as Id<WorkflowDbTable>);
        return { deletedId: args.docId };
      }
    } else {
      // SUPER_ADMIN has unrestricted database access
      if (args.operation === "SELECT") {
         if (args.docId) {
            const doc = await ctx.db.get(args.docId as Id<WorkflowDbTable>);
            return doc || { error: "Document not found" };
         } else {
            return await executeIndexedSelect(ctx, {
              tableName: args.tableName,
              query: args.query,
              workflowCompanyId: undefined,
              isSuperAdmin: true,
            });
         }
      } else if (args.operation === "INSERT") {
        const id = await ctx.db.insert(table, args.data || {});
        return { id };
      } else if (args.operation === "UPDATE") {
         if (!args.docId) throw appError("INVALID_INPUT", "Document ID required for UPDATE");
         await ctx.db.patch(args.docId as Id<WorkflowDbTable>, args.data || {});
         return { id: args.docId };
      } else if (args.operation === "DELETE") {
         if (!args.docId) throw appError("INVALID_INPUT", "Document ID required for DELETE");
         await ctx.db.delete(args.docId as Id<WorkflowDbTable>);
         return { deletedId: args.docId };
      }
    }
  }
});

export const scheduleDispatcher = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowObj = new Date();
    const now = nowObj.getTime();
    const activeSchedules = await ctx.db
      .query("schedules")
      .withIndex("by_active_next_run", (q) => q.eq("isActive", true).lte("nextRunAt", now))
      .take(ACTIVE_WORKFLOW_SCHEDULE_DISPATCH_LIMIT);
    for (const schedule of activeSchedules) {
        if (!schedule.workflowId && !schedule.agentId) continue;

        const shouldRun = shouldRunWorkflowSchedule({
            intervalStr: schedule.intervalStr,
            lastRunTs: schedule.lastRunTs,
            now: nowObj,
        });
        
        if (shouldRun) {
             if (schedule.agentId) {
                const agent = await ctx.db.get(schedule.agentId);
                if (!agent || agent.isActive === false) continue;
                const creator = schedule.createdBy ? await ctx.db.get(schedule.createdBy) : null;

                // The agent's standing job is the instruction, exactly as it
                // is on the manual path. This used to send the schedule's own
                // name — an agent woken at 3am and told "Scheduled run:
                // Nightly listings", which is a label, not an instruction. It
                // burned a model call working out that it had not been asked
                // anything, every night, and the standing job it did have was
                // never read. The manual path was fixed for this; this one
                // was missed.
                // Resolved the same way the manual path resolves it, through
                // the one helper both now share. These two drifted apart once
                // — the manual path was taught to use the agent's own job and
                // this one was not — and that drift is the bug.
                const objective = resolveRunObjective({
                  standingObjective: agent.standingObjective,
                  description: agent.description,
                });

                const agentRunId = await ctx.db.insert("agentRuns", {
                  agentId: schedule.agentId,
                  scheduleId: schedule._id,
                  triggerType: "SCHEDULE",
                  objective,
                  // The schedule's name is what this run is *about*; the
                  // objective is what it was told. They are different things,
                  // and the runs screen wants the short one.
                  title: schedule.name,
                  status: "QUEUED",
                  companyId: creator?.companyId,
                  userId: schedule.createdBy,
                  startedAt: now,
                  updatedAt: now,
                });

                const executionId = await ctx.db.insert("workflowExecutions", {
                  agentId: schedule.agentId,
                  agentRunId,
                  triggerType: "SCHEDULE",
                  status: "RUNNING",
                  startedAt: now,
                  startedBy: schedule.createdBy,
                });

                await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
                  agentId: schedule.agentId,
                  objective,
                  triggerType: "SCHEDULE",
                  runId: agentRunId,
                  scheduleId: schedule._id,
                  workflowExecutionId: executionId,
                  companyId: creator?.companyId,
                  userId: schedule.createdBy,
                });

                await ctx.db.patch(schedule._id, {
                  lastRunTs: now,
                  nextRunAt: getNextWorkflowScheduleRunAt({
                    intervalStr: schedule.intervalStr,
                    lastRunTs: now,
                    now: nowObj,
                  }),
                });
                continue;
             }

             if (!schedule.workflowId) continue;
             const workflow = await ctx.db.get(schedule.workflowId);
             if (!workflow || !workflow.isActive || workflow.triggerType !== "SCHEDULE") continue;

             const executionId = await ctx.db.insert("workflowExecutions", {
                workflowId: schedule.workflowId,
                triggerType: "SCHEDULE",
                status: "RUNNING",
                startedAt: now,
                startedBy: schedule.createdBy,
             });

             await ctx.scheduler.runAfter(0, internal.workflowRuntime.startWorkflow, {
                workflowId: schedule.workflowId,
                executionId: executionId,
                initialInput: "{}",
             });

             await ctx.db.patch(schedule._id, {
                lastRunTs: now,
                nextRunAt: getNextWorkflowScheduleRunAt({
                  intervalStr: schedule.intervalStr,
                  lastRunTs: now,
                  now: nowObj,
                }),
             });
        } else if (schedule.nextRunAt === undefined) {
             await ctx.db.patch(schedule._id, {
                nextRunAt: getNextWorkflowScheduleRunAt({
                  intervalStr: schedule.intervalStr,
                  lastRunTs: schedule.lastRunTs,
                  now: nowObj,
                }),
             });
        }
    }
  }
});
