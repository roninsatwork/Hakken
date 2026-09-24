"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { ChangeCell, CheckedCell, PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch, useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const VERDICTS = ["TOP_THREE", "PAGE_ONE", "SLIPPING", "RANKING", "TOO_NEW", "NOT_FOUND", "NEVER_RANKED", "NOT_CHECKED"] as const;
type Verdict = (typeof VERDICTS)[number];
const VERDICT_TONES: Record<Verdict, StatusTone> = {
  TOP_THREE: "success",
  PAGE_ONE: "success",
  SLIPPING: "warning",
  RANKING: "neutral",
  TOO_NEW: "neutral",
  NOT_FOUND: "warning",
  NEVER_RANKED: "neutral",
  NOT_CHECKED: "neutral",
};

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
  const [verdict, setVerdict] = useSiteParam<Verdict | "">("verdict", "", VERDICTS);
  const [page, setPage] = useSiteTablePage();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const rows = useQuery(api.siteGoogle.listSearches, { siteId });
  const charted = (rows ?? []).filter((row) => row.lastPosition !== null).slice(0, 5).map((row) => row.keyword);
  const positions = useQuery(
    api.siteGoogle.searchPositions,
    charted.length > 0 ? { siteId, keywords: charted, from: range.from, to: range.to } : "skip",
  );

  const term = settled.toLowerCase();
  const matching = rows?.filter((row) => (!term || row.keyword.includes(term)) && (!verdict || row.verdict === verdict));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  const days = [...new Set((positions ?? []).flatMap((line) => line.points.map((point) => point.day)))].sort();
  const chartRows = days.map((day) => ({
    label: formatShortDay(day),
    ...Object.fromEntries((positions ?? []).map((line) => [line.keyword, line.points.find((point) => point.day === day)?.position ?? null])),
  }));

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
        rows={shown}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("verdictFilter")} value={verdict} onChange={(value) => setVerdict(value as Verdict | "")}>
            <option value="">{t("anyVerdict")}</option>
            {VERDICTS.map((entry) => <option key={entry} value={entry}>{t(`verdicts.${entry}`)}</option>)}
          </Select>
            <ListDownload fileName={`${site?.host ?? "site"}-searches`} rows={matching} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.position"), value: (row) => row.lastPosition }, { header: t("columns.best"), value: (row) => row.bestPosition }, { header: t("columns.verdict"), value: (row) => t(`verdicts.${row.verdict}`) }, { header: t("columns.lastChecked"), value: (row) => row.lastCheckedDay }]} />
          </>
        }
        empty={{ icon: <Search className="h-8 w-8 text-muted/30" />, label: term || verdict ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: matching?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: rows === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "search", header: t("columns.search"), cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "position", header: t("columns.position"), align: "right", cell: (row) => (row.lastCheckedDay === null ? <span className="text-[12px] text-muted">{t("verdicts.NOT_CHECKED")}</span> : <PositionCell position={row.lastPosition} />) },
          {
            key: "change",
            header: t("columns.change"),
            align: "right",
            cell: (row) => row.lastPosition !== null && row.previousPosition !== null
              ? <ChangeCell change={row.previousPosition - row.lastPosition} />
              : <span className="text-muted">–</span>,
          },
          { key: "best", header: t("columns.best"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.bestPosition ?? "–"}</span> },
          {
            key: "verdict",
            header: t("columns.verdict"),
            cell: (row) => row.isActive
              ? <StatusPill tone={VERDICT_TONES[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusPill>
              : <StatusPill tone="neutral">{t("paused")}</StatusPill>,
          },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.lastCheckedDay} /> },
        ]}
      />
    </div>
  );
}
