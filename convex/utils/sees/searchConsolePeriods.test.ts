import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { findingWords, type Finding } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";
import { performanceSplits, type PerformanceRaw } from "@/src/app/(dashboard)/app/search-console/_components/performanceSees";
import { keywordBands } from "@/src/app/(dashboard)/app/search-console/_components/keywordSees";
import type { ListRow } from "@/src/app/(dashboard)/app/search-console/_components/SearchConsoleTables";

const performance = readFixture("moreHandlesSearchConsolePerformance");
const keywords = readFixture("moreHandlesSearchConsoleKeywords");
const curve = readFixture("moreHandlesSearchConsoleCurve");
const services = readFixture("moreHandlesSearchConsoleServices");
const updates = readFixture("moreHandlesSearchConsoleUpdates");
const newLost = readFixture("moreHandlesSearchConsoleNewLost");
const devices = readFixture("moreHandlesSearchConsoleDevices");
const volatility = readFixture("moreHandlesSearchConsoleVolatility");
const roninsPerformance = readFixture("roninsSearchConsolePerformance");
const splitsRead = readFixture("moreHandlesSearchConsolePerformanceSplits") as Record<string, unknown>;
/** "more handles" on its own screen, as Google answered on 17 November 2026: its figures and every page shown for it. */
const keywordScreen = readFixture("moreHandlesSearchConsoleKeywordScreen") as Record<string, unknown>;
const pagesRead = readFixture("moreHandlesSearchConsolePages") as Record<string, unknown>;

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

type Period = "lastWeek" | "thisMonth" | "lastMonth" | "last3Months" | "last6Months" | "last12Months";
const WHOLE: Period[] = ["lastWeek", "lastMonth", "last3Months"];
const NO_FAIR_BEFORE: Period[] = ["last6Months", "last12Months"];
const ALL: Period[] = [...WHOLE, "thisMonth", ...NO_FAIR_BEFORE];
type Fixture = Record<string, unknown>;
const at = (fixture: unknown, period: Period) => (fixture as Record<Period, Fixture>)[period];

