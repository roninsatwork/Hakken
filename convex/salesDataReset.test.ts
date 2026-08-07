import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Emptying the workspace.
 *
 * The part worth proving is that it reaches the tables a re-import deliberately
 * leaves alone. Everything the workbook produced is replaced on the next upload
 * anyway, so a clear that only dropped those rows would look like it worked and
 * leave the demo exactly as unwatchable as before: every detail filled in, every
 * group already looked through.
 */

async function seed() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const { userId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Comax",
      enabledModules: ["salesData"],
      createdAt: Date.now(),
    });
    const userId = await ctx.db.insert("users", {
      email: "buyer@test.com",
      role: "ADMIN",
      companyId,
    });
    const importId = await ctx.db.insert("salesDataImports", {
      companyId,
      fileName: "sample.xlsx",
      status: "COMPLETED" as const,
      sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
      periodLabels: ["2026-01"],
      salesRowCount: 1,
      importedBy: userId,
      startedAt: Date.now(),
      completedAt: Date.now(),
    });

    await ctx.db.insert("salesDataAccounts", {
      companyId,
      importId,
      accountNameKey: "COLTEN CARE",
      accountName: "Colten Care",
      codeTally: { COLTEN: 4 },
      groupName: "Colten Care",
      groupNameKey: "COLTEN CARE",
      customerType: "CARE HOMES",
      customerTypeKey: "CARE HOMES",
      totalRevenue: 1200,
      productCount: 3,
    });

    // One row in each table the workbook fills, so the test that they survive
    // is testing something.
    await ctx.db.insert("salesDataRows", {
      companyId,
      importId,
      sourceRow: 2,
      parentAccount: "Colten Care",
      groupName: "Colten Care",
      accountName: "Colten Care",
      accountNameKey: "COLTEN CARE",
      customerType: "CARE HOMES",
      customerTypeKey: "CARE HOMES",
      productCode: "SOAP1",
      uniqueId: "COLTEN-SOAP1",
      productDescription: "Hand soap",
      productCategory: "WASHROOM",
      productCategoryKey: "WASHROOM",
      productType: "SOAP",
      productTypeKey: "SOAP",
      totalRevenue: 1200,
    });
    await ctx.db.insert("salesDataCategoryLinks", {
      companyId,
      importId,
      customerType: "CARE HOMES",
      customerTypeKey: "CARE HOMES",
      category: "WASHROOM",
      categoryKey: "WASHROOM",
    });
    await ctx.db.insert("salesDataAreasOfInterest", {
      companyId,
      importId,
      customerType: "CARE HOMES",
      customerTypeKey: "CARE HOMES",
      productType: "SOAP",
      productTypeKey: "SOAP",
    });
    await ctx.db.insert("salesDataFrequencies", {
      companyId,
      importId,
      productCategory: "WASHROOM",
      productCategoryKey: "WASHROOM",
      productType: "SOAP",
      productTypeKey: "SOAP",
      frequency: "WEEKLY",
    });

    // The three that survive a re-import, and so are the reason this exists.
    await ctx.db.insert("salesDataCustomers", {
      companyId,
      accountNameKey: "COLTEN CARE",
      phone: "01202 000000",
      updatedAt: Date.now(),
      updatedBy: userId,
    });
    await ctx.db.insert("salesDataCustomerResearch", {
      companyId,
      subjectKey: "COLTEN CARE",
      subjectType: "CUSTOMER" as const,
      field: "phone",
      value: "01202 000000",
      confidence: "HIGH" as const,
      status: "APPLIED" as const,
      foundAt: Date.now(),
    });
    await ctx.db.insert("salesDataProspects", {
      companyId,
      prospectKey: "AMBERWOOD HOUSE",
      siteName: "Amberwood House",
      groupName: "Colten Care",
      groupNameKey: "COLTEN CARE",
      customerTypeKey: "CARE HOMES",
      customerType: "CARE HOMES",
      status: "NEW" as const,
      foundAt: Date.now(),
    });

    return { userId };
  });

  return { t, client: t.withIdentity({ subject: userId }) };
}

