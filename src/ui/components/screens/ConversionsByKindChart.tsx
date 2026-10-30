"use client";

import { useState, type ReactNode } from "react";
import { ChartCard } from "./ChartCard";
import { Checkbox } from "./Checkbox";
import { SiteLineChart, type SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { datedRow } from "@/src/app/(dashboard)/app/sites/_components/datedRows";
import { formatMonth, formatShortDay } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import { stepKey } from "@/src/app/(dashboard)/app/analytics/_components/stepScale";
import { ChartReadoutTable } from "@/src/ui/components/charts/ChartReadoutTable";
import { CHART_COMPARATOR_GREY, CHART_PRIMARY_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_PALETTE } from "@/src/ui/components/charts/chartPalette";
import type { ConversionsCount } from "./ConversionsMap";

/**
 * Conversions over time by kind (docs/plans/active/conversion-charts-plan.md,
 * agreed 2026-10-29): one conversion, a line a day for each channel, device
 * or country, in visits that did it, as a rate of that kind's visits, or in
 * times. A tick box per line above the chart, every line ticked at first; one
 * line alone fills the area under it (SiteLineChart's rule). Hover a day for
 * every line's figures. The card is its heading, the dropdowns, the ticks,
 * the chart and the key.
 */
export type ConversionsByKindColumn = { key: string; name: string };
export type ConversionsByKindPoint = { day: string; lastDay?: string; cells: ReadonlyArray<{ visits: number; did: number; times: number }> };

/** Orange first, as every chart; then the app's series colours; then its two blues for the ninth and tenth. */
const COLOURS = [CHART_SERIES_ORANGE, ...CHART_SERIES_PALETTE.filter((colour) => colour !== CHART_SERIES_ORANGE), CHART_PRIMARY_BLUE, CHART_COMPARATOR_GREY];

const pct = (share: number) => `${(100 * share).toFixed(1)}%`;

export function ConversionsByKindChart({ title, hint, controls, columns, points, count, step, words, exportName, csv, caption, emptyText }: {
  title: string;
  /** The line under the title: what the lines count, in plain words (the Conversions canvas, 2026-10-30). */
  hint?: ReactNode;
  controls: ReactNode;
  columns: readonly ConversionsByKindColumn[];
  points: readonly ConversionsByKindPoint[];
  count: ConversionsCount;
  step: "day" | "week" | "month";
  words: {
    /** Under a line's name in the readout: its visits and what it did that day. */
    detail: (visits: number, did: number, times: number) => string;
    /** The readout's and the download's column words: visits, visits with the conversion, times, and the rate. */
    csvHead: { day: string; visits: string; did: string; times: string; rate: string };
  };
  exportName: string;
  csv?: () => string;
  caption?: string;
  emptyText?: string;
}) {
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const shown = columns.filter((column) => !off.has(column.key));
  // Each step's figures: the points inside it added up, a column at a time.
  const buckets = new Map<string, { first: string; last: string; cells: Array<{ visits: number; did: number; times: number }> }>();
  for (const point of points) {
    const key = stepKey(step, point.day, point.lastDay);
    const bucket = buckets.get(key) ?? { first: point.day, last: point.lastDay ?? point.day, cells: columns.map(() => ({ visits: 0, did: 0, times: 0 })) };
    const last = point.lastDay ?? point.day;
    if (last > bucket.last) bucket.last = last;
    point.cells.forEach((cell, at) => {
      if (!bucket.cells[at]) return;
      bucket.cells[at].visits += cell.visits;
      bucket.cells[at].did += cell.did;
      bucket.cells[at].times += cell.times;
    });
    buckets.set(key, bucket);
  }
  const valueOf = (cell: { visits: number; did: number; times: number }) =>
    count === "events" ? cell.times : count === "visits" ? cell.did : cell.visits > 0 ? (100 * cell.did) / cell.visits : null;
  const data = [...buckets.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([key, bucket]) => {
    const values: Record<string, unknown> = {};
    columns.forEach((column, at) => {
      values[column.key] = valueOf(bucket.cells[at]);
      values[`${column.key}__visits`] = bucket.cells[at].visits;
      values[`${column.key}__did`] = bucket.cells[at].did;
      values[`${column.key}__times`] = bucket.cells[at].times;
    });
    return datedRow({ day: step === "month" ? `${key}-01` : bucket.first, lastDay: bucket.last }, values, step === "month" ? formatMonth(key) : formatShortDay(bucket.first));
  });
  const series: SiteSeries[] = shown.map((column) => ({ key: column.key, name: column.name, colour: COLOURS[columns.findIndex((other) => other.key === column.key) % COLOURS.length] }));
  const formatValue = (value: number) => (count === "rate" ? `${value.toFixed(1)}%` : value.toLocaleString("en-GB"));
  // The hover from the canvas (board 1d): the day, then a row per line with its visits, its conversions and its rate.
  const readout = ({ row, heading }: { row: Record<string, unknown>; heading: ReactNode }) => (
    <ChartReadoutTable
      heading={heading}
      columns={[
        { key: "visits", label: words.csvHead.visits, tone: "quiet" },
        { key: "did", label: count === "events" ? words.csvHead.times : words.csvHead.did, tone: "band" },
        { key: "rate", label: words.csvHead.rate, tone: "quiet" },
      ]}
      rows={shown.map((column) => {
        const visits = Number(row[`${column.key}__visits`] ?? 0);
        const did = Number(row[`${column.key}__did`] ?? 0);
        const times = Number(row[`${column.key}__times`] ?? 0);
        return {
          key: column.key,
          name: column.name,
          colour: COLOURS[columns.findIndex((other) => other.key === column.key) % COLOURS.length],
          cells: {
            visits: { text: visits.toLocaleString("en-GB"), quiet: true },
            did: { text: (count === "events" ? times : did).toLocaleString("en-GB") },
            rate: { text: visits > 0 ? pct(did / visits) : "–", quiet: true },
          },
        };
      })}
    />
  );
  const ticks = (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {columns.map((column) => (
        <Checkbox
          key={column.key}
          label={column.name}
          checked={!off.has(column.key)}
          onChange={(checked) => setOff((before) => {
            const next = new Set(before);
            if (checked) next.delete(column.key);
            else next.add(column.key);
            return next;
          })}
        />
      ))}
    </div>
  );
  const csvOf = csv ?? (() => [
    [words.csvHead.day, ...columns.flatMap((column) => [`${column.name}: ${words.csvHead.visits}`, `${column.name}: ${words.csvHead.did}`, `${column.name}: ${words.csvHead.times}`])].join(","),
    ...data.map((row) => [row.day, ...columns.flatMap((column) => [row[`${column.key}__visits`], row[`${column.key}__did`], row[`${column.key}__times`]])].join(",")),
  ].join("\n"));
  return (
    <ChartCard
      title={title}
      hint={hint}
      controls={<div className="flex flex-col gap-3">{controls}{columns.length > 1 ? ticks : null}</div>}
      exportName={exportName}
      csv={csvOf}
      caption={caption}
      enoughData={data.length > 0 && columns.length > 0}
      emptyText={emptyText}
    >
      <div data-part="conversions-by-kind">
        {series.length === 0
          ? <p className="py-10 text-center text-[12px] text-muted">{emptyText}</p>
          : <SiteLineChart data={data} series={series} sharedScale formatValue={formatValue} formatScale={(value) => (count === "rate" ? `${value}%` : String(value))} readout={readout} keepEmptyRows breakGaps />}
      </div>
    </ChartCard>
  );
}
