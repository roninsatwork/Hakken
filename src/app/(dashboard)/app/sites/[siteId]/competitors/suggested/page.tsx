"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { CheckedCell } from "../../../_components/SiteCells";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { heldIcon } from "../../../_components/siteGroups";
import { MarkedHost } from "../../../_components/SiteMark";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { suggestedSees } from "@/convex/utils/sees/competitors";
import { SiteSees } from "../../../_components/SiteSees";
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
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const site = useSite();
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
      <SiteSees screen="competitorsSuggested" seen={rows && suggestedSees(rows)} />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.host}
        // Each suggestion opens One website: what Google's AI says of it beside you (discovery-detail-and-hakken-sees-plan.md §4).
        onRowClick={(row) => router.push(recordHref({ kind: "website", host: row.host }))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        cardHeader={<TableBar footer={pager.footer} noun="websites" actions={<ListDownload fileName={"suggested-competitors"} rows={sorted} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.why"), value: (row) => (row.reason === "NAMED_BY_AI" ? t("namedByAi", { times: row.times ?? 0 }) : t("ranksFor", { count: String(row.intersections ?? 0) })) }, { header: tc("lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          {
            key: "website",
            header: t("columns.website"),
            sortable: true,
            cell: (row) => (
              <MarkedHost host={row.host} iconUrl={heldIcon(site?.holds, { host: row.host })} owned={false}>
                <span className="truncate text-[13px] text-foreground">{row.host}</span>
              </MarkedHost>
            ),
          },
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
                {row.kind ? <StatusLabel tone={row.kind === "COMPETITOR" ? "warning" : "neutral"}>{to(row.kind)}</StatusLabel> : null}
              </span>
            ),
          },
          { key: "checked", header: tc("lastChecked"), sortable: true, cell: (row) => <CheckedCell day={row.day} /> },
        ]}
      />
    </div>
  );
}
