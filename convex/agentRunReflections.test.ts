import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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
