"use client";

import { useTranslations } from "next-intl";
import { weekStart } from "@/convex/utils/searchConsolePacks";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { SITE_SERIES_COLOURS, SiteLineChart, type SiteSeries } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatMonth, formatShortDay, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard, useSeriesTicks } from "../../search-console/_components/SearchConsoleChartCard";
import { currencySign } from "./analyticsFormat";
import { useStep, type Step } from "./useAnalytics";

/** One day of the chart: the website's figures, and each counted event's own count. */
export type ChartDay = { day: string; visits: number; engaged: number; conversions: number; value: number; events?: number[] };

const MEASURE_COLOURS: Record<string, string> = {
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
    const bucket = buckets.get(key) ?? { day: key, first: day.day, last: day.day, visits: 0, engaged: 0, conversions: 0, value: 0, events: Array<number>(eventCount).fill(0) };
    bucket.last = day.day;
    bucket.visits += day.visits;
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
 * "Conversions over time" (§11 board 7): one line for each kind of conversion,
 * on one scale; tick Value to add the money on a scale of its own.
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
