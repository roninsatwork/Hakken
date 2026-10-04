"use client";

import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Change } from "@/src/ui/components/screens/Change";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../sites/_components/SiteCharts";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { SearchConsoleChartCard, useSeriesTicks } from "../../_components/SearchConsoleChartCard";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { CountryNotReady } from "../../_components/SearchConsoleNotices";
import { formatPosition } from "../../_components/searchConsoleFormat";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { CountChange, figureColumns, useSearchConsoleList, type ChipId } from "../../_components/SearchConsoleTables";
import { useChartPeriods } from "../../_components/useChartPeriods";

const CHIPS: readonly ChipId[] = ["band", "intent", "device"];

/**
 * Position bands (search-console-plan.md §13.3, drawn as "5 · Position
 * bands"): how many of the website's keywords Google shows in each band of
 * its own average positions — the top three, 4 to 10, 11 to 20, and 21 and
 * below — against the days before, in the dates and step chosen, and each
 * keyword's band and the places it moved. In the country chosen
 * (search-console-plan.md §16): the days, weeks and months are added up
 * collection by collection, so a country the website does not keep ready has
 * no chart, and its list is asked of Google.
 */
export default function SearchConsoleBandsPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const chart = useChartPeriods(list);
  const { figures, periods, country } = chart;
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
  // A tick box for each band, as drawn.
  const ticks = useSeriesTicks(series);
  return (
    <SearchConsoleListScreen
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
              detail={<CountChange now={box.now} before={box.before} days={days} neutral={!box.better} />}
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
          {
            key: "key",
            header: t("table.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
          },
          { key: "band", header: t("table.band"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.impressions > 0 ? t(`filters.bands.${row.band}`) : "–"}</span> },
          ...figureColumns(t, ["position"]),
          { key: "positionChange", header: t("table.change"), align: "right", sortable: true, cell: (row) => <Change by={row.positionChange} kind="places" same format={formatPosition} /> },
          ...figureColumns(t, ["clicks", "impressions"]),
        ],
      }}
    >
      {country && figures?.notReady ? <CountryNotReady country={country} /> : (
        <SearchConsoleChartCard
          title={t("bands.chartTitle")}
          hint={t("bands.chartHint")}
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
              {chart.note ? <p className="mb-3 text-[12px] text-secondary">{chart.note}</p> : null}
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
