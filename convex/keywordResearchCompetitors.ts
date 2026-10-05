import { v } from "convex/values";
import { competitorGapShape, competitorStartsShape } from "./keywordResearchShapes";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { myRivals, requireMySite, type MyRival } from "./siteAccess";
import { gapCopyKey, readListCopy } from "./siteListCopies";
import { GAP_COPY_FIELDS } from "./siteCompetitors";
import { websiteIconUrl } from "./websiteIcons";

/**
 * Start from a competitor (boards 1 and 6; docs/plans/active/keyword-
 * research-plan.md): the searches a competitor ranks for that the website
 * does not rank for at all, read from Content gap — what Websites already
 * holds — so nothing is bought. A keyword opened from here is looked up as
 * any other, at the usual cost.
 */

type GapRow = { keyword: string; position: number; volume: number | null; difficulty: number | null; intent: string; traffic: number | null };

/** Each of the website's competitors' gaps, from the gap's compact copy. Null while the copy is being prepared. */
async function gapsByRival(ctx: QueryCtx, siteId: Id<"companyWebsites">, rivals: MyRival[]): Promise<Map<string, GapRow[]> | null> {
  const copy = await readListCopy(ctx, "gap", gapCopyKey(siteId), GAP_COPY_FIELDS);
  if (!copy) return null;
  const rivalIds = JSON.parse(typeof copy.meta.rivalIds === "string" ? copy.meta.rivalIds : "[]") as string[];
  const tracked = new Set(rivals.map((rival) => rival.website._id as string));
  const byRival = new Map<string, GapRow[]>(rivals.map((rival) => [rival.website._id as string, []]));
  for (const [, keyword, volume, intent, difficulty, flat] of copy.rows) {
    const triples = flat as Array<number | null>;
    for (let index = 0; index < triples.length; index += 3) {
      const websiteId = rivalIds[triples[index] as number];
      if (!websiteId || !tracked.has(websiteId)) continue;
      byRival.get(websiteId)!.push({
        keyword: keyword as string,
        position: triples[index + 1] as number,
        volume: volume as number | null,
        difficulty: difficulty as number | null,
        intent: intent as string,
        traffic: triples[index + 2] ?? null,
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
    const gaps = await gapsByRival(ctx, args.siteId, rivals);
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
    const gaps = await gapsByRival(ctx, args.siteId, rivals);
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
