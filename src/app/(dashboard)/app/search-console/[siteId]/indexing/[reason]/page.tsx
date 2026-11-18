"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileSearch } from "lucide-react";
import { kindOf, wordsOfSlug } from "@/convex/utils/indexingReasons";
import { byOwnPage, reasonBoxes, reasonPages } from "@/convex/utils/indexingFigures";
import { reasonSees } from "@/convex/utils/sees/searchConsoleScreens";
import { ukDay } from "@/convex/utils/calendarPeriods";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import type { ReasonKind } from "@/convex/utils/indexingReasons";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { ListDownload } from "../../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../../sites/_components/useSitePagedTable";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { GoogleCutLine } from "../../../_components/GoogleCutLine";
import { ReasonBoxes, ShownEachDayCard, tableIcon, useExampleColumns, useExamplesTable, useIndexingReason, useReasonNames, type ExampleRow } from "../../../_components/IndexingParts";
import { pageNameOf, reasonPageData, titleCounts } from "../../../_components/indexingSees";
import { LiveProblem, SearchConsoleGate } from "../../../_components/SearchConsoleNotices";
import { SearchConsoleSees } from "../../../_components/SearchConsoleSees";
import { useSearchConsoleHref, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../../_components/useSearchConsole";

/**
 * One of Google's reasons for pages not in Google, on a page of its own (search-console-indexing-v1-plan-2026-11-18.md,
 * "A reason's own page"; the canvas's V1Detail, V1Redirect, V1NotFound, V1Noindex and V1Crawled): the reason in
 * Google's words as the title and one plain line under it; the four boxes that matter for its kind; how often Google
 * showed its pages each day; and its pages. A reason with no pages yet says so in one line.
 */
export default function SearchConsoleIndexingReasonPage() {
  const t = useTranslations("searchConsole.indexing");
  const params = useParams<{ reason: string }>();
  const words = wordsOfSlug(params.reason ?? "");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const hrefOf = useSearchConsoleHref(siteId);
  const host = status?.host ?? "";
  const nameOf = useReasonNames();
  const names = useMemo(() => nameOf(words), [nameOf, words]);
  const kind = kindOf(words);
  const reason = useIndexingReason(words);
  const { answer, figures, shown, days } = reason;
  const folded = useMemo(() => (figures ? byOwnPage(figures.byPage, figures.clicks, figures.impressions) : null), [figures]);
  const pages = useMemo(() => {
    if (!answer) return undefined;
    // Whether the page Google shows in each one's place is in Google, as the checks found it.
    const indexedMains = new Set(answer.pages.filter((page) => page.mainIndexed).map((page) => page.page));
    return reasonPages(answer.pages, folded, () => false).map((page) => ({ ...page, mainIndexed: page.main !== null && indexedMains.has(page.page) }));
  }, [answer, folded]);
  const boxes = useMemo(() => (pages && answer ? reasonBoxes(kind, pages, { checked: answer.checks?.checked ?? 0, allClicks: figures?.clicks ?? 0, month: `${ukDay().slice(0, 7)}-01`, shown }) : null), [kind, pages, answer, figures, shown]);
  const rows = useMemo<ExampleRow[] | undefined>(() => {
    if (!pages) return undefined;
    const titles = titleCounts(pages);
    return pages.map((page) => ({
      ...page,
      key: page.page,
      name: pageNameOf(page, titles, t("reason.table.home")),
      lastShown: shown?.get(page.page)?.lastShown ?? null,
      daysShown: shown ? (shown.get(page.page)?.days ?? 0) : null,
    }));
  }, [pages, shown, t]);
  const seesData = useMemo(() => (rows && boxes && rows.length > 0
    ? reasonPageData({ reason: { ...names, kind }, pages: rows, boxes, nameOf: (page) => rows.find((row) => row.page === page.page)?.name ?? page.page, names: { pages: t("reason.boxes.pages") } })
    : undefined), [rows, boxes, names, kind, t]);
  const seen = rows ? reasonSees(names.name, rows.length, rows.filter((row) => row.clicks > 0).length) : null;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader back={{ label: t("reason.back"), href: hrefOf("indexing") }} icon={<FileSearch className="h-5 w-5 text-brand" />} title={names.name} description={names.means || undefined} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <SearchConsoleSees screen="indexing" eye="indexingReason" seen={range.period === "custom" ? null : seen} data={seesData} />
          {reason.problem ? <LiveProblem problem={reason.problem} retry={reason.retry} /> : null}
          {rows && rows.length > 0 && boxes ? (
            <>
              <ReasonBoxes boxes={boxes} />
              <ShownEachDayCard days={days?.days ?? []} from={days?.from ?? null} count={rows.length} host={host} loading={reason.daysLoading} />
            </>
          ) : null}
          <ExamplesTable kind={kind} rows={rows} checked={answer?.checks?.checked ?? 0} kept={{ days: days?.kept ?? 0, from: days?.from ?? null }} host={host} cut={reason.cut} />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}

/**
 * Examples (the plan's item 4), lean (AGENTS.md "Tables are lean"): Page, then the columns that fit the kind, Clicks and
 * Shown, one line a row, the most impressions first, with its search, numbered pages and download. A reason with no
 * pages yet says so in its one line.
 */
function ExamplesTable({ kind, rows, checked, kept, host, cut }: {
  kind: ReasonKind;
  rows: readonly ExampleRow[] | undefined;
  checked: number;
  kept: { days: number; from: string | null };
  host: string;
  /** Asked of Google, the dates' pages stopped at Google's most an ask: said under the title. */
  cut: number | null;
}) {
  const t = useTranslations("searchConsole.indexing.reason.table");
  const tt = useTranslations("searchConsole.indexing.table");
  const table = useExamplesTable(rows);
  const pages = useSitePager(table.ordered, { isLoading: rows === undefined });
  const { columns, download } = useExampleColumns(kind, kept);
  return (
    <DataTable
      rows={pages.pageRows}
      rowKey={(row) => row.key}
      search={{ value: table.search, onChange: table.setSearch, placeholder: t("search") }}
      cardHeader={
        <TableBar
          footer={pages.footer}
          noun="pages"
          title={t("title")}
          {...(cut ? { description: <GoogleCutLine most={cut} noun="pages" /> } : {})}
          actions={<ListDownload label={tt("download")} fileName={`${host}-indexing`} rows={table.ordered} columns={download} />}
        />
      }
      sort={table.tableSort}
      empty={{ icon: tableIcon, label: table.term ? t("noMatch") : t("empty", { checked: formatNumber(checked) }) }}
      footer={pages.footer}
      columns={columns}
    />
  );
}
