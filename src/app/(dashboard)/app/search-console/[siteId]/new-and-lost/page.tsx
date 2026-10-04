"use client";

import { useRouter } from "next/navigation";
import { useConvex } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { BANDS } from "@/convex/utils/searchConsoleViews";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SITE_SERIES_COLOURS } from "../../../sites/_components/SiteCharts";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { SiteGainLossChart } from "../../../sites/_components/SiteGainLossChart";
import { datedRow } from "../../../sites/_components/datedRows";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatDay, formatMonth, formatNumber, formatShortDay, toCsv } from "../../../sites/_components/siteFormat";
import { useSiteListPage } from "../../../sites/_components/useSitePagedTable";
import { SITE_ROW_CHOICES } from "../../../sites/_components/siteTableRows";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSort } from "../../../sites/_components/useSiteSort";
import { SearchConsoleChartCard, useSeriesTicks } from "../../_components/SearchConsoleChartCard";
import { CountryNotReady, ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { filePosition, formatPosition } from "../../_components/searchConsoleFormat";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { countryArg, useResultKind, useSearchConsoleCountry, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

const FIRSTS = { key: "asc", status: "asc", when: "desc", clicks: "desc", impressions: "desc", position: "asc" } as const;

type NewLostAsk = Omit<FunctionArgs<typeof api.searchConsoleChanges.searchConsoleNewLost>, "page" | "rows">;
type NewLostRow = FunctionReturnType<typeof api.searchConsoleChanges.searchConsoleNewLost>["rows"][number];

/** The most rows a page of the list holds: the download reads it in pages this size. */
const DOWNLOAD_PAGE_ROWS = Math.max(...SITE_ROW_CHOICES);

/**
 * New and lost (search-console-plan.md §13.3, drawn as "6 · New and lost"):
 * keywords Google started showing the website for in the dates chosen, and
 * keywords it stopped showing it for — lost when 14 days pass without one —
 * newest first, and both in each day, week or month of the dates chosen. Web results only — the register of when each
 * keyword and page was first and last shown is kept for them — so the page
 * has no kind-of-result switch.
 *
 * In the country chosen when the website keeps it ready (search-console-plan.md
 * §16). The register is built collection by collection, so Google cannot be
 * asked for any other country: the page says to add it on the Market page.
 */
export default function SearchConsoleNewLostPage() {
  const t = useTranslations("searchConsole");
  const router = useRouter();
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [country] = useSearchConsoleCountry();
  const [search, setSearch, term] = useSiteSearch();
  const [what, setWhat] = useSiteParam<"" | "new" | "lost">("what", "", ["", "new", "lost"]);
  const [band, setBand] = useSiteParam<string>("band", "", ["", ...BANDS]);
  const order = useSiteSort<keyof typeof FIRSTS>(FIRSTS, "when");
  const recordHref = useRecordHref(siteId);
  const held = Boolean(status?.connection?.newestDay);
  // The list on screen: the table's ask, and the download's.
  const ask: NewLostAsk | null = held
    ? {
      siteId,
      searchType: kind,
      from: range.from,
      to: range.to,
      step: range.step,
      ...countryArg(country),
      ...(term ? { q: term } : {}),
      ...(what ? { what } : {}),
      ...(band ? { band: band as (typeof BANDS)[number] } : {}),
      sort: order.key,
      direction: order.direction,
    }
    : null;
  const list = useSiteListPage(api.searchConsoleChanges.searchConsoleNewLost, ask ?? "skip");
  const counts = list.result?.counts ?? null;
  const days = range.days;
  const host = status?.host ?? "";
  const periods = list.result?.periods ?? [];
  // Each day, week or month dated by its days, so the chart marks the Google updates inside them.
  const steps = periods.map((period) => {
    const dated = datedRow({ day: period.start, lastDay: period.lastDay }, {}, range.step === "month" ? formatMonth(period.start.slice(0, 7)) : formatShortDay(period.start));
    return { day: dated.day, lastDay: dated.lastDay, label: dated.label, counts: { new: period.gained, up: 0, down: 0, lost: period.lost } };
  });
  // Gained and Lost, each with its tick box, as drawn. A bar unticked is not drawn; the net beside each step still counts both.
  // Amber against blue (2026-10-04): amber against orange read as one colour.
  const ticks = useSeriesTicks([
    { key: "new" as const, name: t("newLost.gained"), colour: SITE_SERIES_COLOURS[3] },
    { key: "lost" as const, name: t("newLost.lost"), colour: SITE_SERIES_COLOURS[1] },
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Sparkles className="h-5 w-5 text-brand" />} title={t("newLost.title")} description={t("newLost.description", { days: status?.limits.lostAfterDays ?? "…" })} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {country && list.result?.notReady ? <CountryNotReady country={country} /> : (
            <>
              {list.preparing ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : null}
              <FigureRow>
                <Figure label={t("newLost.newKeywords")} value={counts ? formatNumber(counts.newKeywords) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days })}</span>} />
                <Figure label={t("newLost.lostKeywords")} value={counts ? formatNumber(counts.lostKeywords) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days })}</span>} />
                <Figure label={t("newLost.newPages")} value={counts ? formatNumber(counts.newPages) : "…"} detail={<span className="text-secondary">{t("newLost.firstTime")}</span>} />
                <Figure label={t("newLost.lostPages")} value={counts ? formatNumber(counts.lostPages) : "…"} detail={<span className="text-secondary">{t("newLost.notIn14", { days: status?.limits.lostAfterDays ?? "…" })}</span>} />
              </FigureRow>
              {list.result?.watchedFrom && list.result.watchedFrom > range.from ? (
                <p className="text-[12px] text-muted">{t("newLost.watchedFrom", { day: formatDay(list.result.watchedFrom), days: status?.limits.newAfterDays ?? "…" })}</p>
              ) : null}
              <SearchConsoleChartCard
                title={t("newLost.chartTitle")}
                hint={t("newLost.chartHint")}
                controls={ticks.controls}
                exportName={`${host}-search-console-new-and-lost-${range.from}-to-${range.to}`}
                host={host}
                from={periods[0]?.start ?? null}
                to={periods.at(-1)?.lastDay ?? null}
                step={range.step}
                csv={() => toCsv([t(`chart.${range.step}`), t("newLost.gained"), t("newLost.lost")], periods.map((period) => [period.start, period.gained, period.lost]))}
              >
                {list.result === undefined ? (
                  <div className="h-[280px] animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />
                ) : steps.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-secondary">{t("chart.nothing")}</p>
                ) : (
                  <SiteGainLossChart
                    steps={steps}
                    series={ticks.shown}
                    netLabel={t("newLost.net")}
                    startLegend={t("newLost.gained")}
                  />
                )}
              </SearchConsoleChartCard>
              <DataTable
                rows={list.pageRows}
                rowKey={(row) => `${row.status}:${row.key}`}
                onRowClick={(row) => router.push(recordHref("keywords/keyword", row.key))}
                minWidthClassName="min-w-[760px]"
                search={{ value: search, onChange: setSearch, placeholder: t("keywords.searchPlaceholder") }}
                filters={
                  <>
                    <Select chip={{ label: t("newLost.what"), choice: what ? t(what === "new" ? "newLost.new" : "newLost.lostWord") : null }} value={what} onChange={(next) => setWhat(next as "" | "new" | "lost")}>
                      <option value="">{t("newLost.newOrLost")}</option>
                      <option value="new">{t("newLost.new")}</option>
                      <option value="lost">{t("newLost.lostWord")}</option>
                    </Select>
                    <Select chip={{ label: t("filters.position"), choice: band ? t(`filters.bands.${band}`) : null }} value={band} onChange={setBand}>
                      <option value="">{t("filters.anyPosition")}</option>
                      {BANDS.map((entry) => <option key={entry} value={entry}>{t(`filters.bands.${entry}`)}</option>)}
                    </Select>
            </>
            }
            cardHeader={<TableBar footer={list.footer} noun="keywords" actions={<NewLostDownload ask={ask} fileName={`${host}-search-console-new-and-lost-keywords`} />} />}
            sort={order.tableSort}
            empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: term || what || band ? t("table.noMatch") : t("table.empty") }}
            footer={list.footer}
            columns={[
              {
                key: "key",
                header: t("table.keyword"),
                sortable: true,
                className: CUT_COLUMN.first,
                cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
              },
              {
                key: "status",
                header: t("table.status"),
                sortable: true,
                // Up for a keyword new in the dates, down for one lost, each written as its word.
                cell: (row) => <Change by={row.status === "new" ? 1 : -1} format={() => t(row.status === "new" ? "newLost.new" : "newLost.lostWord")} />,
              },
              { key: "when", header: t("table.when"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatShortDay(row.when)}</span> },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "impressions", header: t("table.impressions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
              { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatPosition(row.position)}</span> },
            ]}
          />
            </>
          )}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}

