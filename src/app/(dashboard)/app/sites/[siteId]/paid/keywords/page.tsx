"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { formatCpc, formatNumber } from "../../../_components/siteFormat";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteId } from "../../../_components/useSite";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

/**
 * The columns that sort, over every advert (docs/plans/active/
 * sites-table-sorting-plan.md): the search A to Z, the advert's place from
 * the top, and the most searched, dearest click, most visits and highest cost
 * first.
 */
const SORTS = { keyword: "asc", position: "asc", volume: "desc", cpc: "desc", traffic: "desc", cost: "desc" } as const;

/**
 * Paid keywords: the searches the site shows Google adverts on, where each
 * advert sits and what its visits would cost — from the newest ranked-keywords
 * answer, paged and searched on the server.
 */
export default function SitePaidKeywordsPage() {
  const t = useTranslations("sites.paidKeywords");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const [search, setSearch, term] = useSiteSearch();
  const order = useSiteSort(SORTS, "traffic");
  const table = useSiteListPage(api.sitePaid.listPaidKeywords, { siteId, ...(term ? { search: term } : {}), sort: order.key, direction: order.direction });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Megaphone className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        cardHeader={<SiteTableBar footer={table.footer} noun="adverts" actions={<TableDownload siteId={siteId} kind="paid" sort={order.tableSort} />} />}
        empty={{ icon: <Megaphone className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={order.tableSort}
        columns={[
          { key: "keyword", header: t("columns.keyword"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.position ?? "–"}</span> },
          { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.volume)}</span> },
          { key: "cpc", header: t("columns.cpc"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatCpc(row.cpc)}</span> },
          { key: "traffic", header: t("columns.traffic"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.traffic)}</span> },
          { key: "cost", header: t("columns.cost"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">${formatNumber(row.trafficCost)}</span> },
        ]}
      />
    </div>
  );
}
