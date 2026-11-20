"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Change } from "@/src/ui/components/screens/Change";

import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../sites/_components/SiteCharts";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { SearchConsoleChartCard, useSeriesTicks } from "../../_components/SearchConsoleChartCard";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { CountryNotReady } from "../../_components/SearchConsoleNotices";
import { formatPosition } from "../../_components/searchConsoleFormat";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { figureColumns, useSearchConsoleList, type ChipId, keywordColumn } from "../../_components/SearchConsoleTables";
import { useChartPeriods } from "../../_components/useChartPeriods";
import { usePerformanceDates } from "../../_components/PerformanceParts";
import { MoveLine } from "../../_components/PlacesParts";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { bandsSees } from "@/convex/utils/sees/searchConsoleScreens";
import { bandsSeesData, bandsSeesRows } from "@/convex/utils/sees/own/searchConsoleBands";

const CHIPS: readonly ChipId[] = ["band", "intent", "device"];

/**
 * Position bands, Way 3 (search-console-position-bands-way-3-plan-2026-11-19.md, drawn on the canvas of 19 November 2026):
 * how many of the website's keywords Google shows in each band of its own average positions against the dates before, the
 * bands week by week, and each keyword's band and the places it moved. In the country chosen, as every redone screen. Its
 * chart of each place on Google came off the same day on Anthony's word ("remove the chart"); `MirrorBars` stays shared.
 */
export default function SearchConsoleBandsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const chart = useChartPeriods(list);
  const { figures, periods, country } = chart;
  const { inBefore } = usePerformanceDates();
  const summary = list.summary;
  const host = list.status?.host ?? "";
  const below = (counts: Record<string, number> | null | undefined) => (counts ? counts["21-50"] + counts["51+"] : null);
  const boxes = [
    { label: t("bands.top3"), now: summary?.bands["1-3"] ?? null, before: summary?.bandsBefore?.["1-3"] ?? null, neutral: false },
    { label: t("filters.bands.4-10"), now: summary?.bands["4-10"] ?? null, before: summary?.bandsBefore?.["4-10"] ?? null, neutral: false },
    { label: t("filters.bands.11-20"), now: summary?.bands["11-20"] ?? null, before: summary?.bandsBefore?.["11-20"] ?? null, neutral: false },
    { label: t("bands.below"), now: below(summary?.bands), before: below(summary?.bandsBefore), neutral: true },
  ];
  // The top 3 in orange at the bottom, as drawn (today's had it a thin amber strip, and orange on 4 to 10).
  const series = [
    { key: "top3", name: t("bands.top3"), colour: SITE_SERIES_COLOURS[0] },
    { key: "top10", name: t("filters.bands.4-10"), colour: SITE_SERIES_COLOURS[1] },
    { key: "top20", name: t("filters.bands.11-20"), colour: SITE_SERIES_COLOURS[2] },
    { key: "rest", name: t("bands.below"), colour: CHART_SERIES_SLATE },
  ];
  // 21 and below is off at first: weeks older than the days kept hold only some of it (the plan's open question).
  const ticks = useSeriesTicks(series, ["rest"]);
  const restShown = ticks.shown.some((entry) => entry.key === "rest");
  // The eye's figures: the list's, with each band named as its boxes name it, and the chart's days, weeks or months.
  const bandNames = useMemo(() => ({
    "1-3": t("bands.top3"), "4-10": t("filters.bands.4-10"), "11-20": t("filters.bands.11-20"), "21-50": t("filters.bands.21-50"), "51+": t("filters.bands.51+"),
  }), [t]);
  // The chart's periods by their first day (`day`), so the eye keeps the newest of a long chart, never its oldest.
  // The list's own figures the page shows, and the table's own columns, so the writer's brief keeps its size (`bandsSeesData`).
  const seesData = useMemo(() => (list.pageData
    ? { ...list.pageData, summary: bandsSeesData(list.pageData.summary), rows: bandsSeesRows(list.pageData.rows), chart: periods ? periods.map((period) => ({ ...period, day: period.start })) : null, names: bandNames }
    : undefined), [list.pageData, periods, bandNames]);
  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="bands" seen={list.summary ? (list.range.period === "custom" ? null : bandsSees(list.summary, list.range.period)) : null} data={seesData} />}
      icon={<BarChart3 className="h-5 w-5 text-brand" />}
      title={t("bands.title")}
      description={t("bands.description")}
      heroes={
        <FigureRow>
          {boxes.map((box) => (
            <Figure
              key={box.label}
              label={box.label}
              value={box.now === null ? "…" : formatNumber(box.now)}
              detail={box.now === null ? null : <MoveLine now={box.now} before={box.before} against={inBefore} neutral={box.neutral} />}
            />
          ))}
        </FigureRow>
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
          keywordColumn(t("table.keyword"), recordHref),
          { key: "band", header: t("table.band"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.impressions > 0 ? t(`filters.bands.${row.band}`) : "–"}</span> },
          // The lean table (AGENTS.md "Tables are lean", 2026-11-17): one line a row, the rest on the row's own screen. The move in position is its own column.
          ...figureColumns(t, ["position"]),
          { key: "positionChange", header: t("table.change"), align: "right", sortable: true, cell: (row) => <Change by={row.positionChange} kind="places" same format={formatPosition} /> },
          ...figureColumns(t, ["clicks", "impressions"]),
        ],
      }}
    >
      {country && figures?.notReady ? <CountryNotReady country={country} /> : (
        <SearchConsoleChartCard
          title={t("bands.chartTitle", { step: chart.step })}
          hint={t("bands.chartHint", { step: chart.step })}
          controls={ticks.controls}
          exportName={`${host}-search-console-position-bands-${list.range.from}-to-${list.range.to}`}
          host={host}
          from={chart.from}
          to={chart.to}
          step={chart.step}
          csv={() => toCsv(
            [chart.periodHeader, t("bands.top3"), t("filters.bands.4-10"), t("filters.bands.11-20"), t("bands.below")],
            (periods ?? []).map((period) => [period.start, period.top3, period.top10, period.top20, period.rest]),
          )}
        >
          {periods === undefined ? (
            <div className="h-[280px] animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />
          ) : figures?.preparing || figures?.notBuilt ? (
            <p className="py-10 text-center text-[13px] text-secondary">{t(figures.preparing ? "chart.preparing" : "chart.notBuilt")}</p>
          ) : periods.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-secondary">{t("chart.nothing")}</p>
          ) : (
            <>
              <p className="mb-3 text-[12px] text-secondary">
                {chart.note ? <span>{chart.note} </span> : null}
                <span>{t(restShown ? "bands.restOn" : "bands.restOff")}</span>
              </p>
              <SiteBarChart
                stacked
                height={280}
                series={ticks.shown}
                data={chart.rows((period) => ({ top3: period.top3, top10: period.top10, top20: period.top20, rest: period.rest }))}
              />
            </>
          )}
        </SearchConsoleChartCard>
      )}
    </SearchConsoleListScreen>
  );
}
