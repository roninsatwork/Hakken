import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { useFixedDay } from "@/src/test/realTime";
import { kindOf, reasonOf } from "../utils/indexingReasons";
import { reasonRows, type ProblemPage } from "../utils/indexingFigures";
import { figuresOf, shapeRows, trackedListOf, withTracked, type SourceRow } from "../utils/searchConsoleViews";
import { findingWords } from "../utils/sees/findings";
import { pageDataFor } from "../utils/sees/pageData";
import { pageFindings } from "../utils/sees/pageFindings";
import { englishWords } from "../utils/sees/serverWords";
import { appearanceEyeData, curveEyeData, newLostEyeData, updateRowsOf, updatesEyeData, type AppearanceRow } from "../utils/sees/eyeData/searchConsoleChanges";
import { demandEyeData, demandPartsOf } from "../utils/sees/eyeData/searchConsoleDemand";
import { indexingEyeData, indexingScreenOf, reasonEyeData, reasonNamesOf, reasonScreenOf } from "../utils/sees/eyeData/searchConsoleIndexing";
import { bandsEyeData, brandEyeData, competingEyeData, keywordsEyeData, listPageOf, lowCtrEyeData, pagesEyeData, trackedEyeData, volatilityEyeData } from "../utils/sees/eyeData/searchConsoleLists";
import { performanceEyeData } from "../utils/sees/eyeData/searchConsolePerformance";
import { placeRowNames, placesEyeData, type PlaceRow } from "../utils/sees/eyeData/searchConsolePlaces";
import { ENGLISH_FORMATS, ENGLISH_LANGUAGE, pageKindLabel, searchConsoleSeesWords, withSeesWords } from "../utils/sees/eyeData/searchConsoleWords";
import { SEARCH_CONSOLE_EYES } from "./searchConsole";

/**
 * Search Console's screens' eye figures, built on the server by the same pure functions the screens call
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B), on More Handles' saved figures (`src/test/fixtures/`), in the
 * English words a chat app's question is answered in: each screen's own findings come out of them on every period the
 * brief names. The reads are the fixtures, in the shapes the screens' reader helpers answer.
 */

type Period = "lastWeek" | "lastMonth" | "last3Months" | "last12Months";
const PERIODS: Period[] = ["lastWeek", "lastMonth", "last3Months", "last12Months"];
type Fixture = Record<string, unknown>;
const at = <Shape = Fixture>(fixture: unknown, period: Period) => (fixture as Record<Period, Shape>)[period];

const t = englishWords("searchConsole");
const ti = englishWords("searchConsole.indexing");

/** The screen's figures with the words `SearchConsoleSees` adds, cut as the eye cuts them, and their findings in words. */
function findingsOf(screen: string, period: Period, data: unknown): string[] {
  const words = searchConsoleSeesWords({ sees: englishWords("searchConsole.sees"), before: englishWords("common.periods")(`before.${period}`), nowName: null, beforeName: null });
  const handed = withSeesWords(data, words);
  expectEyeHolds(screen, handed);
  return pageFindings(screen, pageDataFor(handed, screen)).map(findingWords);
}

const performance = readFixture("moreHandlesSearchConsolePerformance");
const splits = readFixture("moreHandlesSearchConsolePerformanceSplits") as Fixture & { kindNames: Record<string, string> };
const keywords = readFixture("moreHandlesSearchConsoleKeywords");
const pagesRead = readFixture("moreHandlesSearchConsolePages") as Fixture & { kindNames: Record<string, string> };
const bands = readFixture("moreHandlesSearchConsolePositionBands") as { periods: Record<Period, { summary: unknown; rows: unknown[]; chart: Array<{ start: string }> }> };
const lowCtr = readFixture("moreHandlesSearchConsoleLowCtr") as { kindNames: Record<string, string>; periods: Record<Period, { summary: unknown; rows: unknown[] }> };
const cannibalisation = readFixture("moreHandlesSearchConsoleCannibalisation") as { periods: Record<Period, { summary: unknown; rows: unknown[] }> };
const volatility = readFixture("moreHandlesSearchConsoleVolatility") as { volatility: { latest: { day: string } | null }; rows: unknown[]; chart: Array<{ start: string }> };
const places = readFixture("moreHandlesSearchConsolePlaces");
const demand = readFixture("moreHandlesSearchConsoleDemand") as { kindNames: Record<string, string>; periods: Record<Period, Fixture> };
const curve = readFixture("moreHandlesSearchConsoleCurve");
const updates = readFixture("moreHandlesSearchConsoleUpdates");
const newLost = readFixture("moreHandlesSearchConsoleNewLost");
const appearance = readFixture("moreHandlesSearchConsoleAppearance") as { periods: Record<Period, { kinds: Array<{ name: string; clicks: number; previousClicks: number | null; impressions: number; position: number; pages: number | null }>; totals: unknown; previous: unknown; months: Array<{ month: string }>; pagesShown: number }> };
const tracked = readFixture("moreHandlesSearchConsoleTracked");
const indexing = readFixture("moreHandlesSearchConsoleIndexing") as {
  indexed: number;
  checked: number;
  problems: Array<ProblemPage & { indexed: boolean }>;
  periods: Record<Period, { clicks: number; impressions: number; pages: Array<[string, number, number]> }>;
};

