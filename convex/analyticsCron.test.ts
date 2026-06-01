import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
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
});
