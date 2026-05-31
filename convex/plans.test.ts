import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Plans Authorization", () => {
  test("company plan status is scoped to admins in the same company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, adminAId, adminBId } = await t.run(async (ctx) => {
      const planId = await ctx.db.insert("plans", {
        name: "Team Plan",
        messageLimit: 100,
        priceGBP: 29,
        isActive: true,
        createdAt: Date.now(),
      });
      const companyAId = await ctx.db.insert("companies", {
        name: "Company A",
        planId,
        messagesUsedThisPeriod: 12,
        createdAt: Date.now(),
      });
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

      return { companyAId, companyBId, adminAId, adminBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    const ownStatus = await adminAClient.query(api.plans.getCompanyPlanStatus, { companyId: companyAId });
    expect(ownStatus).toEqual({
      planName: "Team Plan",
      messageLimit: 100,
      messagesUsed: 12,
    });

    await expect(adminAClient.mutation(api.plans.createPlan, {
      name: "Rogue Plan",
      messageLimit: 1,
      priceGBP: 1,
      isActive: true,
    })).rejects.toThrow("Unauthorized access. Super Admin role required.");

    const foreignStatus = await adminBClient.query(api.plans.getCompanyPlanStatus, { companyId: companyAId });
    expect(foreignStatus).toBeNull();
  });
});
