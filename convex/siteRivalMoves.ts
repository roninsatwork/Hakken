import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { loadRivalHolds } from "./websiteSiteRows";
import { latestFigures, seriesFor } from "./siteFigures";
import { shiftDay } from "./utils/insightFacts";

/** A rival's rankings read for its moves: the most searched first. */
const RANKINGS_READ = 400;
/** A search first seen within this many days is a new one. */
const NEW_DAYS = 30;

/**
 * What a website's rivals did lately (docs/plans/active/insights-analyst-plan.md
 * phase 4, Visibility's Competitors gains rival moves): for each rival, the
 * searches it newly ranks for in the last 30 days among its most searched,
 * how many climbed and fell at Google's last check, its biggest new search,
 * and its visits a month against the month before — from the rankings and
 * monthly figures Visibility already keeps. What the Market specialist reads
 * as "a rival rising" (§3), shown where the rivals are.
 */
export const rivalMoves = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    newSearches: v.number(),
    climbed: v.number(),
    fell: v.number(),
    biggestNew: v.union(v.null(), v.object({ keyword: v.string(), position: v.union(v.number(), v.null()), volume: v.number() })),
    visits: v.union(v.number(), v.null()),
    visitsBefore: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const today = new Date().toISOString().slice(0, 10);
    const since = shiftDay(today, -NEW_DAYS);
    const out = [];
    for (const rival of await loadRivalHolds(ctx, site)) {
      const website = await ctx.db.get(rival.websiteId);
      if (!website) continue;
      const ranks = await ctx.db.query("siteKeywordRanks").withIndex("by_site_volume", (q) => q.eq("websiteId", website._id).eq("locationCode", site.place)).order("desc").take(RANKINGS_READ);
      // New since the rival's first check, and within 30 days: a search held from the first check isn't news.
      const firstCheck = ranks.reduce((earliest, row) => (row.firstSeenDay < earliest ? row.firstSeenDay : earliest), today);
      const fresh = ranks.filter((row) => row.status !== "LOST" && row.firstSeenDay > firstCheck && row.firstSeenDay >= since);
      const biggest = fresh[0] ?? null;
      const latest = await latestFigures(ctx, website._id, site.place);
      const before = await seriesFor(ctx, website._id, site.place, shiftDay(today, -75), shiftDay(today, -31), "month");
      out.push({
        siteId: rival._id,
        host: website.displayHost ?? website.host,
        newSearches: fresh.length,
        climbed: ranks.filter((row) => row.status === "UP").length,
        fell: ranks.filter((row) => row.status === "DOWN" || row.status === "LOST").length,
        biggestNew: biggest ? { keyword: biggest.keyword, position: biggest.position ?? null, volume: biggest.volume } : null,
        visits: latest.metrics?.estimatedTraffic !== undefined ? Math.round(latest.metrics.estimatedTraffic) : null,
        visitsBefore: typeof before.at(-1)?.estimatedTraffic === "number" ? Math.round(before.at(-1)!.estimatedTraffic as number) : null,
      });
    }
    return out.sort((a, b) => b.newSearches - a.newSearches || b.climbed - a.climbed);
  },
});
