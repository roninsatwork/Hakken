import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Agent Eval Fixtures", () => {
  test("admins can convert scoped runs into repeatable eval fixtures", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, agentId, failedRunId, successRunId } = await t.run(async (ctx) => {
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
        name: "Eval Agent",
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
        objective: "Update company overview",
        status: "FAILED",
        error: "Tool argument validation failed",
        startedAt: 100,
        completedAt: 140,
        updatedAt: 140,
      });
      const failedStepId = await ctx.db.insert("agentRunSteps", {
        runId: failedRunId,
        agentId,
        companyId: companyAId,
        stepIndex: 1,
        kind: "TOOL_CALL",
        status: "FAILED",
        error: "JSON schema validation failed",
        startedAt: 110,
        completedAt: 120,
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
        startedAt: 111,
        completedAt: 119,
      });
      const reflectionId = await ctx.db.insert("agentRunReflections", {
        runId: failedRunId,
        agentId,
        companyId: companyAId,
        createdBy: adminAId,
        category: "BAD_TOOL_ARGUMENTS",
        sourceStatus: "FAILED",
        objectiveSummary: "Update company overview",
        failureStepIndex: 1,
        failureStepKind: "TOOL_CALL",
        rootCause: "Tool arguments were invalid.",
        proposedToolChange: "Clarify overview tool schema.",
        proposedEvalFixture: "Create an eval that expects valid tool arguments for this objective.",
        confidence: 0.85,
        evidenceJson: "{}",
        status: "GENERATED",
        createdAt: 130,
        updatedAt: 130,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: failedRunId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "NEGATIVE",
        labels: ["BAD_TOOL_ARGS", "SHOULD_BECOME_EVAL"],
        comment: "Regression test this tool schema.",
        createdAt: 132,
        updatedAt: 132,
      });
      await ctx.db.insert("agentMemoryCandidates", {
        agentId,
        companyId: companyAId,
        sourceRunId: failedRunId,
        sourceReflectionId: reflectionId,
        proposedBy: "SYSTEM_REFLECTION",
        kind: "FACT",
        content: "Overview updates require a structured overview value.",
        normalizedContent: "overview updates require a structured overview value.",
        confidence: 0.7,
        riskLevel: "MEDIUM",
        status: "PROPOSED",
        createdBy: adminAId,
        createdAt: 135,
        updatedAt: 135,
      });

      const successRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Summarize pipeline risk",
        status: "SUCCESS",
        finalOutput: "Pipeline risk summary completed.",
        startedAt: 200,
        completedAt: 230,
        updatedAt: 230,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: successRunId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "POSITIVE",
        labels: ["GOOD_ANSWER"],
        comment: "Good output shape.",
        createdAt: 240,
        updatedAt: 240,
      });

      return { adminAId, adminBId, agentId, failedRunId, successRunId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await expect(adminBClient.mutation(api.agentEvalFixtures.createFromRun, { runId: failedRunId })).rejects.toThrow(
      "Unauthorized"
    );

    const failedFixtureId = await adminAClient.mutation(api.agentEvalFixtures.createFromRun, {
      runId: failedRunId,
      tags: ["Regression", "Tool Args"],
    });
    await adminAClient.mutation(api.agentEvalFixtures.createFromRun, {
      runId: failedRunId,
      tags: ["updated"],
    });
    const successFixtureId = await adminAClient.mutation(api.agentEvalFixtures.createFromRun, {
      runId: successRunId,
    });

    const failedFixtures = await adminAClient.query(api.agentEvalFixtures.getForRun, {
      runId: failedRunId,
      paginationOpts,
    });
    expect(failedFixtures.page).toHaveLength(1);
    expect(failedFixtures.page[0]).toMatchObject({
      _id: failedFixtureId,
      type: "BAD_TOOL_ARGS",
      objective: "Update company overview",
      expectedFinalOutputRubric: "Create an eval that expects valid tool arguments for this objective.",
      status: "ACTIVE",
      tags: ["bad_tool_args", "updated"],
    });
    expect(JSON.parse(failedFixtures.page[0].expectedToolPlanJson || "[]")).toEqual([
      expect.objectContaining({
        handlerMapping: "company.overview.update",
        sideEffectLevel: "WRITE",
        status: "FAILED",
      }),
    ]);
    expect(JSON.parse(failedFixtures.page[0].expectedMemoryUsageJson || "[]")).toEqual([
      expect.objectContaining({
        kind: "FACT",
        status: "PROPOSED",
        riskLevel: "MEDIUM",
      }),
    ]);
    expect(JSON.parse(failedFixtures.page[0].sourceEvidenceJson)).toMatchObject({
      runId: failedRunId,
      runStatus: "FAILED",
      reflectionCategory: "BAD_TOOL_ARGUMENTS",
      stepCount: 1,
      toolCallCount: 1,
      memoryCandidateIds: expect.any(Array),
    });

    const successFixtures = await adminAClient.query(api.agentEvalFixtures.getForRun, {
      runId: successRunId,
      paginationOpts,
    });
    expect(successFixtures.page[0]).toMatchObject({
      _id: successFixtureId,
      type: "HAPPY_PATH",
      expectedFinalOutputRubric: "Expected output should preserve the successful behavior noted by feedback: Good output shape.",
    });

    const recent = await adminAClient.query(api.agentEvalFixtures.getRecentForAgent, { agentId });
    expect(recent.map((fixture) => fixture._id).sort()).toEqual([failedFixtureId, successFixtureId].sort());
    await expect(adminBClient.query(api.agentEvalFixtures.getForRun, { runId: failedRunId, paginationOpts })).rejects.toThrow(
      "Unauthorized"
    );

    const auditLogs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_AGENT_EVAL_FIXTURE",
      "UPDATE_AGENT_EVAL_FIXTURE",
      "CREATE_AGENT_EVAL_FIXTURE",
    ]);
  });
});
