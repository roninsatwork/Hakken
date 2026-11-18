"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { FileSearch } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { reasonOf, reasonSlug, type ReasonKind } from "@/convex/utils/indexingReasons";
import { EXAMPLE_COLUMNS, type PageShown, type ReasonBox, type ReasonPage } from "@/convex/utils/indexingFigures";
import { DAYS_KEPT, dayAfter, restDoneBy } from "@/convex/utils/pageIndexChecks";
import { ukDay } from "@/convex/utils/calendarPeriods";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import type { DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { BarsCard } from "@/src/ui/components/screens/BarsCard";
import { DaysChart } from "@/src/ui/components/screens/DaysChart";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { CHART_COMPARATOR_GREY, CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_EMERALD, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { datedRow } from "../../sites/_components/datedRows";
import type { SiteSeries } from "../../sites/_components/SiteCharts";
import { CUT_COLUMN, RecordLinkCell } from "../../sites/_components/SiteCells";
import { formatNumber, formatShortDay } from "../../sites/_components/siteFormat";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { usePerformanceDates } from "./PerformanceParts";
import { hasFigures, type LiveProblemKind } from "./SearchConsoleNotices";
import { useLiveAsk, useRecordHref } from "./searchConsoleRecords";
import { countryArg, periodArg, useSearchConsoleCountry, useSearchConsoleHref, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";
import type { IndexingBoxes as Boxes, IndexingRow, ReasonNames } from "./indexingSees";

/**
 * Search Console → Indexing's parts (search-console-indexing-v1-plan-2026-11-18.md; the canvas's V1, drawn on the
 * app's own parts in `docs/plans/assets/search-console-indexing-v1/board.tsx.txt`): the reads, kept or asked of Google;
 * the summary's boxes, its line on how far the checks have got, its chart and its table; and a reason's boxes, its
 * chart and its Examples. Google's terms name things; every sentence around them is in everyday words
 * (docs/developer/writing-guide.md, "Google's own terms stay").
 */

const note = (words: ReactNode) => <span className="text-secondary">{words}</span>;
const mono = (value: string, strong = false) => <span className={`font-mono text-[12px] ${strong ? "text-foreground" : "text-secondary"}`}>{value}</span>;
const heading = (words: string, hover: string) => <span title={hover}>{words}</span>;
const day = (value: string | null | undefined) => (value ? formatShortDay(value) : "–");

/** A day in words, for the middle of a sentence: "1 December". */
function useLongDay(): (day: string) => string {
  const locale = useLocale();
  const format = useMemo(() => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { day: "numeric", month: "long", timeZone: "UTC" }), [locale]);
  return useCallback((value: string) => format.format(new Date(`${value}T00:00:00Z`)), [format]);
}

/** A month's name: "November". */
function useMonthName(): (day: string) => string {
  const locale = useLocale();
  const format = useMemo(() => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { month: "long", timeZone: "UTC" }), [locale]);
  return useCallback((value: string) => format.format(new Date(`${value}T00:00:00Z`)), [format]);
}

/** A reason in the reader's words: Google's term, its short name, its plain line and its Source; Google's own words for one not on the list. */
export function useReasonNames(): (words: string) => ReasonNames {
  const t = useTranslations("searchConsole.indexing");
  return useCallback((words: string) => {
    const reason = reasonOf(words);
    if (!reason) return { name: words, short: words, means: "", source: "–" };
    return { name: t(`reasons.${reason.key}.words`), short: t(`reasons.${reason.key}.short`), means: t(`reasons.${reason.key}.means`), source: t(`sources.${reason.source}`) };
  }, [t]);
}

/** What the reads are asked: the dates and the country chosen. Null until the website's connection is read. */
function useIndexingAsk() {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const ask = status ? { siteId, from: range.from, to: range.to, ...periodArg(range), ...countryArg(country) } : null;
  // Google is asked only for dates it has days for.
  const canAsk = Boolean(status && hasFigures(status)) && !range.waiting && range.days > 0;
  return { ask, canAsk };
}

type LiveState = { problem: LiveProblemKind | null; retry: () => void };

/** The summary: the checks as kept, and the dates' clicks, kept or asked of Google. */
export function useIndexing() {
  const { ask, canAsk } = useIndexingAsk();
  const kept = useQuery(api.searchConsoleIndexing.searchConsoleIndexing, ask ?? "skip");
  const live = useLiveAsk(api.searchConsoleIndexing.searchConsoleLiveIndexing, ask && canAsk && kept?.live ? ask : null);
  const liveFigures = live.answer?.ok ? live.answer.figures : null;
  const state: LiveState = { problem: live.answer && !live.answer.ok ? live.answer.problem : null, retry: live.retry };
  return {
    answer: kept,
    figures: kept?.figures ?? liveFigures,
    /** The clicks are still on their way from Google. */
    waiting: Boolean(kept?.live && canAsk && live.answer === undefined),
    /** Asked of Google, the dates' pages stopped at Google's most an ask (`GOOGLE_MOST_ROWS`): the table says so. */
    cut: live.answer?.ok ? (live.answer.cut ?? null) : null,
    ...state,
  };
}

/** A reason's own page: its pages as kept, the dates' clicks kept or asked of Google, and the days of pages kept. */
export function useIndexingReason(words: string) {
  const { ask, canAsk } = useIndexingAsk();
  const [country] = useSearchConsoleCountry();
  const siteId = useSearchConsoleSiteId();
  const reasonAsk = ask ? { ...ask, reason: words } : null;
  const kept = useQuery(api.searchConsoleIndexing.searchConsoleIndexingReason, reasonAsk ?? "skip");
  const live = useLiveAsk(api.searchConsoleIndexing.searchConsoleLiveIndexing, reasonAsk && canAsk && kept?.live ? reasonAsk : null);
  const days = useLiveAsk(api.searchConsoleIndexing.searchConsoleIndexingDays, kept && kept.pages.length > 0 ? { siteId, reason: words, ...countryArg(country) } : null);
  const figures = kept?.figures ?? (live.answer?.ok ? { ...live.answer.figures, byPage: live.answer.byPage } : null);
  const shown = useMemo(() => (days.answer?.ok ? new Map<string, PageShown>(days.answer.pages.map((page) => [page.page, { lastShown: page.lastShown, days: page.days }])) : null), [days.answer]);
  return {
    answer: kept,
    figures,
    days: days.answer?.ok ? days.answer : null,
    daysLoading: days.answer === undefined && kept !== undefined && kept !== null && kept.pages.length > 0,
    shown,
    problem: live.answer && !live.answer.ok ? live.answer.problem : null,
    /** Asked of Google, the dates' pages stopped at Google's most an ask: the table says so. */
    cut: live.answer?.ok ? (live.answer.cut ?? null) : null,
    retry: live.retry,
  };
}

// ── The summary ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The four boxes (the plan's item 2), from whichever reasons the website has. */
export function IndexingBoxes({ boxes, loadingClicks }: { boxes: Boxes; loadingClicks: boolean }) {
  const t = useTranslations("searchConsole.indexing.boxes");
  const { inNow } = usePerformanceDates();
  const clicksLine = boxes.oneIn === null
    ? (boxes.allClicks === null ? "" : t("clicksNone", { dates: inNow }))
    : boxes.oneIn === 1 ? t("clicksMost", { dates: inNow }) : t("clicksShare", { oneIn: formatNumber(boxes.oneIn), dates: inNow });
  // Nothing checked yet: no figure, rather than a 0 that reads as "no problems" (18 November 2026, before the first run).
  if (boxes.notIndexed + boxes.indexed === 0) {
    return (
      <FigureRow>
        <Figure label={t("notIndexed")} value="–" detail={note(t("notChecked"))} />
        <Figure label={t("indexed")} value="–" detail={note(t("notChecked"))} />
        <Figure label={t("clicks")} value="–" detail={note("")} />
      </FigureRow>
    );
  }
  return (
    <FigureRow>
      <Figure
        label={t("notIndexed")}
        value={formatNumber(boxes.notIndexed)}
        detail={note(boxes.reasons > 0 ? t("reasons", { count: boxes.reasons }) : t("noReasons"))}
      />
      <Figure label={t("indexed")} value={formatNumber(boxes.indexed)} detail={note(t("indexedDetail"))} />
      {boxes.biggest ? (
        <Figure label={boxes.biggest.name} value={formatNumber(boxes.biggest.pages)} detail={note(t("biggest", { pages: formatNumber(boxes.biggest.pages), all: formatNumber(boxes.notIndexed) }))} />
      ) : null}
      <Figure label={t("clicks")} value={loadingClicks ? "–" : formatNumber(boxes.clicks)} detail={note(loadingClicks ? "" : clicksLine)} />
    </FigureRow>
  );
}

/** One line on how far the checks have got, then the way to Google's own report (the plan's item 3). */
export function IndexingProgress({ checks, on, report }: { checks: { checked: number; known: number } | null; on: boolean; report: string | null }) {
  const t = useTranslations("searchConsole.indexing.progress");
  const longDay = useLongDay();
  const line = !checks
    ? t(on ? "none" : "noneOff")
    : checks.checked >= checks.known
      ? t("allChecked", { known: formatNumber(checks.known) })
      : t("checked", { checked: formatNumber(checks.checked), known: formatNumber(checks.known), day: longDay(restDoneBy(ukDay(), checks.known - checks.checked)) });
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[13px] text-secondary">{line}</p>
      {report ? <a href={report} target="_blank" rel="noreferrer" className="w-fit text-[13px] text-secondary hover:text-foreground">{t("fullReport")}</a> : null}
    </div>
  );
}

