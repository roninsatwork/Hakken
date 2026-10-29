"use client";

import type { ReactNode } from "react";
import { ChartCard } from "./ChartCard";
import { SiteLineChart, type SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { datedRow } from "@/src/app/(dashboard)/app/sites/_components/datedRows";
import { formatMonth, formatShortDay } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import { stepKey } from "@/src/app/(dashboard)/app/analytics/_components/stepScale";
import type { ChartTooltipEntry } from "@/src/ui/components/charts/ChartTooltip";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";

/**
 * Conversions over time (docs/plans/active/conversion-charts-plan.md, agreed
 * 2026-10-29, in place of "Visits needed for one conversion"): one
 * conversion, a day at a time, as the share of that day's visits that did it
 * or as the visits it took for one — counted in visits, never times — with
 * the span before laid over day for day as a dashed grey line when asked.
 * Alone, the line fills the area under it (SiteLineChart's rule); with the
 * comparison it stays bare. Hover a day for its visits, its conversions and
 * the figure. The card is its heading, the dropdowns, the chart and the key.
 */
export type ConversionsOverTimeShow = "rate" | "per";
export type ConversionsOverTimePoint = { day: string; lastDay?: string; visits: number; did: number };

const figureOf = (show: ConversionsOverTimeShow, visits: number, did: number): number | null =>
  did <= 0 ? null : show === "rate" ? did / visits : visits / did;

export function ConversionsOverTimeChart({ title, controls, points, before, show, step, words, exportName, caption, emptyText }: {
  title: string;
  controls: ReactNode;
  points: readonly ConversionsOverTimePoint[];
  /** The span before's days, each already laid over the period's day it compares with; null when not shown or not held. */
  before: readonly ConversionsOverTimePoint[] | null;
  show: ConversionsOverTimeShow;
  step: "day" | "week" | "month";
  words: {
    now: string;
    beforeName: string;
    /** Under a line's name in the readout: that day's visits and conversions. */
    detail: (visits: number, did: number) => string;
    csvHead: { day: string; visits: string; did: string; figure: string };
  };
  exportName: string;
  caption?: string;
  emptyText?: string;
}) {
  type Bucket = { first: string; last: string; visits: number; did: number; visitsBefore: number; didBefore: number };
  const buckets = new Map<string, Bucket>();
  const bucket = (point: ConversionsOverTimePoint) => {
    const key = stepKey(step, point.day, point.lastDay);
    const one = buckets.get(key) ?? { first: point.day, last: point.lastDay ?? point.day, visits: 0, did: 0, visitsBefore: 0, didBefore: 0 };
    const last = point.lastDay ?? point.day;
    if (last > one.last) one.last = last;
    buckets.set(key, one);
    return one;
  };
  for (const point of points) { const one = bucket(point); one.visits += point.visits; one.did += point.did; }
  for (const point of before ?? []) { const one = bucket(point); one.visitsBefore += point.visits; one.didBefore += point.did; }
  const data = [...buckets.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([key, one]) => datedRow(
    { day: step === "month" ? `${key}-01` : one.first, lastDay: one.last },
    {
      now: figureOf(show, one.visits, one.did), visits: one.visits, did: one.did,
      ...(before ? { before: figureOf(show, one.visitsBefore, one.didBefore), visitsBefore: one.visitsBefore, didBefore: one.didBefore } : {}),
    },
    step === "month" ? formatMonth(key) : formatShortDay(one.first),
  ));
  const series: SiteSeries[] = [
    { key: "now", name: words.now, colour: CHART_SERIES_ORANGE },
    ...(before ? [{ key: "before", name: words.beforeName, colour: CHART_COMPARATOR_GREY, dashed: true }] : []),
  ];
  const formatValue = (value: number) => (show === "rate" ? `${(100 * value).toFixed(1)}%` : value.toFixed(1));
  const seriesLabel = (entry: ChartTooltipEntry) => {
    const row = entry.payload as Record<string, number> | undefined;
    const isBefore = entry.dataKey === "before";
    return (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{entry.name}</span>
        {row ? <span className="truncate text-[11px] text-muted">{words.detail(isBefore ? row.visitsBefore ?? 0 : row.visits ?? 0, isBefore ? row.didBefore ?? 0 : row.did ?? 0)}</span> : null}
      </span>
    );
  };
  const csv = () => [
    [words.csvHead.day, words.csvHead.visits, words.csvHead.did, words.csvHead.figure].join(","),
    ...data.map((row) => [row.day, row.visits, row.did, row.now ?? ""].join(",")),
  ].join("\n");
  const drawn = data.some((row) => row.now !== null || row.before !== null);
  return (
    <ChartCard title={title} controls={controls} exportName={exportName} csv={csv} caption={caption} enoughData={data.length > 0} emptyText={emptyText}>
      <div data-part="conversions-over-time">
        {drawn
          ? <SiteLineChart data={data} series={series} sharedScale formatValue={formatValue} seriesLabel={seriesLabel} keepEmptyRows breakGaps formatScale={(value) => (show === "rate" ? `${Math.round(100 * value)}%` : String(value))} />
          : <p className="py-10 text-center text-[12px] text-muted">{emptyText}</p>}
      </div>
    </ChartCard>
  );
}
