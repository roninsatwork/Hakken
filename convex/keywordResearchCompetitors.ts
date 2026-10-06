import { v } from "convex/values";
import { competitorGapShape, competitorStartsShape } from "./keywordResearchShapes";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { myRivals, requireMySite, type MyRival } from "./siteAccess";
import { contentGapOf } from "./siteContentGap";
import { websiteIconUrl } from "./websiteIcons";
import type { Site } from "./websiteSiteRows";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * Start from a competitor (boards 1 and 6; docs/plans/active/keyword-
 * research-plan.md): the searches a competitor ranks for that the website
 * does not rank for at all, read from Content gap — what Websites already
 * holds — so nothing is bought. A keyword opened from here is looked up as
 * any other, at the usual cost.
 */

type GapRow = { keyword: string; position: number; volume: number | null; difficulty: number | null; intent: string; traffic: number | null };

/**
 * Each of the website's competitors' gaps, from Content gap as it is worked
 * out when read (`siteContentGap.ts`). Null while the website's keyword copy
 * is being prepared; none for a competitor, which has no Content gap.
 */
async function gapsByRival(ctx: QueryCtx, site: Site, rivals: MyRival[]): Promise<Map<string, GapRow[]> | null> {
  const byRival = new Map<string, GapRow[]>(rivals.map((rival) => [rival.website._id as string, []]));
  if (isTrackedHold(site.hold)) return byRival;
  const gap = await contentGapOf(ctx, { websiteId: site.website._id, place: site.place }, rivals.map((rival) => rival.website._id));
  if (!gap) return null;
  for (const row of gap.rows) {
    for (const rival of row.rivals) {
      byRival.get(rival.websiteId)?.push({
        keyword: row.keyword, position: rival.position, volume: row.volume, difficulty: row.difficulty, intent: row.intent, traffic: rival.traffic,
      });
    }
  }
  return byRival;
}

/** Board 1: each competitor of the website, and how many searches it ranks for that the website doesn't. */
export const competitorStarts = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: competitorStartsShape,
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rivals = await myRivals(ctx, site);
    const gaps = await gapsByRival(ctx, site, rivals);
    return {
      preparing: gaps === null,
      rivals: await Promise.all(rivals.map(async (rival) => ({
        rivalSiteId: rival.hold._id,
        host: rival.website.displayHost,
        iconUrl: await websiteIconUrl(ctx, rival.website._id),
        gap: gaps?.get(rival.website._id)?.length ?? null,
      }))),
    };
  },
});

/** Board 6: one competitor's gap, the most searched first. */
export const competitorGap = tenantQuery({
  args: { siteId: v.id("companyWebsites"), rivalSiteId: v.id("companyWebsites") },
  returns: competitorGapShape,
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rivals = await myRivals(ctx, site);
    const rival = rivals.find((entry) => entry.hold._id === args.rivalSiteId);
    if (!rival) return null;
    const gaps = await gapsByRival(ctx, site, rivals);
    const rows = (gaps?.get(rival.website._id) ?? []).sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1));
    // How many searches it ranks for in all, from its newest day that says.
    const days = await ctx.db.query("siteDaySummaries").withIndex("by_site_day", (q) => q.eq("websiteId", rival.website._id).eq("locationCode", site.place)).order("desc").take(30);
    const day = days.find((entry) => entry.rankedKeywordsTotal !== undefined || entry.keywords !== undefined);
    return {
      host: site.website.displayHost,
      rivalHost: rival.website.displayHost,
      locationCode: site.place,
      preparing: gaps === null,
      ranksFor: day ? day.rankedKeywordsTotal ?? day.keywords ?? null : null,
      /** The visits a month these searches bring the competitor, as DataForSEO estimates them. */
      visits: gaps === null ? null : rows.reduce((sum, row) => sum + (row.traffic ?? 0), 0),
      rows,
    };
  },
});
