"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { outOfTotal } from "@/convex/utils/outOfTotal";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { TOP_KEYWORDS } from "@/convex/utils/searchConsoleViews";
import { DaysChart, type DaysLine, type DaysPoint } from "@/src/ui/components/screens/DaysChart";
import { DotGroups, type DotGroupKey } from "@/src/ui/components/screens/DotGroups";
import { HundredGrid, type HundredGroup } from "@/src/ui/components/screens/HundredGrid";
import { HundredStrips, stripColour, type StripSegment } from "@/src/ui/components/screens/HundredStrips";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { CHART_COMPARATOR_GREY, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { usePageKinds } from "../../_components/usePageKinds";
import { useSpanName } from "../../analytics/_components/VisitsCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { shiftDay } from "../../sites/_components/siteRange";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import type { SiteFigures } from "./SearchConsoleFigures";
import { useSearchConsoleSummaryRead } from "./SearchConsoleTables";
import { appearanceName, formatPosition } from "./searchConsoleFormat";
import { useLiveAsk } from "./searchConsoleRecords";
import { useSearchConsoleSplit } from "./useSearchConsoleSplit";
import { TIMES, TIMES_BY, dotsOf, performanceSplits, websiteRate, type Times } from "./performanceSees";
import {
  countryArg,
  isReadyMade,
  periodArg,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsolePeriodWords,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
} from "./useSearchConsole";

/**
 * Search Console's Performance, as Anthony chose it on the canvas (17 November 2026: "ok lets build this", the board
 * "The new page so far · Way 3 with the dots from Way 4"; search-console-performance-way-3-plan-2026-11-17.md). Every
 * chart is a shared part, as on Overview and Services: `DaysChart`; `HundredGrid` and `HundredStrips` in a `MapCard`;
 * `DotGroups` in a `MapCard`. The page reads its figures (`usePerformanceReads`) and each card draws one of them.
 */

type Day = SiteFigures["days"][number];
type Brand = { brandClicks: number; nonBrandClicks: number; brandImpressions: number; nonBrandImpressions: number };
type TopKeyword = { key: string; clicks: number; impressions: number; position: number; brand: boolean };
type ShortRow = { key: string; clicks: number; impressions: number };

/** The keywords Google showed most, and the brand split: undefined while on their way. */
type Keywords = { rows: TopKeyword[]; brand: { now: Brand; before: Brand | null } | null; noSearches: boolean; failed: boolean; preparing: boolean };

/** "These dates" where a sentence starts. */
const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
/** A rate or a place to one decimal, in the reader's own way of writing it: "0.8", "0,8". */
export const oneDecimal = (value: number) => formatPosition(Math.round(value * 10) / 10);
export const per100 = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : 0);

/** The dates and the span before in the page's words: "October" and "September", or "Last 3 months" and "The 3 months before". */
export function usePerformanceDates() {
  const t = useTranslations("searchConsole.performance");
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const words = useSearchConsolePeriodWords(range.period);
  const spanName = useSpanName();
  const nowName = spanName({ from: range.from, to: range.to });
  const beforeName = spanName(range.before);
  return {
    range,
    /** For a label: "October", "Last 3 months". */
    now: nowName ?? capital(words.name),
    /** For a label: "September", "The 3 months before". */
    before: beforeName ?? capital(words.before),
    /** For the middle of a sentence: "in October", "in these dates". */
    inNow: nowName ?? t("theseDates"),
    /** For the middle of a sentence: "September", "the month before". */
    inBefore: beforeName ?? words.before,
  };
}

