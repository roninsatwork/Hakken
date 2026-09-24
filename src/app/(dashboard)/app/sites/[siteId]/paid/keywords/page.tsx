"use client";

import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CheckedCell, PageCell } from "../../../_components/SiteCells";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

type Sort = "traffic" | "cost" | "volume";

/**
 * Paid keywords: the searches the site shows Google adverts on, where each
 * advert sits and what its visits would cost — from the newest ranked-keywords
 * answer, paged and searched on the server.
 */
export default function SitePaidKeywordsPage() {
  const t = useTranslations("sites.paidKeywords");
  const siteId = useSiteId();
  const [search, setSearch, term] = useSiteSearch();
  const [sort, setSort] = useSiteParam<Sort>("sort", "traffic", ["traffic", "cost", "volume"]);
  const table = useSitePagedTable(api.sitePaid.listPaidKeywords, { siteId, ...(term ? { search: term } : {}), sort });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Megaphone className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[1000px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("sortLabel")} value={sort} onChange={(value) => setSort(value as Sort)}>
            <option value="traffic">{t("sortTraffic")}</option>
            <option value="cost">{t("sortCost")}</option>
            <option value="volume">{t("sortVolume")}</option>
          </Select>
            <TableDownload siteId={siteId} kind="paid" />
          </>
        }
        empty={{ icon: <Megaphone className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
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
          { key: "keyword", header: t("columns.keyword"), cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span> },
          { key: "position", header: t("columns.position"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.position ?? "–"}</span> },
          { key: "volume", header: t("columns.volume"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.volume)}</span> },
          { key: "cpc", header: t("columns.cpc"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.cpc === null ? "–" : `$${row.cpc.toFixed(2)}`}</span> },
          { key: "traffic", header: t("columns.traffic"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.traffic)}</span> },
          { key: "cost", header: t("columns.cost"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">${formatNumber(row.trafficCost)}</span> },
          { key: "page", header: t("columns.page"), cell: (row) => <PageCell page={row.page} /> },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
