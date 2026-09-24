"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CheckedCell, PageCell } from "../../../_components/SiteCells";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";

/**
 * Sources cited: this site's pages the AI answers link to, most cited first —
 * from the answers to the questions the site is measured on (D17). A bounded
 * list, so it arrives whole and the search box narrows it in place.
 */
export default function SiteSourcesPage() {
  const t = useTranslations("sites.aiSources");
  const siteId = useSiteId();
  const engineLabel = useEngineLabel();
  const [search, setSearch, settled] = useSiteSearch();
  const rows = useQuery(api.siteAi.listCitedPages, { siteId });
  const term = settled.trim().toLowerCase();
  const matching = (rows ?? []).filter((row) => !term || row.page.toLowerCase().includes(term));
  const table = usePagedRows(matching, { canLoadMore: false, loadMore: () => undefined, resetKey: term });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Link2 className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={rows === undefined ? undefined : table.pageRows}
        rowKey={(row) => row.page}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={<TableDownload siteId={siteId} kind="cited" />}
        empty={{ icon: <Link2 className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: table.page,
          totalPages: table.totalPages,
          totalCount: table.loadedCount,
          pageSize: table.pageSize,
          isLoading: rows === undefined,
          onPageChange: table.goToPage,
        }}
        columns={[
          { key: "page", header: t("columns.page"), cell: (row) => <PageCell page={row.page} /> },
          {
            key: "engines",
            header: t("columns.engines"),
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.engines.map((engine) => <StatusPill key={engine} tone="info">{engineLabel(engine)}</StatusPill>)}
              </div>
            ),
          },
          { key: "times", header: t("columns.times"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.times)}</span> },
          { key: "first", header: t("columns.firstCited"), cell: (row) => <CheckedCell day={row.firstDay} /> },
          { key: "last", header: t("columns.lastCited"), cell: (row) => <CheckedCell day={row.lastDay} /> },
        ]}
      />
    </div>
  );
}
