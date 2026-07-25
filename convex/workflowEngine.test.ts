import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { MAX_ITERATOR_FAN_OUT } from "./workflowEngine";
import schema from "./schema";

/**
 * Seeds a two-node graph: an iterator feeding a single downstream node, with
 * the iterator's own step already RUNNING so it can be finalized.
 */
async function seedIteratorGraph(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "iterator@test.com",
      role: "SUPER_ADMIN",
      createdAt: Date.now(),
    });
    const workflowId = await ctx.db.insert("workflows", {
      name: "Iterator Workflow",
      isActive: true,
      triggerType: "MANUAL",
      nodes: JSON.stringify([
        { id: "iterator", type: "iteratorNode", data: {} },
        { id: "worker", type: "customNode", data: {} },
      ]),
      edges: JSON.stringify([{ source: "iterator", target: "worker" }]),
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const executionId = await ctx.db.insert("workflowExecutions", {
      workflowId,
      triggerType: "MANUAL",
      status: "RUNNING",
      state: JSON.stringify({ trigger: {} }),
      startedAt: Date.now(),
      startedBy: userId,
    });
    const stepId = await ctx.db.insert("workflowExecutionSteps", {
      executionId,
      nodeId: "iterator",
      input: JSON.stringify({ trigger: {} }),
      status: "RUNNING",
      startedAt: Date.now(),
    });

    return { workflowId, executionId, stepId };
  });
}

async function stepsForNode(
  t: ReturnType<typeof convexTest>,
  executionId: string,
  nodeId: string,
) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("workflowExecutionSteps").collect()).filter(
      (step) => step.executionId === executionId && step.nodeId === nodeId,
    ),
  );
}

describe("workflow iterator fan-out", () => {
  test("schedules one worker per item so every item actually runs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { executionId, stepId } = await seedIteratorGraph(t);

    const scheduled = await t.mutation(internal.workflowEngine.finalizeNodeStep, {
      executionId,
      nodeId: "iterator",
      stepId,
      outputData: JSON.stringify({
        _system: { isIterator: true },
        items: ["one", "two", "three"],
      }),
    });

    // The regression: three PENDING steps were created but the node was
    // scheduled once, so `claimNextPendingStep` ran item one and left the
    // other two PENDING forever.
    const workerSteps = await stepsForNode(t, executionId, "worker");
    expect(workerSteps).toHaveLength(3);
    expect(scheduled).toEqual(["worker", "worker", "worker"]);

    // Each worker receives its own item rather than three copies of the first.
    const receivedItems = workerSteps
      .map((step) => JSON.parse(step.input ?? "{}").nodes?.iterator?.output?.item)
      .sort();
    expect(receivedItems).toEqual(["one", "three", "two"]);
  });

  test("does not complete the execution while fanned-out steps are still pending", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { executionId, stepId } = await seedIteratorGraph(t);

    await t.mutation(internal.workflowEngine.finalizeNodeStep, {
      executionId,
      nodeId: "iterator",
      stepId,
      outputData: JSON.stringify({ _system: { isIterator: true }, items: ["a", "b"] }),
    });

    const execution = await t.run(async (ctx) => await ctx.db.get(executionId));
    expect(execution?.status).toBe("RUNNING");
  });

  test("an empty iterator schedules nothing and lets the execution finish", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { executionId, stepId } = await seedIteratorGraph(t);

    const scheduled = await t.mutation(internal.workflowEngine.finalizeNodeStep, {
      executionId,
      nodeId: "iterator",
      stepId,
      outputData: JSON.stringify({ _system: { isIterator: true }, items: [] }),
    });

    expect(scheduled).toEqual([]);
    expect(await stepsForNode(t, executionId, "worker")).toHaveLength(0);

    const execution = await t.run(async (ctx) => await ctx.db.get(executionId));
    expect(execution?.status).toBe("SUCCESS");
  });

  test("refuses an unbounded fan-out rather than silently truncating it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { executionId, stepId } = await seedIteratorGraph(t);

    await expect(
      t.mutation(internal.workflowEngine.finalizeNodeStep, {
        executionId,
        nodeId: "iterator",
        stepId,
        outputData: JSON.stringify({
          _system: { isIterator: true },
          items: Array.from({ length: MAX_ITERATOR_FAN_OUT + 1 }, (_, i) => i),
        }),
      }),
    ).rejects.toThrow(/fan-out limit/);

    // Nothing partially scheduled: a run must not report progress it did not make.
    expect(await stepsForNode(t, executionId, "worker")).toHaveLength(0);
  });
});
