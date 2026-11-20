import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { bandsSeesData, bandsSeesRows } from "./own/searchConsoleBands";
import { lowCtrSeesData } from "./own/searchConsoleLowCtr";
import { cannibalisationSeesData } from "./own/searchConsoleCannibalisation";
import { readFixture } from "@/src/test/readFixture";
import { findingWords, type Finding } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";
import { performanceSplits, type PerformanceRaw } from "@/src/app/(dashboard)/app/search-console/_components/performanceSees";
import { keywordBands } from "@/src/app/(dashboard)/app/search-console/_components/keywordSees";
import { placesPageData, type PlaceRow } from "@/src/app/(dashboard)/app/search-console/_components/placesSees";
import { demandPageData, demandParts } from "@/src/app/(dashboard)/app/search-console/_components/demandSees";
import type { DemandRow } from "@/convex/utils/searchConsoleDemand";
import { countryName } from "@/src/app/(dashboard)/app/search-console/_components/countries";
import type { ListRow } from "@/src/app/(dashboard)/app/search-console/_components/SearchConsoleTables";
import { tickedUpdateOf, trackedPageData } from "@/src/app/(dashboard)/app/search-console/_components/trackedSees";
import { figuresOf, shapeRows, trackedListOf, withTracked, type SourceRow } from "../searchConsoleViews";
import { pageName } from "./own/searchConsolePages";

const performance = readFixture("moreHandlesSearchConsolePerformance");
const keywords = readFixture("moreHandlesSearchConsoleKeywords");
const curve = readFixture("moreHandlesSearchConsoleCurve");
const updates = readFixture("moreHandlesSearchConsoleUpdates");
const newLost = readFixture("moreHandlesSearchConsoleNewLost");
const devices = readFixture("moreHandlesSearchConsoleDevices");
const volatility = readFixture("moreHandlesSearchConsoleVolatility");
const roninsPerformance = readFixture("roninsSearchConsolePerformance");
const splitsRead = readFixture("moreHandlesSearchConsolePerformanceSplits") as Record<string, unknown>;
/** "more handles" on its own screen, as Google answered on 17 November 2026: its figures and every page shown for it. */
const keywordScreen = readFixture("moreHandlesSearchConsoleKeywordScreen") as Record<string, unknown>;
/** Position bands' list and chart for every period, the United Kingdom, read on dev on 19 November 2026. */
const positionBands = readFixture("moreHandlesSearchConsolePositionBands") as { periods: Record<string, { summary: unknown; rows: unknown[]; chart: Array<{ start: string }> }> };
/** Shown but not clicked's list for every period, the United Kingdom, read on dev on 20 November 2026 (no asks of Google). */
const lowCtr = readFixture("moreHandlesSearchConsoleLowCtr") as { kindNames: Record<string, string>; periods: Record<string, { summary: unknown; rows: unknown[] }> };
const cannibalisation = readFixture("moreHandlesSearchConsoleCannibalisation") as { periods: Record<string, { summary: unknown; rows: unknown[] }> };
const appearance = readFixture("moreHandlesSearchConsoleAppearance") as { periods: Record<string, Record<string, unknown>> };
/** The United Kingdom's own pages, each against its dates before, and its own figures, as Google answered on 18 November 2026. */
const pagesRead = readFixture("moreHandlesSearchConsolePages") as Record<string, unknown>;
const pageScreen = readFixture("moreHandlesSearchConsolePageScreen") as Record<string, unknown>;
/** Every country, and the United Kingdom's devices, each against its dates before, as Google answered on 18 November 2026. */
const placesRead = readFixture("moreHandlesSearchConsolePlaces") as Record<string, unknown>;
/** The United Kingdom's pages by Classification, each against its dates before, and its own figures, as Google answered on 18 November 2026. */
const demandRead = readFixture("moreHandlesSearchConsoleDemand") as {
  kindNames: Record<string, string>;
  periods: Record<string, { from: string; to: string; comparable: boolean; rows: DemandRow[]; totals: { clicks: number; impressions: number } | null; previous: { clicks: number; impressions: number } | null }>;
};

/**
 * Search Console's own findings on every period its date menu offers, on More Handles' own figures as its reads answered
 * them on 3 November 2026 (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6; Anthony, 2026-11-03: "we have a
 * date selection picker FFS … please add this to your tests and your rules"). Each page's figures are built here the
 * way the page builds them for its eye (`SearchConsoleSees`, with its words), then cut as the eye cuts them.
 *
 * What the saved figures held that day, so the expectations below make sense:
 * - This week has no days on 3 November (Google's newest is Sunday 1 November): the pages show a line, not figures, and
 *   have no eye of their own. This month is one day, set against 1 October.
 * - The ready-made lists (Brand, Position bands, Click rate, Demand by service) were last added up on 30 October and wait
 *   for a screen to open them: "Last month" holds September against August. Real figures all the same.
 * - morehandles.co.uk's days are held from 23 April 2026, though its connection says 11 June 2025: Last 6 months' span
 *   before holds 9 days of 181, and Last 12 months has none. The rules call no such span a span before (`fairBefore`)
 *   and set the newest weeks against those before them instead.
 */

type Period = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last3Months" | "last6Months" | "last12Months";
const WHOLE: Period[] = ["lastWeek", "lastMonth", "last3Months"];
const NO_FAIR_BEFORE: Period[] = ["last6Months", "last12Months"];
const ALL: Period[] = [...WHOLE, "thisMonth", ...NO_FAIR_BEFORE];
type Fixture = Record<string, unknown>;
const at = (fixture: unknown, period: Period) => (fixture as Record<Period, Fixture>)[period];

