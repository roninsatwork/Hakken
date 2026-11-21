"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { FileSearch } from "lucide-react";
import { indexingSees } from "@/convex/utils/sees/searchConsoleScreens";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { GoogleCutLine } from "../../_components/GoogleCutLine";
import { IndexingBoxes, IndexingDaysCard, IndexingProgress, tableIcon, useIndexing, useReasonColumns, useReasonNames, useReasonsTable } from "../../_components/IndexingParts";
import type { IndexingRow } from "../../_components/indexingSees";
import { indexingEyeData, indexingScreenOf } from "@/convex/utils/sees/eyeData/searchConsoleIndexing";
import { wordsReader } from "@/convex/utils/sees/eyeData/searchConsoleWords";
import { LiveProblem, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

/**
 * Search Console → Indexing, as Anthony chose it on 18 November 2026: the canvas's V1, made generic ("we are building a
 * generic platform") and working only from problems ("work from issues, not what is day to day normal";
 * search-console-indexing-v1-plan-2026-11-18.md). Which of the website's pages are in Google, and why some aren't:
 * four boxes worked out from whichever of Google's reasons the website has; how far the page checks have got, with the
 * way to Google's own report; when Google last visited the pages each reason holds; and every reason, in Google's own
 * words, each opening a page of its own. Google gives apps no Page indexing totals, so every figure counts the pages
 * the collector has checked (`searchConsolePageChecks.ts`). The clicks follow the dates and the country chosen.
 */
export default function SearchConsoleIndexingPage() {
  const t = useTranslations("searchConsole.indexing");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const host = status?.host ?? "";
  const namesOf = useReasonNames();
  const indexing = useIndexing();
  const { answer, figures } = indexing;
  const { rows, boxes } = useMemo(() => indexingScreenOf(answer, figures, namesOf), [answer, figures, namesOf]);
  // What Hakken sees: the boxes, every reason, the pages that still get clicks and the sitemap's pages Google won't show,
  // built by the same function a chat app's question builds them with (chatAppEyes/searchConsole.ts).
  const seesData = useMemo(() => indexingEyeData({ rows, boxes, answer, clickedPages: figures?.clickedPages }, wordsReader(t)), [rows, boxes, answer, figures, t]);
  const seen = rows && answer ? indexingSees(rows.map((row) => ({ name: row.name, slug: row.slug, pages: row.pages })), answer.checks) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<FileSearch className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <SearchConsoleSees screen="indexing" seen={range.period === "custom" ? null : seen} data={seesData} />
          {boxes ? <IndexingBoxes boxes={boxes} loadingClicks={indexing.waiting} /> : <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}
          {answer ? <IndexingProgress checks={answer.checks} on={answer.on} report={answer.report} /> : null}
          {indexing.problem ? <LiveProblem problem={indexing.problem} retry={indexing.retry} /> : null}
          {answer && rows ? <IndexingDaysCard rows={rows} days={answer.days} host={host} checks={answer.checks} /> : null}
          <ReasonsTable rows={rows} host={host} cut={indexing.cut} />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}

/**
 * Why pages aren't indexed (the plan's item 5), lean (AGENTS.md "Tables are lean"): Reason, Source, Pages, Clicks, Shown
 * and Crawled, one line a row, the most pages first, with its search, numbered pages and download.
 */
function ReasonsTable({ rows, host, cut }: { rows: readonly IndexingRow[] | undefined; host: string; cut: number | null }) {
  const t = useTranslations("searchConsole.indexing.table");
  const table = useReasonsTable(rows);
  const pages = useSitePager(table.ordered, { isLoading: rows === undefined });
  const { columns, download } = useReasonColumns();
  return (
    <DataTable
      rows={pages.pageRows}
      rowKey={(row) => row.key}
      search={{ value: table.search, onChange: table.setSearch, placeholder: t("search") }}
      cardHeader={
        <TableBar
          footer={pages.footer}
          noun="results"
          title={t("title")}
          // Under the title, as a table with a title says it: Google's pages cut at its most an ask.
          {...(cut ? { description: <GoogleCutLine most={cut} noun="pages" /> } : {})}
          actions={<ListDownload label={t("download")} fileName={`${host}-indexing`} rows={table.ordered} columns={download} />}
        />
      }
      sort={table.tableSort}
      empty={{ icon: tableIcon, label: table.term ? t("noMatch") : t("empty") }}
      footer={pages.footer}
      columns={columns}
    />
  );
}
