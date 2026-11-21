import type { Id } from "../_generated/dataModel";
import { readBrandWords, readCurve, readNewLost, readUpdates } from "../searchConsoleChanges";
import { readLookMonthsFor } from "../searchConsoleBreakdowns";
import { mainConsoleCountry } from "../searchConsoleCountries";
import { readDemandFor } from "../searchConsoleDemand";
import { readIndexingFor, readReasonFor, reasonAsked } from "../searchConsoleIndexing";
import { connectionOf } from "../searchConsoleListSources";
import { readListPage, readSplitList } from "../searchConsoleLists";
import { readChartFigures } from "../searchConsolePeriods";
import { readPerformance } from "../searchConsoleReads";
import { readTopKeywords } from "../searchConsoleTopKeywords";
import { readVolatilityFacts } from "../searchConsoleVolatility";
import { pageKindChoicesOf } from "../pageKinds";
import { findMySite, type SiteReader } from "../siteAccess";
import { periodSpan, spanBefore, stepOf, ukDay, type CalendarPeriod } from "../utils/calendarPeriods";
import { kindOf } from "../utils/indexingReasons";
import { isTrackedHold } from "../utils/websitePairing";
import { appearanceEyeData, appearanceRowsOf, curveEyeData, newLostEyeData, updateRowsOf, updatesEyeData } from "../utils/sees/eyeData/searchConsoleChanges";
import { demandEyeData, demandPartsOf } from "../utils/sees/eyeData/searchConsoleDemand";
import { indexingEyeData, indexingScreenOf, reasonEyeData, reasonNamesOf, reasonScreenOf } from "../utils/sees/eyeData/searchConsoleIndexing";
import { bandsEyeData, brandEyeData, competingEyeData, keywordsEyeData, listPageOf, lowCtrEyeData, pagesEyeData, trackedEyeData, volatilityEyeData } from "../utils/sees/eyeData/searchConsoleLists";
import { performanceEyeData } from "../utils/sees/eyeData/searchConsolePerformance";
import { placeRowNames, placesEyeData } from "../utils/sees/eyeData/searchConsolePlaces";
import { ENGLISH_FORMATS, ENGLISH_LANGUAGE, pageKindLabel, searchConsoleSeesWords, spanNameOf, withSeesWords } from "../utils/sees/eyeData/searchConsoleWords";
import { englishWords } from "../utils/sees/serverWords";
import type { EyeAsk, EyeBuilders, EyeReads, EyeRun } from "./types";

/**
 * Search Console's screens for a chat app's question, built as the screens build them
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The pattern is Google Analytics Overview's
 * (`googleAnalytics.ts`): the screens' own reader helpers as reads, each screen's own pure figures function
 * (`utils/sees/eyeData/searchConsole*.ts`), English words from `messages/en.json` (`utils/sees/serverWords.ts`), and the
 * words `SearchConsoleSees` adds beside every screen's figures (`searchConsoleSeesWords`).
 *
 * Each screen as it opens: web results, the website's main home country, every device, no filter, nothing ticked, the
 * opening sort and the first 25 rows. Only what's saved is read: where a screen would ask Google for these dates (a read
 * answering `live`), the builder hands back null. A keyword's and a page's own screens, and their countries and devices,
 * ask Google whenever they open, so they have no builder here.
 */

/** The connection's parts the screens read first: its newest day, its state and the website's main home country. Null for a competitor's website. */
async function connectionForEye(reader: SiteReader, args: Record<string, unknown>) {
  const site = await findMySite(reader, args.siteId as Id<"companyWebsites">);
  if (!site || isTrackedHold(site.hold)) return null;
  const connection = await connectionOf(reader, site.hold._id);
  if (!connection) return null;
  return { newestDay: connection.newestDay ?? null, status: connection.status, main: mainConsoleCountry(site.hold) };
}

/** The website's Classifications, A to Z by name, as Pages' filter offers them (`pageKinds.pageKindChoicesOf`); null for none. */
async function kindChoicesForEye(reader: SiteReader, args: Record<string, unknown>) {
  const site = await findMySite(reader, args.siteId as Id<"companyWebsites">);
  return site ? await pageKindChoicesOf(reader, site.hold) : null;
}

