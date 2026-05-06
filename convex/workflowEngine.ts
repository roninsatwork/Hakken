import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const initExecution = internalMutation({
  args: {
    workflowId: v.id("workflows"),
    executionId: v.id("workflowExecutions"),
    initialInput: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) throw new Error("Workflow not found");

    const nodes = JSON.parse(workflow.nodes || "[]");
    const edges = JSON.parse(workflow.edges || "[]");

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
      trigger: args.initialInput ? JSON.parse(args.initialInput) : {}
    };

    await ctx.db.patch(args.executionId, {
      state: JSON.stringify(initialPayload)
    });

    // Find starting nodes (nodes with no incoming edges)
    const targetNodes = new Set(edges.map((e: any) => e.target));
    const startingNodes = nodes.filter((n: any) => !targetNodes.has(n.id));

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

    return startingNodes.map((n: any) => n.id);
  },
});

// Core logic extracted so multiple mutations can call it without nesting ctx.runMutation which is forbidden
async function processNodeFinalization(ctx: any, args: { executionId: Id<"workflowExecutions">, nodeId: string, outputData: string }) {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "RUNNING") return [];

    const workflow = await ctx.db.get(execution.workflowId!);
    if (!workflow) return [];

    const nodes = JSON.parse(workflow.nodes || "[]");
    const edges = JSON.parse(workflow.edges || "[]");

    const step = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution", (q: any) => q.eq("executionId", args.executionId).eq("nodeId", args.nodeId))
      .unique();

    let nextStatus: any = "SUCCESS";
    let halt = false;
    let evaluatedBranch: string | null = null;
    
    try {
       const parsedOut = JSON.parse(args.outputData || "{}");
       if (parsedOut._system?.halt) {
         nextStatus = "PENDING_APPROVAL";
         halt = true;
       }
       if (parsedOut.evaluated !== undefined) {
         evaluatedBranch = parsedOut.evaluated.toString();
       }
    } catch(e) {}

    if (step) {
      await ctx.db.patch(step._id, {
        status: nextStatus as any,
        output: args.outputData,
        completedAt: nextStatus === "SUCCESS" ? Date.now() : undefined,
      });
    }

    if (halt) return []; 

    const currentPayload = JSON.parse(execution.state || "{}");
    const nodeDataObj = JSON.parse(args.outputData || "{}");
    if (!currentPayload.nodes) currentPayload.nodes = {};
    currentPayload.nodes[args.nodeId] = { output: nodeDataObj };

    await ctx.db.patch(args.executionId, {
        state: JSON.stringify(currentPayload)
    });

    let outgoingEdges = edges.filter((e: any) => e.source === args.nodeId);
    
    if (evaluatedBranch !== null) {
       outgoingEdges = outgoingEdges.filter((e: any) => e.label === evaluatedBranch);
    }
    const downstreamNodeIds = outgoingEdges.map((e: any) => e.target);

    const readyToSchedule = [];
    
    for (const dId of downstreamNodeIds) {
      const incomingEdges = edges.filter((e: any) => e.target === dId);
      let allDependenciesSatisfied = true;

      for (const edge of incomingEdges) {
        const depStep = await ctx.db
          .query("workflowExecutionSteps")
          .withIndex("by_execution", (q: any) => q.eq("executionId", args.executionId).eq("nodeId", edge.source))
          .unique();
          
        if (!depStep || depStep.status !== "SUCCESS") {
          allDependenciesSatisfied = false;
          break;
        }
      }

      if (allDependenciesSatisfied) {
        const nextNodeDef = nodes.find((n: any) => n.id === dId);
        
        await ctx.db.insert("workflowExecutionSteps", {
          executionId: args.executionId,
          nodeId: dId,
          agentId: nextNodeDef?.data?._agentId,
          input: JSON.stringify(currentPayload),
          status: "PENDING",
          startedAt: Date.now(),
        });

        readyToSchedule.push(dId);
      }
    }

    if (readyToSchedule.length === 0) {
      const allSteps = await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q: any) => q.eq("executionId", args.executionId))
        .take(10000);
      
      const incompleteSteps = allSteps.filter((s: any) => s.status === "PENDING" || s.status === "RUNNING");
      if (incompleteSteps.length === 0) {
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

    const step = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId).eq("nodeId", args.nodeId))
      .unique();

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
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const step = await ctx.db
      .query("workflowExecutionSteps")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId).eq("nodeId", args.nodeId))
      .unique();

    if (step) {
      await ctx.db.patch(step._id, {
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
