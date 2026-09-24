import { v, type Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { SerpPageExtras } from "./dataForSeoParsers";

/**
 * Keeping each checked Google results page for the Sites screens: who ranks
 * above the site, which features the page shows, and what people also ask.
 * See docs/plans/active/user-sites-plan.md, section 2 and Phase 2.
 *
 * The keyword check already files every known site's position on the page
 * (`seoKeywordChecks.ts`); this keeps the page itself, once per search, place
 * and day, so a page can show who else ranks — down to position 100 — and not
 * just the sites we happen to hold.
 */

/**
 * Results kept per page: all hundred a check reads (2026-09-24, "store
 * whatever we can"), one per domain. About fifteen kilobytes a page, so even a
 * list at its ceiling of a thousand searches reads inside a query's limit.
 */
const RESULTS_KEPT = 100;

/** Rows one pull may have written before, cleared on a re-parse. */
const SAME_PULL_LIMIT = 5;

export const serpSnapshotValidator = v.object({
  resultCount: v.number(),
  results: v.array(v.object({ position: v.number(), domain: v.string(), url: v.optional(v.string()) })),
  features: v.array(v.string()),
  aiOverviewDomains: v.array(v.string()),
  localPackDomains: v.array(v.string()),
  featuredSnippetDomain: v.optional(v.string()),
  questions: v.array(v.string()),
  related: v.array(v.string()),
});
export type SerpSnapshot = Infer<typeof serpSnapshotValidator>;

/** A parsed results page as the snapshot keeps it. */
export function serpSnapshotOf(page: {
  resultCount: number;
  rows: Array<{ domain: string; position: number; url?: string }>;
  page: SerpPageExtras;
}): SerpSnapshot {
  return {
    resultCount: page.resultCount,
    results: page.rows.slice(0, RESULTS_KEPT).map((row) => ({
      position: row.position,
      domain: row.domain.toLowerCase(),
      ...(row.url ? { url: row.url } : {}),
    })),
    features: page.page.features,
    aiOverviewDomains: page.page.aiOverviewDomains,
    localPackDomains: page.page.localPackDomains,
    ...(page.page.featuredSnippetDomain ? { featuredSnippetDomain: page.page.featuredSnippetDomain } : {}),
    questions: page.page.questions,
    related: page.page.related,
  };
}

/**
 * File one results page. A re-parse of the pull replaces what it wrote, and a
 * second check of the same search on the same day replaces the first: one
 * search, place and day is one page.
 */
export async function fileSerpPage(
  ctx: MutationCtx,
  entry: { pullId: Id<"seoDataPulls">; keyword: string; locationCode: number; day: string; snapshot: SerpSnapshot },
): Promise<void> {
  const fromPull = await ctx.db
    .query("siteSerpPages")
    .withIndex("by_pull", (q) => q.eq("pullId", entry.pullId))
    .take(SAME_PULL_LIMIT);
  for (const row of fromPull) await ctx.db.delete(row._id);
  const sameDay = await ctx.db
    .query("siteSerpPages")
    .withIndex("by_keyword_place_day", (q) =>
      q.eq("keyword", entry.keyword).eq("locationCode", entry.locationCode).eq("day", entry.day))
    .take(SAME_PULL_LIMIT);
  for (const row of sameDay) await ctx.db.delete(row._id);

  await ctx.db.insert("siteSerpPages", {
    keyword: entry.keyword,
    locationCode: entry.locationCode,
    day: entry.day,
    pullId: entry.pullId,
    ...entry.snapshot,
    createdAt: Date.now(),
  });
}
