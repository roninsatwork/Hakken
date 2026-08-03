import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The opportunity report's backend: the button, the fixed order of the three
 * passes, the figures, and the safety catch on the agent's prose.
 *
 * The rules themselves are proven in `salesOpportunityService.test.ts`; what
 * these hold in place is the plumbing around them — that a press opens one
 * report and one run, that the passes cannot run out of order, that a summary
 * cannot claim a number the passes did not compute, and that a dead run
 * cannot leave the button locked behind a frozen bar.
 */

const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ").replace(/&/g, "AND");

async function seed(options: { bindTools?: boolean } = {}) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", {
      name: "Comax",
      enabledModules: ["salesData"],
      createdAt: now,
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
      periodLabels: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
      importedBy: userId,
      startedAt: now,
      completedAt: now,
    });

    // Two sized care homes in one chain: £100/bed and £200/bed, so the chain
    // rate is a median £150/bed — every expected figure below follows.
    const homes = [
      { name: "Fairmile Grange", revenue: 4000, beds: 40 },
      { name: "Belmore Lodge", revenue: 10000, beds: 50 },
    ];
    for (const home of homes) {
      await ctx.db.insert("salesDataAccounts", {
        companyId,
        importId,
        accountNameKey: key(home.name),
        accountName: home.name,
        codeTally: { CODE: 1 },
        groupName: "Colten Care",
        groupNameKey: key("Colten Care"),
        customerType: "Care Homes",
        customerTypeKey: "CARE HOMES",
        totalRevenue: home.revenue,
        productCount: 2,
      });
      await ctx.db.insert("salesDataCustomers", {
        companyId,
        accountNameKey: key(home.name),
        bedrooms: home.beds,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    // Both homes buy toilet rolls; only Fairmile buys gloves. Belmore's
    // missing gloves are the one gap the pass should find.
    const rows = [
      { account: "Fairmile Grange", category: "Toilet Rolls", revenue: 300 },
      { account: "Belmore Lodge", category: "Toilet Rolls", revenue: 500 },
      { account: "Fairmile Grange", category: "Gloves", revenue: 100 },
    ];
    for (const [index, row] of rows.entries()) {
      await ctx.db.insert("salesDataRows", {
        companyId,
        importId,
        sourceRow: index + 2,
        parentAccount: "CODE",
        groupName: "Colten Care",
        accountName: row.account,
        accountNameKey: key(row.account),
        customerType: "Care Homes",
        customerTypeKey: "CARE HOMES",
        productCode: `P${index}`,
        uniqueId: `CODE-P${index}`,
        productDescription: row.category,
        productCategory: row.category,
        productCategoryKey: key(row.category),
        productType: row.category,
        productTypeKey: key(row.category),
        period1: row.revenue,
        totalRevenue: row.revenue,
      });
    }

    // One sized prospect in the chain, and one of a type with no customers at
    // all — the second must end as an exception, never as a guess.
    await ctx.db.insert("salesDataProspects", {
      companyId,
      prospectKey: key("Avon Reach"),
      siteName: "Avon Reach",
      groupName: "Colten Care",
      groupNameKey: key("Colten Care"),
      customerType: "Care Homes",
      customerTypeKey: "CARE HOMES",
      status: "NEW" as const,
      foundAt: now,
    });
    await ctx.db.insert("salesDataCustomers", {
      companyId,
      accountNameKey: key("Avon Reach"),
      bedrooms: 60,
      updatedAt: now,
      updatedBy: userId,
    });
    await ctx.db.insert("salesDataProspects", {
      companyId,
      prospectKey: key("The Crown"),
      siteName: "The Crown",
      groupName: "Pubco",
      groupNameKey: key("Pubco"),
      customerType: "Pubs",
      customerTypeKey: "PUBS",
      status: "NEW" as const,
      foundAt: now,
    });

    const agentId = await ctx.db.insert("agents", {
      name: "Comax - Opportunity Report Agent",
      modelId: "test-model",
      thinkingMode: false,
      isActive: true,
      companyId,
      createdAt: now,
      updatedAt: now,
    });
    if (options.bindTools !== false) {
      // The button resolves its agent by tool binding, not by name.
      for (const handlerMapping of [
        "opportunityReport.matchProspects",
        "opportunityReport.findGroupGaps",
        "opportunityReport.saveSummary",
      ]) {
        const toolId = await ctx.db.insert("aiTools", {
          name: handlerMapping,
          description: "Opportunity report.",
          handlerMapping,
          connectorKey: "sales-opportunity-report",
          requiredRole: "ADMIN" as const,
          createdAt: now,
          createdBy: userId,
        });
        await ctx.db.insert("agentTools", { agentId, toolId, assignedAt: now });
      }
    }

    return { companyId, userId, agentId };
  });

  return { t, ...seeded, client: t.withIdentity({ subject: seeded.userId }) };
}

