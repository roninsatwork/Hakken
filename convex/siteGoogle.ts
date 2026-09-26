import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { listHold, requireMySite } from "./siteAccess";
import { holdSearch, holdSearches } from "./holdLists";
import { searchVerdict, searchVerdictValidator } from "./utils/trackingVerdicts";
import { MAX_LIST, type Site } from "./websiteSiteRows";

/**
 * The searches chosen for a site and how it does on each, for the client's
 * Sites screens: its standing now, and its position day by day.
 *
 * The searches are the list the company measures the site on — its own for an
 * owned site, the owned site's for a competitor (D17) — set in admin (D1) and
 * capped on the record, so the list is read whole by index. The list is the
 * company's own (docs/plans/active/private-tracking-lists-plan.md), read
 * through its hold. The positions
 * behind a chart are read per search and per day from the place index.
 */

/** Searches drawn on the position chart at once. */
const MAX_CHARTED = 5;

/** Days of positions read per search for one chart. */
const DAYS_PER_SEARCH = 800;

type Reader = { db: QueryCtx["db"] };

export type SearchStanding = {
  keyword: string;
  isActive: boolean;
  stats: Doc<"websiteSearchStats"> | null;
};

/** The site's standing on each search in the list it is measured on: this company's own. */
export async function searchStandings(ctx: Reader, site: Site): Promise<SearchStanding[]> {
  const searches = await holdSearches(ctx, listHold(site), MAX_LIST);
  return await Promise.all(searches.map(async (search) => ({
    keyword: search.keyword,
    isActive: search.isActive,
    stats: await ctx.db
      .query("websiteSearchStats")
      .withIndex("by_key", (q) =>
        q.eq("websiteId", site.website._id).eq("keyword", search.keyword).eq("locationCode", site.place))
      .unique(),
  })));
}

export const listSearches = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    keyword: v.string(),
    isActive: v.boolean(),
    verdict: searchVerdictValidator,
    lastPosition: v.union(v.number(), v.null()),
    previousPosition: v.union(v.number(), v.null()),
    bestPosition: v.union(v.number(), v.null()),
    firstCheckedDay: v.union(v.string(), v.null()),
    lastCheckedDay: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rows = await searchStandings(ctx, site);
    return rows
      .map(({ keyword, isActive, stats }) => ({
        keyword,
        isActive,
        verdict: searchVerdict(stats, site.today),
        lastPosition: stats?.lastPosition ?? null,
        previousPosition: stats?.previousPosition ?? null,
        bestPosition: stats?.bestPosition ?? null,
        firstCheckedDay: stats?.firstCheckedDay ?? null,
        lastCheckedDay: stats?.lastCheckedDay ?? null,
      }))
      .sort((left, right) =>
        Number(right.isActive) - Number(left.isActive)
        || (left.lastPosition ?? 999) - (right.lastPosition ?? 999)
        || left.keyword.localeCompare(right.keyword));
  },
});

/** Where the site stood on each of these searches, day by day between two days. */
export const searchPositions = tenantQuery({
  args: { siteId: v.id("companyWebsites"), keywords: v.array(v.string()), from: v.string(), to: v.string() },
  returns: v.array(v.object({
    keyword: v.string(),
    points: v.array(v.object({ day: v.string(), position: v.union(v.number(), v.null()) })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    // Only searches on this company's own list: a "checked, not found" row
    // exists only because somebody tracks the search, so answering for any
    // other would say that someone does.
    const holdId = listHold(site);
    const mine = [];
    for (const keyword of args.keywords.slice(0, MAX_CHARTED)) {
      if (await holdSearch(ctx, holdId, keyword)) mine.push(keyword);
    }
    return await Promise.all(mine.map(async (keyword) => {
      const rows = await ctx.db
        .query("seoKeywordPositions")
        .withIndex("by_website_keyword_place_day", (q) =>
          q.eq("websiteId", site.website._id).eq("keyword", keyword).eq("locationCode", site.place)
            .gte("day", args.from).lte("day", args.to))
        .take(DAYS_PER_SEARCH);
      // One point per day: the better of two checks on the same day.
      const byDay = new Map<string, number | null>();
      for (const row of rows) {
        const held = byDay.get(row.day);
        const position = row.position ?? null;
        if (held === undefined || (position !== null && (held === null || position < held))) byDay.set(row.day, position);
      }
      return {
        keyword,
        points: [...byDay.entries()]
          .map(([day, position]) => ({ day, position }))
          .sort((left, right) => left.day.localeCompare(right.day)),
      };
    }));
  },
});