/** Everything the page's cards read, each through a read another screen already makes, asked of Google for other dates. */
export function usePerformanceReads() {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const held = Boolean(status?.connection?.newestDay) && !range.waiting && range.days > 0;
  const readyMade = isReadyMade(range, status?.connection?.newestDay);
  const base = { siteId, searchType: kind, from: range.from, to: range.to, ...periodArg(range), ...countryArg(country) };
  const top = useQuery(api.searchConsoleTopKeywords.searchConsoleTopKeywords, held && readyMade ? base : "skip");
  const asksGoogle = held && (!readyMade || top?.live === true);
  const live = useLiveAsk(api.searchConsoleLists.searchConsoleLiveList, asksGoogle ? { ...base, dimension: "query" as const } : null);
  const keywords: Keywords | undefined = useMemo(() => {
    if (!held) return { rows: [], brand: null, noSearches: false, failed: false, preparing: false };
    if (asksGoogle) {
      if (live.answer === undefined) return undefined;
      if (!live.answer.ok) return { rows: [], brand: null, noSearches: false, failed: true, preparing: false };
      // Google's answer is every keyword: the page draws the ones it showed most, as the ready-made read sends.
      const rows = live.answer.rows.flat().sort((left, right) => right.impressions - left.impressions).slice(0, TOP_KEYWORDS);
      return { rows: rows.map((row) => ({ key: row.key, clicks: row.clicks, impressions: row.impressions, position: row.position, brand: row.brand === true })), brand: live.answer.summary.brand, noSearches: false, failed: false, preparing: false };
    }
    if (top === undefined) return undefined;
    return { rows: top.rows, brand: top.brand, noSearches: top.noSearches === true, failed: false, preparing: top.preparing };
  }, [held, asksGoogle, live.answer, top]);
  // The country's own pages, as Pages and Demand by Classification read them: the boxes and the squares count one country
  // (review fixes, 18 November 2026).
  const pages = useSearchConsoleSummaryRead({ dimension: "page", inCountry: true });
  const devices = useSearchConsoleSplit(held ? { ...base, dimension: "device" } : null);
  const appearance = useSearchConsoleSplit(held ? { ...base, dimension: "appearance" } : null);
  return {
    keywords,
    /**
     * Each Classification's pages, clicks, impressions and clicks before, in the country chosen: they share out only the
     * clicks Google ties to a page, fewer than the boxes' (Google ties none to the searches it keeps private).
     */
    kinds: pages.loading ? undefined : (pages.summary?.kinds ?? []),
    devices: devices === undefined ? undefined : (devices?.rows ?? []) as ShortRow[],
    appearance: appearance === undefined ? undefined : (appearance?.rows ?? []) as ShortRow[],
  };
}

export type PerformanceReads = ReturnType<typeof usePerformanceReads>;

// ── The day chart ─────────────────────────────────────────────────────────────────────────────────────────────────

const MEASURES = ["clicks", "impressions", "ctr", "position"] as const;
export type Measure = (typeof MEASURES)[number];

/** Every day from `from` to `to`, a day Google showed nothing on as nought, so the span before lies under the dates day for day. Keywords' ticked lines too. */
export function everyDay(days: readonly Day[], from: string, to: string): Day[] {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const all: Day[] = [];
  for (let day = from; day <= to && all.length < 400; day = shiftDay(day, 1)) all.push(byDay.get(day) ?? { day, clicks: 0, impressions: 0, ctr: 0, position: 0 });
  return all;
}

/** A measure's points: a count as it is; click-through rate for every 100 impressions; position weighed by impressions, as Google weighs it. */
export function lineOf(days: readonly Day[], measure: Measure): Pick<DaysLine, "points" | "per" | "perScale"> {
  const impressions: DaysPoint[] = days.map((day) => ({ day: day.day, value: day.impressions }));
  if (measure === "clicks") return { points: days.map((day) => ({ day: day.day, value: day.clicks })) };
  if (measure === "impressions") return { points: impressions };
  if (measure === "ctr") return { points: days.map((day) => ({ day: day.day, value: day.clicks })), per: impressions };
  return { points: days.map((day) => ({ day: day.day, value: day.position * day.impressions })), per: impressions, perScale: 1 };
}

/** Clicks, impressions, click-through rate or position over the dates, with the span before laid under them. */
/**
 * The day chart, one figure at a time with the span before laid under. Performance's, and a keyword's own screen's
 * (search-console-keyword-screen-way-2-plan-2026-11-17.md), which names its own download (`exportName`).
 */