/** Press the button, and hand back the run it queued. */
async function startReport(seeded: Awaited<ReturnType<typeof seed>>) {
  const result = await seeded.client.mutation(api.salesOpportunityReports.startOpportunityReport, {});
  const run = await seeded.t.run(async (ctx) => await ctx.db.query("agentRuns").first());
  return { result, runId: run?._id as Id<"agentRuns"> };
}

const runAllPasses = async (seeded: Awaited<ReturnType<typeof seed>>, runId: Id<"agentRuns">) => {
  await seeded.t.mutation(internal.salesOpportunityReports.runMatchingPassInternal, {
    companyId: seeded.companyId,
    runId,
  });
  return await seeded.t.mutation(internal.salesOpportunityReports.runGapsPassInternal, {
    companyId: seeded.companyId,
    runId,
  });
};

describe("pressing the button", () => {
  test("one press opens one report and queues one titled run", async () => {
    const seeded = await seed();
    const { result, runId } = await startReport(seeded);

    expect(result.started).toBe(true);
    const { report, run } = await seeded.t.run(async (ctx) => ({
      report: await ctx.db.query("salesOpportunityReports").first(),
      run: await ctx.db.query("agentRuns").first(),
    }));
    expect(report).toMatchObject({ status: "RUNNING", phase: "MATCHING", runId });
    expect(run).toMatchObject({
      status: "QUEUED",
      title: "Opportunity report · sample.xlsx",
    });
  });

  test("a second press joins the running report instead of queueing another", async () => {
    const seeded = await seed();
    await startReport(seeded);

    const second = await seeded.client.mutation(
      api.salesOpportunityReports.startOpportunityReport,
      {}
    );

    expect(second).toMatchObject({ started: false, alreadyRunning: true });
    const reports = await seeded.t.run(
      async (ctx) => await ctx.db.query("salesOpportunityReports").collect()
    );
    expect(reports).toHaveLength(1);
  });

  test("no agent holding the tools refuses in plain words", async () => {
    const seeded = await seed({ bindTools: false });
    await expect(
      seeded.client.mutation(api.salesOpportunityReports.startOpportunityReport, {})
    ).rejects.toThrowError(/no active agent has the opportunity report tools/i);
  });
});

describe("the three passes", () => {
  test("they only run in their fixed order", async () => {
    const seeded = await seed();
    const { runId } = await startReport(seeded);

    await expect(
      seeded.t.mutation(internal.salesOpportunityReports.runGapsPassInternal, {
        companyId: seeded.companyId,
        runId,
      })
    ).rejects.toThrowError(/price the prospects first/i);

    await seeded.t.mutation(internal.salesOpportunityReports.runMatchingPassInternal, {
      companyId: seeded.companyId,
      runId,
    });
    await expect(
      seeded.t.mutation(internal.salesOpportunityReports.runMatchingPassInternal, {
        companyId: seeded.companyId,
        runId,
      })
    ).rejects.toThrowError(/already priced/i);
  });

  test("the matching pass prices the chain prospect and refuses to guess the pub", async () => {
    const seeded = await seed();
    const { runId } = await startReport(seeded);

    const result = await seeded.t.mutation(
      internal.salesOpportunityReports.runMatchingPassInternal,
      { companyId: seeded.companyId, runId }
    );

    // £100/bed and £200/bed → median £150 × 60 beds.
    expect(result.prospects[0]).toMatchObject({
      siteName: "Avon Reach",
      estimateGBP: 9000,
      ratePerUnitGBP: 150,
      confidence: "GROUP_SIZED",
    });
    expect(result.prospects[1]).toMatchObject({
      siteName: "The Crown",
      estimateGBP: null,
      confidence: "NONE",
    });
  });

  test("the gaps pass finds what Belmore is not buying, scaled to its beds", async () => {
    const seeded = await seed();
    const { runId } = await startReport(seeded);
    const result = await runAllPasses(seeded, runId);

    // Fairmile's gloves: £100 over 40 beds is £2.50/bed × Belmore's 50.
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      accountName: "Belmore Lodge",
      category: "Gloves",
      estimateGBP: 125,
      scaledBySize: true,
    });
    expect(result.headline).toMatchObject({
      prospectOpportunityGBP: 9000,
      gapOpportunityGBP: 125,
      totalOpportunityGBP: 9125,
      prospectsUnpriced: 1,
      groupsExamined: 1,
    });
  });
});

