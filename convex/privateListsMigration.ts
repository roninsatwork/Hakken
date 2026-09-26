import type { MutationCtx } from "./_generated/server";
import { requestSiteRebuild } from "./siteRankings";

/**
 * What is left of the move of the searches and questions from the website to
 * the companies that own it (docs/plans/active/private-tracking-lists-plan.md,
 * §4.7): taking out of All keywords the rows only a tracked search's check put
 * there (V5). Registered in `convex/dataMigrations.ts` as
 * `2026-09-26-check-only-keyword-rows`; safe to run twice.
 *
 * Four migrations ran before it on dev on 2026-09-26 and were then removed,
 * because the schema they read had gone: `2026-09-26-private-questions` and
 * `2026-09-26-private-searches` (every list row handed to the website's owning
 * hold — the field is required now), `2026-09-26-list-ai-lines` (the
 * website-wide `siteDaySummaries.ai` cleared, each website rebuilt in full so
 * its lists' lines were written) and `2026-09-26-drop-website-wide-rival-lines`
 * (`siteRivalAiDays` emptied, then dropped). The note in `dataMigrations.ts`
 * says how to recover a deployment that missed them.
 */

type BatchResult = { cursor: string | null; isDone: boolean; processed: number; updated: number };

/**
 * What a row from a DataForSEO keyword list carries and a tracked search's
 * check never writes: the search's volume, and the list's facts about it.
 */
const LIST_FACTS = [
  "cpc", "difficulty", "trend", "serpFeatures", "traffic", "trafficValue", "pageRank", "pageReferringDomains",
  "pageBacklinks", "competition", "competitionLevel", "searchIntent", "resultsCount", "previousPositionDfs", "movementDfs",
] as const;

/**
 * Takes out of All keywords the rows only a tracked search's check put there
 * (V5): no volume, none of a list's facts, and a search some company tracks.
 * A check no longer adds to any website's keyword list, so none comes back;
 * the site is rebuilt so its counts and copy agree. On dev on 2026-09-26 it
 * read 16,012 rows and found none.
 */
export async function dropCheckOnlyKeywordRows(ctx: MutationCtx, cursor: string | null, batchSize: number): Promise<BatchResult> {
  const page = await ctx.db.query("siteKeywordRanks").paginate({ numItems: batchSize, cursor });
  let updated = 0;
  for (const row of page.page) {
    if (row.volumeKnown || LIST_FACTS.some((field) => row[field] !== undefined)) continue;
    const tracked = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_keyword", (q) => q.eq("keyword", row.keyword))
      .first();
    if (!tracked) continue;
    await ctx.db.delete(row._id);
    await requestSiteRebuild(ctx, row.websiteId, row.locationCode);
    updated += 1;
  }
  return { cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}