/** The words `SearchConsoleSees` hands every page, in English: what each period is set against, and the page's names. */
const BEFORE: Record<Period, string> = {
  thisWeek: "The same days last week", lastWeek: "The week before", thisMonth: "The same days last month", lastMonth: "The month before", last3Months: "The 3 months before",
  last6Months: "The 6 months before", last12Months: "The 12 months before",
};
const wordsFor = (period: Period) => ({
  before: BEFORE[period], website: "The whole website", clicks: "Clicks", shown: "Times shown", weekends: "At weekends", weekdays: "On weekdays",
  recent: "The last 28 days", earlier: "The 28 days before", before7: "The 7 days before",
  "recent.7": "The last 7 days", "recent.4": "The last 4 weeks", "recent.3": "The last 3 months",
  "earlier.7": "The days before", "earlier.4": "The weeks before", "earlier.3": "The months before",
  "average.7": "A day on average", "average.4": "A week on average", "average.3": "A month on average",
});
/** A day as the chart names it ("Sat 31 Oct"), a month by its name. */
const dayName = (start: string, step: string) => new Date(`${start}T12:00:00Z`).toLocaleDateString("en-GB", step === "month" ? { month: "long", year: "numeric", timeZone: "UTC" } : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const STEP: Record<Period, string> = { thisWeek: "day", lastWeek: "day", thisMonth: "day", lastMonth: "day", last3Months: "week", last6Months: "week", last12Months: "month" };

const PRINT = process.env.PRINT_SEES === "1";
function said(screen: string, period: Period, data: Fixture): string[] {
  expectEyeHolds(screen, { ...data, words: wordsFor(period) });
  const findings: Finding[] = pageFindings(screen, pageDataFor({ ...data, words: wordsFor(period) }, screen));
  const lines = findings.map(findingWords);
  if (PRINT) console.log(`\n${screen} · ${period}\n  ${lines.join("\n  ")}`);
  return lines;
}

/** Never Hakken's housekeeping, never money, never a code or an id for a name. */
function clean(lines: string[]) {
  for (const line of lines) {
    expect(line, lines.join("\n")).not.toMatch(/Not sorted|UNJUDGED|\bOTHER\b/);
    expect(line, lines.join("\n")).not.toMatch(/£|\$|revenue|worth|cost/i);
    expect(line, lines.join("\n")).not.toMatch(/\b[0-9a-z]{32}\b|~[0-9a-z]+/);
  }
}

// ── The pages' figures, built as each page builds them ─────────────────────────────────────────────────────────────

const PLACE_NAMES = { firstPage: "Google's first page", secondPage: "Google's second page", topThree: "Places 1 to 3", fourToTen: "Places 4 to 10" };
const BAND_NAMES = { "1-3": "Top 3", "4-10": "4–10", "11-20": "11–20", "21-50": "21–50", "51+": "51 and below" };

const performancePage = (period: Period) => ({ ...at(performance, period), names: { brand: "Brand", other: "Non-brand" } });

/**
 * Performance with its charts (search-console-performance-way-3-plan-2026-11-17.md): the charts' figures as the page
 * builds them (`performanceSplits`), from its reads as they answered on 17 November 2026, beside the boxes and the day
 * chart of 3 November. Classifications are named as the page names them; pages not sorted yet never are.
 */
const KIND_NAMES = (splitsRead.kindNames ?? {}) as Record<string, string>;
const DEVICE_NAMES: Record<string, string> = { DESKTOP: "Desktop", MOBILE: "Mobile", TABLET: "Tablet" };
const chartsPage = (period: Period) => ({
  ...at(performance, period),
  splits: performanceSplits(at(splitsRead, period) as unknown as PerformanceRaw, {
    kind: (key) => KIND_NAMES[key] ?? null,
    device: (key) => DEVICE_NAMES[key] ?? key,
    look: (key) => key.toLowerCase().replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase()),
    quiet: (line, rate) => `${line.toLocaleString("en-GB")} impressions or more, and under ${rate.toFixed(1)} clicks for every 100`,
  }),
  names: { brand: "Brand", other: "Non-brand", hidden: "Searches Google hides", allPages: "All your pages" },
});
const keywordsPage = (period: Period, names: Record<string, string>) => {
  const list = at(keywords, period) as { summary: unknown; rows: unknown[]; chart: unknown[] };
  return { summary: list.summary, rows: list.rows, picked: true, chart: (list.chart as Array<{ start: string }>).map((one) => ({ ...one, day: one.start })), names };
};
/**
 * Keywords (search-console-keywords-way-2-plan-2026-11-17.md): the list, as Position bands and Brand and non-brand read it,
 * the whole website's clicks from its boxes, and "door handles" ticked onto the chart with its clicks against the span before
 * (the figures its own screen's test uses). The saved list and the website's days were read on different days, so on This
 * month the list holds more clicks than the website's one day: no line about hidden searches there.
 */
const KEYWORD_NAMES = { ...BAND_NAMES, brand: "Brand", other: "Non-brand", hidden: "Searches Google hides" };
const keywordsListPage = (period: Period) => {
  const list = at(keywords, period) as { summary: unknown; rows: unknown[] };
  const website = (at(performance, period) as { totals: { clicks: number } }).totals;
  return { summary: list.summary, rows: list.rows, picked: true, website: { clicks: website.clicks }, ticked: [{ name: "door handles", clicks: 38, previousClicks: 22 }], names: KEYWORD_NAMES };
};
/**
 * Pages (search-console-pages-way-1-plan-2026-11-17.md), following the country menu since 18 November 2026: the United
 * Kingdom's own pages as the page's read asked Google for them that day (`inCountry`), with the span before's totals, the
 * pages clicked, the few that make half the clicks and the two that moved most; the country's own clicks, the boxes'; the
 * home page ticked onto the chart with its own clicks against the span before's, as its row has them; and the names the
 * page says things by. Google tied only 1,946 of the United Kingdom's 7,124 October clicks to a page. That day More
 * Handles' Last 6 months and Last 12 months have no span before: Google has no figures for it from 11 August 2025 to 22
 * April 2026 (`googleHasSpan`), and the 12 months before are past its sixteen.
 */