const CHART_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET, CHART_SERIES_AMBER, CHART_SERIES_ROSE, CHART_SERIES_EMERALD, CHART_COMPARATOR_GREY];

/**
 * The table over time, as Google's own Page indexing chart draws it (Anthony, 18 November 2026: "its the graph for the
 * table below over time"): a bar for each day kept, split into the reasons the table lists, each a tick box in Google's
 * words and drawn by its short name. The days are the ones kept, whatever the dates chosen, as Google's chart shows its
 * last three months: a day's counts are kept from the day the checks began. It took the place of a chart of the day
 * Google last visited each page, which drew nothing on Last month, as every visit was in November.
 */
export function IndexingDaysCard({ rows, days, host }: { rows: readonly IndexingRow[]; days: ReadonlyArray<{ day: string; reasons: ReadonlyArray<{ reason: string; pages: number }> }>; host: string }) {
  const t = useTranslations("searchConsole.indexing.chart");
  const longDay = useLongDay();
  // The table's reasons first, in its order, then any a day held that the newest checks no longer give.
  const reasons = useMemo(() => {
    const listed = rows.map((row) => ({ key: row.key, name: row.name, short: row.short }));
    const gone = [...new Set(days.flatMap((one) => one.reasons.map((reason) => reason.reason)))]
      .filter((reason) => !listed.some((one) => one.key === reason))
      .map((reason) => ({ key: reason, name: reason, short: reason }));
    return [...listed, ...gone];
  }, [rows, days]);
  const [ticked, setTicked] = useState<string[] | null>(null);
  const shown = ticked ?? reasons.map((one) => one.key);
  // Each reason keeps its colour whichever are ticked.
  const keyOf = useMemo(() => new Map(reasons.map((one, at) => [one.key, `r${at}`])), [reasons]);
  const series: SiteSeries[] = reasons.map((one, at) => ({ one, at })).filter(({ one }) => shown.includes(one.key))
    .map(({ one, at }) => ({ key: `r${at}`, name: one.short, colour: CHART_COLOURS[at % CHART_COLOURS.length] }));
  // Every day kept, ending on the newest, as Google's chart spans its three months: a day before the checks began, or a
  // night they didn't run, has no bar. The newest bar alone says its total.
  const newest = days.at(-1)?.day ?? null;
  const data = useMemo(() => {
    if (!newest) return [];
    const byDay = new Map(days.map((one) => [one.day, one]));
    // Each row carries its day (`datedRow`), so Google's updates mark the chart as on every dated chart.
    return Array.from({ length: DAYS_KEPT }, (_, at) => dayAfter(newest, at - (DAYS_KEPT - 1))).map((day) => datedRow(
      { day },
      Object.fromEntries((byDay.get(day)?.reasons ?? []).map((reason) => [keyOf.get(reason.reason) ?? reason.reason, reason.pages])),
    ));
  }, [days, newest, keyOf]);
  const newestLabel = newest ? formatShortDay(newest) : null;
  return (
    <BarsCard
      title={t("title")}
      hint={days.length > 0 ? t("hint", { day: longDay(days[0].day) }) : t("hintNone")}
      exportName={`${host}-indexing-each-day`}
      csvHeading={t("day")}
      host={host}
      waiting={null}
      controls={[{ kind: "ticks", key: "show", label: t("show"), everyWord: t("every"), choices: reasons.map((one) => ({ key: one.key, label: one.name })), ticked: shown, onChange: setTicked }]}
      nothingTicked={reasons.length > 0 && shown.length === 0 ? t("nothingTicked") : null}
      rows={data}
      series={series}
      figure={t("figure")}
      stacked
      upright
      // The newest day's total on top of its bar; none on each reason's part, nor on the days before, so 90 never crowd it.
      labels={(_value, key, row) => (key === series.at(-1)?.key && row.label === newestLabel ? formatNumber(series.reduce((sum, entry) => sum + (Number(row[entry.key]) || 0), 0)) : null)}
      totalOf={(row) => series.reduce((sum, entry) => sum + (Number(row[entry.key]) || 0), 0)}
      anything={data.some((row) => series.some((entry) => Number((row as Record<string, unknown>)[entry.key]) > 0))}
      empty={t("empty")}
    />
  );
}

