"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowUpDown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { ChangeCell, CheckedCell, PageLinkCell, PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";
import { SiteViewSwitch } from "../../../_components/SiteViewSwitch";

type Direction = "UP" | "DOWN" | "NEW" | "LOST";
const DIRECTIONS: Direction[] = ["UP", "DOWN", "NEW", "LOST"];

/**
 * The columns that sort, over every move (docs/plans/active/
 * sites-table-sorting-plan.md): the keyword A to Z, where it stands now from
 * the top, and the size of the move, biggest first. Last checked is the same
 * day on every row, and does not.
 */
const SORTS = { keyword: "asc", fromTo: "asc", change: "desc" } as const;

/**
 * Wins and losses: keywords by how they moved at their last check — wins and
 * losses the biggest move first, new and lost searches A to Z — or, searched,
 * the matches within the move chosen. The chart counts wins against losses in
 * each step of the dates chosen.
 */
export default function SiteMovesPage() {
  const t = useTranslations("sites.googleMoves");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const [direction, setDirection] = useSiteParam<Direction>("direction", "UP", DIRECTIONS);
  const [search, setSearch, settled] = useSiteSearch();
  const order = useSiteSort(SORTS, direction === "UP" || direction === "DOWN" ? "change" : "keyword");
  const table = useSiteListPage(api.siteKeywords.listMoves, {
    siteId,
    status: direction,
    ...(settled ? { search: settled } : {}),
    sort: order.key,
    direction: order.direction,
  }, [{ siteId, list: "keywords" }]);
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
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <SiteViewSwitch
              label={t("title")}
              options={DIRECTIONS.map((entry) => ({ value: entry, label: t(`tabs.${entry}`) }))}
              value={direction}
              onChange={setDirection}
            />
          </>
        }
        cardHeader={<SiteTableBar footer={table.footer} noun="searches" actions={<TableDownload siteId={siteId} kind="keywords" />} />}
        empty={{ icon: <ArrowUpDown className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          { key: "keyword", header: t("columns.keyword"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          {
            key: "fromTo",
            header: t("columns.fromTo"),
            align: "right",
            sortable: true,
            cell: (row) => (
              <span className="flex items-center justify-end gap-1.5 font-mono text-[12px]">
                <span className="text-secondary">{row.previousPosition ?? "–"}</span>
                <span className="text-muted">→</span>
                <PositionCell position={row.position} />
              </span>
            ),
          },
          { key: "change", header: t("columns.change"), align: "right", sortable: true, cell: (row) => <ChangeCell change={row.change} /> },
          {
            key: "page",
            header: t("columns.page"),
            cell: (row) => (row.page ? <PageLinkCell href={recordHref({ kind: "page", page: row.page })} page={row.page} was={row.previousPage} /> : <span className="text-muted">–</span>),
          },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
