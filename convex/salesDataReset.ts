import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { adminAction } from "./tenantFunctions";
import * as tailShapes from "./utils/tailShapes";
import { appError } from "./utils/appError";

/**
 * Empty the CRM side of one workspace: customers, prospects, and findings.
 *
 * A re-import replaces the workbook's own rows, but deliberately leaves alone
 * anything the workbook did not create — the typed-in contact details, the
 * agent's findings, and the prospects it turned up. That is the right rule for
 * a customer who imports a fresh file every month and would be furious to lose
 * a year of contact details to it.
 *
 * It is the wrong rule for showing somebody the process from the beginning. A
 * second run of the demo starts with every detail already filled in and every
 * group already looked through, so both sweeps report there is nothing to do
 * and the part worth watching never happens. This is the deliberate exception,
 * and it stops exactly there.
 *
 * The imported spreadsheet is not touched. This first deleted the workbook's
 * rows and the import history with it, on the reasoning that a clean import
 * would put them straight back. Anthony, 2026-08-03: *"why did clearing the
 * CRM clear data that's already been imported, I never asked for that."* The
 * upload is the expensive half — somebody has to find the file and map its
 * worksheets again — and clearing the CRM is not a reason to make them.
 */

/**
 * How many rows one mutation deletes.
 *
 * The same bound the supersede purge uses, and for the same reason: doing a
 * whole workspace in one transaction exceeds what Convex will write at once.
 */
const DELETE_BATCH_SIZE = 400;

export const deleteWorkspaceSalesDataBatchInternal = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const companyId = args.companyId;
    let deleted = 0;

    /**
     * The three CRM tables, and only these three.
     *
     * Read by the index that starts with the company, and written out one by
     * one rather than looped over a list of names, because each table's index
     * is its own type and a shared loop cannot be told which index belongs to
     * which table.
     *
     * Nothing that came out of a workbook appears here — not the sales rows,
     * the accounts, the category, interest or frequency tables, and not the
     * import history. Clearing the CRM is not a reason to make somebody find
     * and map their spreadsheet again.
     */
    const readers = [
      (limit: number) =>
        ctx.db
          .query("salesDataCustomers")
          .withIndex("by_company_account", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataCustomerResearch")
          .withIndex("by_company_subject_field", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataProspects")
          .withIndex("by_company_prospect", (q) => q.eq("companyId", companyId))
          .take(limit),
    ];

    for (const read of readers) {
      if (deleted >= DELETE_BATCH_SIZE) break;

      const rows = await read(DELETE_BATCH_SIZE - deleted);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    return { deleted, hasMore: deleted >= DELETE_BATCH_SIZE };
  },
});

/**
 * How many rounds of deleting the action will do before it gives up.
 *
 * A bound on a loop that is otherwise driven by the data, so a table that
 * somehow refuses to empty cannot spin for ever. At this batch size it covers
 * two million rows, which is far past anything a workbook produces.
 */
const MAX_BATCHES = 5000;

export const resetSalesData = adminAction({
  args: {},
  returns: tailShapes.salesDataResetShape,
  handler: async (ctx): Promise<{ deleted: number }> => {
    const context = await ctx.runQuery(internal.salesData.getImportContextInternal, {
      userId: ctx.userId,
    });
    if (!context) throw appError("MODULE_DISABLED", "Sales Data is not enabled for this workspace.");

    let deleted = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const result = await ctx.runMutation(
        internal.salesDataReset.deleteWorkspaceSalesDataBatchInternal,
        { companyId: context.companyId }
      );
      deleted += result.deleted;
      if (!result.hasMore) break;
    }

    return { deleted };
  },
});

/**
 * Empty everything the Sales Data module holds for one workspace — the
 * imported workbook included.
 *
 * The reset above deliberately spares the spreadsheet, and the comment there
 * records why. This one exists for the opposite situation, which turned out to
 * be just as real: a client playing with different workbooks of the same
 * shape, who wants each upload to start from nothing. Findings and reports
 * derived from the last file poison the next run — the agents skip what looks
 * already-researched, and the opportunity report keeps talking about products
 * that are no longer in the data. A hard delete is the point, not a cost:
 * the next run must find things fresh, not remember them.
 *
 * Two clears, two scopes, both on the page whose data they clear: the
 * customers screen empties the CRM and keeps the workbook; the imports screen
 * empties the lot.
 */

/**
 * Whether an agent is mid-run for this workspace.
 *
 * Clearing under a running job would have its next write land on rows that no
 * longer exist. Refusing is kinder than killing: the jobs have their own stop
 * buttons, and a person who meant to interrupt can say so there.
 */
