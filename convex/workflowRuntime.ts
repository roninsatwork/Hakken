"use node";

import { internalAction, action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseWorkflowEdges, parseWorkflowNodes } from "./utils/workflowTypes";
import { requireActionUser } from "./actionAuth";
import {
  buildActionRequest,
  buildActionResponseOutput,
  buildCodeNodeOutput,
  buildDatabaseNodeOutput,
  buildDatabaseOperationInput,
  buildEmailDeliveryOutput,
  buildEmailMessage,
  buildEmailSimulationOutput,
  buildMergeNodeOutput,
  buildWorkflowScheduleDecision,
  createWorkflowRuntimeContext,
  executeApprovalNode,
  executeBypassNode,
  executeIteratorNode,
  executeLogicNode,
  executeWaitNode,
  getRuntimeErrorMessage,
} from "./workflowRuntimeService";

async function executeAgentRuntimeNode(ctx: ActionCtx, args: { agentId: Id<"agents">; resolvedInput: string }) {
  const result: { output: string } = await ctx.runAction(internal.agentRuntime.executeAgentNode, {
    agentId: args.agentId,
    input: args.resolvedInput,
  });
  return result.output;
}

async function executeApiActionRuntimeNode(args: {
  currentNodeData: Record<string, unknown>;
  globalStatePayload: Record<string, unknown>;
}) {
  const { url, fetchOptions } = buildActionRequest(args.currentNodeData, args.globalStatePayload);
  const res = await fetch(url, fetchOptions);
  return buildActionResponseOutput(res.status, await res.text());
}

function executeCodeRuntimeNode(args: {
  currentNodeData: Record<string, unknown>;
  resolvedInput: string;
  executionState: string | undefined;
}) {
  return buildCodeNodeOutput({
    nodeData: args.currentNodeData,
    resolvedInput: args.resolvedInput,
    executionState: args.executionState,
  });
}

async function executeDatabaseRuntimeNode(ctx: ActionCtx, args: {
  currentNodeData: Record<string, unknown>;
  globalStatePayload: Record<string, unknown>;
  workflowId: Id<"workflows">;
}) {
  const { tableName, operation, docId, data } = buildDatabaseOperationInput(args.currentNodeData, args.globalStatePayload);
  const result = await ctx.runMutation(internal.workflowEngine.executeDatabaseOperation, {
    tableName,
    operation,
    docId,
    data,
    workflowId: args.workflowId,
  });

  return buildDatabaseNodeOutput({ operation, tableName, result });
}

async function executeMergeRuntimeNode(ctx: ActionCtx, args: {
  executionId: Id<"workflowExecutions">;
  nodeId: string;
  workflowEdges: string | undefined;
}) {
  const executionSteps = await ctx.runQuery(internal.workflowExecutions.getSteps, { executionId: args.executionId });
  const edges = parseWorkflowEdges(args.workflowEdges);
  return buildMergeNodeOutput({ nodeId: args.nodeId, executionSteps, edges });
}

