import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modelConfig = {
  modelId: "hakken-test-model",
  displayName: "Hakken Test Model",
  friendlyName: "Test Model",
  isEnabled: true,
  isDefault: true,
  lastSyncedAt: 1,
  standardInputCostBelow200k: 1,
  standardInputCostAbove200k: 1,
  outputResponseCost: 2,
};

describe("Analytics MRR Strict Isolation", () => {
  test("MRR calculates only from companies with active plans", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Set up Super Admin to fetch global analytics
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });
    });

    // Create system config needed for MRR
    await t.run(async (ctx) => {
      await ctx.db.insert("systemSettings", {
        platformName: "Hakken Testing"
      });
    });

    const client = t.withIdentity({ subject: adminId });

    // Active expensive plan
    const activePlanId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        name: "Enterprise",
        messageLimit: -1,
        priceGBP: 100,
        isActive: true,
        createdAt: Date.now()
      });
    });

    // Inactive obsolete plan
    const inactivePlanId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        name: "Legacy",
        messageLimit: 50,
        priceGBP: 50,
        isActive: false,
        createdAt: Date.now()
      });
    });

    // Company 1: Active
    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Active Corp",
        planId: activePlanId,
        createdAt: Date.now()
      });
    });

    // Company 2: Active
    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Another Active Corp",
        planId: activePlanId,
        createdAt: Date.now()
      });
    });

    // Company 3: Should not contribute (Legacy Inactive Plan)
    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Legacy Corp",
        planId: inactivePlanId,
        createdAt: Date.now()
      });
    });

    // Company 4: Should not contribute (Free/No Plan)
    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Free Corp",
        createdAt: Date.now()
      });
    });

    // Run Inventory Metrics
    await client.mutation(api.inventoryRollups.rebuildGlobalInventoryRollup, {});
    const inventory = await client.query(api.analytics.getGlobalInventoryMetrics, {});
    
    // MRR should be exactly 2 * 100 = 200 (Active Corp + Another Active Corp)
    expect(inventory.aggregates.mrr).toBe(200);
    expect(inventory.systemIntegrity.totalProvisionedCompanies).toBe(4);
    expect(inventory.planDistribution).toEqual([
      {
        planId: activePlanId,
        name: "Enterprise",
        mrr: 200,
        companies: 2,
      },
    ]);
  });

  test("global inventory metrics read maintained rollups after admin mutations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      })
    );
    const client = t.withIdentity({ subject: superAdminId });

    await client.mutation(api.inventoryRollups.rebuildGlobalInventoryRollup, {});

    const planId = await client.mutation(api.plans.createPlan, {
      name: "Growth",
      description: "Growth tier",
      messageLimit: -1,
      priceGBP: 80,
      isActive: true,
    });
    const companyId = await client.mutation(api.companies.createCompany, {
      name: "Growth Corp",
    });
    await client.mutation(api.companies.assignPlanToCompany, { id: companyId, planId });
    const userId = await client.mutation(api.users.addUser, {
      name: "Ada",
      email: "ada@test.com",
      role: "USER",
      companyId,
    });

    const inventory = await client.query(api.analytics.getGlobalInventoryMetrics, {});
    expect(inventory).toMatchObject({
      aggregates: { mrr: 80 },
      systemIntegrity: {
        totalProvisionedUsers: 2,
        totalProvisionedCompanies: 1,
      },
      planDistribution: [{ planId, name: "Growth", mrr: 80, companies: 1 }],
    });

    await client.mutation(api.plans.updatePlan, { id: planId, priceGBP: 120, name: "Scale" });
    expect(await client.query(api.analytics.getGlobalInventoryMetrics, {})).toMatchObject({
      aggregates: { mrr: 120 },
      planDistribution: [{ planId, name: "Scale", mrr: 120, companies: 1 }],
    });

    await client.mutation(api.users.deleteUser, { id: userId });
    await client.mutation(api.companies.deleteCompany, { id: companyId });
    expect(await client.query(api.analytics.getGlobalInventoryMetrics, {})).toMatchObject({
      aggregates: { mrr: 0 },
      systemIntegrity: {
        totalProvisionedUsers: 1,
        totalProvisionedCompanies: 0,
      },
      planDistribution: [],
    });
  });

  test("global AI costs require super admin and aggregate bounded assistant messages", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const now = Date.now();
    const { userId, superAdminId } = await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", modelConfig);
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        name: "Regular User",
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
        title: "Costed Thread",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "A costed answer",
        userId,
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        modelUsed: "hakken-test-model",
        analyticsDimensionsVersion: 1,
        createdAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "User messages should not be costed",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        modelUsed: "hakken-test-model",
        createdAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Out of range",
        userId,
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        modelUsed: "hakken-test-model",
        analyticsDimensionsVersion: 1,
        createdAt: now - 10_000,
      });

      return { userId, superAdminId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      userClient.query(api.analytics.getGlobalAICosts, {
        timeframe: "custom",
        customStart: now - 1_000,
        customEnd: now + 1_000,
      })
    ).rejects.toThrow("Unauthorized");

    const costs = await superAdminClient.query(api.analytics.getGlobalAICosts, {
      timeframe: "custom",
      customStart: now - 1_000,
      customEnd: now + 1_000,
    });

    expect(costs.periodProcessed).toBe(1);
    expect(costs.periodInputTokens).toBe(1_000_000);
    expect(costs.periodOutputTokens).toBe(500_000);
    expect(costs.periodTokens).toBe(1_500_000);
    expect(costs.periodCostUSD).toBe(2);
    expect(costs.avgCostPerUser).toBe(2);
    expect(costs.avgCostPerThread).toBe(2);
    expect(costs.aggregationType).toBe("day");
    expect(costs.timeline.reduce((sum, point) => sum + point.costGBP, 0)).toBeCloseTo(2, 6);
  });

  test("user cost overview is tenant-isolated and includes assistant thread costs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      const threadId = await ctx.db.insert("threads", {
        userId: userAId,
        companyId: companyAId,
        title: "User A Thread",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Costed answer",
        companyId: companyAId,
        userId: userAId,
        inputTokens: 200_000,
        outputTokens: 100_000,
        modelUsed: "hakken-test-model",
        analyticsDimensionsVersion: 1,
        createdAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "Ignored for cost but counted as thread depth",
        createdAt: now,
      });
      await ctx.db.insert("analyticsDailySnapshots", {
        date: yesterday,
        type: "user",
        userId: userAId,
        metrics: {
          totalMessages: 1,
          totalInputTokens: 10,
          totalOutputTokens: 20,
          costGBP: 1.5,
        },
        uniqueUserIds: [userAId],
      });

      return { companyAId, adminAId, userAId, userBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });

    await expect(adminAClient.query(api.analytics.getUserCostOverview, { userId: userBId })).rejects.toThrow(
      "Unauthorized: Company Admin clearance required."
    );

    const overview = await adminAClient.query(api.analytics.getUserCostOverview, { userId: userAId });

    expect(overview.totalCostGBP).toBe(1.9);
    expect(overview.totalTokens).toBe(300_030);
    expect(overview.totalInputTokens).toBe(200_010);
    expect(overview.totalOutputTokens).toBe(100_020);
    expect(overview.threads).toHaveLength(0);

    const threadCosts = await adminAClient.query(api.analytics.getUserCostThreads, {
      userId: userAId,
      paginationOpts: { numItems: 15, cursor: null },
    });

    expect(threadCosts.page).toHaveLength(1);
    expect(threadCosts.page[0]).toMatchObject({
      title: "User A Thread",
      messageCount: 2,
      threadTokens: 300_000,
    });
    expect(threadCosts.page[0].costGBP).toBeCloseTo(0.4, 6);
    expect(companyAId).toBeDefined();
  });

  test("company metrics combine live usage, snapshots, plan MRR, knowledge count, and tenant authorization", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { companyAId, companyBId, adminAId, agentId, userAId } = await t.run(async (ctx) => {
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
      const userAId = await ctx.db.insert("users", {
        email: "user-a@test.com",
        name: "User A",
        role: "USER",
        companyId: companyAId,
        createdAt: now,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Support Agent",
        modelId: "hakken-test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const widgetId = await ctx.db.insert("widgets", {
        companyId: companyAId,
        agentId,
        name: "Docs Widget",
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
        title: "Widget Thread",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "assistant",
        content: "Live company message",
        inputTokens: 300_000,
        outputTokens: 200_000,
        modelUsed: "hakken-test-model",
        createdAt: now,
        companyId: companyAId,
        userId: userAId,
        agentId,
        widgetId,
        analyticsDimensionsVersion: 1,
      });
      await ctx.db.insert("agentTransactions", {
        agentId,
        userId: userAId,
        companyId: companyAId,
        actionContext: "Workflow",
        inputTokens: 100_000,
        outputTokens: 100_000,
        modelUsed: "hakken-test-model",
        costGBP: 0,
        status: "SUCCESS",
        createdAt: now,
      });
      await ctx.db.insert("analyticsDailySnapshots", {
        date: yesterday,
        type: "company",
        companyId: companyAId,
        metrics: {
          totalMessages: 2,
          totalInputTokens: 10,
          totalOutputTokens: 20,
          costGBP: 3,
        },
        uniqueUserIds: [userAId],
        modelMetrics: [{ model: "hakken-test-model", cost: 3, calls: 2 }],
        leaderboards: {
          topAgents: [
            {
              id: agentId,
              name: "Support Agent",
              avatar: "agent.png",
              cost: 3,
              interactions: 2,
            },
          ],
          topUsers: [
            {
              id: userAId,
              name: "User A",
              image: "user.png",
              email: "user-a@test.com",
              cost: 3,
              messages: 2,
            },
          ],
        },
      });
      await ctx.db.insert("analyticsDailySnapshots", {
        date: new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        type: "company",
        companyId: companyAId,
        metrics: {
          totalMessages: 999,
          totalInputTokens: 999,
          totalOutputTokens: 999,
          costGBP: 999,
        },
        uniqueUserIds: [userAId],
      });
      await ctx.db.insert("knowledgeDocuments", {
        title: "Company A Doc",
        textContent: "Knowledge",
        companyId: companyAId,
        status: "ready",
        format: "text/plain",
        createdBy: adminAId,
        createdAt: now,
      });

      return { companyAId, companyBId, adminAId, agentId, userAId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });

    await expect(
      adminAClient.query(api.analytics.getCompanyMetrics, { companyId: companyBId, timeframe: "30d" })
    ).rejects.toThrow("Unauthorized");

    const metrics = await adminAClient.query(api.analytics.getCompanyMetrics, {
      companyId: companyAId,
      timeframe: "30d",
    });

    expect(metrics.aggregates).toMatchObject({
      activeUsers: 1,
      totalMessages: 4,
      totalTokens: 700_030,
      totalInputTokens: 400_010,
      totalOutputTokens: 300_020,
      totalCostGBP: 4,
      costPerActiveUser: 4,
      avgCostPerMessage: 1,
      aggregationType: "day",
      mrr: 80,
      knowledgeDocuments: 1,
      mau: 0,
    });
    expect(metrics.topUsers[0]).toMatchObject({ id: userAId, cost: 3.3, messages: 3 });
    expect(metrics.topAgents[0]).toMatchObject({ id: agentId, interactions: 4, cost: 4 });
    expect(metrics.timeline.reduce((sum, point) => sum + point.messages, 0)).toBe(4);
  });

  test("company metrics keep snapshot leaderboard metadata for missing user records", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { companyId, adminId } = await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", modelConfig);
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
      const adminId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId,
        createdAt: now,
      });
      await ctx.db.insert("analyticsDailySnapshots", {
        date: yesterday,
        type: "company",
        companyId,
        metrics: {
          totalMessages: 2,
          totalInputTokens: 10,
          totalOutputTokens: 20,
          costGBP: 3,
        },
        uniqueUserIds: ["deleted-user"],
        leaderboards: {
          topAgents: [],
          topUsers: [
            {
              id: "deleted-user",
              name: "Deleted User",
              image: "deleted.png",
              email: "deleted@test.com",
              cost: 3,
              messages: 2,
            },
          ],
        },
      });

      return { companyId, adminId };
    });

    const metrics = await t.withIdentity({ subject: adminId }).query(api.analytics.getCompanyMetrics, {
      companyId,
      timeframe: "30d",
    });

    expect(metrics.topUsers[0]).toMatchObject({
      id: "deleted-user",
      name: "Deleted User",
      image: "deleted.png",
      email: "deleted@test.com",
      cost: 3,
      messages: 2,
    });
  });

  test("platform overview handles empty analytics data for super admins only", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });

      return { userId, superAdminId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(userClient.query(api.analytics.getPlatformOverview, {})).rejects.toThrow("Unauthorized");

    const overview = await superAdminClient.query(api.analytics.getPlatformOverview, {});

    expect(overview).toMatchObject({
      totalUsers: 0,
      wauCount: 0,
      totalThreads: 0,
      avgInteractionDepth: 1,
      total30DCostUSD: 0,
      costPerActiveUserGBP: 0,
      topUsers: [],
    });
  });
});