const PAGES_NAMES = {
  allPages: "All your pages", clicked: "Pages that got a click", half: "Pages that make half your clicks", home: "Home page", hidden: "Searches Google hides",
  kinds: (pagesRead.kindNames ?? {}) as Record<string, string>,
};
const pagesPage = (period: PlacesPeriod) => {
  const list = at(pagesRead, period as Period) as { summary: unknown; rows: unknown[]; comparable: boolean; website: { clicks: number }; home: { clicks: number; previousClicks: number | null } };
  return { summary: list.summary, rows: list.rows, picked: true, website: { clicks: list.website.clicks }, ticked: [{ name: "Home page", ...list.home }], names: PAGES_NAMES };
};
const curvePage = (period: Period) => {
  const { points, before } = at(curve, period) as { points: Array<{ position: number }>; before: Array<{ position: number }> | null };
  const placed = (list: Array<{ position: number }>) => list.map((point) => ({ ...point, name: `Place ${point.position}` }));
  return { points: placed(points), before: before ? placed(before) : null, names: PLACE_NAMES };
};
type Update = { title: string; startedOn: string; finishedOn: string | null; state: string; before: { clicks: number; position: number } | null; after: { clicks: number; position: number } | null; volatility?: { before: number | null; during: number | null } };
const updatesPage = (period: Period) => ({
  updates: (at(updates, period).updates as Update[]).map((update) => ({
    key: update.title, title: update.title, startedOn: update.startedOn, finishedOn: update.finishedOn, state: update.state,
    beforeClicks: update.before?.clicks ?? null, afterClicks: update.after?.clicks ?? null,
    change: update.before && update.after ? update.after.clicks - update.before.clicks : null,
    beforePosition: update.before?.position ?? null, afterPosition: update.after?.position ?? null,
    moved: update.before && update.after ? update.before.position - update.after.position : null,
    volatilityBefore: update.volatility?.before ?? null, volatilityDuring: update.volatility?.during ?? null,
  })),
  days: at(performance, period),
  names: { beforeIt: "Before it" },
});
const newLostPage = (period: Period) => {
  const answer = at(newLost, period);
  const periods = (answer.periods as Array<{ start: string }>).map((one) => ({ ...one, day: one.start, name: dayName(one.start, STEP[period]) }));
  return { counts: answer.counts, countsBefore: answer.countsBefore, watchedFrom: answer.watchedFrom, bands: answer.bands, periods, rows: answer.rows, picked: true, names: { lostFirstPage: "Lost from Google's first page", newFirstPage: "New on Google's first page" } };
};
const volatilityPage = () => ({
  ...(volatility as Fixture),
  chart: ((volatility as Fixture).chart as Array<{ start: string }>).map((one) => ({ ...one, day: one.start })),
  picked: true,
  names: { latest: "Thu 29 Oct", usual: "Your usual", last7: "The last 7 days", week7Before: "The 7 days before", climbed5: "Climbed 5 places or more", fell5: "Fell 5 places or more", beforeIt: "Before it", dayBefore: "The day before" },
});

/**
 * A search's and a page's own screens ask Google for their days, countries, devices and other side when they open, and
 * keep nothing, so their own figures here are written by hand in the reads' shapes (`searchConsoleKeySeries`,
 * `searchConsoleKeySplits`, `searchConsoleLiveList`), from "door handles"' row in More Handles' list; the whole website's
 * click curve and devices beside them are its own, as read.
 */
const website = (period: Period) => ({
  curve: (at(curve, period).points as Array<{ position: number }>).map((point) => ({ ...point, name: `The whole website at place ${point.position}` })),
  devices: (at(devices, period) as unknown as Array<{ key: string; clicks: number; impressions: number }>).map((row) => ({ ...row, name: row.key === "MOBILE" ? "Mobile" : row.key === "DESKTOP" ? "Desktop" : "Tablet" })),
});
const keywordPage = (period: Period) => ({
  name: "door handles", keyword: "door handles",
  figures: { days: [], totals: { clicks: 38, impressions: 12208, ctr: 0.0031, position: 12.94 }, previous: { clicks: 22, impressions: 11050, ctr: 0.002, position: 13.62 }, previousHeld: true },
  cameFrom: { devices: [{ key: "MOBILE", name: "Mobile", clicks: 31, impressions: 9100, share: 0.8158 }, { key: "DESKTOP", name: "Desktop", clicks: 7, impressions: 3108, share: 0.1842 }] },
  rows: [
    { key: "https://www.morehandles.co.uk/door-handles.html", name: "/door-handles.html", clicks: 24, impressions: 9800, ctr: 0.0024, position: 12.1, previousClicks: 15, change: 9 },
    { key: "https://www.morehandles.co.uk/handles.html", name: "/handles.html", clicks: 11, impressions: 2100, ctr: 0.0052, position: 16.4, previousClicks: 5, change: 6 },
    { key: "https://www.morehandles.co.uk/lever-handles.html", name: "/lever-handles.html", clicks: 3, impressions: 308, ctr: 0.0097, position: 21.2, previousClicks: 2, change: 1 },
  ],
  picked: true,
  website: website(period),
});
/** A page as the table and the bands name it: its address on the website. */
const pagePath = (key: string) => key.replace(/^https?:\/\/[^/]+/, "") || "/";
/** A keyword's own screen, Way 2 (search-console-keyword-screen-way-2-plan-2026-11-17.md), on "more handles"' own figures. */
const keywordScreenPage = (period: Period) => {
  const one = at(keywordScreen, period) as unknown as { figures: Fixture; pages: ListRow[] };
  const byClicks = [...one.pages].sort((left, right) => right.clicks - left.clicks).slice(0, 25);
  return {
    name: "more handles", keyword: "more handles",
    figures: { days: [], ...one.figures },
    bands: keywordBands(one.pages, pagePath, (count) => `The other ${count}`),
    rows: byClicks.map((row) => ({ ...row, name: pagePath(row.key) })),
    picked: true,
    website: website(period),
  };
};

/**
 * A page's own screen, the keyword screen's Way 2 turned round (Anthony, 17 November 2026: "just build it"), on the tubular
 * latch guide's own figures and keywords as its reads answered that day: every country's figures, and each keyword Google
 * showed it for, with its clicks the span before where Google has them.
 */
const PAGE_SCREEN_KEY = "https://www.morehandles.co.uk/blog/tubular-latch-guide-choosing-right-latch/";
const pageScreenPage = (period: Period) => {
  const one = at(pageScreen, period) as unknown as { figures: Fixture; keywords: Array<[string, number, number, number, number | null]> };
  const rows = one.keywords.map(([key, clicks, impressions, position, previousClicks]) => ({
    key, clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position, previousClicks, change: previousClicks === null ? null : clicks - previousClicks,
  })) as unknown as ListRow[];
  const byClicks = [...rows].sort((left, right) => right.clicks - left.clicks).slice(0, 25);
  return {
    name: pagePath(PAGE_SCREEN_KEY), page: PAGE_SCREEN_KEY,
    figures: { days: [], ...one.figures },
    bands: keywordBands(rows, (key) => key, (count) => `The other ${count}`),
    rows: byClicks.map((row) => ({ ...row, name: row.key })),
    picked: true,
    website: website(period),
    names: { clicked: "Keywords that got a click" },
  };
};