async function executeEmailRuntimeNode(args: {
  currentNodeData: Record<string, unknown>;
  globalStatePayload: Record<string, unknown>;
}) {
  const { fromAddress, toAddresses, subject, body } = buildEmailMessage({
    nodeData: args.currentNodeData,
    globalStatePayload: args.globalStatePayload,
    defaultFromAddress: process.env.RESEND_FROM_EMAIL || "Sonae Automations <hello@ronins.co.uk>",
  });

  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not found in environment. Mocking Email dispatch:", { to: toAddresses, subject });
    return buildEmailSimulationOutput({ toAddresses, subject, body });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: toAddresses,
      subject,
      html: body,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend API Rejection: ${errText}`);
  }

  const data = await response.json();
  return buildEmailDeliveryOutput({ dispatchId: data, toAddresses, subject });
}

async function scheduleDownstreamNodes(ctx: ActionCtx, args: {
  workflowId: Id<"workflows">;
  executionId: Id<"workflowExecutions">;
  outputPayload: string;
  downstreamNodeIds: string[];
}) {
  const scheduleDecision = buildWorkflowScheduleDecision(args.outputPayload, args.downstreamNodeIds);
  if (scheduleDecision.halt) return;

  for (const schedule of scheduleDecision.schedules) {
    await ctx.scheduler.runAfter(schedule.delayMs, internal.workflowRuntime.executeNode, {
      workflowId: args.workflowId,
      executionId: args.executionId,
      nodeId: schedule.nodeId,
    });
  }
}

export const startWorkflow = internalAction({
  args: {
    workflowId: v.id("workflows"),
    executionId: v.id("workflowExecutions"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Initialize the Execution state and Global Payload
    const startingNodes = await ctx.runMutation(internal.workflowEngine.initExecution, {
      workflowId: args.workflowId,
      executionId: args.executionId,
      initialInput: args.initialInput,
    });

    // 2. Schedule the execution of all start nodes immediately
    for (const nodeId of startingNodes) {
      await ctx.scheduler.runAfter(0, internal.workflowRuntime.executeNode, {
        workflowId: args.workflowId,
        executionId: args.executionId,
        nodeId: nodeId
      });
    }
  },
});

export const executeNode = internalAction({
  args: {
    workflowId: v.id("workflows"),
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    let lockedStepId: Id<"workflowExecutionSteps"> | undefined = undefined;
    try {
      const execution = await ctx.runQuery(internal.workflowExecutions.getExecution, { id: args.executionId });
      if (!execution || execution.status === "FAILED") {
        console.warn(`Execution ${args.executionId} is failed or missing. Halting node ${args.nodeId}.`);
        return;
      }
      
      const workflow = await ctx.runQuery(internal.workflows.internalGet, { id: args.workflowId });
      if (!workflow) throw new Error("Workflow not found");

      const nodes = parseWorkflowNodes(workflow.nodes);
      const node = nodes.find((candidate) => candidate.id === args.nodeId);
      if (!node) throw new Error(`Node ${args.nodeId} not found in graph topology`);

      // Safely claim a PENDING execution step (prevents collision in iterator fan-outs)
      const claimedStep = await ctx.runMutation(internal.workflowExecutions.claimNextPendingStep, {
        executionId: args.executionId,
        nodeId: args.nodeId
      });

      if (!claimedStep) {
         console.warn(`No pending step found for node ${args.nodeId}. It might have already run.`);
         return; // Safely abort if another concurrent worker grabbed it
      }

      const stepInput = claimedStep.input || execution.state || "{}";
      lockedStepId = claimedStep.stepId;

      let outputPayload = "{}";
      const { currentNodeData, globalStatePayload, resolvedInput } = createWorkflowRuntimeContext({
        nodeData: node.data,
        stepInput,
        executionState: execution.state,
      });

      if (node.type === "agentNode" && currentNodeData._agentId) {
        outputPayload = await executeAgentRuntimeNode(ctx, {
          agentId: currentNodeData._agentId,
          resolvedInput,
        });
      } 
      else if (node.type === "actionNode") {
        try {
          outputPayload = await executeApiActionRuntimeNode({ currentNodeData, globalStatePayload });
        } catch (error: unknown) {
          throw new Error('API Action request failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "codeNode") {
        try {
          outputPayload = executeCodeRuntimeNode({
            currentNodeData,
            resolvedInput,
            executionState: execution.state,
          });
        } catch (error: unknown) {
          throw new Error("Safe code transformation failed: " + getRuntimeErrorMessage(error));
        }
      }

      else if (node.type === "logicNode") {
        try {
          outputPayload = executeLogicNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw new Error('Logic routing failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "databaseNode") {
        try {
          outputPayload = await executeDatabaseRuntimeNode(ctx, {
            currentNodeData,
            globalStatePayload,
            workflowId: args.workflowId,
          });
        } catch (error: unknown) {
          throw new Error('Database Action failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "waitNode") {
        try {
          outputPayload = executeWaitNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw new Error('Wait config failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "approvalNode") {
        try {
          outputPayload = executeApprovalNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw new Error('Approval execution failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "iteratorNode") {
        try {
          outputPayload = executeIteratorNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw new Error('Iterator logic failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "mergeNode") {
        try {
          outputPayload = await executeMergeRuntimeNode(ctx, {
            executionId: args.executionId,
            nodeId: args.nodeId,
            workflowEdges: workflow.edges,
          });
        } catch(error: unknown) {
          throw new Error('Merge / Sync processing failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "emailNode") {
        try {
          outputPayload = await executeEmailRuntimeNode({
            currentNodeData,
            globalStatePayload,
          });
        } catch(error: unknown) {
             throw new Error("Email dispatch failed: " + getRuntimeErrorMessage(error));
        }
      }
      else {
        outputPayload = executeBypassNode({ nodeType: node.type, resolvedInput });
      }

      // Finalize the step, append to State memory, and find downstream tasks
      const downstreamNodesToSchedule = await ctx.runMutation(internal.workflowEngine.finalizeNodeStep, {
        executionId: args.executionId,
        nodeId: args.nodeId,
        stepId: lockedStepId,
        outputData: outputPayload,
      });

      await scheduleDownstreamNodes(ctx, {
        workflowId: args.workflowId,
        executionId: args.executionId,
        outputPayload,
        downstreamNodeIds: downstreamNodesToSchedule,
      });

    } catch (error: unknown) {
      console.error(`Workflow execution failed at node ${args.nodeId}:`, error);
      
      await ctx.runMutation(internal.workflowEngine.failNodeStep, {
        executionId: args.executionId,
        nodeId: args.nodeId,
        stepId: lockedStepId,
        error: getRuntimeErrorMessage(error),
      });
      // The fail mutation marks the global execution as FAILED, halting further steps
    }
  },
});

export const resumeApprovalStep = action({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    workflowId: v.id("workflows"),
    action: v.union(v.literal("APPROVED"), v.literal("REJECTED"))
  },
  handler: async (ctx, args) => {
    await requireActionUser(ctx, "Unauthorized");

    if (args.action === "REJECTED") {
        await ctx.runMutation(internal.workflowEngine.failNodeStep, {
            executionId: args.executionId,
            nodeId: args.nodeId,
            error: "Administrator explicitly rejected the operation. Branch terminated.",
        });
        return false;
    }

    // Manually force unlocked DAG path
    const downstreamNodesToSchedule = await ctx.runMutation(internal.workflowEngine.resumeNodeStep, {
      executionId: args.executionId,
      nodeId: args.nodeId,
    });

    for (const nextNodeId of downstreamNodesToSchedule) {
      await ctx.scheduler.runAfter(0, internal.workflowRuntime.executeNode, {
        workflowId: args.workflowId,
        executionId: args.executionId,
        nodeId: nextNodeId
      });
    }

    return true;
  }
});