export const SEARCH_CONSOLE_EYE_READS: EyeReads = {
  "sc.connection": connectionForEye,
  "sc.pageKinds": kindChoicesForEye,
  "sc.performance": (reader, args) => readPerformance(reader, args as never),
  "sc.listPage": (reader, args) => readListPage(reader, args as never),
  "sc.splitList": (reader, args) => readSplitList(reader, args as never),
  "sc.topKeywords": (reader, args) => readTopKeywords(reader, args as never),
  "sc.chartFigures": (reader, args) => readChartFigures(reader, args as never),
  "sc.curve": (reader, args) => readCurve(reader, args as never),
  "sc.updates": (reader, args) => readUpdates(reader, args as never),
  "sc.newLost": (reader, args) => readNewLost(reader, args as never),
  "sc.volatility": (reader, args) => readVolatilityFacts(reader, args as never),
  "sc.brandWords": async (reader, args) => (await readBrandWords(reader, args as never)).names,
  "sc.demand": (reader, args) => readDemandFor(reader, args as never),
  "sc.lookMonths": (reader, args) => readLookMonthsFor(reader, args as never),
  "sc.indexing": (reader, args) => readIndexingFor(reader, args as never),
  "sc.indexingReason": (reader, args) => readReasonFor(reader, args as never),
};

// ---------------------------------------------------------------------------
// The dates, the words and the lists, as every screen reads them
// ---------------------------------------------------------------------------

type Connection = NonNullable<Awaited<ReturnType<typeof connectionForEye>>>;
type KindChoices = Awaited<ReturnType<typeof kindChoicesForEye>>;
type Performance = Awaited<ReturnType<typeof readPerformance>>;
type ListPageAnswer = Awaited<ReturnType<typeof readListPage>>;
type SplitAnswer = Awaited<ReturnType<typeof readSplitList>>;
type ChartAnswer = Awaited<ReturnType<typeof readChartFigures>>;

/** The dates the screens read for a period (`useSearchConsoleRange`): its first day to Google's newest, and what it's set against. */
type Range = { from: string; to: string; days: number; step: "day" | "week" | "month"; period: CalendarPeriod; before: { from: string; to: string } };

function rangeOf(period: CalendarPeriod, newestDay: string): Range | null {
  const span = periodSpan(period, ukDay(), newestDay);
  if (!span) return null;
  const days = Math.round((Date.parse(`${span.to}T00:00:00Z`) - Date.parse(`${span.from}T00:00:00Z`)) / 86_400_000) + 1;
  const before = spanBefore(period, span);
  return { from: span.from, to: span.to, days, step: stepOf(period), period, before: { from: before.from, to: before.to } };
}

/** The website's connection and the dates, or null where the screens show no figures: not connected, choosing, or no days of the period yet. */
async function screenOf(run: EyeRun, ask: EyeAsk): Promise<{ connection: Connection; range: Range } | null> {
  const connection = await run("sc.connection", { siteId: ask.siteId }) as Connection | null;
  if (!connection?.newestDay || connection.status === "CHOOSING") return null;
  const range = rangeOf(ask.period, connection.newestDay);
  return range ? { connection, range } : null;
}

/** The screens' words, in English. */
const words = () => englishWords("searchConsole");

/** A screen's figures with the words `SearchConsoleSees` adds beside them, or null where the screen shows nothing. */
function worded(data: unknown, range: Range): unknown {
  if (data === undefined || data === null) return null;
  const seesWords = searchConsoleSeesWords({
    sees: englishWords("searchConsole.sees"),
    before: englishWords("common.periods")(`before.${range.period}`),
    nowName: spanNameOf({ from: range.from, to: range.to }, "en"),
    beforeName: spanNameOf(range.before, "en"),
  });
  return withSeesWords(data, seesWords);
}

/** Web results for the dates, all of the main home country, as every screen asks. */
const datesOf = (siteId: Id<"companyWebsites">, range: Range) => ({ siteId, searchType: "web" as const, from: range.from, to: range.to, period: range.period });

