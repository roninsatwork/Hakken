import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("AI Rules Validation", () => {
  test("getOffsetPaginatedRules isolates by companyId", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Set up standard user + company
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });
    const foreignCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() });
    });

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        companyId: companyId
      });
    });

    // Create rules
    await t.run(async (ctx) => {
      await ctx.db.insert("aiRules", {
        name: "Legit Rule",
        trigger: "test",
        instruction: "Do it",
        priority: "NORMAL",
        isActive: true,
        companyId: companyId,
        createdBy: userId,
        createdAt: Date.now()
      });
      await ctx.db.insert("aiRules", {
        name: "Foreign Rule",
        trigger: "test",
        instruction: "Do it too",
        priority: "NORMAL",
        isActive: true,
        companyId: foreignCompanyId,
        createdBy: userId,
        createdAt: Date.now()
      });
    });

    const client = t.withIdentity({ subject: userId });

    const page = await client.query(api.aiRules.getOffsetPaginatedRules, {
      companyId: companyId,
      searchTerm: "",
      page: 1,
      pageSize: 15
    });
    expect(page.data.length).toBe(1);
    expect(page.data[0].name).toBe("Legit Rule");

    // Should FAIL for foreign company
    // Should FAIL for foreign company (returns empty array)
    const foreignPage = await client.query(api.aiRules.getOffsetPaginatedRules, {
      companyId: foreignCompanyId,
      searchTerm: "",
      page: 1,
      pageSize: 15
    });
    expect(foreignPage.data.length).toBe(0);
  });

  test("ADMIN can create own-company rules but not foreign or global rules", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });
    const foreignCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() });
    });
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
      });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    const ruleId = await adminClient.mutation(api.aiRules.createRule, {
      companyId,
      name: "Own Rule",
      trigger: "own",
      instruction: "Allowed",
      priority: "NORMAL",
      isActive: true,
    });

    const ownRule = await t.run(async (ctx) => await ctx.db.get(ruleId));
    expect(ownRule?.companyId).toBe(companyId);

    await expect(
      adminClient.mutation(api.aiRules.createRule, {
        companyId: foreignCompanyId,
        name: "Foreign Rule",
        trigger: "foreign",
        instruction: "Denied",
        priority: "NORMAL",
        isActive: true,
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      adminClient.mutation(api.aiRules.createRule, {
        name: "Global Rule",
        trigger: "global",
        instruction: "Denied",
        priority: "NORMAL",
        isActive: true,
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("ADMIN cannot mutate global or foreign-company rules", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });
    const foreignCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() });
    });
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
      });
    });

    const [globalRuleId, foreignRuleId] = await t.run(async (ctx) => {
      const globalRule = await ctx.db.insert("aiRules", {
        name: "Global Rule",
        trigger: "global",
        instruction: "Denied",
        priority: "NORMAL",
        isActive: true,
        createdBy: adminId,
        createdAt: Date.now(),
      });
      const foreignRule = await ctx.db.insert("aiRules", {
        name: "Foreign Rule",
        trigger: "foreign",
        instruction: "Denied",
        priority: "NORMAL",
        isActive: true,
        companyId: foreignCompanyId,
        createdBy: adminId,
        createdAt: Date.now(),
      });

      return [globalRule, foreignRule];
    });

    const adminClient = t.withIdentity({ subject: adminId });

    await expect(
      adminClient.mutation(api.aiRules.toggleRuleActive, {
        id: globalRuleId,
        isActive: false,
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      adminClient.mutation(api.aiRules.deleteRule, {
        id: foreignRuleId,
      })
    ).rejects.toThrow("Unauthorized");
  });
});