export function PerformanceDaysCard({ figures, host, heldFrom, exportName }: { figures: SiteFigures; host: string; heldFrom: string | null; exportName?: string }) {
  const t = useTranslations("searchConsole.performance.days");
  const tc = useTranslations("searchConsole.chart");
  const dates = usePerformanceDates();
  const { range } = dates;
  const [measure, setMeasure] = useSiteParam<Measure>("show", "clicks", MEASURES);
  const [against, setAgainst] = useSiteParam<"before" | "none">("against", "before", ["before", "none"]);
  const before = figures.daysBefore ?? [];
  const held = before.length > 0;
  const comparing = against === "before" && held;
  const last = figures.days.reduce((newest, day) => (day.day > newest ? day.day : newest), range.from);
  const first = heldFrom && heldFrom > range.from ? heldFrom : range.from;
  const now = everyDay(figures.days, first, last < range.to ? last : range.to);
  const names: Record<Measure, string> = { clicks: tc("clicks"), impressions: tc("impressions"), ctr: tc("ctr"), position: tc("position") };
  const lines: DaysLine[] = [
    { key: "now", name: dates.now, colour: CHART_SERIES_ORANGE, ...lineOf(now, measure) },
    ...(comparing ? [{ key: "before", name: dates.before, colour: CHART_COMPARATOR_GREY, dashed: true, under: true, gaps: true, ...lineOf(everyDay(before, range.before.from, range.before.to), measure) }] : []),
  ];
  const counted = measure === "clicks" || measure === "impressions";
  const hint = [
    comparing ? t("hintAgainst", { now: dates.now, before: dates.inBefore }) : t("hint", { now: dates.now }),
    ...(measure === "position" ? [t("lowerBetter")] : []),
  ].join(" ");
  return (
    <DaysChart
      title={t("title", { name: names[measure], step: range.step })}
      hint={hint}
      exportName={exportName ?? `${host}-search-console-performance`}
      csvDay={tc("day")}
      host={host}
      step={range.step}
      waiting={null}
      controls={[
        { kind: "select", key: "show", label: t("showLabel"), value: measure, options: MEASURES.map((value) => ({ value, label: names[value] })), onChange: (next) => setMeasure(next as Measure) },
        ...(held ? [{
          kind: "select" as const, key: "against", label: t("compareWith"), value: against,
          options: [{ value: "before", label: dates.before }, { value: "none", label: t("nothing") }],
          onChange: (next: string) => setAgainst(next as "before" | "none"),
        }] : []),
      ]}
      lines={lines}
      figure={measure === "ctr" ? t("figureRate") : names[measure]}
      format={counted ? formatNumber : oneDecimal}
      plain={counted}
      anything={(rows) => rows.some((row) => Number(row.now) > 0)}
      empty={t("empty")}
      height={300}
      {...(counted ? { scored: { step: range.step, lines: [{ key: "now", name: dates.now, now: lineOf(now, measure).points }] } } : {})}
    />
  );
}

// ── Out of every 100 ──────────────────────────────────────────────────────────────────────────────────────────────

const SPLITS = ["searches", "device", "classification", "look"] as const;
type Split = (typeof SPLITS)[number];
/** The squares' colours, the biggest first: Demand by Classification's squares take them too. */
export const GRID_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET, CHART_COMPARATOR_GREY];
const DEVICES = ["DESKTOP", "MOBILE", "TABLET"];

/** One part of a split: its clicks and impressions, and its clicks and impressions before where those are kept. */
export type Part = { key: string; name: string; clicks: number; impressions: number; clicksBefore: number | null; impressionsBefore: number | null; pages: number | null };

/** The names the page says things by, in the reader's words. */
function useNames() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const pageKinds = usePageKinds(siteId);
  const known = (key: string) => (t.has(`appearance.names.${key}`) ? t(`appearance.names.${key}`) : null);
  return {
    device: (key: string) => (DEVICES.includes(key) ? t(`places.deviceNames.${key}`) : key),
    look: (key: string) => appearanceName(key, known),
    kind: (key: string) => pageKinds.label(key === "UNJUDGED" ? NOT_SORTED_KIND : key),
  };
}

