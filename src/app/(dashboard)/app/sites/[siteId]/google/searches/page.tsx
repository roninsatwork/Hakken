"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { Change } from "@/src/ui/components/screens/Change";
import { CUT_COLUMN, CheckedCell, PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { datedRow } from "../../../_components/datedRows";
import { toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { SEARCH_VERDICTS, SEARCH_VERDICT_TONES, STANDING_SORTS, type SearchVerdict } from "../../../_components/searchStanding";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

type Tracked = { keyword: string; isActive: boolean; lastPosition: number | null; previousPosition: number | null; bestPosition: number | null; lastCheckedDay: string | null };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * search A to Z, and the standing's own (`STANDING_SORTS`) — the position, the
 * order it opens on, among them. Paused searches stay after the ones being
 * checked in every order, as they always have.
 */
const SORTS: SiteSortColumns<Tracked, "search" | "position" | "change" | "best" | "checked"> = {
  search: { value: (row) => row.keyword, first: "asc" },
  ...STANDING_SORTS,
};
const keywordOf = (row: Tracked) => row.keyword;
const pausedLast = (row: Tracked) => (row.isActive ? 0 : 1);

/**
 * Your searches: where the site ranks on each search it is measured on, with
 * how that is going, and the best-placed five drawn day by day. The searches
 * are the site's own chosen list — a few dozen, capped on its record — so the
 * list arrives whole and the search box narrows it in place.
 */
export default function SiteSearchesPage() {
  const t = useTranslations("sites.googleSearches");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const [search, setSearch, settled] = useSiteSearch();
  const [verdict, setVerdict] = useSiteParam<SearchVerdict | "">("verdict", "", SEARCH_VERDICTS);
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const rows = useQuery(api.siteGoogle.listSearches, { siteId });
  const charted = (rows ?? []).filter((row) => row.lastPosition !== null).slice(0, 5).map((row) => row.keyword);
  const positions = useQuery(
    api.siteGoogle.searchPositions,
    charted.length > 0 ? { siteId, keywords: charted, from: range.from, to: range.to, step: range.step } : "skip",
  );

  const term = settled.toLowerCase();
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) => (!matches || matches(row.keyword)) && (!verdict || row.verdict === verdict));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "position", name: keywordOf, group: pausedLast });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });

  const days = [...new Set((positions ?? []).flatMap((line) => line.points.map((point) => point.day)))].sort();
  // Each day, week or month of the step, dated to the newest check inside it.
  const lastDayOf = (day: string) => (positions ?? []).flatMap((line) => line.points.filter((point) => point.day === day).map((point) => point.lastDay)).sort().at(-1);
  const chartRows = days.map((day) => datedRow(
    { day, lastDay: lastDayOf(day) },
    Object.fromEntries((positions ?? []).map((line) => [line.keyword, line.points.find((point) => point.day === day)?.position ?? null])),
  ));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Search className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description", { place: site?.placeLabel ?? "" })}
      />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-search-positions-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...(positions ?? []).map((line) => line.keyword)], days.map((day) => [day, ...(positions ?? []).map((line) => line.points.find((point) => point.day === day)?.position ?? null)]))}
        enoughData={days.length > 0}
      >
        <SiteLineChart
          reversed
          sharedScale
          data={chartRows}
          series={(positions ?? []).map((line, index) => ({ key: line.keyword, name: line.keyword, colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("verdictFilter"), choice: verdict ? t(`verdicts.${verdict}`) : null }} value={verdict} onChange={(value) => setVerdict(value as SearchVerdict | "")}>
            <option value="">{t("anyVerdict")}</option>
            {SEARCH_VERDICTS.map((entry) => <option key={entry} value={entry}>{t(`verdicts.${entry}`)}</option>)}
          </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="searches" actions={<ListDownload fileName={`${site?.host ?? "site"}-searches`} rows={sorted} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.position"), value: (row) => row.lastPosition }, { header: t("columns.best"), value: (row) => row.bestPosition }, { header: t("columns.verdict"), value: (row) => t(`verdicts.${row.verdict}`) }, { header: t("columns.lastChecked"), value: (row) => row.lastCheckedDay }]} />} />}
        empty={{ icon: <Search className="h-8 w-8 text-muted/30" />, label: term || verdict ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "search", header: t("columns.search"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => (row.lastCheckedDay === null ? <span className="whitespace-nowrap text-[12px] text-muted">{t("verdicts.NOT_CHECKED")}</span> : <PositionCell position={row.lastPosition} />) },
          {
            key: "change",
            header: t("columns.change"),
            align: "right",
            sortable: true,
            cell: (row) => row.lastPosition !== null && row.previousPosition !== null
              ? <Change by={row.previousPosition - row.lastPosition} />
              : <NoFigure />,
          },
          { key: "best", header: t("columns.best"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.bestPosition ?? "–"}</span> },
          {
            key: "verdict",
            header: t("columns.verdict"),
            cell: (row) => row.isActive
              ? <StatusLabel tone={SEARCH_VERDICT_TONES[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusLabel>
              : <StatusLabel tone="neutral">{t("paused")}</StatusLabel>,
          },
          { key: "checked", header: t("columns.lastChecked"), sortable: true, cell: (row) => <CheckedCell day={row.lastCheckedDay} /> },
        ]}
      />
    </div>
  );
}
