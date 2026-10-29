"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { OTHER_KIND } from "@/convex/utils/sees/analyticsChannel";
import { FLOW_LEFT, FLOW_MORE } from "@/convex/utils/conversionFlow";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ChannelMap, type ChannelMapRow } from "@/src/ui/components/screens/ChannelMap";
import { ConversionsMap, type ConversionsCount, type ConversionsMapColumn, type ConversionsMapRow } from "@/src/ui/components/screens/ConversionsMap";
import { PageFlowChart, type PageFlowBand, type PageFlowNode } from "@/src/ui/components/screens/PageFlowChart";
import type { ChartTooltipEntry } from "@/src/ui/components/charts/ChartTooltip";
import { SiteBarChart, SiteLineChart, type SiteSeries } from "../../sites/_components/SiteCharts";
import { formatNumber, formatShortDay, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard, useSeriesTicks } from "../../search-console/_components/SearchConsoleChartCard";
import { useKindName } from "../[siteId]/channels/_components/ChannelParts";
import { formatMoney, formatPercent, formatPerConversion } from "./analyticsFormat";
import { eventList } from "./AnalyticsSees";
import { useEventName } from "./useEventName";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { COMPARES, COUNTS, Choice, useBeforeName, useMapWords, type Compare } from "./ConversionsMapChoices";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, useStep, periodWord } from "./useAnalytics";
import { visitsPerConversion, type CostPoint, type CostRow } from "./visitsPerConversion";
import { shiftDays } from "./stepScale";

/**
 * Conversions' pictures (docs/plans/active/ga-conversions-visitors-plan.md
 * CV3, CV4; drawn and approved 2026-10-14): how visits reached a conversion,
 * by page classification (`PageFlowChart`, its last column how visits ended);
 * conversions by page classification (`ChannelMap`, Anthony: "maybe in this
 * style"); the visits needed for one conversion over time, against the days
 * just before (Anthony, 2026-10-20); and what people did before
 * converting, over 12 months, as Channels' "What a visit is worth" is drawn.
 * Read from Conversions' own answers and what Hakken holds: nothing is asked
 * of Google.
 */

type ConversionsAnswer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsReads.analyticsConversions>>;
type Flow = NonNullable<ConversionsAnswer["flow"]>;
type Before = NonNullable<ConversionsAnswer["before"]>;

/**
 * A page classification's words for these pictures and Visitors' grid: its own
 * name, no page recorded, the rest — and a page no classification catches,
 * "Unclassified" (Anthony, 2026-10-14).
 */
export function useFlowKindName(kinds: ReadonlyArray<{ kind: string; name: string | null }> = []): (kind: string) => string {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const named = useKindName(kinds);
  return (kind) => (kind === NOT_SORTED_KIND ? t("unclassified") : named(kind));
}

