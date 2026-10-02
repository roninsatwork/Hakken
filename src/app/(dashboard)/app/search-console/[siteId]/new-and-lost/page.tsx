"use client";

import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { BANDS } from "@/convex/utils/searchConsoleViews";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SITE_SERIES_COLOURS } from "../../../sites/_components/SiteCharts";
import { SiteFigure } from "../../../sites/_components/SiteFigure";
import { SiteGainLossChart } from "../../../sites/_components/SiteGainLossChart";
import { datedRow } from "../../../sites/_components/datedRows";
import { shiftDay } from "../../../sites/_components/siteRange";
import { SiteTableBar } from "../../../sites/_components/SiteTableBar";
import { formatDay, formatNumber, formatShortDay, toCsv } from "../../../sites/_components/siteFormat";
import { useSiteListPage } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSort } from "../../../sites/_components/useSiteSort";
import { SearchConsoleChartCard } from "../../_components/SearchConsoleChartCard";
import { SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { formatPosition } from "../../_components/searchConsoleFormat";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

const FIRSTS = { key: "asc", status: "asc", when: "desc", clicks: "desc", impressions: "desc", position: "asc" } as const;

/**
 * New and lost (search-console-plan.md §13.3, drawn as "6 · New and lost"):
 * keywords Google started showing the website for in the dates chosen, and
 * keywords it stopped showing it for — lost when 14 days pass without one —
 * week by week, newest first. Web results only — the register of when each
 * keyword and page was first and last shown is kept for them — so the page
 * has no kind-of-result switch.
 */
export default function SearchConsoleNewLostPage() {
  const t = useTranslations("searchConsole");
  const router = useRouter();
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [search, setSearch, term] = useSiteSearch();
  const [what, setWhat] = useSiteParam<"" | "new" | "lost">("what", "", ["", "new", "lost"]);
  const [band, setBand] = useSiteParam<string>("band", "", ["", ...BANDS]);
  const order = useSiteSort<keyof typeof FIRSTS>(FIRSTS, "when");
  const recordHref = useRecordHref(siteId);
  const held = Boolean(status?.connection?.newestDay);
  const list = useSiteListPage(
    api.searchConsoleChanges.searchConsoleNewLost,
    held
      ? {
        siteId,
        from: range.from,
        to: range.to,
        ...(term ? { q: term } : {}),
        ...(what ? { what } : {}),
        ...(band ? { band: band as (typeof BANDS)[number] } : {}),
        sort: order.key,
        direction: order.direction,
      }
      : "skip",
  );
  const counts = list.result?.counts ?? null;
  const days = range.days;
  const host = status?.host ?? "";
  const weeks = list.result?.weeks ?? [];
  // Each week dated by its days, so the chart marks the Google updates inside them.
  const steps = weeks.map((week) => {
    const dated = datedRow({ day: week.week, lastDay: shiftDay(week.week, 6) }, {});
    return { day: dated.day, lastDay: dated.lastDay, label: dated.label, counts: { new: week.gained, up: 0, down: 0, lost: week.lost } };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Sparkles className="h-5 w-5 text-brand" />} title={t("newLost.title")} description={t("newLost.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SiteFigure label={t("newLost.newKeywords")} value={counts ? formatNumber(counts.newKeywords) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days })}</span>} />
            <SiteFigure label={t("newLost.lostKeywords")} value={counts ? formatNumber(counts.lostKeywords) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days })}</span>} />
            <SiteFigure label={t("newLost.newPages")} value={counts ? formatNumber(counts.newPages) : "…"} detail={<span className="text-secondary">{t("newLost.firstTime")}</span>} />
            <SiteFigure label={t("newLost.lostPages")} value={counts ? formatNumber(counts.lostPages) : "…"} detail={<span className="text-secondary">{t("newLost.notIn14")}</span>} />
          </div>
          {list.result?.watchedFrom && list.result.watchedFrom > range.from ? (
            <p className="text-[12px] text-muted">{t("newLost.watchedFrom", { day: formatDay(list.result.watchedFrom) })}</p>
          ) : null}
          <SearchConsoleChartCard
            title={t("newLost.chartTitle")}
            hint={t("newLost.chartHint")}
            exportName={`${host}-search-console-new-and-lost`}
            host={host}
            from={weeks[0]?.week ?? null}
            to={status.connection?.newestDay ?? null}
            csv={() => toCsv([t("chart.week"), t("newLost.gained"), t("newLost.lost")], weeks.map((week) => [week.week, week.gained, week.lost]))}
          >
            {list.result === undefined ? (
              <div className="h-[280px] animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />
            ) : steps.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-secondary">{t("chart.nothing")}</p>
            ) : (
              <SiteGainLossChart
                steps={steps}
                series={[
                  { key: "new", name: t("newLost.gained"), colour: SITE_SERIES_COLOURS[3] },
                  { key: "lost", name: t("newLost.lost"), colour: SITE_SERIES_COLOURS[0] },
                ]}
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
            cardHeader={<SiteTableBar footer={list.footer} noun="keywords" />}
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
                cell: (row) => (row.status === "new"
                  ? <span className="whitespace-nowrap text-[13px] text-success">▲ {t("newLost.new")}</span>
                  : <span className="whitespace-nowrap text-[13px] text-destructive">▼ {t("newLost.lostWord")}</span>),
              },
              { key: "when", header: t("table.when"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatShortDay(row.when)}</span> },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "impressions", header: t("table.impressions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
              { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatPosition(row.position)}</span> },
            ]}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