export type ReasonSortKey = "reason" | "source" | "pages" | "clicks" | "shown" | "crawled";
const WHY_SORTS: SiteSortColumns<IndexingRow, ReasonSortKey> = {
  reason: { value: (row) => row.name, first: "asc" },
  source: { value: (row) => row.source, first: "asc" },
  pages: { value: (row) => row.pages, first: "desc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  shown: { value: (row) => row.impressions, first: "desc" },
  crawled: { value: (row) => row.crawled, first: "desc" },
};

/**
 * A lean table's search and sort by its headings (the board's `LeanTable`), for the page that draws it under its own
 * header and pages it: the rows matching the words searched, in order.
 */
export function useLeanTable<Row extends { key: string }, Key extends string>(rows: readonly Row[] | undefined, sorts: SiteSortColumns<Row, Key>, opening: Key, searchText: (row: Row) => string) {
  const [search, setSearch, term] = useSiteSearch();
  const matching = useMemo(() => {
    const matches = wordStartMatcher(term.toLowerCase());
    return rows && matches ? rows.filter((row) => matches(searchText(row).toLowerCase())) : rows;
  }, [rows, term, searchText]);
  const { rows: ordered, tableSort } = useSiteSortedList(matching, sorts, { opening, name: (row) => row.key });
  // Paged by the page that draws it (`useSitePager`), as every Sites table is.
  return { search, setSearch, term, ordered, tableSort };
}

/** Why pages aren't indexed: its search, sort and pages. The most pages first. */
export function useReasonsTable(rows: readonly IndexingRow[] | undefined) {
  return useLeanTable(rows, WHY_SORTS, "pages", reasonSearchText);
}
const reasonSearchText = (row: IndexingRow) => `${row.name} ${row.key}`;

/**
 * Why pages aren't indexed (the plan's item 5), lean: Reason in Google's words with its plain line on hover, Source,
 * Pages, Clicks, Shown and Crawled. Each row opens its reason's page. Its columns, and its download's.
 */
export function useReasonColumns(): { columns: DataTableColumn<IndexingRow>[]; download: Array<{ header: string; value: (row: IndexingRow) => string | number | null }> } {
  const t = useTranslations("searchConsole.indexing.table");
  const siteId = useSearchConsoleSiteId();
  const hrefOf = useSearchConsoleHref(siteId);
  const { inNow } = usePerformanceDates();
  return {
    download: [
      { header: t("reason"), value: (row) => row.name }, { header: t("source"), value: (row) => row.source }, { header: t("pages"), value: (row) => row.pages },
      { header: t("clicks"), value: (row) => row.clicks }, { header: t("impressions"), value: (row) => row.impressions }, { header: t("lastCrawled"), value: (row) => row.crawled ?? "" },
    ],
    columns: [
      {
        key: "reason", header: t("reason"), sortable: true, className: `${CUT_COLUMN.first} min-w-[160px]`,
        cell: (row) => <RecordLinkCell cut href={hrefOf(`indexing/${row.slug}`)} hover={row.means || row.name}>{row.name}</RecordLinkCell>,
      },
      { key: "source", header: t("source"), sortable: true, cell: (row) => <span className="block truncate text-[13px] text-secondary">{row.source}</span> },
      { key: "pages", header: t("pages"), align: "right", sortable: true, cell: (row) => mono(formatNumber(row.pages), true) },
      { key: "clicks", header: heading(t("clicks"), t("clicksHover", { dates: inNow })), align: "right", sortable: true, cell: (row) => mono(formatNumber(row.clicks)) },
      { key: "shown", header: heading(t("shown"), t("impressions")), align: "right", sortable: true, cell: (row) => mono(formatNumber(row.impressions)) },
      { key: "crawled", header: heading(t("crawled"), t("lastCrawled")), align: "right", sortable: true, className: "whitespace-nowrap", cell: (row) => mono(day(row.crawled)) },
    ],
  };
}

/** A lean table's empty line's icon. */
export const tableIcon = <FileSearch className="h-8 w-8 text-muted/30" />;

// ── A reason's own page ──────────────────────────────────────────────────────────────────────────────────────────

/** A reason's four boxes, chosen by its kind (the plan's item 2 of a reason's page). */
export function ReasonBoxes({ boxes }: { boxes: readonly ReasonBox[] }) {
  const t = useTranslations("searchConsole.indexing.reason.boxes");
  const tb = useTranslations("searchConsole.indexing.boxes");
  const { inNow } = usePerformanceDates();
  const longDay = useLongDay();
  const monthName = useMonthName();
  const figure = (box: ReasonBox): { label: string; value: string; detail: string } => {
    switch (box.key) {
      case "pages": return { label: t("pages"), value: formatNumber(box.value), detail: t("pagesDetail", { checked: formatNumber(box.checked) }) };
      case "lastShown": return { label: t("lastShown"), value: box.loading ? "–" : day(box.day), detail: box.loading ? "" : box.day ? t("lastShownDetail", { day: longDay(box.day) }) : t("neverShown") };
      case "stillClicked": return { label: t("stillClicked"), value: formatNumber(box.value), detail: t("stillClickedDetail", { dates: capital(inNow) }) };
      case "sitemap": return { label: t("sitemap"), value: formatNumber(box.value), detail: box.value > 0 ? t(box.still ? "sitemapStill" : "sitemapAsks") : t("sitemapNone") };
      case "clicks": {
        const ratio = box.value > 0 && box.all > 0 ? box.all / box.value : null;
        const said = ratio === null ? tb("clicksNone", { dates: inNow }) : ratio < 1.5 ? tb("clicksMost", { dates: inNow }) : tb("clicksShare", { oneIn: formatNumber(roundOneIn(ratio)), dates: inNow });
        return { label: t("clicks"), value: formatNumber(box.value), detail: said };
      }
      case "lastVisited": return { label: t("lastVisited"), value: day(box.day), detail: box.day ? t("lastVisitedDetail") : t("neverVisited") };
      case "picked": return { label: t("picked"), value: formatNumber(box.value), detail: t("pickedDetail") };
      case "inGoogle": return { label: t("inGoogle"), value: formatNumber(box.value), detail: box.rest > 0 ? t("inGoogleRest", { count: box.rest }) : t("inGoogleAll") };
      case "linked": return { label: t("linked"), value: formatNumber(box.value), detail: t("linkedDetail") };
      case "stillShown": return {
        label: t("stillShown", { month: monthName(box.month) }),
        value: box.value === null ? "–" : formatNumber(box.value),
        detail: box.rest === null ? "" : t("stillShownDetail", { count: box.rest, month: monthName(box.month) }),
      };
    }
  };
  return (
    <FigureRow>
      {boxes.map((box) => { const shown = figure(box); return <Figure key={box.key} label={shown.label} value={shown.value} detail={note(shown.detail)} />; })}
    </FigureRow>
  );
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
/** "About 1 in 390", rounded as the summary's box rounds it. */
const roundOneIn = (ratio: number) => Math.max(2, Math.round(ratio / (ratio > 1000 ? 100 : ratio > 20 ? 10 : 1)) * (ratio > 1000 ? 100 : ratio > 20 ? 10 : 1));

/** Impressions each day for a reason's pages (the plan's item 3), with Show: Impressions or Clicks. From the days kept. */
export function ShownEachDayCard({ days, from, count, host, loading }: { days: ReadonlyArray<{ day: string; clicks: number; impressions: number }>; from: string | null; count: number; host: string; loading: boolean }) {
  const t = useTranslations("searchConsole.indexing.reason.chart");
  const longDay = useLongDay();
  const [show, setShow] = useState<"shown" | "clicks">("shown");
  const name = show === "shown" ? t("showImpressions") : t("showClicks");
  const hint = t("hint", { count });
  return (
    <DaysChart
      title={show === "shown" ? t("impressions") : t("clicks")}
      hint={from ? `${hint} ${t("from", { day: longDay(from) })}` : hint}
      exportName={`${host}-indexing-days`}
      csvDay={t("day")}
      host={host}
      step="day"
      waiting={loading ? undefined : null}
      controls={[{ kind: "select", key: "show", label: t("show"), value: show, options: [{ value: "shown", label: t("showImpressions") }, { value: "clicks", label: t("showClicks") }], onChange: (next) => setShow(next as typeof show) }]}
      lines={[{ key: "now", name, colour: CHART_SERIES_ORANGE, points: days.map((one) => ({ day: one.day, value: show === "shown" ? one.impressions : one.clicks })) }]}
      figure={name}
      plain
      anything={(rows) => rows.some((row) => Number(row.now) > 0)}
      empty={t("empty")}
      height={300}
    />
  );
}

/** A reason's page as its Examples table lists it: its check, its figures, and what the days kept say of it. */
export type ExampleRow = ReasonPage & { key: string; name: string; lastShown: string | null; daysShown: number | null };

type ExampleKey = "page" | "main" | "crawled" | "lastShown" | "days" | "clicks" | "shown";
const EXAMPLE_SORTS: SiteSortColumns<ExampleRow, ExampleKey> = {
  page: { value: (row) => row.name, first: "asc" },
  main: { value: (row) => row.main, first: "asc" },
  crawled: { value: (row) => row.crawled, first: "desc" },
  lastShown: { value: (row) => row.lastShown, first: "desc" },
  days: { value: (row) => row.daysShown, first: "desc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  shown: { value: (row) => row.impressions, first: "desc" },
};

/** Examples' search, sort and pages. The most impressions first. */
export function useExamplesTable(rows: readonly ExampleRow[] | undefined) {
  return useLeanTable(rows, EXAMPLE_SORTS, "shown", exampleSearchText);
}
const exampleSearchText = (row: ExampleRow) => `${row.name} ${row.address}`;

/**
 * Examples (the plan's item 4), lean: Page, then the columns that fit the kind (Main page, Last crawled, Last shown,
 * Days), Clicks and Shown. Each page opens its own Search Console screen. Its columns, and its download's.
 */
export function useExampleColumns(kind: ReasonKind, kept: { days: number; from: string | null }): { columns: DataTableColumn<ExampleRow>[]; download: Array<{ header: string; value: (row: ExampleRow) => string | number | null }> } {
  const t = useTranslations("searchConsole.indexing.reason.table");
  const tt = useTranslations("searchConsole.indexing.table");
  const siteId = useSearchConsoleSiteId();
  const recordHref = useRecordHref(siteId);
  const { inNow } = usePerformanceDates();
  const mainName = (main: string | null) => {
    if (!main) return "–";
    const path = main.replace(/^https?:\/\/[^/]+/i, "") || "/";
    return path === "/" ? t("home") : path;
  };
  const columns: Record<ExampleKey, DataTableColumn<ExampleRow>> = {
    page: {
      key: "page", header: t("page"), sortable: true, className: `${CUT_COLUMN.first} min-w-[160px]`,
      cell: (row) => <RecordLinkCell cut href={recordHref("pages/page", row.address)} hover={row.title ? `${row.title}\n${row.address}` : row.address}>{row.name}</RecordLinkCell>,
    },
    main: { key: "main", header: heading(t("main"), t("mainHover")), sortable: true, className: "w-[28%] max-w-0", cell: (row) => <span className="block truncate text-[13px] text-secondary" title={row.main ?? ""}>{mainName(row.main)}</span> },
    crawled: { key: "crawled", header: heading(tt("crawled"), tt("lastCrawled")), align: "right", sortable: true, className: "whitespace-nowrap", cell: (row) => mono(day(row.crawled)) },
    lastShown: { key: "lastShown", header: heading(t("lastShown"), t("lastShownHover")), align: "right", sortable: true, className: "whitespace-nowrap", cell: (row) => mono(day(row.lastShown)) },
    days: {
      key: "days", header: heading(t("days"), kept.from ? t("daysHover", { days: formatNumber(kept.days), day: formatShortDay(kept.from) }) : t("days")), align: "right", sortable: true,
      cell: (row) => mono(row.daysShown === null ? "–" : t("daysOf", { days: formatNumber(row.daysShown), of: formatNumber(kept.days) })),
    },
    clicks: { key: "clicks", header: heading(tt("clicks"), tt("clicksHover", { dates: inNow })), align: "right", sortable: true, cell: (row) => mono(formatNumber(row.clicks), true) },
    shown: { key: "shown", header: heading(tt("shown"), tt("impressions")), align: "right", sortable: true, cell: (row) => mono(formatNumber(row.impressions)) },
  };
  return {
    columns: (["page", ...EXAMPLE_COLUMNS[kind]] as ExampleKey[]).map((key) => columns[key]),
    download: [
      { header: t("page"), value: (row) => row.address }, { header: t("main"), value: (row) => row.main ?? "" }, { header: tt("lastCrawled"), value: (row) => row.crawled ?? "" },
      { header: t("lastShown"), value: (row) => row.lastShown ?? "" }, { header: tt("clicks"), value: (row) => row.clicks }, { header: tt("impressions"), value: (row) => row.impressions },
    ],
  };
}

export { reasonSlug };
