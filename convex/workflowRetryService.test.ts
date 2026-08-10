import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  MAX_STEP_ATTEMPTS,
  decideStepFailure,
  isTransientWorkflowError,
} from "./workflowRetryService";

describe("decideStepFailure", () => {
  const transient = "fetch failed: 503 Service Unavailable";

  test("a transient agent-node failure retries, with backoff between tries", () => {
    const first = decideStepFailure({ errorMessage: transient, nodeType: "agentNode", attemptJustFailed: 1 });
    const second = decideStepFailure({ errorMessage: transient, nodeType: "agentNode", attemptJustFailed: 2 });
    expect(first).toEqual({ action: "retry", delayMs: 5_000 });
    expect(second).toEqual({ action: "retry", delayMs: 25_000 });
  });

  test("the attempt budget is a hard stop", () => {
    expect(
      decideStepFailure({ errorMessage: transient, nodeType: "agentNode", attemptJustFailed: MAX_STEP_ATTEMPTS })
    ).toEqual({ action: "fail" });
  });

  test("side-effecting node types never retry, transient or not", () => {
    // The acceptance property: a step that may have sent an email or POSTed to
    // an API cannot prove its first attempt did nothing, so it gets exactly one.
    for (const nodeType of ["emailNode", "actionNode", "databaseNode", "codeNode", "iteratorNode", undefined]) {
      expect(decideStepFailure({ errorMessage: transient, nodeType, attemptJustFailed: 1 })).toEqual({ action: "fail" });
    }
  });

  test("terminal errors never retry, even on a retryable node", () => {
    expect(
      decideStepFailure({ errorMessage: "Agent not found", nodeType: "agentNode", attemptJustFailed: 1 })
    ).toEqual({ action: "fail" });
  });

  test("a first attempt that may have acted never retries, transient or not", () => {
    // Two ways an agentNode loses its safety argument: the agent runs its
    // write tools autonomously (no approval gate to stop a repeat), or the
    // node's work finished and the error came from the bookkeeping after it.
    // The caller reports both through the same flag, and it beats everything.
    expect(
      decideStepFailure({
        errorMessage: transient,
        nodeType: "agentNode",
        attemptJustFailed: 1,
        firstAttemptMayHaveActed: true,
      })
    ).toEqual({ action: "fail" });
  });
});

describe("isTransientWorkflowError", () => {
  test("recognises provider hiccups and refuses everything else", () => {
    for (const msg of ["429 rate limit", "Request timed out", "ECONNRESET", "model overloaded", "502 Bad Gateway"]) {
      expect(isTransientWorkflowError(msg), msg).toBe(true);
    }
    for (const msg of ["Agent not found", "Invalid JSON in node config", "Unauthorized"]) {
      expect(isTransientWorkflowError(msg), msg).toBe(false);
    }
  });
});

describe("requeueStepForRetry", () => {
  test("returns a running step to the queue with the attempt counted and the error kept", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { executionId, stepId } = await t.run(async (ctx) => {
      const workflowId = await ctx.db.insert("workflows", {
        name: "wf", nodes: "[]", edges: "[]", isActive: true, triggerType: "MANUAL", createdAt: 1, updatedAt: 1,
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId, status: "RUNNING", startedAt: 1, triggerType: "MANUAL",
      });
      const stepId = await ctx.db.insert("workflowExecutionSteps", {
        executionId, nodeId: "n1", input: "{}", status: "RUNNING", startedAt: 1,
      });
      return { executionId, stepId };
    });

    const result = await t.mutation(internal.workflowExecutions.requeueStepForRetry, {
      stepId, error: "503 unavailable",
    });
    expect(result).toEqual({ nextAttempt: 2 });

    await t.run(async (ctx) => {
      const step = await ctx.db.get(stepId);
      expect(step?.status).toBe("PENDING");
      expect(step?.attempt).toBe(2);
      expect(step?.error).toBe("503 unavailable");
      // The execution is still alive — a retry is not a failure.
      const execution = await ctx.db.get(executionId);
      expect(execution?.status).toBe("RUNNING");
    });

    // The retry flows through the normal claim path, which reports the attempt.
    const claimed = await t.mutation(internal.workflowExecutions.claimNextPendingStep, {
      executionId, nodeId: "n1",
    });
    expect(claimed?.attempt).toBe(2);
  });

  test("a step no longer running is left alone", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const stepId = await t.run(async (ctx) => {
      const workflowId = await ctx.db.insert("workflows", {
        name: "wf", nodes: "[]", edges: "[]", isActive: true, triggerType: "MANUAL", createdAt: 1, updatedAt: 1,
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId, status: "RUNNING", startedAt: 1, triggerType: "MANUAL",
      });
      return await ctx.db.insert("workflowExecutionSteps", {
        executionId, nodeId: "n1", input: "{}", status: "SUCCESS", startedAt: 1,
      });
    });

    const result = await t.mutation(internal.workflowExecutions.requeueStepForRetry, {
      stepId, error: "late error",
    });
    expect(result).toBeNull();
    await t.run(async (ctx) => {
      expect((await ctx.db.get(stepId))?.status).toBe("SUCCESS");
    });
  });
});
