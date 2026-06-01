"use node";

import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { resolveTemplate } from "./utils/templateParser";
import { validateSafeUrl } from "./utils/security";
import type { Id } from "./_generated/dataModel";
import { parseWorkflowEdges, parseWorkflowNodes } from "./utils/workflowTypes";
import { requireActionUser } from "./actionAuth";
import {
  buildMergeNodeOutput,
  createWorkflowRuntimeContext,
  executeApprovalNode,
  executeBypassNode,
  executeIteratorNode,
  executeLogicNode,
  executeWaitNode,
  getWorkflowSystemCommands,
  parseRuntimeJson,
  sanitizeForConvexValue,
} from "./workflowRuntimeService";

type HeaderConfig = {
  key?: string;
  value?: string;
};

type ActionConfig = {
  method?: string;
  url?: string;
  headers?: HeaderConfig[];
  body?: unknown;
};

type DatabaseConfig = {
  tableName?: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "SELECT";
  docId?: string;
};

type EmailConfig = {
  to?: string;
  from?: string;
  subject?: string;
  body?: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
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
        const result = await ctx.runAction(internal.agentRuntime.executeAgentNode, {
          agentId: currentNodeData._agentId,
          input: resolvedInput,
        });
        outputPayload = result.output;
      } 
      else if (node.type === "actionNode") {
        try {
          if (!node.data?._actionConfig) throw new Error("API Node is missing configuration");
          const config = resolveTemplate(node.data._actionConfig as ActionConfig, globalStatePayload);
          const method = config.method || 'GET';
          const url = config.url;
          if (!url) throw new Error("Missing URL for Action Node");
          // 🛡️ SECURITY: SSRF Prevention Shield
          validateSafeUrl(url, "Action Node");
          
          const headers: Record<string, string> = {};
          if (Array.isArray(config.headers)) {
             config.headers.forEach((h: HeaderConfig) => {
               if (h.key) headers[h.key] = h.value ?? "";
             });
          }

          const fetchOptions: RequestInit = { method, headers };
          
          const body = config.body;
          if (method !== 'GET' && method !== 'HEAD' && body) {
             fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : String(body);
          }
          
          const res = await fetch(url, fetchOptions);
          const text = await res.text();
          try { outputPayload = JSON.stringify({ status: res.status, data: JSON.parse(text) }); }
          catch { outputPayload = JSON.stringify({ status: res.status, data: text }); }
        } catch (error: unknown) {
          throw new Error('API Action request failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "codeNode") {
        try {
          const parseCtx = parseRuntimeJson(resolvedInput);
          
          // Fallback to safe templating resolution using the execution context
          let templatePayload = parseCtx;
          if (currentNodeData._inputTemplate && typeof currentNodeData._inputTemplate === "string") {
              const safeGlobalPayload = { input: parseCtx, execution: parseRuntimeJson(execution.state || "{}", {}) };
              templatePayload = resolveTemplate(currentNodeData._inputTemplate, safeGlobalPayload);
          }
          
          outputPayload = JSON.stringify(templatePayload);
        } catch (error: unknown) {
          throw new Error("Safe code transformation failed: " + getErrorMessage(error));
        }
      }

      else if (node.type === "logicNode") {
        try {
          outputPayload = executeLogicNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw new Error('Logic routing failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "databaseNode") {
        try {
          if (!node.data?._dbConfig) throw new Error("Database Node is missing configuration");
          const { tableName, operation, docId } = node.data._dbConfig as DatabaseConfig;
          if (!tableName) throw new Error("Database table not specified");
          
          let resolvedDocId = docId;
          if (docId) resolvedDocId = resolveTemplate(docId, globalStatePayload);

          let resolvedData: unknown = {};
          if (node.data._inputMapping && Object.keys(node.data._inputMapping).length > 0) {
             resolvedData = resolveTemplate(node.data._inputMapping, globalStatePayload);
          } else if (typeof node.data._inputTemplate === "string") {
             try { resolvedData = JSON.parse(resolveTemplate(node.data._inputTemplate, globalStatePayload)); } catch {}
          }

          resolvedData = sanitizeForConvexValue(resolvedData);

          const result = await ctx.runMutation(internal.workflowEngine.executeDatabaseOperation, {
            tableName,
            operation,
            docId: resolvedDocId,
            data: resolvedData,
            workflowId: args.workflowId,
          });

          outputPayload = JSON.stringify({ _system: { db: true }, operation, tableName, result });
        } catch (error: unknown) {
          throw new Error('Database Action failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "waitNode") {
        try {
          outputPayload = executeWaitNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw new Error('Wait config failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "approvalNode") {
        try {
          outputPayload = executeApprovalNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw new Error('Approval execution failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "iteratorNode") {
        try {
          outputPayload = executeIteratorNode(currentNodeData, globalStatePayload);
        } catch(error: unknown) {
          throw new Error('Iterator logic failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "mergeNode") {
        try {
          const executionSteps = await ctx.runQuery(internal.workflowExecutions.getSteps, { executionId: args.executionId });
          const edges = parseWorkflowEdges(workflow?.edges);
          outputPayload = buildMergeNodeOutput({ nodeId: args.nodeId, executionSteps, edges });
        } catch(error: unknown) {
          throw new Error('Merge / Sync processing failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "emailNode") {
        try {
          const config = (node.data?._emailConfig || {}) as EmailConfig;
          const resolvedToRaw = resolveTemplate(config.to || "", globalStatePayload);
          const resolvedFrom = resolveTemplate(config.from || "", globalStatePayload);
          const resolvedSubject = resolveTemplate(config.subject || "No Subject", globalStatePayload);
          const resolvedBody = resolveTemplate(config.body || "", globalStatePayload);

          const fromAddress = resolvedFrom.trim() !== '' ? resolvedFrom : (process.env.RESEND_FROM_EMAIL || "Sonae Automations <hello@ronins.co.uk>");
          
          let toAddresses: string[] | string = resolvedToRaw;
          if (resolvedToRaw.includes(',')) {
             toAddresses = resolvedToRaw.split(',').map((e: string) => e.trim()).filter(Boolean);
          }
          
          if (!process.env.RESEND_API_KEY) {
             console.warn("RESEND_API_KEY not found in environment. Mocking Email dispatch:", { to: toAddresses, subject: resolvedSubject });
             outputPayload = JSON.stringify({ success: true, simulated: true, to: toAddresses, subject: resolvedSubject, bodyPreview: resolvedBody.substring(0, 100) });
          } else {
             const response = await fetch("https://api.resend.com/emails", {
               method: "POST",
               headers: {
                 "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
                 "Content-Type": "application/json"
               },
               body: JSON.stringify({
                 from: fromAddress,
                 to: toAddresses,
                 subject: resolvedSubject,
                 html: resolvedBody
               })
             });

             if (!response.ok) {
               const errText = await response.text();
               throw new Error(`Resend API Rejection: ${errText}`);
             }
             
             const data = await response.json();
             outputPayload = JSON.stringify({ success: true, dispatchId: data?.id, to: toAddresses, subject: resolvedSubject });
          }
        } catch(error: unknown) {
             throw new Error("Email dispatch failed: " + getErrorMessage(error));
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

      // Extract System commands
      const { delayMs, halt } = getWorkflowSystemCommands(outputPayload);

      if (halt) return; // Do not schedule next steps, workflow suspended.

      // Recursively Schedule the next unlocked steps
      for (const nextNodeId of downstreamNodesToSchedule) {
        await ctx.scheduler.runAfter(delayMs, internal.workflowRuntime.executeNode, {
          workflowId: args.workflowId,
          executionId: args.executionId,
          nodeId: nextNodeId
        });
      }

    } catch (error: unknown) {
      console.error(`Workflow execution failed at node ${args.nodeId}:`, error);
      
      await ctx.runMutation(internal.workflowEngine.failNodeStep, {
        executionId: args.executionId,
        nodeId: args.nodeId,
        stepId: lockedStepId,
        error: getErrorMessage(error),
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