/** Each Classification's id and name, as the website's choices hand them. */
const choicesOf = (names: Record<string, string>) => Object.entries(names).map(([id, name]) => ({ id, name }));
type Figures = { totals: { clicks: number; impressions: number } | null; previous: { clicks: number; impressions: number } | null };

beforeEach(() => useFixedDay("2026-11-21"));
afterEach(() => vi.useRealTimers());

describe("every Search Console screen built on the server gives its own findings on More Handles' saved figures", () => {
  test("a builder for each screen built, and none for those that ask Google whenever they open", () => {
    expect(Object.keys(SEARCH_CONSOLE_EYES).sort()).toEqual([
      "searchConsole.appearance", "searchConsole.bands", "searchConsole.brand", "searchConsole.competing", "searchConsole.ctrCurve", "searchConsole.indexing",
      "searchConsole.indexingReason", "searchConsole.keywords", "searchConsole.lowCtr", "searchConsole.newLost", "searchConsole.pages", "searchConsole.performance",
      "searchConsole.places", "searchConsole.services", "searchConsole.trackedKeywords", "searchConsole.trackedPages", "searchConsole.updates", "searchConsole.volatility",
    ]);
  });

  test.each(PERIODS)("Performance: %s", (period) => {
    const read = at<Fixture & { brandDays?: { now: { brandClicks: number; nonBrandClicks: number; days: number }; before: { brandClicks: number; nonBrandClicks: number; days: number } }; dates: { from: string; to: string; days: number } }>(performance, period);
    const chart = (brand: { brandClicks: number; nonBrandClicks: number; days: number } | undefined) => (brand ? { periods: [{ brandClicks: brand.brandClicks, otherClicks: brand.nonBrandClicks, days: brand.days }], notReady: false, preparing: false, notBuilt: false } : null);
    const raw = at<Fixture>(splits, period);
    const data = performanceEyeData({
      figures: read as never,
      brandNow: chart(read.brandDays?.now),
      brandBefore: chart(read.brandDays?.before),
      dates: { from: read.dates.from, to: read.dates.to, days: read.dates.days, before: { from: read.dates.from, to: read.dates.to } },
      raw: { brand: raw.brand as never, kinds: raw.kinds as never, devices: raw.devices as never, looks: raw.looks as never, keywords: raw.keywords as never },
    }, { t, kind: pageKindLabel(choicesOf(splits.kindNames), englishWords("sites.common")), number: ENGLISH_FORMATS.number, oneDecimal: ENGLISH_FORMATS.oneDecimal });
    const lines = findingsOf("searchConsole.performance", period, data);
    expect(lines.length, lines.join("\n")).toBeGreaterThan(0);
    // Named in the screens' own English words, never a Classification's id.
    expect(lines.join("\n")).not.toMatch(/\b[0-9a-z]{32}\b/);
  });

  test.each(PERIODS)("Keywords: %s", (period) => {
    const list = at<{ summary: unknown; rows: unknown[] }>(keywords, period);
    const data = keywordsEyeData({ page: listPageOf(list.summary, list.rows), websiteClicks: at<Figures>(performance, period).totals?.clicks ?? null, ticked: [] }, t);
    expect(findingsOf("searchConsole.keywords", period, data).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Pages: %s", (period) => {
    const list = at<{ summary: unknown; rows: unknown[]; website: { clicks: number } }>(pagesRead, period);
    const data = pagesEyeData({ page: listPageOf(list.summary, list.rows), countryClicks: list.website.clicks, ticked: [], kinds: choicesOf(pagesRead.kindNames) }, t);
    expect(findingsOf("searchConsole.pages", period, data).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Brand and non-brand: %s", (period) => {
    const list = at<{ summary: unknown; rows: unknown[]; chart: Array<{ start: string }> }>(keywords, period);
    const every = at<Figures>(performance, period);
    const data = brandEyeData({ page: listPageOf(list.summary, list.rows), brandWords: ["more handles"], periods: list.chart, every: { totals: every.totals, previous: every.previous } }, t);
    expect(findingsOf("searchConsole.brand", period, data).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Position bands: %s", (period) => {
    const list = bands.periods[period];
    const data = bandsEyeData({ page: listPageOf(list.summary, list.rows), periods: list.chart }, t);
    expect(findingsOf("searchConsole.bands", period, data).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Shown but not clicked: %s", (period) => {
    const list = lowCtr.periods[period];
    const data = lowCtrEyeData({ summary: list.summary, rows: list.rows, kinds: choicesOf(lowCtr.kindNames) }, t);
    expect(findingsOf("searchConsole.lowCtr", period, data).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Keyword cannibalisation: %s", (period) => {
    const list = cannibalisation.periods[period];
    expect(findingsOf("searchConsole.competing", period, competingEyeData({ summary: list.summary, rows: list.rows }, t)).length).toBeGreaterThan(0);
  });

  for (const kind of ["keywords", "pages"] as const) {
    test.each(PERIODS)(`Tracked ${kind}: %s`, (period) => {
      // The tracked rows shaped as the list shapes them, the summary with its tracked figures over every row.
      type Totals = { clicks: number; impressions: number; position: number };
      const one = (tracked as { periods: Record<Period, Fixture & { comparable: boolean; website: { clicks: number } | null }> }).periods[period];
      const entries = one[kind] as Array<{ key: string; now: Totals | null; previous: Totals | null }>;
      const source = (pick: (entry: (typeof entries)[number]) => Totals | null): SourceRow[] => entries.flatMap((entry) => {
        const totals = pick(entry);
        return totals && (totals.impressions > 0 || totals.clicks > 0) ? [{ key: entry.key, clicks: totals.clicks, impressions: totals.impressions, positionSum: totals.position * totals.impressions }] : [];
      });
      const keys = new Set(entries.map((entry) => entry.key));
      const before = one.comparable ? source((entry) => entry.previous) : null;
      const rows = shapeRows(withTracked(source((entry) => entry.now), keys), before, { tracked: keys, brandWords: null });
      const summary = { rows: rows.length, ...figuresOf(rows, before !== null), trackedList: trackedListOf(rows, before !== null) };
      const data = trackedEyeData({ page: listPageOf(summary, rows.slice(0, 25)), countryClicks: one.website?.clicks ?? null, ticked: [], update: null, kind }, t);
      const screen = kind === "keywords" ? "searchConsole.trackedKeywords" : "searchConsole.trackedPages";
      expect(findingsOf(screen, period, data).length).toBeGreaterThan(0);
    });
  }

  test.each(PERIODS)("Volatility: %s", (period) => {
    const data = volatilityEyeData({ facts: volatility.volatility, rows: volatility.rows, periods: volatility.chart }, t, ENGLISH_FORMATS);
    expect(findingsOf("searchConsole.volatility", period, data).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Countries and devices: %s", (period) => {
    type List = { comparable: boolean; summary: { beforeTotals: { clicks: number } | null; clickedBefore: number | null }; rows: PlaceRow[] };
    const read = at<{ countries: List; devices: List }>(places, period);
    const named = placeRowNames(t, ENGLISH_LANGUAGE);
    const data = placesEyeData({
      chosen: "gbr",
      countries: read.countries.rows.map((row) => ({ ...row, name: named.country(row.key) })),
      summary: read.countries.summary,
      comparable: read.countries.comparable,
      devices: read.devices.rows.map((row) => ({ ...row, name: named.device(row.key) })),
      devicesComparable: read.devices.comparable,
      ticked: [],
    }, t, ENGLISH_LANGUAGE);
    expect(findingsOf("searchConsole.places", period, data).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Demand by Classification: %s", (period) => {
    const one = demand.periods[period] as Fixture & Figures & { rows: never; comparable: boolean };
    const kindLabel = pageKindLabel(choicesOf(demand.kindNames), englishWords("sites.common"));
    const parts = demandPartsOf({ rows: one.rows, comparable: one.comparable }, { previous: one.previous }, kindLabel);
    expect(findingsOf("searchConsole.services", period, demandEyeData({ parts, totals: one.totals, previous: one.previous }, t)).length).toBeGreaterThan(0);
  });

  /** A period's figures for the checked pages, joined by the link Google answered for, as the reads join them. */
  const indexingFigures = (period: Period) => {
    const own = indexing.periods[period];
    const byAddress = new Map(own.pages.map(([key, clicks, impressions]) => [key, { clicks, impressions }]));
    const byPage = indexing.problems.flatMap((page) => { const found = byAddress.get(page.address); return found ? [{ page: page.page, ...found }] : []; });
    return { clicks: own.clicks, impressions: own.impressions, byPage };
  };

  test.each(PERIODS)("Indexing: %s", (period) => {
    const figures = indexingFigures(period);
    const folded = { byPage: new Map(figures.byPage.map((page) => [page.page, page])), clicks: figures.clicks, impressions: figures.impressions };
    const answer = {
      reasons: reasonRows(indexing.problems, null).map((row) => ({ reason: row.reason, pages: row.pages, crawled: row.crawled, inSitemap: indexing.problems.filter((page) => page.reason === row.reason && page.inSitemap).length })),
      checks: { indexed: indexing.indexed, checked: indexing.checked },
      weekBefore: null,
    };
    const clickedPages = indexing.problems
      .map((page) => ({ page: page.page, title: page.title, reason: page.reason, clicks: folded.byPage.get(page.page)?.clicks ?? 0, impressions: folded.byPage.get(page.page)?.impressions ?? 0 }))
      .filter((page) => page.clicks > 0)
      .sort((left, right) => right.clicks - left.clicks)
      .slice(0, 10);
    const summaryFigures = { clicks: figures.clicks, impressions: figures.impressions, byReason: reasonRows(indexing.problems, folded).map((row) => ({ reason: row.reason, clicks: row.clicks, impressions: row.impressions })) };
    const { rows, boxes } = indexingScreenOf(answer, summaryFigures, reasonNamesOf(ti));
    const lines = findingsOf("searchConsole.indexing", period, indexingEyeData({ rows, boxes, answer, clickedPages }, ti));
    expect(lines.length, lines.join("\n")).toBeGreaterThan(0);
  });

  test.each(PERIODS)("A reason's own page: %s", (period) => {
    const reason = "Page with redirect";
    expect(reasonOf(reason)).not.toBeNull();
    const answer = { pages: indexing.problems.filter((page) => page.reason === reason).map((page) => ({ ...page, mainIndexed: false })), checks: { checked: indexing.checked } };
    const { rows, boxes } = reasonScreenOf(answer, indexingFigures(period), null, kindOf(reason), "2026-11-01", ti);
    const lines = findingsOf("searchConsole.indexingReason", period, reasonEyeData({ reason, rows, boxes }, ti));
    expect(lines.length, lines.join("\n")).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Click rate by position: %s", (period) => {
    const read = at<{ points: never[]; before: never[] | null }>(curve, period);
    expect(findingsOf("searchConsole.ctrCurve", period, curveEyeData({ points: read.points, before: read.before, devices: null }, t)).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Google updates: %s", (period) => {
    const read = at<{ updates: Array<Fixture & { title: string }> }>(updates, period);
    const rows = updateRowsOf(read.updates.map((update) => ({ ...update, id: update.title })) as never);
    expect(findingsOf("searchConsole.updates", period, updatesEyeData({ rows, days: at(performance, period) }, t)).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("New and lost: %s", (period) => {
    const result = at<{ rows: unknown[] } & Fixture>(newLost, period);
    const step = period === "last12Months" ? "month" : period === "last3Months" ? "week" : "day";
    expect(findingsOf("searchConsole.newLost", period, newLostEyeData({ result: result as never, rows: result.rows, step }, t, ENGLISH_FORMATS)).length).toBeGreaterThan(0);
  });

  test.each(PERIODS)("Rich results: %s", (period) => {
    const read = appearance.periods[period];
    const rows: AppearanceRow[] = read.kinds.map((kind) => ({
      key: kind.name, name: kind.name, clicks: kind.clicks, impressions: kind.impressions, ctr: kind.impressions > 0 ? kind.clicks / kind.impressions : 0, position: kind.position,
      pages: kind.pages, counted: kind.pages !== null, previousClicks: kind.previousClicks, change: kind.previousClicks === null ? null : kind.clicks - kind.previousClicks,
    }));
    const data = appearanceEyeData({ rows, performance: { totals: read.totals, previous: read.previous }, months: { months: read.months }, pagesShown: read.pagesShown }, t, ENGLISH_FORMATS);
    expect(findingsOf("searchConsole.appearance", period, data).length).toBeGreaterThan(0);
  });
});
