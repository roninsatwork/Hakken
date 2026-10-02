"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, FileText, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { CUT_COLUMN, RecordLinkCell } from "../../sites/_components/SiteCells";
import { SiteTableBar } from "../../sites/_components/SiteTableBar";
import { formatNumber } from "../../sites/_components/siteFormat";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { SearchConsoleChart } from "./SearchConsoleChart";
import { SearchConsoleFigures } from "./SearchConsoleFigures";
import { NothingOfKind, ResultKindSwitch, SearchConsoleGate, hasFigures } from "./SearchConsoleNotices";
import { formatPosition, formatRate } from "./searchConsoleFormat";
import { pageLabel, useLiveAsk, usePairing, useRecordBack, useRecordHref } from "./searchConsoleRecords";
import { useResultKind, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

type Pair = { key: string; clicks: number; impressions: number; ctr: number; position: number };

const PAIR_SORTS: SiteSortColumns<Pair, "key" | "clicks" | "impressions" | "ctr" | "position"> = {
  key: { value: (row) => row.key, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
};
const keyOf = (row: Pair) => row.key;

/**
 * One search's or one page's own screen (docs/plans/active/
 * search-console-plan.md §5.2–5.3): its figures for the dates chosen against
 * the days before, its days on a chart, and what Google showed with it — the
 * pages for a search, the searches for a page — asked of Google as the screen
 * opens. A new screen with a way back to the list as it was left, never a
 * panel (Sites: screens, never modals).
 */
export function SearchConsoleRecordScreen({ dimension }: { dimension: "query" | "page" }) {
  const t = useTranslations("searchConsole");
  const router = useRouter();
  const params = useSearchParams();
  const key = params.get("key") ?? "";
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const back = useRecordBack(siteId, dimension === "query" ? "searches" : "pages");
  const recordHref = useRecordHref(siteId);
  const ready = Boolean(status && hasFigures(status) && key);
  const ask = { siteId, searchType: kind, dimension, key, from: range.from, to: range.to };
  const series = useLiveAsk(api.searchConsoleLists.searchConsoleKeySeries, ready ? ask : null);
  const days = series.answer === undefined ? undefined : series.answer.ok ? series.answer : { days: [], totals: null, previous: null, previousHeld: false };
  const { answer, retry } = usePairing(ready ? ask : null);
  const pairs = answer === undefined ? undefined : answer.ok ? answer.rows : [];
  const { rows: sorted, tableSort } = useSiteSortedList(pairs, PAIR_SORTS, { opening: "clicks", name: keyOf, table: "pairs" });
  const paged = useSitePager(sorted, { isLoading: answer === undefined, table: "pairs", cut: answer?.ok ? answer.cut : null });
  const host = status?.host ?? "";
  const other = dimension === "query" ? "pages/page" : "searches/search";
  const problem = answer && !answer.ok
    ? t(answer.problem === "NOT_CONNECTED" ? "record.notConnected" : answer.problem === "GOOGLE_BUSY" ? "record.busy" : "record.refused")
    : null;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={dimension === "query" ? <Search className="h-5 w-5 text-brand" /> : <FileText className="h-5 w-5 text-brand" />}
        title={dimension === "query" ? key : pageLabel(key, host)}
        description={t(dimension === "query" ? "record.searchDescription" : "record.pageDescription")}
        action={
          dimension === "query" ? (
            <Link href={`/app/sites/${siteId}/keywords/keyword?keyword=${encodeURIComponent(key)}`} className="text-[13px] text-info hover:underline">
              {t("record.openInSites")} →
            </Link>
          ) : /^https?:\/\//.test(key) ? (
            <a href={key} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-info hover:underline">
              {t("record.openPage")}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null
        }
      />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {days === undefined ? (
            <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
          ) : days.totals === null ? (
            <NothingOfKind from={range.from} to={range.to} />
          ) : (
            <>
              <SearchConsoleFigures totals={days.totals} previous={days.previous} days={range.days} isNew={days.previousHeld && days.previous === null} />
              <SearchConsoleChart
                title={t(dimension === "query" ? "chart.searchTitle" : "chart.pageTitle")}
                days={days.days}
                range={range}
                held={{ from: status.connection?.oldestDay ?? null, to: status.connection?.newestDay ?? null }}
                host={host}
                exportName={`${host}-search-console-${dimension === "query" ? "search" : "page"}-${range.from}-to-${range.to}`}
              />
            </>
          )}
          <DataTable
            rows={paged.pageRows}
            rowKey={(row) => row.key}
            onRowClick={(row) => router.push(recordHref(other, row.key))}
            minWidthClassName="min-w-[680px]"
            cardHeader={
              <SiteTableBar
                footer={paged.footer}
                noun={dimension === "query" ? "pages" : "searches"}
                title={t(dimension === "query" ? "record.pagesFor" : "record.searchesFor")}
                description={t("record.asked")}
              />
            }
            sort={tableSort}
            empty={{
              icon: dimension === "query" ? <FileText className="h-8 w-8 text-muted/30" /> : <Search className="h-8 w-8 text-muted/30" />,
              label: answer === undefined ? t("record.asking") : problem ?? t("record.noneNamed"),
            }}
            footer={paged.footer}
            columns={[
              {
                key: "key",
                header: t(dimension === "query" ? "table.page" : "table.search"),
                sortable: true,
                className: CUT_COLUMN.first,
                cell: (row) => (
                  <RecordLinkCell cut href={recordHref(other, row.key)} className={dimension === "query" ? "text-[13px] text-info" : undefined}>
                    {dimension === "query" ? pageLabel(row.key, host) : row.key}
                  </RecordLinkCell>
                ),
              },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "impressions", header: t("table.impressions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
              { key: "ctr", header: t("table.ctr"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.ctr)}</span> },
              { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatPosition(row.position)}</span> },
            ]}
          />
          {answer && !answer.ok && answer.problem === "GOOGLE_BUSY" ? (
            <div>
              <Button variant="quiet" onClick={retry}>{t("record.tryAgain")}</Button>
            </div>
          ) : null}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
