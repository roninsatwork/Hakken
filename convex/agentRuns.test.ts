import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Agent Runs", () => {
  test("internal mutations create durable runs, steps, tool calls, approvals, and usage totals", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, companyId, userId, toolId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        companyId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Run Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const toolId = await ctx.db.insert("aiTools", {
        name: "Knowledge Search",
        description: "Search scoped knowledge.",
        handlerMapping: "knowledge.search",
        requiredRole: "ADMIN",
        createdAt: Date.now(),
        createdBy: superAdminId,
      });

      return { agentId, companyId, userId, toolId };
    });

    const runId = await t.mutation(internal.agentRuns.createRunInternal, {
      agentId,
      companyId,
      userId,
      triggerType: "CHAT",
      objective: "Find the latest tenant policy.",
      modelId: "model-test",
      providerKey: "google",
      providerModelId: "provider-model-test",
      maxSteps: 3,
    });

    const stepId = await t.mutation(internal.agentRuns.appendStepInternal, {
      runId,
      agentId,
      companyId,
      stepIndex: 1,
      kind: "PLAN",
      status: "SUCCESS",
      input: "Objective",
      output: "Search knowledge first.",
    });

    const toolCallId = await t.mutation(internal.agentRuns.insertToolCallInternal, {
      runId,
      stepId,
      agentId,
      toolId,
      normalizedToolName: "knowledge_search",
      handlerMapping: "knowledge.search",
      argumentsJson: '{"query":"policy"}',
      redactedArgumentsJson: '{"query":"policy"}',
      resultJson: '{"matches":1}',
      status: "SUCCESS",
      requiredRole: "ADMIN",
      sideEffectLevel: "READ",
      confirmationRequired: false,
      companyId,
      userId,
    });

    await t.mutation(internal.agentRuns.insertApprovalInternal, {
      runId,
      stepId,
      toolCallId,
      agentId,
      companyId,
      requestedBy: userId,
      status: "PENDING",
      message: "Approve knowledge lookup?",
      previewJson: '{"tool":"knowledge_search"}',
    });

    await t.mutation(internal.agentRuns.recordRunUsageInternal, {
      runId,
      inputTokens: 12,
      outputTokens: 34,
      costGBP: 0.02,
      modelId: "model-test",
      providerKey: "google",
      providerModelId: "provider-model-test",
    });

    await t.mutation(internal.agentRuns.updateRunStatusInternal, {
      runId,
      status: "SUCCESS",
      finalOutput: "Policy found.",
    });

    const { run, steps, toolCalls, approvals } = await t.run(async (ctx) => ({
      run: await ctx.db.get(runId),
      steps: await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", runId)).collect(),
      toolCalls: await ctx.db.query("agentToolCalls").withIndex("by_run_started", (q) => q.eq("runId", runId)).collect(),
      approvals: await ctx.db.query("agentRunApprovals").withIndex("by_run_requested", (q) => q.eq("runId", runId)).collect(),
    }));

    expect(run).toMatchObject({
      agentId,
      companyId,
      userId,
      triggerType: "CHAT",
      objective: "Find the latest tenant policy.",
      status: "SUCCESS",
      inputTokens: 12,
      outputTokens: 34,
      costGBP: 0.02,
      finalOutput: "Policy found.",
    });
    expect(run?.startedAt).toEqual(expect.any(Number));
    expect(run?.completedAt).toEqual(expect.any(Number));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: "PLAN", status: "SUCCESS", stepIndex: 1 });
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ normalizedToolName: "knowledge_search", status: "SUCCESS" });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ status: "PENDING", message: "Approve knowledge lookup?" });
  });

  test("public trigger creates a tenant-scoped queued webhook run with a version snapshot", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { activeAgentId, inactiveAgentId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Public API Company", createdAt: Date.now() });
      const activeAgentId = await ctx.db.insert("agents", {
        name: "Public Trigger Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const inactiveAgentId = await ctx.db.insert("agents", {
        name: "Inactive Public Trigger Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { activeAgentId, inactiveAgentId, companyId };
    });

    const created = await t.mutation(internal.agentRuns.createPublicAgentRunInternal, {
      agentId: activeAgentId,
      companyId,
      objective: "  Create a tenant summary from the public API.  ",
    });
    expect(created.status).toBe("QUEUED");

    const state = await t.run(async (ctx) => {
      const run = await ctx.db.get(created.runId);
      const version = run?.agentVersionId ? await ctx.db.get(run.agentVersionId) : null;
      return { run, version };
    });
    expect(state.run).toMatchObject({
      agentId: activeAgentId,
      companyId,
      triggerType: "WEBHOOK",
      objective: "Create a tenant summary from the public API.",
      status: "QUEUED",
    });
    expect(state.run?.userId).toBeUndefined();
    expect(state.run?.agentVersionId).toBeDefined();
    expect(state.version).toMatchObject({
      agentId: activeAgentId,
      companyId,
      versionNumber: 1,
    });

    await expect(t.mutation(internal.agentRuns.createPublicAgentRunInternal, {
      agentId: inactiveAgentId,
      companyId,
      objective: "Should not run",
    })).rejects.toThrow("Agent not found or inactive");

    await expect(t.mutation(internal.agentRuns.createPublicAgentRunInternal, {
      agentId: activeAgentId,
      companyId,
      objective: " ",
    })).rejects.toThrow("Objective is required");
  });

  test("admins see only their company agent runs while super admins see all runs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, adminAId, adminBId, orphanAdminId, superAdminId, runAId, runBId } = await t.run(async (ctx) => {
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
      const orphanAdminId = await ctx.db.insert("users", {
        email: "orphan@example.com",
        role: "ADMIN",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Scoped Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Company A objective",
        status: "RUNNING",
        startedAt: 100,
        updatedAt: 100,
      });
      const runBId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyBId,
        userId: adminBId,
        triggerType: "CHAT",
        objective: "Company B objective",
        status: "SUCCESS",
        startedAt: 200,
        updatedAt: 200,
        completedAt: 250,
      });

      return { agentId, adminAId, adminBId, orphanAdminId, superAdminId, runAId, runBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const orphanAdminClient = t.withIdentity({ subject: orphanAdminId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminAPage = await adminAClient.query(api.agentRuns.getForAgent, { agentId, paginationOpts });
    expect(adminAPage.page.map((run) => run._id)).toEqual([runAId]);

    const adminBSuccessPage = await adminBClient.query(api.agentRuns.getForAgent, {
      agentId,
      paginationOpts,
      status: "SUCCESS",
    });
    expect(adminBSuccessPage.page.map((run) => run._id)).toEqual([runBId]);

    const superAdminPage = await superAdminClient.query(api.agentRuns.getForAgent, { agentId, paginationOpts });
    expect(superAdminPage.page.map((run) => run._id)).toEqual([runBId, runAId]);

    await expect(orphanAdminClient.query(api.agentRuns.getForAgent, { agentId, paginationOpts })).rejects.toThrow(
      "Unauthorized"
    );
    await expect(t.query(api.agentRuns.getForAgent, { agentId, paginationOpts })).rejects.toThrow(
      "Unauthenticated request"
    );
  });

  test("run details include steps, tool calls, and approvals with tenant boundaries", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, superAdminId, runId } = await t.run(async (ctx) => {
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
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Detail Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Detail objective",
        status: "FAILED",
        error: "Tool approval did not complete",
        startedAt: 100,
        completedAt: 130,
        updatedAt: 130,
      });
      const stepId = await ctx.db.insert("agentRunSteps", {
        runId,
        agentId,
        companyId: companyAId,
        stepIndex: 1,
        kind: "TOOL_CALL",
        status: "SUCCESS",
        input: "{}",
        output: "{}",
        startedAt: 110,
        completedAt: 120,
      });
      const toolCallId = await ctx.db.insert("agentToolCalls", {
        runId,
        stepId,
        agentId,
        normalizedToolName: "crm_lookup",
        handlerMapping: "crm.lookup",
        argumentsJson: "{\"customerEmail\":\"private@example.com\",\"query\":\"renewal\"}",
        redactedArgumentsJson: "{\"customerEmail\":\"[redacted]\",\"query\":\"renewal\"}",
        status: "APPROVAL_REQUIRED",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: true,
        companyId: companyAId,
        userId: adminAId,
        startedAt: 115,
      });
      await ctx.db.insert("agentRunApprovals", {
        runId,
        stepId,
        toolCallId,
        agentId,
        companyId: companyAId,
        requestedBy: adminAId,
        status: "PENDING",
        requestedAt: 116,
      });
      await ctx.db.insert("agentEvalFixtures", {
        agentId,
        companyId: companyAId,
        sourceRunId: runId,
        createdBy: adminAId,
        type: "BAD_TOOL_ARGS",
        objective: "Detail objective",
        expectedFinalOutputRubric: "The agent should recover from invalid tool arguments.",
        sourceEvidenceJson: "{}",
        tags: ["bad_tool_args"],
        status: "ACTIVE",
        createdAt: 125,
        updatedAt: 126,
      });

      return { adminAId, adminBId, superAdminId, runId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminDetail = await adminAClient.query(api.agentRuns.getRunDetail, { runId });
    expect(adminDetail?.run._id).toBe(runId);
    expect(adminDetail?.steps).toHaveLength(1);
    expect(adminDetail?.toolCalls).toHaveLength(1);
    expect(adminDetail?.toolCalls[0]).toMatchObject({
      argumentsPreview: "{\n  \"customerEmail\": \"[redacted]\",\n  \"query\": \"renewal\"\n}",
      redactedArgumentsPreview: "{\n  \"customerEmail\": \"[redacted]\",\n  \"query\": \"renewal\"\n}",
      argumentViewMode: "REDACTED",
      rawArgumentsAvailable: true,
    });
    expect(adminDetail?.toolCalls[0]).not.toHaveProperty("argumentsJson");
    expect(adminDetail?.toolCalls[0]).not.toHaveProperty("redactedArgumentsJson");
    expect(adminDetail?.approvals).toHaveLength(1);
    expect(adminDetail?.evalFixtureContext).toMatchObject({
      canCreateFromRun: true,
      activeCount: 1,
      archivedCount: 0,
      fixtures: [
        expect.objectContaining({
          type: "BAD_TOOL_ARGS",
          status: "ACTIVE",
          tags: ["bad_tool_args"],
        }),
      ],
    });
    expect(adminDetail?.timeline).toEqual([
      expect.objectContaining({
        stepIndex: 1,
        kind: "TOOL_CALL",
        status: "SUCCESS",
        durationMs: 10,
        inputPreview: "{}",
        outputPreview: "{}",
        linkedToolCalls: [expect.objectContaining({
          handlerMapping: "crm.lookup",
          status: "APPROVAL_REQUIRED",
        })],
        linkedApprovals: [expect.objectContaining({
          status: "PENDING",
        })],
      }),
    ]);

    const superAdminDetail = await superAdminClient.query(api.agentRuns.getRunDetail, { runId });
    expect(superAdminDetail?.run._id).toBe(runId);
    expect(superAdminDetail?.toolCalls[0]).toMatchObject({
      argumentsPreview: "{\n  \"customerEmail\": \"private@example.com\",\n  \"query\": \"renewal\"\n}",
      rawArgumentsPreview: "{\n  \"customerEmail\": \"private@example.com\",\n  \"query\": \"renewal\"\n}",
      argumentViewMode: "RAW",
      rawArgumentsAvailable: true,
    });
    expect(superAdminDetail?.toolCalls[0]).not.toHaveProperty("argumentsJson");

    await expect(adminBClient.query(api.agentRuns.getRunDetail, { runId })).rejects.toThrow("Unauthorized");
  });

  test("public run status reader returns sanitized tenant-scoped state", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, agentId, runAId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const agentId = await ctx.db.insert("agents", {
        name: "Public Status Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        triggerType: "WEBHOOK",
        objective: "Prepare public status summary",
        status: "SUCCESS",
        finalOutput: JSON.stringify({ answer: "Completed", privateTrace: "omit raw internals" }),
        startedAt: 100,
        completedAt: 180,
        updatedAt: 180,
        inputTokens: 10,
        outputTokens: 20,
        costGBP: 0.01,
      });
      const stepId = await ctx.db.insert("agentRunSteps", {
        runId: runAId,
        agentId,
        companyId: companyAId,
        stepIndex: 1,
        kind: "MODEL",
        status: "SUCCESS",
        input: "Sensitive prompt",
        output: "Safe result",
        startedAt: 110,
        completedAt: 170,
      });
      await ctx.db.insert("agentToolCalls", {
        runId: runAId,
        stepId,
        agentId,
        companyId: companyAId,
        normalizedToolName: "knowledge.search",
        handlerMapping: "knowledge.search",
        argumentsJson: JSON.stringify({ query: "private" }),
        status: "SUCCESS",
        sideEffectLevel: "READ",
        requiredRole: "ADMIN",
        confirmationRequired: false,
        startedAt: 120,
        completedAt: 130,
      });
      await ctx.db.insert("agentRunApprovals", {
        runId: runAId,
        stepId,
        agentId,
        companyId: companyAId,
        message: "Approval evidence",
        status: "APPROVED",
        requestedAt: 130,
        reviewedAt: 140,
      });

      return { companyAId, companyBId, agentId, runAId };
    });

    const status = await t.query(internal.agentRuns.getPublicRunStatusInternal, {
      runId: runAId,
      companyId: companyAId,
    });
    expect(status).toMatchObject({
      runId: runAId,
      agentId,
      companyId: companyAId,
      status: "SUCCESS",
      triggerType: "WEBHOOK",
      objective: "Prepare public status summary",
      latencyMs: 80,
      inputTokens: 10,
      outputTokens: 20,
      costGBP: 0.01,
      counts: {
        steps: 1,
        approvals: 1,
        toolCalls: 1,
      },
    });
    expect(status?.finalOutputPreview).toContain("Completed");
    expect(JSON.stringify(status)).not.toContain("Sensitive prompt");
    expect(JSON.stringify(status)).not.toContain("argumentsJson");

    await expect(t.query(internal.agentRuns.getPublicRunStatusInternal, {
      runId: runAId,
      companyId: companyBId,
    })).resolves.toBeNull();
  });

  test("pending approval list and decisions are tenant-scoped and audited", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const {
      adminAId,
      adminBId,
      superAdminId,
      approvalAId,
      approvalBId,
      toolCallAId,
      runAId,
      runBId,
    } = await t.run(async (ctx) => {
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
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Approval Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Company A approval",
        status: "PENDING_APPROVAL",
        startedAt: 100,
        updatedAt: 100,
      });
      const stepAId = await ctx.db.insert("agentRunSteps", {
        runId: runAId,
        agentId,
        companyId: companyAId,
        stepIndex: 1,
        kind: "APPROVAL_REQUEST",
        status: "PENDING",
        startedAt: 101,
      });
      const toolCallAId = await ctx.db.insert("agentToolCalls", {
        runId: runAId,
        stepId: stepAId,
        agentId,
        normalizedToolName: "knowledge_search",
        handlerMapping: "knowledge.search",
        argumentsJson: '{"query":"policy"}',
        status: "APPROVAL_REQUIRED",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: true,
        companyId: companyAId,
        userId: adminAId,
        startedAt: 101,
      });
      const approvalAId = await ctx.db.insert("agentRunApprovals", {
        runId: runAId,
        stepId: stepAId,
        toolCallId: toolCallAId,
        agentId,
        companyId: companyAId,
        requestedBy: adminAId,
        status: "PENDING",
        message: "Approve A?",
        requestedAt: 102,
      });

      const runBId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyBId,
        userId: adminBId,
        triggerType: "CHAT",
        objective: "Company B approval",
        status: "PENDING_APPROVAL",
        startedAt: 200,
        updatedAt: 200,
      });
      const stepBId = await ctx.db.insert("agentRunSteps", {
        runId: runBId,
        agentId,
        companyId: companyBId,
        stepIndex: 1,
        kind: "APPROVAL_REQUEST",
        status: "PENDING",
        startedAt: 201,
      });
      const toolCallBId = await ctx.db.insert("agentToolCalls", {
        runId: runBId,
        stepId: stepBId,
        agentId,
        normalizedToolName: "external_sync",
        handlerMapping: "external.sync",
        argumentsJson: "{}",
        status: "APPROVAL_REQUIRED",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        companyId: companyBId,
        userId: adminBId,
        startedAt: 201,
      });
      const approvalBId = await ctx.db.insert("agentRunApprovals", {
        runId: runBId,
        stepId: stepBId,
        toolCallId: toolCallBId,
        agentId,
        companyId: companyBId,
        requestedBy: adminBId,
        status: "PENDING",
        message: "Approve B?",
        requestedAt: 202,
      });

      return { adminAId, adminBId, superAdminId, approvalAId, approvalBId, toolCallAId, runAId, runBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminAPending = await adminAClient.query(api.agentRuns.getPendingApprovals, { paginationOpts });
    expect(adminAPending.page.map((entry) => entry.approval._id)).toEqual([approvalAId]);

    const superAdminPending = await superAdminClient.query(api.agentRuns.getPendingApprovals, { paginationOpts });
    expect(superAdminPending.page.map((entry) => entry.approval._id)).toEqual([approvalBId, approvalAId]);

    await expect(
      adminBClient.mutation(api.agentRuns.decideApproval, {
        approvalId: approvalAId,
        decision: "REJECTED",
        decisionReason: "Wrong tenant",
      })
    ).rejects.toThrow("Unauthorized");

    await adminAClient.mutation(api.agentRuns.decideApproval, {
      approvalId: approvalAId,
      decision: "APPROVED",
      decisionReason: "Looks safe",
    });

    const approvedState = await t.run(async (ctx) => ({
      approval: await ctx.db.get(approvalAId),
      toolCall: await ctx.db.get(toolCallAId),
      run: await ctx.db.get(runAId),
    }));
    expect(approvedState.approval).toMatchObject({ status: "APPROVED", reviewedBy: adminAId });
    expect(approvedState.toolCall).toMatchObject({ status: "PENDING" });
    expect(approvedState.toolCall?.confirmationGrantedAt).toEqual(expect.any(Number));
    expect(approvedState.run).toMatchObject({ status: "RUNNING" });

    await adminBClient.mutation(api.agentRuns.decideApproval, {
      approvalId: approvalBId,
      decision: "REJECTED",
      decisionReason: "Not approved",
    });

    const rejectedState = await t.run(async (ctx) => ({
      approval: await ctx.db.get(approvalBId),
      run: await ctx.db.get(runBId),
      steps: await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", runBId)).collect(),
    }));
    expect(rejectedState.approval).toMatchObject({ status: "REJECTED", reviewedBy: adminBId });
    expect(rejectedState.run).toMatchObject({
      status: "FAILED",
      finalOutput: "Agent approval rejected: Not approved",
      error: "Agent approval rejected: Not approved",
    });
    expect(rejectedState.steps.at(-1)).toMatchObject({
      kind: "FINAL",
      status: "FAILED",
      output: "Agent approval rejected: Not approved",
    });
  });

  test("run analytics summarize cost, reliability, tools, approvals, and tenant scope", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, adminAId, superAdminId } = await t.run(async (ctx) => {
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
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Analytics Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const successRunAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Summarize policy",
        status: "SUCCESS",
        modelId: "model-a",
        providerKey: "google",
        providerModelId: "provider-model-a",
        inputTokens: 100,
        outputTokens: 20,
        costGBP: 0.12,
        startedAt: 100,
        completedAt: 160,
        updatedAt: 160,
      });
      const failedRunAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "WORKFLOW",
        objective: "Update overview",
        status: "FAILED",
        modelId: "model-a",
        providerKey: "google",
        providerModelId: "provider-model-a",
        inputTokens: 40,
        outputTokens: 10,
        costGBP: 0.02,
        startedAt: 200,
        completedAt: 250,
        updatedAt: 250,
        error: "Tool args failed validation",
      });
      const pendingRunAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "MANUAL",
        objective: "Needs approval",
        status: "PENDING_APPROVAL",
        startedAt: 300,
        updatedAt: 300,
      });
      await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyBId,
        userId: adminBId,
        triggerType: "SCHEDULE",
        objective: "Company B report",
        status: "SUCCESS",
        costGBP: 0.77,
        startedAt: 400,
        completedAt: 410,
        updatedAt: 410,
      });

      await ctx.db.insert("agentToolCalls", {
        runId: successRunAId,
        agentId,
        normalizedToolName: "knowledge_search",
        handlerMapping: "knowledge.search",
        argumentsJson: "{}",
        resultJson: "{}",
        status: "SUCCESS",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        companyId: companyAId,
        userId: adminAId,
        startedAt: 120,
        completedAt: 130,
      });
      await ctx.db.insert("agentToolCalls", {
        runId: failedRunAId,
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
        startedAt: 220,
        completedAt: 230,
      });
      const approvalToolCallId = await ctx.db.insert("agentToolCalls", {
        runId: pendingRunAId,
        agentId,
        normalizedToolName: "overview_update",
        handlerMapping: "company.overview.update",
        argumentsJson: "{}",
        status: "APPROVAL_REQUIRED",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        companyId: companyAId,
        userId: adminAId,
        startedAt: 310,
      });
      await ctx.db.insert("agentRunApprovals", {
        runId: pendingRunAId,
        toolCallId: approvalToolCallId,
        agentId,
        companyId: companyAId,
        requestedBy: adminAId,
        status: "PENDING",
        requestedAt: 315,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: successRunAId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "POSITIVE",
        labels: ["GOOD_ANSWER"],
        comment: "Useful summary.",
        createdAt: 320,
        updatedAt: 320,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: failedRunAId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "NEGATIVE",
        labels: ["BAD_TOOL_ARGS", "SHOULD_BECOME_EVAL"],
        comment: "Bad tool arguments.",
        createdAt: 330,
        updatedAt: 330,
      });
      await ctx.db.insert("agentToolCalls", {
        runId: successRunAId,
        agentId,
        normalizedToolName: "foreign_lookup",
        handlerMapping: "knowledge.search",
        argumentsJson: "{}",
        resultJson: "{}",
        status: "SUCCESS",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        companyId: companyBId,
        userId: adminBId,
        startedAt: 410,
        completedAt: 415,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: successRunAId,
        agentId,
        companyId: companyBId,
        userId: adminBId,
        rating: "POSITIVE",
        labels: ["GOOD_ANSWER"],
        createdAt: 420,
        updatedAt: 420,
      });

      return { agentId, adminAId, superAdminId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminAnalytics = await adminAClient.query(api.agentRuns.getAnalyticsForAgent, { agentId });
    expect(adminAnalytics.totals).toMatchObject({
      runs: 3,
      successfulRuns: 1,
      failedRuns: 1,
      activeRuns: 1,
      toolCalls: 3,
      approvals: 1,
      feedback: 2,
      inputTokens: 140,
      outputTokens: 30,
      successRate: 0.5,
      positiveFeedbackRate: 0.5,
      averageLatencyMs: 55,
    });
    expect(adminAnalytics.totals.costGBP).toBeCloseTo(0.14);
    expect(adminAnalytics.statusCounts).toMatchObject({ SUCCESS: 1, FAILED: 1, PENDING_APPROVAL: 1 });
    expect(adminAnalytics.triggerCounts).toMatchObject({ CHAT: 1, WORKFLOW: 1, MANUAL: 1 });
    expect(adminAnalytics.approvalCounts).toMatchObject({ PENDING: 1 });
    expect(adminAnalytics.feedbackCounts).toMatchObject({ POSITIVE: 1, NEGATIVE: 1, NEUTRAL: 0 });
    expect([...adminAnalytics.feedbackLabelCounts].sort((a, b) => a.label.localeCompare(b.label))).toEqual([
      { label: "BAD_TOOL_ARGS", count: 1 },
      { label: "GOOD_ANSWER", count: 1 },
      { label: "SHOULD_BECOME_EVAL", count: 1 },
    ]);
    expect(adminAnalytics.toolStats.find((tool) => tool.handlerMapping === "company.overview.update")).toMatchObject({
      calls: 2,
      failures: 1,
      approvalsRequired: 1,
    });
    expect(adminAnalytics.failureReasons).toEqual([{ reason: "Tool args failed validation", count: 1 }]);

    const superAdminAnalytics = await superAdminClient.query(api.agentRuns.getAnalyticsForAgent, { agentId });
    expect(superAdminAnalytics.totals.runs).toBe(4);
    expect(superAdminAnalytics.totals.costGBP).toBeCloseTo(0.91);
    expect(superAdminAnalytics.totals.toolCalls).toBe(4);
    expect(superAdminAnalytics.totals.feedback).toBe(3);
  });

  test("run observatory summarizes recent runs across visible agents", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, superAdminId } = await t.run(async (ctx) => {
      const now = Date.now();
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
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
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const supportAgentId = await ctx.db.insert("agents", {
        name: "Support Agent",
        modelId: "model-support",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const billingAgentId = await ctx.db.insert("agents", {
        name: "Billing Agent",
        modelId: "model-billing",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const successRunId = await ctx.db.insert("agentRuns", {
        agentId: supportAgentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Answer support question",
        status: "SUCCESS",
        modelId: "model-support",
        providerKey: "openai",
        inputTokens: 100,
        outputTokens: 30,
        costGBP: 0.2,
        startedAt: now - 10_000,
        completedAt: now - 9_000,
        updatedAt: now - 9_000,
      });
      const failedRunId = await ctx.db.insert("agentRuns", {
        agentId: billingAgentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "WORKFLOW",
        objective: "Prepare billing exception",
        status: "FAILED",
        modelId: "model-billing",
        providerKey: "google",
        inputTokens: 50,
        outputTokens: 10,
        costGBP: 0.1,
        startedAt: now - 8_000,
        completedAt: now - 7_000,
        updatedAt: now - 7_000,
        error: "Tool validation failed",
      });
      await ctx.db.insert("agentRuns", {
        agentId: supportAgentId,
        companyId: companyBId,
        userId: adminBId,
        triggerType: "SCHEDULE",
        objective: "Foreign tenant report",
        status: "FAILED",
        modelId: "model-support",
        providerKey: "openai",
        costGBP: 9,
        startedAt: now - 6_000,
        completedAt: now - 5_000,
        updatedAt: now - 5_000,
        error: "Foreign tenant failure",
      });
      await ctx.db.insert("agentToolCalls", {
        runId: successRunId,
        agentId: supportAgentId,
        normalizedToolName: "knowledge_search",
        handlerMapping: "knowledge.search",
        argumentsJson: "{}",
        resultJson: "{}",
        status: "SUCCESS",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        companyId: companyAId,
        userId: adminAId,
        startedAt: now - 9_800,
        completedAt: now - 9_700,
      });
      await ctx.db.insert("agentToolCalls", {
        runId: failedRunId,
        agentId: billingAgentId,
        normalizedToolName: "billing_update",
        handlerMapping: "billing.exception.update",
        argumentsJson: "{}",
        status: "FAILED",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        companyId: companyAId,
        userId: adminAId,
        startedAt: now - 7_800,
        completedAt: now - 7_700,
      });

      return { adminAId, superAdminId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminObservatory = await adminAClient.query(api.agentRuns.getRunObservatory, { lookbackDays: 1 });
    expect(adminObservatory.scope).toBe("company");
    expect(adminObservatory.totals).toMatchObject({
      runs: 2,
      successfulRuns: 1,
      failedRuns: 1,
      activeRuns: 0,
      inputTokens: 150,
      outputTokens: 40,
      successRate: 0.5,
      averageLatencyMs: 1000,
    });
    expect(adminObservatory.totals.costGBP).toBeCloseTo(0.3);
    expect(adminObservatory.agentStats).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentName: "Billing Agent", failures: 1 }),
      expect.objectContaining({ agentName: "Support Agent", runs: 1 }),
    ]));
    expect(adminObservatory.toolStats).toEqual(expect.arrayContaining([
      expect.objectContaining({ handlerMapping: "billing.exception.update", calls: 1, failures: 1, writeOrExternal: 1 }),
    ]));
    expect(adminObservatory.failureReasons).toEqual([{ reason: "Tool validation failed", count: 1 }]);
    expect(adminObservatory.recentRuns.map((run) => run.objective)).not.toContain("Foreign tenant report");

    const superAdminObservatory = await superAdminClient.query(api.agentRuns.getRunObservatory, { lookbackDays: 1 });
    expect(superAdminObservatory.scope).toBe("platform");
    expect(superAdminObservatory.totals.runs).toBe(3);
    expect(superAdminObservatory.failureReasons).toEqual(expect.arrayContaining([
      { reason: "Foreign tenant failure", count: 1 },
      { reason: "Tool validation failed", count: 1 },
    ]));
  });

  test("failed runs can be replayed and active runs can be cancelled with cleanup", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, failedRunId, successRunId, pendingRunId, pendingApprovalId, pendingToolCallId, sourceVersionId } = await t.run(async (ctx) => {
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
        name: "Replay Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const sourceVersionId = await ctx.db.insert("agentVersions", {
        agentId,
        companyId: companyAId,
        versionNumber: 1,
        snapshotHash: "source-version-hash",
        snapshotJson: JSON.stringify({
          prompt: { systemPrompt: "Use the historical replay prompt." },
          model: { modelId: "historical-model", modelSelectionMode: "manual", temperature: 0.2 },
          tools: [
            {
              id: "historical-tool-read",
              name: "company_lookup",
              description: "Look up company records.",
              handlerMapping: "company.lookup",
              requiredRole: "ADMIN",
              sideEffectLevel: "READ",
              confirmationRequired: false,
              inputSchema: "{\"type\":\"object\"}",
              isActive: true,
              version: "1.0.0",
              updatedAt: 87,
            },
            {
              id: "historical-tool-write",
              name: "company_update",
              description: "Update company records.",
              handlerMapping: "company.overview.update",
              requiredRole: "ADMIN",
              sideEffectLevel: "WRITE",
              confirmationRequired: true,
              inputSchema: "{\"type\":\"object\"}",
              isActive: true,
              version: "1.0.0",
              updatedAt: 87,
            },
          ],
          memory: {
            activeCount: 2,
            latestUpdatedAt: 89,
            items: [
              {
                kind: "FACT",
                content: "Historical memory: prefer concise replay outputs.",
                importance: 0.8,
                updatedAt: 88,
              },
            ],
          },
          rules: [
            {
              name: "Replay rule",
              trigger: "replay",
              instruction: "Keep the historical replay answer short.",
              priority: 5,
            },
          ],
        }),
        promptHash: "source-prompt",
        toolSetHash: "source-tools",
        memoryRevisionHash: "source-memory",
        ruleSetHash: "source-rules",
        modelConfigHash: "source-model",
        policyHash: "source-policy",
        createdAt: 90,
      });
      const failedRunId = await ctx.db.insert("agentRuns", {
        agentId,
        agentVersionId: sourceVersionId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "WORKFLOW",
        objective: "Try a replayable task",
        status: "FAILED",
        modelId: "model-test",
        providerKey: "google",
        providerModelId: "provider-model-test",
        startedAt: 100,
        completedAt: 140,
        updatedAt: 140,
        error: "Provider failed",
      });
      const successRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Successful task",
        status: "SUCCESS",
        startedAt: 150,
        completedAt: 170,
        updatedAt: 170,
      });
      const pendingRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "MANUAL",
        objective: "Pending approval task",
        status: "PENDING_APPROVAL",
        startedAt: 200,
        updatedAt: 200,
      });
      const pendingStepId = await ctx.db.insert("agentRunSteps", {
        runId: pendingRunId,
        agentId,
        companyId: companyAId,
        stepIndex: 1,
        kind: "APPROVAL_REQUEST",
        status: "PENDING",
        startedAt: 210,
      });
      const pendingToolCallId = await ctx.db.insert("agentToolCalls", {
        runId: pendingRunId,
        stepId: pendingStepId,
        agentId,
        normalizedToolName: "overview_update",
        handlerMapping: "company.overview.update",
        argumentsJson: "{}",
        status: "APPROVAL_REQUIRED",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        companyId: companyAId,
        userId: adminAId,
        startedAt: 212,
      });
      const pendingApprovalId = await ctx.db.insert("agentRunApprovals", {
        runId: pendingRunId,
        stepId: pendingStepId,
        toolCallId: pendingToolCallId,
        agentId,
        companyId: companyAId,
        requestedBy: adminAId,
        status: "PENDING",
        requestedAt: 213,
      });

      return { adminAId, adminBId, failedRunId, successRunId, pendingRunId, pendingApprovalId, pendingToolCallId, sourceVersionId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await expect(adminBClient.mutation(api.agentRuns.replayRun, { runId: failedRunId })).rejects.toThrow("Unauthorized");
    await expect(adminAClient.mutation(api.agentRuns.replayRun, { runId: successRunId })).rejects.toThrow(
      "Only failed or cancelled runs can be replayed"
    );

    const replay = await adminAClient.mutation(api.agentRuns.replayRun, { runId: failedRunId });
    const replayState = await t.run(async (ctx) => ({
      run: await ctx.db.get(replay.runId),
      steps: await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", replay.runId)).collect(),
      replayLogs: await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("actionType"), "REPLAY_AGENT_RUN"))
        .collect(),
    }));
    expect(replayState.run).toMatchObject({
      objective: "Try a replayable task",
      status: "QUEUED",
      triggerType: "MANUAL",
      userId: adminAId,
      replayOfRunId: failedRunId,
      replayMode: "CURRENT_ACTIVE",
    });
    expect(replayState.run?.agentVersionId).not.toBe(sourceVersionId);
    expect(replayState.steps[0]).toMatchObject({ kind: "OBSERVE", status: "SUCCESS" });
    expect(replayState.replayLogs).toHaveLength(1);
    expect(JSON.parse(replayState.replayLogs[0]?.metadata || "{}")).toMatchObject({
      sourceRunId: failedRunId,
      sourceStatus: "FAILED",
      replayMode: "CURRENT_ACTIVE",
    });

    const sourceDetail = await adminAClient.query(api.agentRuns.getRunDetail, { runId: failedRunId });
    expect(sourceDetail?.replayContext.sourceRun).toBeNull();
    expect(sourceDetail?.replayContext.replayRuns).toEqual([
      expect.objectContaining({
        runId: replay.runId,
        status: "QUEUED",
        replayMode: "CURRENT_ACTIVE",
      }),
    ]);

    const replayDetail = await adminAClient.query(api.agentRuns.getRunDetail, { runId: replay.runId });
    expect(replayDetail?.replayContext.sourceRun).toEqual(expect.objectContaining({
      runId: failedRunId,
      status: "FAILED",
      errorPreview: "Provider failed",
    }));
    expect(replayDetail?.replayContext.comparison).toEqual(expect.objectContaining({
      statusChanged: true,
      sourceStatus: "FAILED",
      replayStatus: "QUEUED",
      stepCountDelta: 1,
      outputChanged: false,
      errorChanged: true,
    }));
    expect(replayDetail?.replayContext.timelineDiff).toEqual([
      expect.objectContaining({
        stepIndex: 1,
        changeType: "ADDED",
        kindChanged: true,
        statusChanged: true,
        outputChanged: true,
        errorChanged: false,
        replay: expect.objectContaining({
          kind: "OBSERVE",
          status: "SUCCESS",
          outputPreview: expect.stringContaining("Replay requested from run"),
        }),
      }),
    ]);

    const sameVersionReplay = await adminAClient.mutation(api.agentRuns.replayRun, {
      runId: failedRunId,
      mode: "SAME_VERSION",
    });
    const sameVersionReplayState = await t.run(async (ctx) => ({
      run: await ctx.db.get(sameVersionReplay.runId),
      replayLogs: await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("entityId"), sameVersionReplay.runId))
        .collect(),
    }));
    expect(sameVersionReplay).toMatchObject({
      replayOfRunId: failedRunId,
      replayMode: "SAME_VERSION",
    });
    expect(sameVersionReplayState.run).toMatchObject({
      agentVersionId: sourceVersionId,
      replayOfRunId: failedRunId,
      replayMode: "SAME_VERSION",
    });
    expect(JSON.parse(sameVersionReplayState.replayLogs[0]?.metadata || "{}")).toMatchObject({
      sourceRunId: failedRunId,
      replayMode: "SAME_VERSION",
    });
    const sameVersionExecutionContext = await t.query(internal.agentRuns.getReplayExecutionContextInternal, {
      runId: sameVersionReplay.runId,
    });
    expect(sameVersionExecutionContext).toMatchObject({
      replayMode: "SAME_VERSION",
      replayOfRunId: failedRunId,
      agentVersionId: sourceVersionId,
      versionNumber: 1,
      snapshotHash: "source-version-hash",
      promptHash: "source-prompt",
      toolSetHash: "source-tools",
      memoryRevisionHash: "source-memory",
      ruleSetHash: "source-rules",
      modelConfigHash: "source-model",
      policyHash: "source-policy",
      systemPrompt: "Use the historical replay prompt.",
      modelId: "historical-model",
      temperature: 0.2,
      toolCount: 2,
      tools: [
        {
          id: "historical-tool-read",
          name: "company_lookup",
          description: "Look up company records.",
          handlerMapping: "company.lookup",
          requiredRole: "ADMIN",
          sideEffectLevel: "READ",
          confirmationRequired: false,
          inputSchema: "{\"type\":\"object\"}",
          isActive: true,
          version: "1.0.0",
          updatedAt: 87,
          replayExecutable: true,
          replayPolicy: "TEST_MODE_CANDIDATE",
        },
        {
          id: "historical-tool-write",
          name: "company_update",
          description: "Update company records.",
          handlerMapping: "company.overview.update",
          requiredRole: "ADMIN",
          sideEffectLevel: "WRITE",
          confirmationRequired: true,
          inputSchema: "{\"type\":\"object\"}",
          isActive: true,
          version: "1.0.0",
          updatedAt: 87,
          replayExecutable: false,
          replayPolicy: "BLOCKED",
          replayBlockedReason: "Historical replay does not execute write, destructive, or external tools.",
        },
      ],
      memoryActiveCount: 2,
      ruleCount: 1,
      memoryContents: [
        {
          kind: "FACT",
          content: "Historical memory: prefer concise replay outputs.",
          importance: 0.8,
          updatedAt: 88,
        },
      ],
      rules: [
        {
          name: "Replay rule",
          trigger: "replay",
          instruction: "Keep the historical replay answer short.",
          priority: 5,
        },
      ],
    });

    await expect(adminBClient.mutation(api.agentRuns.cancelRun, { runId: pendingRunId })).rejects.toThrow("Unauthorized");
    await adminAClient.mutation(api.agentRuns.cancelRun, {
      runId: pendingRunId,
      reason: "Operator stopped duplicate run",
    });
    await t.mutation(internal.agentRuns.updateRunStatusInternal, {
      runId: pendingRunId,
      status: "SUCCESS",
      finalOutput: "Late success should not override cancellation",
    });

    const cancelledState = await t.run(async (ctx) => ({
      run: await ctx.db.get(pendingRunId),
      approval: await ctx.db.get(pendingApprovalId),
      toolCall: await ctx.db.get(pendingToolCallId),
      steps: await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", pendingRunId)).collect(),
      cancelLogs: await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("actionType"), "CANCEL_AGENT_RUN"))
        .collect(),
    }));
    expect(cancelledState.run).toMatchObject({
      status: "CANCELLED",
      finalOutput: "Agent run cancelled: Operator stopped duplicate run",
    });
    expect(cancelledState.approval).toMatchObject({
      status: "CANCELLED",
      reviewedBy: adminAId,
      decisionReason: "Operator stopped duplicate run",
    });
    expect(cancelledState.toolCall).toMatchObject({
      status: "CANCELLED",
      error: "Agent run cancelled: Operator stopped duplicate run",
    });
    expect(cancelledState.steps.at(-1)).toMatchObject({
      kind: "FINAL",
      status: "SKIPPED",
      output: "Agent run cancelled: Operator stopped duplicate run",
    });
    expect(cancelledState.cancelLogs).toHaveLength(1);
  });
});
