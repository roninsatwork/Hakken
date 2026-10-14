"use client";

import { useTranslations } from "next-intl";
import { weekStart } from "@/convex/utils/searchConsolePacks";
import { SITE_SERIES_COLOURS, SiteBarChart, type SiteSeries } from "../../../../sites/_components/SiteCharts";
import { datedRow } from "../../../../sites/_components/datedRows";
import { formatMonth, formatShortDay, toCsv } from "../../../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../../../search-console/_components/SearchConsoleChartCard";
import { ChannelsChart } from "../../../_components/AnalyticsChart";
import { useEventName } from "../../../_components/useEventName";
import { useAnalyticsStatus, usePeriod, useStep, type Step } from "../../../_components/useAnalytics";
import { useBeforeName, type ChannelDays } from "./ChannelParts";
import { coarserThanStep, perStep } from "../../../_components/stepScale";

/**
 * The charts above a channel's table views (docs/plans/active/ga-channel-pages-plan.md
 * CH7): its key events a day over the span before and the dates chosen, and
 * each of its sources a day.
 */

/** Each key event's count a bucket, the span before first and faded, then the dates chosen. */
function eventBuckets(days: ChannelDays, step: Step): Array<Record<string, unknown>> {
  const key = (day: string) => (step === "day" ? day : step === "week" ? weekStart(day) : day.slice(0, 7));
  const rows: Array<Record<string, unknown>> = [];
  for (const [span, list] of [["before", days.before], ["now", days.now]] as const) {
    const buckets = new Map<string, { first: string; last: string; counts: number[] }>();
    for (const day of list) {
      const bucket = buckets.get(key(day.day)) ?? { first: day.day, last: day.day, counts: days.events.map(() => 0) };
      const last = day.lastDay ?? day.day;
      if (last > bucket.last) bucket.last = last;
      day.events.forEach((count, index) => (bucket.counts[index] += count));
      buckets.set(key(day.day), bucket);
    }
    for (const [at, bucket] of buckets) {
      rows.push(datedRow(
        { day: step === "month" ? `${at}-01` : bucket.first, lastDay: bucket.last },
        // A week or month held whole past 90 days, as its average for the step (ga-stored-figures-plan.md SF2b).
        { ...Object.fromEntries(bucket.counts.map((count, index) => [`event${index}`, Math.round(perStep(count, bucket.first, bucket.last, step) * 10) / 10])), span, coarse: coarserThanStep(bucket.first, bucket.last, step) },
        step === "month" ? formatMonth(at) : formatShortDay(bucket.first),
      ));
    }
  }
  return rows;
}

/**
 * "Key events a day" (CH7): every key event of the website, counted or not,
 * in its own colour, stacked — the span before faded, then the dates chosen.
 */
export function KeyEventsDailyChart({ days }: { days: ChannelDays | undefined }) {
  const t = useTranslations("googleAnalytics.channelPage.eventsChart");
  const tc = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const tt = useTranslations("googleAnalytics.channelPage.table");
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const [step] = useStep();
  const [period] = usePeriod();
  const beforeName = useBeforeName();
  const events = days?.events ?? [];
  const series: SiteSeries[] = events.map((event, index) => ({
    key: `event${index}`,
    name: event.counted ? nameOf(event.eventName) : tt("namedNotCounted", { name: nameOf(event.eventName) }),
    colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length],
  }));
  const data = days ? eventBuckets(days, step) : [];
  return (
    <SearchConsoleChartCard
      title={t(`title.${step}`)}
      hint={`${t("hint", { beforeName, period: tf(`periods.${period}`).toLowerCase() })}${data.some((row) => row.coarse === true) ? ` ${tc(`coarse.${step}`)}` : ""}`}
      exportName="google-analytics-channel-key-events-daily"
      csv={() => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => row[entry.key] as number)]))}
      host={status?.host ?? ""}
      from={days?.before[0]?.day ?? null}
      to={days?.to ?? null}
      step={step}
    >
      {data.length > 0 && series.length > 0
        ? <SiteBarChart stacked data={data} series={series} updateKey={false} faded={(row) => row.span === "before"} />
        : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/** "Each source a day" (CH7): the channel's busiest sources a line each, the rest as one. */
export function SourcesDailyChart({ channel, days }: { channel: string; days: ChannelDays | undefined }) {
  const t = useTranslations("googleAnalytics.channelPage.sourcesChart");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  return (
    <ChannelsChart
      channels={days?.sources ?? []}
      rest={days?.rest ?? false}
      points={(days?.now ?? []).map((day) => ({ day: day.day, visits: day.sources }))}
      host={status?.host ?? ""}
      from={days?.from ?? null}
      to={days?.to ?? null}
      exportName="google-analytics-channel-sources-daily"
      updateKey={false}
      title={{ ...(t.raw("title") as { day: string; week: string; month: string }), hint: t("hint", { period: tf(`periods.${period}`), channel }) }}
    />
  );
}
