import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - Agents", () => {
  test("Standard USER cannot execute any Agent CRUD operations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.query(api.agents.list)
    ).rejects.toThrow("Unauthorized");

    await expect(
      maliciousClient.mutation(api.agents.createAgent, { name: "Rogue Agent" })
    ).rejects.toThrow("Unauthorized");

    // Pass a valid dummy ID to bypass schema strictness
    const dummyAgentId = await t.run(async (ctx) => {
      return await ctx.db.insert("agents", {
         name: "Dummy",
         modelId: "gemini",
         thinkingMode: false,
         isActive: true,
         temperature: 1.0,
         humanApprovalRequired: false,
         createdAt: Date.now(),
         updatedAt: Date.now(),
      });
    });

    await expect(
      maliciousClient.mutation(api.agents.deleteAgent, { id: dummyAgentId })
    ).rejects.toThrow("Unauthorized");
  });
});
