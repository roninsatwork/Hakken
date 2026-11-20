import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { holdFor } from "./assistantReads";
import type { SiteReader } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { readPerformance } from "./searchConsoleReads";
import { countryNameOf } from "./utils/countryCodes";
import { readList } from "./searchConsoleLists";
import { namedRows } from "./searchConsolePeriodBooks";
import { readCurve, readNewLost, readUpdates } from "./searchConsoleChanges";
import { readDemand } from "./searchConsoleDemand";
import { readLookMonths } from "./searchConsoleBreakdowns";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { readVolatility } from "./searchConsoleVolatility";
import { askIndexing } from "./searchConsoleIndexing";
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
      // Pages and a page's own screen follow the country too since 18 November 2026 (search-console-pages-way-1-plan).
      rule: "These are the figures the screen shows, for Google's web results in the website's main home country, its pages too. Google ties no page to the searches it keeps private, so the website's pages add up to fewer clicks than the country's own total. A click is a visit from Google, not a sale. Give them with the link, in plain words; never money.",
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
      const point = (one: { position: number; keywords: number; impressions: number; clicks: number; ctr: number }) => ({ position: one.position, searches: one.keywords, timesShown: one.impressions, clicks: one.clicks, clickedPercent: percent(one.ctr) });
      return {
        ...base,
        ...(curve.preparing ? { note: "The figures are still being added up." } : {}),
        positions: curve.points.map(point),
        spanBefore: { ...base.spanBefore, positions: curve.before ? curve.before.map(point) : null },
        // Mobile against desktop, as the screen's chart (Way 3, 20 November 2026): kept with the ready-made periods.
        onMobile: curve.devices ? curve.devices.mobile.map(point) : null,
        onDesktop: curve.devices ? curve.devices.desktop.map(point) : null,
        ...(curve.devices ? {} : { devicesNote: "Mobile and desktop aren't kept for these dates yet: open the screen to see them." }),
      };
    }

    if (args.screen === "appearance") {
      // Rich results (Way 3, 20 November 2026): each kind against the span before, every click beside them, and six months.
      const list = await readList(ctx, hold._id, { ...ask, dimension: "appearance", sort: "clicks", direction: "desc" });
      if (list.live) return { ...base, note: "These dates are not a ready-made period: open the screen to read them." };
      const figures = await readPerformance(site, { siteId: hold._id, ...ask });
      const months = await readLookMonths(ctx, hold, { searchType: "web" });
      const kinds = await namedRows(list, list.rows.slice(0, ROWS));
      return {
        ...base,
        kinds: kinds.map((row) => ({ kind: row.key, clicks: row.clicks, clicksBefore: row.previousClicks ?? null, timesShown: row.impressions, position: round(row.position), pages: row.count !== null && row.count >= 0 ? row.count : null })),
        everyClick: figures.totals?.clicks ?? null,
        everyClickBefore: figures.previous?.clicks ?? null,
        lastSixMonths: months.months.map((month) => ({ month: month.month.slice(0, 7), everyClick: month.clicks, kinds: month.looks })),
        rule: "Plain results are everyClick less the kinds' clicks. One page can show more than one kind, so never add the kinds' pages together.",
      };
    }

    if (args.screen === "services") {
      // Demand by Classification (search-console-demand-by-classification-way-2-plan-2026-11-18.md): the main home country's
      // own pages, by Classification, beside the country's own clicks, which they never add up to.
      const demand = await readDemand(ctx, hold._id, { from, to, period });
      if (!demand) return { ...base, classifications: [], note: "The home country's pages for these dates aren't added up yet: open the screen to see them." };
      const figures = await readPerformance(site, { siteId: hold._id, ...ask });
      const kinds = await readPageKinds(ctx, hold._id);
      const nameOf = (kind: string) => (kind === NOT_SORTED_KIND ? "Unclassified" : kinds?.nameOf(kind) ?? `${kind.charAt(0)}${kind.slice(1).toLowerCase().replace(/_/g, " ")}`);
      // Both sides of the gap worked out here, so an answer says them as figures (Ask Hakken's first answer on 18 November
      // 2026 said why the parts add up to less, but with no figure and a muddled share).
      const pageClicks = demand.rows.reduce((sum, row) => sum + row.clicks, 0);
      const countryClicks = figures.totals?.clicks ?? null;
      return {
        ...base,
        rule: `${base.rule} So the Classifications add up to fewer clicks than countryClicks: clicksOnPages is what Google tied to a page, and clicksFromSearchesGoogleKeepsPrivate is the rest. Say both as figures when asked why.`,
        listFrom: demand.from,
        listTo: demand.to,
        countryClicks,
        clicksOnPages: pageClicks,
        clicksFromSearchesGoogleKeepsPrivate: countryClicks === null ? null : Math.max(0, countryClicks - pageClicks),
        countryClicksBefore: demand.comparable ? (figures.previous?.clicks ?? null) : null,
        classifications: demand.rows.map((row) => ({ classification: nameOf(row.kind), timesShown: row.impressions, timesShownBefore: row.impressionsBefore, clicks: row.clicks, clicksBefore: row.clicksBefore, pages: row.pages })),
      };
    }

    if (args.screen === "indexing") {
      // Indexing (search-console-indexing-v1-plan-2026-11-18.md): Google's page checks, problems only, the reasons in
      // Google's own words with a plain line each; with a key, one reason's own page.
      const indexing = await askIndexing(ctx, hold._id, { from, to, period, ...(args.key ? { key: args.key } : {}) });
      const own = "link" in indexing && typeof indexing.link === "string" ? indexing.link : null;
      return {
        ...base,
        ...indexing,
        link: `/app/search-console/${hold._id}/${own ?? "indexing"}?period=${period}`,
        rule: `${base.rule} On Indexing every count is of the pages Google was asked about one at a time, up to 1,600 a day, never Google's own totals for the website, which it gives apps no way to read. Name each reason in Google's own words, then say what it means in plain words, as its means line does; say "in Google" rather than "indexed" in a sentence. Clicks and times shown follow the dates, the website's home country's own pages.`,
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
        // The chart's line day by day in the dates asked, each with its two parts (2026-11-20), complete days only.
        scoreEachDay: facts.days
          .filter((day) => day.week >= from && day.week <= to && facts.complete.has(day.week) && day.volatility !== undefined)
          .map((day) => ({ day: day.week, score: day.volatility, positionsImproved: day.volatilityUp ?? null, positionsDeclined: day.volatilityDown ?? null })),
        scoreEachDayNote: "The screen calls the two parts Positions improved (what the searches that climbed moved) and Positions declined (what those that fell moved), each out of 10 over every search counted: the two add up to the score. Only the days kept day by day have a score, and a day built before 20 November 2026 may have neither part.",
        mostMoved: rows.map(rowOf),
      };
    }

    if (args.screen === "places") {
      // Countries and devices (search-console-countries-and-devices-way-1-plan-2026-11-18.md), as the screen reads them:
      // every country Google showed the website in, and the devices in the main home country.
      const [countries, devices] = await Promise.all([
        readList(ctx, hold._id, { ...ask, dimension: "country", sort: "clicks", direction: "desc" }),
        readList(ctx, hold._id, { ...ask, dimension: "device", sort: "clicks", direction: "desc" }),
      ]);
      if (countries.live || devices.live) return { ...base, note: "These dates are not a ready-made period: open the screen to read them." };
      if (countries.preparing || devices.preparing) return { ...base, note: "The figures are still being added up." };
      // A list of rows read a part at a time (`ListRows`): sliced whole here, a few hundred countries at most.
      const countryRows = countries.rows.slice(0, countries.rows.length);
      const clickedCountries = countryRows.filter((row) => row.clicks > 0).length;
      return {
        ...base,
        rule: `${base.rule} The countries are every country Google showed the website in; the devices are the main home country's alone.`,
        countriesShown: countries.listed,
        countriesWithAClick: clickedCountries,
        countries: countryRows.slice(0, ROWS).map((row) => ({ ...rowOf(row), name: countryNameOf(row.key) ?? row.key.toUpperCase() })),
        devices: devices.rows.slice(0, devices.rows.length).map(rowOf),
      };
    }

    if (args.screen === "lowCtr") {
      // Shown but not clicked (search-console-shown-but-not-clicked-way-2-plan-2026-11-20.md), as the screen reads it: the
      // country's own pages that got fewer clicks than the website usually gets at their position, the most short first.
      const list = await readList(ctx, hold._id, { ...ask, dimension: "page", view: "lowCtr", inCountry: true, sort: "gap", direction: "desc" });
      if (list.live) return { ...base, note: "The home country's pages for these dates aren't added up yet: open the screen to see them." };
      if (list.preparing) return { ...base, note: "The figures are still being added up." };
      const rows = await namedRows(list, list.rows.slice(0, ROWS));
      const summary = list.summary;
      return {
        ...base,
        rule: `${base.rule} A page is listed when it got fewer clicks than the website usually gets at its position on Google, from Click rate by position. clicksUsually is what it would usually get there: the website's own past, never a promise.`,
        pagesListed: summary?.rows ?? null,
        pagesGoogleShowed: summary?.of ?? null,
        timesShown: summary?.impressions ?? null,
        clicks: summary?.clicks ?? null,
        clicksUsually: summary?.expected ?? null,
        eachPosition: summary?.lowCtr?.positions.map((one) => ({ position: one.position, pagesWithFewClicks: one.pages, clicks: one.clicks, clicksUsually: one.expected, everyPageThere: one.all })) ?? null,
        rows: rows.map((row) => ({ ...rowOf(row), clicksUsually: row.expected })),
        rowsListed: list.listed,
      };
    }

    if (args.screen === "competing") {
      // Keyword cannibalisation (search-console-keyword-cannibalisation-way-3-plan-2026-11-20.md), as the screen reads it: the
      // keywords on Insights' rule (`cannibalisationRule.ts`), the most shown first, with each one's Swaps where counted.
      const list = await readList(ctx, hold._id, { ...ask, dimension: "query", view: "competing", sort: "impressions", direction: "desc" });
      if (list.live) return { ...base, note: "These dates are not a ready-made period: open the screen to read them." };
      if (list.preparing) return { ...base, note: "The figures are still being added up." };
      const rows = await namedRows(list, list.rows.slice(0, ROWS));
      const summary = list.summary;
      const figures = summary?.cannibalisation;
      const keyword = (one: NonNullable<typeof figures>["busiest"]) => (one ? {
        keyword: one.key, pagesCompeting: one.count, timesShown: one.impressions, clicks: one.clicks,
        topPageSharePercent: Math.round(one.topShare * 1000) / 10, nextPageSharePercent: Math.round(one.nextShare * 1000) / 10, swaps: one.swaps,
      } : null);
      return {
        ...base,
        rule: `${base.rule} A keyword is listed when two or more of the website's pages each took at least 1 in 10 of its impressions, the home page and searches for the website's own name left out, as Insights' Keyword cannibalisation counts it. Swaps are the days Google swapped the page it showed most, counted for a month or less; null for longer dates. Which page should own a keyword is Insights' Keyword cannibalisation to say, never this screen.`,
        keywordsShared: summary?.rows ?? null,
        keywordsGoogleShowed: summary?.of ?? null,
        pagesCompeting: summary?.pagesInvolved ?? null,
        pagesGoogleShowed: summary?.pagesShown ?? null,
        timesShown: summary?.impressions ?? null,
        clicks: summary?.clicks ?? null,
        busiest: keyword(figures?.busiest ?? null),
        closestSplit: keyword(figures?.closest ?? null),
        mostPages: keyword(figures?.crowded ?? null),
        mostSwapped: keyword(figures?.mostSwapped ?? null),
        keywordsSwapped: figures?.swapped ?? null,
        rows: rows.map((row) => ({ ...rowOf(row), pagesCompeting: row.count, swaps: row.swaps ?? null })),
        rowsListed: list.listed,
      };
    }

    // The lists: keywords, pages, brand and non-brand, position bands, and one search's or page's own row.
    const dimension = args.screen === "pages" || args.screen === "page" ? ("page" as const) : ("query" as const);
    const wanted = args.screen === "keyword" || args.screen === "page" ? args.key?.trim() : args.search?.trim();
    if ((args.screen === "keyword" || args.screen === "page") && !wanted) return { ok: false, problem: `Name the ${args.screen === "keyword" ? "search" : "page"} to read, as key.` };
    // Pages and a page's own row: the country's own pages (`inCountry`), kept by the collector, as the screens read them.
    const list = await readList(ctx, hold._id, { ...ask, dimension, sort: "clicks", direction: "desc", ...(wanted ? { q: wanted } : {}), ...(dimension === "page" ? { inCountry: true } : {}) });
    if (list.live) return { ...base, note: dimension === "page" ? "The home country's pages for these dates aren't added up yet: open the screen to see them." : "These dates are not a ready-made period: open the screen to read them." };
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
    // Pages' boxes are the country's own figures, Performance's read: its pages share out only the clicks Google ties to a page.
    const boxes = args.screen === "pages" || args.screen === "brand" ? await readPerformance(site, { siteId: hold._id, ...ask }) : null;
    return {
      ...base,
      ...held,
      totals: summary ? { searches: summary.rows, clicks: summary.clicks, clicksBefore: summary.previousClicks, timesShown: summary.impressions, place: round(summary.position) } : null,
      ...(boxes ? {
        countryClicks: boxes.totals?.clicks ?? null,
        countryClicksBefore: boxes.previous?.clicks ?? null,
        // Ask Hakken's first answer on Pages (18 November 2026) called the pages' 1,946 "your entire website", beside 7,124.
        ...(args.screen === "pages"
          ? { pagesRule: "totals.clicks is only what Google tied to a page. The website's own clicks in the country are countryClicks, and the rest came from searches Google keeps private. Never call the pages' total the website's." }
          // Brand and non-brand's boxes count every click (Way 1, 20 November 2026): brand searches out of every 100 of countryClicks.
          : { brandRule: "brandAndNonBrand counts only the searches Google names. The screen's Out of every 100 clicks is brand clicks out of countryClicks, every click counted; the rest came from searches Google hides." }),
      } : {}),
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
