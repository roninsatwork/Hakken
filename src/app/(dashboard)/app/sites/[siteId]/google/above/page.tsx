"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowUpWideNarrow } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch, useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const POSITIONS = ["top3", "pageOne", "notOnPage"] as const;
type PositionFilter = (typeof POSITIONS)[number];

/** Results above the site shown in a row before "+N more". */
const SHOWN_ABOVE = 4;

/** Searches drawn on the chart: the ones with most above the site. */
const CHARTED = 12;

function matchesPosition(position: number | null, filter: PositionFilter | ""): boolean {
  if (!filter) return true;
  if (filter === "notOnPage") return position === null;
  if (filter === "top3") return position !== null && position <= 3;
  return position !== null && position > 3;
}

/**
 * Who ranks above you: for each search the site is measured on, the websites
 * Google puts above it on the newest check, competitors marked, or the whole
 * of page one when the site is not on it. The site's own list, capped on its
 * record, so it arrives whole and the search box narrows it in place.
 */
export default function SiteAbovePage() {
  const t = useTranslations("sites.googleAbove");
  const siteId = useSiteId();
  const site = useSite();
  const rows = useQuery(api.siteGoogleSerp.listAbove, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [position, setPosition] = useSiteParam<PositionFilter | "">("where", "", POSITIONS);
  const [page, setPage] = useSiteTablePage();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const lower = term.toLowerCase();
  const matching = rows?.filter((row) =>
    (!lower || row.keyword.includes(lower) || row.above.some((result) => result.domain.includes(lower)))
    && matchesPosition(row.position, position));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  const charted = [...(rows ?? [])].filter((row) => row.day !== null)
    .sort((left, right) => right.above.length - left.above.length)
    .slice(0, CHARTED);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ArrowUpWideNarrow className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description", { place: site?.placeLabel ?? "" })}
      />

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-above-you`}
        csv={() => toCsv([t("columns.search"), t("columns.above"), t("columns.rivals")], charted.map((row) => [row.keyword, row.above.length, row.rivalsAbove]))}
        enoughData={charted.length > 0}
      >
        <SiteBarChart
          horizontal
          height={Math.max(160, charted.length * 30)}
          data={charted.map((row) => ({ label: row.keyword, above: row.above.length, rivals: row.rivalsAbove }))}
          series={[
            { key: "above", name: t("columns.above"), colour: SITE_SERIES_COLOURS[1] },
            { key: "rivals", name: t("columns.rivals"), colour: SITE_SERIES_COLOURS[3] },
          ]}
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
            <Select aria-label={t("positionFilter")} value={position} onChange={(value) => setPosition(value as PositionFilter | "")}>
            <option value="">{t("anyPosition")}</option>
            {POSITIONS.map((entry) => <option key={entry} value={entry}>{t(`positions.${entry}`)}</option>)}
          </Select>
            <ListDownload fileName={`${site?.host ?? "site"}-above-you`} rows={matching} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.position"), value: (row) => row.position }, { header: t("columns.above"), value: (row) => row.above.map((result) => `${result.position}. ${result.domain}`).join("; ") }, { header: t("columns.rivals"), value: (row) => row.rivalsAbove }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />
          </>
        }
        empty={{ icon: <ArrowUpWideNarrow className="h-8 w-8 text-muted/30" />, label: term || position ? t("noMatch") : t("empty") }}
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
          {
            key: "position",
            header: t("columns.position"),
            align: "right",
            cell: (row) => (row.day === null ? <span className="text-[12px] text-muted">{t("notChecked")}</span> : <PositionCell position={row.position} />),
          },
          {
            key: "above",
            header: t("columns.above"),
            cell: (row) => {
              if (row.day === null) return <span className="text-muted">–</span>;
              if (row.above.length === 0) return <span className="text-[12px] text-success">{t("nobodyAbove")}</span>;
              return (
                <ol className="flex flex-col gap-0.5">
                  {row.above.slice(0, SHOWN_ABOVE).map((result) => (
                    <li key={`${result.position}-${result.domain}`} className="flex items-center gap-2 text-[12px]">
                      <span className="w-6 text-right font-mono text-muted">{result.position}</span>
                      <span className={result.isRival ? "text-foreground" : "text-secondary"}>{result.domain}</span>
                      {result.isRival ? <StatusPill tone="warning">{t("rival")}</StatusPill> : null}
                    </li>
                  ))}
                  {row.above.length > SHOWN_ABOVE ? (
                    <li className="pl-8 text-[12px] text-muted" title={row.above.slice(SHOWN_ABOVE).map((result) => `${result.position}. ${result.domain}`).join("\n")}>
                      {t("more", { count: row.above.length - SHOWN_ABOVE })}
                    </li>
                  ) : null}
                </ol>
              );
            },
          },
          { key: "rivals", header: t("columns.rivals"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.day === null ? "–" : row.rivalsAbove}</span> },
        ]}
      />
    </div>
  );
}
