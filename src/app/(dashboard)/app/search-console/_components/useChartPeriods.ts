"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { datedRow, type DatedRow } from "../../sites/_components/datedRows";
import { formatDay, formatMonth, formatShortDay } from "../../sites/_components/siteFormat";
import { shiftDay } from "../../sites/_components/siteRange";
import type { ResultKind } from "./useSearchConsole";
import { countryArg, useSearchConsoleCountry } from "./useSearchConsole";

type ChartFigures = FunctionReturnType<typeof api.searchConsolePeriods.searchConsoleChartFigures>;
export type ChartPeriod = ChartFigures["periods"][number];
type Step = ChartFigures["step"];

/**
 * The days, weeks or months Position bands and Brand and non-brand draw, in
 * the dates and step chosen (Anthony, 2026-10-04: the charts did not move
 * with the dates) — each a chart row naming its dates on hover, a part-week
 * or part-month marked as one — and the line saying when the chart is drawn
 * by week instead of by day, or starts later than the dates.
 */
export function useChartPeriods(list: {
  siteId: Id<"companyWebsites">;
  kind: ResultKind;
  range: { from: string; to: string; step: Step };
  status: { connection?: { newestDay?: string | null } | null } | null | undefined;
}) {
  const t = useTranslations("searchConsole.chart");
  const [country] = useSearchConsoleCountry();
  const figures = useQuery(
    api.searchConsolePeriods.searchConsoleChartFigures,
    list.status?.connection?.newestDay
      ? { siteId: list.siteId, searchType: list.kind, ...countryArg(country), from: list.range.from, to: list.range.to, step: list.range.step }
      : "skip",
  );
  const step = figures?.step ?? list.range.step;
  const periods = figures?.periods;

  const readoutOf = (period: ChartPeriod): string => {
    if (step === "day") return formatDay(period.start);
    const part = period.days < period.length;
    if (!part) return step === "month" ? formatMonth(period.start.slice(0, 7)) : `${formatShortDay(period.start)} – ${formatShortDay(period.lastDay)}`;
    // The days held are the last ones before `lastDay`: a history has no gaps.
    const first = shiftDay(period.lastDay, 1 - period.days);
    return t("partDays", { dates: `${formatShortDay(first)} – ${formatShortDay(period.lastDay)}`, days: period.days });
  };

  /** Each period as a chart row, with the figures `values` picks from it. */
  const rows = (values: (period: ChartPeriod) => Record<string, unknown>): DatedRow[] =>
    (periods ?? []).map((period) => datedRow(
      { day: period.start, lastDay: period.lastDay, readout: readoutOf(period), part: period.days < period.length },
      values(period),
      step === "month" ? formatMonth(period.start.slice(0, 7)) : formatShortDay(period.start),
    ));

  const note = figures?.byWeek
    ? t("byWeek")
    : figures?.reach
      ? t("reach", { weeks: figures.chartWeeks, from: formatDay(figures.reach) })
      : null;

  return {
    figures,
    country,
    periods,
    step,
    rows,
    note,
    /** What the chart draws, for its caption: its first day to its last. */
    from: periods?.[0]?.start ?? null,
    to: periods?.at(-1)?.lastDay ?? null,
    /** The CSV's first column: what each row is. */
    periodHeader: t(step),
  };
}
