"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, FileText, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber } from "../../sites/_components/siteFormat";
import { KeywordPagesBands } from "./KeywordRecordParts";
import { keywordBands } from "./keywordSees";
import { PerformanceDaysCard } from "./PerformanceParts";
import { SearchConsoleFigures } from "./SearchConsoleFigures";
import { useListProblem, type ExportField } from "./SearchConsoleListTable";
import { NothingOfKind, ResultKindSwitch, SearchConsoleGate, hasFigures, canRetry } from "./SearchConsoleNotices";
import { pageLabel, useLiveAsk, useRecordBack, useRecordHref } from "./searchConsoleRecords";
import {
  SearchConsoleChips,
  SearchConsoleListDownload,
  figureColumns,
  keywordColumn,
  pageColumn,
  useSearchConsoleList,
  useSearchConsoleTracking,
  type ChipId,
  type ListRow,
} from "./SearchConsoleTables";
import {
  countryArg,
  isReadyMade,
  useResultKind,
  useSearchConsoleCountry,
  periodArg, useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
} from "./useSearchConsole";
import { SearchConsoleSees } from "./SearchConsoleSees";
import { recordSees } from "@/convex/utils/sees/searchConsoleScreens";

const CHIPS: readonly ChipId[] = ["tracked", "band", "device"];


/**
 * A keyword's or a page's own screen (search-console-plan.md §13.2, drawn as
 * "2 · A page's detail" and "3 · A keyword's detail"): its four figures
 * against the days before, its clicks and impressions day by day beside where
 * they came from — countries and devices — then every page the keyword
 * brought people to, or every keyword that brought people to the page, with
 * the same search, chips, Track ticks and pager as the lists. The days and
 * the places are asked of Google as the screen opens; the table is read from
 * the ready-made periods. All in the country chosen for the page, except
 * where the clicks came from by country — every country, always (§16). A new
 * screen with a way back, never a panel.
 *
 * A keyword's own screen is Way 2 (search-console-keyword-screen-way-2-plan-2026-11-17.md): Performance's day chart,
 * full width, the bands of which page Google shows and which gets clicked, and the lean table (AGENTS.md "Tables are
 * lean"). Where the clicks came from is gone from it, so its countries and devices aren't asked. A page's own screen is
 * the same, turned round (Anthony, 17 November 2026: "just build it"): the bands of which keywords Google shows the page
 * for and which get clicked, and its keywords in the lean table.
 */
