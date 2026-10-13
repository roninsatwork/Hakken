"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { weekStart } from "@/convex/utils/searchConsolePacks";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_SLATE, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { SITE_SERIES_COLOURS, SiteBarChart, SiteLineChart, type SiteSeries } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatMonth, formatShortDay, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard, useSeriesTicks } from "../../search-console/_components/SearchConsoleChartCard";
import { currencySign, pathOf } from "./analyticsFormat";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, useStep, type Step } from "./useAnalytics";
import { useLiveAsk, type VisitorList } from "./AnalyticsListScreen";

/** One day of the chart: the website's figures, and each counted event's own count. */
export type ChartDay = { day: string; visits: number; engaged: number; views?: number; conversions: number; value: number; events?: number[] };

const MEASURE_COLOURS: Record<string, string> = {
  views: CHART_SERIES_ORANGE,
  visits: CHART_SERIES_ORANGE,
  engaged: CHART_SERIES_BLUE,
  conversions: CHART_SERIES_VIOLET,
  value: CHART_SERIES_AMBER,
};

/** Days into the step chosen — each week or month added up from its days — dated by their first day. */
export function stepped(days: readonly ChartDay[], step: Step, eventCount = 0): Array<Record<string, unknown>> {
  const buckets = new Map<string, ChartDay & { first: string; last: string }>();
  for (const day of [...days].sort((left, right) => left.day.localeCompare(right.day))) {
    const key = step === "day" ? day.day : step === "week" ? weekStart(day.day) : day.day.slice(0, 7);
    const bucket = buckets.get(key) ?? { day: key, first: day.day, last: day.day, visits: 0, engaged: 0, views: 0, conversions: 0, value: 0, events: Array<number>(eventCount).fill(0) };
    bucket.last = day.day;
    bucket.visits += day.visits;
    bucket.views = (bucket.views ?? 0) + (day.views ?? 0);
    bucket.engaged += day.engaged;
    bucket.conversions += day.conversions;
    bucket.value += day.value;
    (day.events ?? []).forEach((count, index) => (bucket.events![index] = (bucket.events![index] ?? 0) + count));
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((bucket) => datedRow(
    { day: step === "month" ? `${bucket.day}-01` : bucket.first, lastDay: bucket.last },
    {
      visits: bucket.visits,
      engaged: bucket.engaged,
      views: bucket.views ?? 0,
      conversions: bucket.conversions,
      value: Math.round(bucket.value) / 100,
      ...Object.fromEntries((bucket.events ?? []).map((count, index) => [`event${index}`, count])),
    },
    step === "month" ? formatMonth(bucket.day) : formatShortDay(bucket.first),
  ));
}

/**
 * "Visits and conversions over time" (§5; §11 boards 2 and 15): tick the
 * measures to draw, each line on its own scale so small and large numbers read
 * together; visits and conversions ticked at first. Steps by day, week or
 * month as chosen at the top.
 */
export function AnalyticsChart({ days, host, from, to, currency, exportName }: {
  days: readonly ChartDay[];
  host: string;
  from: string | null;
  to: string | null;
  currency: string | null;
  exportName: string;
}) {
  const t = useTranslations("googleAnalytics.chart");
  const [step] = useStep();
  const series: SiteSeries[] = (["visits", "engaged", "conversions", "value"] as const).map((key) => ({
    key,
    name: key === "value" ? t("value", { sign: currencySign(currency) }) : t(key),
    colour: MEASURE_COLOURS[key],
  }));
  const { shown, controls } = useSeriesTicks(series, ["engaged", "value"]);
  const data = stepped(days, step);
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={t("hint")}
      controls={controls}
      exportName={exportName}
      csv={() => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => row[entry.key] as number)]))}
      host={host}
      from={from}
      to={to}
      step={step}
    >
      {data.length > 0 ? <SiteLineChart data={data} series={shown} /> : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/**
 * Overview's chart (§15 screen 2; §18.2 board 13): page views first (GA26),
 * then visits and engaged visits, on one scale, a dot on each day — or week,
 * or month, as the chart steps — with a conversion. Steps by day, week or
 * month as chosen at the top.
 */
export function VisitsChart({ days, host, from, to, exportName, viewsOnly = false }: {
  days: readonly ChartDay[];
  host: string;
  from: string | null;
  to: string | null;
  exportName: string;
  /**
   * A page's own screen from All pages (§18.2 board 21): its views alone —
   * a visit is the whole website's, not one page's — asked of Google when
   * the screen opens.
   */
  viewsOnly?: boolean;
}) {
  const t = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const [step] = useStep();
  const [period] = usePeriod();
  const views: SiteSeries = { key: "views", name: t("views"), colour: CHART_SERIES_ORANGE, marks: "converted" };
  const series: SiteSeries[] = viewsOnly ? [views] : [
    views,
    { key: "visits", name: t("visits"), colour: CHART_SERIES_BLUE },
    { key: "engaged", name: t("engaged"), colour: CHART_SERIES_VIOLET },
  ];
  const data = stepped(days, step).map((row): Record<string, unknown> => ({ ...row, converted: Number(row.conversions) > 0 }));
  return (
    <SearchConsoleChartCard
      title={t(viewsOnly ? `viewsOnlyTitle.${step}` : `viewsTitle.${step}`)}
      hint={t(viewsOnly ? "viewsOnlyHint" : "visitsHint", { period: tf(`periods.${period}`), step })}
      exportName={exportName}
      csv={() => toCsv(["day", ...series.map((entry) => entry.name), t("conversions")], data.map((row) => [String(row.day), ...series.map((entry) => row[entry.key] as number), row.conversions as number]))}
      host={host}
      from={from}
      to={to}
      step={step}
    >
      {data.length > 0 ? <SiteLineChart data={data} series={series} sharedScale /> : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/**
 * "Conversions over time" (§11 board 7; back by GA35, §18.2 board 24): one
 * line for each kind of conversion, on one scale; tick Value to add the money
 * on a scale of its own. Restored as built on 2026-10-10.
 */
export function ConversionsChart({ days, events, names, host, from, to, currency }: {
  days: readonly ChartDay[];
  events: readonly string[];
  names: (eventName: string) => string;
  host: string;
  from: string | null;
  to: string | null;
  currency: string | null;
}) {
  const t = useTranslations("googleAnalytics.chart");
  const [step] = useStep();
  const series: SiteSeries[] = [
    ...events.map((eventName, index) => ({ key: `event${index}`, name: names(eventName), colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length] })),
    { key: "value", name: t("value", { sign: currencySign(currency) }), colour: CHART_SERIES_AMBER },
  ];
  const { shown, controls } = useSeriesTicks(series, ["value"]);
  const data = stepped(days, step, events.length);
  return (
    <SearchConsoleChartCard
      title={t("conversionsTitle")}
      hint={t("conversionsHint")}
      controls={controls}
      exportName="google-analytics-conversions"
      csv={() => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => row[entry.key] as number)]))}
      host={host}
      from={from}
      to={to}
      step={step}
    >
      {data.length > 0
        ? <SiteLineChart data={data} series={shown} scaleOf={(entry) => (entry.key === "value" ? "value" : "conversions")} />
        : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/** A bar's name, cut to fit beside the bars: a page by its path. */
function barLabel(label: string): string {
  const name = pathOf(label);
  return name.length > 34 ? `${name.slice(0, 33)}…` : name;
}

/**
 * The first ten of a list as bars along (GA35; §18.2 boards 13, 16, 18, 20,
 * 24): Sites' bar chart, one bar a row, the names on the left. Pages are
 * named by their paths.
 */
export function TopBars({ title, hint, rows, measure, exportName, host, from, to, labels }: {
  title: string;
  hint: string;
  rows: ReadonlyArray<{ label: string; value: number }> | undefined;
  /** Each bar's figure written on it, so none needs a hover (a page's own screen, analytics-page-screen-plan.md §2). */
  labels?: (value: number) => string;
  /** What the bars count: "Visits", "Views", "Conversions". */
  measure: string;
  exportName: string;
  host: string;
  from: string | null;
  to: string | null;
}) {
  const t = useTranslations("googleAnalytics.chart");
  const data = (rows ?? []).filter((row) => row.value > 0).map((row) => ({ label: barLabel(row.label), value: row.value }));
  return (
    <SearchConsoleChartCard
      title={title}
      hint={hint}
      exportName={exportName}
      csv={() => toCsv(["name", measure], (rows ?? []).map((row) => [row.label, row.value]))}
      host={host}
      from={from}
      to={to}
    >
      {data.length > 0
        ? <SiteBarChart horizontal data={data} xKey="label" series={[{ key: "value", name: measure, colour: CHART_SERIES_ORANGE }]} labels={labels} />
        : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/** The channels' colours, the busiest first, and everything else grey (chartPalette.ts). */
const CHANNEL_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_AMBER];

/**
 * Channels' chart (GA35; §18.2 board 16): each of the four busiest channels'
 * visits a day, the rest one line, stepped by day, week or month as chosen.
 * Events' charts are drawn by it too (§18.2 boards 22 and 23): scrolls and
 * link clicks, or one event's times, a line each, under their own `title`.
 */
export function ChannelsChart({ channels, rest, points, host, from, to, exportName, title }: {
  channels: readonly string[];
  rest: boolean;
  points: ReadonlyArray<{ day: string; visits: readonly number[] }>;
  host: string;
  from: string | null;
  to: string | null;
  exportName: string;
  /** Another chart's title and hint, each step's own title among them: Events'. */
  title?: { day: string; week: string; month: string; hint: string };
}) {
  const t = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const [step] = useStep();
  const [period] = usePeriod();
  const series: SiteSeries[] = [
    ...channels.map((channel, index) => ({ key: `line${index}`, name: channel || t("noChannel"), colour: CHANNEL_COLOURS[index] ?? CHART_SERIES_SLATE })),
    ...(rest ? [{ key: `line${channels.length}`, name: t("everythingElse"), colour: CHART_SERIES_SLATE }] : []),
  ];
  const buckets = new Map<string, { first: string; last: string; visits: number[] }>();
  for (const point of [...points].sort((left, right) => left.day.localeCompare(right.day))) {
    const key = step === "day" ? point.day : step === "week" ? weekStart(point.day) : point.day.slice(0, 7);
    const bucket = buckets.get(key) ?? { first: point.day, last: point.day, visits: series.map(() => 0) };
    bucket.last = point.day;
    point.visits.forEach((visits, index) => (bucket.visits[index] = (bucket.visits[index] ?? 0) + visits));
    buckets.set(key, bucket);
  }
  const data = [...buckets.entries()].map(([key, bucket]) => datedRow(
    { day: step === "month" ? `${key}-01` : bucket.first, lastDay: bucket.last },
    Object.fromEntries(series.map((entry, index) => [entry.key, bucket.visits[index] ?? 0])),
    step === "month" ? formatMonth(key) : formatShortDay(bucket.first),
  ));
  return (
    <SearchConsoleChartCard
      title={title ? title[step] : t(`channelsTitle.${step}`)}
      hint={title ? title.hint : t("channelsHint", { period: tf(`periods.${period}`) })}
      exportName={exportName}
      csv={() => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => (row as Record<string, unknown>)[entry.key] as number)]))}
      host={host}
      from={from}
      to={to}
      step={step}
    >
      {data.length > 0 ? <SiteLineChart data={data} series={series} sharedScale /> : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/**
 * A list's top ten as bars, read for itself in the order the bars count
 * (GA35): Overview's channels, Landing pages' visits, All pages' views,
 * Conversions' landing pages.
 */
export function ListTopBars({ list, sort, bars, nameOf }: {
  list: "channel" | "landing" | "page" | "campaign" | VisitorList;
  sort: "visits" | "views" | "conversions";
  bars: "channels" | "channelsList" | "landing" | "allPages" | "conversions" | "campaigns" | `visitors.${VisitorList}`;
  /** A bar's name in the reader's words, where Google's is a code (Visitors'). */
  nameOf?: (label: string) => string;
}) {
  const t = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const top = useQuery(api.googleAnalyticsReads.analyticsTopList, status?.connection?.newestDay ? { ...args, list, sort, direction: "desc", count: 10 } : "skip");
  if (top?.live) return null;
  return (
    <TopBars
      title={t(`bars.${bars}.title`)}
      hint={t(`bars.${bars}.hint`, { period: tf(`periods.${args.period}`) })}
      measure={t(`bars.${bars}.measure`)}
      rows={top?.rows.map((row) => ({ label: nameOf ? nameOf(row.label) : row.label, value: sort === "views" ? row.views : sort === "conversions" ? row.conversions : row.visits }))}
      exportName={`google-analytics-${bars}`}
      host={status?.host ?? ""}
      from={top?.from ?? null}
      to={top?.to ?? null}
    />
  );
}

/** Channels' chart, read for itself: from the days kept, or asked of Google once for dates or a country that keep none (GA35). */
export function ChannelsDailyChart() {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsChannelChart, status?.connection?.newestDay ? args : "skip");
  useLiveAsk(chart?.live ? { siteId: args.siteId, period: args.period, device: args.device, country: args.country, chart: "channel" } : null);
  return (
    <ChannelsChart
      channels={chart?.channels ?? []}
      rest={chart?.rest ?? false}
      points={chart?.points ?? []}
      host={status?.host ?? ""}
      from={null}
      to={null}
      exportName="google-analytics-channels-daily"
    />
  );
}

/**
 * Campaigns' chart (GA28; §18.2 board 17): the visits from tagged links a
 * day, read for itself — ready-made, or one device's asked of Google once.
 */
export function CampaignsDailyChart() {
  const t = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsCampaignChart, status?.connection?.newestDay ? args : "skip");
  useLiveAsk(chart?.live ? { siteId: args.siteId, period: args.period, device: args.device, country: args.country, pages: "campaignSeries" } : null);
  return (
    <ChannelsChart
      channels={[t("visits")]}
      rest={false}
      points={(chart?.points ?? []).map((point) => ({ day: point.day, visits: [point.visits] }))}
      host={status?.host ?? ""}
      from={null}
      to={null}
      exportName="google-analytics-campaigns-daily"
      title={{ ...t.raw("campaignsTitle") as { day: string; week: string; month: string }, hint: t("campaignsHint", { period: tf(`periods.${args.period}`) }) }}
    />
  );
}
