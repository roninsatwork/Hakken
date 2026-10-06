import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { SEO_KEYWORD_CHECK_OPERATION } from "./dataForSeoRegistry";
import { tenantQuery } from "./tenantFunctions";
import { listHold, listWebsiteId, requireMySite } from "./siteAccess";
import { holdFirstCheck, holdSearch, holdSearches } from "./holdLists";
import { searchVerdict, searchVerdictValidator } from "./utils/trackingVerdicts";
import { MAX_LIST, type Site } from "./websiteSiteRows";
import { bucketOf, stepValidator } from "./siteFigures";
import { dailyPositionsKeptFrom } from "./seoCollectionPolicy";

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

/** Where a website stands on a search, as its summary holds it. */
export type StandingStats = Pick<
  Doc<"websiteSearchStats">,
  "firstCheckedDay" | "lastCheckedDay" | "lastPosition" | "previousCheckedDay" | "previousPosition" | "bestPosition" | "everRanked"
>;

export type SearchStanding = {
  keyword: string;
  isActive: boolean;
  /** Ticked from a fan-out query (`addedFrom: "AI_SEARCH"`) rather than typed in. */
  fromFanOut: boolean;
  stats: StandingStats | null;
};

/**
 * A competitor's standing on a search, as of the newest check of the list it
 * is measured on (docs/plans/active/sites-audit-fixes-plan.md, 1.4).
 *
 * A "checked, not found" row is written only for the website whose list
 * tracks the search (`seoKeywordChecks.ts`), so a competitor that drops off
 * the results page keeps its last place as though it were current. The list's
 * own website is checked on the very same pages, so where it was checked
 * later, the competitor was not on them: not in the top 100 since, and down
 * from its place only if the check before found it.
 */
export function asOfListCheck(own: StandingStats | null, list: StandingStats | null): StandingStats | null {
  if (!list) return own;
  if (own && own.lastCheckedDay >= list.lastCheckedDay) return own;
  const foundAtCheckBefore = own !== null && list.previousCheckedDay !== undefined && own.lastCheckedDay === list.previousCheckedDay;
  return {
    firstCheckedDay: own && own.firstCheckedDay < list.firstCheckedDay ? own.firstCheckedDay : list.firstCheckedDay,
    lastCheckedDay: list.lastCheckedDay,
    ...(list.previousCheckedDay !== undefined ? { previousCheckedDay: list.previousCheckedDay } : {}),
    ...(foundAtCheckBefore && own.lastPosition !== undefined ? { previousPosition: own.lastPosition } : {}),
    ...(own?.bestPosition !== undefined ? { bestPosition: own.bestPosition } : {}),
    everRanked: own?.everRanked ?? false,
  };
}

/** A website's summary on one search from one place. */
export async function searchStats(ctx: Reader, websiteId: Id<"websites">, keyword: string, place: number): Promise<StandingStats | null> {
  return await ctx.db
    .query("websiteSearchStats")
    .withIndex("by_key", (q) => q.eq("websiteId", websiteId).eq("keyword", keyword).eq("locationCode", place))
    .unique();
}

/**
 * The site's standing on each search in the list it is measured on: this
 * company's own. A competitor's is read as of the list's newest check. A
 * screen that compares on a few asks for the searches still checked, and no
 * more than it can use.
 */
export async function searchStandings(
  ctx: Reader,
  site: Site,
  options: { activeOnly?: boolean; cap?: number } = {},
): Promise<SearchStanding[]> {
  const listed = await holdSearches(ctx, listHold(site), MAX_LIST, { activeOnly: options.activeOnly });
  const searches = options.cap === undefined ? listed : listed.slice(0, options.cap);
  const listSite = listWebsiteId(site);
  const isListSite = listSite === site.website._id;
  return await Promise.all(searches.map(async (search) => {
    const [own, list] = await Promise.all([
      searchStats(ctx, site.website._id, search.keyword, site.place),
      isListSite ? Promise.resolve(null) : searchStats(ctx, listSite, search.keyword, site.place),
    ]);
    return {
      keyword: search.keyword,
      isActive: search.isActive,
      fromFanOut: search.addedFrom === "AI_SEARCH",
      stats: isListSite ? own : asOfListCheck(own, list),
    };
  }));
}

