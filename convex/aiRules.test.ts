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
});
