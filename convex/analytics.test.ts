import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Analytics MRR Strict Isolation", () => {
  test("MRR calculates only from companies with active plans", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Set up Super Admin to fetch global analytics
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN"
      });
    });

    // Create system config needed for MRR
    await t.run(async (ctx) => {
      await ctx.db.insert("systemSettings", {
        platformName: "Sonae Testing"
      });
    });

    const client = t.withIdentity({ subject: adminId });

    // Active expensive plan
    const activePlanId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        name: "Enterprise",
        messageLimit: -1,
        priceGBP: 100,
        isActive: true,
        createdAt: Date.now()
      });
    });

    // Inactive obsolete plan
    const inactivePlanId = await t.run(async (ctx) => {
      return await ctx.db.insert("plans", {
        name: "Legacy",
        messageLimit: 50,
        priceGBP: 50,
        isActive: false,
        createdAt: Date.now()
      });
    });

    // Company 1: Active
    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Active Corp",
        planId: activePlanId,
        createdAt: Date.now()
      });
    });

    // Company 2: Active
    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Another Active Corp",
        planId: activePlanId,
        createdAt: Date.now()
      });
    });

    // Company 3: Should not contribute (Legacy Inactive Plan)
    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Legacy Corp",
        planId: inactivePlanId,
        createdAt: Date.now()
      });
    });

    // Company 4: Should not contribute (Free/No Plan)
    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Free Corp",
        createdAt: Date.now()
      });
    });

    // Run Analytics
    const analytics = await client.query(api.dashboard.getGlobalAnalytics, {});
    
    // MRR should be exactly 2 * 100 = 200 (Active Corp + Another Active Corp)
    expect(analytics.mrrGBP).toBe(200);
  });
});
