"use client";

import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { weekStart } from "@/convex/utils/searchConsolePacks";
import { NO_PAGE_ADDRESS as NOT_SET, NO_PAGE_KIND, OTHER_KIND } from "@/convex/utils/sees/analyticsChannel";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ChangeBars, type ChangeBar } from "@/src/ui/components/screens/ChangeBars";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { SiteBarChart, SiteLineChart, type SiteSeries } from "../../../../sites/_components/SiteCharts";
import { SiteViewSwitch } from "../../../../sites/_components/SiteViewSwitch";
import { datedRow } from "../../../../sites/_components/datedRows";
import { formatMonth, formatNumber, formatShortDay, toCsv } from "../../../../sites/_components/siteFormat";
import { useSiteParam } from "../../../../sites/_components/useSiteParam";
import { SearchConsoleChartCard } from "../../../../search-console/_components/SearchConsoleChartCard";
import { usePageKinds } from "../../../../_components/usePageKinds";
import { BeforeLine } from "../../../_components/AnalyticsFigures";
import { formatPercent, formatTime, pathOf } from "../../../_components/analyticsFormat";
import { coarserThanStep, perStep, shiftDays } from "../../../_components/stepScale";
import { useAnalyticsSiteId, useAnalyticsStatus, usePageHref, usePeriod, useStep, type Step } from "../../../_components/useAnalytics";

/**
 * A channel's own page, above its table (docs/plans/active/ga-channel-pages-plan.md
 * CH3–CH6): its four figures, the channel a day against the span before,
 * where it lands by page classification, and the pages behind the change.
 * Google Analytics' figures only, the same for every channel of any website
 * (CH1, CH2). Bars carry their figures on hover, never written on them (CH10).
 */

export type ChannelTop = FunctionReturnType<typeof api.googleAnalyticsChannelReads.analyticsChannelTop>;
export type ChannelDays = FunctionReturnType<typeof api.googleAnalyticsChannelReads.analyticsChannelDays>;
type Kind = ChannelTop["kinds"][number];

/**
 * A page group's words: a classification's own name, Hakken's page type
 * translated (`usePageKinds`), "No page recorded" for the visits Google put
 * to no page, and "Other" for the groups past Channels' map's columns.
 */
export function useKindName(kinds: ReadonlyArray<{ kind: string; name: string | null }> = []): (kind: string) => string {
  const t = useTranslations("googleAnalytics.channelPage.kinds");
  const pageKinds = usePageKinds(useAnalyticsSiteId());
  return (kind) => {
    const own = kinds.find((one) => one.kind === kind)?.name;
    if (own) return own;
    if (kind === NO_PAGE_KIND) return t("noPage");
    if (kind === OTHER_KIND) return t("other");
    return pageKinds.label(kind);
  };
}

/** "The 30 days before", as a legend or a series names it. */
export function useBeforeName(): string {
  const t = useTranslations("googleAnalytics.channelPage");
  const [period] = usePeriod();
  return t(`beforeName.${period}`);
}

/**
 * The four figures (CH3): visits; conversions beside the website's rate;
 * the conversions it started — by people it first brought, on any visit;
 * and dwell time beside the website's, with its engaged share. AI
 * assistants' fourth is the share Google filed elsewhere (CH8).
 */
export function ChannelFigures({ figures, assistants }: { figures: ChannelTop["figures"]; assistants: boolean }) {
  const t = useTranslations("googleAnalytics.channelPage.figures");
  if (!figures) return null;
  const quiet = (words: string) => <span className="text-[12px] text-secondary">{words}</span>;
  const rate = figures.visits > 0 ? figures.conversions / figures.visits : null;
  const siteRate = figures.siteVisits > 0 ? figures.siteConversions / figures.siteVisits : null;
  const dwell = figures.visits > 0 ? figures.seconds / figures.visits : null;
  const siteDwell = figures.siteVisits > 0 ? figures.siteSeconds / figures.siteVisits : null;
  return (
    <FigureRow>
      <Figure label={t("visits")} value={formatNumber(figures.visits)} detail={<BeforeLine now={figures.visits} before={figures.visitsBefore} />} />
      <Figure
        label={t("conversions")}
        value={formatNumber(figures.conversions)}
        detail={quiet(t("conversionsDetail", { rate: formatPercent(rate), siteRate: formatPercent(siteRate) }))}
      />
      <Figure
        label={t("started")}
        value={figures.started === null ? "–" : formatNumber(figures.started)}
        detail={quiet(figures.startedBefore === null ? t("startedFirst") : t("startedDetail", { before: formatNumber(figures.startedBefore) }))}
      />
      {assistants ? (
        <Figure
          label={t("elsewhere")}
          value={formatPercent(figures.visits > 0 ? figures.elsewhere / figures.visits : null)}
          detail={quiet(t("elsewhereDetail", { count: figures.elsewhere, visits: formatNumber(figures.visits) }))}
        />
      ) : (
        <Figure
          label={t("dwell")}
          value={formatTime(dwell)}
          detail={quiet(t("dwellDetail", { site: formatTime(siteDwell), engaged: formatPercent(figures.visits > 0 ? figures.engaged / figures.visits : null) }))}
        />
      )}
    </FigureRow>
  );
}

