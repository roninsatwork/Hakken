"use client";

import { useTranslations } from "next-intl";
import { Quote } from "lucide-react";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import type { AiEngine } from "@/convex/seoAiEngines";
import { formatNumber } from "./siteFormat";
import { ListDownload } from "./SiteDownloads";
import { useSitePager } from "./useSitePagedTable";
import { useSiteSearch } from "./useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "./useSiteSort";

type CitedRow = { host: string; url: string; page: string; engines: AiEngine[]; prompts: string[]; times: number };

const SORTS: SiteSortColumns<CitedRow, "page" | "times"> = {
  page: { value: (row) => `${row.host}${row.page}`, first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
};

/**
 * A table of rivals' pages AI assistants cite (insights-analyst-plan.md §4.1,
 * drawn on the VisRival and PageDetail boards): each page, the assistants
 * that cite it and the questions it is cited for — its search, order, pages
 * and download, for the screen to draw under its own header. Shared by a
 * rival's page and a page's review in Insights.
 */
export function useCitedPagesTable(rows: CitedRow[] | undefined, options: { fileName: string; withHost: boolean; table: string }) {
  const t = useTranslations("sites.citedPages");
  const engineLabel = useEngineLabel();
  const [search, setSearch, term] = useSiteSearch(`${options.table}q`, options.table);
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(`${row.host} ${row.page} ${row.prompts.join(" ")}`));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "times", name: (row) => `${row.host}${row.page}`, table: options.table });
  const pager = useSitePager(rows ? sorted : undefined, { isLoading: rows === undefined, table: options.table });
  const name = (row: CitedRow) => (options.withHost ? `${row.host}${row.page}` : row.page);
  return {
    pager,
    sort: tableSort,
    search: { value: search, onChange: setSearch, placeholder: t("search") },
    download: <ListDownload label={t("download")} fileName={options.fileName} rows={sorted} columns={[{ header: t("columns.page"), value: name }, { header: t("columns.citedBy"), value: (row) => row.engines.map(engineLabel).join(", ") }, { header: t("columns.for"), value: (row) => row.prompts.join(" · ") }, { header: t("columns.times"), value: (row) => row.times }]} />,
    empty: { icon: <Quote className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") },
    columns: [
      { key: "page", header: t("columns.page"), sortable: true, cell: (row: CitedRow) => <a href={row.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="truncate text-[13px] text-foreground hover:underline">{name(row)}</a> },
      { key: "citedBy", header: t("columns.citedBy"), cell: (row: CitedRow) => <span className="text-[12px] text-secondary">{row.engines.map(engineLabel).join(", ")}</span> },
      { key: "for", header: t("columns.for"), cell: (row: CitedRow) => <span className="text-[12px] text-secondary">{row.prompts[0] ?? "–"}{row.prompts.length > 1 ? t("andMore", { count: row.prompts.length - 1 }) : ""}</span> },
      { key: "times", header: t("columns.times"), align: "right" as const, sortable: true, cell: (row: CitedRow) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.times)}</span> },
    ],
  };
}
