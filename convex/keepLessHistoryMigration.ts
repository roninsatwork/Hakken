import type { MutationCtx } from "./_generated/server";

export { packKeywordPositions } from "./positionHistoryMigration";

/**
 * What keep-less-history-plan.md stops keeping, cleared once nothing reads or
 * writes it, in stages a cursor carries on:
 *
 *  1. Each found competitor's last day kept on its own row (`lastSeenDay`),
 *     from its day rows (part 2, Decision 4).
 *  2. Those day rows (`discoveredCompetitorDays`).
 *  3. The keyword positions kept a row a check (`seoKeywordPositions`), each
 *     already a point on its month's line (part 1), and the old thinning's
 *     place (`positionThinning`).
 *
 * Run before those tables leave the schema. Idempotent: a stage finds only
 * what is left.
 */

type MigrationBatchResult = { cursor: string | null; isDone: boolean; processed: number; updated: number };

type Stage = "lastDays" | "competitorDays" | "positions";

function stageOf(cursor: string | null): { stage: Stage; inner: string | null } {
  if (cursor === null) return { stage: "lastDays", inner: null };
  const split = cursor.indexOf(":");
  const inner = cursor.slice(split + 1);
  return { stage: cursor.slice(0, split) as Stage, inner: inner === "" ? null : inner };
}

export async function clearKeptHistory(ctx: MutationCtx, cursor: string | null, batchSize: number): Promise<MigrationBatchResult> {
  const { stage, inner } = stageOf(cursor);

  if (stage === "lastDays") {
    const page = await ctx.db.query("discoveredCompetitors").paginate({ cursor: inner, numItems: batchSize });
    let updated = 0;
    for (const row of page.page) {
      if (row.lastSeenDay !== undefined) continue;
      const newest = await ctx.db
        .query("discoveredCompetitorDays")
        .withIndex("by_company_website_host_day", (q) => q.eq("companyWebsiteId", row.companyWebsiteId).eq("host", row.host))
        .order("desc")
        .first();
      if (!newest) continue;
      await ctx.db.patch(row._id, { lastSeenDay: newest.day });
      updated += 1;
    }
    return {
      cursor: page.isDone ? "competitorDays:" : `lastDays:${page.continueCursor}`,
      isDone: false,
      processed: page.page.length,
      updated,
    };
  }

  if (stage === "competitorDays") {
    const rows = await ctx.db.query("discoveredCompetitorDays").take(batchSize);
    for (const row of rows) await ctx.db.delete(row._id);
    return { cursor: rows.length < batchSize ? "positions:" : "competitorDays:", isDone: false, processed: rows.length, updated: rows.length };
  }

  const rows = await ctx.db.query("seoKeywordPositions").take(batchSize);
  for (const row of rows) await ctx.db.delete(row._id);
  const thinning = await ctx.db.query("positionThinning").take(10);
  for (const row of thinning) await ctx.db.delete(row._id);
  const isDone = rows.length < batchSize;
  return { cursor: isDone ? null : "positions:", isDone, processed: rows.length + thinning.length, updated: rows.length + thinning.length };
}