const MEASURES = ["visits", "dwell", "conversions"] as const;
type Measure = (typeof MEASURES)[number];

type Day = ChannelDays["now"][number];
type Bucket = { first: string; last: string; visits: number; seconds: number; conversions: number };

/**
 * Points added up into the step chosen, each dated by its first day — the
 * span before moved forward by `shift` days, so each of its buckets lies over
 * the one it is compared with. A week or month held whole past 90 days keeps
 * its last day (ga-stored-figures-plan.md SF2b).
 */
function bucketsOf(days: readonly Day[], step: Step, shift = 0): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const day of days) {
    const first = shiftDays(day.day, shift);
    const last = shiftDays(day.lastDay ?? day.day, shift);
    const key = step === "day" ? first : step === "week" ? weekStart(first) : first.slice(0, 7);
    const bucket = buckets.get(key) ?? { first, last, visits: 0, seconds: 0, conversions: 0 };
    if (first < bucket.first) bucket.first = first;
    if (last > bucket.last) bucket.last = last;
    bucket.visits += day.visits;
    bucket.seconds += day.seconds;
    bucket.conversions += day.conversions;
    buckets.set(key, bucket);
  }
  return buckets;
}

/** A bucket's measure as its step draws it: a week held whole on a daily chart as its daily average (SF2b). */
function measureOf(bucket: Bucket | undefined, measure: Measure, step: Step): number | null {
  if (!bucket) return null;
  if (measure === "dwell") return bucket.visits > 0 ? Math.round(bucket.seconds / bucket.visits) : null;
  return Math.round(perStep(measure === "visits" ? bucket.visits : bucket.conversions, bucket.first, bucket.last, step) * 10) / 10;
}

/**
 * "<Channel> a day, against the span before" (CH4): the channel's line, the
 * span before grey and dashed beside it day for day, a dot on each day with
 * a conversion, bigger for more. Visits, dwell time or conversions, as
 * switched; stepped by day, week or month as chosen at the top. Google's
 * update marks are named on hover only.
 */
