"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Anchor } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { LinkStatusPill, RecordLinkCell } from "../../../_components/SiteCells";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatDay, formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

/**
 * Anchors: the words other websites link here with, most-used first, and the
 * page on screen drawn as bars. Paged and searched on the server.
 */
export default function SiteAnchorsPage() {
  const t = useTranslations("sites.backlinksAnchors");
  const tl = useTranslations("sites.linkLists");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const site = useSite();
  const [search, setSearch, term] = useSiteSearch();
  const [sort, setSort] = useSiteParam<"backlinks" | "domains">("sort", "backlinks", ["backlinks", "domains"]);
  const table = useSitePagedTable(api.siteLinkLists.listAnchors, { siteId, ...(term ? { search: term } : {}), sort });
  const words = (anchor: string) => anchor || t("noAnchor");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Anchor className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-anchors`}
        csv={() => toCsv([t("columns.anchor"), t("columns.backlinks"), t("columns.domains")], table.rows.map((row) => [words(row.anchor), row.backlinks, row.referringDomains]))}
        enoughData={table.rows.length > 0}
      >
        <SiteBarChart
          horizontal
          height={Math.max(160, table.rows.length * 28)}
          data={table.rows.map((row) => ({ label: words(row.anchor).slice(0, 40), backlinks: row.backlinks, domains: row.referringDomains }))}
          series={[
            { key: "backlinks", name: t("columns.backlinks"), colour: SITE_SERIES_COLOURS[1] },
            { key: "domains", name: t("columns.domains"), colour: SITE_SERIES_COLOURS[3] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "anchor", anchor: row.anchor }))}
        minWidthClassName="min-w-[680px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={tl("sortLabel")} value={sort} onChange={(value) => setSort(value as "backlinks" | "domains")}>
            <option value="backlinks">{t("sortBacklinks")}</option>
            <option value="domains">{t("sortDomains")}</option>
          </Select>
            <TableDownload siteId={siteId} kind="anchors" />
          </>
        }
        empty={{ icon: <Anchor className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
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
          {
            key: "anchor",
            header: t("columns.anchor"),
            cell: (row) => (row.anchor
              ? <RecordLinkCell href={recordHref({ kind: "anchor", anchor: row.anchor })}>{row.anchor}</RecordLinkCell>
              : <RecordLinkCell href={recordHref({ kind: "anchor", anchor: "" })} className="text-[12px] text-muted">{t("noAnchor")}</RecordLinkCell>),
          },
          { key: "backlinks", header: t("columns.backlinks"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.backlinks)}</span> },
          { key: "domains", header: t("columns.domains"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.referringDomains)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusPill status={row.status} /> },
        ]}
      />
    </div>
  );
}
