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
        instruction: "Do it",
        isActive: true,
        isGlobal: false,
        companyId: companyId
      });
      await ctx.db.insert("aiRules", {
        name: "Foreign Rule",
        instruction: "Do it too",
        isActive: true,
        isGlobal: false,
        companyId: foreignCompanyId
      });
    });

    const client = t.withIdentity({ subject: userId });

    // Should work for own company
    const page = await client.query(api.aiRules.getOffsetPaginatedRules, {
      companyId: companyId,
      searchTerm: "",
      page: 1
    });
    expect(page.data.length).toBe(1);
    expect(page.data[0].name).toBe("Legit Rule");

    // Should FAIL for foreign company
    await expect(
      client.query(api.aiRules.getOffsetPaginatedRules, {
        companyId: foreignCompanyId,
        searchTerm: "",
        page: 1
      })
    ).rejects.toThrow("Unauthorized");
  });
});