export function SearchConsoleRecordScreen({ dimension }: { dimension: "query" | "page" }) {
  const t = useTranslations("searchConsole");
  const ts = useTranslations("searchConsole.performance.squares");
  const isKeyword = dimension === "query";
  const params = useSearchParams();
  const key = params.get("key") ?? "";
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const host = status?.host ?? "";
  const back = useRecordBack(siteId, dimension === "query" ? "keywords" : "pages", host);
  const recordHref = useRecordHref(siteId);
  const tracking = useSearchConsoleTracking(siteId);
  const isTracked = useQuery(api.searchConsoleTracking.searchConsoleIsTracked, key ? { siteId, kind: dimension, key } : "skip");
  // A page's title, kept once on the website's page list (google-analytics-plan.md GA27).
  const pageTitle = useQuery(api.pageTitles.pageTitle, key && dimension === "page" ? { siteId, page: key } : "skip");
  const ready = Boolean(status && hasFigures(status) && key);
  // The country chosen narrows the days.
  const ask = { siteId, searchType: kind, dimension, key, from: range.from, to: range.to, ...countryArg(country) };
  const series = useLiveAsk(api.searchConsoleLists.searchConsoleKeySeries, ready ? { ...ask, ...periodArg(range) } : null);
  const answered = series.answer;
  const days = useMemo(() => (answered === undefined ? undefined : answered.ok ? answered : { days: [], totals: null, previous: null, previousHeld: false }), [answered]);
  const other = dimension === "query" ? "page" : "query";
  const list = useSearchConsoleList({ dimension: other, within: { kind: dimension, key }, chips: CHIPS });
  const otherSegment = other === "query" ? "keywords/keyword" : "pages/page";
  const counts = tracking.counts ? (dimension === "query" ? tracking.counts.keywords : tracking.counts.pages) : null;
  const full = counts !== null && counts.count >= counts.limit && isTracked === false;
  const title = dimension === "query" ? key : pageLabel(key, host);
  const router = useRouter();
  const problem = useListProblem(list);
  // The eye's own figures for this search or page (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6): the
  // whole website's click rate at each place on Google and its clicks by device, from the ready-made period, so the
  // record is set against its own website; every row named as the screen names it.
  const tw = useTranslations("searchConsole.sees");
  const readyMade = ready && isReadyMade(range, status?.connection?.newestDay);
  const websiteAsk = { siteId, searchType: kind, from: range.from, to: range.to, ...countryArg(country) };
  const curve = useQuery(api.searchConsoleChanges.searchConsoleCurve, readyMade ? websiteAsk : "skip");
  const rowsShown = list.table.pageRows ?? null;
  // The bands: every page Google answered for the keyword, or every keyword for the page, before the table's search and chips.
  const allRows = list.allLiveRows;
  const bands = useMemo(() => (allRows ? keywordBands(allRows, (row) => (isKeyword ? pageLabel(row, host) : row), (count) => ts("others", { count })) : allRows), [allRows, isKeyword, host, ts]);
  const seesData = useMemo(() => {
    if (!days) return undefined;
    return {
      name: title,
      [dimension === "query" ? "keyword" : "page"]: key,
      figures: days,
      ...(bands ? { bands } : {}),
      rows: rowsShown ? rowsShown.map((row) => ({ ...row, name: other === "page" ? pageLabel(row.key, host) : row.key })) : null,
      picked: true,
      website: {
        curve: curve && !curve.live ? curve.points.map((point) => ({ ...point, name: tw("websiteAtPlace", { place: point.position }) })) : null,
      },
    };
  }, [days, title, dimension, key, bands, rowsShown, other, host, curve, tw]);
  // "Do first" may open the row the eye names: a page splitting this search, or this page's search that moved most.
  const seesLinks = useMemo(() => (rowsShown ?? []).slice(0, 3).map((row) => ({ label: other === "page" ? pageLabel(row.key, host) : row.key, href: recordHref(otherSegment, row.key) })), [rowsShown, other, host, recordHref, otherSegment]);
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
        description={dimension === "query" ? t("record.keywordDescription") : pageTitle ? t("record.pageDescriptionTitled", { title: pageTitle }) : t("record.pageDescription")}
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
          <SearchConsoleSees screen="record" eye={dimension === "query" ? "keyword" : "page"} seen={days && range.period !== "custom" ? recordSees(title, days.totals, days.previous, range.period) : null}
            data={seesData}
            links={seesLinks}
          />
          <ResultKindSwitch />
          {/* A page's figures are every country's and its keywords the home country's: the table's line says so. */}
          {days === undefined ? (
            <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
          ) : days.totals === null ? (
            <NothingOfKind from={range.from} to={range.to} />
          ) : (
            <SearchConsoleFigures totals={days.totals} previous={days.previous} days={range.days} isNew={days.previousHeld && days.previous === null} />
          )}
          {days && days.totals !== null ? (
            <PerformanceDaysCard
              figures={{ days: days.days, daysBefore: days.daysBefore ?? [], totals: days.totals, previous: days.previous, named: null }}
              host={host}
              heldFrom={status.connection ? status.historyFrom : null}
              exportName={`${host}-search-console-${isKeyword ? "keyword" : "page"}-${range.from}-to-${range.to}`}
            />
          ) : (
            <div className="h-[340px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
          )}
          <KeywordPagesBands bands={bands} host={host} of={isKeyword ? "pages" : "keywords"} />
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
            {list.noSearches ? <p className="text-[12px] text-muted">{t("table.noSearches", { kind })}</p> : null}
            <DataTable
              rows={list.table.pageRows}
              rowKey={(row) => row.key}
              onRowClick={(row) => router.push(recordHref(otherSegment, row.key))}
              search={{ value: list.search, onChange: list.setSearch, placeholder: t(other === "query" ? "keywords.searchPlaceholder" : "pages.searchPlaceholder") }}
              filters={<SearchConsoleChips chips={CHIPS} />}
              cardHeader={
                <TableBar
                  footer={list.table.footer}
                  noun={other === "query" ? "keywords" : "pages"}
                  actions={<SearchConsoleListDownload list={list} download={download} />}
                >
                  {/* No Track column: a page or a keyword is tracked on its own screen. */}
                  {list.live ? <span className="text-[12px] text-secondary">{t("table.asked")}</span> : null}
                </TableBar>
              }
              sort={list.order.tableSort}
              rowClassName={(row) => (row.tracked ? "bg-brand/5" : "")}
              empty={{
                icon: other === "query" ? <Search className="h-8 w-8 text-muted/30" /> : <FileText className="h-8 w-8 text-muted/30" />,
                label: problem ?? (list.filtered ? t("table.noMatch") : t("table.empty")),
              }}
              footer={list.table.footer}
              // The lean table: the name and five figures, one line a row (AGENTS.md "Tables are lean").
              columns={[
                isKeyword ? pageColumn<ListRow>(t("table.page"), host, recordHref) : keywordColumn<ListRow>(t("table.keyword"), recordHref),
                ...figureColumns(t, ["clicks", "change", "impressions", "ctr", "position"]),
              ]}
            />
            {canRetry(list.table.problem) ? (
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
