"use node";

import { internalAction, action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { resolveTemplate } from "./utils/templateParser";
import { validateSafeUrl } from "./utils/security";
import type { Id } from "./_generated/dataModel";
import { parseWorkflowEdges, parseWorkflowNodes } from "./utils/workflowTypes";

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

type LogicConfig = {
  fallbackBranch?: string;
  rules?: Array<{
    variable: string;
    value?: string;
    operator: "EQUALS" | "NOT_EQUALS" | "CONTAINS" | "GREATER_THAN" | "LESS_THAN" | "IS_EMPTY" | "NOT_EMPTY";
    branch: string;
  }>;
};

type DatabaseConfig = {
  tableName?: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "SELECT";
  docId?: string;
};

type WaitConfig = {
  delaySeconds?: number | string;
};

type ApprovalConfig = {
  message?: string;
  previewTarget?: string;
};

type IteratorConfig = {
  listVariable?: string;
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

      // Execute based on Node Type (In Phase 1 we only have Agent nodes natively supported)
      let outputPayload = "{}";

      const globalStatePayload = JSON.parse(stepInput);
      let resolvedInput = stepInput; // Default to raw state dump

      if (node.data?._inputMapping) {
        resolvedInput = JSON.stringify(resolveTemplate(node.data._inputMapping, globalStatePayload));
      } else if (typeof node.data?._inputTemplate === "string") {
        resolvedInput = resolveTemplate(node.data._inputTemplate, globalStatePayload);
      }

      const currentNodeData = node.data || {};

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
          // 🛡️ SECURITY: Replaced dangerous RCE (new Function) with safe templating logic
          let parseCtx = resolvedInput;
          try { parseCtx = JSON.parse(resolvedInput); } catch {}
          
          // Fallback to safe templating resolution using the execution context
          let templatePayload = parseCtx;
          if (currentNodeData._inputTemplate && typeof currentNodeData._inputTemplate === "string") {
              const safeGlobalPayload = { input: parseCtx, execution: execution.state ? JSON.parse(execution.state) : {} };
              templatePayload = resolveTemplate(currentNodeData._inputTemplate, safeGlobalPayload);
          }
          
          outputPayload = JSON.stringify(templatePayload);
        } catch (error: unknown) {
          throw new Error("Safe code transformation failed: " + getErrorMessage(error));
        }
      }

      else if (node.type === "logicNode") {
        try {
          const config = (node.data?._logicConfig || { rules: [], fallbackBranch: "default" }) as LogicConfig;
          let evaluatedBranch = config.fallbackBranch;
          
          for (const rule of config.rules ?? []) {
             const resolvedVar = resolveTemplate(rule.variable, globalStatePayload);
             const resolvedVal = rule.value ? resolveTemplate(rule.value, globalStatePayload) : rule.value;
             
             let match = false;
             switch(rule.operator) {
                case "EQUALS": match = String(resolvedVar) === String(resolvedVal); break;
                case "NOT_EQUALS": match = String(resolvedVar) !== String(resolvedVal); break;
                case "CONTAINS": match = String(resolvedVar).includes(String(resolvedVal)); break;
                case "GREATER_THAN": match = parseFloat(String(resolvedVar)) > parseFloat(String(resolvedVal ?? "")); break;
                case "LESS_THAN": match = parseFloat(String(resolvedVar)) < parseFloat(String(resolvedVal ?? "")); break;
                case "IS_EMPTY": match = !resolvedVar || String(resolvedVar).trim() === ''; break;
                case "NOT_EMPTY": match = !!resolvedVar && String(resolvedVar).trim() !== ''; break;
             }
             if (match) {
                 evaluatedBranch = rule.branch;
                 break;
             }
          }
          outputPayload = JSON.stringify({ evaluated: evaluatedBranch });
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

          const sanitizeForConvex = (obj: unknown): unknown => {
             if (Array.isArray(obj)) return obj.map(sanitizeForConvex);
             if (obj !== null && typeof obj === 'object') {
                 const clean: Record<string, unknown> = {};
                 for (const key in obj as Record<string, unknown>) {
                     const safeKey = key.startsWith('$') ? key.substring(1) : key;
                     clean[safeKey] = sanitizeForConvex((obj as Record<string, unknown>)[key]);
                 }
                 return clean;
             }
             return obj;
          };

          resolvedData = sanitizeForConvex(resolvedData);

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
          const config = (node.data?._waitConfig || { delaySeconds: 5 }) as WaitConfig;
          const resolvedDelay = resolveTemplate(String(config.delaySeconds), globalStatePayload);
          let delayMs = parseInt(resolvedDelay) * 1000;
          if (isNaN(delayMs) || delayMs < 0) delayMs = 0;
          
          outputPayload = JSON.stringify({ 
             _system: { delayMs: delayMs, structurallyHandled: true }, 
             waitedSeconds: delayMs / 1000 
          });
        } catch(error: unknown) {
          throw new Error('Wait config failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "approvalNode") {
        try {
          const config = (node.data?._approvalConfig || { message: 'Action requires manual sign-off' }) as ApprovalConfig;
          const previewValue = config.previewTarget ? resolveTemplate(config.previewTarget, globalStatePayload) : null;
          
          outputPayload = JSON.stringify({ 
             _system: { halt: true, structurallyHandled: true }, 
             message: config.message,
             previewData: previewValue
          });
        } catch(error: unknown) {
          throw new Error('Approval execution failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "iteratorNode") {
        try {
          const config = (node.data?._iteratorConfig || {}) as IteratorConfig;
          const resolvedArray = resolveTemplate(config.listVariable || "", globalStatePayload);
          let parsedArray = typeof resolvedArray === 'string' ? JSON.parse(resolvedArray) : resolvedArray;
          if (!Array.isArray(parsedArray)) parsedArray = [parsedArray];
          
          outputPayload = JSON.stringify({ 
             _system: { isIterator: true }, 
             items: parsedArray 
          });
        } catch(error: unknown) {
          throw new Error('Iterator logic failed: ' + getErrorMessage(error));
        }
      }
      else if (node.type === "mergeNode") {
        try {
          const executionSteps = await ctx.runQuery(internal.workflowExecutions.getSteps, { executionId: args.executionId });
          const edges = parseWorkflowEdges(workflow?.edges);
          const incomingEdges = edges.filter((edge) => edge.target === args.nodeId);
          
          const mergedPayload: Record<string, unknown> = {};
          
          for (const edge of incomingEdges) {
             const upstreamSteps = executionSteps.filter((step) => step.nodeId === edge.source && step.status === 'SUCCESS');
             
             if (upstreamSteps.length > 1) {
                 // Array aggregation from Fan-out Iterator upstream
                 mergedPayload[edge.source] = upstreamSteps.map((step) => JSON.parse(step.output || "{}"));
             } else if (upstreamSteps.length === 1) {
                 // Standard singular upstream
                 mergedPayload[edge.source] = JSON.parse(upstreamSteps[0].output || "{}");
             }
          }

          outputPayload = JSON.stringify({ 
             _system: { isMerge: true, structurallyHandled: true }, 
             mergedContexts: mergedPayload
          });
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
        // Dummy/Bypass execution for unsupported node types
        outputPayload = JSON.stringify({ bypassed: true, nodeType: node.type, received: resolvedInput });
      }

      // Finalize the step, append to State memory, and find downstream tasks
      const downstreamNodesToSchedule = await ctx.runMutation(internal.workflowEngine.finalizeNodeStep, {
        executionId: args.executionId,
        nodeId: args.nodeId,
        stepId: lockedStepId,
        outputData: outputPayload,
      });

      // Extract System commands
      let delayMs = 0;
      let halt = false;
      try {
         const outObj = JSON.parse(outputPayload);
         if (outObj._system?.delayMs) delayMs = outObj._system.delayMs;
         if (outObj._system?.halt) halt = true;
      } catch {}

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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

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