export const getRunningSalesWorkInternal = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const running = async (
      read: () => Promise<unknown | null>,
      label: string
    ): Promise<string | null> => ((await read()) ? label : null);

    return (
      (await running(
        () =>
          ctx.db
            .query("salesDataResearchJobs")
            .withIndex("by_company_status", (q) =>
              q.eq("companyId", args.companyId).eq("status", "RUNNING")
            )
            .first(),
        "research"
      )) ??
      (await running(
        () =>
          ctx.db
            .query("salesDataMarketDiscoveryJobs")
            .withIndex("by_company_status", (q) =>
              q.eq("companyId", args.companyId).eq("status", "RUNNING")
            )
            .first(),
        "discovery"
      )) ??
      (await running(
        () =>
          ctx.db
            .query("salesOpportunityReports")
            .withIndex("by_company_status", (q) =>
              q.eq("companyId", args.companyId).eq("status", "RUNNING")
            )
            .first(),
        "report"
      ))
    );
  },
});

export const clearAllWorkspaceSalesDataBatchInternal = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const companyId = args.companyId;
    let deleted = 0;

    /*
     * Research job items first, and by way of their jobs: the items table has
     * no company index, so a job's items are only reachable while the job row
     * still exists. A job is deleted only once a read for its items comes back
     * short — the same rule the user purge applies to threads and messages —
     * so items can never be orphaned by their handle disappearing first.
     */
    const jobs = await ctx.db
      .query("salesDataResearchJobs")
      .withIndex("by_company_status", (q) => q.eq("companyId", companyId))
      .take(25);
    for (const job of jobs) {
      if (deleted >= DELETE_BATCH_SIZE) break;
      const wanted = DELETE_BATCH_SIZE - deleted;
      const items = await ctx.db
        .query("salesDataResearchJobItems")
        .withIndex("by_job_status", (q) => q.eq("jobId", job._id))
        .take(wanted);
      for (const item of items) {
        await ctx.db.delete(item._id);
        deleted += 1;
      }
      if (items.length < wanted) {
        await ctx.db.delete(job._id);
        deleted += 1;
      }
    }

    /**
     * Every other table carries a company-led index, so each gets a plain
     * sweep. The order is not load-bearing — a half-done clear is re-entered
     * by the next batch — but imports go last so the screen's "what is loaded"
     * heading is the final thing to vanish rather than the first.
     */
    const readers = [
      (limit: number) =>
        ctx.db
          .query("salesDataRows")
          .withIndex("by_company_import", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataCategoryLinks")
          .withIndex("by_company_import", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataAreasOfInterest")
          .withIndex("by_company_import", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataFrequencies")
          .withIndex("by_company_import", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataAccounts")
          .withIndex("by_company_import", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataCustomers")
          .withIndex("by_company_account", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataCustomerResearch")
          .withIndex("by_company_subject_field", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataProspects")
          .withIndex("by_company_prospect", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataMarketDiscoveryGroups")
          .withIndex("by_company_group", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataMarketDiscoveryJobs")
          .withIndex("by_company_status", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesOpportunityReportGapProducts")
          .withIndex("by_company_report", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesOpportunityReportTypeBaskets")
          .withIndex("by_company_report", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesOpportunityReports")
          .withIndex("by_company_status", (q) => q.eq("companyId", companyId))
          .take(limit),
      (limit: number) =>
        ctx.db
          .query("salesDataImports")
          .withIndex("by_company_started", (q) => q.eq("companyId", companyId))
          .take(limit),
    ];

    for (const read of readers) {
      if (deleted >= DELETE_BATCH_SIZE) break;

      const rows = await read(DELETE_BATCH_SIZE - deleted);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    return { deleted, hasMore: deleted >= DELETE_BATCH_SIZE };
  },
});

export const clearAllSalesData = adminAction({
  args: {},
  returns: tailShapes.salesDataResetShape,
  handler: async (ctx): Promise<{ deleted: number }> => {
    const context = await ctx.runQuery(internal.salesData.getImportContextInternal, {
      userId: ctx.userId,
    });
    if (!context) throw appError("MODULE_DISABLED", "Sales Data is not enabled for this workspace.");

    const runningWork = await ctx.runQuery(
      internal.salesDataReset.getRunningSalesWorkInternal,
      { companyId: context.companyId }
    );
    if (runningWork) {
      throw appError(
        "CONFLICT",
        "An agent is still working on this data. Wait for it to finish, or stop it, then clear."
      );
    }

    let deleted = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const result = await ctx.runMutation(
        internal.salesDataReset.clearAllWorkspaceSalesDataBatchInternal,
        { companyId: context.companyId }
      );
      deleted += result.deleted;
      if (!result.hasMore) break;
    }

    return { deleted };
  },
});
