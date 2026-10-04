import type { MutationCtx } from "./_generated/server";

/**
 * Removes the sample figures Keyword research's Test mode brought in from
 * DataForSEO's sandbox on 2026-10-04 — a mode he never asked for, since
 * removed (Anthony: "I never asked for this data, I don't want it, you added
 * it, you remove it"; docs/plans/active/keyword-research-plan.md).
 *
 * For each lookup: every sample row bought for its keyword — its country and
 * each other country picked — goes (overviews, Google's results, ideas,
 * answers), and a lookup left with no real overview goes with its jobs, so
 * its keyword is looked up afresh, for real. Real figures are never touched,
 * and the request ledger (`seoDataPulls`) is kept, as every request is.
 */

/** Rows read for one keyword and country: Test mode bought each at most a few times. */
const ROWS_READ = 50;
/** A lookup's jobs read: one for each part asked for. */
const JOBS_READ = 100;

export async function removeSampleResearch(ctx: MutationCtx, cursor: string | null, batchSize: number) {
  const page = await ctx.db.query("keywordLookups").paginate({ numItems: batchSize, cursor });
  let updated = 0;
  for (const lookup of page.page) {
    const places = [lookup.locationCode, ...(lookup.countries ?? []).map((country) => country.locationCode)];
    for (const locationCode of places) {
      const at = { keyword: lookup.keyword, locationCode };
      const rows = [
        ...(await ctx.db.query("researchKeywords").withIndex("by_keyword_place", (q) => q.eq("keyword", at.keyword).eq("locationCode", at.locationCode)).take(ROWS_READ)),
        ...(await ctx.db.query("researchSerps").withIndex("by_keyword_place", (q) => q.eq("keyword", at.keyword).eq("locationCode", at.locationCode)).take(ROWS_READ)),
        ...(await ctx.db.query("researchIdeas").withIndex("by_keyword_place_kind", (q) => q.eq("keyword", at.keyword).eq("locationCode", at.locationCode)).take(ROWS_READ)),
        ...(await ctx.db.query("researchAnswers").withIndex("by_keyword_place", (q) => q.eq("keyword", at.keyword).eq("locationCode", at.locationCode)).take(ROWS_READ)),
      ];
      for (const row of rows) {
        if (!row.sandbox) continue;
        await ctx.db.delete(row._id);
        updated += 1;
      }
    }
    const real = await ctx.db
      .query("researchKeywords")
      .withIndex("by_keyword_place", (q) => q.eq("keyword", lookup.keyword).eq("locationCode", lookup.locationCode))
      .first();
    if (real) continue;
    for (const job of await ctx.db.query("researchJobs").withIndex("by_lookup_part", (q) => q.eq("lookupId", lookup._id)).take(JOBS_READ)) {
      await ctx.db.delete(job._id);
    }
    await ctx.db.delete(lookup._id);
    updated += 1;
  }
  return { cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}
