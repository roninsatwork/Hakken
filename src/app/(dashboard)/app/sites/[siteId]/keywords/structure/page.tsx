"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FolderTree } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { useSiteSearch, useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

/**
 * Site structure: keywords, traffic and pages by folder of the site, from the
 * latest rankings. A site has a few hundred folders at most, so the list
 * arrives whole and the search box narrows it in place.
 */
export default function SiteStructurePage() {
  const t = useTranslations("sites.structure");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const sections = useQuery(api.siteKeywords.listSections, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [page, setPage] = useSiteTablePage();
  const router = useRouter();
  const listHref = useSiteListHref(siteId);
  // A folder opens its pages: Top pages narrowed to it.
  const folderHref = (section: string) => listHref("keywords/pages", { section });
  const total = (sections ?? []).reduce((sum, row) => sum + row.keywords, 0);
  const label = (section: string) => (section === "/" ? t("home") : section);

  const lower = term.toLowerCase();
  const matching = sections?.filter((row) => !lower || label(row.section).toLowerCase().includes(lower));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  const charted = (sections ?? []).slice(0, 15);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<FolderTree className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        exportName={`${site?.host ?? "site"}-structure`}
        csv={() => toCsv(
          [t("columns.section"), t("columns.pages"), t("columns.keywords"), t("columns.top3"), t("columns.traffic")],
          (sections ?? []).map((row) => [row.section, row.pages, row.keywords, row.top3, row.traffic === null ? null : Math.round(row.traffic)]),
        )}
        enoughData={charted.length > 0}
      >
        <SiteBarChart
          horizontal
          height={Math.max(160, charted.length * 36)}
          data={charted.map((row) => ({ label: label(row.section), keywords: row.keywords, traffic: row.traffic === null ? undefined : Math.round(row.traffic) }))}
          series={[
            { key: "keywords", name: t("columns.keywords"), colour: SITE_SERIES_COLOURS[1] },
            { key: "traffic", name: t("columns.traffic"), colour: SITE_SERIES_COLOURS[0] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={shown}
        rowKey={(row) => row.section}
        onRowClick={(row) => router.push(folderHref(row.section))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
filters={<ListDownload fileName={`${site?.host ?? "site"}-structure`} rows={matching} columns={[{ header: t("columns.section"), value: (row) => row.section }, { header: t("columns.pages"), value: (row) => row.pages }, { header: t("columns.keywords"), value: (row) => row.keywords }, { header: t("columns.top3"), value: (row) => row.top3 }, { header: t("columns.traffic"), value: (row) => (row.traffic === null ? null : Math.round(row.traffic)) }, { header: tc("lastChecked"), value: (row) => row.day }]} />}
        empty={{ icon: <FolderTree className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: matching?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: sections === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "section", header: t("columns.section"), cell: (row) => <RecordLinkCell href={folderHref(row.section)} className="text-[13px] text-info">{label(row.section)}</RecordLinkCell> },
          { key: "pages", header: t("columns.pages"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.pages)}</span> },
          { key: "keywords", header: t("columns.keywords"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.keywords)}</span> },
          { key: "top3", header: t("columns.top3"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.top3)}</span> },
          { key: "traffic", header: t("columns.traffic"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.traffic)}</span> },
          {
            key: "share",
            header: t("columns.share"),
            cell: (row) => {
              const share = total > 0 ? Math.round((row.keywords / total) * 100) : 0;
              return (
                <span className="flex items-center gap-2 text-[12px] text-secondary">
                  <span className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, share)}px` }} />
                  {share}%
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
