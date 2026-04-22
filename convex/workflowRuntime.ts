"use node";

import { internalAction, action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { resolveTemplate } from "./utils/templateParser";

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
    try {
      const execution = await ctx.runQuery(internal.workflowExecutions.getExecution, { id: args.executionId });
      if (!execution || execution.status === "FAILED") {
        console.warn(`Execution ${args.executionId} is failed or missing. Halting node ${args.nodeId}.`);
        return;
      }
      
      const workflow = await ctx.runQuery((internal as any).workflows.internalGet, { id: args.workflowId });
      if (!workflow) throw new Error("Workflow not found");

      const nodes = JSON.parse(workflow.nodes || "[]");
      const node = nodes.find((n: any) => n.id === args.nodeId);
      if (!node) throw new Error(`Node ${args.nodeId} not found in graph topology`);

      // Mark Step as Running
      await ctx.runMutation(internal.workflowExecutions.upsertStep, {
        executionId: args.executionId,
        nodeId: args.nodeId,
        agentId: node.data?._agentId,
        input: execution.state || "{}",
        status: "RUNNING",
      });

      // Execute based on Node Type (In Phase 1 we only have Agent nodes natively supported)
      let outputPayload = "{}";

      const globalStatePayload = JSON.parse(execution.state || "{}");
      let resolvedInput = execution.state || "{}"; // Default to raw state dump

      if (node.data?._inputMapping) {
        resolvedInput = JSON.stringify(resolveTemplate(node.data._inputMapping, globalStatePayload));
      } else if (node.data?._inputTemplate) {
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
          const config = resolveTemplate(node.data._actionConfig, globalStatePayload);
          const method = config.method || 'GET';
          const url = config.url;
          if (!url) throw new Error("Missing URL for Action Node");
          
          const headers: Record<string, string> = {};
          if (Array.isArray(config.headers)) {
             config.headers.forEach((h: any) => {
               if (h.key) headers[h.key] = h.value;
             });
          }

          const fetchOptions: RequestInit = { method, headers };
          
          let body = config.body;
          if (method !== 'GET' && method !== 'HEAD' && body) {
             fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : String(body);
          }
          
          const res = await fetch(url, fetchOptions);
          const text = await res.text();
          try { outputPayload = JSON.stringify({ status: res.status, data: JSON.parse(text) }); }
          catch { outputPayload = JSON.stringify({ status: res.status, data: text }); }
        } catch (error: any) {
          throw new Error('API Action request failed: ' + error.message);
        }
      }
      else if (node.type === "codeNode") {
        try {
          // Extremely basic sandbox format using V8
          // Pass the global nodes state directly so developers can map JSON effectively without tricky string interpolations
          const fn = new Function('nodes', `
            try {
               ${currentNodeData._inputTemplate || 'return nodes;'}
            } catch(e) { return { error: e.message, stack: e.stack }; }
          `);
          const result = fn(globalStatePayload.nodes || {});
          outputPayload = typeof result === 'object' ? JSON.stringify(result) : String(result);
        } catch (error: any) {
          throw new Error("Code execution failed: " + error.message);
        }
      }
      else if (node.type === "waitNode") {
        let delayMs = 5000; // default 5s
        try {
           const parsed = JSON.parse(resolvedInput);
           if (parsed.delayMs) delayMs = parseInt(parsed.delayMs);
        } catch(e) {}
        outputPayload = JSON.stringify({ waitedMs: delayMs, _system: { delayMs } });
      }
      else if (node.type === "approvalNode") {
        outputPayload = JSON.stringify({ _system: { halt: true, status: 'PENDING_APPROVAL' } });
      }
      else if (node.type === "logicNode") {
        try {
          const config = node.data?._logicConfig || { rules: [], fallbackBranch: "default" };
          let evaluatedBranch = config.fallbackBranch;
          
          for (const rule of config.rules) {
             const resolvedVar = resolveTemplate(rule.variable, globalStatePayload);
             const resolvedVal = rule.value ? resolveTemplate(rule.value, globalStatePayload) : rule.value;
             
             let match = false;
             switch(rule.operator) {
                case "EQUALS": match = String(resolvedVar) === String(resolvedVal); break;
                case "NOT_EQUALS": match = String(resolvedVar) !== String(resolvedVal); break;
                case "CONTAINS": match = String(resolvedVar).includes(String(resolvedVal)); break;
                case "GREATER_THAN": match = parseFloat(resolvedVar) > parseFloat(resolvedVal); break;
                case "LESS_THAN": match = parseFloat(resolvedVar) < parseFloat(resolvedVal); break;
                case "IS_EMPTY": match = !resolvedVar || String(resolvedVar).trim() === ''; break;
                case "NOT_EMPTY": match = !!resolvedVar && String(resolvedVar).trim() !== ''; break;
             }
             if (match) {
                 evaluatedBranch = rule.branch;
                 break;
             }
          }
          outputPayload = JSON.stringify({ evaluated: evaluatedBranch });
        } catch(error: any) {
          throw new Error('Logic routing failed: ' + error.message);
        }
      }
      else if (node.type === "databaseNode") {
        try {
          if (!node.data?._dbConfig) throw new Error("Database Node is missing configuration");
          const { tableName, operation, docId } = node.data._dbConfig;
          if (!tableName) throw new Error("Database table not specified");
          
          let resolvedDocId = docId;
          if (docId) resolvedDocId = resolveTemplate(docId, globalStatePayload);

          let resolvedData = {};
          if (node.data._inputMapping && Object.keys(node.data._inputMapping).length > 0) {
             resolvedData = resolveTemplate(node.data._inputMapping, globalStatePayload);
          } else if (node.data._inputTemplate) {
             try { resolvedData = JSON.parse(resolveTemplate(node.data._inputTemplate, globalStatePayload)); } catch(e) {}
          }

          const result = await ctx.runMutation(internal.workflowEngine.executeDatabaseOperation, {
            tableName,
            operation,
            docId: resolvedDocId,
            data: resolvedData,
          });

          outputPayload = JSON.stringify({ _system: { db: true }, operation, tableName, result });
        } catch (error: any) {
          throw new Error('Database Action failed: ' + error.message);
        }
      else if (node.type === "waitNode") {
        try {
          const config = node.data?._waitConfig || { delaySeconds: 5 };
          const resolvedDelay = resolveTemplate(String(config.delaySeconds), globalStatePayload);
          let delayMs = parseInt(resolvedDelay) * 1000;
          if (isNaN(delayMs) || delayMs < 0) delayMs = 0;
          
          outputPayload = JSON.stringify({ 
             _system: { delayMs: delayMs, structurallyHandled: true }, 
             waitedSeconds: delayMs / 1000 
          });
        } catch(error: any) {
          throw new Error('Wait config failed: ' + error.message);
        }
      }
      else if (node.type === "approvalNode") {
        try {
          const config = node.data?._approvalConfig || { message: 'Action requires manual sign-off' };
          const previewValue = config.previewTarget ? resolveTemplate(config.previewTarget, globalStatePayload) : null;
          
          outputPayload = JSON.stringify({ 
             _system: { halt: true, structurallyHandled: true }, 
             message: config.message,
             previewData: previewValue
          });
        } catch(error: any) {
          throw new Error('Approval execution failed: ' + error.message);
        }
      }
      else if (node.type === "iteratorNode") {
        try {
          const config = node.data?._iteratorConfig || {};
          let resolvedArray = resolveTemplate(config.listVariable || "", globalStatePayload);
          let parsedArray = typeof resolvedArray === 'string' ? JSON.parse(resolvedArray) : resolvedArray;
          if (!Array.isArray(parsedArray)) parsedArray = [parsedArray];
          
          outputPayload = JSON.stringify({ 
             _system: { isIterator: true }, 
             items: parsedArray 
          });
        } catch(error: any) {
          throw new Error('Iterator logic failed: ' + error.message);
        }
      }
      else if (node.type === "mergeNode") {
        try {
          const executionSteps = await ctx.runQuery(internal.workflowExecutions.getSteps, { executionId: args.executionId });
          const workflowData = await ctx.db.get(args.workflowId);
          const edges = JSON.parse(workflowData?.edges || "[]");
          const incomingEdges = edges.filter((e: any) => e.target === args.nodeId);
          
          let mergedPayload: any = {};
          
          for (const edge of incomingEdges) {
             const upstreamSteps = executionSteps.filter((s:any) => s.nodeId === edge.source && s.status === 'SUCCESS');
             
             if (upstreamSteps.length > 1) {
                 // Array aggregation from Fan-out Iterator upstream
                 mergedPayload[edge.source] = upstreamSteps.map((s: any) => JSON.parse(s.output || "{}"));
             } else if (upstreamSteps.length === 1) {
                 // Standard singular upstream
                 mergedPayload[edge.source] = JSON.parse(upstreamSteps[0].output || "{}");
             }
          }

          outputPayload = JSON.stringify({ 
             _system: { isMerge: true, structurallyHandled: true }, 
             mergedContexts: mergedPayload
          });
        } catch(error: any) {
          throw new Error('Merge / Sync processing failed: ' + error.message);
        }
      }
      else if (node.type === "emailNode") {
        try {
          const config = node.data?._emailConfig || {};
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
        } catch(error: any) {
             throw new Error("Email dispatch failed: " + error.message);
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
        outputData: outputPayload,
      });

      // Extract System commands
      let delayMs = 0;
      let halt = false;
      try {
         const outObj = JSON.parse(outputPayload);
         if (outObj._system?.delayMs) delayMs = outObj._system.delayMs;
         if (outObj._system?.halt) halt = true;
      } catch(e) {}

      if (halt) return; // Do not schedule next steps, workflow suspended.

      // Recursively Schedule the next unlocked steps
      for (const nextNodeId of downstreamNodesToSchedule) {
        await ctx.scheduler.runAfter(delayMs, internal.workflowRuntime.executeNode, {
          workflowId: args.workflowId,
          executionId: args.executionId,
          nodeId: nextNodeId
        });
      }

    } catch (error: any) {
      console.error(`Workflow execution failed at node ${args.nodeId}:`, error);
      
      await ctx.runMutation(internal.workflowEngine.failNodeStep, {
        executionId: args.executionId,
        nodeId: args.nodeId,
        error: error.message || "Unknown error during node execution",
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