/** Every split's parts, biggest first by what's shown. Searches needs the brand split and the website's totals. */
function partsOf(split: Split, reads: PerformanceReads, figures: SiteFigures, names: ReturnType<typeof useNames>, words: (key: string) => string): Part[] | undefined {
  if (split === "searches") {
    const brand = reads.keywords?.brand;
    if (reads.keywords === undefined) return undefined;
    if (!brand || !figures.totals) return [];
    const { now, before } = brand;
    const was = before && figures.previous ? { before, previous: figures.previous } : null;
    return [
      { key: "brand", name: words("brand"), clicks: now.brandClicks, impressions: now.brandImpressions, clicksBefore: was ? was.before.brandClicks : null, impressionsBefore: was ? was.before.brandImpressions : null, pages: null },
      { key: "named", name: words("named"), clicks: now.nonBrandClicks, impressions: now.nonBrandImpressions, clicksBefore: was ? was.before.nonBrandClicks : null, impressionsBefore: was ? was.before.nonBrandImpressions : null, pages: null },
      {
        key: "hidden",
        name: words("hidden"),
        clicks: Math.max(0, figures.totals.clicks - now.brandClicks - now.nonBrandClicks),
        impressions: Math.max(0, figures.totals.impressions - now.brandImpressions - now.nonBrandImpressions),
        clicksBefore: was ? Math.max(0, was.previous.clicks - was.before.brandClicks - was.before.nonBrandClicks) : null,
        impressionsBefore: was ? Math.max(0, was.previous.impressions - was.before.brandImpressions - was.before.nonBrandImpressions) : null,
        pages: null,
      },
    ];
  }
  if (split === "classification") {
    return reads.kinds?.map((kind) => ({ key: kind.kind, name: names.kind(kind.kind), clicks: kind.clicks, impressions: kind.impressions, clicksBefore: kind.previousClicks, impressionsBefore: null, pages: kind.rows }));
  }
  const rows = split === "device" ? reads.devices : reads.appearance;
  return rows?.map((row) => ({ key: row.key, name: split === "device" ? names.device(row.key) : names.look(row.key), clicks: row.clicks, impressions: row.impressions, clicksBefore: null, impressionsBefore: null, pages: null }));
}

/**
 * The biggest few by name, the rest together as "The other N", so the key stays short. Searches keep their three as they
 * are. Demand by Classification's squares and bands share it.
 */
