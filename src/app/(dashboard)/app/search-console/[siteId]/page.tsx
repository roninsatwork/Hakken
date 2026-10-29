"use client";

import { LineChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { formatDay, formatNumber } from "../../sites/_components/siteFormat";
import { SearchConsoleChart } from "../_components/SearchConsoleChart";
import { SearchConsoleFigures, useSiteFiguresFor } from "../_components/SearchConsoleFigures";
import { LiveProblem, NothingOfKind, ResultKindSwitch, SearchConsoleGate, hasFigures } from "../_components/SearchConsoleNotices";
import { useResultKind, useSearchConsoleCountry, periodArg, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../_components/useSearchConsole";
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
          <SearchConsoleSees screen="performance" seen={performance && !problem ? (range.period === "custom" ? null : performanceSees(totals, performance.previous, range.period)) : null} />
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