/** Performance's read where it's saved: null where the screen would ask Google. */
const savedFigures = (figures: Performance | null) => (figures && !figures.live ? figures : null);

/** Rows a list's first page shows, and each heading's first press (`SearchConsoleTables`' `FIRSTS`). */
const OPENING_ROWS = 25;
const FIRST_DIRECTION = { clicks: "desc", gap: "desc", impressions: "desc", movedBy: "desc" } as const;

/**
 * A list's first page as its screen opens it (`useSearchConsoleList`): no filter, the opening sort. Null while it's first
 * being built, and where the screen would ask Google for it (`live`).
 */
async function listPage(run: EyeRun, siteId: Id<"companyWebsites">, range: Range, ask: { dimension: "query" | "page"; view?: string; inCountry?: boolean; opening: keyof typeof FIRST_DIRECTION }) {
  const answer = await run("sc.listPage", {
    ...datesOf(siteId, range),
    dimension: ask.dimension,
    ...(ask.view ? { view: ask.view } : {}),
    ...(ask.inCountry ? { inCountry: true } : {}),
    sort: ask.opening,
    direction: FIRST_DIRECTION[ask.opening],
    page: 1,
    rows: OPENING_ROWS,
  }) as ListPageAnswer | null;
  return answer && !answer.live && !answer.preparing ? answer : null;
}

/** A short list whole, where it's saved: null where the screen would ask Google. */
const savedSplit = (split: SplitAnswer | null) => (split && !split.live ? split : null);

