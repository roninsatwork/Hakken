import { convexTest } from "convex-test";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Properties", () => {
  test("property listing, counts, detail reads, runs, and deletes respect company scope", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, superAdminId, propertyAId, propertyBId, runAId, runBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
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
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const propertyAId = await ctx.db.insert("properties", {
        rightmoveId: "rm-a",
        address: "10 Orchard Street",
        price: 250000,
        url: "https://example.com/a",
        companyId: companyAId,
        scrapedAt: 100,
      });
      const propertyBId = await ctx.db.insert("properties", {
        rightmoveId: "rm-b",
        address: "20 Harbour Road",
        price: 450000,
        url: "https://example.com/b",
        companyId: companyBId,
        scrapedAt: 200,
      });
      const runAId = await ctx.db.insert("apifyRuns", {
        runId: "run-a",
        actorId: "actor",
        status: "COMPLETED",
        startedBy: adminAId,
        companyId: companyAId,
        startedAt: 100,
        propertiesScraped: 1,
      });
      const runBId = await ctx.db.insert("apifyRuns", {
        runId: "run-b",
        actorId: "actor",
        status: "FAILED",
        startedBy: adminBId,
        companyId: companyBId,
        startedAt: 200,
        completedAt: 300,
      });

      return { adminAId, adminBId, superAdminId, propertyAId, propertyBId, runAId, runBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminPage = await adminAClient.query(api.properties.listProperties, { paginationOpts });
    expect(adminPage.page.map((property) => property._id)).toEqual([propertyAId]);
    expect(await adminAClient.query(api.properties.getPropertiesCount, {})).toBe(1);
    expect(await adminAClient.query(api.properties.getProperty, { id: propertyAId })).toMatchObject({
      address: "10 Orchard Street",
    });
    await expect(adminAClient.query(api.properties.getProperty, { id: propertyBId })).rejects.toThrow("Unauthorized");
    await expect(adminAClient.mutation(api.properties.deleteProperty, { id: propertyBId })).rejects.toThrow(
      "Unauthorized"
    );

    expect((await adminAClient.query(api.properties.getLatestRuns, {})).map((run) => run._id)).toEqual([runAId]);
    expect((await superAdminClient.query(api.properties.getLatestRuns, {})).map((run) => run._id)).toEqual([
      runBId,
      runAId,
    ]);
    expect((await superAdminClient.query(api.properties.getAllRunsAdmin, {})).map((run) => run._id)).toEqual([
      runBId,
      runAId,
    ]);

    const superAdminPage = await superAdminClient.query(api.properties.listProperties, { paginationOpts });
    expect(superAdminPage.page.map((property) => property._id)).toEqual([propertyBId, propertyAId]);

    await expect(adminBClient.mutation(api.properties.deleteProperty, { id: propertyBId })).resolves.toBeNull();
    expect(await superAdminClient.query(api.properties.getProperty, { id: propertyBId })).toBeNull();
    expect(await t.query(api.properties.getLatestRuns, {})).toEqual([]);
    await expect(adminAClient.query(api.properties.getAllRunsAdmin, {})).rejects.toThrow("Unauthorized");
  });

  test("search returns tenant-filtered counts and empty access for users without a company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, orphanUserId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const orphanUserId = await ctx.db.insert("users", {
        email: "orphan@example.com",
        role: "USER",
      });
      await ctx.db.insert("properties", {
        rightmoveId: "rm-search-a",
        address: "42 Search Lane",
        price: 375000,
        url: "https://example.com/search-a",
        companyId,
        scrapedAt: 100,
      });

      return { adminId, orphanUserId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const orphanClient = t.withIdentity({ subject: orphanUserId });

    const searchPage = await adminClient.query(api.properties.listProperties, {
      paginationOpts,
      searchTerm: "Search",
    });
    expect(searchPage.page).toHaveLength(1);
    expect(await adminClient.query(api.properties.getPropertiesCount, { searchTerm: "Search" })).toBe(1);
    expect(await orphanClient.query(api.properties.getPropertiesCount, { searchTerm: "Search" })).toBe(0);
    await expect(orphanClient.query(api.properties.listProperties, { paginationOpts })).rejects.toThrow(
      "Unauthorized"
    );
  });
});
