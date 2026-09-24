"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CheckedCell, PageCell, PageTypePill } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

const PAGE_TYPES = [
  "HOME", "SERVICE", "PRODUCT", "CATEGORY", "ARTICLE", "CASE_STUDY",
  "ABOUT", "CONTACT", "LOCATION", "CAREERS", "LEGAL", "OTHER", "UNJUDGED",
] as const;
type PageType = (typeof PAGE_TYPES)[number];

/** Dollars, whole: DataForSEO prices traffic as the adverts it would replace. */
function formatUsd(value: number | null): string {
  return value === null ? "–" : `$${formatNumber(value)}`;
}

/**
 * Top pages (Organic keywords › Top pages): the site's pages by how many
 * searches each ranks for, with which AI engines cite each — the column Ahrefs
 * keeps behind a paywall and we already collect. Paged and searched on the
 * server; the chart is the number of ranking pages over the dates chosen.
 */
export default function SitePagesPage() {
  const t = useTranslations("sites.pages");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const tt = useTranslations("sites.common.pageTypes");
  const tm = useTranslations("sites.measures");
  const engineLabel = useEngineLabel();
  const [search, setSearch, term] = useSiteSearch();
  const [section, setSection] = useSiteParam<string>("section", "");
  const [pageType, setPageType] = useSiteParam<PageType | "">("type", "", PAGE_TYPES);
  const [sort, setSort] = useSiteParam<"keywords" | "traffic">("sort", "keywords", ["keywords", "traffic"]);

  const sections = useQuery(api.siteKeywords.listSections, { siteId });
  const table = useSitePagedTable(api.siteKeywords.listPages, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(section ? { section } : {}),
    ...(pageType ? { pageType } : {}),
    sort,
  });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const points = (series?.[0]?.points ?? []).filter((point) => point.pages !== undefined || point.estimatedTraffic !== undefined);
  // The whole site's traffic at its newest check, for each page's share of it.
  const siteTraffic = [...points].reverse().find((point) => point.estimatedTraffic !== undefined)?.estimatedTraffic ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<FileText className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-ranking-pages-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", t("chartTitle"), tm("estimatedTraffic")], points.map((point) => [point.day, point.pages, point.estimatedTraffic]))}
        enoughData={points.length > 0}
      >
        <SiteLineChart
          data={points.map((point) => ({ label: formatShortDay(point.day), pages: point.pages ?? null, traffic: point.estimatedTraffic ?? null }))}
          series={[
            { key: "pages", name: t("chartTitle"), colour: SITE_SERIES_COLOURS[1] },
            { key: "traffic", name: tm("estimatedTraffic"), colour: SITE_SERIES_COLOURS[0] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[1400px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("sectionFilter")} value={section} onChange={setSection}>
              <option value="">{t("allSections")}</option>
              {(sections ?? []).map((entry) => <option key={entry.section} value={entry.section}>{entry.section}</option>)}
            </Select>
            <Select aria-label={t("typeFilter")} value={pageType} onChange={(value) => setPageType(value as PageType | "")}>
              <option value="">{t("anyType")}</option>
              {PAGE_TYPES.map((entry) => <option key={entry} value={entry}>{tt(entry)}</option>)}
            </Select>
            <Select aria-label={t("sortLabel")} value={sort} onChange={(value) => setSort(value as "keywords" | "traffic")}>
              <option value="keywords">{t("sortKeywords")}</option>
              <option value="traffic">{t("sortTraffic")}</option>
            </Select>
            <TableDownload siteId={siteId} kind="pages" />
          </>
        }
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: term || section || pageType ? t("noMatch") : t("empty") }}
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
          { key: "page", header: t("columns.page"), cell: (row) => <PageCell page={row.page} /> },
          { key: "type", header: t("columns.type"), cell: (row) => <PageTypePill type={row.pageType} /> },
          {
            key: "traffic",
            header: t("columns.traffic"),
            align: "right",
            cell: (row) => (
              <span className="flex flex-col items-end">
                <span className="font-mono text-[13px] text-foreground">{formatNumber(row.traffic)}</span>
                {row.traffic !== null && siteTraffic ? (
                  <span className="text-[11px] text-muted">{t("shareOf", { share: `${Math.min(100, (row.traffic / siteTraffic) * 100).toFixed(1)}%` })}</span>
                ) : null}
              </span>
            ),
          },
          { key: "value", header: t("columns.value"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatUsd(row.trafficValue)}</span> },
          { key: "keywords", header: t("columns.keywords"), align: "right", cell: (row) => <span className="font-mono text-[13px]">{formatNumber(row.keywords)}</span> },
          { key: "top3", header: t("columns.top3"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.top3)}</span> },
          { key: "best", header: t("columns.best"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.bestPosition}</span> },
          { key: "topKeyword", header: t("columns.topKeyword"), cell: (row) => <span className="text-[12px] text-secondary">{row.topKeyword}</span> },
          {
            key: "pageRank",
            header: <span title={t("pageRankHint")}>{t("columns.pageRank")}</span>,
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.pageRank)}</span>,
          },
          {
            key: "linking",
            header: t("columns.linking"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[12px] text-secondary" title={row.backlinks !== null ? t("backlinksTitle", { count: formatNumber(row.backlinks) }) : undefined}>
                {formatNumber(row.referringDomains)}
              </span>
            ),
          },
          {
            key: "ai",
            header: t("columns.ai"),
            cell: (row) => row.aiEngines.length === 0 ? <span className="text-muted">–</span> : (
              <div className="flex flex-wrap gap-1" title={t("citedBy", { times: row.aiTimes })}>
                {row.aiEngines.map((engine) => <StatusPill key={engine} tone="info">{engineLabel(engine)}</StatusPill>)}
              </div>
            ),
          },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
