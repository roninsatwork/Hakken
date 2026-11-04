"use client";

import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ChannelMap, type ChannelMapRow } from "@/src/ui/components/screens/ChannelMap";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { SiteBarChart } from "../../../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../../../search-console/_components/SearchConsoleChartCard";
import { BeforeLine } from "../../../_components/AnalyticsFigures";
import { eventList } from "../../../_components/AnalyticsSees";
import { formatPercent, formatTime } from "../../../_components/analyticsFormat";
import { useEventName } from "../../../_components/useEventName";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod, periodWord } from "../../../_components/useAnalytics";

/**
 * Channels above its table (docs/plans/active/ga-channel-pages-plan.md CH9):
 * four figures, each channel by page classification (ChannelMap) and how
 * often a visit converts by channel over 12 months. Google Analytics' figures
 * only, never money.
 */

export type ChannelsTop = FunctionReturnType<typeof api.googleAnalyticsChannelReads.analyticsChannelsTop>;

/**
 * The four figures (CH9): visits and conversions against the span before,
 * the channel converting best over 12 months beside the website's rate,
 * and the key events not counted — or, with none, dwell time.
 */
export function ChannelsFigures({ figures }: { figures: ChannelsTop["figures"] | undefined }) {
  const t = useTranslations("googleAnalytics.channelsPage.figures");
  const nameOf = useEventName();
  const locale = useLocale();
  if (!figures) return null;
  const quiet = (words: string) => <span className="text-[12px] text-secondary">{words}</span>;
  const uncounted = figures.uncounted.reduce((sum, event) => sum + event.count, 0);
  return (
    <FigureRow>
      <Figure label={t("visits")} value={formatNumber(figures.visits)} detail={<BeforeLine now={figures.visits} before={figures.visitsBefore} />} />
      <Figure label={t("conversions")} value={formatNumber(figures.conversions)} detail={<BeforeLine now={figures.conversions} before={figures.conversionsBefore} />} />
      <Figure
        label={t("best")}
        value={figures.best ? figures.best.channel : "–"}
        detail={quiet(figures.best ? t("bestDetail", { rate: formatPercent(figures.best.rate), siteRate: formatPercent(figures.best.siteRate) }) : t("bestNone"))}
      />
      {uncounted > 0 ? (
        <Figure
          label={t("uncounted")}
          emphasis
          value={formatNumber(uncounted)}
          detail={quiet(t("uncountedDetail", { events: eventList(figures.uncounted.map((event) => event.eventName).join(","), nameOf, locale), count: figures.uncounted.length }))}
        />
      ) : (
        <Figure label={t("dwell")} value={formatTime(figures.visits > 0 ? figures.seconds / figures.visits : null)} detail={quiet(t("dwellDetail"))} />
      )}
    </FigureRow>
  );
}

/**
 * "Where each channel lands, by page classification" (CH9, ChannelMap):
 * channels down the side, page groups across, each square the channel's
 * visits that landed there, brighter for a bigger share of the channel, with
 * its conversions; each row opens its channel's page. Every device's, as
 * landing pages are kept.
 */
export function ChannelsMap({ top, kindName }: { top: ChannelsTop | undefined; kindName: (kind: string) => string }) {
  const t = useTranslations("googleAnalytics.channelsPage.map");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const hrefFor = useAnalyticsHref(useAnalyticsSiteId());
  const [period] = usePeriod();
  const kinds = top?.map.kinds ?? [];
  const columns = kinds.map((kind) => kindName(kind.kind));
  const rows: ChannelMapRow[] = (top?.map.rows ?? []).map((row) => ({
    key: row.channel,
    label: row.channel,
    total: t("visits", { count: row.visits }),
    href: hrefFor("channels/channel", { key: row.channel }),
    cells: row.cells.map((cell, index) => ({
      visits: cell.visits,
      conversions: cell.conversions,
      hover: t("hover", { channel: row.channel, kind: columns[index] ?? "", visits: cell.visits, conversions: cell.conversions }),
    })),
  }));
  const visitsOf = new Map((top?.map.rows ?? []).map((row) => [row.channel, row.visits]));
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={`${t("hint", { period: tf(`periods.${periodWord(period)}`) })}${top?.everyDevice ? ` ${t("everyDevice")}` : ""}`}
      exportName="google-analytics-channel-map"
      csv={() => toCsv(["channel", ...columns.flatMap((column) => [column, `${column} · ${t("conversionsColumn")}`])], (top?.map.rows ?? []).map((row) => [row.channel, ...row.cells.flatMap((cell) => [cell.visits, cell.conversions])]))}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {rows.length > 0 ? (
        <ChannelMap
          columns={columns}
          rows={rows}
          rowVisits={(row) => visitsOf.get(row.key) ?? 0}
          conversionsWord={(count) => t("conversions", { count })}
          legend={{ visits: t("legendVisits"), conversions: t("legendConversions"), shades: t("legendShades"), empty: t("legendEmpty") }}
        />
      ) : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}

/**
 * "How often a visit converts, by channel" (CH9): over the last 12 months, so
 * small channels have enough visits to judge — each bar conversions out of
 * visits, orange where it beats the website's rate, the visits on hover.
 * Never money (Anthony, 2026-11-03: "Take money off").
 */
export function ChannelsPerVisit({ top }: { top: ChannelsTop | undefined }) {
  const t = useTranslations("googleAnalytics.channelsPage.perVisit");
  const status = useAnalyticsStatus();
  const perVisit = top?.perVisit;
  const siteRate = perVisit?.siteRate ?? 0;
  const data = (perVisit?.rows ?? []).map((row) => ({ label: row.channel, rate: row.visits > 0 ? row.conversions / row.visits : 0, row }));
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={t("hint", { siteRate: formatPercent(siteRate), few: perVisit?.few ?? 0 })}
      exportName="google-analytics-channel-per-visit"
      csv={() => toCsv(["channel", "visits", "conversions", "rate"], (perVisit?.rows ?? []).map((row) => [row.channel, row.visits, row.conversions, row.visits > 0 ? row.conversions / row.visits : 0]))}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {data.length > 0 ? (
        <SiteBarChart
          horizontal
          data={data}
          xKey="label"
          updateKey={false}
          series={[{ key: "rate", name: t("rate"), colour: CHART_COMPARATOR_GREY }]}
          // Orange only where the rate beats the website's on enough visits to trust it (GA22).
          highlight={{ colour: CHART_SERIES_ORANGE, rows: (row) => Number(row.rate) > siteRate && !(row.row as { fewVisits: boolean }).fewVisits }}
          formatScale={(value) => formatPercent(value)}
          formatValue={(value, entry) => {
            const row = entry.payload?.row as ChannelsTop["perVisit"]["rows"][number] | undefined;
            return t(row?.fewVisits ? "readoutFew" : "readout", {
              rate: formatPercent(value),
              visits: formatNumber(row?.visits ?? 0),
            });
          }}
        />
      ) : <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}