export function topAndRest<One extends Part>(parts: readonly One[], read: (part: One) => number, named: number, otherName: (count: number) => string): Array<One | Part> {
  const ranked = [...parts].sort((left, right) => read(right) - read(left));
  if (ranked.length <= named + 1) return ranked;
  const rest = ranked.slice(named);
  const sum = (pick: (part: Part) => number | null) => {
    const values = rest.map(pick);
    return values.every((value) => value !== null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
  };
  return [...ranked.slice(0, named), {
    key: "rest", name: otherName(rest.length), clicks: sum((part) => part.clicks) ?? 0, impressions: sum((part) => part.impressions) ?? 0,
    clicksBefore: sum((part) => part.clicksBefore), impressionsBefore: sum((part) => part.impressionsBefore), pages: sum((part) => part.pages),
  }];
}

/** Where 100 clicks or impressions came from: brand searches and the ones Google hides, devices, Classifications, rich results. */
export function PerformanceSquaresCard({ reads, figures, host }: { reads: PerformanceReads; figures: SiteFigures; host: string }) {
  const t = useTranslations("searchConsole.performance.squares");
  const td = useTranslations("searchConsole.services");
  const tc = useTranslations("searchConsole.chart");
  const [kind] = useResultKind();
  const dates = usePerformanceDates();
  const names = useNames();
  const [show, setShow] = useSiteParam<"clicks" | "impressions">("squares", "clicks", ["clicks", "impressions"]);
  const [split, setSplit] = useSiteParam<Split>("squaresSplit", "searches", SPLITS);
  const [compare, setCompare] = useSiteParam<"before" | "none">("squaresAgainst", "before", ["before", "none"]);
  const read = (part: Part) => (show === "clicks" ? part.clicks : part.impressions);
  const readBefore = (part: Part) => (show === "clicks" ? part.clicksBefore : part.impressionsBefore);
  const all = partsOf(split, reads, figures, names, (key) => t(`groups.${key}`));
  const parts = all ? (split === "searches" ? all : topAndRest(all, read, 4, (count) => t("others", { count }))) : [];
  const values = parts.map(read);
  const total = values.reduce((sum, value) => sum + value, 0);
  const counts = outOfTotal(values);
  const hasBefore = parts.length > 0 && parts.every((part) => readBefore(part) !== null);
  const compared = compare === "before" && hasBefore;
  const valuesBefore = parts.map((part) => readBefore(part) ?? 0);
  const totalBefore = valuesBefore.reduce((sum, value) => sum + value, 0);
  const countsBefore = compared ? outOfTotal(valuesBefore) : [];
  const noun = t(`noun.${show}`);
  const groups: HundredGroup[] = parts.map((part, at) => ({
    key: part.key,
    name: part.name,
    count: counts[at] ?? 0,
    colour: split === "searches" ? [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_COMPARATOR_GREY][at] ?? CHART_COMPARATOR_GREY : GRID_COLOURS[at] ?? CHART_COMPARATOR_GREY,
    ...(compared ? { was: <span className="font-mono">{countsBefore[at] ?? 0}</span> } : {}),
    readout: [
      { value: formatNumber(values[at] ?? 0), label: t("readout.figure", { noun: capital(noun), when: dates.inNow }) },
      { value: t("readout.inEvery", { share: oneDecimal(per100(values[at] ?? 0, total)) }), label: dates.now },
      ...(compared ? [{ value: t("readout.inEvery", { share: oneDecimal(per100(valuesBefore[at] ?? 0, totalBefore)) }), label: dates.before }] : []),
    ],
  }));
  const noSearches = split === "searches" && reads.keywords?.noSearches === true;
  const failed = split === "searches" && reads.keywords?.failed === true;
  const hint = [
    // A Classification's are the clicks on the country's pages, fewer than the boxes': never "All your clicks", as on Demand.
    split === "classification" ? td("squaresHint", { noun, when: dates.inNow, count: formatNumber(total) }) : t("hint", { noun, when: dates.inNow, count: formatNumber(total) }),
    ...(split === "device" || split === "classification" ? [] : [t(`note.${split}`)]),
    ...(compare === "before" && !hasBefore && parts.length > 0 ? [t("noBefore", { when: dates.inBefore })] : []),
  ].join(" ");
  return (
    <MapCard
      title={t("title", { noun })}
      hint={hint}
      exportName={`${host}-search-console-out-of-100`}
      csv={() => toCsv([t("csvRow"), capital(noun), t("csvSquares"), ...(compared ? [dates.before] : [])], groups.map((group, at) => [group.name, values[at] ?? 0, group.count, ...(compared ? [countsBefore[at] ?? 0] : [])]))}
      host={host}
      loading={all === undefined}
      message={noSearches ? tc("noSearches", { kind }) : failed ? t("failed") : total === 0 ? t("empty") : null}
      controls={[
        { kind: "select", key: "show", label: t("showLabel"), value: show, options: (["clicks", "impressions"] as const).map((value) => ({ value, label: capital(t(`noun.${value}`)) })), onChange: (next) => setShow(next as "clicks" | "impressions") },
        { kind: "select", key: "split", label: t("splitLabel"), value: split, options: SPLITS.map((value) => ({ value, label: t(`split.${value}`) })), onChange: (next) => setSplit(next as Split) },
        { kind: "select", key: "compare", label: t("compareWith"), value: hasBefore ? compare : "none", options: [...(hasBefore ? [{ value: "before", label: dates.before }] : []), { value: "none", label: t("nothing") }], onChange: (next) => setCompare(next as "before" | "none") },
      ]}
    >
      <HundredGrid groups={groups} cells={100} nowLabel={dates.now} wasLabel={compared ? dates.before : ""} label={t("title", { noun })} />
    </MapCard>
  );
}

// ── What Google shows, and what gets clicked ──────────────────────────────────────────────────────────────────────

const BAND_SPLITS = ["classification", "device"] as const;
type BandSplit = (typeof BAND_SPLITS)[number];

/** Two rows of 100: where impressions went, and where clicks went (or pages are). A band that narrows going down gets clicked less than it's shown. */
export function PerformanceBandsCard({ reads, figures, host }: { reads: PerformanceReads; figures: SiteFigures; host: string }) {
  const t = useTranslations("searchConsole.performance.bands");
  const ts = useTranslations("searchConsole.performance.squares");
  const names = useNames();
  const [split, setSplit] = useSiteParam<BandSplit>("bandsSplit", "classification", BAND_SPLITS);
  const [bottomChoice, setBottom] = useSiteParam<"clicks" | "pages">("bands", "clicks", ["clicks", "pages"]);
  const [lit, setLit] = useState<string | null>(null);
  const bottomKey = split === "classification" ? bottomChoice : "clicks";
  const all = partsOf(split, reads, figures, names, () => "");
  const parts = all ? topAndRest(all, (part) => part.impressions, 6, (count) => ts("others", { count })) : [];
  const bottomOf = (part: Part) => (bottomKey === "clicks" ? part.clicks : part.pages ?? 0);
  const impressions = parts.map((part) => part.impressions);
  const bottoms = parts.map(bottomOf);
  const [impressionsAll, bottomAll] = [impressions, bottoms].map((list) => list.reduce((sum, value) => sum + value, 0));
  const top = outOfTotal(impressions);
  const bottom = outOfTotal(bottoms);
  const noun = t(`noun.${bottomKey}`);
  const segments: StripSegment[] = parts.map((part, at) => ({
    key: part.key,
    name: part.name,
    top: top[at] ?? 0,
    bottom: bottom[at] ?? 0,
    colour: stripColour(part.key === "rest" ? 99 : at),
    readout: [
      { value: formatNumber(impressions[at] ?? 0), label: t("readout.impressions") },
      { value: ts("readout.inEvery", { share: oneDecimal(per100(impressions[at] ?? 0, impressionsAll)) }), label: t("readout.ofImpressions") },
      { value: formatNumber(bottoms[at] ?? 0), label: t(`against.${bottomKey}`) },
      { value: ts("readout.inEvery", { share: oneDecimal(per100(bottoms[at] ?? 0, bottomAll)) }), label: t("readout.ofThose", { noun }) },
    ],
  }));
  const hint = [t("hint", { noun }), t("press")].join(" ");
  return (
    <MapCard
      title={t(`title.${bottomKey}`)}
      hint={hint}
      exportName={`${host}-search-console-bands`}
      csv={() => toCsv([t("csvName"), t("readout.impressions"), t(`against.${bottomKey}`)], parts.map((part, at) => [part.name, impressions[at] ?? 0, bottoms[at] ?? 0]))}
      host={host}
      loading={all === undefined}
      message={all !== undefined && impressionsAll === 0 ? ts("empty") : null}
      controls={[
        { kind: "select", key: "split", label: t("splitLabel"), value: split, options: BAND_SPLITS.map((value) => ({ value, label: ts(`split.${value}`) })), onChange: (next) => setSplit(next as BandSplit) },
        {
          // "Show", as Demand by Classification's same menu says: "Compare with" is only ever a period (writing-guide.md).
          kind: "select", key: "against", label: t("show"), value: bottomKey,
          options: (split === "classification" ? (["clicks", "pages"] as const) : (["clicks"] as const)).map((value) => ({ value, label: t(`against.${value}`) })),
          onChange: (next) => setBottom(next as "clicks" | "pages"),
        },
      ]}
    >
      <HundredStrips segments={segments} topLabel={t("topLabel")} bottomLabel={t("bottomLabel", { noun })} lit={lit} onLit={setLit} />
    </MapCard>
  );
}

// ── Which keywords Google shows, and which get clicked ────────────────────────────────────────────────────────────

/** Each dot a keyword: further right, Google showed it more; higher up, people clicked it more. Four groups, named by their figures. */
export function PerformanceDotsCard({ reads, figures, host }: { reads: PerformanceReads; figures: SiteFigures; host: string }) {
  const t = useTranslations("searchConsole.performance.dots");
  const tc = useTranslations("searchConsole.chart");
  const [kind] = useResultKind();
  const [count, setCount] = useSiteParam<"impressions" | "clicks">("dotsCount", "impressions", ["impressions", "clicks"]);
  const [which, setWhich] = useSiteParam<"other" | "all">("dotsShow", "other", ["other", "all"]);
  const [across, setAcross] = useSiteParam<Times>("dotsAcross", "middle", TIMES);
  const [up, setUp] = useSiteParam<Times>("dotsUp", "middle", TIMES);
  const siteRate = websiteRate(figures.totals);
  const rows = reads.keywords?.rows ?? [];
  const dots = dotsOf(rows, { count, which, across, up }, siteRate);
  const noun = t(`noun.${count}`);
  const acrossWords = { more: t("groups.acrossMore", { count: formatNumber(dots.line), noun }), fewer: t("groups.acrossFewer", { count: formatNumber(dots.line), noun }) };
  const upWords = { more: t("groups.upMore", { rate: oneDecimal(dots.rate) }), fewer: t("groups.upFewer", { rate: oneDecimal(dots.rate) }) };
  const names: Record<DotGroupKey, string> = {
    rightHigh: t("groups.name", { across: acrossWords.more, up: upWords.more }),
    rightLow: t("groups.name", { across: acrossWords.more, up: upWords.fewer }),
    leftHigh: t("groups.name", { across: acrossWords.fewer, up: upWords.more }),
    leftLow: t("groups.name", { across: acrossWords.fewer, up: upWords.fewer }),
  };
  // The few names said beside their dots: the keywords that got the most clicks.
  const said = new Set([...dots.list].sort((left, right) => right.clicks - left.clicks).slice(0, 5).map((row) => row.key));
  // A keyword with no clicks can't sit on this scale: it's left off, and the line under the chart says how many.
  const drawn = dots.list.filter((row) => row.clicks > 0);
  const none = dots.list.length - drawn.length;
  const keywords = reads.keywords;
  return (
    <MapCard
      title={t("title")}
      hint={t("hint", { noun })}
      exportName={`${host}-search-console-keywords-dots`}
      csv={() => toCsv([t("csvKeyword"), capital(t("noun.impressions")), capital(t("noun.clicks")), t("axis"), t("csvGroup")], dots.list.map((row) => [row.key, row.impressions, row.clicks, oneDecimal(dots.rateOf(row)), names[dots.groupOf(row)]]))}
      host={host}
      loading={keywords === undefined}
      message={keywords?.noSearches ? tc("noSearches", { kind }) : keywords?.failed ? t("failed") : dots.list.length === 0 ? t("empty") : null}
      controls={[
        { kind: "select", key: "count", label: t("countLabel"), value: count, options: (["impressions", "clicks"] as const).map((value) => ({ value, label: capital(t(`noun.${value}`)) })), onChange: (next) => setCount(next as "impressions" | "clicks") },
        { kind: "select", key: "which", label: t("showLabel"), value: which, options: [{ value: "other", label: t("show.other") }, { value: "all", label: t("show.all") }], onChange: (next) => setWhich(next as "other" | "all") },
        { kind: "select", key: "across", label: t("acrossLabel", { noun: capital(noun) }), value: across, options: TIMES.map((value) => ({ value, label: t(`across.${value}`, { count: formatNumber(Math.max(1, Math.round(dots.middle * TIMES_BY[value]))) }) })), onChange: (next) => setAcross(next as Times) },
        { kind: "select", key: "up", label: t("upLabel"), value: up, options: TIMES.map((value) => ({ value, label: t(`up.${value}`, { rate: oneDecimal(Math.round(siteRate * TIMES_BY[value] * 10) / 10) }) })), onChange: (next) => setUp(next as Times) },
      ]}
      under={<span className="text-[12px] text-secondary">{[t("under", { count: formatNumber(rows.length) }), ...(none > 0 ? [t("noClicks", { count: none })] : [])].join(" ")}</span>}
    >
      <DotGroups
        points={drawn.map((row) => ({ x: dots.read(row), y: dots.rateOf(row), label: row.key, named: said.has(row.key) }))}
        split={{ x: dots.line, y: dots.rate }}
        names={names}
        // Short axis names (Anthony, 17 November 2026, on the canvas): the hint says what each way means, and the bottom's ran into the key.
        xLabel=""
        yLabel={t("axis")}
        readout={{ x: capital(noun), y: t("axis") }}
        formatY={oneDecimal}
        height={420}
      />
    </MapCard>
  );
}

/** The charts' figures for the page's eye, in the reader's words (`performanceSplits`). */
export function usePerformanceEye(reads: PerformanceReads, figures: SiteFigures | undefined) {
  const t = useTranslations("searchConsole.performance.dots");
  const names = useNames();
  const siteId = useSearchConsoleSiteId();
  const pageKinds = usePageKinds(siteId);
  const splits = figures ? performanceSplits(
    { totals: figures.totals, previous: figures.previous, brand: reads.keywords?.brand, kinds: reads.kinds, devices: reads.devices, looks: reads.appearance, keywords: reads.keywords?.rows },
    {
      kind: (key) => (key === NOT_SORTED_KIND || key === "UNJUDGED" ? null : pageKinds.label(key)),
      device: names.device,
      look: names.look,
      quiet: (line, rate) => t("groups.name", { across: t("groups.acrossMore", { count: formatNumber(line), noun: t("noun.impressions") }), up: t("groups.upFewer", { rate: oneDecimal(rate) }) }),
    },
  ) : undefined;
  // The same figures keep the same object, so the eye works them out again only when they change.
  const key = splits === undefined ? "" : JSON.stringify(splits);
  return useMemo(() => (key ? (JSON.parse(key) as Record<string, unknown>) : undefined), [key]);
}
