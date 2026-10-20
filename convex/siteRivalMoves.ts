import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { loadRivalHolds } from "./websiteSiteRows";
import { latestFigures, seriesFor } from "./siteFigures";
import { calendarPeriodValidator, periodSpan, spanBefore, ukDay, type CalendarPeriod } from "./utils/calendarPeriods";

/** A rival's rankings read for its moves: the most searched first. */
const RANKINGS_READ = 400;

/**
 * What a website's rivals did lately (docs/plans/active/insights-analyst-plan.md
 * phase 4, Visibility's Competitors gains rival moves): for each rival, the
 * searches it newly ranks for in the date menu's period among its most
 * searched (calendar-periods-plan.md, item 11.1: "Agree"), how many climbed
 * and fell at Google's last check, its biggest new search, and its visits at
 * the end of the period against the end of the period before — from the
 * rankings and figures Visibility already keeps. Rivals are checked once a
 * month, so a week between two checks has none: `checked` says whether one
 * fell in the period, and `lastCheck` when the newest was. What the Market
 * specialist reads as "a rival rising" (§3), shown where the rivals are.
 */
export const rivalMoves = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: calendarPeriodValidator },
  returns: v.array(v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    newSearches: v.number(),
    climbed: v.number(),
    fell: v.number(),
    biggestNew: v.union(v.null(), v.object({ keyword: v.string(), position: v.union(v.number(), v.null()), volume: v.number() })),
    visits: v.union(v.number(), v.null()),
    visitsBefore: v.union(v.number(), v.null()),
    checked: v.boolean(),
    lastCheck: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const today = ukDay();
    const span = periodSpan(args.period as CalendarPeriod, today, today) ?? { from: today, to: today, whole: false };
    const priorSpan = spanBefore(args.period as CalendarPeriod, span);
    const out = [];
    for (const rival of await loadRivalHolds(ctx, site)) {
      const website = await ctx.db.get(rival.websiteId);
      if (!website) continue;
      const ranks = await ctx.db.query("siteKeywordRanks").withIndex("by_site_volume", (q) => q.eq("websiteId", website._id).eq("locationCode", site.place)).order("desc").take(RANKINGS_READ);
      // New since the rival's first check, and within the period: a search held from the first check isn't news.
      const firstCheck = ranks.reduce((earliest, row) => (row.firstSeenDay < earliest ? row.firstSeenDay : earliest), today);
      const fresh = ranks.filter((row) => row.status !== "LOST" && row.firstSeenDay > firstCheck && row.firstSeenDay >= span.from && row.firstSeenDay <= span.to);
      const biggest = fresh[0] ?? null;
      const latest = await latestFigures(ctx, website._id, site.place);
      // A figure is the newest check's in a span: each month's last, so the span's last month holds it.
      const within = await seriesFor(ctx, website._id, site.place, span.from, span.to, "month");
      const before = await seriesFor(ctx, website._id, site.place, priorSpan.from, priorSpan.to, "month");
      out.push({
        siteId: rival._id,
        host: website.displayHost ?? website.host,
        newSearches: fresh.length,
        climbed: ranks.filter((row) => row.status === "UP").length,
        fell: ranks.filter((row) => row.status === "DOWN" || row.status === "LOST").length,
        biggestNew: biggest ? { keyword: biggest.keyword, position: biggest.position ?? null, volume: biggest.volume } : null,
        visits: typeof within.at(-1)?.estimatedTraffic === "number" ? Math.round(within.at(-1)!.estimatedTraffic as number) : null,
        visitsBefore: typeof before.at(-1)?.estimatedTraffic === "number" ? Math.round(before.at(-1)!.estimatedTraffic as number) : null,
        checked: within.length > 0,
        lastCheck: latest.lastDay,
      });
    }
    return out.sort((a, b) => b.newSearches - a.newSearches || b.climbed - a.climbed);
  },
});
