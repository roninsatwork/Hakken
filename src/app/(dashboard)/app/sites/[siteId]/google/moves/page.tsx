"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowUpDown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Change } from "@/src/ui/components/screens/Change";
import { CUT_COLUMN, CheckedCell, PageLinkCell, PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { datedRow } from "../../../_components/datedRows";
import { toCsv } from "../../../_components/siteFormat";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";
import { SiteViewSwitch } from "../../../_components/SiteViewSwitch";
import { HeldLine, isPartHeld } from "../../../_components/SiteCoverage";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

/**
 * The fourth move is lost from a list that held everything the site ranks
 * for, and left the list from one held in part — never lost, for such a
 * search may still rank below its limit (sites-data-completeness-plan.md, §4.C).
 */
type Direction = "UP" | "DOWN" | "NEW" | "LOST" | "LEFT";
const WHOLE_DIRECTIONS: Direction[] = ["UP", "DOWN", "NEW", "LOST"];
const HELD_DIRECTIONS: Direction[] = ["UP", "DOWN", "NEW", "LEFT"];
const ALL_DIRECTIONS: Direction[] = ["UP", "DOWN", "NEW", "LOST", "LEFT"];

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
  const partHeld = isPartHeld(site?.coverage);
  const [chosenDirection, setDirection] = useSiteParam<Direction>("direction", "UP", ALL_DIRECTIONS);
  const direction: Direction = chosenDirection === "LOST" && partHeld ? "LEFT" : chosenDirection === "LEFT" && !partHeld ? "LOST" : chosenDirection;
  const [search, setSearch, settled] = useSiteSearch();
  const order = useSiteSort(SORTS, direction === "UP" || direction === "DOWN" ? "change" : "keyword");
  // A site checked once has nothing to compare with: every search it ranks
  // for is "new" only because no check came before, so none is listed as a
  // move (docs/plans/active/sites-audit-fixes-plan.md, 1.3).
  const firstCheckOnly = site?.checkDays.length === 1;
  const table = useSiteListPage(api.siteKeywords.listMoves, firstCheckOnly ? "skip" : {
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
      <SiteSees screen="googleMoves" seen={table.result?.seen} />
      {partHeld ? (
        <div className="flex flex-col gap-1">
          <HeldLine coverage={site?.coverage} />
          <p className="text-[12px] leading-relaxed text-secondary">{t("amongHeld")}</p>
        </div>
      ) : null}

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-wins-and-losses-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", t("up"), t("down")], points.map((point) => [point.day, point.rankedUp, point.rankedDown]))}
        enoughData={points.length > 0}
      >
        <SiteBarChart
          data={points.map((point) => datedRow(point, { up: point.rankedUp, down: point.rankedDown }))}
          series={[
            { key: "up", name: t("up"), colour: SITE_SERIES_COLOURS[1] },
            { key: "down", name: t("down"), colour: SITE_SERIES_COLOURS[0] },
          ]}
        />
      </SiteChartCard>

      {firstCheckOnly ? (
        <HakkenEmptyState icon={ArrowUpDown} title={t("firstCheckTitle")} description={t("firstCheckBody")} />
      ) : (
      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <SiteViewSwitch
              label={t("title")}
              options={(partHeld ? HELD_DIRECTIONS : WHOLE_DIRECTIONS).map((entry) => ({ value: entry, label: t(`tabs.${entry}`) }))}
              value={direction}
              onChange={setDirection}
            />
          </>
        }
        cardHeader={<TableBar footer={table.footer} noun="searches" actions={<TableDownload siteId={siteId} kind="keywords" />} />}
        empty={{ icon: <ArrowUpDown className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          { key: "keyword", header: t("columns.keyword"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
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
          { key: "change", header: t("columns.change"), align: "right", sortable: true, cell: (row) => <Change by={row.change} /> },
          {
            key: "page",
            header: t("columns.page"),
            className: CUT_COLUMN.second,
            cell: (row) => (row.page ? <PageLinkCell href={recordHref({ kind: "page", page: row.page })} page={row.page} was={row.previousPage} /> : <NoFigure />),
          },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
      )}
    </div>
  );
}
