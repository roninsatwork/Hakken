import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("workflow execution internals", () => {
  test("creates executions and marks terminal statuses with completion timestamps", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { workflowId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Execution Workflow",
        isActive: true,
        triggerType: "MANUAL",
        nodes: "[]",
        edges: "[]",
        createdBy: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { workflowId, userId };
    });

    const executionId = await t.mutation(internal.workflowExecutions.createExecution, {
      workflowId,
      triggerType: "MANUAL",
      startedBy: userId,
    });

    const createdExecution = await t.run(async (ctx) => ctx.db.get(executionId));
    expect(createdExecution).toMatchObject({
      workflowId,
      triggerType: "MANUAL",
      startedBy: userId,
      status: "RUNNING",
    });
    expect(createdExecution?.completedAt).toBeUndefined();

    await t.mutation(internal.workflowExecutions.updateExecutionStatus, {
      id: executionId,
      status: "SUCCESS",
      state: JSON.stringify({ ok: true }),
    });

    const completedExecution = await t.run(async (ctx) => ctx.db.get(executionId));
    expect(completedExecution).toMatchObject({
      status: "SUCCESS",
      state: JSON.stringify({ ok: true }),
    });
    expect(completedExecution?.completedAt).toEqual(expect.any(Number));
  });

  test("upserts latest node steps and preserves iterator fan-out claims", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { executionId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Step Workflow",
        isActive: true,
        triggerType: "MANUAL",
        nodes: "[]",
        edges: "[]",
        createdBy: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return {
        executionId: await ctx.db.insert("workflowExecutions", {
          workflowId,
          triggerType: "MANUAL",
          status: "RUNNING",
          startedAt: Date.now(),
          startedBy: userId,
        }),
      };
    });

    const firstStepId = await t.mutation(internal.workflowExecutions.upsertStep, {
      executionId,
      nodeId: "agent-1",
      input: JSON.stringify({ value: 1 }),
      status: "PENDING",
    });
    const updatedStepId = await t.mutation(internal.workflowExecutions.upsertStep, {
      executionId,
      nodeId: "agent-1",
      input: JSON.stringify({ value: 2 }),
      output: JSON.stringify({ ok: true }),
      status: "SUCCESS",
    });

    expect(updatedStepId).toBe(firstStepId);

    const upsertedStep = await t.run(async (ctx) => ctx.db.get(firstStepId));
    expect(upsertedStep).toMatchObject({
      executionId,
      nodeId: "agent-1",
      input: JSON.stringify({ value: 2 }),
      output: JSON.stringify({ ok: true }),
      status: "SUCCESS",
    });
    expect(upsertedStep?.completedAt).toEqual(expect.any(Number));

    const { olderStepId, newerStepId } = await t.run(async (ctx) => {
      const olderStepId = await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "worker",
        input: "oldest",
        status: "PENDING",
        startedAt: 1,
      });
      const newerStepId = await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "worker",
        input: "newest",
        status: "PENDING",
        startedAt: 2,
      });

      return { olderStepId, newerStepId };
    });

    const firstClaim = await t.mutation(internal.workflowExecutions.claimNextPendingStep, {
      executionId,
      nodeId: "worker",
    });
    const secondClaim = await t.mutation(internal.workflowExecutions.claimNextPendingStep, {
      executionId,
      nodeId: "worker",
    });
    const thirdClaim = await t.mutation(internal.workflowExecutions.claimNextPendingStep, {
      executionId,
      nodeId: "worker",
    });

    expect(firstClaim).toEqual({ stepId: olderStepId, input: "oldest" });
    expect(secondClaim).toEqual({ stepId: newerStepId, input: "newest" });
    expect(thirdClaim).toBeNull();

    const claimedSteps = await t.run(async (ctx) =>
      ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId).eq("nodeId", "worker"))
        .collect()
    );

    expect(claimedSteps.map((step) => step.status)).toEqual(["RUNNING", "RUNNING"]);
  });
});
