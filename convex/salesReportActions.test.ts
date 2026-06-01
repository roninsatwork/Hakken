import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("sales report actions", () => {
  test("report generation handles missing agents, missing documents, and empty document content before AI generation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, emptyDocAgentId, missingAgentId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "No Docs Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.2,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const emptyDocAgentId = await ctx.db.insert("agents", {
        name: "Empty Docs Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.2,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const missingAgentId = await ctx.db.insert("agents", {
        name: "Deleted Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.2,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.delete(missingAgentId);
      await ctx.db.insert("knowledgeDocuments", {
        title: "Empty CSV",
        textContent: "   ",
        agentId: emptyDocAgentId,
        status: "ready",
        format: "text/csv",
        createdBy: superAdminId,
        createdAt: Date.now(),
      });

      return { agentId, emptyDocAgentId, missingAgentId };
    });

    await expect(t.action(internal.salesReportActions.generateReport, { agentId: missingAgentId })).rejects.toThrow(
      "Agent not found"
    );
    await expect(t.action(internal.salesReportActions.generateReport, { agentId })).resolves.toBeNull();
    await expect(
      t.action(internal.salesReportActions.generateReport, { agentId: emptyDocAgentId })
    ).rejects.toThrow("Could not extract any CSV data from the knowledge base.");
  });
});