/** "How visits reached a conversion, by page classification" (CV3): channels, then the kind of page landed on, then how the visit ended. */
export function ConversionFlowCard({ flow, currency }: { flow: Flow | null; currency: string | null }) {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const kindName = useFlowKindName(flow?.kinds ?? []);
  if (!flow) return null;
  const channelLabel = (key: string, more: number) => (key === FLOW_MORE ? t("moreChannels", { count: more }) : key);
  const kindLabel = (kind: string, more: number) => (kind === OTHER_KIND ? t("moreKinds", { count: more }) : kindName(kind));
  const endingLabel = (key: string) => (key === FLOW_LEFT ? t("left") : nameOf(key));
  const nodes: PageFlowNode[] = [
    ...flow.channels.map((row) => {
      const name = channelLabel(row.key, row.more);
      return { id: `c:${row.key}`, column: 0 as const, label: name, visits: row.visits, left: 0, conversions: row.conversions, hover: t("nodeHover", { name, visits: row.visits, conversions: row.conversions }) };
    }),
    ...flow.kinds.map((row) => {
      const name = kindLabel(row.kind, row.more);
      return { id: `k:${row.kind}`, column: 1 as const, label: name, visits: row.visits, left: 0, conversions: row.conversions, hover: t("nodeHover", { name, visits: row.visits, conversions: row.conversions }) };
    }),
    ...flow.endings.map((row) => {
      const name = endingLabel(row.key);
      const ending = row.key === FLOW_LEFT ? "left" as const : !row.counted ? "uncounted" as const : row.count === 0 ? "never" as const : "counted" as const;
      const hover = ending === "left" ? t("leftHover", { count: row.count })
        : ending === "uncounted" ? t("uncountedHover", { name, count: row.count })
          : ending === "never" ? t("neverHover", { name }) : t("countedHover", { name, count: row.count });
      return { id: `e:${row.key}`, column: 2 as const, label: name, visits: row.count, left: 0, conversions: row.counted ? row.count : 0, hover, ending };
    }),
  ];
  const labelOf = new Map(nodes.map((node) => [node.id, node.label]));
  const bands: PageFlowBand[] = flow.routes.map((route) => {
    const from = labelOf.get(route.from) ?? route.from;
    const to = labelOf.get(route.to) ?? route.to;
    const words = route.to === `e:${FLOW_LEFT}` ? t("bandLeft", { from, count: route.visits })
      : route.to.startsWith("e:") ? t("bandEnded", { from, to, count: route.visits })
        : route.conversions > 0 ? t("bandHoverConverted", { from, to, visits: route.visits, conversions: route.conversions })
          : t("bandHover", { from, to, visits: route.visits });
    return {
      from: route.from, to: route.to, visits: route.visits, conversions: route.conversions, landings: route.channels,
      hover: route.revenue > 0 ? t("bandRevenue", { words, money: formatMoney(route.revenue, currency) }) : words,
    };
  });
  const conversions = flow.endings.filter((row) => row.counted).reduce((sum, row) => sum + row.count, 0);
  const uncounted = flow.endings.filter((row) => !row.counted && row.key !== FLOW_LEFT).reduce((sum, row) => sum + row.count, 0);
  const channelCount = flow.channels.reduce((sum, row) => sum + (row.key === FLOW_MORE ? row.more : 1), 0);
  const kindCount = flow.kinds.reduce((sum, row) => sum + (row.kind === OTHER_KIND ? row.more : 1), 0);
  const columns = [
    { title: t("came"), summary: t("cameSummary", { visits: formatNumber(flow.visits), count: channelCount }) },
    { title: t("landed"), summary: t("landedSummary", { visits: formatNumber(flow.visits), count: kindCount }) },
    { title: t("ended"), summary: t("endedSummary", { conversions, uncounted: formatNumber(uncounted) }) },
  ];
  const figuresOf = (node: PageFlowNode) => (node.ending === "never" ? t("figuresNever")
    : node.ending === "uncounted" ? t("figuresUncounted", { count: formatNumber(node.visits) })
      : node.conversions > 0 ? t("figuresConverted", { visits: formatNumber(node.visits), conversions: node.conversions })
        : t("figures", { visits: formatNumber(node.visits) }));
  const csv = () => toCsv([t("csvFrom"), t("csvTo"), t("csvVisits"), t("csvConversions")], bands.map((band) => [labelOf.get(band.from) ?? band.from, labelOf.get(band.to) ?? band.to, band.visits, band.conversions]));
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={`${t("hint", { period: tf(`periods.${periodWord(period)}`) })}${flow.everyDevice ? ` ${t("everyDevice")}` : ""}`}
      exportName="google-analytics-conversion-flow"
      csv={csv}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {flow.collecting ? <p className="py-10 text-center text-[12px] text-muted">{t("collecting")}</p>
        : flow.visits === 0 ? <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>
          : <PageFlowChart columns={columns} nodes={nodes} bands={bands} figuresOf={figuresOf} legend={{ conversions: t("legendConversions"), uncounted: t("legendUncounted"), left: t("legendLeft") }} />}
    </SearchConsoleChartCard>
  );
}

