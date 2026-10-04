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
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { SearchConsoleChartCard, useSeriesTicks } from "../../_components/SearchConsoleChartCard";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { filePercent, formatRate } from "../../_components/searchConsoleFormat";
import { useLiveAsk } from "../../_components/searchConsoleRecords";
import { SearchConsoleChips, type ChipId } from "../../_components/SearchConsoleTables";
import {
  countryArg,
  isReadyMade,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
} from "../../_components/useSearchConsole";

const CHIPS: readonly ChipId[] = ["device"];

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
 * In the country chosen: from its ready-made periods when the website keeps
 * it ready, otherwise worked out from Google's answer (search-console-plan.md
 * §16).
 */
export default function SearchConsoleCtrCurvePage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [search, setSearch, term] = useSiteSearch();
  const [country] = useSearchConsoleCountry();
  const [device] = useSiteParam<string>("device", "", ["", "DESKTOP", "MOBILE", "TABLET"]);
  const held = Boolean(status?.connection?.newestDay);
  const ask = { siteId, searchType: kind, from: range.from, to: range.to, ...countryArg(country) };
  // Other dates or one device are asked of Google; so is a country the website does not keep ready, the server says.
  const asksGoogle = Boolean(device) || !isReadyMade(range, status?.connection?.newestDay);
  const server = useQuery(api.searchConsoleChanges.searchConsoleCurve, held && !asksGoogle ? ask : "skip");
  const fromLive = asksGoogle || server?.live === true;
  const live = useLiveAsk(
    api.searchConsoleLists.searchConsoleLiveList,
    held && fromLive ? { ...ask, dimension: "query" as const, ...(device ? { device } : {}) } : null,
  );
  const points: CurvePoint[] | undefined = fromLive
    ? (live.answer === undefined ? undefined : live.answer.ok && status ? ctrCurve(live.answer.rows.flat(), status.limits.curvePositions) : [])
    : server?.points;
  const rows = points?.map((point) => ({ ...point, key: String(point.position) }));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(row.key));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "position", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const host = status?.host ?? "";
  // Its one tick box, as drawn.
  const ticks = useSeriesTicks([{ key: "ctr", name: t("ctrCurve.rate"), colour: SITE_SERIES_COLOURS[3] }]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Percent className="h-5 w-5 text-brand" />} title={t("ctrCurve.title")} description={t("ctrCurve.description", { days: range.days })} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {server?.preparing ? <p className="text-[12px] text-muted">{t("table.preparing")}</p> : null}
          <SearchConsoleChartCard
            title={t("ctrCurve.chartTitle")}
            hint={t("ctrCurve.chartHint", { positions: status?.limits.curvePositions ?? "…" })}
            controls={ticks.controls}
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
                series={ticks.shown}
                data={points.map((point) => ({ key: String(point.position), label: String(point.position), ctr: Math.round(point.ctr * 1000) / 10 }))}
                xKey="label"
                formatValue={(value) => `${value}%`}
                formatScale={(value) => `${value}%`}
              />
            )}
          </SearchConsoleChartCard>
          <DataTable
            rows={pager.pageRows}
            rowKey={(row) => row.key}
            minWidthClassName="min-w-[640px]"
            search={{ value: search, onChange: setSearch, placeholder: t("ctrCurve.searchPlaceholder") }}
            filters={<SearchConsoleChips chips={CHIPS} />}
            cardHeader={
              <TableBar
                footer={pager.footer}
                noun="positions"
                actions={
                  <ListDownload
                    label={t("table.download")}
                    fileName={`${host}-search-console-click-rate-by-position`}
                    rows={sorted}
                    columns={[
                      { header: t("table.position"), value: (row) => row.position },
                      { header: t("table.keywords"), value: (row) => row.keywords },
                      { header: t("table.impressions"), value: (row) => row.impressions },
                      { header: t("table.clicks"), value: (row) => row.clicks },
                      { header: `${t("table.ctr")} (%)`, value: (row) => filePercent(row.ctr) },
                    ]}
                  />
                }
              />
            }
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
