"use client";

import { useQuery } from "convex/react";
import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../sites/_components/SiteCharts";
import { SiteFigure } from "../../../sites/_components/SiteFigure";
import { datedRow } from "../../../sites/_components/datedRows";
import { formatNumber, formatShortDay, toCsv } from "../../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../_components/SearchConsoleChartCard";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { CountChange, PlacesMoved, figureColumns, useSearchConsoleList, type ChipId } from "../../_components/SearchConsoleTables";

const CHIPS: readonly ChipId[] = ["band", "intent", "country", "device"];

/**
 * Position bands (search-console-plan.md §13.3, drawn as "5 · Position
 * bands"): how many of the website's keywords Google shows in each band of
 * its own average positions — the top three, 4 to 10, 11 to 20, and 21 and
 * below — against the days before, week by week, and each keyword's band and
 * the places it moved.
 */
export default function SearchConsoleBandsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const weeks = useQuery(api.searchConsolePeriods.searchConsoleWeeks, list.status?.connection?.newestDay ? { siteId: list.siteId, searchType: list.kind } : "skip");
  const summary = list.summary;
  const days = list.range.days;
  const host = list.status?.host ?? "";
  const below = (counts: Record<string, number> | null | undefined) => (counts ? counts["21-50"] + counts["51+"] : null);
  const boxes = [
    { label: t("bands.top3"), now: summary?.bands["1-3"] ?? null, before: summary?.bandsBefore?.["1-3"] ?? null, better: true },
    { label: t("filters.bands.4-10"), now: summary?.bands["4-10"] ?? null, before: summary?.bandsBefore?.["4-10"] ?? null, better: true },
    { label: t("filters.bands.11-20"), now: summary?.bands["11-20"] ?? null, before: summary?.bandsBefore?.["11-20"] ?? null, better: true },
    { label: t("bands.below"), now: below(summary?.bands), before: below(summary?.bandsBefore), better: false },
  ];
  const series = [
    { key: "top3", name: t("bands.top3"), colour: SITE_SERIES_COLOURS[3] },
    { key: "top10", name: t("filters.bands.4-10"), colour: SITE_SERIES_COLOURS[0] },
    { key: "top20", name: t("filters.bands.11-20"), colour: SITE_SERIES_COLOURS[2] },
    { key: "rest", name: t("bands.below"), colour: SITE_SERIES_COLOURS[5] },
  ];
  return (
    <SearchConsoleListScreen
      icon={<BarChart3 className="h-5 w-5 text-brand" />}
      title={t("bands.title")}
      description={t("bands.description")}
      heroes={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {boxes.map((box) => (
            <SiteFigure
              key={box.label}
              label={box.label}
              value={box.now === null ? "…" : formatNumber(box.now)}
              detail={<CountChange now={box.now} before={box.before} days={days} neutral={!box.better} />}
            />
          ))}
        </div>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        emptyIcon: <BarChart3 className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("table.position"), field: "position" },
          { header: t("table.change"), field: "positionChange" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.impressions"), field: "impressions" },
        ],
        columns: [
          {
            key: "key",
            header: t("table.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
          },
          { key: "band", header: t("table.band"), cell: (row) => <span className="text-[12px] text-secondary">{row.impressions > 0 ? t(`filters.bands.${row.band}`) : "–"}</span> },
          ...figureColumns(t, ["position"]),
          { key: "positionChange", header: t("table.change"), align: "right", sortable: true, cell: (row) => <PlacesMoved change={row.positionChange} /> },
          ...figureColumns(t, ["clicks", "impressions"]),
        ],
      }}
    >
      <SearchConsoleChartCard
        title={t("bands.chartTitle")}
        hint={t("bands.chartHint")}
        exportName={`${host}-search-console-position-bands`}
        host={host}
        from={weeks?.[0]?.week ?? null}
        to={list.status?.connection?.newestDay ?? null}
        csv={() => toCsv(
          [t("chart.week"), t("bands.top3"), t("filters.bands.4-10"), t("filters.bands.11-20"), t("bands.below")],
          (weeks ?? []).map((week) => [week.week, week.top3, week.top10, week.top20, week.rest]),
        )}
      >
        {weeks === undefined ? (
          <div className="h-[280px] animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />
        ) : weeks.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-secondary">{t("chart.nothing")}</p>
        ) : (
          <SiteBarChart
            stacked
            height={280}
            series={series}
            data={weeks.map((week) => ({ ...datedRow({ day: week.week }, {}, formatShortDay(week.week)), top3: week.top3, top10: week.top10, top20: week.top20, rest: week.rest }))}
          />
        )}
      </SearchConsoleChartCard>
    </SearchConsoleListScreen>
  );
}
