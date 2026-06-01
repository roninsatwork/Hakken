import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modelConfig = {
  modelId: "sonae-test-model",
  displayName: "Sonae Test Model",
  friendlyName: "Test Model",
  isEnabled: true,
  isDefault: true,
  lastSyncedAt: 1,
  standardInputCostBelow200k: 1,
  standardInputCostAbove200k: 1,
  outputResponseCost: 2,
};

describe("hybrid analytics", () => {
  test("global AI costs require super admin and aggregate assistant messages", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const now = Date.now();
    const { userId, superAdminId } = await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", modelConfig);
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        createdAt: now,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: now,
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        title: "Hybrid Cost Thread",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Costed",
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        modelUsed: "sonae-test-model",
        createdAt: now,
      });

      return { userId, superAdminId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(userClient.query(api.analyticsHybrid.getGlobalAICosts, { timeframe: "30d" })).rejects.toThrow(
      "Unauthorized"
    );

    const costs = await superAdminClient.query(api.analyticsHybrid.getGlobalAICosts, {
      timeframe: "custom",
      customStart: now - 1_000,
      customEnd: now + 1_000,
    });

    expect(costs).toMatchObject({
      periodProcessed: 1,
      periodInputTokens: 1_000_000,
      periodOutputTokens: 500_000,
      periodTokens: 1_500_000,
      periodCostGBP: 1.56,
      avgCostPerUser: 1.56,
      avgCostPerThread: 1.56,
      aggregationType: "day",
    });
    expect(costs.timeline.reduce((sum, point) => sum + point.costGBP, 0)).toBeCloseTo(1.56, 6);
  });

  test("platform overview computes weekly active users and leaderboard costs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const now = Date.now();
    const { superAdminId } = await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", modelConfig);
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        name: "User One",
        image: "user.png",
        role: "USER",
        createdAt: now,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: now,
      });
      const threadId = await ctx.db.insert("threads", {
        userId,
        title: "Overview Thread",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Recent answer",
        inputTokens: 200_000,
        outputTokens: 100_000,
        modelUsed: "sonae-test-model",
        createdAt: now,
      });

      return { superAdminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const overview = await superAdminClient.query(api.analyticsHybrid.getPlatformOverview, {});

    expect(overview).toMatchObject({
      totalUsers: 2,
      wauCount: 1,
      totalThreads: 1,
      avgInteractionDepth: 1,
      cost30DGBP: 0.312,
      costPerActiveUserGBP: 0.312,
    });
    expect(overview.topUsers[0]).toMatchObject({
      name: "User One",
      email: "user@test.com",
      image: "user.png",
      costGBP: 0.31200000000000006,
      messageCount: 1,
    });
  });

  test("user cost overview is tenant-isolated and returns sorted thread totals", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const now = Date.now();
    const { companyAId, adminAId, userAId, userBId } = await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", modelConfig);
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
        createdAt: now,
      });
      const userAId = await ctx.db.insert("users", {
        email: "user-a@test.com",
        role: "USER",
        companyId: companyAId,
        createdAt: now,
      });
      const userBId = await ctx.db.insert("users", {
        email: "user-b@test.com",
        role: "USER",
        companyId: companyBId,
        createdAt: now,
      });
      const oldThreadId = await ctx.db.insert("threads", {
        userId: userAId,
        companyId: companyAId,
        title: "Old Thread",
        createdAt: now - 10,
        updatedAt: now - 10,
      });
      const newThreadId = await ctx.db.insert("threads", {
        userId: userAId,
        companyId: companyAId,
        title: "New Thread",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId: oldThreadId,
        role: "assistant",
        content: "Old",
        inputTokens: 100_000,
        outputTokens: 100_000,
        modelUsed: "sonae-test-model",
        createdAt: now - 10,
      });
      await ctx.db.insert("messages", {
        threadId: newThreadId,
        role: "assistant",
        content: "New",
        inputTokens: 200_000,
        outputTokens: 100_000,
        modelUsed: "sonae-test-model",
        createdAt: now,
      });

      return { companyAId, adminAId, userAId, userBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });

    await expect(adminAClient.query(api.analyticsHybrid.getUserCostOverview, { userId: userBId })).rejects.toThrow(
      "Unauthorized"
    );

    const overview = await adminAClient.query(api.analyticsHybrid.getUserCostOverview, { userId: userAId });

    expect(overview).toMatchObject({
      totalCostGBP: 0.546,
      totalTokens: 500_000,
      totalInputTokens: 300_000,
      totalOutputTokens: 200_000,
    });
    expect(overview.threads.map((thread) => thread.title)).toEqual(["New Thread", "Old Thread"]);
    expect(overview.threads[0].costGBP).toBeCloseTo(0.312, 6);
    expect(companyAId).toBeDefined();
  });

  test("company and global analytics combine live usage, transactions, leaderboards, plans, and debug helpers", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const now = Date.now();
    const { companyAId, companyBId, adminAId, superAdminId, agentId, userAId, planId } = await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", modelConfig);
      const planId = await ctx.db.insert("plans", {
        name: "Growth",
        messageLimit: 1_000,
        priceGBP: 80,
        isActive: true,
        createdAt: now,
      });
      const companyAId = await ctx.db.insert("companies", { name: "Company A", planId, createdAt: now });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: now });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
        createdAt: now,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: now,
      });
      const userAId = await ctx.db.insert("users", {
        email: "user-a@test.com",
        name: "User A",
        role: "USER",
        companyId: companyAId,
        createdAt: now,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Support Agent",
        modelId: "sonae-test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const widgetId = await ctx.db.insert("widgets", {
        companyId: companyAId,
        agentId,
        name: "Widget",
        allowedDomains: ["https://example.com"],
        isActive: true,
        createdBy: adminAId,
        createdAt: now,
      });
      const threadId = await ctx.db.insert("threads", {
        userId: userAId,
        companyId: companyAId,
        agentId,
        widgetId,
        title: "Hybrid Thread",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Live",
        inputTokens: 300_000,
        outputTokens: 200_000,
        modelUsed: "sonae-test-model",
        createdAt: now,
      });
      await ctx.db.insert("agentTransactions", {
        agentId,
        userId: userAId,
        companyId: companyAId,
        actionContext: "Workflow",
        inputTokens: 100_000,
        outputTokens: 100_000,
        modelUsed: "sonae-test-model",
        costGBP: 0,
        status: "SUCCESS",
        createdAt: now,
      });
      await ctx.db.insert("knowledgeDocuments", {
        title: "Doc",
        textContent: "Knowledge",
        companyId: companyAId,
        status: "ready",
        format: "text/plain",
        createdBy: adminAId,
        createdAt: now,
      });

      return { companyAId, companyBId, adminAId, superAdminId, agentId, userAId, planId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      adminAClient.query(api.analyticsHybrid.getCompanyMetrics, { companyId: companyBId, timeframe: "30d" })
    ).rejects.toThrow("Unauthorized");

    const companyMetrics = await adminAClient.query(api.analyticsHybrid.getCompanyMetrics, {
      companyId: companyAId,
      timeframe: "custom",
      customStart: now - 1_000,
      customEnd: now + 1_000,
    });
    const globalAnalytics = await superAdminClient.query(api.analyticsHybrid.getGlobalAnalytics, {
      timeframe: "custom",
      customStart: now - 1_000,
      customEnd: now + 1_000,
    });
    const debugTime = await t.run(async (ctx) => ctx.runQuery(internal.analyticsHybrid.debugTime, {}));
    const debugDb = await t.run(async (ctx) => ctx.runQuery(internal.analyticsHybrid.debugDb, {}));

    expect(companyMetrics.aggregates).toMatchObject({
      activeUsers: 1,
      totalMessages: 2,
      totalTokens: 700_000,
      totalInputTokens: 400_000,
      totalOutputTokens: 300_000,
      totalCostGBP: 0.78,
      costPerActiveUser: 0.78,
      avgCostPerMessage: 0.39,
      aggregationType: "day",
      mrr: 80,
      knowledgeDocuments: 1,
      mau: 0,
    });
    expect(companyMetrics.topUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "WIDGET_USER_GROUP", messages: 1 }),
        expect.objectContaining({ id: userAId, messages: 1 }),
      ])
    );
    expect(companyMetrics.topUsers.find((user) => user.id === "WIDGET_USER_GROUP")?.cost).toBeCloseTo(0.546, 6);
    expect(companyMetrics.topUsers.find((user) => user.id === userAId)?.cost).toBeCloseTo(0.234, 6);
    expect(companyMetrics.topAgents[0]).toMatchObject({ id: agentId, interactions: 2, cost: 0.78 });
    expect(globalAnalytics.aggregates).toMatchObject({
      activeUsers: 1,
      mau: 1,
      mrr: 80,
      totalMessages: 2,
      totalTokens: 700_000,
      totalInputTokens: 400_000,
      totalOutputTokens: 300_000,
      totalCostGBP: 0.78,
      costPerActiveUser: 0.26,
      avgCostPerMessage: 0.39,
      aggregationType: "day",
    });
    expect(globalAnalytics.topCompanies[0]).toMatchObject({ id: companyAId, cost: 0.78, messages: 2 });
    expect(globalAnalytics.modelDistribution[0]).toMatchObject({ name: "Test Model", cost: 0.78, calls: 2 });
    expect(globalAnalytics.planDistribution).toEqual([{ planId, name: "Growth", mrr: 80, companies: 1 }]);
    expect(debugTime).toEqual([expect.objectContaining({ userId: userAId, tokens: 100_000 })]);
    expect(debugDb.companies.map((company) => company._id).sort()).toEqual([companyAId, companyBId].sort());
  });
});
