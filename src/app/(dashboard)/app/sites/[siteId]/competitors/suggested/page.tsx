"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { CheckedCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type Suggested = { host: string; reason: string; times?: number | null; intersections?: number | null; day: string | null };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * website A to Z; why, by its number — the keywords shared, or the times an
 * AI named it — the most first, the order it opens on; the newest checked
 * first.
 */
const SORTS: SiteSortColumns<Suggested, "website" | "why" | "checked"> = {
  website: { value: (row) => row.host, first: "asc" },
  why: { value: (row) => (row.reason === "NAMED_BY_AI" ? row.times : row.intersections) ?? null, first: "desc" },
  checked: { value: (row) => row.day, first: "desc" },
};
const hostOf = (row: Suggested) => row.host;

/**
 * Suggested competitors: websites worth watching that the company does not
 * hold yet — named by the AI answers first, then ranking for the same
 * searches. Read-only (D1, D6): adding one is done for the client in admin.
 */
export default function SiteSuggestedPage() {
  const t = useTranslations("sites.suggested");
  const to = useTranslations("sites.organic.kinds");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const rows = useQuery(api.siteCompetitors.listSuggested, { siteId });
  const [search, setSearch, settled] = useSiteSearch();
  const term = settled.toLowerCase();
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) => !matches || matches(row.host));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "why", name: hostOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Lightbulb className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.host}
        minWidthClassName="min-w-[700px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        cardHeader={<SiteTableBar footer={pager.footer} noun="websites" actions={<ListDownload fileName={"suggested-competitors"} rows={sorted} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.why"), value: (row) => (row.reason === "NAMED_BY_AI" ? t("namedByAi", { times: row.times ?? 0 }) : t("ranksFor", { count: String(row.intersections ?? 0) })) }, { header: tc("lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "website", header: t("columns.website"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{row.host}</span> },
          {
            key: "why",
            header: t("columns.why"),
            // By its number: the keywords shared, or the times named.
            sortable: true,
            cell: (row) => (
              <span className="flex flex-wrap items-center gap-2 text-[12px] text-secondary">
                {row.reason === "NAMED_BY_AI"
                  ? t("namedByAi", { times: row.times ?? 0 })
                  : t("ranksFor", { count: formatNumber(row.intersections) })}
                {row.kind ? <StatusPill tone={row.kind === "COMPETITOR" ? "warning" : "neutral"}>{to(row.kind)}</StatusPill> : null}
              </span>
            ),
          },
          { key: "checked", header: tc("lastChecked"), sortable: true, cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
