import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const embedding = Array.from({ length: 768 }, () => 0);

describe("AI read-only tools", () => {
  test("knowledge search returns agent and company scoped ready chunks", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Knowledge Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const agentDocId = await ctx.db.insert("knowledgeDocuments", {
        title: "Agent Playbook",
        companyId,
        agentId,
        status: "ready",
        format: "text/plain",
        createdBy: adminId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("knowledgeChunks", {
        documentId: agentDocId,
        companyId,
        agentId,
        isGlobal: false,
        text: "Pipeline review policy: always flag quiet enterprise deals before Friday.",
        embedding,
      });

      const companyDocId = await ctx.db.insert("knowledgeDocuments", {
        title: "Company Policy",
        companyId,
        status: "ready",
        format: "text/plain",
        createdBy: adminId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("knowledgeChunks", {
        documentId: companyDocId,
        companyId,
        isGlobal: false,
        text: "Company policy says pipeline risks must include owner, value, and next action.",
        embedding,
      });

      const pendingDocId = await ctx.db.insert("knowledgeDocuments", {
        title: "Pending Draft",
        companyId,
        status: "processing",
        format: "text/plain",
        createdBy: adminId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("knowledgeChunks", {
        documentId: pendingDocId,
        companyId,
        isGlobal: false,
        text: "Pipeline draft that should not be returned while processing.",
        embedding,
      });

      return { agentId, companyId };
    });

    const result = await t.query(internal.aiToolReadTools.searchKnowledge, {
      agentId,
      companyId,
      query: "pipeline policy risks",
      limit: 10,
    });

    expect(result.matches.map((match) => match.documentTitle)).toEqual(["Company Policy", "Agent Playbook"]);
    expect(result.matches.map((match) => match.scope).sort()).toEqual(["agent", "company"]);
    expect(result.matches.every((match) => match.snippet.toLowerCase().includes("pipeline"))).toBe(true);
  });

  test("knowledge search does not cross company boundaries", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { agentId, companyAId, companyBId } = await t.run(async (ctx) => {
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
        name: "Boundary Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const docAId = await ctx.db.insert("knowledgeDocuments", {
        title: "Company A Pipeline",
        companyId: companyAId,
        agentId,
        status: "ready",
        format: "text/plain",
        createdBy: adminAId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("knowledgeChunks", {
        documentId: docAId,
        companyId: companyAId,
        agentId,
        isGlobal: false,
        text: "Pipeline retention rule for Company A.",
        embedding,
      });

      const docBId = await ctx.db.insert("knowledgeDocuments", {
        title: "Company B Pipeline",
        companyId: companyBId,
        agentId,
        status: "ready",
        format: "text/plain",
        createdBy: adminBId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("knowledgeChunks", {
        documentId: docBId,
        companyId: companyBId,
        agentId,
        isGlobal: false,
        text: "Pipeline retention rule for Company B.",
        embedding,
      });

      return { agentId, companyAId, companyBId };
    });

    const companyAResult = await t.query(internal.aiToolReadTools.searchKnowledge, {
      agentId,
      companyId: companyAId,
      query: "pipeline retention rule",
      limit: 10,
    });
    const companyBResult = await t.query(internal.aiToolReadTools.searchKnowledge, {
      agentId,
      companyId: companyBId,
      query: "pipeline retention rule",
      limit: 10,
    });

    expect(companyAResult.matches.map((match) => match.documentTitle)).toEqual(["Company A Pipeline"]);
    expect(companyBResult.matches.map((match) => match.documentTitle)).toEqual(["Company B Pipeline"]);
  });
});
