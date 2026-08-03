import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { tenantAction } from "./tenantFunctions";

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

export const resetSalesData = tenantAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    const context = await ctx.runQuery(internal.salesData.getImportContextInternal, {
      userId: ctx.userId,
    });
    if (!context) throw new Error("Sales Data is not enabled for this workspace.");

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
