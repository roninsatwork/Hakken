"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Anchor } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { LinkStatusPill, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { formatDay, formatNumber, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

/** Bars drawn: the first of the page on screen, as many as a page held before rows per page could grow to 100. */
const CHARTED = 15;

/**
 * The columns that sort, over every anchor (docs/plans/active/
 * sites-table-sorting-plan.md): the words A to Z; most links, most linking
 * websites and newest first.
 */
const SORTS = { anchor: "asc", backlinks: "desc", domains: "desc", firstSeen: "desc" } as const;

/**
 * Anchors: the words other websites link here with, most-used first, and the
 * page on screen drawn as bars. Paged and searched on the server.
 */
export default function SiteAnchorsPage() {
  const t = useTranslations("sites.backlinksAnchors");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const site = useSite();
  const [search, setSearch, term] = useSiteSearch();
  const order = useSiteSort(SORTS, "backlinks");
  const table = useSiteListPage(api.siteLinkLists.listAnchors, { siteId, ...(term ? { search: term } : {}), sort: order.key, direction: order.direction });
  const words = (anchor: string) => anchor || t("noAnchor");
  const charted = (table.pageRows ?? []).slice(0, CHARTED);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Anchor className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        dated={false}
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-anchors`}
        csv={() => toCsv([t("columns.anchor"), t("columns.backlinks"), t("columns.domains")], charted.map((row) => [words(row.anchor), row.backlinks, row.referringDomains]))}
        enoughData={charted.length > 0}
      >
        <SiteBarChart
          horizontal
          height={Math.max(160, charted.length * 28)}
          data={charted.map((row) => ({ label: words(row.anchor).slice(0, 40), backlinks: row.backlinks, domains: row.referringDomains }))}
          series={[
            { key: "backlinks", name: t("columns.backlinks"), colour: SITE_SERIES_COLOURS[1] },
            { key: "domains", name: t("columns.domains"), colour: SITE_SERIES_COLOURS[3] },
          ]}
        />
      </SiteChartCard>

      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "anchor", anchor: row.anchor }))}
        minWidthClassName="min-w-[680px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        cardHeader={<SiteTableBar footer={table.footer} noun="anchors" actions={<TableDownload siteId={siteId} kind="anchors" sort={order.tableSort} />} />}
        empty={{ icon: <Anchor className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          {
            key: "anchor",
            header: t("columns.anchor"),
            sortable: true,
            cell: (row) => (row.anchor
              ? <RecordLinkCell href={recordHref({ kind: "anchor", anchor: row.anchor })}>{row.anchor}</RecordLinkCell>
              : <RecordLinkCell href={recordHref({ kind: "anchor", anchor: "" })} className="text-[12px] text-muted">{t("noAnchor")}</RecordLinkCell>),
          },
          { key: "backlinks", header: t("columns.backlinks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.backlinks)}</span> },
          { key: "domains", header: t("columns.domains"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.referringDomains)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "status", header: t("columns.status"), cell: (row) => <LinkStatusPill status={row.status} /> },
        ]}
      />
    </div>
  );
}
