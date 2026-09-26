"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CUT_COLUMN, PageTypePill, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

/**
 * The columns that sort, over every page (docs/plans/active/
 * sites-table-sorting-plan.md): the address A to Z, the best position from
 * the top, and the most visits, keywords and linking websites first.
 */
const SORTS = { page: "asc", traffic: "desc", keywords: "desc", best: "asc", linking: "desc" } as const;

const PAGE_TYPES = [
  "HOME", "SERVICE", "PRODUCT", "CATEGORY", "ARTICLE", "CASE_STUDY",
  "ABOUT", "CONTACT", "LOCATION", "CAREERS", "LEGAL", "OTHER", "UNJUDGED",
] as const;
type PageType = (typeof PAGE_TYPES)[number];

/**
 * Top pages (Organic search › Top pages): the site's pages by how many
 * searches each ranks for. Paged and searched on the server; the chart is the
 * number of ranking pages over the dates chosen.
 *
 * Six columns, the ones a reader decides on, so the table fits a 13-inch
 * screen; each row opens the page's own screen — its searches, what the site
 * audit found, the AI answers and the links pointing at it (docs/plans/
 * active/sites-ux-updates-plan.md §3).
 */
export default function SitePagesPage() {
  const t = useTranslations("sites.pages");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const tt = useTranslations("sites.common.pageTypes");
  const tm = useTranslations("sites.measures");
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const [search, setSearch, term] = useSiteSearch();
  const [section, setSection] = useSiteParam<string>("section", "");
  const [pageType, setPageType] = useSiteParam<PageType | "">("type", "", PAGE_TYPES);
  const order = useSiteSort(SORTS, "keywords");

  const sections = useQuery(api.siteKeywords.listSections, { siteId });
  const table = useSiteListPage(api.siteKeywords.listPages, {
    siteId,
    ...(term ? { search: term } : {}),
    ...(section ? { section } : {}),
    ...(pageType ? { pageType } : {}),
    sort: order.key,
    direction: order.direction,
  }, [{ siteId, list: "pages" }]);
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
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "page", page: row.page }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("sectionFilter"), choice: section || null }} className="max-w-[320px]" value={section} onChange={setSection}>
              <option value="">{t("allSections")}</option>
              {(sections ?? []).map((entry) => <option key={entry.section} value={entry.section}>{entry.section}</option>)}
            </Select>
            <Select chip={{ label: t("typeFilter"), choice: pageType ? tt(pageType) : null }} value={pageType} onChange={(value) => setPageType(value as PageType | "")}>
              <option value="">{t("anyType")}</option>
              {PAGE_TYPES.map((entry) => <option key={entry} value={entry}>{tt(entry)}</option>)}
            </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={table.footer} noun="pages" actions={<TableDownload siteId={siteId} kind="pages" sort={order.tableSort} />} />}
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: term || section || pageType ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          {
            key: "page",
            header: t("columns.page"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "page", page: row.page })} className="text-[12px] text-info">{row.page || "/"}</RecordLinkCell>,
          },
          { key: "type", header: t("columns.type"), cell: (row) => <PageTypePill type={row.pageType} /> },
          {
            key: "traffic",
            header: t("columns.traffic"),
            align: "right",
            sortable: true,
            cell: (row) => (
              <span className="flex flex-col items-end">
                <span className="font-mono text-[13px] text-foreground">{formatNumber(row.traffic)}</span>
                {row.traffic !== null && siteTraffic ? (
                  <span className="text-[11px] text-muted">{t("shareOf", { share: `${Math.min(100, (row.traffic / siteTraffic) * 100).toFixed(1)}%` })}</span>
                ) : null}
              </span>
            ),
          },
          { key: "keywords", header: t("columns.keywords"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[13px]">{formatNumber(row.keywords)}</span> },
          { key: "best", header: t("columns.best"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.bestPosition}</span> },
          {
            key: "linking",
            header: t("columns.linking"),
            align: "right",
            sortable: true,
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.referringDomains)}</span>,
          },
        ]}
      />
    </div>
  );
}
