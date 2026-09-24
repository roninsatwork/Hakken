"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowUpDown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { ChangeCell, CheckedCell, PageCell, PositionCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

type Direction = "UP" | "DOWN" | "NEW" | "LOST";
const DIRECTIONS: Direction[] = ["UP", "DOWN", "NEW", "LOST"];

/**
 * Wins and losses: keywords by how they moved at their last check, biggest
 * move first, straight from an index of each keyword's move — or, searched,
 * the closest matches within the move chosen. The chart counts
 * wins against losses in each step of the dates chosen.
 */
export default function SiteMovesPage() {
  const t = useTranslations("sites.googleMoves");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const [direction, setDirection] = useSiteParam<Direction>("direction", "UP", DIRECTIONS);
  const [search, setSearch, settled] = useSiteSearch();
  const table = useSitePagedTable(api.siteKeywords.listMoves, {
    siteId,
    status: direction,
    ...(settled ? { search: settled } : {}),
  });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const points = series?.[0]?.points ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<ArrowUpDown className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-wins-and-losses-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", t("up"), t("down")], points.map((point) => [point.day, point.rankedUp, point.rankedDown]))}
        enoughData={points.length > 0}
      >
        <SiteBarChart
          data={points.map((point) => ({ label: formatShortDay(point.day), up: point.rankedUp, down: point.rankedDown }))}
          series={[
            { key: "up", name: t("up"), colour: SITE_SERIES_COLOURS[1] },
            { key: "down", name: t("down"), colour: SITE_SERIES_COLOURS[0] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[860px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <div role="tablist" aria-label={t("title")} className="inline-flex overflow-hidden rounded-lg border border-border-dim">
              {DIRECTIONS.map((entry) => (
                <Button
                  key={entry}
                  variant="ghost"
                  role="tab"
                  aria-selected={direction === entry}
                  onClick={() => setDirection(entry)}
                  className={`rounded-none px-3 py-1.5 text-[12px] ${direction === entry ? "bg-brand/15 text-brand hover:bg-brand/15" : "text-secondary hover:text-foreground"}`}
                >
                  {t(`tabs.${entry}`)}
                </Button>
              ))}
            </div>
            <TableDownload siteId={siteId} kind="keywords" />
          </>
        }
        empty={{ icon: <ArrowUpDown className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: table.page,
          totalPages: table.totalPages,
          totalCount: table.loadedCount,
          pageSize: table.pageSize,
          isLoading: table.isBusy,
          onPageChange: table.goToPage,
        }}
        columns={[
          { key: "keyword", header: t("columns.keyword"), cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span> },
          {
            key: "fromTo",
            header: t("columns.fromTo"),
            align: "right",
            cell: (row) => (
              <span className="flex items-center justify-end gap-1.5 font-mono text-[12px]">
                <span className="text-secondary">{row.previousPosition ?? "–"}</span>
                <span className="text-muted">→</span>
                <PositionCell position={row.position} />
              </span>
            ),
          },
          { key: "change", header: t("columns.change"), align: "right", cell: (row) => <ChangeCell change={row.change} /> },
          { key: "page", header: t("columns.page"), cell: (row) => <PageCell page={row.page} was={row.previousPage} /> },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
