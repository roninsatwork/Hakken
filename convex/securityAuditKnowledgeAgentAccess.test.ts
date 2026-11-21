import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

/**
 * A company admin can't read or add to another company's agent's knowledge (Sonae `2a05a33b`, brought over on 21 November
 * 2026; wiki-sonae-catch-up-plan-2026-11-21.md, 0.2).
 */

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("knowledge agent tenant authorization", () => {
  test("a company admin cannot inspect or write knowledge for unavailable agents", async () => {
    const t = makeTest();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const companyAId = await ctx.db.insert("companies", {
        name: "Company A", messagesUsedThisPeriod: 0, createdAt: now,
      });
      const companyBId = await ctx.db.insert("companies", {
        name: "Company B", messagesUsedThisPeriod: 0, createdAt: now,
      });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.test", role: "ADMIN", companyId: companyAId,
      });
      const foreignAgentId = await ctx.db.insert("agents", {
        name: "Foreign Strategy Agent",
        description: "Handles clandestine acquisitions",
        systemPrompt: "Use confidential zephyr dossiers.",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        companyId: companyBId,
        createdAt: now,
        updatedAt: now,
      });
      const inlineAgentId = await ctx.db.insert("agents", {
        name: "Private Workflow Agent",
        systemPrompt: "Never expose the workflow secret.",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        isGlobal: false,
        createdAt: now,
        updatedAt: now,
      });
      return { adminAId, foreignAgentId, inlineAgentId };
    });
    const client = t.withIdentity({ subject: seeded.adminAId });

    await expect(client.query(api.knowledge.getQualitySummary, {
      agentId: seeded.foreignAgentId,
    })).rejects.toThrow("Agent not found");
    await expect(client.query(api.knowledge.getQualitySummary, {
      agentId: seeded.inlineAgentId,
    })).rejects.toThrow("Agent not found");
    await expect(client.mutation(api.knowledge.saveManualText, {
      agentId: seeded.foreignAgentId,
      title: "Unauthorized attachment",
      textContent: "This must not be linked to another company's agent.",
    })).rejects.toThrow("Agent not found");
  });
});
