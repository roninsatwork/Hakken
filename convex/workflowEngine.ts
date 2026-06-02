import { v, ConvexError } from "convex/values";
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
import { shouldRunWorkflowSchedule } from "./workflowScheduleService";

const allowedWorkflowTables = [
  "properties",
  "threads",
  "messages",
  "widgets",
  "knowledgeDocuments",
  "knowledgeChunks",
  "aiRules",
  "agentLogs",
  "agentTransactions",
  "arcadeScores",
  "salesReports",
] as const;

type WorkflowDbTable = (typeof allowedWorkflowTables)[number];
type TenantScopedRecord = { companyId?: Id<"companies"> };

const WORKFLOW_DB_SELECT_LIMIT = 100;
const ACTIVE_WORKFLOW_SCHEDULE_DISPATCH_LIMIT = 500;

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
    if (!workflow) throw new Error("Workflow not found");

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
              input: JSON.stringify(payload),
              status: "PENDING",
              startedAt: Date.now(),
            });
        }

        readyToSchedule.push(dId);
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
    if (!execution || execution.status !== "RUNNING") throw new Error("Execution is not running");

    const step = await getLatestExecutionStepByStatus(ctx, {
      executionId: args.executionId,
      nodeId: args.nodeId,
      status: "PENDING_APPROVAL",
    });

    if (!step || step.status !== "PENDING_APPROVAL") throw new Error("Step is not pending approval");

    // We manually push an empty "approved" flag so that downstream nodes unlock
    return await processNodeFinalization(ctx, {
      executionId: args.executionId,
      nodeId: args.nodeId,
      outputData: JSON.stringify({ _system: { approved: true, fromHalt: true } })
    });
  }
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

export const executeDatabaseOperation = internalMutation({
  args: {
    tableName: v.string(),
    operation: v.union(v.literal("INSERT"), v.literal("UPDATE"), v.literal("DELETE"), v.literal("SELECT")),
    docId: v.optional(v.string()),
    data: v.optional(v.any()),
    workflowId: v.id("workflows"),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) throw new ConvexError("Workflow not found.");

    const user = await ctx.db.get(workflow.createdBy);
    const table = args.tableName as WorkflowDbTable;

    if (!user || user.role !== "SUPER_ADMIN") {
      // 🛡️ BOLA Enforcer: Restrict non-SUPER_ADMIN workflows strictly to allowlisted tables
      if (!allowedWorkflowTables.includes(table)) {
        throw new ConvexError(`Unauthorized: Access to system table '${args.tableName}' is strictly restricted.`);
      }

      const companyId = user?.companyId;
      if (!companyId) {
        throw new ConvexError("Unauthorized: Workflow creator has no company tenant context.");
      }

      // Enforce tenant boundary on operations
      if (args.operation === "SELECT") {
        if (args.docId) {
          const doc = await ctx.db.get(args.docId as Id<WorkflowDbTable>) as TenantScopedRecord | null;
          if (!doc) return { error: "Document not found" };
          if (doc.companyId !== companyId) {
            throw new ConvexError("Unauthorized: Access denied to foreign company document.");
          }
          return doc;
        } else {
          const docs = await ctx.db.query(table).take(WORKFLOW_DB_SELECT_LIMIT);
          return docs.filter((doc) => "companyId" in doc && doc.companyId === companyId);
        }
      } else if (args.operation === "INSERT") {
        const insertData = args.data || {};
        if (insertData.companyId && insertData.companyId !== companyId) {
          throw new ConvexError("Unauthorized: Cannot insert records for a foreign company.");
        }
        insertData.companyId = companyId; // Force correct tenant ID
        const id = await ctx.db.insert(table, insertData);
        return { id };
      } else if (args.operation === "UPDATE") {
        if (!args.docId) throw new ConvexError("Document ID required for UPDATE");
        const doc = await ctx.db.get(args.docId as Id<WorkflowDbTable>) as TenantScopedRecord | null;
        if (!doc) throw new ConvexError("Document not found");
        if (doc.companyId !== companyId) {
          throw new ConvexError("Unauthorized: Cannot update a foreign company document.");
        }
        const updateData = args.data || {};
        if (updateData.companyId && updateData.companyId !== companyId) {
          throw new ConvexError("Unauthorized: Cannot modify company association.");
        }
        updateData.companyId = companyId; // Safeguard company Id mapping
        await ctx.db.patch(args.docId as Id<WorkflowDbTable>, updateData);
        return { id: args.docId };
      } else if (args.operation === "DELETE") {
        if (!args.docId) throw new ConvexError("Document ID required for DELETE");
        const doc = await ctx.db.get(args.docId as Id<WorkflowDbTable>) as TenantScopedRecord | null;
        if (!doc) throw new ConvexError("Document not found");
        if (doc.companyId !== companyId) {
          throw new ConvexError("Unauthorized: Cannot delete a foreign company document.");
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
            return await ctx.db.query(table).order("desc").take(WORKFLOW_DB_SELECT_LIMIT);
         }
      } else if (args.operation === "INSERT") {
        const id = await ctx.db.insert(table, args.data || {});
        return { id };
      } else if (args.operation === "UPDATE") {
         if (!args.docId) throw new Error("Document ID required for UPDATE");
         await ctx.db.patch(args.docId as Id<WorkflowDbTable>, args.data || {});
         return { id: args.docId };
      } else if (args.operation === "DELETE") {
         if (!args.docId) throw new Error("Document ID required for DELETE");
         await ctx.db.delete(args.docId as Id<WorkflowDbTable>);
         return { deletedId: args.docId };
      }
    }
  }
});

export const scheduleDispatcher = internalMutation({
  args: {},
  handler: async (ctx) => {
    const activeSchedules = await ctx.db
      .query("schedules")
      .withIndex("by_active_last_run", (q) => q.eq("isActive", true))
      .take(ACTIVE_WORKFLOW_SCHEDULE_DISPATCH_LIMIT);
    const activeWorkflowSchedules = activeSchedules.filter(s => s.workflowId);
    
    const nowObj = new Date();
    const now = nowObj.getTime();

    for (const schedule of activeWorkflowSchedules) {
        if (!schedule.workflowId) continue;
        
        const shouldRun = shouldRunWorkflowSchedule({
            intervalStr: schedule.intervalStr,
            lastRunTs: schedule.lastRunTs,
            now: nowObj,
        });
        
        if (shouldRun) {
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
                lastRunTs: now
             });
        }
    }
  }
});
