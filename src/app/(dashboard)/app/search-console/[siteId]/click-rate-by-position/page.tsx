"use client";

import { useQuery } from "convex/react";
import { Percent } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ctrCurve, type CurvePoint } from "@/convex/utils/searchConsoleViews";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../sites/_components/SiteCharts";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { SearchConsoleChartCard } from "../../_components/SearchConsoleChartCard";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { formatRate } from "../../_components/searchConsoleFormat";
import { useLiveAsk } from "../../_components/searchConsoleRecords";
import { SearchConsoleChips, type ChipId } from "../../_components/SearchConsoleTables";
import { isReadyMade, useResultKind, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

const CHIPS: readonly ChipId[] = ["country", "device"];

type Point = CurvePoint & { key: string };
const SORTS: SiteSortColumns<Point, "position" | "keywords" | "impressions" | "clicks" | "ctr"> = {
  position: { value: (row) => row.position, first: "asc" },
  keywords: { value: (row) => row.keywords, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
};
const nameOf = (row: Point) => row.key;

/**
 * Click rate by position (search-console-plan.md §13.3, drawn as "15 · Click
 * rate by position"): how often people click the website at each of
 * Google's positions, 1 to 20 — clicks for each time it was shown, from its
 * keywords. Shown but not clicked uses it as the website's own yardstick.
 */
export default function SearchConsoleCtrCurvePage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [search, setSearch, term] = useSiteSearch();
  const [country] = useSiteParam<string>("country", "");
  const [device] = useSiteParam<string>("device", "", ["", "DESKTOP", "MOBILE", "TABLET"]);
  const held = Boolean(status?.connection?.newestDay);
  const ask = { siteId, searchType: kind, from: range.from, to: range.to };
  const fromLive = Boolean(country || device) || !isReadyMade(range, status?.connection?.newestDay);
  const server = useQuery(api.searchConsoleChanges.searchConsoleCurve, held && !fromLive ? ask : "skip");
  const live = useLiveAsk(
    api.searchConsoleLists.searchConsoleLiveList,
    held && fromLive ? { ...ask, dimension: "query" as const, ...(country ? { country } : {}), ...(device ? { device } : {}) } : null,
  );
  const points: CurvePoint[] | undefined = fromLive
    ? (live.answer === undefined ? undefined : live.answer.ok ? ctrCurve(live.answer.rows) : [])
    : server?.points;
  const rows = points?.map((point) => ({ ...point, key: String(point.position) }));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(row.key));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "position", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const host = status?.host ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Percent className="h-5 w-5 text-brand" />} title={t("ctrCurve.title")} description={t("ctrCurve.description", { days: range.days })} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {server?.preparing ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : null}
          <SearchConsoleChartCard
            title={t("ctrCurve.chartTitle")}
            hint={t("ctrCurve.chartHint")}
            exportName={`${host}-search-console-click-rate-by-position`}
            host={host}
            from={range.from}
            to={range.to}
            csv={() => toCsv([t("table.position"), `${t("table.ctr")} (%)`], (points ?? []).map((point) => [point.position, Math.round(point.ctr * 1000) / 10]))}
          >
            {points === undefined ? (
              <div className="h-[280px] animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />
            ) : points.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-secondary">{t("chart.nothing")}</p>
            ) : (
              <SiteBarChart
                height={280}
                series={[{ key: "ctr", name: t("ctrCurve.rate"), colour: SITE_SERIES_COLOURS[3] }]}
                data={points.map((point) => ({ key: String(point.position), label: String(point.position), ctr: Math.round(point.ctr * 1000) / 10 }))}
                xKey="label"
                formatValue={(value) => `${value}%`}
              />
            )}
          </SearchConsoleChartCard>
          <DataTable
            rows={pager.pageRows}
            rowKey={(row) => row.key}
            minWidthClassName="min-w-[640px]"
            search={{ value: search, onChange: setSearch, placeholder: t("ctrCurve.searchPlaceholder") }}
            filters={<SearchConsoleChips chips={CHIPS} />}
            cardHeader={<TableBar footer={pager.footer} noun="positions" />}
            sort={tableSort}
            empty={{ icon: <Percent className="h-8 w-8 text-muted/30" />, label: term ? t("table.noMatch") : t("table.empty") }}
            footer={pager.footer}
            columns={[
              { key: "position", header: t("table.position"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{row.position}</span> },
              { key: "keywords", header: t("table.keywords"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.keywords)}</span> },
              { key: "impressions", header: t("table.impressions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "ctr", header: t("table.ctr"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.ctr)}</span> },
            ]}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
