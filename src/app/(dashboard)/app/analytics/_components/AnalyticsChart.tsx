"use client";

import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { SITE_SERIES_COLOURS, SiteBarChart, SiteLineChart, type SiteSeries } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatMonth, formatShortDay, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard, useSeriesTicks } from "../../search-console/_components/SearchConsoleChartCard";
import { currencySign, pathOf } from "./analyticsFormat";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, useStep, type Step, periodWord } from "./useAnalytics";
import type { VisitorList } from "./AnalyticsListScreen";
import { coarserThanStep, perStep, stepKey } from "./stepScale";

/** One day of the chart: the website's figures, and each counted event's own count. */
export type ChartDay = {
  day: string;
  /** Past 90 days, a page's figures are held by week, then month (ga-stored-figures-plan.md SF2b): the point's last day. */
  lastDay?: string;
  visits: number;
  engaged: number;
  views?: number;
  conversions: number;
  value: number;
  events?: number[];
};

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
    const key = stepKey(step, day.day, day.lastDay);
    const bucket = buckets.get(key) ?? { day: key, first: day.day, last: day.day, visits: 0, engaged: 0, views: 0, conversions: 0, value: 0, events: Array<number>(eventCount).fill(0) };
    const last = day.lastDay ?? day.day;
    if (last > bucket.last) bucket.last = last;
    bucket.visits += day.visits;
    bucket.views = (bucket.views ?? 0) + (day.views ?? 0);
    bucket.engaged += day.engaged;
    bucket.conversions += day.conversions;
    bucket.value += day.value;
    (day.events ?? []).forEach((count, index) => (bucket.events![index] = (bucket.events![index] ?? 0) + count));
    buckets.set(key, bucket);
  }
  // A week or month held whole is drawn as its average for the step (SF2b), and flagged for the chart's hint.
  return [...buckets.values()].map((bucket) => {
    const each = (value: number) => Math.round(perStep(value, bucket.first, bucket.last, step) * 10) / 10;
    return datedRow(
      { day: step === "month" ? `${bucket.day}-01` : bucket.first, lastDay: bucket.last },
      {
        visits: each(bucket.visits),
        engaged: each(bucket.engaged),
        views: each(bucket.views ?? 0),
        conversions: each(bucket.conversions),
        value: Math.round(perStep(bucket.value, bucket.first, bucket.last, step)) / 100,
        ...Object.fromEntries((bucket.events ?? []).map((count, index) => [`event${index}`, each(count)])),
        ...(coarserThanStep(bucket.first, bucket.last, step) ? { coarse: true } : {}),
      },
      step === "month" ? formatMonth(bucket.day) : formatShortDay(bucket.first),
    );
  });
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
      hint={`${t("hint")}${data.some((row) => row.coarse === true) ? ` ${t(`coarse.${step}`)}` : ""}`}
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
      hint={`${t(viewsOnly ? "viewsOnlyHint" : "visitsHint", { period: tf(`periods.${periodWord(period)}`), step })}${data.some((row) => row.coarse === true) ? ` ${t(`coarse.${step}`)}` : ""}`}
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
      hint={`${t("conversionsHint")}${data.some((row) => row.coarse === true) ? ` ${t(`coarse.${step}`)}` : ""}`}
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

/**
 * The channels' colours, the busiest first, and everything else grey (chartPalette.ts). Teal fourth, not amber, which
 * read as the busiest channel's orange (Anthony, 2026-10-20: Referral beside Organic Search; "fix all"). A page's
 * "Visits needed for one conversion, by channel" draws its channels in the same colours.
 */
export const CHANNEL_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL];

/**
 * Channels' chart (GA35; §18.2 board 16): each of the four busiest channels'
 * visits a day, the rest one line, stepped by day, week or month as chosen.
 * Events' charts are drawn by it too (§18.2 boards 22 and 23): scrolls and
 * link clicks, or one event's times, a line each, under their own `title`.
 */
