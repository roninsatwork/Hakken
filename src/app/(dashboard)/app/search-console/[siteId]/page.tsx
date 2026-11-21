"use client";

import { useQuery } from "convex/react";
import { LineChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { formatDay } from "../../sites/_components/siteFormat";
import { PerformanceBandsCard, PerformanceDaysCard, PerformanceDotsCard, PerformanceSquaresCard, usePerformanceEye, usePerformanceReads } from "../_components/PerformanceParts";
import { SearchConsoleFigures, useSiteFiguresFor } from "../_components/SearchConsoleFigures";
import { LiveProblem, NothingOfKind, ResultKindSwitch, SearchConsoleGate, hasFigures } from "../_components/SearchConsoleNotices";
import { countryArg, useResultKind, useSearchConsoleCountry, periodArg, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../_components/useSearchConsole";
import { SearchConsoleSees } from "../_components/SearchConsoleSees";
import { performanceSees } from "@/convex/utils/sees/searchConsoleScreens";

/**
 * A website's Performance (docs/plans/active/search-console-plan.md §5.1), as
 * Anthony chose it on 17 November 2026 (search-console-performance-way-3-
 * plan-2026-11-17.md): clicks, impressions, click-through rate and Google's
 * average position for the dates chosen, each against the span before; the
 * day chart; out of every 100 clicks, where they came from — brand searches,
 * the searches Google hides, devices, Classifications, rich results; what
 * Google shows against what gets clicked; and which keywords Google shows
 * and which get clicked — for the kind of result and the country chosen. A
 * country the website does not keep ready is asked of Google.
 */
export default function SearchConsolePerformancePage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const { figures: performance, problem, retry } = useSiteFiguresFor(
    status && hasFigures(status) ? { siteId, searchType: kind, from: range.from, to: range.to, ...periodArg(range) } : null,
  );
  const totals = performance?.totals ?? null;
  const reads = usePerformanceReads();
  // Brand searches against the rest, the dates and the span before, for the eye alone (ask-hakken-every-chart-page-plan-
  // 2026-11-03.md, section 6: "the brand split"): from the chart's own days, the lightest read that keeps them.
  const brandAsk = status && hasFigures(status) && range.period !== "custom" ? { siteId, searchType: kind, ...countryArg(country), step: range.step } : null;
  const brandNow = useQuery(api.searchConsolePeriods.searchConsoleChartFigures, brandAsk ? { ...brandAsk, from: range.from, to: range.to } : "skip");
  const brandBefore = useQuery(api.searchConsolePeriods.searchConsoleChartFigures, brandAsk ? { ...brandAsk, from: range.before.from, to: range.before.to } : "skip");
  // The eye's figures: the boxes, the day chart, the brand split and the charts' own (`performanceEyeData`).
  const seesData = usePerformanceEye(
    reads,
    performance && !problem ? performance : undefined,
    { brandNow, brandBefore },
    { from: range.from, to: range.to, days: range.days, before: range.before },
  );
  // Google's sixteen months still coming in for the country read, and where its days start until then
  // (search-console-first-collection-plan.md, SF5): the website's own run fills them straight after its 90 days.
  const kept = country ? status?.connection?.countriesNewest.find((held) => held.country === country) : undefined;
  const fillingFrom = !status?.connection?.newestDay ? null
    : country ? (kept && !kept.historyWhole ? kept.daysFrom : null)
      : !status.connection.historyWhole ? status.connection.daysFrom : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<LineChart className="h-5 w-5 text-brand" />} title={t("performance.title")} description={t("performance.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <SearchConsoleSees screen="performance" seen={performance && !problem ? (range.period === "custom" ? null : performanceSees(totals, performance.previous, range.period)) : null} data={seesData} />
          <ResultKindSwitch />
          {problem ? (
            <LiveProblem problem={problem} retry={retry} />
          ) : performance === undefined ? (
            <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
          ) : totals === null ? (
            <NothingOfKind from={range.from} to={range.to} />
          ) : (
            <>
              <SearchConsoleFigures totals={totals} previous={performance.previous} days={range.days} />
              {fillingFrom ? <p className="text-[12px] leading-relaxed text-secondary">{t("historyFilling", { day: formatDay(fillingFrom) })}</p> : null}
              <PerformanceDaysCard figures={performance} host={status.host} heldFrom={country ? (kept?.daysFrom ?? null) : (status.connection?.daysFrom ?? null)} />
              <PerformanceSquaresCard reads={reads} figures={performance} host={status.host} />
              <PerformanceBandsCard reads={reads} figures={performance} host={status.host} />
              <PerformanceDotsCard reads={reads} figures={performance} host={status.host} />
            </>
          )}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
