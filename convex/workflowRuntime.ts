"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseWorkflowEdges, parseWorkflowNodes } from "./utils/workflowTypes";
import { buildEmailFromAddress, resolveEnvFromAddress } from "./emailBrandingService";
import { renderEmail } from "./emailLayoutService";
import { sendResendEmail } from "./resendEmailService";
import { superAdminAction } from "./tenantFunctions";
import {
  buildActionRequest,
  buildActionResponseOutput,
  buildCodeNodeOutput,
  buildDatabaseNodeOutput,
  buildDatabaseOperationInput,
  buildEmailDeliveryOutput,
  buildEmailMessage,
  buildEmailSimulationOutput,
  buildTaskNodeOutput,
  buildWorkflowTask,
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
import { decideStepFailure } from "./workflowRetryService";
import { appError } from "./utils/appError";
import { fetchWorkflowAction } from "./utils/safeWorkflowHttp";

async function executeAgentRuntimeNode(ctx: ActionCtx, args: {
  agentId: Id<"agents">;
  resolvedInput: string;
  workflowId: Id<"workflows">;
  executionId: Id<"workflowExecutions">;
}) {
  const execution = await ctx.runQuery(internal.workflowExecutions.getExecution, { id: args.executionId });
  const workflow = await ctx.runQuery(internal.workflows.internalGet, { id: args.workflowId });
  const creator = workflow?.createdBy
    ? await ctx.runQuery(internal.users.getUserInternal, { userId: workflow.createdBy })
    : null;
  const result: { output: string; runId: Id<"agentRuns"> } = await ctx.runAction(internal.agentRuntime.runTriggeredAgentObjective, {
    agentId: args.agentId,
    objective: args.resolvedInput,
    triggerType: "WORKFLOW",
    workflowId: args.workflowId,
    companyId: creator?.companyId,
    userId: execution?.startedBy || workflow?.createdBy,
  });
  return result;
}

async function executeApiActionRuntimeNode(args: {
  currentNodeData: Record<string, unknown>;
  globalStatePayload: Record<string, unknown>;
}) {
  const { url, fetchOptions } = buildActionRequest(args.currentNodeData, args.globalStatePayload);
  const response = await fetchWorkflowAction(url, fetchOptions);
  return buildActionResponseOutput(response.status, response.body);
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
  const { tableName, operation, docId, query, data } = buildDatabaseOperationInput(args.currentNodeData, args.globalStatePayload);
  const result = await ctx.runMutation(internal.workflowEngine.executeDatabaseOperation, {
    tableName,
    operation,
    docId,
    query,
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

async function executeEmailRuntimeNode(ctx: ActionCtx, args: {
  executionId: Id<"workflowExecutions">;
  nodeId: string;
  currentNodeData: Record<string, unknown>;
  globalStatePayload: Record<string, unknown>;
}) {
  const emailBranding = await ctx.runQuery(internal.settings.getEmailBranding, {});
  const { fromAddress, toAddresses, subject, body } = buildEmailMessage({
    nodeData: args.currentNodeData,
    globalStatePayload: args.globalStatePayload,
    defaultFromAddress: buildEmailFromAddress({
      envFromAddress: resolveEnvFromAddress(process.env),
      fallbackName: `${emailBranding.platformName} Automations`,
      settings: emailBranding,
    }),
  });

  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not found in environment. Mocking Email dispatch:", { to: toAddresses, subject });
    return buildEmailSimulationOutput({ toAddresses, subject, body });
  }

  // The body is author-written and then template-substituted with run data, so
  // it is content rather than markup — it used to be sent as raw `html`, which
  // meant anything the workflow interpolated went straight into the message.
  const email = renderEmail(
    {
      kind: "Automation",
      verdict: subject,
      paragraphs: body.split(/\n{2,}/).filter((part) => part.trim().length > 0),
      footer: { lines: ["Sent by a workflow you or a colleague set up."] },
    },
    { platformName: emailBranding?.platformName }
  );

  const data = await sendResendEmail({
    apiKey: process.env.RESEND_API_KEY,
    operation: "workflowEmailNode",
    idempotencyKey: `workflow-email:${args.executionId}:${args.nodeId}`,
    payload: {
      from: fromAddress,
      to: toAddresses,
      subject,
      html: email.html,
      text: email.text,
    },
  });

  return buildEmailDeliveryOutput({ dispatchId: data, toAddresses, subject });
}

/**
 * Hand a job to a person from a workflow.
 *
 * The connector that has been sitting blocked in the outstanding list —
 * blocked only because Hakken had no concept of a task. The tenant comes from
 * the workflow's own owner, exactly as the agent node resolves it, so a
 * template cannot address work into another workspace.
 */
async function executeTaskRuntimeNode(ctx: ActionCtx, args: {
  workflowId: Id<"workflows">;
  currentNodeData: Record<string, unknown>;
  globalStatePayload: Record<string, unknown>;
}) {
  const workflow = await ctx.runQuery(internal.workflows.internalGet, { id: args.workflowId });
  const creator = workflow?.createdBy
    ? await ctx.runQuery(internal.users.getUserInternal, { userId: workflow.createdBy })
    : null;
  const companyId = creator?.companyId;
  if (!companyId) {
    throw appError("NO_ACTIVE_COMPANY", "This workflow has no workspace, so it cannot raise a task for anyone.");
  }

  const wanted = buildWorkflowTask({
    nodeData: args.currentNodeData,
    globalStatePayload: args.globalStatePayload,
  });

  const created: { taskId: Id<"tasks">; assigned: boolean } = await ctx.runMutation(
    internal.tasks.createTaskFromWorkflow,
    {
      companyId,
      title: wanted.title,
      detail: wanted.detail,
      assigneeEmail: wanted.assigneeEmail,
      dueAt: wanted.dueAt,
      workflowId: args.workflowId,
    },
  );

  return buildTaskNodeOutput({ taskId: created.taskId, title: wanted.title, assigned: created.assigned });
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
    // Read by the catch block's retry decision; set once known.
    let failedNodeType: string | undefined = undefined;
    let claimedAttempt = 1;
    // Both feed the retry decision's `firstAttemptMayHaveActed`: once the
    // node's real work has finished, an error from the bookkeeping after it
    // must not re-run the node; and an autonomous agent's tool writes skip
    // the approval gate, so a re-run could repeat them.
    let nodeWorkCompleted = false;
    let agentIsAutonomous = false;
    try {
      const execution = await ctx.runQuery(internal.workflowExecutions.getExecution, { id: args.executionId });
      if (!execution || execution.status === "FAILED") {
        console.warn(`Execution ${args.executionId} is failed or missing. Halting node ${args.nodeId}.`);
        return;
      }
      
      const workflow = await ctx.runQuery(internal.workflows.internalGet, { id: args.workflowId });
      if (!workflow) throw appError("NOT_FOUND", "Workflow not found");

      const nodes = parseWorkflowNodes(workflow.nodes);
      const node = nodes.find((candidate) => candidate.id === args.nodeId);
      if (!node) throw appError("NOT_FOUND", `Node ${args.nodeId} not found in graph topology`);
      failedNodeType = node.type;

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
      claimedAttempt = claimedStep.attempt;

      let outputPayload = "{}";
      const { currentNodeData, globalStatePayload, resolvedInput } = createWorkflowRuntimeContext({
        nodeData: node.data,
        stepInput,
        executionState: execution.state,
      });

      if (node.type === "agentNode" && currentNodeData._agentId) {
        const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: currentNodeData._agentId });
        agentIsAutonomous = agent?.autonomousToolExecution === true;
        const agentResult = await executeAgentRuntimeNode(ctx, {
          agentId: currentNodeData._agentId,
          resolvedInput,
          workflowId: args.workflowId,
          executionId: args.executionId,
        });
        // The agent has done whatever it was going to do; an error past this
        // point is bookkeeping, and a retry would run the agent again.
        nodeWorkCompleted = true;
        outputPayload = agentResult.output;
        await ctx.runMutation(internal.workflowEngine.linkAgentRunToStep, {
          stepId: lockedStepId,
          agentRunId: agentResult.runId,
        });
      }
      else if (node.type === "actionNode") {
        try {
          outputPayload = await executeApiActionRuntimeNode({ currentNodeData, globalStatePayload });
        } catch (error: unknown) {
          throw appError("UPSTREAM_FAILURE", 'API Action request failed: ' + getRuntimeErrorMessage(error));
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
          throw appError("UPSTREAM_FAILURE", "Safe code transformation failed: " + getRuntimeErrorMessage(error));
        }
      }

      else if (node.type === "logicNode") {
        try {
          outputPayload = executeLogicNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw appError("UPSTREAM_FAILURE", 'Logic routing failed: ' + getRuntimeErrorMessage(error));
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
          throw appError("UPSTREAM_FAILURE", 'Database Action failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "waitNode") {
        try {
          outputPayload = executeWaitNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw appError("UPSTREAM_FAILURE", 'Wait config failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "approvalNode") {
        try {
          outputPayload = executeApprovalNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw appError("UPSTREAM_FAILURE", 'Approval execution failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "iteratorNode") {
        try {
          outputPayload = executeIteratorNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw appError("UPSTREAM_FAILURE", 'Iterator logic failed: ' + getRuntimeErrorMessage(error));
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
          throw appError("UPSTREAM_FAILURE", 'Merge / Sync processing failed: ' + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "emailNode") {
        try {
          outputPayload = await executeEmailRuntimeNode(ctx, {
            executionId: args.executionId,
            nodeId: args.nodeId,
            currentNodeData,
            globalStatePayload,
          });
        } catch(error: unknown) {
             throw appError("UPSTREAM_FAILURE", "Email dispatch failed: " + getRuntimeErrorMessage(error));
        }
      }
      else if (node.type === "taskNode") {
        try {
          outputPayload = await executeTaskRuntimeNode(ctx, {
            workflowId: args.workflowId,
            currentNodeData,
            globalStatePayload,
          });
        } catch (error: unknown) {
          throw appError("UPSTREAM_FAILURE", "Raising a task failed: " + getRuntimeErrorMessage(error));
        }
      }
      else {
        outputPayload = executeBypassNode({ nodeType: node.type, resolvedInput });
      }
      nodeWorkCompleted = true;

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

      const errorMessage = getRuntimeErrorMessage(error);

      // A transient failure of a provably re-runnable node gets another try
      // (workflowRetryService.ts holds the policy). The retry goes back
      // through the normal claim path after a delay; anything else — terminal
      // error, unsafe node type, budget exhausted — fails as it always has.
      const decision = decideStepFailure({
        errorMessage,
        nodeType: failedNodeType,
        attemptJustFailed: claimedAttempt,
        firstAttemptMayHaveActed: nodeWorkCompleted || agentIsAutonomous,
      });

      if (decision.action === "retry" && lockedStepId) {
        const requeued = await ctx.runMutation(internal.workflowExecutions.requeueStepForRetry, {
          stepId: lockedStepId,
          error: errorMessage,
        });
        if (requeued) {
          try {
            await ctx.scheduler.runAfter(decision.delayMs, internal.workflowRuntime.executeNode, {
              workflowId: args.workflowId,
              executionId: args.executionId,
              nodeId: args.nodeId,
            });
            return;
          } catch (scheduleError: unknown) {
            // The step is requeued but nothing will come for it. Without this
            // it sits PENDING forever with the execution stuck RUNNING —
            // invisible to the review list. Fail it honestly instead.
            console.error(`Failed to schedule retry for node ${args.nodeId}:`, scheduleError);
          }
        }
        // The step was not requeueable (already finalized elsewhere) or the
        // retry could not be scheduled; fall through to the ordinary failure
        // so nothing is silently swallowed.
      }

      await ctx.runMutation(internal.workflowEngine.failNodeStep, {
        executionId: args.executionId,
        nodeId: args.nodeId,
        stepId: lockedStepId,
        error: errorMessage,
      });
      // The fail mutation marks the global execution as FAILED, halting further steps
    }
  },
});

/**
 * Sign off, or refuse, a workflow step halted by an approval node.
 *
 * Declared `superAdminAction` because it resumes a paused graph and can schedule
 * work that writes. It used to be `tenantAction`, whose guard is only "is
 * authenticated" — so any signed-in user of any role could resume or fail any
 * tenant's execution, while every other workflow function on the platform
 * required a super admin. Nothing enforced tenancy inside the handler either.
 *
 * The workflow is read from the execution rather than passed in. It was
 * previously an argument that nothing checked against the execution it claimed
 * to belong to, so a caller could name one workflow and resume a step from
 * another, scheduling downstream nodes against the wrong graph. An id that
 * cannot be supplied cannot disagree.
 */
export const resumeApprovalStep = superAdminAction({
  args: {
    executionId: v.id("workflowExecutions"),
    nodeId: v.string(),
    action: v.union(v.literal("APPROVED"), v.literal("REJECTED")),
    reason: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const execution = await ctx.runQuery(internal.workflowExecutions.getExecution, {
      id: args.executionId,
    });
    if (!execution) throw appError("NOT_FOUND", "Workflow execution not found");
    if (!execution.workflowId) throw appError("NOT_FOUND", "Workflow execution has no workflow");

    if (args.action === "REJECTED") {
        await ctx.runMutation(internal.workflowEngine.rejectNodeApproval, {
            executionId: args.executionId,
            nodeId: args.nodeId,
            reason: args.reason,
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
        workflowId: execution.workflowId,
        executionId: args.executionId,
        nodeId: nextNodeId
      });
    }

    return true;
  }
});