describe("clearing the workspace", () => {
  test("takes the researched details and prospects a re-import would have kept", async () => {
    const { t, client } = await seed();

    await client.action(api.salesDataReset.resetSalesData, {});

    const left = await t.run(async (ctx) => ({
      customers: (await ctx.db.query("salesDataCustomers").collect()).length,
      research: (await ctx.db.query("salesDataCustomerResearch").collect()).length,
      prospects: (await ctx.db.query("salesDataProspects").collect()).length,
    }));

    expect(left).toEqual({ customers: 0, research: 0, prospects: 0 });
  });

  /**
   * The spreadsheet is the expensive half — somebody has to find the file and
   * map its worksheets — and this once deleted it along with the CRM. Anthony,
   * 2026-08-03: *"I never want this new process to delete the spreadsheet
   * imports tab."* Every workbook table is named here rather than a sample of
   * them, so adding one to the delete list fails this.
   */
  test("never touches the imported spreadsheet", async () => {
    const { t, client } = await seed();

    await client.action(api.salesDataReset.resetSalesData, {});

    const kept = await t.run(async (ctx) => ({
      imports: (await ctx.db.query("salesDataImports").collect()).length,
      accounts: (await ctx.db.query("salesDataAccounts").collect()).length,
      rows: (await ctx.db.query("salesDataRows").collect()).length,
      categories: (await ctx.db.query("salesDataCategoryLinks").collect()).length,
      interest: (await ctx.db.query("salesDataAreasOfInterest").collect()).length,
      frequencies: (await ctx.db.query("salesDataFrequencies").collect()).length,
    }));

    expect(kept).toEqual({
      imports: 1,
      accounts: 1,
      rows: 1,
      categories: 1,
      interest: 1,
      frequencies: 1,
    });
  });

  /**
   * One workspace's reset must not reach into another's. The action takes its
   * company from the signed-in person rather than from an argument, so there is
   * nothing a caller could pass to widen it — this holds that in place.
   */
  test("leaves another workspace's data where it is", async () => {
    const { t, client } = await seed();

    await t.run(async (ctx) => {
      const other = await ctx.db.insert("companies", {
        name: "Someone Else",
        enabledModules: ["salesData"],
        createdAt: Date.now(),
      });
      await ctx.db.insert("salesDataProspects", {
        companyId: other,
        prospectKey: "THEIR SITE",
        siteName: "Their Site",
        groupName: "Their Group",
        groupNameKey: "THEIR GROUP",
        customerTypeKey: "HOTELS",
        customerType: "HOTELS",
        status: "NEW" as const,
        foundAt: Date.now(),
      });
    });

    await client.action(api.salesDataReset.resetSalesData, {});

    const survivors = await t.run(async (ctx) =>
      (await ctx.db.query("salesDataProspects").collect()).map((row) => row.siteName)
    );
    expect(survivors).toEqual(["Their Site"]);
  });

  test("refuses when the workspace does not have the section", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "No Sales Data",
        createdAt: Date.now(),
      });
      return await ctx.db.insert("users", {
        email: "nobody@test.com",
        role: "ADMIN",
        companyId,
      });
    });

    await expect(
      t.withIdentity({ subject: userId }).action(api.salesDataReset.resetSalesData, {})
    ).rejects.toThrow(/not enabled/i);
  });
});

/**
 * The other clear — everything, workbook included.
 *
 * Its reason to exist is a client uploading different workbooks of the same
 * shape to play with: findings and reports derived from the last file poison
 * the next run, so each upload has to start from a workspace that remembers
 * nothing. The part worth proving is total coverage — a table missed here is
 * exactly the stale memory the button promises is gone.
 */
