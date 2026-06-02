import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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

  test("authenticated users can read plans and personal status uses overrides before company plan", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, activePlanId, inactivePlanId, overridePlanId } = await t.run(async (ctx) => {
      const activePlanId = await ctx.db.insert("plans", {
        name: "Team Plan",
        description: "Active",
        messageLimit: 100,
        priceGBP: 29,
        isActive: true,
        createdAt: Date.now(),
      });
      const inactivePlanId = await ctx.db.insert("plans", {
        name: "Legacy Plan",
        messageLimit: 50,
        priceGBP: 10,
        isActive: false,
        createdAt: Date.now() + 1,
      });
      const overridePlanId = await ctx.db.insert("plans", {
        name: "Override Plan",
        messageLimit: 10,
        priceGBP: 5,
        isActive: true,
        createdAt: Date.now() + 2,
      });
      const companyId = await ctx.db.insert("companies", {
        name: "Company A",
        planId: activePlanId,
        messagesUsedThisPeriod: 12,
        createdAt: Date.now(),
      });
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        companyId,
        planOverrideId: overridePlanId,
        messagesUsedThisPeriod: 3,
        createdAt: Date.now(),
      });

      return { userId, activePlanId, inactivePlanId, overridePlanId };
    });

    const userClient = t.withIdentity({ subject: userId });

    await expect(t.query(api.plans.getPlans, {})).rejects.toThrow("Unauthenticated request");
    expect((await userClient.query(api.plans.getPlans, {})).map((plan) => plan._id)).toEqual([
      activePlanId,
      inactivePlanId,
      overridePlanId,
    ]);
    expect((await userClient.query(api.plans.getActivePlans, {})).map((plan) => plan._id)).toEqual([
      activePlanId,
      overridePlanId,
    ]);
    expect(await userClient.query(api.plans.getMyCompanyPlanStatus, {})).toEqual({
      planName: "Custom Override Plan",
      messageLimit: 10,
      messagesUsed: 3,
    });
  });

  test("SUPER_ADMIN can page and search plan inventory without loading every plan", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, searchablePlanId } = await t.run(async (ctx) => {
      const searchablePlanId = await ctx.db.insert("plans", {
        name: "Scale Search Plan",
        description: "Searchable",
        messageLimit: 5000,
        priceGBP: 99,
        isActive: true,
        createdAt: Date.now(),
      });
      await ctx.db.insert("plans", {
        name: "Legacy Archive",
        messageLimit: 100,
        priceGBP: 9,
        isActive: false,
        createdAt: Date.now() + 1,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super-plans@example.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });

      return { superAdminId, searchablePlanId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const firstPage = await superAdminClient.query(api.plans.getPaginatedPlans, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    const searchPage = await superAdminClient.query(api.plans.getPaginatedPlans, {
      searchTerm: "Scale",
      paginationOpts: { numItems: 15, cursor: null },
    });

    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);
    expect(searchPage.page).toHaveLength(1);
    expect(searchPage.page[0]).toMatchObject({ _id: searchablePlanId, name: "Scale Search Plan" });
  });

  test("super admins can create, update, delete, and reset billing counters", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      })
    );
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const planId = await superAdminClient.mutation(api.plans.createPlan, {
      name: "Starter",
      description: "Initial",
      messageLimit: 25,
      priceGBP: 9,
      isActive: true,
    });
    await expect(
      superAdminClient.mutation(api.plans.updatePlan, {
        id: planId,
        name: "Starter Updated",
        messageLimit: 30,
        isActive: false,
      })
    ).resolves.toBeNull();

    const { companyId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Assigned Company",
        planId,
        messagesUsedThisPeriod: 44,
        createdAt: Date.now(),
      });
      const userId = await ctx.db.insert("users", {
        email: "override@example.com",
        role: "USER",
        planOverrideId: planId,
        messagesUsedThisPeriod: 9,
        createdAt: Date.now(),
      });

      return { companyId, userId };
    });

    await expect(superAdminClient.mutation(api.plans.deletePlan, { id: planId })).rejects.toThrow(
      "Cannot delete this plan. It is actively assigned to 1 companies."
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(companyId, { planId: undefined });
    });
    await t.mutation(internal.plans.resetBillingCycle, {});

    const { companyAfterReset, userAfterReset } = await t.run(async (ctx) => ({
      companyAfterReset: await ctx.db.get(companyId),
      userAfterReset: await ctx.db.get(userId),
    }));

    expect(companyAfterReset?.messagesUsedThisPeriod).toBe(0);
    expect(userAfterReset?.messagesUsedThisPeriod).toBe(0);

    await expect(superAdminClient.mutation(api.plans.deletePlan, { id: planId })).resolves.toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(planId))).toBeNull();
  });
});
