import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * The improvement plan's Phase 2 acceptance, end to end: an agent step that
 * fails transiently twice and succeeds on the third try completes its run,
 * through the real executeNode — real claim, real requeue, real finalize.
 *
 * Only the agent objective itself is stood in for: the real one is a model
 * call, and what this test pins down is everything the engine decides around
 * it. The stand-in still creates a genuine run record, because executeNode
 * links the run to the step and a fake id would fail validation.
 */
const objectiveProbe = vi.hoisted(() => ({ calls: 0 }));

vi.mock("./agentRuntime", async () => {
  const { internalAction } = await import("./_generated/server");
  const { internal: internalApi } = await import("./_generated/api");
  return {
    runTriggeredAgentObjective: internalAction({
      handler: async (ctx, args: { agentId: string; objective: string }) => {
        objectiveProbe.calls += 1;
        if (objectiveProbe.calls <= 2) {
          throw new Error("503 Service Unavailable: model overloaded");
        }
        const runId = await ctx.runMutation(internalApi.agentRuns.createRunInternal, {
          agentId: args.agentId as never,
          triggerType: "WORKFLOW",
          objective: args.objective,
          status: "SUCCESS",
        });
        return { output: JSON.stringify({ ok: true }), runId };
      },
    }),
  };
});

describe("workflow retry, end to end", () => {
  test("fails twice transiently, succeeds third, run completes with attempts recorded", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { workflowId, executionId, stepId } = await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "Retry Probe",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: 1,
        updatedAt: 1,
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "retry-wf",
        isActive: true,
        triggerType: "MANUAL",
        nodes: JSON.stringify([{ id: "n1", type: "agentNode", data: { _agentId: agentId } }]),
        edges: "[]",
        createdAt: 1,
        updatedAt: 1,
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId,
        status: "RUNNING",
        triggerType: "MANUAL",
        startedAt: 1,
      });
      const stepId = await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "n1",
        input: "{}",
        status: "PENDING",
        startedAt: 1,
      });
      return { workflowId, executionId, stepId };
    });

    // convex-test does not fire scheduled functions on its own, so each
    // executeNode call here is one delivery the scheduler would have made.
    const runOnce = () =>
      t.action(internal.workflowRuntime.executeNode, {
        workflowId,
        executionId,
        nodeId: "n1",
      });

    await runOnce(); // attempt 1 — transient failure, requeued
    await t.run(async (ctx) => {
      const step = await ctx.db.get(stepId);
      expect(step?.status).toBe("PENDING");
      expect(step?.attempt).toBe(2);
      expect((await ctx.db.get(executionId))?.status).toBe("RUNNING");
    });

    await runOnce(); // attempt 2 — transient failure, requeued
    await t.run(async (ctx) => {
      expect((await ctx.db.get(stepId))?.attempt).toBe(3);
      expect((await ctx.db.get(executionId))?.status).toBe("RUNNING");
    });

    await runOnce(); // attempt 3 — succeeds
    await t.run(async (ctx) => {
      const step = await ctx.db.get(stepId);
      expect(step?.status).toBe("SUCCESS");
      expect(step?.attempt).toBe(3);
      // The survived error stays visible on the succeeded step.
      expect(step?.error).toContain("503");
      expect(step?.agentRunId).toBeDefined();
      expect((await ctx.db.get(executionId))?.status).toBe("SUCCESS");
    });

    expect(objectiveProbe.calls).toBe(3);
  });
});