/**
 * The whole list on screen as CSV — its search, filters, order and country.
 * The list is paged on the server and never whole here, so the file is read
 * from the table's own query a page at a time, each as large as a page can
 * be, and saved once the last has come.
 */
function NewLostDownload({ ask, fileName }: { ask: NewLostAsk | null; fileName: string }) {
  const t = useTranslations("searchConsole");
  const convex = useConvex();
  const { run, isBusy } = useAdminAction({ scope: "search-console-download" });
  return (
    <DownloadButton
      label={t("table.download")}
      busyLabel={t("table.downloading")}
      busy={isBusy()}
      disabled={!ask}
      onClick={async () => {
        if (!ask) return;
        const outcome = await run(async () => {
          const rows: NewLostRow[] = [];
          for (let page = 1, pages = 1; page <= pages; page += 1) {
            const answer = await convex.query(api.searchConsoleChanges.searchConsoleNewLost, { ...ask, page, rows: DOWNLOAD_PAGE_ROWS });
            rows.push(...answer.rows);
            pages = answer.pages;
          }
          return rows;
        }, { fallbackMessage: t("table.downloadFailed") });
        if (!outcome.ok) return;
        const csv = toCsv(
          [t("table.keyword"), t("table.status"), t("table.when"), t("table.clicks"), t("table.impressions"), t("table.position")],
          outcome.data.map((row) => [row.key, t(row.status === "new" ? "newLost.new" : "newLost.lostWord"), row.when, row.clicks, row.impressions, filePosition(row.position)]),
        );
        saveTextFile(csv, `${fileName}.csv`);
      }}
    />
  );
}
