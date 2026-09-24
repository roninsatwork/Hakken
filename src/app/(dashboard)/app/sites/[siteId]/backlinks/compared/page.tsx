"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Scale } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { CheckedCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

/**
 * Backlinks › Compared with rivals: the site's links beside the others in its
 * group, as each stood at its newest check.
 */
export default function SiteBacklinksComparedPage() {
  const t = useTranslations("sites.backlinksCompared");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const rows = useQuery(api.siteCharts.siteAndRivals, { siteId });
  const [search, setSearch, settled] = useSiteSearch();
  const lower = settled.toLowerCase();
  const shown = rows?.filter((row) => !lower || row.host.toLowerCase().includes(lower));
  // Fifteen rows a page, like every table, however many rivals a group holds.
  const paged = usePagedRows(shown ?? [], { canLoadMore: false, loadMore: () => undefined, resetKey: lower });
  const name = (row: { host: string; isYou: boolean }) => (row.isYou ? tc("you", { host: row.host }) : row.host);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Scale className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-links-compared`}
        csv={() => toCsv([t("columns.website"), t("columns.rank"), t("columns.backlinks"), t("columns.referringDomains")], (rows ?? []).map((row) => [row.host, row.domainRank, row.backlinks, row.referringDomains]))}
        enoughData={(rows ?? []).some((row) => row.referringDomains !== null)}
      >
        <SiteBarChart
          horizontal
          height={Math.max(160, (rows?.length ?? 0) * 44)}
          data={(rows ?? []).map((row) => ({ label: name(row), referringDomains: row.referringDomains }))}
          series={[{ key: "referringDomains", name: t("columns.referringDomains"), colour: SITE_SERIES_COLOURS[1] }]}
        />
      </SiteChartCard>

      <DataTable
        rows={shown === undefined ? undefined : paged.pageRows}
        rowKey={(row) => row.websiteId}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: tc("findWebsite") }}
filters={<ListDownload fileName={`${site?.host ?? "site"}-links-compared`} rows={shown} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.rank"), value: (row) => row.domainRank }, { header: t("columns.backlinks"), value: (row) => row.backlinks }, { header: t("columns.referringDomains"), value: (row) => row.referringDomains }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />}
        empty={{ icon: <Scale className="h-8 w-8 text-muted/30" />, label: lower ? tc("noWebsiteMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.loadedCount,
          pageSize: paged.pageSize,
          isLoading: rows === undefined,
          onPageChange: paged.goToPage,
        }}
        columns={[
          { key: "website", header: t("columns.website"), cell: (row) => <span className={`text-[13px] ${row.isYou ? "font-medium text-foreground" : "text-secondary"}`}>{name(row)}</span> },
          { key: "rank", header: t("columns.rank"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.domainRank)}</span> },
          { key: "backlinks", header: t("columns.backlinks"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.backlinks)}</span> },
          { key: "domains", header: t("columns.referringDomains"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.referringDomains)}</span> },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
