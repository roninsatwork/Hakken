"use client";

import { useTranslations } from "next-intl";
import { weekStart } from "@/convex/utils/searchConsolePacks";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { SiteBarChart, SiteLineChart, type SiteSeries } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatMonth, formatShortDay, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard, useSeriesTicks } from "../../search-console/_components/SearchConsoleChartCard";
import { formatShare } from "./BingParts";
import type { Step } from "./useBing";

/**
 * The Bing Webmaster charts, as drawn (bing-webmaster-plan.md §5): every one
 * the full width of the page, one under another, built from the Sites chart
 * parts with Search Console's card, Bing in orange and Google in blue.
 */

type Day = { day: string; clicks: number; impressions: number };

/** Days into the step chosen, each week or month added up from its days, dated by its first day. */
function stepped(days: readonly Day[], step: Step) {
  const buckets = new Map<string, Day & { first: string; last: string }>();
  for (const day of [...days].sort((left, right) => left.day.localeCompare(right.day))) {
    const key = step === "day" ? day.day : step === "week" ? weekStart(day.day) : day.day.slice(0, 7);
    const bucket = buckets.get(key) ?? { day: key, first: day.day, last: day.day, clicks: 0, impressions: 0 };
    bucket.last = day.day;
    bucket.clicks += day.clicks;
    bucket.impressions += day.impressions;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map((bucket) => datedRow(
    { day: step === "month" ? `${bucket.day}-01` : bucket.first, lastDay: bucket.last },
    { clicks: bucket.clicks, impressions: bucket.impressions, ctr: bucket.impressions > 0 ? Math.round((bucket.clicks / bucket.impressions) * 10_000) / 100 : 0 },
    step === "month" ? formatMonth(bucket.day) : formatShortDay(bucket.first),
  ));
}

const Empty = ({ text }: { text: string }) => <p className="py-10 text-center text-[12px] text-muted">{text}</p>;

/** "Clicks and impressions over time": tick the measures to draw, each line on its own scale (board 2). */
export function BingClicksChart({ days, step, host, from, to, title, hint }: {
  days: readonly Day[];
  step: Step;
  host: string;
  from: string | null;
  to: string | null;
  title?: string;
  hint?: string;
}) {
  const t = useTranslations("bingWebmaster.chart");
  const series: SiteSeries[] = [
    { key: "clicks", name: t("clicks"), colour: CHART_SERIES_ORANGE },
    { key: "impressions", name: t("impressions"), colour: CHART_SERIES_VIOLET },
    { key: "ctr", name: t("ctr"), colour: CHART_SERIES_BLUE },
  ];
  const { shown, controls } = useSeriesTicks(series, ["ctr"]);
  const data = stepped(days, step);
  return (
    <SearchConsoleChartCard
      title={title ?? t("title")}
      hint={hint ?? t("hint")}
      controls={controls}
      exportName="bing-webmaster-clicks"
      csv={() => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => row[entry.key] as number)]))}
      host={host}
      from={from}
      to={to}
      step={step}
    >
      {data.length > 0 ? <SiteLineChart data={data} series={shown} /> : <Empty text={t("empty")} />}
    </SearchConsoleChartCard>
  );
}

type Week = { week: string; bing: number; google: number | null };

/** "Bing's share of your search clicks, week by week": a bar a week, its share written on it (board 2, 6). */
export function BingShareChart({ weeks, host, from, to }: { weeks: readonly Week[]; host: string; from: string | null; to: string | null }) {
  const t = useTranslations("bingWebmaster.chart");
  const data = weeks.filter((week) => week.google !== null).map((week) => datedRow(
    { day: week.week },
    { share: week.bing + (week.google ?? 0) > 0 ? Math.round((week.bing / (week.bing + (week.google ?? 0))) * 1000) / 10 : 0 },
    formatShortDay(week.week),
  ));
  return (
    <SearchConsoleChartCard
      title={t("shareTitle")}
      hint={t("shareHint")}
      exportName="bing-webmaster-share"
      csv={() => toCsv(["week", t("share")], data.map((row) => [String(row.day), row.share as number]))}
      host={host}
      from={from}
      to={to}
      step="week"
    >
      {data.length > 0 ? (
        <SiteBarChart
          data={data}
          series={[{ key: "share", name: t("share"), colour: CHART_SERIES_ORANGE }]}
          labels={(value) => formatShare(value / 100)}
          formatValue={(value) => formatShare(value / 100)}
          formatScale={(value) => `${value}%`}
        />
      ) : <Empty text={t("empty")} />}
    </SearchConsoleChartCard>
  );
}

