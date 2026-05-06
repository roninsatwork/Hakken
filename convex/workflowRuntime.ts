"use node";

import { internalAction, action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { resolveTemplate } from "./utils/templateParser";
import { validateSafeUrl } from "./utils/security";

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
          const config = JSON.parse(resolvedInput);
          const method = config.method || 'GET';
          const url = config.url;
          if (!url) throw new Error("Missing URL for Action Node");
          
          // 🛡️ SECURITY: SSRF Prevention Shield
          validateSafeUrl(url, "Action Node");
          
          const headers = config.headers || {};
          let body = config.body;
          if (typeof body === 'object') body = JSON.stringify(body);
          
          const res = await fetch(url, { method, headers, body });
          const text = await res.text();
          try { outputPayload = JSON.stringify({ status: res.status, data: JSON.parse(text) }); }
          catch { outputPayload = JSON.stringify({ status: res.status, data: text }); }
        } catch (error: any) {
          throw new Error('Action Fetch failed: ' + error.message);
        }
      }
      else if (node.type === "codeNode") {
        try {
          // 🛡️ SECURITY: Replaced dangerous RCE (new Function) with safe templating logic
          let parseCtx = resolvedInput;
          try { parseCtx = JSON.parse(resolvedInput); } catch (e) {}
          
          // Fallback to safe templating resolution using the execution context
          let templatePayload = parseCtx;
          if (currentNodeData._inputTemplate && typeof currentNodeData._inputTemplate === "string") {
              const safeGlobalPayload = { input: parseCtx, execution: execution.state ? JSON.parse(execution.state) : {} };
              templatePayload = resolveTemplate(currentNodeData._inputTemplate, safeGlobalPayload);
          }
          
          outputPayload = JSON.stringify(templatePayload);
        } catch (error: any) {
          throw new Error("Safe code transformation failed: " + error.message);
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
        // Logic router checks input against bound conditions
        outputPayload = JSON.stringify({ evaluated: resolvedInput });
      }
      else if (node.type === "databaseNode") {
        outputPayload = JSON.stringify({ _system: { db: true }, payload: resolvedInput });
      }
      else if (node.type === "subWorkflowNode") {
        outputPayload = JSON.stringify({ _system: { triggerSubWorkflow: true }, payload: resolvedInput });
      }
      else if (node.type === "iteratorNode" || node.type === "mergeNode") {
        outputPayload = JSON.stringify({ _system: { structurallyHandled: true }, received: resolvedInput });
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

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
