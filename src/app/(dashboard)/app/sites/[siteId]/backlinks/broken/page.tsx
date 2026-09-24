"use client";

import { useTranslations } from "next-intl";
import { Unlink } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CheckedCell, ExternalUrlCell } from "../../../_components/SiteCells";
import { formatDay, formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

/**
 * Broken backlinks: links from other websites that land on a page here that
 * no longer works — the links worth mending — strongest linking website
 * first, from the broken-only pass of the backlinks list.
 */
export default function SiteBrokenBacklinksPage() {
  const t = useTranslations("sites.backlinksBroken");
  const siteId = useSiteId();
  const [search, setSearch, term] = useSiteSearch();
  const table = useSitePagedTable(api.siteLinkLists.listBrokenBacklinks, { siteId, ...(term ? { search: term } : {}) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Unlink className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={table.isLoading ? undefined : table.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[1100px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={<TableDownload siteId={siteId} kind="broken" />}
        empty={{ icon: <Unlink className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
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
            key: "from",
            header: t("columns.from"),
            cell: (row) => (
              <span className="flex max-w-[34ch] flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{row.domainFrom}</span>
                <ExternalUrlCell url={row.urlFrom} />
              </span>
            ),
          },
          { key: "to", header: t("columns.to"), cell: (row) => <span className="break-all text-[12px] text-info">{row.pageTo}</span> },
          { key: "code", header: t("columns.code"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.statusCode ?? "–"}</span> },
          { key: "anchor", header: t("columns.anchor"), cell: (row) => <span className="max-w-[28ch] text-[12px] text-secondary">{row.anchor ?? "–"}</span> },
          { key: "domainRank", header: t("columns.domainRank"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.domainRank)}</span> },
          { key: "firstSeen", header: t("columns.firstSeen"), cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.firstSeen)}</span> },
          { key: "checked", header: t("columns.lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
