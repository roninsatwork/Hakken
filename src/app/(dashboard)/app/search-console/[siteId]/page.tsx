"use client";

import { useQuery } from "convex/react";
import { LineChart } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { formatNumber } from "../../sites/_components/siteFormat";
import { SearchConsoleChart } from "../_components/SearchConsoleChart";
import { SearchConsoleFigures } from "../_components/SearchConsoleFigures";
import { NothingOfKind, ResultKindSwitch, SearchConsoleGate, hasFigures } from "../_components/SearchConsoleNotices";
import { useResultKind, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../_components/useSearchConsole";

/**
 * A website's Performance (docs/plans/active/search-console-plan.md §5.1):
 * clicks, impressions, click-through rate and Google's average position for
 * the dates chosen, each against the days before; how much of the clicks
 * came from searches Google names; and one chart of them over time — for the
 * kind of result chosen.
 */
export default function SearchConsolePerformancePage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const performance = useQuery(
    api.searchConsoleReads.searchConsolePerformance,
    status && hasFigures(status) ? { siteId, searchType: kind, from: range.from, to: range.to } : "skip",
  );
  const totals = performance?.totals ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<LineChart className="h-5 w-5 text-brand" />} title={t("performance.title")} description={t("performance.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {performance === undefined ? (
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
              <SearchConsoleChart
                title={t("chart.title")}
                days={performance.days}
                range={range}
                held={{ from: status.connection?.oldestDay ?? null, to: status.connection?.newestDay ?? null }}
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