export function ChannelsChart({ channels, rest, points, host, from, to, exportName, title, updateKey = true, marked = false }: {
  /** Whether the legend names Google's update mark: a channel's own page leaves it to the hover (ga-channel-pages-plan.md CH4). */
  updateKey?: boolean;
  /** A dot on each line's days with a conversion, bigger for more, named in the legend (Channels, CH9). */
  marked?: boolean;
  channels: readonly string[];
  rest: boolean;
  /** A point held as a week or month past the 90 days (ga-stored-figures-plan.md SF2b) carries its last day. */
  points: ReadonlyArray<{ day: string; lastDay?: string; visits: readonly number[]; conversions?: readonly number[] }>;
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
  ].map((entry, index) => (marked ? { ...entry, marks: `dot${index}` } : entry));
  const buckets = new Map<string, { first: string; last: string; visits: number[]; conversions: number[] }>();
  for (const point of [...points].sort((left, right) => left.day.localeCompare(right.day))) {
    const key = stepKey(step, point.day, point.lastDay);
    const bucket = buckets.get(key) ?? { first: point.day, last: point.day, visits: series.map(() => 0), conversions: series.map(() => 0) };
    const last = point.lastDay ?? point.day;
    if (last > bucket.last) bucket.last = last;
    point.visits.forEach((visits, index) => (bucket.visits[index] = (bucket.visits[index] ?? 0) + visits));
    point.conversions?.forEach((count, index) => (bucket.conversions[index] = (bucket.conversions[index] ?? 0) + count));
    buckets.set(key, bucket);
  }
  // A week or month held whole is drawn as its average for the step (SF2b), and the hint says so.
  const coarse = [...buckets.values()].some((bucket) => coarserThanStep(bucket.first, bucket.last, step));
  const data = [...buckets.entries()].map(([key, bucket]) => datedRow(
    { day: step === "month" ? `${key}-01` : bucket.first, lastDay: bucket.last },
    {
      ...Object.fromEntries(series.map((entry, index) => [entry.key, Math.round(perStep(bucket.visits[index] ?? 0, bucket.first, bucket.last, step) * 10) / 10])),
      ...(marked ? Object.fromEntries(series.map((_entry, index) => [`dot${index}`, bucket.conversions[index] ?? 0])) : {}),
    },
    step === "month" ? formatMonth(key) : formatShortDay(bucket.first),
  ));
  const dotted = marked && data.some((row) => series.some((_entry, index) => Number((row as Record<string, unknown>)[`dot${index}`]) > 0));
  return (
    <SearchConsoleChartCard
      title={title ? title[step] : t(`channelsTitle.${step}`)}
      hint={`${title ? title.hint : t("channelsHint", { period: tf(`periods.${periodWord(period)}`) })}${coarse ? ` ${t(`coarse.${step}`)}` : ""}`}
      exportName={exportName}
      csv={() => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => (row as Record<string, unknown>)[entry.key] as number)]))}
      host={host}
      from={from}
      to={to}
      step={step}
    >
      {data.length > 0
        ? <SiteLineChart data={data} series={series} sharedScale updateKey={updateKey} {...(dotted ? { markLabel: t(`converted.${step}`) } : {})} />
        : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
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
  bars: "channels" | "channelsList" | "landing" | "conversions" | "campaigns" | `visitors.${VisitorList}`;
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
      hint={t(`bars.${bars}.hint`, { period: tf(`periods.${periodWord(args.period)}`) })}
      measure={t(`bars.${bars}.measure`)}
      rows={top?.rows.map((row) => ({ label: nameOf ? nameOf(row.label) : row.label, value: sort === "views" ? row.views : sort === "conversions" ? row.conversions : row.visits }))}
      exportName={`google-analytics-${bars}`}
      host={status?.host ?? ""}
      from={top?.from ?? null}
      to={top?.to ?? null}
    />
  );
}

/** Channels' chart, read for itself from the channels kept a day, then a week, then a month (GA35; ga-stored-figures-plan.md SF2). */
export function ChannelsDailyChart() {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsChannelChart, status?.connection?.newestDay ? args : "skip");
  useSeesPart("channelsByDay", chart);
  return (
    <ChannelsChart
      channels={chart?.channels ?? []}
      rest={chart?.rest ?? false}
      points={chart?.points ?? []}
      host={status?.host ?? ""}
      from={null}
      to={null}
      exportName="google-analytics-channels-daily"
      marked
      updateKey={false}
    />
  );
}

/**
 * Campaigns' chart (GA28; §18.2 board 17): the visits from tagged links a
 * day, read for itself from the campaigns kept a day (ga-stored-figures-plan.md SF12).
 */
