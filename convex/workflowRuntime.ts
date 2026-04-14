"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const executeWorkflow = internalAction({
  args: {
    workflowId: v.id("workflows"),
    executionId: v.id("workflowExecutions"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.runQuery((internal as any).workflows.internalGet, { id: args.workflowId });
    if (!workflow) throw new Error("Workflow not found");

    const nodes = JSON.parse(workflow.nodes || "[]");
    const edges = JSON.parse(workflow.edges || "[]");

    if (nodes.length === 0) {
      await ctx.runMutation(internal.workflowExecutions.updateExecutionStatus, {
        id: args.executionId,
        status: "SUCCESS",
        state: JSON.stringify({ message: "No nodes to execute" }),
      });
      return;
    }

    // 1. Resolve Execution Order (Simple linear path for now)
    const targetNodes = new Set(edges.map((e: any) => e.target));
    let currentNode = nodes.find((n: any) => !targetNodes.has(n.id));

    if (!currentNode && nodes.length > 0) {
      currentNode = nodes[0];
    }

    const sequence: any[] = [];
    const visited = new Set();
    
    while (currentNode && !visited.has(currentNode.id)) {
      sequence.push(currentNode);
      visited.add(currentNode.id);
      
      const outgoingEdge = edges.find((e: any) => e.source === currentNode.id);
      if (outgoingEdge) {
        currentNode = nodes.find((n: any) => n.id === outgoingEdge.target);
      } else {
        currentNode = null;
      }
    }

    // 2. Fetch existing steps to support Resuming
    const existingSteps = await ctx.runQuery(internal.workflowExecutions.getSteps, {
      executionId: args.executionId,
    });
    const stepMap = new Map<string, any>(existingSteps.map((s: any) => [s.nodeId, s]));

    let lastOutput = args.initialInput || "{}";

    // 3. Execution Loop
    for (const node of sequence) {
      const existingStep = stepMap.get(node.id) as any;
      
      // If step already succeeded, we skip and use its output for the next one
      if (existingStep?.status === "SUCCESS") {
        lastOutput = existingStep.output || "{}";
        continue;
      }

      // Prepare Step in DB
      await ctx.runMutation(internal.workflowExecutions.upsertStep, {
        executionId: args.executionId,
        nodeId: node.id,
        agentId: node.data?._agentId,
        input: lastOutput,
        status: "RUNNING",
      });

      try {
        if (node.type === "agentNode" && node.data?._agentId) {
          const result = await ctx.runAction(internal.agentRuntime.executeAgentNode, {
            agentId: node.data._agentId,
            input: lastOutput,
          });

          // Mark Step as Success BEFORE updating lastOutput to keep track of what went into it
          await ctx.runMutation(internal.workflowExecutions.upsertStep, {
            executionId: args.executionId,
            nodeId: node.id,
            agentId: node.data._agentId,
            input: lastOutput,
            output: result.output,
            status: "SUCCESS",
          });

          lastOutput = result.output;
        } else {
          // Non-agent nodes or unconfigured nodes
          await ctx.runMutation(internal.workflowExecutions.upsertStep, {
            executionId: args.executionId,
            nodeId: node.id,
            input: lastOutput,
            output: lastOutput,
            status: "SUCCESS",
          });
        }
      } catch (error: any) {
        console.error(`Workflow execution failed at node ${node.id}:`, error);
        
        await ctx.runMutation(internal.workflowExecutions.upsertStep, {
          executionId: args.executionId,
          nodeId: node.id,
          input: lastOutput,
          status: "FAILED",
          error: error.message || "Unknown error during node execution",
        });

        await ctx.runMutation(internal.workflowExecutions.updateExecutionStatus, {
          id: args.executionId,
          status: "FAILED",
          state: JSON.stringify({ failedAt: node.id, error: error.message }),
        });
        
        throw error;
      }
    }

    // 4. Finalize Execution
    await ctx.runMutation(internal.workflowExecutions.updateExecutionStatus, {
      id: args.executionId,
      status: "SUCCESS",
      state: lastOutput,
    });

    return JSON.parse(lastOutput);
  },
});