export const listSearches = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    keyword: v.string(),
    isActive: v.boolean(),
    /**
     * Ticked to check on Google every run from a fan-out query
     * (`promptFanOut.ts` `tick`), rather than typed in: the rows the Tracked
     * fan-out queries page shows.
     */
    fromFanOut: v.boolean(),
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
      .map(({ keyword, isActive, fromFanOut, stats }) => ({
        keyword,
        isActive,
        fromFanOut,
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

/**
 * Where the site stood on each of these searches between two days, a point
 * for each day, week or month of the step chosen (2026-10-04: it was always
 * daily, whatever the step). A position is a level, so a week or month takes
 * its last day's, as every Sites chart's levels do (`seriesFor`).
 */
export const searchPositions = tenantQuery({
  args: { siteId: v.id("companyWebsites"), keywords: v.array(v.string()), from: v.string(), to: v.string(), step: stepValidator },
  returns: v.array(v.object({
    keyword: v.string(),
    points: v.array(v.object({ day: v.string(), lastDay: v.string(), position: v.union(v.number(), v.null()) })),
    /**
     * A day's step reaching back past the 90 days kept day by day: the first
     * day still daily, before which each week shows its last check (B1).
     */
    weeklyBefore: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    // A search on this company's own list reads every check of it. Any other
    // search the site ranks for reads only what the site's own keyword lists
    // recorded — facts DataForSEO sends about the website to whoever asks —
    // and never a one-by-one check: those, "checked, not found" rows among
    // them, exist only because some company tracks the search, so showing them
    // would say that someone does (docs/plans/active/sites-audit-fixes-plan.md,
    // 1.2 and F1). A fan-out query this company gave its first check is its own
    // asking, so its checks are read as a tracked search's are.
    const holdId = listHold(site);
    const dailyFrom = dailyPositionsKeptFrom(site.today);
    const weeklyBefore = args.step === "day" && args.from < dailyFrom ? dailyFrom : null;
    const charted: Array<{ keyword: string; tracked: boolean }> = [];
    for (const keyword of args.keywords.slice(0, MAX_CHARTED)) {
      if ((await holdSearch(ctx, holdId, keyword)) || (await holdFirstCheck(ctx, holdId, keyword))) {
        charted.push({ keyword, tracked: true });
        continue;
      }
      const ranked = await ctx.db
        .query("siteKeywordRanks")
        .withIndex("by_site_keyword", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place).eq("keyword", keyword))
        .first();
      if (ranked) charted.push({ keyword, tracked: false });
    }
    const checks = new Map<Id<"seoDataPulls">, Promise<boolean>>();
    const isCheck = (pullId: Id<"seoDataPulls">) => {
      const held = checks.get(pullId) ?? ctx.db.get(pullId).then((pull) => pull?.operationId === SEO_KEYWORD_CHECK_OPERATION);
      checks.set(pullId, held);
      return held;
    };
    return await Promise.all(charted.map(async ({ keyword, tracked }) => {
      const read = await ctx.db
        .query("seoKeywordPositions")
        .withIndex("by_website_keyword_place_day", (q) =>
          q.eq("websiteId", site.website._id).eq("keyword", keyword).eq("locationCode", site.place)
            .gte("day", args.from).lte("day", args.to))
        .take(DAYS_PER_SEARCH);
      const kept = tracked ? read : await Promise.all(read.map(async (row) => ((await isCheck(row.pullId)) ? null : row)));
      const rows = kept.filter((row): row is Doc<"seoKeywordPositions"> => row !== null);
      // One point per day: the better of two checks on the same day.
      const byDay = new Map<string, number | null>();
      for (const row of rows) {
        const held = byDay.get(row.day);
        const position = row.position ?? null;
        if (held === undefined || (position !== null && (held === null || position < held))) byDay.set(row.day, position);
      }
      // Then each day, week or month at its last day's position.
      const bySteps = new Map<string, { day: string; lastDay: string; position: number | null }>();
      for (const [day, position] of [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        bySteps.set(bucketOf(day, args.step), { day: bucketOf(day, args.step), lastDay: day, position });
      }
      return { keyword, points: [...bySteps.values()], weeklyBefore };
    }));
  },
});
