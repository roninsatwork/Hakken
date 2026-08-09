import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { SELF_IMPROVEMENT_CONFIG_KEY } from "./selfImprovementConfig";

const paginationOpts = { numItems: 10, cursor: null };

describe("Agent Run Reflections", () => {
  test("admins can generate tenant-scoped reflections for failed runs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, failedRunId, successRunId, cancelledRunId, agentId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@example.com",
        role: "ADMIN",
        companyId: companyBId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Reflection Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const failedRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "WORKFLOW",
        objective: "Update the company overview with a structured summary",
        status: "FAILED",
        startedAt: 100,
        completedAt: 140,
        updatedAt: 140,
        error: "Tool argument validation failed",
      });
      const failedStepId = await ctx.db.insert("agentRunSteps", {
        runId: failedRunId,
        agentId,
        companyId: companyAId,
        stepIndex: 2,
        kind: "TOOL_CALL",
        status: "FAILED",
        input: "{}",
        output: "{}",
        error: "JSON schema validation failed for overview",
        startedAt: 120,
        completedAt: 130,
      });
      await ctx.db.insert("agentToolCalls", {
        runId: failedRunId,
        stepId: failedStepId,
        agentId,
        normalizedToolName: "overview_update",
        handlerMapping: "company.overview.update",
        argumentsJson: "{}",
        status: "FAILED",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        companyId: companyAId,
        userId: adminAId,
        error: "Argument validation failed",
        startedAt: 121,
        completedAt: 129,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: failedRunId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "NEGATIVE",
        labels: ["BAD_TOOL_ARGS", "SHOULD_BECOME_EVAL"],
        createdAt: 150,
        updatedAt: 150,
      });
      const successRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Successful run",
        status: "SUCCESS",
        startedAt: 200,
        completedAt: 220,
        updatedAt: 220,
      });
      const cancelledRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyBId,
        userId: adminBId,
        triggerType: "MANUAL",
        objective: "Cancelled duplicate run",
        status: "CANCELLED",
        startedAt: 300,
        completedAt: 320,
        updatedAt: 320,
        cancelledAt: 320,
        finalOutput: "Agent run cancelled.",
      });

      return { adminAId, adminBId, failedRunId, successRunId, cancelledRunId, agentId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await expect(adminBClient.mutation(api.agentRunReflections.createForRun, { runId: failedRunId })).rejects.toThrow(
      "Unauthorized"
    );
    await expect(adminAClient.mutation(api.agentRunReflections.createForRun, { runId: successRunId })).rejects.toThrow(
      "Only failed or cancelled runs can be reflected"
    );

    const reflectionId = await adminAClient.mutation(api.agentRunReflections.createForRun, { runId: failedRunId });
    await adminAClient.mutation(api.agentRunReflections.createForRun, { runId: failedRunId });

    const failedReflections = await adminAClient.query(api.agentRunReflections.getForRun, {
      runId: failedRunId,
      paginationOpts,
    });
    expect(failedReflections.page).toHaveLength(1);
    expect(failedReflections.page[0]).toMatchObject({
      _id: reflectionId,
      runId: failedRunId,
      agentId,
      category: "BAD_TOOL_ARGUMENTS",
      sourceStatus: "FAILED",
      failureStepIndex: 2,
      failureStepKind: "TOOL_CALL",
      status: "GENERATED",
      proposedEvalFixture: "Create an eval that expects valid tool arguments for this objective.",
    });
    expect(failedReflections.page[0].rootCause).toContain("company.overview.update");
    expect(JSON.parse(failedReflections.page[0].evidenceJson || "{}")).toMatchObject({
      runId: failedRunId,
      sourceStatus: "FAILED",
      toolHandler: "company.overview.update",
      toolStatus: "FAILED",
    });

    await expect(
      adminBClient.mutation(api.agentRunReflections.dismissReflection, {
        reflectionId,
        reason: "Not actionable",
      })
    ).rejects.toThrow("Unauthorized");

    await adminAClient.mutation(api.agentRunReflections.dismissReflection, {
      reflectionId,
      reason: "Covered by an existing eval",
    });
    await expect(
      adminAClient.mutation(api.agentRunReflections.dismissReflection, {
        reflectionId,
        reason: "Duplicate dismissal",
      })
    ).rejects.toThrow("Reflection has already been reviewed");

    const dismissedReflection = await t.run(async (ctx) => await ctx.db.get(reflectionId));
    expect(dismissedReflection).toMatchObject({
      status: "DISMISSED",
      reviewedBy: adminAId,
      dismissalReason: "Covered by an existing eval",
    });

    const cancelledReflectionId = await adminBClient.mutation(api.agentRunReflections.createForRun, {
      runId: cancelledRunId,
    });
    const adminBRecent = await adminBClient.query(api.agentRunReflections.getRecentForAgent, { agentId });
    expect(adminBRecent.map((reflection) => reflection._id)).toEqual([cancelledReflectionId]);
    expect(adminBRecent[0]).toMatchObject({
      category: "USER_CANCELLED",
      sourceStatus: "CANCELLED",
    });

    const adminARecent = await adminAClient.query(api.agentRunReflections.getRecentForAgent, { agentId });
    expect(adminARecent.map((reflection) => reflection._id)).toEqual([reflectionId]);

    await expect(adminBClient.query(api.agentRunReflections.getForRun, { runId: failedRunId, paginationOpts })).rejects.toThrow(
      "Unauthorized"
    );

    const auditLogs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_AGENT_RUN_REFLECTION",
      "UPDATE_AGENT_RUN_REFLECTION",
      "DISMISS_AGENT_RUN_REFLECTION",
      "CREATE_AGENT_RUN_REFLECTION",
    ]);
  });
});