/**
 * "Conversions by page classification" (Anthony, 2026-10-14: "maybe in this
 * style", pointing at Visitors' grid): each counted kind and each key event
 * not counted down the side, the classifications across, each square that
 * event's count from visits that started on that kind of page.
 */
export function ConversionsByKind({ flow }: { flow: Flow | null }) {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const kindName = useFlowKindName(flow?.grid.kinds ?? []);
  if (!flow) return null;
  const columns = flow.grid.kinds.map((kind) => kindName(kind.kind));
  const counts = new Map(flow.grid.rows.map((row) => [row.eventName, row.cells.reduce((sum, count) => sum + count, 0)]));
  const rows: ChannelMapRow[] = flow.grid.rows.map((row) => ({
    key: row.eventName,
    label: nameOf(row.eventName),
    total: !row.counted ? t("byKindNotCounted", { count: formatNumber(row.count) }) : row.count === 0 ? t("byKindNever") : t("byKindCounted", { count: row.count }),
    cells: row.cells.map((count, at) => ({ visits: count, conversions: 0, hover: t("byKindHover", { event: nameOf(row.eventName), kind: columns[at] ?? "", count }) })),
  }));
  const csv = () => toCsv(["event", ...columns], flow.grid.rows.map((row) => [row.eventName, ...row.cells]));
  return (
    <SearchConsoleChartCard
      title={t("byKindTitle")}
      hint={`${t("byKindHint", { period: tf(`periods.${periodWord(period)}`) })}${flow.everyDevice ? ` ${t("everyDevice")}` : ""}`}
      exportName="google-analytics-conversions-by-classification"
      csv={csv}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {rows.length > 0 ? (
        <ChannelMap
          columns={columns}
          rows={rows}
          rowVisits={(row) => counts.get(row.key) ?? 0}
          conversionsWord={() => ""}
          legend={{ visits: t("byKindLegend"), shades: t("byKindShades"), empty: t("byKindEmpty") }}
        />
      ) : <p className="py-10 text-center text-[12px] text-muted">{t("byKindNone")}</p>}
    </SearchConsoleChartCard>
  );
}

/**
 * A page's own conversions by channel, Conversions' squares "aligned to this
 * page" (Anthony, 2026-10-20): each counted kind and each key event not
 * counted down the side, each channel whose visits started on the page
 * across, each square that event's count from visits that came from that
 * channel and started there (`analyticsPageConversionGrid`).
 */
export function PageConversionsByChannel({ page }: { page: string }) {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const tc = useTranslations("googleAnalytics.chart");
  const tm = useTranslations("googleAnalytics.conversionsMap");
  const tp = useTranslations("googleAnalytics.page");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const [count, setCount] = useSiteParam<ConversionsCount>("pageMapCount", "visits", COUNTS);
  const [compare, setCompare] = useSiteParam<Compare>("pageMapCompare", "none", COMPARES);
  const grid = useQuery(api.googleAnalyticsPageConversions.analyticsPageConversionGrid, status?.connection?.newestDay && page ? { ...args, page } : "skip");
  const beforeName = useBeforeName();
  const words = useMapWords(count);
  const columns: ConversionsMapColumn[] = (grid?.channels ?? []).map((entry) => ({ key: entry.channel, name: entry.channel || tc("noChannel"), visits: entry.visits, visitsBefore: entry.visitsBefore }));
  const rows: ConversionsMapRow[] = (grid?.rows ?? []).map((row) => ({ eventName: row.eventName, name: nameOf(row.eventName), counted: row.counted, cells: row.cells }));
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <Choice label={tm("count")} value={count} choices={COUNTS} word={(choice) => tm(`counts.${choice}`)} onChange={setCount} />
      <Choice label={tm("compare")} value={compare} choices={COMPARES} word={(choice) => (choice === "before" ? beforeName : tm("compares.none"))} onChange={setCompare} />
    </div>
  );
  const csv = () => toCsv(["event", ...columns.map((column) => column.name)], rows.map((row) => [row.eventName, ...row.cells.map((cell) => (count === "events" ? cell.times : cell.visits))]));
  return (
    <ConversionsMap
      title={t("byChannelTitle")}
      controls={controls}
      columns={columns}
      rows={rows}
      count={count}
      compare={compare === "before" && (grid?.hasBefore ?? false)}
      words={words}
      newWord={tm("new")}
      pickWord={tm("conversion")}
      exportName="google-analytics-page-conversions-by-channel"
      csv={csv}
      caption={status?.host}
      emptyText={grid === undefined ? undefined : grid === null ? tp("collecting") : t("byChannelNone")}
    />
  );
}


