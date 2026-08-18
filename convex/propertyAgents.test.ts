import { convexTest } from "convex-test";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Rightmove property agent trigger", () => {
  test("starts the configured Rightmove Agent for the caller's tenant", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, userId, agentId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Property Co", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
      const userId = await ctx.db.insert("users", {
        email: "agent-user@example.com",
        role: "USER",
        companyId,
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Rightmove Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        temperature: 1,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { companyId, userId, agentId };
    });

    const result = await t.withIdentity({ subject: userId }).mutation(api.propertyAgents.startRightmoveCollection, {
      rightmoveUrl: "https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=REGION%5E87490",
      maxProperties: 37,
    });

    expect(result.status).toBe("QUEUED");

    const run = await t.run(async (ctx) => await ctx.db.get(result.agentRunId));
    expect(run).toMatchObject({
      agentId,
      companyId,
      userId,
      triggerType: "MANUAL",
      status: "QUEUED",
    });
    expect(run?.agentVersionId).toBeTruthy();
    expect(run?.objective).toContain("Gather up to 37 properties.");
    expect(run?.objective).toContain("rightmove.co.uk/property-for-sale/find.html");
  });

  test("rejects non-Rightmove URLs before creating a run", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Property Co", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
      return await ctx.db.insert("users", {
        email: "agent-user@example.com",
        role: "USER",
        companyId,
      });
    });

    await expect(
      t.withIdentity({ subject: userId }).mutation(api.propertyAgents.startRightmoveCollection, {
        rightmoveUrl: "https://example.com/property-for-sale/find.html",
        maxProperties: 37,
      })
    ).rejects.toThrow("Rightmove");
  });
});