/**
 * Countries and devices (search-console-countries-and-devices-way-1-plan-2026-11-18.md): every country Google showed More
 * Handles in, the United Kingdom chosen in the menu, its devices, and the three busiest countries after it ticked onto the
 * chart, each country's clicks before as the ticked series answers them. Built as the page builds them (`placesPageData`),
 * with its English names. On 18 November 2026 Google had Monday 16 November as its newest day, so This week is one day;
 * Last 6 months and Last 12 months have no dates before (Google has no figures for the website from 11 August 2025 to
 * 22 April 2026).
 */
type PlacesPeriod = Period | "thisWeek";
const PLACES_PERIODS: PlacesPeriod[] = ["thisWeek", ...ALL];
const englishName = (code: string) => countryName(code, "en") ?? "Unknown";
const DEVICE_WORDS: Record<string, string> = { MOBILE: "Mobile", DESKTOP: "Desktop", TABLET: "Tablet" };
type PlacesList = { comparable: boolean; summary: { clicks: number; beforeTotals: { clicks: number } | null; clickedBefore: number | null }; rows: PlaceRow[] };
const placesPage = (period: PlacesPeriod) => {
  const read = (placesRead as Record<PlacesPeriod, { countries: PlacesList; devices: PlacesList }>)[period];
  const countries = read.countries.rows.map((row) => ({ ...row, name: englishName(row.key) }));
  const devices = read.devices.rows.map((row) => ({ ...row, name: DEVICE_WORDS[row.key] ?? row.key }));
  const ticked = [...countries].filter((row) => row.key !== "gbr" && row.clicks > 0).sort((left, right) => right.clicks - left.clicks).slice(0, 3)
    .map((row) => ({ name: row.name, clicks: row.clicks, previousClicks: read.countries.comparable ? (row.previousClicks ?? 0) : null }));
  return placesPageData({
    chosen: "gbr", countries, summary: read.countries.summary, comparable: read.countries.comparable,
    devices, devicesComparable: read.devices.comparable, ticked,
    names: {
      chosen: "United Kingdom", others: "Other countries", clicked: "Countries with a click",
      devices: Object.fromEntries(devices.map((row) => [row.key, `${row.name} in the United Kingdom`])),
    },
  });
};

/**
 * Demand by Classification (search-console-demand-by-classification-way-2-plan-2026-11-18.md): the United Kingdom's own
 * pages by Classification, as Google answered on 18 November 2026 (one ask for each period and its dates before), and its
 * own figures, the boxes'. The Classifications share out only the clicks Google tied to a page. Built as the page builds
 * them (`demandParts`, `demandPageData`), with its English names. Last 6 months and Last 12 months have no dates before.
 */
const demandPage = (period: PlacesPeriod) => {
  const one = demandRead.periods[period];
  const parts = demandParts(one.rows, one.previous, one.comparable, {
    kind: (kind) => (kind === "NOT_SORTED" ? "Unclassified" : demandRead.kindNames[kind] ?? kind),
    sorted: (kind) => kind !== "NOT_SORTED",
  });
  return demandPageData({ parts, totals: one.totals, previous: one.previous, names: { others: "The other Classifications", allPages: "All your pages", hidden: "Searches Google hides" } });
};

// ── Each page, on every period ─────────────────────────────────────────────────────────────────────────────────────

