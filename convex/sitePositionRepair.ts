import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requestSiteRebuild } from "./siteRankings";

/**
 * The day positions began to be counted among Google's normal results
 * (sites-data-completeness-plan.md, G2). Every place filed before it was
 * counted on the whole page.
 */
const COUNTED_AS_NORMAL_FROM = "2026-09-27";

/**
 * Clear the moves the counting change made by mistake on 2026-09-27. That
 * morning's run filed the day the old way; the afternoon's filed it again the
 * new way and moved each search from its old-way place — "ai agency" up two,
 * from 5th on the page to 3rd of the normal results. A place counted the new
 * way that moved from one filed before the change had not moved at all: its
 * move is cleared, as a first filing the new way now clears it
 * (`fileKeywordRank`). Then each site touched is summarised again, so the
 * counts of what moved are right too. Idempotent: a row cleared once has no
 * place to move from.
 */
export async function clearCountingSwitchMoves(ctx: MutationCtx, cursor: string | null, batchSize: number) {
  const page = await ctx.db.query("siteKeywordRanks").paginate({ cursor, numItems: batchSize });
  const touched = new Map<string, { websiteId: Id<"websites">; place: number }>();
  let updated = 0;
  for (const row of page.page) {
    if (row.pagePosition === undefined || row.previousPosition === undefined) continue;
    if (row.previousDay === undefined || row.previousDay >= COUNTED_AS_NORMAL_FROM) continue;
    await ctx.db.patch(row._id, { previousPosition: undefined, change: 0, status: "SAME" });
    touched.set(`${row.websiteId}:${row.locationCode}`, { websiteId: row.websiteId, place: row.locationCode });
    updated += 1;
  }
  for (const site of touched.values()) await requestSiteRebuild(ctx, site.websiteId, site.place);
  return { cursor: page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}