export function CampaignsDailyChart() {
  const t = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsCampaignChart, status?.connection?.newestDay ? args : "skip");
  // Read for itself, so the page's eye is handed it here (sees-every-page-plan-2026-10-31.md).
  useSeesPart("taggedVisitsByDay", chart);
  return (
    <ChannelsChart
      channels={[t("visits")]}
      rest={false}
      points={(chart?.points ?? []).map((point) => ({ day: point.day, lastDay: point.lastDay, visits: [point.visits] }))}
      host={status?.host ?? ""}
      from={null}
      to={null}
      exportName="google-analytics-campaigns-daily"
      title={{ ...t.raw("campaignsTitle") as { day: string; week: string; month: string }, hint: t("campaignsHint", { period: tf(`periods.${periodWord(args.period)}`) }) }}
    />
  );
}

/** Lines of views a day added up into the step chosen, one value a line, dated by each bucket's first day. */
function viewsByStep(step: Step, series: readonly SiteSeries[], lines: ReadonlyArray<ReadonlyArray<{ day: string; lastDay?: string; views: number }>>): Array<Record<string, unknown>> {
  const buckets = new Map<string, { first: string; last: string; views: number[] }>();
  lines.forEach((points, line) => {
    for (const point of points) {
      const key = stepKey(step, point.day, point.lastDay);
      const bucket = buckets.get(key) ?? { first: point.day, last: point.day, views: series.map(() => 0) };
      if (point.day < bucket.first) bucket.first = point.day;
      const last = point.lastDay ?? point.day;
      if (last > bucket.last) bucket.last = last;
      bucket.views[line] += point.views;
      buckets.set(key, bucket);
    }
  });
  // A page's week or month held whole, as its average for the step (ga-stored-figures-plan.md SF2b).
  return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, bucket]) => datedRow(
    { day: step === "month" ? `${key}-01` : bucket.first, lastDay: bucket.last },
    {
      ...Object.fromEntries(series.map((entry, index) => [entry.key, Math.round(perStep(bucket.views[index] ?? 0, bucket.first, bucket.last, step) * 10) / 10])),
      ...(coarserThanStep(bucket.first, bucket.last, step) ? { coarse: true } : {}),
    },
    step === "month" ? formatMonth(key) : formatShortDay(bucket.first),
  ));
}

/** Each ticked page's line, in the order ticked; the website's is grey and dashed. */
const PLOTTED_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_AMBER, CHART_SERIES_TEAL];

/**
 * All pages' "Views a day" (docs/plans/active/all-pages-rethink-plan.md AP2,
 * AP3): short and wide over the table, as Google Analytics draws Pages and
 * screens — the whole website dashed, from Overview's days, and each page
 * ticked in the table a line of its own, five at most, asked of Google when
 * first drawn. Stepped by day, week or month as chosen at the top.
 */
export function PagesDailyChart({ pages }: { pages: readonly string[] }) {
  const t = useTranslations("googleAnalytics.chart.pagesDaily");
  const tc = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const [period] = usePeriod();
  const ready = Boolean(status?.connection?.newestDay);
  const website = useQuery(api.googleAnalyticsChartReads.analyticsChart, ready ? args : "skip");
  const daily = useQuery(api.googleAnalyticsPageReads.analyticsPagesDaily, ready && pages.length > 0 ? { ...args, pages: [...pages] } : "skip");
  const drawn = pages.flatMap((ref, index) => {
    const page = daily?.pages.find((one) => one.ref === ref);
    return page?.points ? [{ ...page, points: page.points, colour: PLOTTED_COLOURS[index] ?? CHART_SERIES_SLATE }] : [];
  });
  const series: SiteSeries[] = [
    { key: "website", name: t("website"), colour: CHART_SERIES_SLATE, dashed: true },
    ...drawn.map((page, index) => ({ key: `page${index}`, name: pathOf(page.address), colour: page.colour })),
  ];
  const data = viewsByStep(step, series, [website?.points ?? [], ...drawn.map((page) => page.points)]);
  const hint = `${t("hint", { period: tf(`periods.${periodWord(period)}`) })}${data.some((row) => row.coarse === true) ? ` ${tc(`coarse.${step}`)}` : ""}`;
  return (
    <SearchConsoleChartCard
      title={t(`title.${step}`)}
      hint={hint}
      exportName="google-analytics-pages-daily"
      csv={() => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => (row as Record<string, unknown>)[entry.key] as number)]))}
      host={status?.host ?? ""}
      from={null}
      to={null}
      step={step}
    >
      {data.length > 0 ? <SiteLineChart data={data} series={series} height={200} sharedScale /> : <p className="py-10 text-center text-[12px] text-muted">{tc("empty")}</p>}
    </SearchConsoleChartCard>
  );
}