describe("Search Console finds the biggest things on every period the date menu offers (More Handles, 3 November 2026)", () => {
  test.each(ALL)("Overview: %s", (period) => {
    const lines = said("searchConsole.performance", period, performancePage(period));
    clean(lines);
    if (WHOLE.includes(period) || period === "thisMonth") {
      // Its headline: the whole website's clicks against the span before.
      expect(lines.some((line) => line.startsWith("The whole website: clicks")), lines.join("\n")).toBe(true);
      expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(period === "thisMonth" ? 2 : 4);
    } else {
      // No fair span before: never a rise of 1,800% on 9 days, the newest 28 days against the 28 before instead.
      expect(lines.some((line) => line.startsWith("The whole website: clicks")), lines.join("\n")).toBe(false);
      expect(lines.some((line) => line.startsWith("The last 28 days: clicks a day")), lines.join("\n")).toBe(true);
      expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(3);
    }
  });

  test.each(ALL)("Performance's charts: %s", (period) => {
    const lines = said("searchConsole.performance", period, chartsPage(period));
    clean(lines);
    // The charts' own findings, two or more on every period: the squares' searches Google hides, a Classification's
    // clicks or click rate, a device, or the dots' group Google shows a lot but people seldom click.
    const charts = lines.filter((line) => /^Searches Google hides|for All your pages\.$| impressions or more, and under [\d.]+ clicks for every 100 |^(Mobile|Desktop|Tablet):|^(Handles|Hinges|Cupboard Handles|Window Furniture|Other Ironmongery|Blog|Door Knobs|Lighting|Brand|Buy By Brand|Locks|Electrical): clicks (up|down)/.test(line));
    expect(charts.length, lines.join("\n")).toBeGreaterThanOrEqual(2);
    // A Classification's clicks against the span before, only where that span is fair.
    const classMoved = lines.some((line) => /^(Handles|Hinges|Cupboard Handles|Window Furniture|Other Ironmongery|Blog|Door Knobs|Lighting|Brand|Buy By Brand|Locks|Electrical): clicks (up|down)/.test(line));
    if (NO_FAIR_BEFORE.includes(period)) expect(classMoved, lines.join("\n")).toBe(false);
    // The headline still leads where there's a fair span before.
    if (WHOLE.includes(period)) expect(lines[0], lines.join("\n")).toMatch(/^The whole website: clicks (up|down)/);
  });

  test.each(ALL)("Brand and non-brand: %s", (period) => {
    const lines = said("searchConsole.brand", period, keywordsPage(period, { brand: "Brand", other: "Non-brand" }));
    clean(lines);
    // Brand searches are clicked far more often than the rest, on every period.
    expect(lines.some((line) => line.startsWith("Brand: clicks for every 1,000 times shown") || line.startsWith("Brand: share clicked")), lines.join("\n")).toBe(true);
    if (period === "last6Months" || period === "last12Months") {
      expect(lines.some((line) => /^Non-brand: clicks (up|down)/.test(line)), lines.join("\n")).toBe(false);
      expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(2);
    } else {
      expect(lines.some((line) => /^Non-brand: clicks (up|down)/.test(line)), lines.join("\n")).toBe(true);
      expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
    }
  });

  test.each(ALL)("Click rate by position: %s", (period) => {
    const lines = said("searchConsole.ctrCurve", period, curvePage(period));
    clean(lines);
    expect(lines.some((line) => line.startsWith("Place 1: ")), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test.each(ALL)("Google updates: %s", (period) => {
    const page = updatesPage(period);
    const lines = said("searchConsole.updates", period, page);
    clean(lines);
    if (page.updates.some((update) => update.state === "done" && update.beforeClicks !== null)) {
      // An update with its days either side: what it did to the clicks is the headline.
      expect(lines.some((line) => /update: clicks (up|down)/.test(line)), lines.join("\n")).toBe(true);
    }
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(period === "thisMonth" ? 2 : 3);
  });

  test.each(ALL)("A search's own screen: %s", (period) => {
    const lines = said("searchConsole.keyword", period, keywordPage(period));
    clean(lines);
    expect(lines[0], lines.join("\n")).toMatch(/^door handles: clicks up/);
    // Two of the website's pages split the search: the second holds near a third of its clicks.
    expect(lines.some((line) => line.startsWith("/handles.html holds")), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test.each(ALL)("A keyword's own screen, on its own figures: %s", (period) => {
    const page = keywordScreenPage(period);
    const lines = said("searchConsole.keyword", period, page);
    clean(lines);
    // The bands: the page that took most of its clicks, with how many pages Google showed and how many got a click.
    const top = page.bands.parts.filter((part) => part.key !== "rest").sort((left, right) => right.clicks - left.clicks)[0];
    expect(lines.some((line) => line.startsWith(`${top.name} holds`)), lines.join("\n")).toBe(true);
    // Where the clicks came from is gone from the screen, so the eye never says a country or a device.
    expect(lines.some((line) => /Mobile|Desktop|Tablet|United Kingdom/.test(line)), lines.join("\n")).toBe(false);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(2);
  });

  test.each(ALL)("A page's own screen, on its own figures: %s", (period) => {
    const page = pageScreenPage(period);
    const lines = said("searchConsole.page", period, page);
    clean(lines);
    // The bands: the keyword that took most of its clicks, with how many keywords Google showed it for and how many got a click.
    const top = page.bands.parts.filter((part) => part.key !== "rest").sort((left, right) => right.clicks - left.clicks)[0];
    expect(lines.some((line) => line.startsWith(`${top.name} holds`)), lines.join("\n")).toBe(true);
    // Where the clicks came from is gone from the screen, so the eye never says a country or a device.
    expect(lines.some((line) => /Mobile|Desktop|Tablet|United Kingdom/.test(line)), lines.join("\n")).toBe(false);
    // Its clicks against the span before, only where Google has figures for that span.
    const held = (page.figures as unknown as { previous: unknown }).previous !== null;
    expect(lines.some((line) => line.startsWith(`${page.name}: clicks up`) || line.startsWith(`${page.name}: clicks down`)), lines.join("\n")).toBe(held);
    // How few of its keywords got a click: on every period, the span before or not.
    expect(lines.some((line) => line.startsWith("Keywords that got a click")), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(3);
  });

  // On More Handles' register as rebuilt from Google on 19 November 2026 (search-console-new-and-lost-audit-2026-11-19.md),
  // read as the page reads it, on every period the date menu offers, this week included: the headline and four things more.
  test.each(["thisWeek", ...ALL] as Period[])("New and lost: %s", (period) => {
    const lines = said("searchConsole.newLost", period, newLostPage(period));
    clean(lines);
    expect(lines[0], lines.join("\n")).toMatch(/^Searches: \d+ new and \d+ lost/);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  // Way 3 since 19 November 2026 (search-console-position-bands-way-3-plan-2026-11-19.md): its bands on today's figures, handed
  // over as the page hands them (`bandsSeesData`, `bandsSeesRows`), on every period the date menu offers, this week included.
  test.each(["thisWeek", ...ALL] as Period[])("Position bands: %s", (period) => {
    const one = positionBands.periods[period];
    const page = { summary: bandsSeesData(one.summary), rows: bandsSeesRows(one.rows), picked: true, chart: one.chart.map((step) => ({ ...step, day: step.start })), names: BAND_NAMES };
    const lines = said("searchConsole.bands", period, page);
    clean(lines);
    if (!NO_FAIR_BEFORE.includes(period) && period !== "thisWeek") expect(lines.some((line) => /^Top 3: searches (up|down)/.test(line)), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(NO_FAIR_BEFORE.includes(period) ? 2 : 4);
  });

  // Way 2 since 20 November 2026 (search-console-shown-but-not-clicked-way-2-plan-2026-11-20.md): its own figures handed over
  // as the page hands them (`lowCtrSeesData`), on every period the date menu offers, this week included. Nothing here is set
  // against the span before, so every period says the same kinds of thing: its clicks against the clicks it'd usually get
  // first, then how few pages, the page and the position short by most, the first page's share, and a Classification.
  test.each(["thisWeek", ...ALL] as Period[])("Shown but not clicked: %s", (period) => {
    const one = lowCtr.periods[period];
    const names = {
      these: "Pages shown a lot, clicked a little", usually: "Clicks you'd usually get", position: "Position", firstPage: "Positions 4 to 10", home: "Home page",
      kinds: lowCtr.kindNames,
    };
    const lines = said("searchConsole.lowCtr", period, { ...lowCtrSeesData(one.summary, one.rows), names });
    clean(lines);
    expect(lines[0], lines.join("\n")).toMatch(/^Pages shown a lot, clicked a little: clicks/);
    // The page short by most clicks is named by its title, never its address.
    expect(lines.some((line) => /^(Guide To Bathroom|What is a|Top Guide|Black Cupboard|Contact Us)/.test(line)), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(period === "thisWeek" ? 3 : 5);
  });

  // Rich results' own rules since 20 November 2026 (search-console-breakdowns-plan-2026-11-20.md): the kinds' figures, every click
  // beside them and the chart's six months, as the page hands them, on every period the date menu offers, this week included.
  // Their share of every click and the kind with most clicks on every period; their clicks against the period before where
  // it's kept whole (the last 12 months reach past Google's 16 months, so none).
  test.each(["thisWeek", ...ALL] as Period[])("Rich results: %s", (period) => {
    const lines = said("searchConsole.appearance", period, { ...appearance.periods[period], names: { rich: "Rich results", plain: "Plain results" } });
    clean(lines);
    expect(lines.some((line) => /^Rich results holds [\d.]+% of the list's clicks/.test(line)), lines.join("\n")).toBe(true);
    // Against the period before where it's kept whole: none past Google's 16 months.
    if (!NO_FAIR_BEFORE.includes(period)) expect(lines[0], lines.join("\n")).toMatch(/^Rich results: clicks (up|down)/);
    expect(lines.some((line) => /^Product snippet/.test(line)), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  // Way 3 since 20 November 2026 (search-console-keyword-cannibalisation-way-3-plan-2026-11-20.md): its own figures handed over
  // as the page hands them (`cannibalisationSeesData`), on every period the date menu offers, this week included. The keywords
  // two pages share first, then the pages competing, the busiest keyword's split, the closest and the most crowded among the
  // busiest, and, for a month or less, the keyword Google swapped pages for most.
  test.each(["thisWeek", ...ALL] as Period[])("Keyword cannibalisation: %s", (period) => {
    const one = cannibalisation.periods[period];
    const names = { these: "Keywords two pages share", competing: "Pages competing", nextPage: "its next page", average: "the average keyword two pages share", swapped: "Keywords Google swapped pages for" };
    const lines = said("searchConsole.competing", period, { ...cannibalisationSeesData(one.summary, one.rows), names });
    clean(lines);
    expect(lines[0], lines.join("\n")).toMatch(/^Keywords two pages share holds [\d.]+% of the list's keywords Google showed/);
    expect(lines.some((line) => line.startsWith("Pages competing holds ")), lines.join("\n")).toBe(true);
    // Swaps are counted for a month or less, never part-counted for a longer period.
    const counted = ["thisWeek", "lastWeek", "thisMonth", "lastMonth"].includes(period);
    expect(lines.some((line) => /days Google swapped pages/.test(line)), lines.join("\n")).toBe(counted);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test.each(ALL)("Keywords: %s", (period) => {
    const page = keywordsListPage(period);
    const lines = said("searchConsole.keywords", period, page);
    clean(lines);
    // Why the boxes and the table never add up: the clicks from searches Google hides, wherever the website had more.
    if (page.website.clicks > (page.summary as { clicks: number }).clicks) expect(lines.some((line) => line.startsWith("Searches Google hides")), lines.join("\n")).toBe(true);
    // The ticked keyword, set against the span before, where that span is fair.
    if (!NO_FAIR_BEFORE.includes(period)) expect(lines.some((line) => line.startsWith("door handles: clicks up")), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test.each(PLACES_PERIODS)("Pages: %s", (period) => {
    const page = pagesPage(period);
    const before = period === "thisWeek" ? "The same days last week" : BEFORE[period as Period];
    expectEyeHolds("searchConsole.pages", { ...page, words: { ...wordsFor(period === "thisWeek" ? "lastWeek" : period as Period), before } });
    const findings: Finding[] = pageFindings("searchConsole.pages", pageDataFor({ ...page, words: { before } }, "searchConsole.pages"));
    const lines = findings.map(findingWords);
    if (PRINT) console.log(`\nsearchConsole.pages · ${period}\n  ${lines.join("\n  ")}`);
    clean(lines);
    const compared = (at(pagesRead, period as Period) as { comparable: boolean }).comparable;
    // How few of the pages Google showed got a click, and how few make half the clicks: on every period.
    expect(lines.some((line) => line.startsWith("Pages that got a click")), lines.join("\n")).toBe(true);
    expect(lines.some((line) => line.startsWith("Pages that make half your clicks")), lines.join("\n")).toBe(true);
    // The Classification with most clicks, by its own name, its share of the clicks on the pages, never of the boxes'.
    expect(lines.some((line) => /^(Blog|Cupboard Handles|Handles|Locks|Brand|Other Ironmongery|Buy By Brand|Door Knobs|Hinges|Window Furniture|Electrical|Lighting)( holds [\d.]+% of the list's clicks on your pages|: clicks)/.test(line)), lines.join("\n")).toBe(true);
    // The clicks Google tied to no page, said once, as Demand by Classification's eye says them; never "private".
    expect(lines.filter((line) => line.startsWith("Searches Google hides holds")), lines.join("\n")).toHaveLength(1);
    expect(lines.some((line) => /private/i.test(line)), lines.join("\n")).toBe(false);
    if (compared) {
      // Every page's clicks against the span before, where that span is held and they moved 2% or more: This month's 997
      // against 1,008 didn't.
      const { clicks, beforeTotals } = (at(pagesRead, period as Period) as { summary: { clicks: number; beforeTotals: { clicks: number } } }).summary;
      const moved = Math.abs(clicks - beforeTotals.clicks) / beforeTotals.clicks >= 0.02;
      expect(lines.some((line) => /^All your pages: clicks (up|down)/.test(line)), lines.join("\n")).toBe(moved);
      if (period === "lastMonth") expect(moved).toBe(true);
    } else {
      expect(lines.some((line) => /: clicks (up|down)/.test(line)), lines.join("\n")).toBe(false);
    }
    // At least four things on every period: with no span before, a Classification Google shows a lot but people click less.
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test.each(PLACES_PERIODS)("Countries and devices: %s", (period) => {
    const page = placesPage(period);
    const before = period === "thisWeek" ? "The same days last week" : BEFORE[period as Period];
    expectEyeHolds("searchConsole.places", { ...page, words: { ...wordsFor(period === "thisWeek" ? "lastWeek" : period as Period), before } });
    const findings: Finding[] = pageFindings("searchConsole.places", pageDataFor({ ...page, words: { before } }, "searchConsole.places"));
    const lines = findings.map(findingWords);
    if (PRINT) console.log(`\nsearchConsole.places · ${period}\n  ${lines.join("\n  ")}`);
    clean(lines);
    const compared = (placesRead as Record<string, { countries: { comparable: boolean } }>)[period].countries.comparable;
    // The headline, on every period: the United Kingdom's share of every country's clicks, against its share before where held.
    expect(lines[0], lines.join("\n")).toMatch(compared ? /^United Kingdom: [\d.]+% of all the clicks, from [\d.]+% the span before\.$/ : /^United Kingdom holds [\d.]+% of the list's clicks\.$/);
    // The busiest device's share of the United Kingdom's clicks, named with it, on every period.
    expect(lines.some((line) => line.startsWith("Mobile in the United Kingdom")), lines.join("\n")).toBe(true);
    // How many countries sent a click: always without dates before, and where it moved a tenth or more with them (Last
    // month's 99 against 118); a move of two or three countries ranks below the rest.
    const clicked = page.clicked;
    const clickedMoved = clicked.countriesBefore !== null && Math.abs(clicked.countries - clicked.countriesBefore) >= clicked.countriesBefore / 10;
    if (!compared || clickedMoved) expect(lines.some((line) => line.startsWith("Countries with a click")), lines.join("\n")).toBe(true);
    if (compared) {
      // A country abroad that gained or lost most clicks, over the whole list, or a ticked one: This week's one day moved
      // no country abroad five clicks.
      if (period !== "thisWeek") expect(lines.some((line) => /^(?!United Kingdom)[A-Z][^:]+: clicks (up|down)/.test(line)), lines.join("\n")).toBe(true);
    } else {
      // No dates before: nothing said to have moved.
      expect(lines.some((line) => / (up|down) [\d.]+%|the span before/.test(line)), lines.join("\n")).toBe(false);
    }
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test.each(PLACES_PERIODS)("Demand by Classification: %s", (period) => {
    const page = demandPage(period);
    const before = period === "thisWeek" ? "The same days last week" : BEFORE[period as Period];
    expectEyeHolds("searchConsole.services", { ...page, words: { ...wordsFor(period === "thisWeek" ? "lastWeek" : period as Period), before } });
    const findings: Finding[] = pageFindings("searchConsole.services", pageDataFor({ ...page, words: { before } }, "searchConsole.services"));
    const lines = findings.map(findingWords);
    if (PRINT) console.log(`\nsearchConsole.services · ${period}\n  ${lines.join("\n  ")}`);
    clean(lines);
    const compared = page.website?.clicksBefore !== null && page.website?.clicksBefore !== undefined;
    // The headline, on every period: the Classification with the most clicks and its share of the pages' clicks.
    expect(lines[0], lines.join("\n")).toMatch(/^[A-Z][^:]*(: [\d.]+% of all the clicks on your pages, from [\d.]+% the span before| holds [\d.]+% of the list's clicks on your pages)\.$/);
    // The clicks Google tied to no page, said once, as Keywords' eye says them; never a part called Private searches.
    expect(lines.filter((line) => line.startsWith("Searches Google hides holds")), lines.join("\n")).toHaveLength(1);
    expect(lines.some((line) => /private/i.test(line)), lines.join("\n")).toBe(false);
    // Pages not in a Classification yet are in the figures, never named.
    expect(lines.some((line) => line.includes("Unclassified")), lines.join("\n")).toBe(false);
    if (compared) {
      // The Classification that gained or lost most clicks, beside the other Classifications' own move: This week's one
      // day moved none of them ten clicks.
      if (period !== "thisWeek") expect(lines.some((line) => /: clicks (up|down) .*; The other Classifications: (up|down)/.test(line)), lines.join("\n")).toBe(true);
    } else {
      // No dates before: nothing said to have moved.
      expect(lines.some((line) => / (up|down) [\d.]+%|the span before/.test(line)), lines.join("\n")).toBe(false);
    }
    // A Classification Google shows a lot but people click less, against all the pages: on every period but This week's one day.
    if (period !== "thisWeek") expect(lines.some((line) => /for every 1,000 times shown [\d.]+, against [\d.]+ for All your pages/.test(line)), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("Volatility: its own newest days, whatever the dates", () => {
    const lines = said("searchConsole.volatility", "lastMonth", volatilityPage());
    clean(lines);
    expect(lines[0], lines.join("\n")).toMatch(/^Thu 29 Oct: how much the results moved 4.1/);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("Volatility: Positions declined against Positions improved over the chart's dates, only when one is clearly bigger (2026-11-20)", () => {
    // More Handles' October, as dev rebuilt it on 20 November: 1.0 a day improved, 1.1 declined, too even to say.
    const page = volatilityPage();
    expect(said("searchConsole.volatility", "lastMonth", page).some((line) => /^Positions declined: /.test(line))).toBe(false);
    // The same days with a fifth of each day's improved part moved to declined: falls clearly lead.
    const falling = {
      ...page,
      chart: (page.chart as Array<Record<string, unknown>>).map((one) => (typeof one.volatilityUp === "number"
        ? { ...one, volatilityUp: Math.round((one.volatilityUp as number) * 8) / 10, volatilityDown: Math.round(((one.volatility as number) - Math.round((one.volatilityUp as number) * 8) / 10) * 10) / 10 }
        : one)),
    };
    const lines = said("searchConsole.volatility", "lastMonth", falling);
    clean(lines);
    expect(lines.find((line) => /^Positions declined: /.test(line)), lines.join("\n")).toMatch(/^Positions declined: how much the results moved 1\.3, against 0\.8 for Positions improved/);
  });
});

/**
 * Ronins' overview, the second check: its days are held back sixteen months, so every period has a whole span before
 * (read through Ask Hakken's Search Console read, `assistantReads.searchConsoleInternal`, on 3 November 2026: the
 * identity these tests' figures were read with holds More Handles' company only).
 */
// ── Tracked keywords and Tracked pages ──────────────────────────────────────────────────────────────────────────

type TrackedTotals = { clicks: number; impressions: number; position: number };
type TrackedEntry = {
  key: string; title?: string; now: TrackedTotals | null; previous: TrackedTotals | null;
  ticked?: boolean; days?: Array<{ day: string; clicks: number }>; daysBefore?: Array<{ day: string; clicks: number }>;
};
type TrackedPeriod = {
  from: string; to: string; comparable: boolean; website: { clicks: number } | null;
  updates: Array<{ title: string; startedOn: string; finishedOn: string | null }>; keywords: TrackedEntry[]; pages: TrackedEntry[];
};
const trackedRead = readFixture("moreHandlesSearchConsoleTracked") as { periods: Record<PlacesPeriod, TrackedPeriod> };
const TRACKED_NAMES = { keywords: "Your tracked keywords", pages: "Your tracked pages" };

/**
 * A tracked screen's figures, built as its read and the screen build them (search-console-tracked-way-1-plan-2026-11-18.md):
 * the rows shaped as the list shapes them, the summary with its tracked figures over every row, the three busiest ticked
 * onto the chart, and their clicks either side of the newest finished Google update, off their own days.
 */
function trackedPage(period: PlacesPeriod, kind: "keywords" | "pages") {
  const one = trackedRead.periods[period];
  const entries = one[kind];
  const source = (pick: (entry: TrackedEntry) => TrackedTotals | null): SourceRow[] => entries.flatMap((entry) => {
    const totals = pick(entry);
    return totals && (totals.impressions > 0 || totals.clicks > 0) ? [{ key: entry.key, clicks: totals.clicks, impressions: totals.impressions, positionSum: totals.position * totals.impressions }] : [];
  });
  const keys = new Set(entries.map((entry) => entry.key));
  const before = one.comparable ? source((entry) => entry.previous) : null;
  const titleOf = (key: string) => entries.find((entry) => entry.key === key)?.title;
  const rows = shapeRows(withTracked(source((entry) => entry.now), keys), before, { tracked: keys, brandWords: null })
    .map((row) => (titleOf(row.key) ? { ...row, title: titleOf(row.key) } : row));
  const tracked = trackedListOf(rows, before !== null);
  // The read names the rows that moved, a page with its title (`namedTracked`).
  const titled = <T extends { key: string } | null>(row: T): T => (row && titleOf(row.key) ? { ...row, title: titleOf(row.key) } : row);
  const named = {
    ...tracked,
    movers: tracked.movers ? { up: titled(tracked.movers.up), down: titled(tracked.movers.down) } : null,
    places: tracked.places ? { up: titled(tracked.places.up), down: titled(tracked.places.down) } : null,
    firstPage: { ...tracked.firstPage, cameTop: titled(tracked.firstPage.cameTop), leftTop: titled(tracked.firstPage.leftTop) },
    busiest: titled(tracked.busiest),
    quietest: titled(tracked.quietest),
  };
  const summary = { rows: rows.length, ...figuresOf(rows, before !== null), trackedList: named };
  const nameOf = (key: string) => (kind === "pages" ? pageName({ key, title: titleOf(key) }, { home: "Home page" }) : key);
  const ticked = entries.filter((entry) => entry.ticked).sort((left, right) => (right.now?.clicks ?? 0) - (left.now?.clicks ?? 0))
    .map((entry) => ({ key: entry.key, days: entry.days ?? [], daysBefore: entry.daysBefore ?? [], failed: false, clicks: entry.now?.clicks ?? 0, previousClicks: one.comparable ? (entry.previous?.clicks ?? 0) : null }));
  return trackedPageData({
    page: { summary, rows: rows.slice(0, 25), picked: true },
    countryClicks: one.website?.clicks ?? null,
    ticked: ticked.map((row) => ({ name: nameOf(row.key), clicks: row.clicks, previousClicks: row.previousClicks })),
    update: tickedUpdateOf(ticked, one.updates, one.to, 14, nameOf),
    names: { allTracked: TRACKED_NAMES[kind], firstPage: "On Google's first page", notShown: "Not shown at all", home: "Home page", onChart: `the ${kind} on the chart` },
  });
}

describe("Tracked keywords and Tracked pages find the biggest things on every period (More Handles, 18 November 2026)", () => {
  for (const kind of ["keywords", "pages"] as const) {
    const screen = kind === "keywords" ? "searchConsole.trackedKeywords" : "searchConsole.trackedPages";
    test.each(PLACES_PERIODS)(`Tracked ${kind}: %s`, (period) => {
      const page = trackedPage(period, kind);
      const before = period === "thisWeek" ? "The same days last week" : BEFORE[period as Period];
      expectEyeHolds(screen, { ...page, words: { ...wordsFor(period === "thisWeek" ? "lastWeek" : period as Period), before } });
      const findings: Finding[] = pageFindings(screen, pageDataFor({ ...page, words: { before } }, screen));
      const lines = findings.map(findingWords);
      if (PRINT) console.log(`\n${screen} · ${period}\n  ${lines.join("\n  ")}`);
      clean(lines);
      expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
      // Everything tracked together, on every period: against the dates before where they're held, as a share of the
      // country's clicks either way.
      expect(lines.some((line) => line.startsWith(TRACKED_NAMES[kind])), lines.join("\n")).toBe(true);
      // Keywords on Google's first page, on every period.
      if (kind === "keywords") expect(lines.some((line) => line.startsWith("On Google's first page")), lines.join("\n")).toBe(true);
      // The newest Google update that finished with its 14 days after inside the dates: September's spam update, from the
      // last 3 months on. The November core update was still rolling out on 18 November 2026.
      if (["last3Months", "last6Months", "last12Months"].includes(period)) {
        expect(lines.some((line) => line.startsWith("September 2026 spam update")), lines.join("\n")).toBe(true);
      }
    });
  }
});

describe("Search Console's overview on Ronins' figures, every period (3 November 2026)", () => {
  test.each(["lastWeek", "lastMonth", "last3Months", "last6Months", "last12Months", "thisMonth"] as Period[])("%s", (period) => {
    const data = at(roninsPerformance, period);
    const lines = said("searchConsole.performance", period, { ...data, names: { brand: "Brand", other: "Non-brand" } });
    clean(lines);
    if (data.previous) {
      expect(lines[0], lines.join("\n")).toMatch(/^The whole website: clicks (up|down)/);
      expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(period === "thisMonth" ? 2 : 4);
    } else {
      // Last 12 months: Google keeps sixteen, so the 12 before are not there to compare; the newest weeks are.
      expect(lines.some((line) => line.startsWith("The last 28 days: clicks a day")), lines.join("\n")).toBe(true);
    }
  });
});
