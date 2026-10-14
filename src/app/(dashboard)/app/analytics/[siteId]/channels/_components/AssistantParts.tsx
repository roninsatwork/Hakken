"use client";

import { useTranslations } from "next-intl";
import { GOOGLE_AI_CHANNEL } from "@/convex/utils/aiAssistants";
import { weekStart } from "@/convex/utils/searchConsolePacks";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { SITE_SERIES_COLOURS, SiteBarChart, type SiteSeries } from "../../../../sites/_components/SiteCharts";
import { datedRow } from "../../../../sites/_components/datedRows";
import { formatMonth, formatNumber, formatShortDay, toCsv } from "../../../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../../../search-console/_components/SearchConsoleChartCard";
import { useAnalyticsStatus, usePeriod, useStep } from "../../../_components/useAnalytics";
import { coarserThanStep, perStep } from "../../../_components/stepScale";
import type { ChannelDays, ChannelTop } from "./ChannelParts";

/**
 * AI assistants' own parts (docs/plans/active/ga-channel-pages-plan.md CH8):
 * every assistant by its own name, whichever channel Google filed it under —
 * their visits over time by assistant, and each one's visits by how Google
 * filed them.
 */

/**
 * "AI assistants a month" (CH8): the assistants' visits stacked by
 * assistant, the busiest four each in its colour and the rest as Others,
 * following the dates and step chosen at the top.
 */
export function AssistantsChart({ days }: { days: ChannelDays | undefined }) {
  const t = useTranslations("googleAnalytics.channelPage.assistantsChart");
  const tc = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const [period] = usePeriod();
  const names = days?.sources ?? [];
  const series: SiteSeries[] = [
    ...names.map((name, index) => ({ key: `line${index}`, name, colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length] })),
    ...(days?.rest ? [{ key: `line${names.length}`, name: t("others"), colour: CHART_SERIES_SLATE }] : []),
  ];
  const buckets = new Map<string, { first: string; last: string; visits: number[] }>();
  for (const day of days?.now ?? []) {
    const key = step === "day" ? day.day : step === "week" ? weekStart(day.day) : day.day.slice(0, 7);
    const bucket = buckets.get(key) ?? { first: day.day, last: day.day, visits: series.map(() => 0) };
    const last = day.lastDay ?? day.day;
    if (last > bucket.last) bucket.last = last;
    day.sources.forEach((visits, index) => (bucket.visits[index] = (bucket.visits[index] ?? 0) + visits));
    buckets.set(key, bucket);
  }
  // A week or month held whole past 90 days, drawn as its average for the step (ga-stored-figures-plan.md SF2b).
  const coarse = [...buckets.values()].some((bucket) => coarserThanStep(bucket.first, bucket.last, step));
  const data = [...buckets.entries()].map(([key, bucket]) => datedRow(
    { day: step === "month" ? `${key}-01` : bucket.first, lastDay: bucket.last },
    Object.fromEntries(series.map((entry, index) => [entry.key, Math.round(perStep(bucket.visits[index] ?? 0, bucket.first, bucket.last, step) * 10) / 10])),
    step === "month" ? formatMonth(key) : formatShortDay(bucket.first),
  ));
  // Dates past what is held yet — the minutes before a new website's two years are filled (ga-stored-figures-plan.md SF9).
  const collecting = days?.live === true;
  return (
    <SearchConsoleChartCard
      title={t(`title.${step}`)}
      hint={`${t("hint", { period: tf(`periods.${period}`) })}${coarse ? ` ${tc(`coarse.${step}`)}` : ""}${collecting ? ` ${t("collecting")}` : ""}`}
      exportName="google-analytics-ai-assistants"
      csv={() => toCsv(["day", ...series.map((entry) => entry.name)], data.map((row) => [String(row.day), ...series.map((entry) => (row as Record<string, unknown>)[entry.key] as number)]))}
      host={status?.host ?? ""}
      from={days?.from ?? null}
      to={days?.to ?? null}
      step={step}
    >
      {data.length > 0 && series.length > 0
        ? <SiteBarChart stacked data={data} series={series} updateKey={false} />
        : <p className="py-10 text-center text-[12px] text-muted">{collecting ? t("collecting") : t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/** Google's channels an assistant's visits are filed under, its own AI Assistant channel first, in fixed colours. */
const FILED_COLOURS: Record<string, string> = {
  [GOOGLE_AI_CHANNEL]: CHART_SERIES_ORANGE,
  Referral: CHART_SERIES_BLUE,
  Unassigned: CHART_SERIES_VIOLET,
};
const OTHER_FILED = [CHART_SERIES_AMBER, CHART_SERIES_TEAL, CHART_SERIES_SLATE];

/**
 * FiledBars, "Each assistant's visits, by how Google Analytics filed them"
 * (CH8, CH11): a bar an assistant, its visits stacked by the channel Google
 * filed them under, each figure on hover. The app's stacked bars along
 * (`SiteBarChart`), not a part of its own.
 */
export function AssistantFiledBars({ top }: { top: ChannelTop | undefined }) {
  const t = useTranslations("googleAnalytics.channelPage.filedBars");
  const status = useAnalyticsStatus();
  const assistants = (top?.assistants ?? []).filter((assistant) => assistant.visits > 0);
  if (top && assistants.length === 0) return null;
  const channels = [...new Set(assistants.flatMap((assistant) => assistant.filed.map((filed) => filed.channel)))]
    .sort((left, right) => Number(right === GOOGLE_AI_CHANNEL) - Number(left === GOOGLE_AI_CHANNEL) || Number(right in FILED_COLOURS) - Number(left in FILED_COLOURS) || left.localeCompare(right));
  let other = 0;
  const series: SiteSeries[] = channels.map((channel, index) => ({
    key: `filed${index}`,
    name: t("filedAs", { channel }),
    colour: FILED_COLOURS[channel] ?? OTHER_FILED[other++ % OTHER_FILED.length],
  }));
  const data = assistants.map((assistant) => ({
    label: assistant.name,
    assistant,
    ...Object.fromEntries(channels.map((channel, index) => [`filed${index}`, assistant.filed.find((filed) => filed.channel === channel)?.visits ?? 0])),
  }));
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={t("hint")}
      exportName="google-analytics-ai-assistants-filed"
      csv={() => toCsv(["assistant", ...channels], assistants.map((assistant) => [assistant.name, ...channels.map((channel) => assistant.filed.find((filed) => filed.channel === channel)?.visits ?? 0)]))}
      host={status?.host ?? ""}
      from={top?.from ?? null}
      to={top?.to ?? null}
    >
      <SiteBarChart
        horizontal
        stacked
        data={data}
        xKey="label"
        series={series}
        updateKey={false}
        formatValue={(value, entry) => {
          const assistant = entry.payload?.assistant as ChannelTop["assistants"][number] | undefined;
          return t("readout", { visits: formatNumber(value), total: assistant?.visits ?? 0, conversions: assistant?.conversions ?? 0 });
        }}
      />
    </SearchConsoleChartCard>
  );
}