describe("the platform-wide analytics read", () => {
  /**
   * `getGlobalAnalytics` had no test reaching it, and its declared shape was
   * a field short: every person on the platform board carries the workspace
   * they belong to, and no fixture here produced one, so the suite stayed green
   * while the real screen refused to load. This reads it with a person who has
   * a company and a person who has none, which is what makes both branches of
   * that field real.
   */
  test("the boards name each person's workspace, including those with none", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const superAdminId = await t.run(async (ctx) => {
      await ctx.db.insert("aiModels", modelConfig);
      const companyId = await ctx.db.insert("companies", { name: "Board Co", createdAt: now });
      const inCompany = await ctx.db.insert("users", {
        email: "in-company@test.com",
        name: "In Company",
        role: "USER",
        companyId,
        createdAt: now,
      });
      const independent = await ctx.db.insert("users", {
        email: "independent@test.com",
        name: "Independent Person",
        role: "USER",
        createdAt: now,
      });

      for (const userId of [inCompany, independent]) {
        const threadId = await ctx.db.insert("threads", {
          userId,
          title: "Costed Thread",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("messages", {
          threadId,
          role: "assistant",
          content: "A costed answer",
          userId,
          companyId: userId === inCompany ? companyId : undefined,
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          modelUsed: "hakken-test-model",
          analyticsDimensionsVersion: 1,
          createdAt: now,
        });
      }

      return ctx.db.insert("users", { email: "board-super@test.com", role: "SUPER_ADMIN", createdAt: now });
    });

    const analytics = await t.withIdentity({ subject: superAdminId })
      .query(api.analytics.getGlobalAnalytics, { timeframe: "30d" });

    // Proof this read something: an empty board would have nothing to be wrong about.
    expect(analytics.topUsers.length).toBeGreaterThan(0);
    expect(analytics.topUsers.map((leader) => leader.companyName).sort())
      .toEqual(["Board Co", "External Web Traffic", "Independent"]);
  });
});
