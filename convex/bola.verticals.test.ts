import { convexTest } from "convex-test";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
// template:remove:start salesData
import { internal } from "./_generated/api";
// template:remove:end
import schema from "./schema";

/**
 * Product-specific tenant-isolation proofs. Optional boundaries retain each
 * proof with its application; generic Apify isolation remains in apify.test.ts.
 */
describe("OWASP: BOLA / Data Isolation Shield — product verticals", () => {

  // template:remove:start properties
  test("Properties are strictly isolated to the tenant (BOLA)", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
    });
    
    const companyBId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
    });

    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    const propAId = await t.run(async (ctx) => {
      return await ctx.db.insert("properties", {
        rightmoveId: "111",
        address: "123 safe street",
        price: 300000,
        url: "https://rightmove.co.uk/propA",
        companyId: companyAId,
        scrapedAt: Date.now()
      });
    });

    const propBId = await t.run(async (ctx) => {
      return await ctx.db.insert("properties", {
        rightmoveId: "222",
        address: "456 cross tenant road",
        price: 450000,
        url: "https://rightmove.co.uk/propB",
        companyId: companyBId,
        scrapedAt: Date.now()
      });
    });

    const client = t.withIdentity({ subject: adminAId });

    // Admin A lists properties
    const res = await client.query(api.properties.listProperties, {
      paginationOpts: { numItems: 10, cursor: null }
    });

    // Should only see Company A's property
    expect(res.page.length).toBe(1);
    expect(res.page[0]._id).toBe(propAId);
    expect(res.page[0].address).toBe("123 safe street");

    // Admin A tries to get Company B's property directly (BOLA)
    await expect(
      client.query(api.properties.getProperty, { id: propBId })
    ).rejects.toThrowError(/Unauthorized/);

    // Admin A tries to delete Company B's property directly (BOLA)
    await expect(
      client.mutation(api.properties.deleteProperty, { id: propBId })
    ).rejects.toThrowError(/Unauthorized/);
  });
// template:remove:end


  // template:remove:start properties
  test("Apify runs are tenant-isolated and admin list is protected", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
    });
    
    const companyBId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
    });

    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "superadmin@test.com",
        role: "SUPER_ADMIN",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("apifyRuns", {
        runId: "run-A",
        actorId: "actor-1",
        startedBy: adminAId,
        companyId: companyAId,
        status: "PENDING",
        startedAt: Date.now()
      });

      await ctx.db.insert("apifyRuns", {
        runId: "run-B",
        actorId: "actor-1",
        startedBy: superAdminId,
        companyId: companyBId,
        status: "PENDING",
        startedAt: Date.now()
      });
    });

    const clientA = t.withIdentity({ subject: adminAId });
    const clientSuper = t.withIdentity({ subject: superAdminId });

    // Admin A gets their latest runs
    const runsA = await clientA.query(api.properties.getLatestRuns);
    expect(runsA.length).toBe(1);
    expect(runsA[0].runId).toBe("run-A");

    // Admin A tries to access getAllRunsAdmin (unauthorized)
    await expect(
      clientA.query(api.properties.getAllRunsAdmin)
    ).rejects.toThrowError(/Unauthorized/);

    // Super Admin gets all runs admin
    const allRuns = await clientSuper.query(api.properties.getAllRunsAdmin);
    expect(allRuns.length).toBe(2);
  });
// template:remove:end


  // template:remove:start properties
  test("startRightmoveScrape rejects unsafe SSRF loopback URLs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
    });

    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    const client = t.withIdentity({ subject: adminAId });

    await expect(
      client.action(api.apify.startRightmoveScrape, {
        listUrls: ["http://localhost:3000/malicious"],
        maxProperties: 5
      })
    ).rejects.toThrowError(/SSRF Prevention/);
  });
