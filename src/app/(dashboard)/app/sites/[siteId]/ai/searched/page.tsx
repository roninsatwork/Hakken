"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Telescope } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CUT_COLUMN, IntentPill, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;

type Searched = { queryText: string; engines: readonly string[]; timesSeen: number; lastSeenDay: string };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * query A to Z, the most engines running it, and the most times seen — the
 * order it opens on.
 */
const SORTS: SiteSortColumns<Searched, "search" | "engines" | "times"> = {
  search: { value: (row) => row.queryText, first: "asc" },
  engines: { value: (row) => row.engines.length, first: "desc" },
  times: { value: (row) => row.timesSeen, first: "desc" },
};
const queryOf = (row: Searched) => row.queryText;

/**
 * Fan-out queries: the searches the engines ran behind the scenes for the
 * site's questions, most persistent first. Named with the industry's own term,
 * the one a reader looks for (Anthony, 2026-09-25); it was "What the AI
 * searched", which the admin tab still says, admin being left as it is.
 * Read-only (D1) — tracking one is done in admin. The list is bounded on the
 * server (its most persistent thousand), so the search and filters narrow it
 * in place.
 */
export default function SiteSearchedPage() {
  const t = useTranslations("sites.aiSearched");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const engineLabel = useEngineLabel();
  const [search, setSearch, settled] = useSiteSearch();
  const [intent, setIntent] = useSiteParam<string>("intent", "");
  const [tracked, setTracked] = useSiteParam<string>("tracked", "");
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const answer = useQuery(api.siteAi.listSearched, { siteId });
  const rows = answer?.rows;

  const term = settled.toLowerCase();
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) =>
    (!matches || matches(row.queryText, row.prompt))
    && (!intent || (row.intent ?? "UNJUDGED") === intent)
    && (!tracked || (tracked === "yes") === row.tracked));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "times", name: queryOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined, cut: answer?.cut });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Telescope className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => `${row.prompt}::${row.query}`}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.query }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: tc("intentFilter"), choice: intent ? tc(`intents.${intent}`) : null }} value={intent} onChange={setIntent}>
              <option value="">{tc("anyIntent")}</option>
              {INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("trackedFilter"), choice: tracked === "yes" ? t("onlyTracked") : tracked === "no" ? t("onlyUntracked") : null }} value={tracked} onChange={setTracked}>
              <option value="">{t("anyTracked")}</option>
              <option value="yes">{t("onlyTracked")}</option>
              <option value="no">{t("onlyUntracked")}</option>
            </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={pager.footer} noun="queries" actions={<ListDownload fileName={"fan-out-queries"} rows={sorted} columns={[{ header: t("columns.search"), value: (row) => row.queryText }, { header: t("columns.engines"), value: (row) => row.engines.join("; ") }, { header: t("columns.times"), value: (row) => row.timesSeen }, { header: t("columns.lastChecked"), value: (row) => row.lastSeenDay }]} />} />}
        empty={{ icon: <Telescope className="h-8 w-8 text-muted/30" />, label: term || intent || tracked ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          {
            key: "search",
            header: t("columns.search"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => (
              <span className="flex min-w-0 flex-col gap-0.5">
                <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.query })}>{row.queryText}</RecordLinkCell>
                <span title={row.prompt} className="truncate text-[11px] text-muted">{t("fromQuestion", { question: row.prompt })}</span>
              </span>
            ),
          },
          { key: "intent", header: t("columns.intent"), cell: (row) => <IntentPill intent={row.intent} /> },
          { key: "engines", header: t("columns.engines"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.engines.map(engineLabel).join(", ")}</span> },
          { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.timesSeen)}</span> },
          { key: "tracked", header: t("columns.tracked"), cell: (row) => (row.tracked ? <StatusPill tone="success">{tc("yes")}</StatusPill> : <span className="text-muted">–</span>) },
        ]}
      />
    </div>
  );
}