export const SEARCH_CONSOLE_EYES: EyeBuilders = {
  /** Performance (`search-console/[siteId]/page.tsx`, `usePerformanceEye`). */
  "searchConsole.performance": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const dates = datesOf(ask.siteId, range);
    const chart = { siteId: ask.siteId, searchType: "web", step: range.step };
    const [figures, top, pages, devices, looks, brandNow, brandBefore, choices] = await Promise.all([
      run("sc.performance", dates) as Promise<Performance | null>,
      run("sc.topKeywords", dates) as Promise<Awaited<ReturnType<typeof readTopKeywords>> | null>,
      run("sc.listPage", { ...dates, dimension: "page", inCountry: true, page: 1, rows: OPENING_ROWS }) as Promise<ListPageAnswer | null>,
      run("sc.splitList", { ...dates, dimension: "device" }) as Promise<SplitAnswer | null>,
      run("sc.splitList", { ...dates, dimension: "appearance" }) as Promise<SplitAnswer | null>,
      run("sc.chartFigures", { ...chart, from: range.from, to: range.to }) as Promise<ChartAnswer | null>,
      run("sc.chartFigures", { ...chart, from: range.before.from, to: range.before.to }) as Promise<ChartAnswer | null>,
      run("sc.pageKinds", { siteId: ask.siteId }) as Promise<KindChoices>,
    ]);
    const keywords = top && !top.live ? top : undefined;
    const data = performanceEyeData({
      figures: savedFigures(figures),
      brandNow,
      brandBefore,
      dates: { from: range.from, to: range.to, days: range.days, before: range.before },
      raw: {
        brand: keywords?.brand,
        keywords: keywords?.rows,
        kinds: pages && !pages.live ? (pages.summary?.kinds ?? []) : undefined,
        devices: savedSplit(devices)?.rows,
        looks: savedSplit(looks)?.rows,
      },
    }, { t: words(), kind: pageKindLabel(choices, englishWords("sites.common")), number: ENGLISH_FORMATS.number, oneDecimal: ENGLISH_FORMATS.oneDecimal });
    return worded(data, range);
  },

  /** Keywords (`keywords/page.tsx`). */
  "searchConsole.keywords": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const [page, figures] = await Promise.all([
      listPage(run, ask.siteId, range, { dimension: "query", opening: "clicks" }),
      run("sc.performance", datesOf(ask.siteId, range)) as Promise<Performance | null>,
    ]);
    const data = keywordsEyeData({ page: listPageOf(page?.summary, page?.rows), websiteClicks: savedFigures(figures)?.totals?.clicks ?? null, ticked: [] }, words());
    return worded(data, range);
  },

  /** Pages (`pages/page.tsx`): the main home country's own pages. */
  "searchConsole.pages": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const [page, figures, choices] = await Promise.all([
      listPage(run, ask.siteId, range, { dimension: "page", inCountry: true, opening: "clicks" }),
      run("sc.performance", datesOf(ask.siteId, range)) as Promise<Performance | null>,
      run("sc.pageKinds", { siteId: ask.siteId }) as Promise<KindChoices>,
    ]);
    const data = pagesEyeData({ page: listPageOf(page?.summary, page?.rows), countryClicks: savedFigures(figures)?.totals?.clicks ?? null, ticked: [], kinds: choices }, words());
    return worded(data, range);
  },

  /** Brand and non-brand (`brand-and-non-brand/page.tsx`). */
  "searchConsole.brand": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const [page, brandWords, chart, every] = await Promise.all([
      listPage(run, ask.siteId, range, { dimension: "query", opening: "clicks" }),
      run("sc.brandWords", { siteId: ask.siteId }) as Promise<string[] | null>,
      run("sc.chartFigures", { siteId: ask.siteId, searchType: "web", from: range.from, to: range.to, step: range.step }) as Promise<ChartAnswer | null>,
      run("sc.performance", datesOf(ask.siteId, range)) as Promise<Performance | null>,
    ]);
    const figures = savedFigures(every);
    const data = brandEyeData({
      page: listPageOf(page?.summary, page?.rows),
      brandWords,
      periods: chart?.periods,
      every: figures ? { totals: figures.totals, previous: figures.previous } : undefined,
    }, words());
    return worded(data, range);
  },

  /** Position bands (`position-bands/page.tsx`). */
  "searchConsole.bands": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const [page, chart] = await Promise.all([
      listPage(run, ask.siteId, range, { dimension: "query", opening: "clicks" }),
      run("sc.chartFigures", { siteId: ask.siteId, searchType: "web", from: range.from, to: range.to, step: range.step }) as Promise<ChartAnswer | null>,
    ]);
    return worded(bandsEyeData({ page: listPageOf(page?.summary, page?.rows), periods: chart?.periods }, words()), range);
  },

  /** Shown but not clicked (`shown-but-not-clicked/page.tsx`): the main home country's own pages. */
  "searchConsole.lowCtr": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const [page, choices] = await Promise.all([
      listPage(run, ask.siteId, range, { dimension: "page", view: "lowCtr", inCountry: true, opening: "gap" }),
      run("sc.pageKinds", { siteId: ask.siteId }) as Promise<KindChoices>,
    ]);
    return worded(lowCtrEyeData({ summary: page?.summary, rows: page?.rows ?? null, kinds: choices }, words()), range);
  },

  /** Keyword cannibalisation (`pages-competing/page.tsx`). */
  "searchConsole.competing": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const page = await listPage(run, ask.siteId, range, { dimension: "query", view: "competing", opening: "impressions" });
    return worded(competingEyeData({ summary: page?.summary, rows: page?.rows ?? null }, words()), range);
  },

  /** Tracked keywords (`tracked/keywords/page.tsx`). */
  "searchConsole.trackedKeywords": async (run, ask) => await trackedEye(run, ask, "keywords"),

  /** Tracked pages (`tracked/pages/page.tsx`): the main home country's own pages. */
  "searchConsole.trackedPages": async (run, ask) => await trackedEye(run, ask, "pages"),

  /** Volatility (`volatility/page.tsx`): its own newest days, whatever the dates, and the chart of the dates. */
  "searchConsole.volatility": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const [facts, page, chart] = await Promise.all([
      run("sc.volatility", { siteId: ask.siteId, language: "en" }) as Promise<Awaited<ReturnType<typeof readVolatilityFacts>> | null>,
      // Its own ready-made day, never asked of Google.
      run("sc.listPage", { ...datesOf(ask.siteId, range), dimension: "query", view: "volatility", sort: "movedBy", direction: FIRST_DIRECTION.movedBy, page: 1, rows: OPENING_ROWS }) as Promise<ListPageAnswer | null>,
      run("sc.chartFigures", { siteId: ask.siteId, searchType: "web", from: range.from, to: range.to, step: range.step }) as Promise<ChartAnswer | null>,
    ]);
    const rows = page && !page.preparing ? page.rows : null;
    return worded(volatilityEyeData({ facts, rows, periods: chart?.periods }, words(), ENGLISH_FORMATS), range);
  },

  /** Countries and devices (`countries-and-devices/page.tsx`): every country, and the main home country's devices. */
  "searchConsole.places": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { connection, range } = screen;
    const dates = datesOf(ask.siteId, range);
    const [countryList, deviceList] = await Promise.all([
      run("sc.splitList", { ...dates, dimension: "country" }) as Promise<SplitAnswer | null>,
      run("sc.splitList", { ...dates, dimension: "device" }) as Promise<SplitAnswer | null>,
    ]);
    const countries = savedSplit(countryList);
    const devices = savedSplit(deviceList);
    const t = words();
    const named = placeRowNames(t, ENGLISH_LANGUAGE);
    const data = placesEyeData({
      chosen: connection.main,
      countries: countries && !countries.preparing ? countries.rows.map((row) => ({ ...row, name: named.country(row.key) })) : undefined,
      summary: countries?.summary ?? null,
      comparable: countries?.comparable ?? false,
      devices: devices && !devices.preparing ? devices.rows.map((row) => ({ ...row, name: named.device(row.key) })) : undefined,
      devicesComparable: devices?.comparable ?? false,
      ticked: [],
    }, t, ENGLISH_LANGUAGE);
    return worded(data, range);
  },

  /** Demand by Classification (`demand-by-service/page.tsx`): the main home country's own pages. */
  "searchConsole.services": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const [every, demand, choices] = await Promise.all([
      run("sc.performance", datesOf(ask.siteId, range)) as Promise<Performance | null>,
      run("sc.demand", { siteId: ask.siteId, from: range.from, to: range.to, period: range.period }) as Promise<Awaited<ReturnType<typeof readDemandFor>> | null>,
      run("sc.pageKinds", { siteId: ask.siteId }) as Promise<KindChoices>,
    ]);
    const figures = savedFigures(every);
    const answer = demand && !demand.live ? demand : null;
    const parts = demandPartsOf(answer, figures ? { previous: figures.previous } : undefined, pageKindLabel(choices, englishWords("sites.common")));
    return worded(demandEyeData({ parts, totals: figures?.totals ?? null, previous: figures?.previous ?? null }, words()), range);
  },

  /** Indexing (`indexing/page.tsx`). Null where the dates' clicks are asked of Google. */
  "searchConsole.indexing": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const answer = await run("sc.indexing", { siteId: ask.siteId, from: range.from, to: range.to, period: range.period }) as Awaited<ReturnType<typeof readIndexingFor>>;
    if (!answer || answer.live) return null;
    const t = englishWords("searchConsole.indexing");
    const { rows, boxes } = indexingScreenOf(answer, answer.figures, reasonNamesOf(t));
    return worded(indexingEyeData({ rows, boxes, answer, clickedPages: answer.figures?.clickedPages }, t), range);
  },

  /**
   * A reason's own page (`indexing/[reason]/page.tsx`), the reason in `ask.key`: its address on the screen, Google's words,
   * or words in them. Its pages' days shown are read by an action of the screen's own (`searchConsoleIndexingDays`), so
   * its boxes say them as the screen does while they're on their way. Null where the dates' clicks are asked of Google.
   */
  "searchConsole.indexingReason": async (run, ask) => {
    if (!ask.key) return null;
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const indexingAsk = { siteId: ask.siteId, from: range.from, to: range.to, period: range.period };
    const summary = await run("sc.indexing", indexingAsk) as Awaited<ReturnType<typeof readIndexingFor>>;
    const reason = summary ? reasonAsked(ask.key, summary.reasons.map((one) => one.reason)) : null;
    if (!reason) return null;
    const answer = await run("sc.indexingReason", { ...indexingAsk, reason }) as Awaited<ReturnType<typeof readReasonFor>>;
    if (!answer || answer.live) return null;
    const t = englishWords("searchConsole.indexing");
    const { rows, boxes } = reasonScreenOf(answer, answer.figures, null, kindOf(reason), `${ukDay().slice(0, 7)}-01`, t);
    return worded(reasonEyeData({ reason, rows, boxes }, t), range);
  },

  /** Click rate by position (`click-rate-by-position/page.tsx`). */
  "searchConsole.ctrCurve": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const curve = await run("sc.curve", { siteId: ask.siteId, searchType: "web", from: range.from, to: range.to }) as Awaited<ReturnType<typeof readCurve>> | null;
    if (!curve || curve.live) return null;
    // Mobile and desktop where they're kept with the periods; the screen asks Google for them otherwise.
    return worded(curveEyeData({ points: curve.points, before: curve.before ?? null, devices: curve.devices ?? null }, words()), range);
  },

  /** Google updates (`google-updates/page.tsx`): the dates' updates, and the dates' own days against the same number before. */
  "searchConsole.updates": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const dates = { siteId: ask.siteId, searchType: "web", from: range.from, to: range.to };
    const [kept, days] = await Promise.all([
      run("sc.updates", { ...dates, language: "en" }) as Promise<Awaited<ReturnType<typeof readUpdates>> | null>,
      run("sc.performance", dates) as Promise<Performance | null>,
    ]);
    if (!kept || kept.live) return null;
    return worded(updatesEyeData({ rows: updateRowsOf(kept.updates), days: savedFigures(days) }, words()), range);
  },

  /** New and lost (`new-and-lost/page.tsx`): the newest first, as the table opens. */
  "searchConsole.newLost": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const result = await run("sc.newLost", { ...datesOf(ask.siteId, range), step: range.step, sort: "when", direction: "desc", page: 1, rows: OPENING_ROWS }) as Awaited<ReturnType<typeof readNewLost>> | null;
    if (!result || result.preparing) return null;
    return worded(newLostEyeData({ result, rows: result.rows, step: range.step }, words(), ENGLISH_FORMATS), range);
  },

  /** Rich results (`rich-results/page.tsx`). Each kind's pages where they're counted with the periods. */
  "searchConsole.appearance": async (run, ask) => {
    const screen = await screenOf(run, ask);
    if (!screen) return null;
    const { range } = screen;
    const dates = { siteId: ask.siteId, searchType: "web", from: range.from, to: range.to };
    const [split, performance, pages, months] = await Promise.all([
      run("sc.splitList", { ...dates, dimension: "appearance" }) as Promise<SplitAnswer | null>,
      run("sc.performance", dates) as Promise<Performance | null>,
      run("sc.listPage", { ...datesOf(ask.siteId, range), dimension: "page", inCountry: true, page: 1, rows: OPENING_ROWS }) as Promise<ListPageAnswer | null>,
      run("sc.lookMonths", { siteId: ask.siteId, searchType: "web" }) as Promise<Awaited<ReturnType<typeof readLookMonthsFor>> | null>,
    ]);
    const appearances = savedSplit(split)?.rows;
    if (!appearances) return null;
    const t = words();
    const rows = appearanceRowsOf(appearances, appearances.every((row) => row.count !== null), undefined, t);
    const pagesShown = pages && !pages.live ? (pages.summary?.rows ?? null) : null;
    return worded(appearanceEyeData({ rows, performance: savedFigures(performance), months, pagesShown }, t, ENGLISH_FORMATS), range);
  },
};

/** Tracked keywords' and Tracked pages' eye: the list of what's tracked, and every click the country had. */
async function trackedEye(run: EyeRun, ask: EyeAsk, kind: "keywords" | "pages") {
  const screen = await screenOf(run, ask);
  if (!screen) return null;
  const { range } = screen;
  const [page, figures] = await Promise.all([
    listPage(run, ask.siteId, range, { dimension: kind === "keywords" ? "query" : "page", view: "tracked", ...(kind === "pages" ? { inCountry: true } : {}), opening: "clicks" }),
    run("sc.performance", datesOf(ask.siteId, range)) as Promise<Performance | null>,
  ]);
  const data = trackedEyeData({ page: listPageOf(page?.summary, page?.rows), countryClicks: savedFigures(figures)?.totals?.clicks ?? null, ticked: [], update: null, kind }, words());
  return worded(data, range);
}
