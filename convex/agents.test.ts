import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { SYSTEM_FAILSAFE_MODEL_ID } from "./aiModelService";

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
         modelId: "test-model",
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

  test("New agents use the platform failsafe when the configured default is disabled", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });

      await ctx.db.insert("aiModels", {
        modelId: "disabled-default",
        displayName: "Disabled Default",
        isEnabled: false,
        isDefault: true,
        lastSyncedAt: Date.now()
      });

      return userId;
    });

    const client = t.withIdentity({ subject: adminId });
    const agentId = await client.mutation(api.agents.createAgent, { name: "Fallback Agent" });

    const agent = await t.run(async (ctx) => await ctx.db.get(agentId));
    expect(agent?.modelId).toBe(SYSTEM_FAILSAFE_MODEL_ID);
  });
});
