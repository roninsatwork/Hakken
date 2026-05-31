import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
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
        modelId: "gemini",
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
});