/** The periods drawn with the span before beside them: the weeks and months, held a day at a time (`analyticsPeriodBeforeChart`). */
const DRAWN_BEFORE: ReadonlySet<string> = new Set(["thisWeek", "lastWeek", "thisMonth", "lastMonth"]);

/** A point of the chart's figures, each counted kind's own count in its `events`' order. */
type KindPoint = CostPoint & { events?: readonly number[] };
/** The span before, each day dated onto the day it is laid over — its first onto the period's first — `shift` days later. */
type DaysBefore = { shift: number; events: readonly string[]; points: readonly KindPoint[] };
/** The period's visits and each counted kind's count, now and before, as the figures at the top count them. */
type CostFigures = { visits: number; visitsBefore: number | null; kinds: ReadonlyArray<{ eventName: string; count: number; countBefore: number | null }> };

/** Conversions' "Visits needed for one conversion": the website's figures, and the span before for the weeks and months. */
export function VisitsPerConversionCard({ days, events, figures, from, to }: {
  days: readonly KindPoint[];
  events: readonly string[];
  figures: CostFigures | null;
  from: string | null;
  to: string | null;
}) {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  const lined = DRAWN_BEFORE.has(period);
  const daysBefore = useQuery(api.googleAnalyticsChartReads.analyticsPeriodBeforeChart, status?.connection?.newestDay && lined ? args : "skip");
  return (
    <VisitsPerConversionChart
      days={days}
      events={events}
      figures={figures}
      before={lined && daysBefore?.held ? daysBefore : null}
      from={from}
      to={to}
      exportName="google-analytics-visits-per-conversion"
    />
  );
}


/**
 * "Visits needed for one conversion" (Anthony, 2026-10-20: "number of visits
 * required to get a conversion over time"): visits over the counted
 * conversions they made, each day, week or month as the chart steps — fewer
 * is better. For the weeks and months, the span before laid over them day for
 * day as a dashed grey line ("only keep the second line for another 30 days
 * or below": past 92 days only weeks and months are kept, so nothing compares
 * a day with a day). A tick box for each kind of conversion, all ticked at
 * first ("can we add filters … such as click to apply now"): the lines and
 * the figures count only the kinds ticked, one or several. The hint leads
 * with the period's own figure and the period before's, from the same visits
 * and conversions as the figures at the top. Each point's readout names its
 * visits and conversions under the line's name, and the day it is laid over.
 * Drawn for the whole website on Conversions, and for one page on its own
 * screen (`page`), counting the visits that started there.
 */
