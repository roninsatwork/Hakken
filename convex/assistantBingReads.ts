import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { holdFor } from "./assistantReads";
import { isTrackedHold } from "./utils/websitePairing";
import { readCrawling, readList, readPerformance, shownRows } from "./bingWebmasterReads";
import { pathOfAddress } from "./utils/sees/analytics";
import { BING_SCREENS, type BingScreen } from "./utils/bingScreens";

/**
 * Every Bing Webmaster screen, as the Assistant reads it
 * (docs/plans/active/bing-webmaster-plan.md BW13: "Ask Hakken reads Bing's
 * figures"). Each screen is read through the very function its page reads
 * through (`readPerformance`, `readList`, `readCrawling`), so a figure in an
 * answer is the figure on the screen, with the screen's address to check it.
 * The company is the conversation's, never one the model names.
 */


/** Rows an answer carries of a list: the most clicks first, as the screen opens. */
const ROWS = 25;

const round = (value: number | null, places = 1) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places);
const percent = (share: number | null) => (share === null ? null : Math.round(share * 1000) / 10);

const SEGMENT: Record<BingScreen, string> = { performance: "", keywords: "keywords", pages: "pages", versus: "against-google", crawling: "crawling" };

export const bingWebmasterInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    screen: v.union(...BING_SCREENS.map((screen) => v.literal(screen))),
    days: v.union(v.literal(7), v.literal(30), v.literal(90), v.literal(182), v.literal(365)),
    /** Words to find in a list's keywords or pages. */
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem };
    const hold = found.held.hold;
    const host = found.held.summary.host;
    if (isTrackedHold(hold)) {
      return { ok: false, problem: `Bing Webmaster covers the company's own websites only, and ${host} is a competitor. Its rankings and AI answers can still be read from its Sites overview.` };
    }
    const connection = await ctx.db.query("bingConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (!connection?.newestDay) {
      return { ok: false, problem: `${host} has no Bing Webmaster figures yet: it is not connected, or its first collection has not finished.` };
    }
    const period = String(args.days) as "7" | "30" | "90" | "182" | "365";
    const link = `/app/bing-webmaster/${hold._id}${SEGMENT[args.screen] ? `/${SEGMENT[args.screen]}` : ""}?period=${period}`;
    const base = {
      ok: true,
      website: host,
      screen: args.screen,
      days: args.days,
      figuresTo: connection.newestDay,
      link,
      rule: "These are the figures the screen shows. Bing's figures cover every country; Google's beside them are the website's main home country's web results, from Search Console. Give them with the link, in plain words.",
    };

    if (args.screen === "performance") {
      const figures = await readPerformance(ctx, hold._id, args.days);
      if (!figures) return { ...base, figures: null };
      const share = figures.google && figures.totals.clicks + figures.google.clicks > 0 ? figures.totals.clicks / (figures.totals.clicks + figures.google.clicks) : null;
      return {
        ...base,
        from: figures.from,
        to: figures.to,
        bing: { clicks: figures.totals.clicks, impressions: figures.totals.impressions, clickThroughPercent: figures.totals.impressions > 0 ? round((figures.totals.clicks / figures.totals.impressions) * 100, 2) : null },
        google: figures.google
          ? { clicks: figures.google.clicks, impressions: figures.google.impressions, clickThroughPercent: figures.google.impressions > 0 ? round((figures.google.clicks / figures.google.impressions) * 100, 2) : null }
          : null,
        bingShareOfSearchClicksPercent: percent(share),
        weeks: figures.weeks.slice(-13),
      };
    }

    if (args.screen === "crawling") {
      const crawling = await readCrawling(ctx, hold._id, args.days);
      if (!crawling) return { ...base, crawling: null };
      return {
        ...base,
        from: crawling.from,
        to: crawling.to,
        pagesRead: crawling.totals.crawled,
        errors: crawling.totals.errors,
        blockedByRobotsTxt: crawling.totals.blocked,
        moneyPages: crawling.pages.map((page) => ({
          page: page.title ? `${page.title} — ${page.page}` : page.page,
          inBingsIndex: page.inIndex,
          lastReadByBing: page.lastRead,
          lastReadByGoogle: page.googleLastRead,
        })),
      };
    }

    const list = await readList(ctx, hold._id, {
      list: args.screen === "pages" ? "page" : "query",
      // Bing against Google is the 90 days, Search Console's comparable period.
      period: args.screen === "versus" ? "90" : period,
      ...(args.search ? { q: args.search } : {}),
      sort: args.screen === "versus" ? "gap" : "clicks",
    });
    return {
      ...base,
      from: list.from,
      to: list.to,
      summary: {
        rows: list.summary.rows,
        onBothEngines: list.summary.onBoth,
        bingRanksHigher: list.summary.bingHigher,
        googleRanksHigher: list.summary.googleHigher,
        onlyOnBing: list.summary.onlyBing,
      },
      rows: (await shownRows(ctx, hold._id, args.screen === "pages" ? "page" : "query", list.rows.slice(0, ROWS), list.names)).map((row) => ({
        name: args.screen === "pages" ? pathOfAddress(row.key) : row.key,
        clicks: row.clicks,
        impressions: row.impressions,
        clickThroughPercent: row.ctr === null ? null : round(row.ctr * 100, 2),
        position: round(row.position),
        googleClicks: row.googleClicks,
        googlePosition: round(row.googlePosition),
        fewImpressions: row.impressions < 10,
      })),
    };
  },
});