describe("the summary safety catch", () => {
  test("a summary naming an invented figure is refused with the figure listed", async () => {
    const seeded = await seed();
    const { runId } = await startReport(seeded);
    await runAllPasses(seeded, runId);

    await expect(
      seeded.t.mutation(internal.salesOpportunityReports.saveSummaryInternal, {
        companyId: seeded.companyId,
        runId,
        summary: "Converting Avon Reach is worth £25,000.",
      })
    ).rejects.toThrowError(/£25,000/);

    const report = await seeded.t.run(
      async (ctx) => await ctx.db.query("salesOpportunityReports").first()
    );
    expect(report).toMatchObject({ status: "RUNNING", phase: "SUMMARY" });
  });

  test("an honest summary completes the report, with the unpriced pub as an exception", async () => {
    const seeded = await seed();
    const { runId } = await startReport(seeded);
    await runAllPasses(seeded, runId);

    const saved = await seeded.t.mutation(internal.salesOpportunityReports.saveSummaryInternal, {
      companyId: seeded.companyId,
      runId,
      summary: "Avon Reach is the one to chase: £9,000 over six months at £150 per bedroom.",
    });

    expect(saved.status).toBe("COMPLETE_WITH_EXCEPTIONS");
    const report = await seeded.t.run(
      async (ctx) => await ctx.db.query("salesOpportunityReports").first()
    );
    expect(report).toMatchObject({ status: "COMPLETE_WITH_EXCEPTIONS", phase: "DONE" });
    expect(report?.exceptions?.[0]).toContain("The Crown");
  });
});

describe("a report cannot be left running for ever", () => {
  test("the watchdog fails a report whose run died mid-computation", async () => {
    const seeded = await seed();
    const { runId } = await startReport(seeded);
    await seeded.t.run(async (ctx) => {
      await ctx.db.patch(runId, { status: "FAILED" });
    });

    const report = await seeded.t.run(
      async (ctx) => await ctx.db.query("salesOpportunityReports").first()
    );
    await seeded.t.mutation(internal.salesOpportunityReports.watchReportInternal, {
      reportId: report!._id,
    });

    const settled = await seeded.t.run(
      async (ctx) => await ctx.db.query("salesOpportunityReports").first()
    );
    expect(settled).toMatchObject({
      status: "FAILED",
      failureReason: "The run ended without finishing the report.",
    });
  });

  test("a run that dies after both passes still delivers the numbers", async () => {
    // The first live run's exact failure: parked for approval, resumed,
    // priced the prospects, declared victory. The figures were all real; only
    // the prose was missing. That is an exception line, not a failed report.
    const seeded = await seed();
    const { runId } = await startReport(seeded);
    await runAllPasses(seeded, runId);
    await seeded.t.run(async (ctx) => {
      await ctx.db.patch(runId, { status: "SUCCESS" });
    });

    const report = await seeded.t.run(
      async (ctx) => await ctx.db.query("salesOpportunityReports").first()
    );
    await seeded.t.mutation(internal.salesOpportunityReports.watchReportInternal, {
      reportId: report!._id,
    });

    const settled = await seeded.t.run(
      async (ctx) => await ctx.db.query("salesOpportunityReports").first()
    );
    expect(settled).toMatchObject({ status: "COMPLETE_WITH_EXCEPTIONS", phase: "DONE" });
    expect(settled?.headline?.totalOpportunityGBP).toBe(9125);
    expect(settled?.summary).toBeUndefined();
    expect(settled?.exceptions?.some((line) => line.includes("never wrote its summary"))).toBe(
      true
    );
  });
});

describe("tenancy", () => {
  test("another workspace sees no report and cannot build on this one", async () => {
    const seeded = await seed();
    await startReport(seeded);

    const other = await seeded.t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Somebody Else",
        enabledModules: ["salesData"],
        createdAt: Date.now(),
      });
      const userId = await ctx.db.insert("users", {
        email: "other@test.com",
        role: "ADMIN",
        companyId,
      });
      return { companyId, userId };
    });

    const report = await seeded.t
      .withIdentity({ subject: other.userId })
      .query(api.salesOpportunityReports.getLatestOpportunityReport, {});
    expect(report).toBeNull();
  });

  test("a manual agent run opens its own report rather than erroring", async () => {
    const seeded = await seed();
    const runId = await seeded.t.run(
      async (ctx) =>
        await ctx.db.insert("agentRuns", {
          agentId: seeded.agentId,
          triggerType: "MANUAL" as const,
          objective: "Build the opportunity report for this workspace.",
          title: "Opportunity report · manual",
          status: "RUNNING" as const,
          companyId: seeded.companyId,
          userId: seeded.userId,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        })
    );

    const result = await seeded.t.mutation(
      internal.salesOpportunityReports.runMatchingPassInternal,
      { companyId: seeded.companyId, runId, userId: seeded.userId }
    );

    expect(result.prospectCount).toBe(2);
    const report = await seeded.t.run(
      async (ctx) => await ctx.db.query("salesOpportunityReports").first()
    );
    expect(report).toMatchObject({ status: "RUNNING", phase: "GAPS", runId });
  });
});
