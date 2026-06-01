import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("Agent Logs Authorization", () => {
  test("admins can only access agent logs from their own company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, adminAId, adminBId, logAId, logBId } = await t.run(async (ctx) => {
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
        name: "Support Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        temperature: 1,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const logAId = await ctx.db.insert("agentLogs", {
        agentId,
        companyId: companyAId,
        interactionType: "LLM SYNTHESIS",
        promptContent: "Company A prompt",
        responseContent: "Company A response",
        createdAt: Date.now(),
      });
      const logBId = await ctx.db.insert("agentLogs", {
        agentId,
        companyId: companyBId,
        interactionType: "LLM SYNTHESIS",
        promptContent: "Company B prompt",
        responseContent: "Company B response",
        createdAt: Date.now(),
      });

      return { agentId, adminAId, adminBId, logAId, logBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const page = await adminAClient.query(api.agentLogs.getOffsetPaginated, {
      agentId,
      searchTerm: "",
      page: 1,
      pageSize: 15,
    });

    expect(page.data.map((log) => log._id)).toEqual([logAId]);

    await expect(adminAClient.query(api.agentLogs.getLogById, { id: logBId })).rejects.toThrow("Unauthorized");
    await expect(adminBClient.mutation(api.agentLogs.deleteLog, { id: logAId })).rejects.toThrow("Unauthorized");
  });

  test("super admins can search, read, seed, and delete logs across companies", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, superAdminId, logId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const agentId = await ctx.db.insert("agents", {
        name: "Search Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.2,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const logId = await ctx.db.insert("agentLogs", {
        agentId,
        companyId,
        interactionType: "LLM SYNTHESIS",
        promptContent: "Find a needle in this prompt",
        responseContent: "Found it",
        createdAt: Date.now(),
      });

      return { agentId, superAdminId, logId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const searchPage = await superAdminClient.query(api.agentLogs.getOffsetPaginated, {
      agentId,
      searchTerm: "needle",
      page: 1,
      pageSize: 15,
    });
    expect(searchPage.data.map((log) => log._id)).toEqual([logId]);
    expect(await superAdminClient.query(api.agentLogs.getLogById, { id: logId })).toMatchObject({
      promptContent: "Find a needle in this prompt",
    });
    await expect(superAdminClient.query(api.agentLogs.getLogById, { id: "missing" as never })).rejects.toThrow(
      "Validator error"
    );

    await t.mutation(internal.agentLogs.insertAgentLogInternal, {
      agentId,
      interactionType: "TOOL DISPATCH",
      promptContent: "tool",
      responseContent: "{}",
    });
    await t.mutation(internal.agentLogs.seedForAgent, { agentId });

    const allLogs = await superAdminClient.query(api.agentLogs.getOffsetPaginated, {
      agentId,
      page: 1,
      pageSize: 100,
    });
    expect(allLogs.totalCount).toBe(47);

    await expect(superAdminClient.mutation(api.agentLogs.deleteLog, { id: logId })).resolves.toBeNull();
    await expect(superAdminClient.mutation(api.agentLogs.deleteLog, { id: logId })).rejects.toThrow("Log not found");
  });
});
