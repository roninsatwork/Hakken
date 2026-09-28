import type { MutationCtx } from "./_generated/server";

/*
 * `attachTrackedFromRivals` lived here too: on 2026-09-22 it put tracked sites
 * back on the companies that chose them, rebuilt from the shared competition
 * graph. It ran on dev, and went with the graph on 2026-09-28
 * (company-level-website-facts-plan.md, CL5) — `dataMigrations.ts` says how a
 * deployment that never ran it recovers.
 */

type MigrationBatchResult = {
  cursor: string | null;
  isDone: boolean;
  processed: number;
  updated: number;
};

type MigrationRunner = (
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
) => Promise<MigrationBatchResult>;

/**
 * Every hold written before the flag existed was a company's own website.
 *
 * Absence already reads as owned everywhere, so this changes no behaviour. It
 * is worth writing down anyway: a field that is sometimes absent and sometimes
 * "OWNED" is a field every future reader has to think about twice.
 */
export const markExistingHoldsOwned: MigrationRunner = async (ctx, cursor, batchSize) => {
  const page = await ctx.db.query("companyWebsites").paginate({ numItems: batchSize, cursor });

  let updated = 0;
  for (const row of page.page) {
    if (row.relationship !== undefined) continue;
    await ctx.db.patch(row._id, { relationship: "OWNED" });
    updated += 1;
  }

  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
};
