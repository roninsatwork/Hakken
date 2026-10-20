"use client";

import Link from "next/link";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { servicesSees } from "@/convex/utils/sees/searchConsoleScreens";
import { SiteBarChart } from "../../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { SearchConsoleChartCard } from "../../_components/SearchConsoleChartCard";
import { SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { countryArg, isReadyMade, useSearchConsoleCountry, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";
import { useSearchConsolePeriodWords } from "../../_components/useSearchConsole";

/** Below this many before, a change is said as a count, not a share. */
const SHARE_FROM = 10;

/**
 * Demand by service (docs/plans/active/insights-analyst-plan.md §4.4, phase
 * 9, drawn as the ScDemand board): how often Google showed the website for
 * each of its services in the dates chosen against the same days before, and
 * what buyers clicked — by the company's own page classifications, or by
 * Hakken's kinds of page until it has any. Ready-made dates only; Insights
 * reads the same figures for its findings about demand.
 */
type ServiceRow = { id: string; name: string | null; kind: string; shown: number; shownBefore: number | null; clicks: number; clicksBefore: number | null };
const moved = (now: number, before: number | null) => (before ? (now - before) / before : null);
/** Its sortable columns (sites-table-sorting-plan.md): the service A to Z, each figure and change the most first. */
const SORTS: SiteSortColumns<ServiceRow, "service" | "shown" | "shownChange" | "clicks" | "clicksChange"> = {
  service: { value: (row) => row.name ?? row.id, first: "asc" },
  shown: { value: (row) => row.shown, first: "desc" },
  shownChange: { value: (row) => moved(row.shown, row.shownBefore), first: "desc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  clicksChange: { value: (row) => moved(row.clicks, row.clicksBefore), first: "desc" },
};

export default function SearchConsoleDemandPage() {
  const t = useTranslations("searchConsole.services");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const periodWords = useSearchConsolePeriodWords(range.period);
  const [country] = useSearchConsoleCountry();
  const readyMade = isReadyMade(range, status?.connection?.newestDay);
  const period = range.period;
  const data = useQuery(api.searchConsoleDemand.searchConsoleDemand, status?.connection?.newestDay && readyMade ? { siteId, period, ...countryArg(country) } : "skip");
  const [search, setSearch, term] = useSiteSearch();
  // A service by its page's title before any "|", as Insights' Strategy names it; the home page by name.
  const nameOf = (row: { id: string; name: string | null; kind: string }) => {
    if (row.kind === "GUIDES") return t("guides");
    if (row.kind === "OTHER") return t(data?.classified ? "notSorted" : "other");
    if (row.kind === "SERVICE" && row.id === "/") return t("home");
    return (row.kind === "SERVICE" ? row.name?.split("|")[0].trim() : row.name) || row.id;
  };
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = data?.services.filter((row) => !matches || matches(nameOf(row)));
  const { rows, tableSort } = useSiteSortedList(matching, SORTS, { opening: "shown", name: nameOf });
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined && readyMade });
  const host = status?.host ?? "";
  const change = (now: number, before: number | null) => {
    if (before === null) return <span className="font-mono text-[12px] text-muted">–</span>;
    if (before < SHARE_FROM) return <Change by={now - before} same={now === before} />;
    return <Change by={Math.round(((now - before) / before) * 100)} same={now === before} format={(value) => `${formatNumber(value)}%`} />;
  };
  const bars = (data?.services ?? []).slice(0, 10).map((row) => ({ label: nameOf(row), before: row.shownBefore ?? 0, now: row.shown }));
  const csv = () => toCsv([t("columns.service"), t("chart.before"), t("chart.now")], bars.map((row) => [row.label, row.before, row.now]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Layers className="h-5 w-5 text-brand" />} title={t("title")} description={t("description", { period: periodWords.period, before: periodWords.before })} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          {!readyMade ? <Notice>{t("readyMade")}</Notice> : null}
          <SearchConsoleSees screen="services" seen={data ? servicesSees(data.services.map((row) => ({ ...row, name: nameOf(row), service: row.kind === "SERVICE" }))) : null} />
          <SearchConsoleChartCard
            title={t("chart.title")}
            hint={t("chart.hint", { name: periodWords.name, before: periodWords.before })}
            exportName={`${host}-search-console-demand-by-service`}
            csv={csv}
            host={host}
            from={data?.from ?? null}
            to={data?.to ?? null}
          >
            <SiteBarChart data={bars} series={[{ key: "before", name: t("chart.before"), colour: CHART_SERIES_SLATE }, { key: "now", name: t("chart.now"), colour: CHART_SERIES_ORANGE }]} horizontal />
          </SearchConsoleChartCard>
          <DataTable
            rows={pages.pageRows}
            rowKey={(row) => row.id}
            search={{ value: search, onChange: setSearch, placeholder: t("search") }}
            cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: rows?.length ?? 0, name: periodWords.name, before: periodWords.before })} actions={<ListDownload label={t("download")} fileName={`${host}-demand-by-service`} rows={rows} columns={[{ header: t("columns.service"), value: nameOf }, { header: t("columns.shown"), value: (row) => row.shown }, { header: t("chart.before"), value: (row) => row.shownBefore ?? "" }, { header: t("columns.clicks"), value: (row) => row.clicks }, { header: t("columns.clicksBefore"), value: (row) => row.clicksBefore ?? "" }]} />} />}
            empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
            footer={pages.footer}
            sort={tableSort}
            columns={[
              { key: "service", header: t("columns.service"), sortable: true, cell: (row) => <span className="truncate text-[13px] text-foreground">{nameOf(row)}</span> },
              { key: "shown", header: t("columns.shown"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.shown)}</span> },
              { key: "shownChange", header: t("columns.change"), align: "right", sortable: true, cell: (row) => change(row.shown, row.shownBefore) },
              { key: "clicks", header: t("columns.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "clicksChange", header: t("columns.change"), align: "right", sortable: true, cell: (row) => change(row.clicks, row.clicksBefore) },
            ]}
          />
          <Link href="/app/insights/findings" className="w-fit text-[13px] text-secondary hover:text-foreground">{t("seeInsights")}</Link>
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