async function seedEverything() {
  const { t, client } = await seed();

  await t.run(async (ctx) => {
    const company = (await ctx.db.query("companies").first())!;
    const companyId = company._id;
    const importRecord = (await ctx.db.query("salesDataImports").first())!;
    const importId = importRecord._id;

    const agentId = await ctx.db.insert("agents", {
      name: "Researcher",
      modelId: "model-test",
      thinkingMode: false,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const jobId = await ctx.db.insert("salesDataResearchJobs", {
      companyId,
      importId,
      status: "COMPLETE" as const,
      phase: "DONE" as const,
      agentId,
      runsStarted: 2,
      maxCostGBP: 5,
      spentGBP: 1,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("salesDataResearchJobItems", {
      jobId,
      companyId,
      kind: "CUSTOMER" as const,
      key: "COLTEN CARE",
      label: "Colten Care",
      status: "DONE" as const,
      attempts: 1,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("salesDataResearchJobItems", {
      jobId,
      companyId,
      kind: "CHAIN" as const,
      key: "COLTEN GROUP",
      label: "Colten Group",
      status: "DONE" as const,
      attempts: 1,
      updatedAt: Date.now(),
    });

    const discoveryJobId = await ctx.db.insert("salesDataMarketDiscoveryJobs", {
      companyId,
      customerTypeKey: "CARE HOMES",
      customerType: "CARE HOMES",
      targetGroupCount: 5,
      status: "COMPLETE" as const,
      phase: "SETUP" as const,
      agentId,
      groupsAccepted: 1,
      groupsRejected: 0,
      groupsDuplicate: 0,
      groupsNeedsCheck: 0,
      locationsFiled: 1,
      locationsDuplicate: 0,
      locationsNeedsCheck: 0,
      maxCostGBP: 5,
      spentGBP: 1,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("salesDataMarketDiscoveryGroups", {
      companyId,
      jobId: discoveryJobId,
      groupName: "Amberwood Group",
      groupNameKey: "AMBERWOOD GROUP",
      customerType: "CARE HOMES",
      customerTypeKey: "CARE HOMES",
      sourceUrl: "https://example.com",
      reasoning: "Looks like a chain of care homes.",
      status: "ACCEPTED" as const,
      locationsStatus: "PENDING" as const,
      foundAt: Date.now(),
    });

    const reportId = await ctx.db.insert("salesOpportunityReports", {
      companyId,
      importId,
      status: "COMPLETE" as const,
      phase: "MATCHING" as const,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("salesOpportunityReportGapProducts", {
      companyId,
      reportId,
      accountNameKey: "COLTEN CARE",
      categoryKey: "WASHROOM",
      products: [],
    });
    await ctx.db.insert("salesOpportunityReportTypeBaskets", {
      companyId,
      reportId,
      customerTypeKey: "CARE HOMES",
      customerType: "CARE HOMES",
      totalSpendGBP: 1200,
      customerCount: 1,
      categories: [],
    });
  });

  return { t, client };
}

describe("clearing everything, workbook included", () => {
  test("leaves no sales-data table with a row in it", async () => {
    const { t, client } = await seedEverything();

    await client.action(api.salesDataReset.clearAllSalesData, {});

    const left = await t.run(async (ctx) => ({
      imports: (await ctx.db.query("salesDataImports").collect()).length,
      rows: (await ctx.db.query("salesDataRows").collect()).length,
      accounts: (await ctx.db.query("salesDataAccounts").collect()).length,
      categories: (await ctx.db.query("salesDataCategoryLinks").collect()).length,
      interest: (await ctx.db.query("salesDataAreasOfInterest").collect()).length,
      frequencies: (await ctx.db.query("salesDataFrequencies").collect()).length,
      customers: (await ctx.db.query("salesDataCustomers").collect()).length,
      research: (await ctx.db.query("salesDataCustomerResearch").collect()).length,
      prospects: (await ctx.db.query("salesDataProspects").collect()).length,
      researchJobs: (await ctx.db.query("salesDataResearchJobs").collect()).length,
      researchItems: (await ctx.db.query("salesDataResearchJobItems").collect()).length,
      discoveryJobs: (await ctx.db.query("salesDataMarketDiscoveryJobs").collect()).length,
      discoveryGroups: (await ctx.db.query("salesDataMarketDiscoveryGroups").collect()).length,
      reports: (await ctx.db.query("salesOpportunityReports").collect()).length,
      gapProducts: (await ctx.db.query("salesOpportunityReportGapProducts").collect()).length,
      baskets: (await ctx.db.query("salesOpportunityReportTypeBaskets").collect()).length,
    }));

    expect(left).toEqual({
      imports: 0,
      rows: 0,
      accounts: 0,
      categories: 0,
      interest: 0,
      frequencies: 0,
      customers: 0,
      research: 0,
      prospects: 0,
      researchJobs: 0,
      researchItems: 0,
      discoveryJobs: 0,
      discoveryGroups: 0,
      reports: 0,
      gapProducts: 0,
      baskets: 0,
    });
  });

  /**
   * Clearing under a running agent would have its next write land on rows
   * that no longer exist. The jobs carry their own stop buttons; the clear
   * refuses rather than reaching for them.
   */
  test("refuses while an agent is still working", async () => {
    const { t, client } = await seedEverything();

    await t.run(async (ctx) => {
      const company = (await ctx.db.query("companies").first())!;
      const importRecord = (await ctx.db.query("salesDataImports").first())!;
      const agent = (await ctx.db.query("agents").first())!;
      await ctx.db.insert("salesDataResearchJobs", {
        companyId: company._id,
        importId: importRecord._id,
        status: "RUNNING" as const,
        phase: "CUSTOMERS" as const,
        agentId: agent._id,
        runsStarted: 1,
        maxCostGBP: 5,
        spentGBP: 0,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(client.action(api.salesDataReset.clearAllSalesData, {})).rejects.toThrow(
      /still working/i
    );

    const kept = await t.run(async (ctx) => ({
      imports: (await ctx.db.query("salesDataImports").collect()).length,
      rows: (await ctx.db.query("salesDataRows").collect()).length,
    }));
    expect(kept).toEqual({ imports: 1, rows: 1 });
  });

  test("leaves another workspace's workbook where it is", async () => {
    const { t, client } = await seedEverything();

    await t.run(async (ctx) => {
      const other = await ctx.db.insert("companies", {
        name: "Someone Else",
        enabledModules: ["salesData"],
        createdAt: Date.now(),
      });
      await ctx.db.insert("salesDataImports", {
        companyId: other,
        fileName: "theirs.xlsx",
        status: "COMPLETED" as const,
        sheetMapping: { sales: 0, categories: 1, areasOfInterest: 2, frequency: 3 },
        periodLabels: ["2026-01"],
        salesRowCount: 0,
        startedAt: Date.now(),
        completedAt: Date.now(),
      });
    });

    await client.action(api.salesDataReset.clearAllSalesData, {});

    const survivors = await t.run(async (ctx) =>
      (await ctx.db.query("salesDataImports").collect()).map((row) => row.fileName)
    );
    expect(survivors).toEqual(["theirs.xlsx"]);
  });
});