describe("Automatic reflection (self-improvement, Phase 1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * A failed run with an operator note that context was missing — the shape
   * the taxonomy turns into a proposed memory. No admin presses anything
   * after the run fails; that absence is the behaviour under test.
   */
  async function seedUnattendedFailure(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Unattended Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId,
        userId,
        triggerType: "SCHEDULE",
        objective: "Compile the weekly account summary",
        status: "FAILED",
        startedAt: 100,
        completedAt: 140,
        updatedAt: 140,
        error: "Could not find the account list",
      });
      await ctx.db.insert("agentRunFeedback", {
        runId,
        agentId,
        companyId,
        userId,
        rating: "NEGATIVE",
        labels: ["MISSED_CONTEXT"],
        comment: "The agent never saw the account list document",
        createdAt: 150,
        updatedAt: 150,
      });
      return { companyId, userId, agentId, runId };
    });
  }

  test("a failed run reflects itself, with no author, and the candidate pass follows", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { agentId, runId } = await seedUnattendedFailure(t);

    await t.mutation(internal.agentRunReflections.createForRunInternal, { runId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const reflections = await t.run(async (ctx) =>
      await ctx.db
        .query("agentRunReflections")
        .withIndex("by_run_created", (q) => q.eq("runId", runId))
        .collect()
    );
    expect(reflections).toHaveLength(1);
    expect(reflections[0].category).toBe("MISSING_CONTEXT");
    expect(reflections[0].createdBy).toBeUndefined();
    expect(reflections[0].proposedMemory).toBeTruthy();

    const candidates = await t.run(async (ctx) =>
      await ctx.db
        .query("agentMemoryCandidates")
        .withIndex("by_agent_status_created", (q) => q.eq("agentId", agentId).eq("status", "PROPOSED"))
        .collect()
    );
    expect(candidates.length).toBeGreaterThan(0);
    // The reflection-sourced draft proves the chain ran in order: the
    // candidate pass saw a reflection that did not exist when the run ended.
    expect(candidates.some((candidate) => candidate.proposedBy === "SYSTEM_REFLECTION")).toBe(true);
    // Nothing applied: proposals only, per the human-gate contract.
    expect(candidates.every((candidate) => candidate.status === "PROPOSED")).toBe(true);
    expect(candidates.every((candidate) => candidate.createdBy === undefined)).toBe(true);
  });

  test("a second automatic pass patches the reflection rather than duplicating it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { runId } = await seedUnattendedFailure(t);

    await t.mutation(internal.agentRunReflections.createForRunInternal, { runId });
    await t.mutation(internal.agentRunReflections.createForRunInternal, { runId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const reflections = await t.run(async (ctx) =>
      await ctx.db
        .query("agentRunReflections")
        .withIndex("by_run_created", (q) => q.eq("runId", runId))
        .collect()
    );
    expect(reflections).toHaveLength(1);
  });

  test("a successful run is not reflected", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { agentId, runId } = await seedUnattendedFailure(t);
    const successRunId = await t.run(async (ctx) =>
      await ctx.db.insert("agentRuns", {
        agentId,
        triggerType: "CHAT",
        objective: "Fine run",
        status: "SUCCESS",
        startedAt: 200,
        completedAt: 220,
        updatedAt: 220,
      })
    );

    await t.mutation(internal.agentRunReflections.createForRunInternal, { runId: successRunId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const reflections = await t.run(async (ctx) => await ctx.db.query("agentRunReflections").collect());
    expect(reflections).toHaveLength(0);
    // Unused seed silence: the failed run from the seed was never passed in.
    void runId;
  });

  test("switching autoReflection off skips the write-up but the candidate pass still runs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { agentId, runId } = await seedUnattendedFailure(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        key: SELF_IMPROVEMENT_CONFIG_KEY,
        value: JSON.stringify({ autoReflection: false }),
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.agentRunReflections.createForRunInternal, { runId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const reflections = await t.run(async (ctx) => await ctx.db.query("agentRunReflections").collect());
    expect(reflections).toHaveLength(0);

    // The MISSED_CONTEXT operator feedback still yields a draft on its own,
    // proving the candidate pass was not lost with the reflection switch.
    const candidates = await t.run(async (ctx) =>
      await ctx.db
        .query("agentMemoryCandidates")
        .withIndex("by_agent_status_created", (q) => q.eq("agentId", agentId).eq("status", "PROPOSED"))
        .collect()
    );
    expect(candidates.length).toBeGreaterThan(0);
  });

  test("the automatic pass stops proposing while ten suggestions await review", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, agentId, runId } = await seedUnattendedFailure(t);

    await t.run(async (ctx) => {
      for (let index = 0; index < 10; index += 1) {
        await ctx.db.insert("agentMemoryCandidates", {
          agentId,
          companyId,
          sourceRunId: runId,
          proposedBy: "SYSTEM_REFLECTION",
          kind: "SUMMARY",
          content: `Waiting suggestion number ${index}`,
          normalizedContent: `waiting suggestion number ${index}`,
          confidence: 0.6,
          riskLevel: "LOW",
          status: "PROPOSED",
          createdAt: 1000 + index,
          updatedAt: 1000 + index,
        });
      }
    });

    await t.mutation(internal.agentMemoryCandidates.generateForRunInternal, { runId });

    const candidates = await t.run(async (ctx) =>
      await ctx.db
        .query("agentMemoryCandidates")
        .withIndex("by_agent_status_created", (q) => q.eq("agentId", agentId).eq("status", "PROPOSED"))
        .collect()
    );
    expect(candidates).toHaveLength(10);
  });
});
