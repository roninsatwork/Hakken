"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { useInsightsHref } from "./useInsights";
import { useInsightWords } from "./insightWords";

export type FindingRow = FunctionReturnType<typeof api.insightsReads.insightsAllFindings>[number];

const SORTS: SiteSortColumns<FindingRow, "headline" | "pattern" | "atStake" | "week" | "rank"> = {
  rank: { value: (row) => row.rank, first: "asc" },
  headline: { value: (row) => row.headline, first: "asc" },
  pattern: { value: (row) => row.pattern, first: "asc" },
  atStake: { value: (row) => row.atStake, first: "desc" },
  week: { value: (row) => row.week, first: "desc" },
};

/**
 * A list of findings (insights-analyst-plan.md §4.1, I11; This week and All
 * findings): lean rows — the finding, where it was read from, its pattern,
 * what's at stake, how sure, and its status — searched, filtered and paged
 * as every Sites table is; each row opens the finding's whole case. The
 * table's props, for each page to draw under its own header.
 */
export function useFindingsTable({ rows, when, opening }: { rows: FindingRow[] | undefined; when: "sure" | "found"; opening: "rank" | "week" }): Parameters<typeof DataTable<FindingRow>>[0] {
  const t = useTranslations("insights.findings.table");
  const words = useInsightWords();
  const router = useRouter();
  const href = useInsightsHref();
  const [search, setSearch, term] = useSiteSearch();
  const [pattern, setPattern] = useSiteParam<string>("pattern", "");
  const patterns = [...new Set((rows ?? []).map((row) => row.pattern))];
  const matches = wordStartMatcher(term.toLowerCase());
  const shown = rows?.filter((row) => (!pattern || row.pattern === pattern) && (!matches || matches(row.headline)));
  const order = useSiteSortedList(shown, SORTS, { opening, name: (row) => row.headline });
  const pages = useSitePager(order.rows, { isLoading: rows === undefined });
  const atStake = (row: FindingRow) => (row.atStake ? t("atStakeYear", { count: row.atStake }) : "–");

  return {
      rows: pages.pageRows,
      rowKey: (row) => row.findingId,
      onRowClick: (row) => router.push(href(`findings/${row.findingId}`)),
      search: { value: search, onChange: setSearch, placeholder: t("search") },
      filters: (
        <Select chip={{ label: t("pattern"), choice: pattern ? words.pattern(pattern) : null }} value={pattern} onChange={setPattern} aria-label={t("pattern")}>
          <option value="">{t("everyPattern")}</option>
          {patterns.map((code) => <option key={code} value={code}>{words.pattern(code)}</option>)}
        </Select>
      ),
      cardHeader: (
        <TableBar
          footer={pages.footer}
          noun="results"
          actions={
            <ListDownload
              label={t("download")}
              fileName="insights-findings"
              rows={order.rows}
              columns={[
                { header: t("finding"), value: (row) => row.headline },
                { header: t("from"), value: (row) => row.sources.map(words.source).join(", ") },
                { header: t("patternColumn"), value: (row) => words.pattern(row.pattern) },
                { header: t("atStake"), value: (row) => row.atStake ?? "" },
                { header: when === "sure" ? t("sure") : t("found"), value: (row) => (when === "sure" ? words.sure(row.sure) : row.week) },
              ]}
            />
          }
        />
      ),
      sort: order.tableSort,
      empty: { icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: term || pattern ? t("noMatch") : t("empty") },
      footer: pages.footer,
      columns: [
        {
          key: "headline",
          header: t("finding"),
          sortable: true,
          cell: (row) => (
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] text-foreground">{row.headline}</span>
              <span className="text-[12px] text-secondary">{t("fromSources", { sources: row.sources.map(words.source).join(", ") })}</span>
            </span>
          ),
        },
        { key: "pattern", header: t("patternColumn"), sortable: true, cell: (row) => <TagLabel>{words.pattern(row.pattern)}</TagLabel> },
        { key: "atStake", header: t("atStake"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{atStake(row)}</span> },
        when === "sure"
          ? { key: "sure", header: t("sure"), cell: (row: FindingRow) => <TagLabel>{words.sure(row.sure)}</TagLabel> }
          : { key: "week", header: t("found"), sortable: true, cell: (row: FindingRow) => <span className="font-mono text-[12px] text-secondary">{words.day(row.createdAt)}</span> },
        {
          key: "status",
          header: t("status"),
          cell: (row) => <StatusLabel tone={row.outcome === "RIGHT" ? "success" : row.outcome === "WRONG" ? "warning" : row.isNew ? "info" : "neutral"}>{words.status(row)}</StatusLabel>,
        },
      ],
  };
}
