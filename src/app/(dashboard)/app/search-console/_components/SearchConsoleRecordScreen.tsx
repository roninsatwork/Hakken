"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, FileText, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { CUT_COLUMN, RecordLinkCell } from "../../sites/_components/SiteCells";
import { SiteTableBar } from "../../sites/_components/SiteTableBar";
import { formatNumber } from "../../sites/_components/siteFormat";
import { countryName } from "./countries";
import { SearchConsoleChart } from "./SearchConsoleChart";
import { SearchConsoleFigures } from "./SearchConsoleFigures";
import { useListProblem, type ExportField } from "./SearchConsoleListTable";
import { NothingOfKind, ResultKindSwitch, SearchConsoleGate, hasFigures } from "./SearchConsoleNotices";
import { readerLanguage } from "./searchConsoleFormat";
import { pageLabel, useLiveAsk, useRecordBack, useRecordHref } from "./searchConsoleRecords";
import {
  SearchConsoleChips,
  SearchConsoleDownload,
  TrackedCount,
  figureColumns,
  trackColumn,
  useSearchConsoleList,
  useSearchConsoleTracking,
  type ChipId,
} from "./SearchConsoleTables";
import { useResultKind, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

const CHIPS: readonly ChipId[] = ["tracked", "band", "country", "device"];

type Split = { key: string; clicks: number; share: number };

/** One of "Where the clicks came from"'s two short tables: its clicks and its share of them. */
function SplitTable({ heading, rows, name }: { heading: string; rows: Split[] | undefined; name: (key: string) => string }) {
  const t = useTranslations("searchConsole");
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] border-b border-border-dim pb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
        <span>{heading}</span>
        <span className="text-right">{t("table.clicks")}</span>
        <span className="text-right">{t("record.share")}</span>
      </div>
      {rows === undefined ? (
        <div className="mt-2 h-16 animate-pulse rounded-lg bg-sidebar/30" aria-busy="true" />
      ) : rows.length === 0 ? (
        <p className="py-2 text-[12px] text-muted">{t("record.noClicks")}</p>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_64px_64px] border-b border-border-dim/50 py-2 text-[13px]">
            <span className="truncate text-foreground">{name(row.key)}</span>
            <span className="text-right font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span>
            <span className="text-right font-mono text-[12px] text-secondary">{Math.round(row.share * 100)}%</span>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * A keyword's or a page's own screen (search-console-plan.md §13.2, drawn as
 * "2 · A page's detail" and "3 · A keyword's detail"): its four figures
 * against the days before, its clicks and impressions day by day beside where
 * they came from — countries and devices — then every page the keyword
 * brought people to, or every keyword that brought people to the page, with
 * the same search, chips, Track ticks and pager as the lists. The days and
 * the places are asked of Google as the screen opens; the table is read from
 * the ready-made periods. A new screen with a way back, never a panel.
 */
export function SearchConsoleRecordScreen({ dimension }: { dimension: "query" | "page" }) {
  const t = useTranslations("searchConsole");
  const tp = useTranslations("searchConsole.places");
  const params = useSearchParams();
  const key = params.get("key") ?? "";
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const host = status?.host ?? "";
  const back = useRecordBack(siteId, dimension === "query" ? "keywords" : "pages", host);
  const recordHref = useRecordHref(siteId);
  const tracking = useSearchConsoleTracking(siteId);
  const isTracked = useQuery(api.searchConsoleTracking.searchConsoleIsTracked, key ? { siteId, kind: dimension, key } : "skip");
  const ready = Boolean(status && hasFigures(status) && key);
  const ask = { siteId, searchType: kind, dimension, key, from: range.from, to: range.to };
  const series = useLiveAsk(api.searchConsoleLists.searchConsoleKeySeries, ready ? ask : null);
  const splits = useLiveAsk(api.searchConsoleLists.searchConsoleKeySplits, ready ? ask : null);
  const days = series.answer === undefined ? undefined : series.answer.ok ? series.answer : { days: [], totals: null, previous: null, previousHeld: false };
  const other = dimension === "query" ? "page" : "query";
  const list = useSearchConsoleList({ dimension: other, within: { kind: dimension, key }, chips: CHIPS });
  const otherSegment = other === "query" ? "keywords/keyword" : "pages/page";
  const label = (value: string) => (other === "page" ? pageLabel(value, host) : value);
  const language = readerLanguage();
  const counts = tracking.counts ? (dimension === "query" ? tracking.counts.keywords : tracking.counts.pages) : null;
  const full = counts !== null && counts.count >= counts.limit && isTracked === false;
  const title = dimension === "query" ? key : pageLabel(key, host);
  const router = useRouter();
  const problem = useListProblem(list);
  const download: { header: string; field: ExportField }[] = [
    { header: t(other === "query" ? "table.keyword" : "table.page"), field: "key" },
    { header: t("table.clicks"), field: "clicks" },
    { header: t("table.impressions"), field: "impressions" },
    { header: `${t("table.ctr")} (%)`, field: "ctr" },
    { header: t("table.position"), field: "position" },
    { header: t(other === "query" ? "table.yourPages" : "table.keywords"), field: "count" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={dimension === "query" ? <Search className="h-5 w-5 text-brand" /> : <FileText className="h-5 w-5 text-brand" />}
        title={title}
        description={t(dimension === "query" ? "record.keywordDescription" : "record.pageDescription")}
        action={
          <div className="flex flex-wrap items-center gap-4">
            {dimension === "page" && /^https?:\/\//.test(key) ? (
              <a href={key} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-secondary hover:text-info">
                {t("record.openPage")}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
            {isTracked === undefined || isTracked === null ? null : (
              <span title={full && counts ? t("track.full", { limit: formatNumber(counts.limit), name: title }) : undefined}>
                <Checkbox
                  label={t(dimension === "query" ? "record.trackKeyword" : "record.trackPage")}
                  checked={isTracked}
                  disabled={full || tracking.busy(dimension, key)}
                  onChange={(next) => tracking.change(dimension, key, next)}
                />
              </span>
            )}
          </div>
        }
      />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {days === undefined ? (
            <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
          ) : days.totals === null ? (
            <NothingOfKind from={range.from} to={range.to} />
          ) : (
            <SearchConsoleFigures totals={days.totals} previous={days.previous} days={range.days} isNew={days.previousHeld && days.previous === null} />
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]">
            <div className="min-w-0">
              {days && days.totals !== null ? (
                <SearchConsoleChart
                  title={t("record.chartTitle")}
                  days={days.days}
                  range={range}
                  held={{ from: status.connection?.oldestDay ?? null, to: status.connection?.newestDay ?? null }}
                  host={host}
                  exportName={`${host}-search-console-${dimension === "query" ? "keyword" : "page"}-${range.from}-to-${range.to}`}
                />
              ) : (
                <div className="h-[340px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
              )}
            </div>
            <section className="flex flex-col gap-4 rounded-2xl border border-border-dim bg-card/40 p-5">
              <div>
                <h2 className="text-[14px] font-medium text-foreground">{t("record.cameFrom")}</h2>
                <p className="mt-0.5 text-[12px] text-secondary">{t(dimension === "query" ? "record.thisKeywordOnly" : "record.thisPageOnly")}</p>
              </div>
              {splits.answer && !splits.answer.ok ? (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-[12px] text-muted">{t(splits.answer.problem === "GOOGLE_BUSY" ? "record.busy" : splits.answer.problem === "NOT_CONNECTED" ? "record.notConnected" : "record.refused")}</p>
                  {splits.answer.problem === "GOOGLE_BUSY" ? <Button variant="quiet" onClick={splits.retry}>{t("record.tryAgain")}</Button> : null}
                </div>
              ) : (
                <>
                  <SplitTable heading={t("table.country")} rows={splits.answer?.countries} name={(code) => countryName(code, language) ?? tp("unknownCountry")} />
                  <SplitTable heading={t("table.device")} rows={splits.answer?.devices} name={(device) => tp(`deviceNames.${device}`)} />
                </>
              )}
            </section>
          </div>
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-foreground">{t(dimension === "query" ? "record.pagesFor" : "record.keywordsFor")}</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-secondary">
                {dimension === "page" && days?.totals && list.table.named !== null
                  ? t("record.namedFor", { named: formatNumber(list.table.named), clicks: formatNumber(days.totals.clicks) })
                  : t(dimension === "query" ? "record.pagesHint" : "record.keywordsHint")}
              </p>
            </div>
            {list.preparing ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : null}
            <DataTable
              rows={list.table.pageRows}
              rowKey={(row) => row.key}
              onRowClick={(row) => router.push(recordHref(otherSegment, row.key))}
              minWidthClassName="min-w-[760px]"
              search={{ value: list.search, onChange: list.setSearch, placeholder: t(other === "query" ? "keywords.searchPlaceholder" : "pages.searchPlaceholder") }}
              filters={<SearchConsoleChips chips={CHIPS} />}
              cardHeader={
                <SiteTableBar
                  footer={list.table.footer}
                  noun={other === "query" ? "keywords" : "pages"}
                  actions={list.live ? undefined : <SearchConsoleDownload ask={list.download} headers={download.map((entry) => entry.header)} fields={download.map((entry) => entry.field)} />}
                >
                  <TrackedCount tracking={tracking} kind={other} wording={other === "query" ? "keywordsOnSite" : "pagesOnSite"} />
                  {list.live ? <span className="text-[12px] text-secondary">{t("table.asked")}</span> : null}
                </SiteTableBar>
              }
              sort={list.order.tableSort}
              rowClassName={(row) => (row.tracked ? "bg-brand/5" : "")}
              empty={{
                icon: other === "query" ? <Search className="h-8 w-8 text-muted/30" /> : <FileText className="h-8 w-8 text-muted/30" />,
                label: problem ?? (list.filtered ? t("table.noMatch") : t("table.empty")),
              }}
              footer={list.table.footer}
              columns={[
                trackColumn(t, tracking, other, (row) => label(row.key)),
                {
                  key: "key",
                  header: t(other === "query" ? "table.keyword" : "table.page"),
                  sortable: true,
                  className: CUT_COLUMN.first,
                  cell: (row) => <RecordLinkCell cut href={recordHref(otherSegment, row.key)}>{label(row.key)}</RecordLinkCell>,
                },
                ...figureColumns(t, ["clicks", "impressions", "ctr", "position"]),
                {
                  key: "count",
                  header: t(other === "query" ? "table.yourPages" : "table.keywords"),
                  align: "right",
                  sortable: true,
                  cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.count === null ? "–" : formatNumber(row.count)}</span>,
                },
              ]}
            />
            {list.table.problem === "GOOGLE_BUSY" ? (
              <div>
                <Button variant="quiet" onClick={list.retry}>{t("record.tryAgain")}</Button>
              </div>
            ) : null}
          </section>
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
