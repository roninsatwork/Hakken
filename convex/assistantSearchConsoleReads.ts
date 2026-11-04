import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { holdFor } from "./assistantReads";
import type { SiteReader } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { readPerformance } from "./searchConsoleReads";
import { readList } from "./searchConsoleLists";
import { namedRows } from "./searchConsolePeriodBooks";
import { readCurve, readNewLost, readUpdates } from "./searchConsoleChanges";
import { readDemand } from "./searchConsoleDemand";
import { readVolatility } from "./searchConsoleVolatility";
import { SEARCH_CONSOLE_SCREENS, SEARCH_CONSOLE_SEGMENT } from "./utils/searchConsoleAskScreens";
import type { ListRow } from "./utils/searchConsoleViews";
import { calendarPeriodValidator, periodSpan, spanBefore, stepOf, ukDay } from "./utils/calendarPeriods";

/**
 * Every Search Console chart page, as Ask Hakken reads it (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6:
 * "Ask Hakken reads only the website's totals and can't read a keyword at all"). Each screen is read through the very
 * function its page reads through (`readPerformance`, `readList`, `readCurve`, `readDemand`, `readUpdates`,
 * `readNewLost`, `readVolatility`), so a figure in an answer is the figure on the screen, with the screen's address to
 * check it. A search's and a page's own screens ask Google for their days when opened, so they are read here from the
 * ready-made list their row is in, beside the whole website's click rate at the same place: nothing asks Google. The
 * company is the conversation's, never one the model names.
 */

/** Rows an answer carries of a list: the most clicks first, as the screen opens. */
const ROWS = 25;
/** Days an answer carries day by day; a longer span goes by the week. */
const MOST_DAYS = 92;

const round = (value: number | null | undefined, places = 1) => (value === null || value === undefined ? null : Math.round(value * 10 ** places) / 10 ** places);
const percent = (share: number | null | undefined) => (share === null || share === undefined ? null : Math.round(share * 10000) / 100);
const reader = (ctx: Pick<QueryCtx, "db">, companyId: Id<"companies">): SiteReader => ({ db: ctx.db, companyId });

/** A list's row as the screens show it: clicks, times shown, the share clicked, the place, and their moves. */
const rowOf = (row: ListRow) => ({
  name: row.key,
  clicks: row.clicks,
  clicksBefore: row.previousClicks,
  timesShown: row.impressions,
  clickedPercent: percent(row.ctr),
  place: round(row.position),
  placeBefore: round(row.previousPosition),
  placesClimbed: round(row.positionChange),
  ...(row.brand !== null ? { brand: row.brand } : {}),
  band: row.band,
});