export function ChannelDayChart({ channel, days }: { channel: string; days: ChannelDays | undefined }) {
  const t = useTranslations("googleAnalytics.channelPage.dayChart");
  const tc = useTranslations("googleAnalytics.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const [period] = usePeriod();
  const [measure, setMeasure] = useSiteParam<Measure>("measure", "visits", MEASURES);
  const beforeName = useBeforeName();
  const now = bucketsOf(days?.now ?? [], step);
  // The span before laid over these dates: where it is held by week, its points fall a week apart and the line joins them.
  const before = bucketsOf(days?.before ?? [], step, days?.shift ?? 0);
  const coarse = [...now.values(), ...before.values()].some((bucket) => coarserThanStep(bucket.first, bucket.last, step));
  const data = [...now.entries()].map(([key, bucket]) => datedRow(
    { day: step === "month" ? `${key}-01` : bucket.first, lastDay: bucket.last },
    { now: measureOf(bucket, measure, step), before: measureOf(before.get(key), measure, step), dot: bucket.conversions },
    step === "month" ? formatMonth(key) : formatShortDay(bucket.first),
  ));
  const series: SiteSeries[] = [
    { key: "now", name: channel, colour: CHART_SERIES_ORANGE, marks: "dot" },
    { key: "before", name: beforeName, colour: CHART_COMPARATOR_GREY, dashed: true },
  ];
  const time = measure === "dwell";
  // Dates past what is held yet — the minutes before a new website's two years are filled (ga-stored-figures-plan.md SF9).
  const collecting = days?.live || days?.liveBefore;
  return (
    <SearchConsoleChartCard
      title={t(`title.${step}`, { channel, before: tf(`before.${period}`) })}
      hint={`${t(`hint.${measure}`, { step })}${coarse ? ` ${tc(`coarse.${step}`)}` : ""}${collecting ? ` ${t("collecting")}` : ""}`}
      controls={<SiteViewSwitch label={t("measureLabel")} options={MEASURES.map((value) => ({ value, label: t(`measures.${value}`) }))} value={measure} onChange={setMeasure} />}
      exportName="google-analytics-channel-daily"
      csv={() => toCsv(["day", channel, beforeName], data.map((row) => [String(row.day), row.now as number | null, row.before as number | null]))}
      host={status?.host ?? ""}
      from={days?.from ?? null}
      to={days?.to ?? null}
      step={step}
    >
      {data.length > 0 ? (
        <SiteLineChart
          data={data}
          series={series}
          sharedScale
          updateKey={false}
          {...(data.some((row) => Number(row.dot) > 0) ? { markLabel: t(`dots.${step}`) } : {})}
          {...(time ? { formatScale: (value: number) => formatTime(value), formatValue: (value: number) => formatTime(value) } : {})}
        />
      ) : <p className="py-10 text-center text-[12px] text-muted">{collecting ? t("collecting") : t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/**
 * "Where <channel> lands, by page classification" (CH5): a bar a page
 * group, the span before grey beneath it, each one's visits and conversions
 * on hover. Every device's, as landing pages are kept.
 */
export function ChannelKindBars({ channel, top, assistants = false }: {
  channel: string;
  top: ChannelTop | undefined;
  /** AI assistants: only the visits Google filed as AI Assistant are kept by landing page, and the hint says so. */
  assistants?: boolean;
}) {
  const t = useTranslations("googleAnalytics.channelPage.kindBars");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  const kindName = useKindName(top?.kinds);
  const beforeName = useBeforeName();
  const kinds = top?.kinds ?? [];
  const data = kinds.map((kind) => ({ label: kindName(kind.kind), now: kind.visits, before: kind.visitsBefore, kind }));
  const nowName = tf(`periods.${period}`);
  const conversionsOf = (entry: { dataKey?: string | number; payload?: Record<string, unknown> }) => {
    const kind = entry.payload?.kind as Kind | undefined;
    return entry.dataKey === "before" ? kind?.conversionsBefore ?? 0 : kind?.conversions ?? 0;
  };
  return (
    <SearchConsoleChartCard
      title={t(assistants ? "titleAssistants" : "title", { channel })}
      hint={`${t(assistants ? (top?.everyAssistant ? "hintEveryAssistant" : "hintAssistants") : "hint", { before: tf(`before.${period}`) })}${top?.everyDevice ? ` ${t("everyDevice")}` : ""}`}
      exportName="google-analytics-channel-classifications"
      csv={() => toCsv(["classification", nowName, beforeName, `${nowName} · ${t("conversions")}`, `${beforeName} · ${t("conversions")}`], kinds.map((kind) => [kindName(kind.kind), kind.visits, kind.visitsBefore, kind.conversions, kind.conversionsBefore]))}
      host={status?.host ?? ""}
      from={top?.from ?? null}
      to={top?.to ?? null}
    >
      {data.length > 0 ? (
        <SiteBarChart
          horizontal
          data={data}
          xKey="label"
          updateKey={false}
          series={[{ key: "now", name: nowName, colour: CHART_SERIES_ORANGE }, { key: "before", name: beforeName, colour: CHART_COMPARATOR_GREY }]}
          formatValue={(value, entry) => t("readout", { visits: value, conversions: conversionsOf(entry) })}
        />
      ) : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/**
 * "The pages behind the change" (CH6): the landing pages that gained and
 * lost the most of the channel's visits, gains right in orange, losses left
 * in grey, each opening its page's own screen.
 */
export function ChannelMovers({ channel, top }: { channel: string; top: ChannelTop | undefined }) {
  const t = useTranslations("googleAnalytics.channelPage.movers");
  const tf = useTranslations("googleAnalytics.filters");
  const tk = useTranslations("googleAnalytics.channelPage.kinds");
  const status = useAnalyticsStatus();
  const pageHref = usePageHref();
  const [period] = usePeriod();
  const movers = top?.movers ?? [];
  if (top && movers.length === 0) return null;
  const nameOf = (address: string) => (address === NOT_SET ? tk("noPage") : pathOf(address));
  const rows: ChangeBar[] = movers.map((page) => ({
    key: page.key,
    label: nameOf(page.address),
    detail: `${formatNumber(page.visitsBefore)} → ${formatNumber(page.visits)}`,
    change: page.visits - page.visitsBefore,
    hover: t("hover", { page: nameOf(page.address), before: formatNumber(page.visitsBefore), visits: formatNumber(page.visits), period: tf(`periods.${period}`).toLowerCase(), was: tf(`before.${period}`) }),
    ...(page.key.startsWith("~") ? { href: pageHref(page.key) } : {}),
    ...(page.address === NOT_SET ? { muted: true } : {}),
  }));
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={t("hint", { channel, before: tf(`before.${period}`) })}
      exportName="google-analytics-channel-movers"
      csv={() => toCsv(["page", "before", "now"], movers.map((page) => [page.address, page.visitsBefore, page.visits]))}
      host={status?.host ?? ""}
      from={top?.from ?? null}
      to={top?.to ?? null}
    >
      <ChangeBars rows={rows} lostLabel={t("lost")} gainedLabel={t("gained")} />
    </SearchConsoleChartCard>
  );
}