/** The words `SearchConsoleSees` hands every page, in English: what each period is set against, and the page's names. */
const BEFORE: Record<Period, string> = {
  lastWeek: "The week before", thisMonth: "The same days last month", lastMonth: "The month before", last3Months: "The 3 months before",
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
const STEP: Record<Period, string> = { lastWeek: "day", thisMonth: "day", lastMonth: "day", last3Months: "week", last6Months: "week", last12Months: "month" };

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
 * Pages (search-console-pages-way-1-plan-2026-11-17.md): the page list as its own read answered on 17 November 2026,
 * every country's, with the span before's totals, the pages clicked, the few that make half the clicks and the two that
 * moved most; the home page ticked onto the chart with its October clicks against September's; and the names the page
 * says things by. That day More Handles' Last 6 months and Last 12 months have no span before: Google has no figures
 * for it from 11 August 2025 to 22 April 2026 (`googleHasSpan`), and the 12 months before are past its sixteen.
 */
const PAGES_NAMES = {
  allPages: "All your pages", clicked: "Pages that got a click", half: "Pages that make half your clicks", home: "Home page",
  kinds: (pagesRead.kindNames ?? {}) as Record<string, string>,
};
const pagesPage = (period: Period) => {
  const list = at(pagesRead, period) as { summary: unknown; rows: unknown[]; comparable: boolean };
  // The ticked page's span before comes back only where Google has figures for it, as the page list's does.
  return { summary: list.summary, rows: list.rows, picked: true, ticked: [{ name: "Home page", clicks: 396, previousClicks: list.comparable ? 327 : null }], names: PAGES_NAMES };
};
const curvePage = (period: Period) => {
  const { points, before } = at(curve, period) as { points: Array<{ position: number }>; before: Array<{ position: number }> | null };
  const placed = (list: Array<{ position: number }>) => list.map((point) => ({ ...point, name: `Place ${point.position}` }));
  return { points: placed(points), before: before ? placed(before) : null, names: PLACE_NAMES };
};
const servicesPage = (period: Period) => {
  const answer = at(services, period) as { from: string; to: string; services: Array<{ kind: string; name: string | null; shown: number; shownBefore: number | null; clicks: number; clicksBefore: number | null }> };
  return {
    services: answer.services.map((row) => ({ name: row.kind === "OTHER" ? "Not sorted" : row.name, impressions: row.shown, impressionsBefore: row.shownBefore, clicks: row.clicks, clicksBefore: row.clicksBefore, sorted: row.kind !== "OTHER" })),
    from: answer.from, to: answer.to, names: { others: "The other services" },
  };
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
const pagePage = (period: Period) => ({
  name: "/door-handles.html", page: "https://www.morehandles.co.uk/door-handles.html",
  figures: { days: [], totals: { clicks: 120, impressions: 30400, ctr: 0.0039, position: 11.8 }, previous: { clicks: 151, impressions: 29900, ctr: 0.0051, position: 11.2 }, previousHeld: true },
  cameFrom: { devices: [{ key: "MOBILE", name: "Mobile", clicks: 70, impressions: 21000, share: 0.5833 }, { key: "DESKTOP", name: "Desktop", clicks: 48, impressions: 9100, share: 0.4 }, { key: "TABLET", name: "Tablet", clicks: 2, impressions: 300, share: 0.0167 }] },
  rows: [
    { key: "door handles", name: "door handles", clicks: 24, impressions: 9800, ctr: 0.0024, position: 12.1, previousClicks: 15, change: 9 },
    { key: "brass door handles", name: "brass door handles", clicks: 1, impressions: 2400, ctr: 0.0004, position: 9.4, previousClicks: 25, change: -24 },
    { key: "internal door handles", name: "internal door handles", clicks: 6, impressions: 1900, ctr: 0.0032, position: 14.3, previousClicks: 9, change: -3 },
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

  test.each(ALL)("Demand by service: %s", (period) => {
    const lines = said("searchConsole.services", period, servicesPage(period));
    clean(lines);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(NO_FAIR_BEFORE.includes(period) ? 2 : 4);
    if (!NO_FAIR_BEFORE.includes(period)) expect(lines.some((line) => /: clicks (up|down) .*The other services: (up|down)/.test(line)), lines.join("\n")).toBe(true);
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

  test.each(ALL)("A page's own screen: %s", (period) => {
    const lines = said("searchConsole.page", period, pagePage(period));
    clean(lines);
    expect(lines.some((line) => line.startsWith("brass door handles: clicks down")), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test.each(ALL)("New and lost: %s", (period) => {
    const lines = said("searchConsole.newLost", period, newLostPage(period));
    clean(lines);
    expect(lines[0], lines.join("\n")).toMatch(/^Searches: \d+ new and \d+ lost/);
    // A week's new searches take their places from the week's own list, which on 3 November still held the week before
    // (waiting on its rebuild), and its lost ones were last shown before it: three things, not four, until it is rebuilt.
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(period === "thisMonth" ? 2 : period === "lastWeek" ? 3 : 4);
  });

  test.each(ALL)("Position bands: %s", (period) => {
    const lines = said("searchConsole.bands", period, keywordsPage(period, BAND_NAMES));
    clean(lines);
    if (!NO_FAIR_BEFORE.includes(period)) expect(lines.some((line) => /^Top 3: searches (up|down)/.test(line)), lines.join("\n")).toBe(true);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(NO_FAIR_BEFORE.includes(period) ? 2 : 4);
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

  test.each(ALL)("Pages: %s", (period) => {
    const lines = said("searchConsole.pages", period, pagesPage(period));
    clean(lines);
    const compared = (at(pagesRead, period) as { comparable: boolean }).comparable;
    // How few of the pages Google showed got a click, and how few make half the clicks: on every period.
    expect(lines.some((line) => line.startsWith("Pages that got a click")), lines.join("\n")).toBe(true);
    expect(lines.some((line) => line.startsWith("Pages that make half your clicks")), lines.join("\n")).toBe(true);
    // The Classification with most clicks, by its own name.
    expect(lines.some((line) => /^(Blog|Cupboard Handles|Handles|Locks|Brand|Other Ironmongery|Buy By Brand|Door Knobs|Hinges|Window Furniture|Electrical|Lighting)( holds|: clicks)/.test(line)), lines.join("\n")).toBe(true);
    if (compared) {
      // Every page's clicks against the span before, and the ticked home page, only where that span is held.
      expect(lines.some((line) => /^All your pages: clicks (up|down)/.test(line)), lines.join("\n")).toBe(true);
      expect(lines.some((line) => line.startsWith("Home page: clicks up")), lines.join("\n")).toBe(true);
    } else {
      expect(lines.some((line) => /: clicks (up|down)/.test(line)), lines.join("\n")).toBe(false);
    }
    // At least four things on every period: with no span before, a Classification Google shows a lot but people click less.
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });

  test("Volatility: its own newest days, whatever the dates", () => {
    const lines = said("searchConsole.volatility", "lastMonth", volatilityPage());
    clean(lines);
    expect(lines[0], lines.join("\n")).toMatch(/^Thu 29 Oct: how much the results moved 4.1/);
    expect(lines.length, lines.join("\n")).toBeGreaterThanOrEqual(4);
  });
});

/**
 * Ronins' overview, the second check: its days are held back sixteen months, so every period has a whole span before
 * (read through Ask Hakken's Search Console read, `assistantReads.searchConsoleInternal`, on 3 November 2026: the
 * identity these tests' figures were read with holds More Handles' company only).
 */
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
