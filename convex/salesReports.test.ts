import { convexTest } from "convex-test";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const kpis = {
  totalPipeline: 0,
  weightedPipeline: 0,
  openDeals: 0,
  winRatePct: 0,
};

describe("Sales report access controls", () => {
  test("company admins only read their latest company report", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
    });
    const companyBId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
    });
    const agentId = await t.run(async (ctx) => {
      return await ctx.db.insert("agents", {
        name: "Reporter",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
      });
    });
    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("salesReports", {
        agentId,
        companyId: companyAId,
        headline: "Company A report",
        kpis,
        createdAt: 100,
      });
      await ctx.db.insert("salesReports", {
        agentId,
        companyId: companyBId,
        headline: "Company B report",
        kpis,
        createdAt: 200,
      });
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminReport = await adminAClient.query(api.salesReports.getLatestReport);
    expect(adminReport?.headline).toBe("Company A report");

    const superAdminReport = await superAdminClient.query(api.salesReports.getLatestReport);
    expect(superAdminReport?.headline).toBe("Company B report");
  });
});
