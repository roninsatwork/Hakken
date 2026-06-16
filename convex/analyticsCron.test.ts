import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("analytics cron snapshots", () => {
  test("empty days create one global zero snapshot and duplicate generation is skipped", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.mutation(internal.analyticsCron.generateDailySnapshots, { targetDateStr: "2026-05-01" });
    await t.mutation(internal.analyticsCron.generateDailySnapshots, { targetDateStr: "2026-05-01" });

    const snapshots = await t.run(async (ctx) => ctx.db.query("analyticsDailySnapshots").collect());
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      date: "2026-05-01",
      type: "global",
      metrics: {
        totalMessages: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        costGBP: 0,
        activeUsersCount: 0,
      },
      uniqueUserIds: [],
    });

    expect(await t.mutation(internal.analyticsCron.wipeSnapshots, {})).toBe(1);
    expect(await t.run(async (ctx) => ctx.db.query("analyticsDailySnapshots").collect())).toEqual([]);
  });

  test("daily snapshots aggregate assistant messages and agent transactions by global, company, and user", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const dayStart = Date.UTC(2026, 4, 2);

    const { companyId, userId, agentId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        name: "Ada User",
        image: "https://example.com/ada.png",
        role: "USER",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Pipeline Agent",
        avatar: "https://example.com/agent.png",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.2,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        agentId,
        createdAt: dayStart,
        updatedAt: dayStart,
      });
      await ctx.db.insert("aiModels", {
        modelId: "model-test",
        displayName: "Model Test",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: Date.now(),
        standardInputCostBelow200k: 2,
        standardInputCostAbove200k: 4,
        outputResponseCost: 8,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Hello",
        inputTokens: 100,
        outputTokens: 50,
        modelUsed: "model-test",
        createdAt: dayStart + 60_000,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "Ignored",
        createdAt: dayStart + 60_000,
      });
      await ctx.db.insert("agentTransactions", {
        agentId,
        userId,
        companyId,
        actionContext: "Workflow",
        inputTokens: 40,
        outputTokens: 10,
        modelUsed: "model-test",
        costGBP: 99,
        status: "SUCCESS",
        createdAt: dayStart + 120_000,
      });
      await ctx.db.insert("agentTransactions", {
        agentId,
        userId,
        companyId,
        actionContext: "Outside window",
        inputTokens: 999,
        outputTokens: 999,
        modelUsed: "model-test",
        costGBP: 99,
        status: "SUCCESS",
        createdAt: dayStart - 1,
      });

      return { companyId, userId, agentId };
    });

    await t.mutation(internal.analyticsCron.generateDailySnapshots, { targetDateStr: "2026-05-02" });

    const snapshots = await t.run(async (ctx) =>
      ctx.db.query("analyticsDailySnapshots").withIndex("by_date", (q) => q.eq("date", "2026-05-02")).collect()
    );
    const globalSnapshot = snapshots.find((snapshot) => snapshot.type === "global");
    const companySnapshot = snapshots.find((snapshot) => snapshot.type === "company");
    const userSnapshot = snapshots.find((snapshot) => snapshot.type === "user");

    expect(snapshots).toHaveLength(3);
    expect(globalSnapshot).toMatchObject({
      metrics: {
        totalMessages: 2,
        totalInputTokens: 140,
        totalOutputTokens: 60,
        activeUsersCount: 1,
      },
      uniqueUserIds: [userId],
    });
    expect(globalSnapshot?.metrics.costGBP).toBeGreaterThan(0);
    expect(globalSnapshot?.modelMetrics?.[0]).toMatchObject({ model: "model-test", calls: 2 });
    expect(globalSnapshot?.leaderboards?.topAgents[0]).toMatchObject({
      id: agentId,
      name: "Pipeline Agent",
      interactions: 2,
    });
    expect(globalSnapshot?.leaderboards?.topUsers[0]).toMatchObject({
      id: userId,
      name: "Ada User",
      email: "user@example.com",
      companyName: "Acme",
      messages: 2,
    });

    expect(companySnapshot).toMatchObject({
      companyId,
      metrics: {
        totalMessages: 2,
        totalInputTokens: 140,
        totalOutputTokens: 60,
        activeUsersCount: 1,
      },
      uniqueUserIds: [userId],
    });
    expect(userSnapshot).toMatchObject({
      userId,
      metrics: {
        totalMessages: 2,
        totalInputTokens: 140,
        totalOutputTokens: 60,
      },
      uniqueUserIds: [userId],
    });
  });

  test("message analytics dimension backfill is paginated, idempotent, and non-destructive", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.UTC(2026, 4, 3);

    const setup = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        companyId: companyAId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Support Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const widgetId = await ctx.db.insert("widgets", {
        companyId: companyAId,
        agentId,
        name: "Support Widget",
        allowedDomains: ["https://example.com"],
        isActive: true,
        createdBy: userId,
        createdAt: now,
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        companyId: companyAId,
        agentId,
        widgetId,
        createdAt: now,
        updatedAt: now,
      });
      const orphanThreadId = await ctx.db.insert("threads", {
        userId,
        companyId: companyAId,
        createdAt: now,
        updatedAt: now,
      });
      const legacyAssistantId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Legacy assistant",
        createdAt: now,
      });
      const legacyUserId = await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "Legacy user",
        createdAt: now + 1,
      });
      const completeMessageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Already complete",
        companyId: companyAId,
        userId,
        agentId,
        widgetId,
        analyticsDimensionsVersion: 1,
        createdAt: now + 2,
      });
      const mismatchedMessageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Mismatched but already filled",
        companyId: companyBId,
        userId,
        agentId,
        widgetId,
        analyticsDimensionsVersion: 1,
        createdAt: now + 3,
      });
      const orphanMessageId = await ctx.db.insert("messages", {
        threadId: orphanThreadId,
        role: "assistant",
        content: "Orphan message",
        createdAt: now + 4,
      });
      await ctx.db.delete(orphanThreadId);

      return {
        companyAId,
        companyBId,
        userId,
        agentId,
        widgetId,
        legacyAssistantId,
        legacyUserId,
        completeMessageId,
        mismatchedMessageId,
        orphanMessageId,
      };
    });

    const firstValidation = await t.query(internal.analyticsCron.validateMessageAnalyticsDimensions, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(firstValidation).toMatchObject({
      scanned: 5,
      missingDimensions: 2,
      missingThreads: 1,
      mismatched: 1,
      isDone: true,
    });
    expect(firstValidation.examples).toContain(setup.legacyAssistantId);
    expect(firstValidation.examples).toContain(setup.orphanMessageId);

    const dryRun = await t.mutation(internal.analyticsCron.backfillMessageAnalyticsDimensions, {
      paginationOpts: { numItems: 10, cursor: null },
      dryRun: true,
    });

    expect(dryRun).toMatchObject({
      scanned: 5,
      patchCandidates: 2,
      patched: 0,
      skippedMissingThread: 1,
      mismatched: 1,
      isDone: true,
      dryRun: true,
    });

    const backfill = await t.mutation(internal.analyticsCron.backfillMessageAnalyticsDimensions, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(backfill).toMatchObject({
      scanned: 5,
      patchCandidates: 2,
      patched: 2,
      skippedMissingThread: 1,
      mismatched: 1,
      isDone: true,
      dryRun: false,
    });

    const messages = await t.run(async (ctx) => {
      const legacyAssistant = await ctx.db.get(setup.legacyAssistantId);
      const legacyUser = await ctx.db.get(setup.legacyUserId);
      const completeMessage = await ctx.db.get(setup.completeMessageId);
      const mismatchedMessage = await ctx.db.get(setup.mismatchedMessageId);
      return { legacyAssistant, legacyUser, completeMessage, mismatchedMessage };
    });

    expect(messages.legacyAssistant).toMatchObject({
      companyId: setup.companyAId,
      userId: setup.userId,
      agentId: setup.agentId,
      widgetId: setup.widgetId,
      analyticsDimensionsVersion: 1,
    });
    expect(messages.legacyUser).toMatchObject({
      companyId: setup.companyAId,
      userId: setup.userId,
      agentId: setup.agentId,
      widgetId: setup.widgetId,
      analyticsDimensionsVersion: 1,
    });
    expect(messages.completeMessage).toMatchObject({
      companyId: setup.companyAId,
      userId: setup.userId,
      agentId: setup.agentId,
      widgetId: setup.widgetId,
      analyticsDimensionsVersion: 1,
    });
    expect(messages.mismatchedMessage).toMatchObject({
      companyId: setup.companyBId,
      userId: setup.userId,
      agentId: setup.agentId,
      widgetId: setup.widgetId,
      analyticsDimensionsVersion: 1,
    });

    const secondBackfill = await t.mutation(internal.analyticsCron.backfillMessageAnalyticsDimensions, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(secondBackfill).toMatchObject({
      scanned: 5,
      patchCandidates: 0,
      patched: 0,
      skippedMissingThread: 1,
      mismatched: 1,
      isDone: true,
    });

    const secondValidation = await t.query(internal.analyticsCron.validateMessageAnalyticsDimensions, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(secondValidation).toMatchObject({
      scanned: 5,
      missingDimensions: 0,
      missingThreads: 1,
      mismatched: 1,
      isDone: true,
    });
    expect(secondValidation.examples).toContain(setup.mismatchedMessageId);
    expect(secondValidation.examples).toContain(setup.orphanMessageId);
  });

  test("analytics data health reports snapshot gaps, duplicates, dimension drift, and live-day counts", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();
    const today = new Date(now);
    const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const dates = [3, 2, 1].map((daysAgo) => new Date(todayStart - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

    const setup = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
      const userId = await ctx.db.insert("users", {
        email: "health@example.com",
        role: "USER",
        companyId: companyAId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Health Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        companyId: companyAId,
        agentId,
        createdAt: todayStart,
        updatedAt: todayStart,
      });

      await ctx.db.insert("analyticsDailySnapshots", {
        date: dates[0],
        type: "global",
        metrics: { totalMessages: 1, totalInputTokens: 1, totalOutputTokens: 1, costGBP: 1, activeUsersCount: 1 },
      });
      await ctx.db.insert("analyticsDailySnapshots", {
        date: dates[0],
        type: "global",
        metrics: { totalMessages: 1, totalInputTokens: 1, totalOutputTokens: 1, costGBP: 1, activeUsersCount: 1 },
      });
      await ctx.db.insert("analyticsDailySnapshots", {
        date: dates[2],
        type: "global",
        metrics: { totalMessages: 1, totalInputTokens: 1, totalOutputTokens: 1, costGBP: 1, activeUsersCount: 1 },
      });

      const missingDimensionMessageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Missing dimensions",
        createdAt: todayStart + 100,
      });
      const mismatchedMessageId = await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Wrong company dimension",
        companyId: companyBId,
        userId,
        agentId,
        analyticsDimensionsVersion: 1,
        createdAt: todayStart + 200,
      });
      await ctx.db.insert("agentTransactions", {
        agentId,
        userId,
        companyId: companyAId,
        actionContext: "Health check",
        inputTokens: 1,
        outputTokens: 1,
        modelUsed: "model-test",
        costGBP: 1,
        status: "SUCCESS",
        createdAt: todayStart + 300,
      });

      return { mismatchedMessageId, missingDimensionMessageId };
    });

    const health = await t.query(internal.analyticsCron.getAnalyticsDataHealth, { daysBack: 3 });

    expect(health.checkedDates).toEqual(dates);
    expect(health.snapshotCoverage.missingGlobalDates).toEqual([dates[1]]);
    expect(health.snapshotCoverage.duplicateSnapshotGroups).toEqual([
      { count: 2, date: dates[0], scopeId: "global", type: "global" },
    ]);
    expect(health.liveToday).toMatchObject({
      agentTransactions: 1,
      assistantMessages: 2,
    });
    expect(health.messageDimensions).toMatchObject({
      mismatched: 1,
      missingDimensions: 1,
      missingThreads: 0,
      scanned: 2,
    });
    expect(health.messageDimensions.examples).toContain(setup.missingDimensionMessageId);
    expect(health.messageDimensions.examples).toContain(setup.mismatchedMessageId);
  });

  test("system health reports agent failures and schedule failures", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const setup = await t.run(async (ctx) => {
      const planId = await ctx.db.insert("plans", {
        name: "Ops Plan",
        messageLimit: 100,
        priceGBP: 99,
        isActive: true,
        createdAt: now,
      });
      const companyId = await ctx.db.insert("companies", {
        name: "Ops Health",
        planId,
        messagesUsedThisPeriod: 95,
        createdAt: now,
      });
      const userId = await ctx.db.insert("users", {
        email: "ops@example.com",
        role: "SUPER_ADMIN",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Ops Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Ops Workflow",
        isActive: true,
        triggerType: "SCHEDULE",
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      });

      await ctx.db.insert("agentLogs", {
        agentId,
        interactionType: "ERROR",
        promptContent: "N/A",
        responseContent: "Provider unavailable",
        companyId,
        createdAt: now - 60_000,
      });
      await ctx.db.insert("agentTransactions", {
        agentId,
        userId,
        companyId,
        actionContext: "Report generation",
        inputTokens: 1,
        outputTokens: 1,
        modelUsed: "model-test",
        costGBP: 0,
        status: "FAILED",
        createdAt: now - 120_000,
      });
      await ctx.db.insert("agentTransactions", {
        agentId,
        userId,
        companyId,
        actionContext: "Expensive analysis",
        inputTokens: 1,
        outputTokens: 1,
        modelUsed: "model-test",
        providerKey: "google",
        providerModelId: "model-test-provider",
        costGBP: 6.5,
        status: "SUCCESS",
        createdAt: now - 90_000,
      });
      const staleRunId = await ctx.db.insert("agentRuns", {
        agentId,
        triggerType: "MANUAL",
        objective: "Long-running operational check",
        status: "RUNNING",
        companyId,
        userId,
        modelId: "model-test",
        maxCostGBP: 1,
        costGBP: 0.95,
        startedAt: now - 2 * 60 * 60 * 1000,
        updatedAt: now - 90 * 60 * 1000,
      });
      await ctx.db.insert("agentRunApprovals", {
        runId: staleRunId,
        agentId,
        companyId,
        requestedBy: userId,
        status: "PENDING",
        message: "Approve external write",
        requestedAt: now - 45 * 60 * 1000,
      });
      await ctx.db.insert("agentToolCalls", {
        runId: staleRunId,
        agentId,
        normalizedToolName: "crm_update",
        handlerMapping: "crm.update",
        argumentsJson: "{}",
        redactedArgumentsJson: "{}",
        status: "FAILED",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        companyId,
        userId,
        startedAt: now - 30 * 60 * 1000,
        completedAt: now - 29 * 60 * 1000,
        error: "Connector timeout",
      });
      await ctx.db.insert("workflowExecutions", {
        workflowId,
        triggerType: "SCHEDULE",
        status: "FAILED",
        startedAt: now - 180_000,
        completedAt: now - 150_000,
        startedBy: userId,
        state: "Node failed",
      });
      await ctx.db.insert("workflowExecutions", {
        workflowId,
        triggerType: "SCHEDULE",
        status: "RUNNING",
        startedAt: now - 2 * 60 * 60 * 1000,
        startedBy: userId,
      });
      const overdueScheduleId = await ctx.db.insert("schedules", {
        name: "Overdue schedule",
        workflowId,
        intervalStr: "daily",
        isActive: true,
        lastRunTs: now - 2 * 24 * 60 * 60 * 1000,
        nextRunAt: now - 60 * 60 * 1000,
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
        createdBy: userId,
      });
      const missingNextRunScheduleId = await ctx.db.insert("schedules", {
        name: "Missing next run",
        agentId,
        intervalStr: "daily",
        isActive: true,
        createdAt: now - 3 * 24 * 60 * 60 * 1000,
        createdBy: userId,
      });

      return { missingNextRunScheduleId, overdueScheduleId };
    });

    const health = await t.query(internal.analyticsCron.getSystemHealth, { daysBack: 7 });

    expect(health.operations.agentFailures).toMatchObject({ count: 1 });
    expect(health.operations.agentFailures.examples[0]).toMatchObject({
      summary: "Provider unavailable",
      targetName: "Ops Agent",
      targetType: "agent",
    });
    expect(health.operations.failedAgentTransactions).toMatchObject({ count: 1 });
    expect(health.operations.staleAgentRuns).toMatchObject({ count: 1 });
    expect(health.operations.staleAgentRuns.examples[0]).toMatchObject({
      summary: expect.stringContaining("Long-running operational check"),
      targetName: "Ops Agent",
    });
    expect(health.operations.pendingApprovals).toMatchObject({ count: 1 });
    expect(health.operations.pendingApprovals.examples[0]).toMatchObject({
      summary: "Approve external write",
      targetName: "Ops Agent",
    });
    expect(health.operations.failedToolCalls).toMatchObject({ count: 1 });
    expect(health.operations.failedToolCalls.examples[0]).toMatchObject({
      label: "crm_update",
      summary: "Connector timeout",
      targetName: "Ops Agent",
    });
    expect(health.operations.providerFailures).toMatchObject({ count: 1 });
    expect(health.operations.providerFailures.examples[0]).toMatchObject({
      label: "unknown-provider",
      summary: expect.stringContaining("1 failed transaction"),
    });
    expect(health.operations.highCostAgents).toMatchObject({ count: 1 });
    expect(health.operations.highCostAgents.examples[0]).toMatchObject({
      summary: expect.stringContaining("£6.50"),
      targetName: "Ops Agent",
    });
    expect(health.operations.failedScheduledExecutions).toMatchObject({ count: 1 });
    expect(health.operations.failedScheduledExecutions.examples[0]).toMatchObject({
      summary: "Node failed",
      targetName: "Ops Workflow",
      targetType: "workflow",
    });
    expect(health.operations.staleRunningScheduledExecutions).toMatchObject({ count: 1 });
    expect(health.operations.overdueSchedules).toMatchObject({ count: 1 });
    expect(health.operations.overdueSchedules.examples[0].id).toBe(setup.overdueScheduleId);
    expect(health.operations.schedulesMissingNextRun).toMatchObject({ count: 1 });
    expect(health.operations.schedulesMissingNextRun.examples[0].id).toBe(setup.missingNextRunScheduleId);
    expect(health.budgetHealth.agentCostBudgets).toMatchObject({ count: 1 });
    expect(health.budgetHealth.agentCostBudgets.examples[0]).toMatchObject({
      percentUsed: 95,
      targetName: "Ops Agent",
    });
    expect(health.budgetHealth.tenantMessageBudgets).toMatchObject({ count: 1 });
    expect(health.budgetHealth.tenantMessageBudgets.examples[0]).toMatchObject({
      percentUsed: 95,
      targetName: "Ops Health",
    });
    expect(health.alertRules.find((rule) => rule.key === "costSpikes")).toMatchObject({
      count: 3,
      status: "critical",
    });
  });

  test("analytics data health is super-admin only and system health scopes tenant admins", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId, superAdminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Health Auth", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      return { adminId, companyId, superAdminId };
    });

    await expect(
      t.withIdentity({ subject: adminId }).query(api.analyticsCron.getAnalyticsDataHealthForAdmin, { daysBack: 7 })
    ).rejects.toThrow("Unauthorized");

    await expect(
      t.withIdentity({ subject: superAdminId }).query(api.analyticsCron.getAnalyticsDataHealthForAdmin, { daysBack: 7 })
    ).resolves.toMatchObject({ daysBack: 7 });

    await expect(
      t.withIdentity({ subject: adminId }).query(api.analyticsCron.getSystemHealthForAdmin, { daysBack: 7 })
    ).resolves.toMatchObject({
      daysBack: 7,
      scope: { companyId, type: "company" },
    });

    await expect(
      t.withIdentity({ subject: superAdminId }).query(api.analyticsCron.getSystemHealthForAdmin, { daysBack: 7 })
    ).resolves.toMatchObject({
      daysBack: 7,
      scope: { type: "platform" },
    });
  });
});