/** "Clicks each week, Bing against Google": two lines, each on its own scale (board 2). */
export function BingVersusChart({ weeks, host, from, to }: { weeks: readonly Week[]; host: string; from: string | null; to: string | null }) {
  const t = useTranslations("bingWebmaster.chart");
  const data = weeks.map((week) => datedRow({ day: week.week }, { bing: week.bing, google: week.google ?? 0 }, formatShortDay(week.week)));
  const series: SiteSeries[] = [
    { key: "bing", name: t("bing"), colour: CHART_SERIES_ORANGE },
    { key: "google", name: t("google"), colour: CHART_SERIES_BLUE },
  ];
  return (
    <SearchConsoleChartCard
      title={t("versusTitle")}
      hint={t("versusHint")}
      exportName="bing-webmaster-against-google"
      csv={() => toCsv(["week", t("bing"), t("google")], data.map((row) => [String(row.day), row.bing as number, row.google as number]))}
      host={host}
      from={from}
      to={to}
      step="week"
    >
      {data.length > 0 ? <SiteLineChart data={data} series={series} /> : <Empty text={t("empty")} />}
    </SearchConsoleChartCard>
  );
}

/** A keyword's or a page's own weeks on Bing: its position (a keyword) or its clicks (a page). */
export function BingRecordChart({ weeks, measure, host }: {
  weeks: readonly { week: string; clicks: number; impressions: number; position: number | null }[];
  measure: "position" | "clicks";
  host: string;
}) {
  const t = useTranslations("bingWebmaster.chart");
  const data = weeks.map((week) => datedRow(
    { day: week.week },
    measure === "position" ? { position: week.position === null ? null : Math.round(week.position * 10) / 10 } : { clicks: week.clicks, impressions: week.impressions },
    formatShortDay(week.week),
  ));
  const series: SiteSeries[] = measure === "position"
    ? [{ key: "position", name: t("bing"), colour: CHART_SERIES_ORANGE, reversed: true }]
    : [{ key: "clicks", name: t("clicks"), colour: CHART_SERIES_ORANGE }, { key: "impressions", name: t("impressions"), colour: CHART_SERIES_VIOLET }];
  return (
    <SearchConsoleChartCard
      title={measure === "position" ? t("positionTitle") : t("pageClicksTitle")}
      hint={measure === "position" ? t("positionHint") : t("pageClicksHint")}
      exportName={`bing-webmaster-${measure}`}
      csv={() => toCsv(["week", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => row[entry.key] as number)]))}
      host={host}
      from={weeks[0]?.week ?? null}
      to={weeks[weeks.length - 1]?.week ?? null}
      step="week"
    >
      {data.length > 0 ? <SiteLineChart data={data} series={series} height={300} /> : <Empty text={t("empty")} />}
    </SearchConsoleChartCard>
  );
}

/** "Pages Bing read each day, and its errors": two lines, each on its own scale (board 7). */
export function BingCrawlChart({ days, host, from, to, labels }: {
  days: readonly { day: string; crawled: number; errors: number }[];
  host: string;
  from: string | null;
  to: string | null;
  labels: { title: string; hint: string; read: string; errors: string; empty: string };
}) {
  const data = days.map((day) => datedRow({ day: day.day }, { crawled: day.crawled, errors: day.errors }, formatShortDay(day.day)));
  const series: SiteSeries[] = [
    { key: "crawled", name: labels.read, colour: CHART_SERIES_ORANGE },
    { key: "errors", name: labels.errors, colour: CHART_SERIES_ROSE },
  ];
  return (
    <SearchConsoleChartCard
      title={labels.title}
      hint={labels.hint}
      exportName="bing-webmaster-crawling"
      csv={() => toCsv(["day", labels.read, labels.errors], data.map((row) => [String(row.day), row.crawled as number, row.errors as number]))}
      host={host}
      from={from}
      to={to}
      step="day"
    >
      {data.length > 0 ? <SiteLineChart data={data} series={series} /> : <Empty text={labels.empty} />}
    </SearchConsoleChartCard>
  );
}