function VisitsPerConversionChart({ days, events, figures, before, from, to, exportName, page = false, empty }: {
  days: readonly KindPoint[];
  events: readonly string[];
  /** Null while they load. */
  figures: CostFigures | null;
  /** Null for the quarters and the year, and while the span before is not held. */
  before: DaysBefore | null;
  from: string | null;
  to: string | null;
  exportName: string;
  /** One page's: its visits as a landing page, said in the hint. */
  page?: boolean;
  /** What shows in place of the chart with no days: "Still being collected…" while a page's days are not held. */
  empty?: string;
}) {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const tc = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const locale = useLocale();
  const nameOf = useEventName();
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const [period] = usePeriod();
  const lined = DRAWN_BEFORE.has(period);
  const { shown, controls } = useSeriesTicks(events.map((eventName) => ({ key: eventName, name: nameOf(eventName) })));
  const ticked = new Set(shown.map((kind) => kind.key));
  const every = shown.length === events.length;
  // Each point's conversions, counting only the kinds ticked; the days before's matched to them by name.
  const tickedOf = (names: readonly string[], counts: readonly number[] | undefined, all: number) => (every ? all
    : names.reduce((sum, name, at) => sum + (ticked.has(name) ? counts?.[at] ?? 0 : 0), 0));
  const now = days.map((point) => ({ ...point, conversions: tickedOf(events, point.events, point.conversions) }));
  const held = before ? before.points.map((point) => ({ ...point, conversions: tickedOf(before.events, point.events, point.conversions) })) : null;
  const shift = before?.shift ?? 0;
  const rows = visitsPerConversion(now, held, step);
  const periodName = tf(`periods.${periodWord(period)}`);
  // "the month before", as the figures at the top word it; at a sentence's start, "The month before".
  const beforeName = tf(`before.${periodWord(period)}`);
  const BeforeName = beforeName.charAt(0).toLocaleUpperCase(locale) + beforeName.slice(1);
  const kinds = eventList(shown.map((kind) => kind.key).join(","), nameOf, locale);
  const series: SiteSeries[] = [
    { key: "perConversion", name: periodName, colour: CHART_SERIES_ORANGE },
    ...(held ? [{ key: "perConversionBefore", name: BeforeName, colour: CHART_COMPARATOR_GREY, dashed: true }] : []),
  ];
  const counted = figures ? figures.kinds.filter((kind) => every || ticked.has(kind.eventName)) : [];
  const conversions = counted.reduce((sum, kind) => sum + kind.count, 0);
  const conversionsBefore = counted.every((kind) => kind.countBefore !== null) ? counted.reduce((sum, kind) => sum + (kind.countBefore ?? 0), 0) : null;
  const hint = [
    page ? t("perConversionPageScope") : null,
    figures === null ? null
      : conversions > 0
        ? t(every ? "perConversionOverall" : "perConversionOverallSome", { period: periodName, kinds, per: formatPerConversion(figures.visits / conversions), visits: figures.visits, conversions })
        : every ? t("perConversionNoneOverall", { period: periodName }) : t("perConversionNoneOverallSome", { period: periodName, kinds }),
    figures === null || figures.visitsBefore === null || conversionsBefore === null ? null
      : conversionsBefore > 0
        ? t("perConversionBeforeOverall", { before: BeforeName, per: formatPerConversion(figures.visitsBefore / conversionsBefore), visits: figures.visitsBefore, conversions: conversionsBefore })
        : every ? t("perConversionBeforeNone", { before: BeforeName }) : t("perConversionBeforeNoneSome", { kinds, before: beforeName }),
    t("perConversionRead", { step }),
    rows.some((row) => row.coarse) ? t("perConversionCoarse") : null,
    lined ? null : t("perConversionBeforeLineShort"),
  ].filter(Boolean).join(" ");
  const beforeLine = (entry: ChartTooltipEntry) => entry.dataKey === "perConversionBefore";
  // The point's figure, read from its row: a step with no conversion reads as a dash, never as nought.
  const formatValue = (_value: number, entry: ChartTooltipEntry) => {
    const row = entry.payload as CostRow | undefined;
    return formatPerConversion(row ? (beforeLine(entry) ? row.perConversionBefore : row.perConversion) : null);
  };
  // The day, or days, the grey line's point was laid over from: "13 Sept".
  const dayBefore = (row: CostRow) => {
    const first = shiftDays(row.first, -shift);
    const last = shiftDays(row.lastDay, -shift);
    return first === last ? formatShortDay(first) : `${formatShortDay(first)} – ${formatShortDay(last)}`;
  };
  const seriesLabel = (entry: ChartTooltipEntry) => {
    const row = entry.payload as CostRow | undefined;
    const details = !row ? null
      : beforeLine(entry) ? t("perConversionRowDated", { date: dayBefore(row), visits: row.visitsBefore ?? 0, conversions: row.conversionsBefore ?? 0 })
        : t("perConversionRow", { visits: row.visits, conversions: row.conversions });
    return (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{entry.name}</span>
        {details ? <span className="truncate text-[11px] text-muted">{details}</span> : null}
      </span>
    );
  };
  const drawn = rows.some((row) => row.perConversion !== null || row.perConversionBefore !== null);
  const csv = () => toCsv(
    ["day", tc("visits"), every ? tc("conversions") : `${tc("conversions")}: ${kinds}`, t("perConversionCsv"), ...(held ? [`${t("perConversionCsv")}, ${beforeName}`] : [])],
    rows.map((row) => [row.day, row.visits, row.conversions, row.perConversion, ...(held ? [row.perConversionBefore] : [])]),
  );
  return (
    <SearchConsoleChartCard
      title={t("perConversionTitle")}
      hint={hint}
      // One kind alone has nothing to choose between.
      controls={events.length > 1 ? controls : undefined}
      exportName={exportName}
      csv={csv}
      host={status?.host ?? ""}
      from={from}
      to={to}
      step={step}
    >
      {rows.length === 0 ? <p className="py-10 text-center text-[12px] text-muted">{empty ?? tc("empty")}</p>
        : !drawn ? <p className="py-10 text-center text-[12px] text-muted">{t("perConversionNone")}</p>
          : <SiteLineChart data={rows} series={series} sharedScale formatValue={formatValue} seriesLabel={seriesLabel} keepEmptyRows />}
    </SearchConsoleChartCard>
  );
}

