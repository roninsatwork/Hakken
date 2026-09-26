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
import { PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

const POSITIONS = ["top3", "pageOne", "notOnPage"] as const;

type Above = { keyword: string; isActive: boolean; position: number | null; above: readonly unknown[]; rivalsAbove: number; day: string | null };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * search A to Z, your position from the top — the order it opens on — and the
 * most websites and most competitors above you first. A search not checked
 * yet has none of these, so goes last; paused searches stay after the ones
 * being checked in every order, as they always have.
 */
const SORTS: SiteSortColumns<Above, "search" | "position" | "above" | "rivals"> = {
  search: { value: (row) => row.keyword, first: "asc" },
  position: { value: (row) => row.position, first: "asc" },
  above: { value: (row) => (row.day === null ? null : row.above.length), first: "desc" },
  rivals: { value: (row) => (row.day === null ? null : row.rivalsAbove), first: "desc" },
};
const keywordOf = (row: Above) => row.keyword;
const pausedLast = (row: Above) => (row.isActive ? 0 : 1);
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
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) =>
    (!matches || matches(row.keyword, ...row.above.map((result) => result.domain)))
    && matchesPosition(row.position, position));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "position", name: keywordOf, group: pausedLast });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });

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
        rows={pager.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("positionFilter"), choice: position ? t(`positions.${position}`) : null }} value={position} onChange={(value) => setPosition(value as PositionFilter | "")}>
            <option value="">{t("anyPosition")}</option>
            {POSITIONS.map((entry) => <option key={entry} value={entry}>{t(`positions.${entry}`)}</option>)}
          </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={pager.footer} noun="searches" actions={<ListDownload fileName={`${site?.host ?? "site"}-above-you`} rows={sorted} columns={[{ header: t("columns.search"), value: (row) => row.keyword }, { header: t("columns.position"), value: (row) => row.position }, { header: t("columns.above"), value: (row) => row.above.map((result) => `${result.position}. ${result.domain}`).join("; ") }, { header: t("columns.rivals"), value: (row) => row.rivalsAbove }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <ArrowUpWideNarrow className="h-8 w-8 text-muted/30" />, label: term || position ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "search", header: t("columns.search"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          {
            key: "position",
            header: t("columns.position"),
            align: "right",
            sortable: true,
            cell: (row) => (row.day === null ? <span className="text-[12px] text-muted">{t("notChecked")}</span> : <PositionCell position={row.position} />),
          },
          {
            key: "above",
            header: t("columns.above"),
            // By how many websites are above.
            sortable: true,
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
          { key: "rivals", header: t("columns.rivals"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.day === null ? "–" : row.rivalsAbove}</span> },
        ]}
      />
    </div>
  );
}
