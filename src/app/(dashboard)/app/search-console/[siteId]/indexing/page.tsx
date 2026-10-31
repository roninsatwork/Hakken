"use client";

import Link from "next/link";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FileSearch } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { indexingSees } from "@/convex/utils/sees/searchConsoleScreens";
import { formatDay, formatNumber } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

/** A page Google read within this many days of the check counts as read this month. */
const THIS_MONTH = 30;

/**
 * Indexing (docs/plans/active/insights-analyst-plan.md §4.4, phase 8, drawn
 * as the ScIndexing board): whether Google has indexed each page that brings
 * enquiries, and when it last read it — Search Console's URL inspection,
 * asked once a week for the website's money pages. Insights' Technical SEO
 * specialist reads the same check.
 */
type IndexRow = { page: string; indexed: { verdict: string; lastRead: string | null } | null };
/** Its sortable columns (sites-table-sorting-plan.md): the page A to Z, not indexed first, and the page Google read longest ago first. */
const SORTS: SiteSortColumns<IndexRow, "page" | "indexed" | "lastRead"> = {
  page: { value: (row) => row.page, first: "asc" },
  indexed: { value: (row) => (row.indexed ? (row.indexed.verdict === "PASS" ? 1 : 0) : null), first: "asc" },
  lastRead: { value: (row) => row.indexed?.lastRead ?? null, first: "asc" },
};

export default function SearchConsoleIndexingPage() {
  const t = useTranslations("searchConsole.indexing");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const data = useQuery(api.moneyPageChecks.siteMoneyPages, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = data?.pages.filter((row) => !matches || matches(row.page));
  const { rows, tableSort } = useSiteSortedList(matching, SORTS, { opening: "lastRead", openingDirection: "asc", name: (row) => row.page });
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined });
  const host = status?.host ?? "";
  const checkedDay = data?.checkedAt ? new Date(data.checkedAt).toISOString().slice(0, 10) : null;
  const inspected = data?.pages.filter((row) => row.indexed) ?? [];
  const indexed = inspected.filter((row) => row.indexed?.verdict === "PASS");
  const missing = inspected.filter((row) => row.indexed?.verdict !== "PASS");
  const daysAgo = (day: string) => (checkedDay ? Math.round((Date.parse(checkedDay) - Date.parse(day)) / 86_400_000) : 0);
  const readThisMonth = inspected.filter((row) => row.indexed?.lastRead && daysAgo(row.indexed.lastRead) <= THIS_MONTH).length;
  const whyNot = (row: (typeof inspected)[number]) => (row.indexed?.verdict === "PASS" ? (row.indexed.otherCanonical ? t("otherCanonical") : "–") : row.indexed?.coverage ?? t("unknown"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<FileSearch className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <SearchConsoleSees screen="indexing" seen={data ? indexingSees(data.pages.map((row) => ({ page: row.page, verdict: row.indexed?.verdict ?? null, lastRead: row.indexed?.lastRead ?? null })), checkedDay) : null} data={data} />
          <FigureRow>
            <Figure label={t("figures.indexed")} value={inspected.length > 0 ? t("of", { a: indexed.length, b: inspected.length }) : "–"} detail={<span className="text-secondary">{t("figures.indexedDetail")}</span>} />
            <Figure label={t("figures.readThisMonth")} value={inspected.length > 0 ? formatNumber(readThisMonth) : "–"} detail={<span className="text-secondary">{t("figures.readThisMonthDetail")}</span>} />
            <Figure label={t("figures.notIndexed")} value={inspected.length > 0 ? formatNumber(missing.length) : "–"} detail={<span className="text-secondary">{missing[0] ? missing[0].page : t("figures.noneMissing")}</span>} />
            <Figure label={t("figures.checked")} value={formatNumber(data?.pages.length ?? 0)} detail={<span className="text-secondary">{checkedDay ? t("figures.checkedOn", { day: formatDay(checkedDay) }) : t("figures.notYet")}</span>} />
          </FigureRow>
          <DataTable
            rows={pages.pageRows}
            rowKey={(row) => row.page}
            search={{ value: search, onChange: setSearch, placeholder: t("search") }}
            cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: rows?.length ?? 0 })} actions={<ListDownload label={t("download")} fileName={`${host}-indexing`} rows={rows} columns={[{ header: t("columns.page"), value: (row) => row.page }, { header: t("columns.indexed"), value: (row) => (row.indexed ? t(row.indexed.verdict === "PASS" ? "indexed" : "notIndexed") : "") }, { header: t("columns.lastRead"), value: (row) => row.indexed?.lastRead ?? "" }, { header: t("columns.why"), value: whyNot }]} />} />}
            empty={{ icon: <FileSearch className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
            footer={pages.footer}
            sort={tableSort}
            columns={[
              // A page by its title over its address (I41).
              { key: "page", header: t("columns.page"), sortable: true, cell: (row) => <span className="flex min-w-0 flex-col">{row.title ? <span className="truncate text-[13px] text-foreground">{row.title.split("|")[0].trim()}</span> : null}<span className="truncate text-[12px] text-secondary">{row.page}</span></span> },
              { key: "indexed", header: t("columns.indexed"), sortable: true, cell: (row) => (row.indexed ? <StatusLabel tone={row.indexed.verdict === "PASS" ? "success" : "warning"}>{t(row.indexed.verdict === "PASS" ? "indexed" : "notIndexed")}</StatusLabel> : <StatusLabel tone="neutral">{t("notAsked")}</StatusLabel>) },
              { key: "lastRead", header: t("columns.lastRead"), sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.indexed?.lastRead ? formatDay(row.indexed.lastRead) : "–"}</span> },
              { key: "why", header: t("columns.why"), cell: (row) => <span className="text-[12px] text-secondary">{whyNot(row)}</span> },
            ]}
          />
          <Link href="/app/insights/findings" className="w-fit text-[13px] text-secondary hover:text-foreground">{t("seeInsights")}</Link>
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
