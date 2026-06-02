import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Agent Transactions", () => {
  test("admins see only their company transactions while super admins see all agent usage", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, adminAId, adminBId, orphanAdminId, superAdminId, txAId, txBId } = await t.run(async (ctx) => {
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
        name: "Usage Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.4,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const txAId = await ctx.db.insert("agentTransactions", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        actionContext: "Company A chat",
        inputTokens: 100,
        outputTokens: 20,
        modelUsed: "model-test",
        costGBP: 0.05,
        status: "SUCCESS",
        createdAt: 100,
      });
      const txBId = await ctx.db.insert("agentTransactions", {
        agentId,
        companyId: companyBId,
        userId: adminBId,
        actionContext: "Company B chat",
        inputTokens: 300,
        outputTokens: 40,
        modelUsed: "model-test",
        costGBP: 0.15,
        status: "FAILED",
        createdAt: 200,
      });

      return { agentId, adminAId, adminBId, orphanAdminId, superAdminId, txAId, txBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const orphanAdminClient = t.withIdentity({ subject: orphanAdminId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminAPage = await adminAClient.query(api.agentTransactions.getForAgent, { agentId, paginationOpts });
    expect(adminAPage.page.map((transaction) => transaction._id)).toEqual([txAId]);

    const adminBStats = await adminBClient.query(api.agentTransactions.getStatsForAgent, { agentId });
    expect(adminBStats).toEqual({
      totalGenerations: 1,
      totalTokensIngested: 340,
      totalInputTokens: 300,
      totalOutputTokens: 40,
      totalOpexCost: 0.15,
    });

    const superAdminPage = await superAdminClient.query(api.agentTransactions.getForAgent, { agentId, paginationOpts });
    expect(superAdminPage.page.map((transaction) => transaction._id)).toEqual([txBId, txAId]);
    await expect(orphanAdminClient.query(api.agentTransactions.getStatsForAgent, { agentId })).rejects.toThrow(
      "Unauthorized"
    );
    await expect(t.query(api.agentTransactions.getForAgent, { agentId, paginationOpts })).rejects.toThrow(
      "Unauthenticated request"
    );
  });

  test("internal transaction insertion stamps usage records for later reporting", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, companyId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Billing Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.4,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { agentId, companyId, userId };
    });

    const insertedId = await t.mutation(internal.agentTransactions.insertTransactionInternal, {
      agentId,
      companyId,
      userId,
      actionContext: "Assistant response",
      modelUsed: "model-test",
      providerKey: "google",
      providerModelId: "model-test",
      inputTokens: 12,
      outputTokens: 34,
      costGBP: 0.01,
      status: "SUCCESS",
    });

    const inserted = await t.run(async (ctx) => ctx.db.get(insertedId));
    expect(inserted).toMatchObject({
      agentId,
      companyId,
      userId,
      actionContext: "Assistant response",
      modelUsed: "model-test",
      providerKey: "google",
      providerModelId: "model-test",
      inputTokens: 12,
      outputTokens: 34,
      status: "SUCCESS",
    });
    expect(inserted?.createdAt).toEqual(expect.any(Number));
  });

  test("internal transaction seeding uses configured model pricing and admin identity", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, superAdminId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
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
      const agentId = await ctx.db.insert("agents", {
        name: "Seeded Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.4,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { agentId, superAdminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    await superAdminClient.mutation(internal.agentTransactions.seedForAgent, { agentId });

    const seededTransactions = await t.run(async (ctx) =>
      ctx.db.query("agentTransactions").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()
    );
    expect(seededTransactions).toHaveLength(15);
    expect(seededTransactions.every((transaction) => transaction.userId === superAdminId)).toBe(true);
    expect(seededTransactions.every((transaction) => transaction.costGBP >= 0)).toBe(true);
  });
});