/**
 * "What people did before converting" (CV4): each action over the last 12
 * months, the share of its people who went on to convert, orange where that
 * beats everyone's on enough people to judge — Channels' "What a visit is
 * worth" drawn the same way.
 */
export function BeforeConvertingCard({ before }: { before: Before | null }) {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  if (!before) return null;
  const siteRate = before.siteRate ?? 0;
  type Row = Before["rows"][number];
  const data = before.rows.map((row) => ({ label: nameOf(row.eventName), rate: row.did > 0 ? row.then / row.did : 0, row }));
  const csv = () => toCsv(["event", "people", "wentOnToConvert", "rate"], before.rows.map((row) => [row.eventName, row.did, row.then, row.did > 0 ? row.then / row.did : 0]));
  return (
    <SearchConsoleChartCard
      title={t("beforeTitle")}
      // Until everyone's own rate is kept, the hint names no rate to beat.
      hint={before.siteRate === null ? t("beforeHintWaiting") : t("beforeHint", { siteRate: formatPercent(before.siteRate), few: before.few })}
      exportName="google-analytics-before-converting"
      csv={csv}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {before.collecting ? <p className="py-10 text-center text-[12px] text-muted">{t("beforeCollecting")}</p>
        : data.length === 0 ? <p className="py-10 text-center text-[12px] text-muted">{t("beforeEmpty")}</p>
          : (
            <SiteBarChart
              horizontal
              data={data}
              xKey="label"
              updateKey={false}
              series={[{ key: "rate", name: t("beforeRate"), colour: CHART_COMPARATOR_GREY }]}
              // Orange only where the share beats everyone's, on enough people to judge.
              highlight={{ colour: CHART_SERIES_ORANGE, rows: (entry) => Number(entry.rate) > siteRate && (entry.row as Row).did >= before.few }}
              formatScale={(value) => formatPercent(value)}
              formatValue={(value, entry) => {
                const row = entry.payload?.row as Row | undefined;
                return t(row && row.did < before.few ? "beforeReadoutFew" : "beforeReadout", {
                  rate: formatPercent(value), people: formatNumber(row?.did ?? 0), siteRate: formatPercent(before.siteRate), few: before.few,
                });
              }}
            />
          )}
    </SearchConsoleChartCard>
  );
}
