"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CheckedCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type Cited = { page: string; engines: readonly string[]; times: number; lastDay: string };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * page A to Z, the most engines citing it, the most times cited — the order
 * it opens on — and the newest cited first. The keys are the download's too.
 */
const SORTS: SiteSortColumns<Cited, "page" | "engines" | "times" | "last"> = {
  page: { value: (row) => row.page, first: "asc" },
  engines: { value: (row) => row.engines.length, first: "desc" },
  times: { value: (row) => row.times, first: "desc" },
  last: { value: (row) => row.lastDay, first: "desc" },
};
const pageOf = (row: Cited) => row.page;

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
  const answer = useQuery(api.siteAi.listCitedPages, { siteId });
  const rows = answer?.rows;
  const term = settled.trim().toLowerCase();
  const matches = wordStartMatcher(term);
  const matching = (rows ?? []).filter((row) => !matches || matches(row.page));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "times", name: pageOf });
  const table = useSitePager(sorted, { isLoading: rows === undefined, cut: answer?.cut });
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Link2 className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={table.pageRows}
        rowKey={(row) => row.page}
        onRowClick={(row) => router.push(recordHref({ kind: "page", page: row.page }))}
        minWidthClassName="min-w-[640px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        cardHeader={<SiteTableBar footer={table.footer} noun="pages" actions={<TableDownload siteId={siteId} kind="cited" sort={tableSort} />} />}
        empty={{ icon: <Link2 className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
        footer={table.footer}
        sort={tableSort}
        columns={[
          { key: "page", header: t("columns.page"), sortable: true, cell: (row) => <RecordLinkCell href={recordHref({ kind: "page", page: row.page })} className="break-all text-[12px] text-info">{row.page || "/"}</RecordLinkCell> },
          {
            key: "engines",
            header: t("columns.engines"),
            // By how many engines cite it.
            sortable: true,
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.engines.map((engine) => <StatusPill key={engine} tone="info">{engineLabel(engine)}</StatusPill>)}
              </div>
            ),
          },
          { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.times)}</span> },
          { key: "last", header: t("columns.lastCited"), sortable: true, cell: (row) => <CheckedCell day={row.lastDay} /> },
        ]}
      />
    </div>
  );
}
