"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { LineChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { formatDay, formatNumber } from "../../sites/_components/siteFormat";
import { SearchConsoleChart } from "../_components/SearchConsoleChart";
import { SearchConsoleFigures, useSiteFiguresFor } from "../_components/SearchConsoleFigures";
import { LiveProblem, NothingOfKind, ResultKindSwitch, SearchConsoleGate, hasFigures } from "../_components/SearchConsoleNotices";
import { countryArg, useResultKind, useSearchConsoleCountry, periodArg, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../_components/useSearchConsole";
import { SearchConsoleSees } from "../_components/SearchConsoleSees";
import { performanceSees } from "@/convex/utils/sees/searchConsoleScreens";

/**
 * A website's Performance (docs/plans/active/search-console-plan.md §5.1):
 * clicks, impressions, click-through rate and Google's average position for
 * the dates chosen, each against the days before; how much of the clicks
 * came from searches Google names; and one chart of them over time — for the
 * kind of result and the country chosen. A country the website does not keep
 * ready is asked of Google, which names no clicks.
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
  // Brand searches against the rest, the dates and the span before, for the eye alone (ask-hakken-every-chart-page-plan-
  // 2026-11-03.md, section 6: "the brand split"): from the chart's own days, the lightest read that keeps them.
  const brandAsk = status && hasFigures(status) && range.period !== "custom" ? { siteId, searchType: kind, ...countryArg(country), step: range.step } : null;
  const brandNow = useQuery(api.searchConsolePeriods.searchConsoleChartFigures, brandAsk ? { ...brandAsk, from: range.from, to: range.to } : "skip");
  const { from: beforeFrom, to: beforeTo } = range.before;
  const brandBefore = useQuery(api.searchConsolePeriods.searchConsoleChartFigures, brandAsk ? { ...brandAsk, from: beforeFrom, to: beforeTo } : "skip");
  const seesData = useMemo(() => {
    if (!performance || problem) return undefined;
    const split = (figures: typeof brandNow) => (figures && !figures.notReady && !figures.preparing && !figures.notBuilt
      ? { brandClicks: figures.periods.reduce((sum, period) => sum + period.brandClicks, 0), nonBrandClicks: figures.periods.reduce((sum, period) => sum + period.otherClicks, 0), days: figures.periods.reduce((sum, period) => sum + period.days, 0) }
      : null);
    const [now, before] = [split(brandNow), split(brandBefore)];
    const beforeDays = Math.round((Date.parse(`${beforeTo}T00:00:00Z`) - Date.parse(`${beforeFrom}T00:00:00Z`)) / 86_400_000) + 1;
    return {
      ...performance,
      dates: { from: range.from, to: range.to, days: range.days, beforeDays },
      // Only where the chart holds every day of both spans: a book waiting on its rebuild holds fewer.
      ...(now && before ? { brandDays: { now, before } } : {}),
      names: { brand: t("filters.brandYes"), other: t("filters.brandNo") },
    };
  }, [performance, problem, brandNow, brandBefore, range.from, range.to, range.days, beforeFrom, beforeTo, t]);
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
              {performance.named !== null ? (
                <p className="text-[12px] leading-relaxed text-secondary">
                  {t("named", {
                    named: formatNumber(performance.named),
                    total: formatNumber(totals.clicks),
                    hidden: formatNumber(Math.max(0, totals.clicks - performance.named)),
                  })}
                </p>
              ) : null}
              {fillingFrom ? <p className="text-[12px] leading-relaxed text-secondary">{t("historyFilling", { day: formatDay(fillingFrom) })}</p> : null}
              <SearchConsoleChart
                title={t("chart.title")}
                days={performance.days}
                range={range}
                held={{ from: status.connection?.daysFrom ?? null, to: status.connection?.newestDay ?? null }}
                host={status.host}
                exportName={`${status.host}-search-console-${kind}-${range.from}-to-${range.to}`}
              />
            </>
          )}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
