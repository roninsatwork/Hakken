import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

/**
 * The analytics query reports on a window, so its fixtures have to sit inside
 * one. Offsets from this base are the original fixture values, so every total
 * and duration the test asserts is unchanged.
 */
const ANALYTICS_BASE = Date.now() - 60_000;

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

    const { activeAgentId, inactiveAgentId, otherCompanyAgentId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Public API Company", createdAt: Date.now() });
      const otherCompanyId = await ctx.db.insert("companies", { name: "Other Public API Company", createdAt: Date.now() });
      const activeAgentId = await ctx.db.insert("agents", {
        name: "Public Trigger Agent",
        companyId,
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const inactiveAgentId = await ctx.db.insert("agents", {
        name: "Inactive Public Trigger Agent",
        companyId,
        modelId: "model-test",
        thinkingMode: false,
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const otherCompanyAgentId = await ctx.db.insert("agents", {
        name: "Other Company Public Trigger Agent",
        companyId: otherCompanyId,
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { activeAgentId, inactiveAgentId, otherCompanyAgentId, companyId };
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
      agentId: otherCompanyAgentId,
      companyId,
      objective: "Should not run across tenants",
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
      "Unauthenticated"
    );

    // The table's own query keeps the same boundaries. It is a different
    // handler from the one above, so the isolation has to be proved again
    // rather than assumed from the pair of them looking alike.
    const tablePage = await adminAClient.query(api.agentRuns.getPageForAgent, { agentId, paginationOpts });
    expect(tablePage.page.map((run) => run._id)).toEqual([runAId]);
    await expect(orphanAdminClient.query(api.agentRuns.getPageForAgent, { agentId, paginationOpts })).rejects.toThrow(
      "Unauthorized"
    );
    await expect(t.query(api.agentRuns.getPageForAgent, { agentId, paginationOpts })).rejects.toThrow(
      "Unauthenticated"
    );
  });

  test("the activity table carries each row's markers without reading the agent's whole history", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, adminId, ratedRunId, plainRunId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Marker Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "marker-admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Rightmove Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const ratedRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId,
        triggerType: "SCHEDULE",
        objective: "Find three-bed listings in Bristol",
        status: "FAILED",
        startedAt: 200,
        updatedAt: 200,
        completedAt: 260,
      });
      const plainRunId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId,
        triggerType: "SCHEDULE",
        objective: "Find three-bed listings in Bath",
        status: "SUCCESS",
        startedAt: 100,
        updatedAt: 100,
        completedAt: 140,
      });

      await ctx.db.insert("agentRunFeedback", {
        runId: ratedRunId,
        agentId,
        companyId,
        userId: adminId,
        rating: "NEGATIVE",
        labels: ["TOO_SLOW"],
        comment: "took far too long",
        createdAt: 300,
        updatedAt: 300,
      });

      return { agentId, adminId, ratedRunId, plainRunId };
    });

    const client = t.withIdentity({ subject: adminId });
    const result = await client.query(api.agentRuns.getPageForAgent, { agentId, paginationOpts });

    const rated = result.page.find((run) => run._id === ratedRunId);
    const plain = result.page.find((run) => run._id === plainRunId);

    // The rating and its labels ride along with the row, so the form that
    // edits them does not need a second trip.
    expect(rated?.markers.feedback).toMatchObject({
      rating: "NEGATIVE",
      labels: ["TOO_SLOW"],
      comment: "took far too long",
    });
    expect(rated?.markers.usedAsCheck).toBe(false);
    expect(rated?.markers.reflected).toBe(false);

    // A row with nothing on it says so, rather than arriving undefined and
    // leaving the table to guess.
    expect(plain?.markers.feedback).toBeNull();
    expect(plain?.markers.memoryCandidateIds).toEqual([]);
    expect(plain?.markers.suggestionIds).toEqual([]);
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

  test("the approval queue is super-admin only, and every decision is audited", async () => {
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
        sideEffectLevel: "READ",
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

    // A company admin used to be authorised here, with a company-scoped branch,
    // while the nav hid the page from them — a live permission with no screen
    // behind it. Approvals are run on a client's behalf, so the API says so.
    await expect(
      adminAClient.query(api.agentRuns.getPendingApprovals, { paginationOpts })
    ).rejects.toThrow();
    await expect(
      adminAClient.query(api.agentRuns.getPendingApprovalCount, {})
    ).rejects.toThrow();
    await expect(
      adminAClient.mutation(api.agentRuns.decideApproval, {
        approvalId: approvalAId,
        decision: "APPROVED",
        decisionReason: "Own tenant",
      })
    ).rejects.toThrow();
    await expect(
      adminBClient.mutation(api.agentRuns.decideApproval, {
        approvalId: approvalAId,
        decision: "REJECTED",
        decisionReason: "Wrong tenant",
      })
    ).rejects.toThrow();

    const superAdminPending = await superAdminClient.query(api.agentRuns.getPendingApprovals, { paginationOpts });
    expect(superAdminPending.page.map((entry) => entry.approval._id)).toEqual([approvalBId, approvalAId]);

    // The badge counts across companies, and counts everything pending rather
    // than only what has gone stale.
    expect(await superAdminClient.query(api.agentRuns.getPendingApprovalCount, {}))
      .toEqual({ count: 2, atLimit: false });

    await superAdminClient.mutation(api.agentRuns.decideApproval, {
      approvalId: approvalAId,
      decision: "APPROVED",
      decisionReason: "Looks safe",
    });

    const approvedState = await t.run(async (ctx) => ({
      approval: await ctx.db.get(approvalAId),
      toolCall: await ctx.db.get(toolCallAId),
      run: await ctx.db.get(runAId),
    }));
    expect(approvedState.approval).toMatchObject({ status: "APPROVED", reviewedBy: superAdminId });
    expect(approvedState.toolCall).toMatchObject({ status: "PENDING" });
    expect(approvedState.toolCall?.confirmationGrantedAt).toEqual(expect.any(Number));
    expect(approvedState.run).toMatchObject({ status: "RUNNING" });

    // Deciding one takes it out of the count, which is what makes the badge
    // trustworthy enough to act on.
    expect(await superAdminClient.query(api.agentRuns.getPendingApprovalCount, {}))
      .toEqual({ count: 1, atLimit: false });

    await superAdminClient.mutation(api.agentRuns.decideApproval, {
      approvalId: approvalBId,
      decision: "REJECTED",
      decisionReason: "Not approved",
    });

    const rejectedState = await t.run(async (ctx) => ({
      approval: await ctx.db.get(approvalBId),
      run: await ctx.db.get(runBId),
      steps: await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", runBId)).collect(),
      toolCalls: await ctx.db.query("agentToolCalls").withIndex("by_run_started", (q) => q.eq("runId", runBId)).collect(),
    }));
    expect(rejectedState.approval).toMatchObject({ status: "REJECTED", reviewedBy: superAdminId });
    // A rejection is told to the agent rather than ending the run: the reviewer
    // means "not that way", and the objective may be most of the way done.
    // Stopping a run outright is `cancelRun`.
    expect(rejectedState.run?.status).not.toBe("FAILED");
    expect(rejectedState.run?.completedAt).toBeUndefined();
    // The refusal is recorded as the call's result, which is what the model reads.
    expect(rejectedState.toolCalls.at(-1)).toMatchObject({ status: "DENIED" });
    expect(rejectedState.toolCalls.at(-1)?.resultJson).toContain("refused it");
    expect(rejectedState.steps.at(-1)).toMatchObject({ kind: "TOOL_RESULT", status: "FAILED" });
    // And it is remembered, so the model cannot put the same decision back in
    // front of the reviewer.
    expect(rejectedState.run?.refusedToolCallsJson).toContain("external_sync");
    expect(await superAdminClient.query(api.agentRuns.getPendingApprovalCount, {}))
      .toEqual({ count: 0, atLimit: false });

    // Approving a tool call is exactly the event an audit log exists for, and this
    // used to write none — while `cancelRun` next door always did. The test that
    // covered this was even titled "and audited" and asserted the absence.
    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const decisions = audit.filter((entry) => entry.entityType === "agentRunApprovals");
    expect(decisions.map((entry) => entry.actionType).sort())
      .toEqual(["AGENT_APPROVAL_APPROVED", "AGENT_APPROVAL_REJECTED"]);
    expect(decisions.every((entry) => entry.actorId === superAdminId)).toBe(true);
    // The side-effect level is on the row, because a reader most wants to know
    // whether what was waved through was a lookup or a deletion.
    const approvedEntry = decisions.find((entry) => entry.actionType === "AGENT_APPROVAL_APPROVED");
    expect(JSON.parse(approvedEntry!.metadata!)).toMatchObject({
      runId: runAId,
      sideEffectLevel: "READ",
      reason: "Looks safe",
    });
  });

  test("an approval nobody answers expires, and its whole run stops", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const dayInMs = 24 * 60 * 60 * 1000;

    const { superAdminId, staleApprovalId, staleSiblingId, freshApprovalId, staleRunId, freshRunId, threadId } =
      await t.run(async (ctx) => {
        const superAdminId = await ctx.db.insert("users", {
          email: "expiry-super@example.com",
          role: "SUPER_ADMIN",
        });
        const agentId = await ctx.db.insert("agents", {
          name: "Expiry Agent",
          modelId: "model-test",
          thinkingMode: false,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const threadId = await ctx.db.insert("threads", {
          title: "Expiry thread",
          userId: superAdminId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const seedRun = async (requestedAt: number, withThread: boolean) => {
          const runId = await ctx.db.insert("agentRuns", {
            agentId,
            userId: superAdminId,
            ...(withThread ? { threadId } : {}),
            triggerType: "CHAT",
            objective: "Waiting on a person",
            status: "PENDING_APPROVAL",
            startedAt: requestedAt,
            updatedAt: requestedAt,
          });
          const toolCallId = await ctx.db.insert("agentToolCalls", {
            runId,
            agentId,
            normalizedToolName: "email_send",
            handlerMapping: "email.send",
            argumentsJson: "{}",
            status: "APPROVAL_REQUIRED",
            requiredRole: "ADMIN",
            sideEffectLevel: "WRITE",
            confirmationRequired: true,
            startedAt: requestedAt,
            turnIndex: 0,
          });
          const approvalId = await ctx.db.insert("agentRunApprovals", {
            runId,
            toolCallId,
            agentId,
            status: "PENDING",
            requestedAt,
          });
          await ctx.db.insert("agentRunCheckpoints", {
            runId,
            agentId,
            threadId,
            status: "AWAITING_APPROVAL",
            transcriptJson: "[]",
            loopIndex: 1,
            stepIndex: 1,
            toolCallCount: 1,
            inputTokens: 0,
            outputTokens: 0,
            segmentCount: 1,
            resumeAttempts: 0,
            createdAt: requestedAt,
            updatedAt: requestedAt,
          });
          return { runId, approvalId, toolCallId };
        };

        // Waited two days, which is past the 24-hour default.
        const stale = await seedRun(Date.now() - 2 * dayInMs, true);
        // A sibling from the same model turn: the batch has to go together, or the
        // run parks again with nothing able to settle it.
        const staleSiblingId = await ctx.db.insert("agentRunApprovals", {
          runId: stale.runId,
          agentId,
          status: "PENDING",
          requestedAt: Date.now() - 2 * dayInMs,
        });
        const fresh = await seedRun(Date.now() - 60 * 1000, false);

        return {
          superAdminId,
          staleApprovalId: stale.approvalId,
          staleSiblingId,
          freshApprovalId: fresh.approvalId,
          staleRunId: stale.runId,
          freshRunId: fresh.runId,
          threadId,
        };
      });

    const result = await t.mutation(internal.agentRuns.expireStalePendingApprovals, {});
    expect(result.expiredRuns).toBe(1);

    const state = await t.run(async (ctx) => ({
      stale: await ctx.db.get(staleApprovalId),
      sibling: await ctx.db.get(staleSiblingId),
      fresh: await ctx.db.get(freshApprovalId),
      staleRun: await ctx.db.get(staleRunId),
      freshRun: await ctx.db.get(freshRunId),
      checkpoints: await ctx.db.query("agentRunCheckpoints").collect(),
      steps: await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", staleRunId)).collect(),
    }));

    // Its own status, so "nobody answered" stays distinguishable from "someone
    // decided against it".
    expect(state.stale?.status).toBe("EXPIRED");
    expect(state.sibling?.status).toBe("EXPIRED");
    // Cancelled, never approved: an unattended yes to a deletion is the one
    // outcome worse than a stuck run.
    expect(state.staleRun?.status).toBe("CANCELLED");
    expect(state.staleRun?.finalOutput).toContain("without a decision");
    expect(state.steps.at(-1)).toMatchObject({ kind: "FINAL", status: "SKIPPED" });
    // The parked position is gone, which nothing else would ever have cleared.
    expect(state.checkpoints.filter((entry) => entry.runId === staleRunId)).toHaveLength(0);

    // One inside the window is untouched.
    expect(state.fresh?.status).toBe("PENDING");
    expect(state.freshRun?.status).toBe("PENDING_APPROVAL");

    // A stale browser tab cannot approve what the platform has already closed.
    const superAdminClient = t.withIdentity({ subject: superAdminId });
    await expect(
      superAdminClient.mutation(api.agentRuns.decideApproval, {
        approvalId: staleApprovalId,
        decision: "APPROVED",
      })
    ).rejects.toThrow(/expired/);

    void threadId;
  });

  test("an agent may be less patient than the platform", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { patientApprovalId, impatientApprovalId } = await t.run(async (ctx) => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const seed = async (approvalExpiryHours?: number) => {
        const agentId = await ctx.db.insert("agents", {
          name: approvalExpiryHours ? "Impatient Agent" : "Patient Agent",
          modelId: "model-test",
          thinkingMode: false,
          isActive: true,
          ...(approvalExpiryHours ? { approvalExpiryHours } : {}),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const runId = await ctx.db.insert("agentRuns", {
          agentId,
          triggerType: "CHAT",
          objective: "Waiting",
          status: "PENDING_APPROVAL",
          startedAt: twoHoursAgo,
          updatedAt: twoHoursAgo,
        });
        return await ctx.db.insert("agentRunApprovals", {
          runId,
          agentId,
          status: "PENDING",
          requestedAt: twoHoursAgo,
        });
      };

      return {
        patientApprovalId: await seed(undefined),
        impatientApprovalId: await seed(1),
      };
    });

    await t.mutation(internal.agentRuns.expireStalePendingApprovals, {});

    const state = await t.run(async (ctx) => ({
      patient: await ctx.db.get(patientApprovalId),
      impatient: await ctx.db.get(impatientApprovalId),
    }));

    // A daily reconciliation agent and one that fires monthly do not deserve the
    // same patience.
    expect(state.patient?.status).toBe("PENDING");
    expect(state.impatient?.status).toBe("EXPIRED");
  });

  test("the platform expiry window is configurable and floored", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => await ctx.db.insert("users", {
      email: "config-super@example.com",
      role: "SUPER_ADMIN",
    }));
    const client = t.withIdentity({ subject: superAdminId });

    expect(await client.query(api.agentRuns.getApprovalExpiryConfig, {}))
      .toMatchObject({ expiryHours: 24, defaultHours: 24, minHours: 1 });

    await client.mutation(api.agentRuns.updateApprovalExpiryConfig, { expiryHours: 6 });
    expect((await client.query(api.agentRuns.getApprovalExpiryConfig, {})).expiryHours).toBe(6);

    // Floored by name, so the screen can say why rather than silently accepting a
    // window that makes the queue unanswerable.
    await expect(
      client.mutation(api.agentRuns.updateApprovalExpiryConfig, { expiryHours: 0 })
    ).rejects.toThrow(/at least 1 hour/);

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audit.some((entry) => entry.entityId === "APPROVAL_EXPIRY_CONFIG")).toBe(true);
  });

  test("the approval queue is searchable by agent and tool name, server-side", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, emailApprovalId, lookupApprovalId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "search-super@example.com",
        role: "SUPER_ADMIN",
      });
      const emailAgentId = await ctx.db.insert("agents", {
        name: "Renewals Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const lookupAgentId = await ctx.db.insert("agents", {
        name: "Reporting Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const seedApproval = async (agentId: typeof emailAgentId, toolName: string) => {
        const runId = await ctx.db.insert("agentRuns", {
          agentId,
          triggerType: "CHAT",
          objective: `Objective for ${toolName}`,
          status: "PENDING_APPROVAL",
          startedAt: 100,
          updatedAt: 100,
        });
        const toolCallId = await ctx.db.insert("agentToolCalls", {
          runId,
          agentId,
          normalizedToolName: toolName,
          handlerMapping: `handler.${toolName}`,
          argumentsJson: "{}",
          status: "APPROVAL_REQUIRED",
          requiredRole: "ADMIN",
          sideEffectLevel: "WRITE",
          confirmationRequired: true,
          startedAt: 101,
        });
        return { runId, toolCallId, agentId };
      };

      const emailSeed = await seedApproval(emailAgentId, "email_send");
      const lookupSeed = await seedApproval(lookupAgentId, "report_read");

      // Inserted through the internal mutation, because that is what populates
      // the denormalised search text the index reads.
      const emailApprovalId = await ctx.runMutation(internal.agentRuns.insertApprovalInternal, {
        runId: emailSeed.runId,
        toolCallId: emailSeed.toolCallId,
        agentId: emailSeed.agentId,
        status: "PENDING",
      });
      const lookupApprovalId = await ctx.runMutation(internal.agentRuns.insertApprovalInternal, {
        runId: lookupSeed.runId,
        toolCallId: lookupSeed.toolCallId,
        agentId: lookupSeed.agentId,
        status: "PENDING",
      });

      return { superAdminId, emailApprovalId, lookupApprovalId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const byAgent = await superAdminClient.query(api.agentRuns.getPendingApprovals, {
      paginationOpts,
      searchTerm: "Renewals",
    });
    expect(byAgent.page.map((entry) => entry.approval._id)).toEqual([emailApprovalId]);

    const byTool = await superAdminClient.query(api.agentRuns.getPendingApprovals, {
      paginationOpts,
      searchTerm: "report_read",
    });
    expect(byTool.page.map((entry) => entry.approval._id)).toEqual([lookupApprovalId]);

    // No term means the whole queue, not an empty result.
    const unfiltered = await superAdminClient.query(api.agentRuns.getPendingApprovals, { paginationOpts });
    expect(unfiltered.page).toHaveLength(2);

    const noMatch = await superAdminClient.query(api.agentRuns.getPendingApprovals, {
      paginationOpts,
      searchTerm: "nothing matches this",
    });
    expect(noMatch.page).toHaveLength(0);
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
        startedAt: ANALYTICS_BASE + 100,
        completedAt: ANALYTICS_BASE + 160,
        updatedAt: ANALYTICS_BASE + 160,
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
        startedAt: ANALYTICS_BASE + 200,
        completedAt: ANALYTICS_BASE + 250,
        updatedAt: ANALYTICS_BASE + 250,
        error: "Tool args failed validation",
      });
      const pendingRunAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "MANUAL",
        objective: "Needs approval",
        status: "PENDING_APPROVAL",
        startedAt: ANALYTICS_BASE + 300,
        updatedAt: ANALYTICS_BASE + 300,
      });
      await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyBId,
        userId: adminBId,
        triggerType: "SCHEDULE",
        objective: "Company B report",
        status: "SUCCESS",
        costGBP: 0.77,
        startedAt: ANALYTICS_BASE + 400,
        completedAt: ANALYTICS_BASE + 410,
        updatedAt: ANALYTICS_BASE + 410,
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
        startedAt: ANALYTICS_BASE + 120,
        completedAt: ANALYTICS_BASE + 130,
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
        startedAt: ANALYTICS_BASE + 220,
        completedAt: ANALYTICS_BASE + 230,
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
        startedAt: ANALYTICS_BASE + 310,
      });
      await ctx.db.insert("agentRunApprovals", {
        runId: pendingRunAId,
        toolCallId: approvalToolCallId,
        agentId,
        companyId: companyAId,
        requestedBy: adminAId,
        status: "PENDING",
        requestedAt: ANALYTICS_BASE + 315,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: successRunAId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "POSITIVE",
        labels: ["GOOD_ANSWER"],
        comment: "Useful summary.",
        createdAt: ANALYTICS_BASE + 320,
        updatedAt: ANALYTICS_BASE + 320,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: failedRunAId,
        agentId,
        companyId: companyAId,
        userId: adminAId,
        rating: "NEGATIVE",
        labels: ["BAD_TOOL_ARGS", "SHOULD_BECOME_EVAL"],
        comment: "Bad tool arguments.",
        createdAt: ANALYTICS_BASE + 330,
        updatedAt: ANALYTICS_BASE + 330,
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
        startedAt: ANALYTICS_BASE + 410,
        completedAt: ANALYTICS_BASE + 415,
      });
      await ctx.db.insert("agentRunFeedback", {
        runId: successRunAId,
        agentId,
        companyId: companyBId,
        userId: adminBId,
        rating: "POSITIVE",
        labels: ["GOOD_ANSWER"],
        createdAt: ANALYTICS_BASE + 420,
        updatedAt: ANALYTICS_BASE + 420,
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

/**
 * A person changing an agent's purpose was recorded; the agent then going off
 * and acting was not. On a platform sold as AI governance, the trail covering
 * only the humans is the conspicuous hole in it.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
describe("what an agent did on its own account", () => {
  const setup = async (t: ReturnType<typeof convexTest>) => {
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now() });
      const agentId = await ctx.db.insert("agents", {
        name: "Housekeeping Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId,
        triggerType: "CHAT",
        status: "RUNNING",
        objective: "Tidy the register.",
        startedAt: Date.now(),
        updatedAt: Date.now(),
        maxSteps: 3,
      });

      return { companyId, agentId, runId };
    });
  };

  const auditLogs = async (t: ReturnType<typeof convexTest>) =>
    await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());

  test("records a change the agent made, and never a lookup", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, agentId, runId } = await setup(t);

    const call = {
      runId,
      agentId,
      companyId,
      handlerMapping: "knowledge.search",
      argumentsJson: "{}",
      status: "SUCCESS" as const,
      requiredRole: "ADMIN" as const,
      confirmationRequired: false,
    };

    // An agent answering a question by looking something up is the bulk of what
    // agents do. All of it on the trail is a trail nobody can read.
    await t.mutation(internal.agentRuns.insertToolCallInternal, {
      ...call,
      normalizedToolName: "knowledge_search",
      sideEffectLevel: "READ",
    });

    expect(await auditLogs(t)).toEqual([]);

    await t.mutation(internal.agentRuns.insertToolCallInternal, {
      ...call,
      normalizedToolName: "company_overview_write",
      sideEffectLevel: "WRITE",
    });

    const logs = await auditLogs(t);
    expect(logs).toHaveLength(1);
    expect(logs[0].actionType).toBe("AGENT_ACTION");
    expect(logs[0].companyId).toBe(companyId);
    expect(logs[0].entityId).toBe(agentId);
    // An agent is not a person. Naming whoever started the run as the one who
    // did this puts a human name against an action they did not take.
    expect(logs[0].actorId).toBeUndefined();
    expect(JSON.parse(logs[0].metadata ?? "{}")).toEqual({
      agent: "Housekeeping Agent",
      did: "changed something",
      using: "company_overview_write",
      outcome: "SUCCESS",
    });
  });

  test("a call still waiting on a person is not yet something the agent has done", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyId, agentId, runId } = await setup(t);

    await t.mutation(internal.agentRuns.insertToolCallInternal, {
      runId,
      agentId,
      companyId,
      normalizedToolName: "delete_everything",
      handlerMapping: "danger.delete",
      argumentsJson: "{}",
      status: "APPROVAL_REQUIRED",
      requiredRole: "SUPER_ADMIN",
      sideEffectLevel: "DESTRUCTIVE",
      confirmationRequired: true,
    });

    expect(await auditLogs(t)).toEqual([]);
  });

  test("a finished run leaves one entry, whatever happened inside it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { runId } = await setup(t);

    await t.mutation(internal.agentRuns.updateRunStatusInternal, {
      runId,
      status: "FAILED",
      error: "The provider timed out.",
    });

    const logs = (await auditLogs(t)).filter((log) => log.actionType === "AGENT_RUN_FINISHED");
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].metadata ?? "{}")).toMatchObject({
      agent: "Housekeeping Agent",
      outcome: "FAILED",
      asked: "Tidy the register.",
      error: "The provider timed out.",
    });
  });

  test("a run that is merely progressing writes nothing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { runId } = await setup(t);

    await t.mutation(internal.agentRuns.updateRunStatusInternal, { runId, status: "RUNNING" });

    expect(await auditLogs(t)).toEqual([]);
  });
});
