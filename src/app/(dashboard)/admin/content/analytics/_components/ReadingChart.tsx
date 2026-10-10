"use client";

import { useTranslations } from "next-intl";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { SiteLineChart, type SiteSeries } from "../../../../app/sites/_components/SiteCharts";
import { datedRow } from "../../../../app/sites/_components/datedRows";
import { toCsv } from "../../../../app/sites/_components/siteFormat";
import { useSeriesTicks } from "../../../../app/search-console/_components/SearchConsoleChartCard";

const DAY_MS = 86_400_000;

/** Every day from the first to the last, "YYYY-MM-DD". */
export function everyDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= Date.parse(`${to}T00:00:00Z`); at += DAY_MS) days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}

/**
 * An Analytics chart by day (boards 7, 8, 9, 11, 12): its measures ticked on
 * and off, one scale for all of them since each is a count, every day of the
 * period drawn — a day with nothing is nought — Google's updates marked, and
 * the PNG, SVG and CSV download.
 */
export function ReadingChart<Day extends { day: string }>({ title, hint, range, days, measures, hidden = [], exportName }: {
  title: string;
  hint?: string;
  range: { from: string; to: string };
  days: readonly Day[];
  measures: ReadonlyArray<SiteSeries & { key: keyof Day & string }>;
  hidden?: readonly string[];
  exportName: string;
}) {
  const t = useTranslations("admin.contentAnalytics.chart");
  const { shown, controls } = useSeriesTicks(measures, hidden);
  const byDay = new Map(days.map((day) => [day.day, day]));
  const data = everyDay(range.from, range.to).map((day) => datedRow({ day }, Object.fromEntries(measures.map((measure) => [measure.key, Number(byDay.get(day)?.[measure.key] ?? 0)]))));
  return (
    <ChartCard
      title={title}
      hint={hint}
      controls={<div className="flex flex-wrap items-center gap-4">{controls}</div>}
      exportName={exportName}
      csv={() => toCsv([t("day"), ...measures.map((measure) => measure.name)], data.map((row) => [String(row.day), ...measures.map((measure) => row[measure.key] as number)]))}
      enoughData={days.length > 0}
      emptyText={t("empty")}
    >
      <SiteLineChart data={data} series={shown} sharedScale />
    </ChartCard>
  );
}