// template:remove:end


  /**
   * Sales Data is the first surface gated by a company module, so there are two
   * separate things to prove: that one workspace cannot read another's rows,
   * and that a workspace without the module cannot reach the data at all. The
   * second matters because hiding the navigation is not a control — someone who
   * types the URL, or calls the query directly, must still be refused.
   */
  // template:remove:start salesData
  async function seedSalesData(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const withModule = await ctx.db.insert("companies", {
        name: "With Module",
        enabledModules: ["salesData"],
        createdAt: Date.now(),
      });
      const withoutModule = await ctx.db.insert("companies", {
        name: "Without Module",
        createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });

      const userWith = await ctx.db.insert("users", {
        email: "with@test.com",
        role: "ADMIN",
        companyId: withModule,
      });
      const userWithout = await ctx.db.insert("users", {
        email: "without@test.com",
        role: "ADMIN",
        companyId: withoutModule,
      });

      const makeImport = async (companyId: typeof withModule, userId: typeof userWith) =>
        await ctx.db.insert("salesDataImports", {
          companyId,
          fileName: "sample.xlsx",
          status: "COMPLETED" as const,
          sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
          periodLabels: ["2026-01"],
          salesRowCount: 1,
          categoryRowCount: 0,
          areasOfInterestRowCount: 0,
          frequencyRowCount: 0,
          importedBy: userId,
          startedAt: Date.now(),
          completedAt: Date.now(),
        });

      const importWith = await makeImport(withModule, userWith);
      const importWithout = await makeImport(withoutModule, userWithout);

      const makeRow = async (
        companyId: typeof withModule,
        importId: typeof importWith,
        accountName: string
      ) =>
        await ctx.db.insert("salesDataRows", {
          companyId,
          importId,
          parentAccount: "ACC",
          groupName: "GROUP",
          accountName,
          customerType: "CARE HOMES",
          productCode: "P1",
          uniqueId: "ACCP1",
          productDescription: "A PRODUCT",
          productCategory: "CHEMICALS",
          productType: "CLEANER",
          customerTypeKey: "CARE HOMES",
          productCategoryKey: "CHEMICALS",
          productTypeKey: "CLEANER",
          period1: 10,
          totalRevenue: 10,
        });

      await makeRow(withModule, importWith, "mine");
      await makeRow(withoutModule, importWithout, "not mine");

      return { withModule, withoutModule, userWith, userWithout };
    });
  }
// template:remove:end


  // template:remove:start salesData
  test("Sales data rows are strictly isolated to the tenant (BOLA)", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { userWith } = await seedSalesData(t);

    const client = t.withIdentity({ subject: userWith });
    const result = await client.query(api.salesData.listSalesRows, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    // The other company's row exists and carries the same shape; only the
    // tenant scope keeps it out.
    expect(result.page.length).toBe(1);
    expect(result.page[0].accountName).toBe("mine");
  });
// template:remove:end


  // template:remove:start salesData
  test("A workspace without the module cannot reach the data", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { userWithout } = await seedSalesData(t);

    const client = t.withIdentity({ subject: userWithout });

    // Its own rows exist — the refusal is the module flag, not an empty table.
    await expect(
      client.query(api.salesData.listSalesRows, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrowError(/not enabled/i);

    await expect(
      client.query(api.salesData.listCategoryLinks, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrowError(/not enabled/i);

    await expect(
      client.query(api.salesData.listAreasOfInterest, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrowError(/not enabled/i);

    await expect(
      client.query(api.salesData.listFrequencies, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrowError(/not enabled/i);

    await expect(client.query(api.salesData.listImports, {})).rejects.toThrowError(
      /not enabled/i
    );

    // The upload URL is the way in, so it is gated too.
    await expect(
      client.mutation(api.salesData.generateUploadUrl, {})
    ).rejects.toThrowError(/not enabled/i);
  });
// template:remove:end


  // template:remove:start salesData
  test("The section overview reports the module as off rather than throwing", async () => {
    // The navigation asks this on every render, including for the workspaces
    // that do not have it. That is a normal answer, not an error.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { userWith, userWithout } = await seedSalesData(t);

    const off = await t
      .withIdentity({ subject: userWithout })
      .query(api.salesData.getSectionOverview, {});
    expect(off.enabled).toBe(false);
    expect(off.currentImport).toBeNull();

    const on = await t
      .withIdentity({ subject: userWith })
      .query(api.salesData.getSectionOverview, {});
    expect(on.enabled).toBe(true);
    expect(on.companyName).toBe("With Module");
    expect(on.currentImport?.salesRowCount).toBe(1);
  });
// template:remove:end


  // template:remove:start salesData
  test("An import cannot be started against another workspace", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { withModule, userWithout } = await seedSalesData(t);

    // The action passes the caller and their company to this mutation. A caller
    // who names a company that is not theirs is refused here, not upstream.
    await expect(
      t.mutation(internal.salesData.startImportInternal, {
        userId: userWithout,
        companyId: withModule,
        fileName: "stolen.xlsx",
        sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
      })
    ).rejects.toThrowError(/Unauthorized/);
  });
// template:remove:end

});