export const searchConsoleScreenInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    screen: v.union(...SEARCH_CONSOLE_SCREENS.map((screen) => v.literal(screen))),
    period: calendarPeriodValidator,
    /** A search's text, or a page's address, for the keyword and page screens. */
    key: v.optional(v.string()),
    /** Words to find in a list's searches or pages. */
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false, problem: found.problem };
    const hold = found.held.hold;
    const host = found.held.summary.host;
    if (isTrackedHold(hold)) {
      return { ok: false, problem: `Search Console covers the company's own websites only: Google gives those figures to a website's owner, and ${host} is a competitor. Its rankings can still be read from its Sites overview.` };
    }
    const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (!connection?.newestDay) return { ok: false, problem: `${host} has no Search Console figures yet: it is not connected, or its first collection has not finished.` };
    const span = periodSpan(args.period, ukDay(), connection.newestDay);
    if (!span) return { ok: false, problem: `Search Console hasn't sent any of this period's days yet for ${host}; its newest is ${connection.newestDay}. Ask about the period before.` };
    const { from, to } = span;
    const before = spanBefore(args.period, span);
    const period = args.period;
    const segment = SEARCH_CONSOLE_SEGMENT[args.screen];
    const keyPart = args.key && (args.screen === "keyword" || args.screen === "page") ? `&key=${encodeURIComponent(args.key)}` : "";
    const base = {
      ok: true,
      website: host,
      screen: args.screen,
      period,
      from,
      to,
      spanBefore: { from: before.from, to: before.to },
      figuresTo: connection.newestDay,
      link: `/app/search-console/${hold._id}${segment ? `/${segment}` : ""}?period=${period}${keyPart}`,
      rule: "These are the figures the screen shows, for Google's web results in the website's main home country. A click is a visit from Google, not a sale. Give them with the link, in plain words; never money.",
    };
    const site = reader(ctx, args.companyId);
    const ask = { searchType: "web" as const, from, to, period };

    if (args.screen === "performance") {
      const figures = await readPerformance(site, { siteId: hold._id, ...ask });
      const days = figures.days.length <= MOST_DAYS ? figures.days.map((day) => ({ day: day.day, clicks: day.clicks, timesShown: day.impressions, clickedPercent: percent(day.ctr), place: round(day.position) })) : null;
      const weeks = days ? null : byWeek(figures.days);
      // Days held of the span before: a span before held for far fewer days than these is no span before.
      const beforeWhole = figures.previous !== null && (figures.previousDays ?? 0) >= figures.days.length * (2 / 3);
      return {
        ...base,
        totals: figures.totals && { clicks: figures.totals.clicks, timesShown: figures.totals.impressions, clickedPercent: percent(figures.totals.ctr), place: round(figures.totals.position) },
        spanBeforeTotals: beforeWhole && figures.previous ? { clicks: figures.previous.clicks, timesShown: figures.previous.impressions, clickedPercent: percent(figures.previous.ctr), place: round(figures.previous.position) } : null,
        ...(figures.previous && !beforeWhole ? { note: `Only ${figures.previousDays ?? 0} of the span before's days are held, so it is not set against these dates.` } : {}),
        clicksFromSearchesGoogleNames: figures.named,
        ...(days ? { days } : { weeks }),
      };
    }

    if (args.screen === "ctrCurve") {
      const curve = await readCurve(site, { siteId: hold._id, searchType: "web", from, to });
      const point = (one: { position: number; keywords: number; impressions: number; clicks: number; ctr: number }) => ({ place: one.position, searches: one.keywords, timesShown: one.impressions, clicks: one.clicks, clickedPercent: percent(one.ctr) });
      return { ...base, ...(curve.preparing ? { note: "The figures are still being added up." } : {}), places: curve.points.map(point), spanBefore: { ...base.spanBefore, places: curve.before ? curve.before.map(point) : null } };
    }

    if (args.screen === "services") {
      const demand = await readDemand(site, { siteId: hold._id, period });
      if (!demand) return { ...base, services: [], note: "The figures are still being added up." };
      const nameOf = (row: (typeof demand.services)[number]) => (row.kind === "GUIDES" ? "Guides" : row.kind === "OTHER" ? (demand.classified ? "Pages not sorted yet" : "Other pages") : row.kind === "SERVICE" && row.id === "/" ? "Home page" : (row.kind === "SERVICE" ? row.name?.split("|")[0].trim() : row.name) || row.id);
      return {
        ...base,
        listFrom: demand.from,
        listTo: demand.to,
        services: demand.services.map((row) => ({ service: nameOf(row), timesShown: row.shown, timesShownBefore: row.shownBefore, clicks: row.clicks, clicksBefore: row.clicksBefore })),
      };
    }

    if (args.screen === "updates") {
      const answer = await readUpdates(site, { siteId: hold._id, searchType: "web", language: "en", from, to });
      const figures = (one: { clicks: number; impressions: number; position: number } | null) => (one ? { clicks: one.clicks, timesShown: one.impressions, place: round(one.position) } : null);
      return {
        ...base,
        updates: answer.updates.map((update) => ({
          update: update.title,
          startedOn: update.startedOn,
          finishedOn: update.finishedOn,
          state: update.state,
          the14DaysBefore: figures(update.before),
          the14DaysAfter: figures(update.after),
          ...("volatility" in update && update.volatility ? { volatilityBefore: update.volatility.before, volatilityDuring: update.volatility.during } : {}),
        })),
      };
    }

    if (args.screen === "newLost") {
      const answer = await readNewLost(site, { siteId: hold._id, ...ask, step: stepOf(period), sort: "when", direction: "desc", page: 1, rows: ROWS });
      return {
        ...base,
        counts: answer.counts,
        countsTheSpanBefore: answer.countsBefore ?? null,
        whereOnGoogle: answer.bands ?? null,
        byStep: answer.periods,
        newest: answer.rows.map((row) => ({ search: row.key, status: row.status, day: row.when, clicks: row.clicks, timesShown: row.impressions, place: round(row.position) })),
        watchedFrom: answer.watchedFrom,
      };
    }

    if (args.screen === "volatility") {
      const facts = await readVolatility(site, { siteId: hold._id, language: "en" });
      const moved = await readList(ctx, hold._id, { ...ask, dimension: "query", view: "volatility", sort: "movedBy", direction: "desc" });
      const rows = await namedRows(moved, moved.rows.slice(0, ROWS));
      return {
        ...base,
        note: "Volatility reads its own newest days whatever the period: the score is out of 10, against the website's own usual.",
        newestCompleteDay: facts.latest,
        usual: facts.usual,
        last7Days: facts.week,
        clicksLast7Days: facts.clicks,
        timesShownLast7Days: facts.impressions ?? null,
        googleUpdate: facts.update,
        mostMoved: rows.map(rowOf),
      };
    }

    // The lists: keywords, pages, brand and non-brand, position bands, and one search's or page's own row.
    const dimension = args.screen === "pages" || args.screen === "page" ? ("page" as const) : ("query" as const);
    const wanted = args.screen === "keyword" || args.screen === "page" ? args.key?.trim() : args.search?.trim();
    if ((args.screen === "keyword" || args.screen === "page") && !wanted) return { ok: false, problem: `Name the ${args.screen === "keyword" ? "search" : "page"} to read, as key.` };
    const list = await readList(ctx, hold._id, { ...ask, dimension, sort: "clicks", direction: "desc", ...(wanted ? { q: wanted } : {}) });
    if (list.live) return { ...base, note: "These dates are not a ready-made period: open the screen to read them." };
    if (list.preparing) return { ...base, note: "The figures are still being added up." };
    const rows = await namedRows(list, list.rows.slice(0, args.screen === "keyword" || args.screen === "page" ? 200 : ROWS));
    const summary = list.summary;
    const held = { listFrom: list.from, listTo: list.to, ...(list.from !== from || list.to !== to ? { listNote: `The list was last added up for ${list.from} to ${list.to}; opening the screen brings it up to date.` } : {}) };

    if (args.screen === "keyword" || args.screen === "page") {
      const lower = wanted!.toLowerCase();
      const row = rows.find((one) => one.key.toLowerCase() === lower) ?? rows.find((one) => one.key.toLowerCase().includes(lower)) ?? null;
      if (!row) return { ...base, ...held, found: null, note: `No ${args.screen === "keyword" ? "search" : "page"} matching "${wanted}" in these dates' list.` };
      // The whole website's click rate at the same place on Google: what this one is set against on its screen.
      const curve = await readCurve(site, { siteId: hold._id, searchType: "web", from, to });
      const place = Math.round(row.position);
      const websiteAtPlace = curve.points.find((point) => point.position === place) ?? null;
      return {
        ...base,
        ...held,
        found: rowOf(row),
        websiteAtTheSamePlace: websiteAtPlace ? { place, clickedPercent: percent(websiteAtPlace.ctr), timesShown: websiteAtPlace.impressions } : null,
        note: "Its days, countries and devices are asked of Google when its screen opens, so they are not here: open the link for them.",
      };
    }

    const whole = summary?.wholeList;
    return {
      ...base,
      ...held,
      totals: summary ? { searches: summary.rows, clicks: summary.clicks, clicksBefore: summary.previousClicks, timesShown: summary.impressions, place: round(summary.position) } : null,
      ...(args.screen === "brand" || args.screen === "keywords" ? { brandAndNonBrand: summary?.brand ?? null, mostMoved: whole?.movers ?? null } : {}),
      ...(args.screen === "bands" || args.screen === "keywords" ? {
        searchesInEachBand: summary?.bands ?? null,
        searchesInEachBandBefore: summary?.bandsBefore ?? null,
        clicksInEachBand: whole?.bandClicks ?? null,
        clicksInEachBandBefore: whole?.bandClicksBefore ?? null,
        intoAndOutOfTop3AndFirstPage: whole?.crossed ?? null,
      } : {}),
      rows: rows.map(rowOf),
      rowsListed: list.listed,
    };
  },
});

/** Days added up by the week (Monday to Sunday), for a span too long to give day by day. */
function byWeek(days: ReadonlyArray<{ day: string; clicks: number; impressions: number; position: number }>) {
  const weeks = new Map<string, { weekOf: string; days: number; clicks: number; timesShown: number; placeSum: number }>();
  for (const day of days) {
    const at = new Date(`${day.day}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
    const key = at.toISOString().slice(0, 10);
    const week = weeks.get(key) ?? { weekOf: key, days: 0, clicks: 0, timesShown: 0, placeSum: 0 };
    week.days += 1;
    week.clicks += day.clicks;
    week.timesShown += day.impressions;
    week.placeSum += day.position * day.impressions;
    weeks.set(key, week);
  }
  return [...weeks.values()].map((week) => ({ weekOf: week.weekOf, days: week.days, clicks: week.clicks, timesShown: week.timesShown, place: week.timesShown > 0 ? round(week.placeSum / week.timesShown) : null }));
}
