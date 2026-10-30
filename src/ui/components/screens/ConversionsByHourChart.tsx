"use client";

import { useState, type ReactNode } from "react";
import { ChartCard } from "./ChartCard";
import { Checkbox } from "./Checkbox";
import { SiteLineChart, type SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { ChartReadoutTable } from "@/src/ui/components/charts/ChartReadoutTable";
import { CHART_COMPARATOR_GREY, CHART_PRIMARY_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_PALETTE } from "@/src/ui/components/charts/chartPalette";

/**
 * When people convert (the canvas "Conversions page, three ways", board
 * "Conversion", approved 2026-10-30; conversions-and-agents-build-plan-2026-10-30.md,
 * phase 3): one conversion's times at each hour of the day, a line for each
 * day of the week, added up over the dates shown. The same lines part as
 * `ConversionsByKindChart` — a tick box per line, every line ticked at
 * first, one line alone filling the area under it, the readout table on
 * hover — with the hours across the bottom in place of the days, so the page
 * does not draw a third chart that looks the same (Anthony: "we don't want
 * every chart to look the same, we need variety").
 */
export type ConversionsByHourDay = {
  key: string;
  name: string;
  /** Twenty-four hours, midnight first: the times it happened at that hour over the dates. */
  hours: readonly number[];
  /** The same for the span set against, when the Compare menu asks for it. */
  before?: readonly number[] | null;
};

/** Orange first, as every chart; then the app's series colours; then its two blues. */
const COLOURS = [CHART_SERIES_ORANGE, ...CHART_SERIES_PALETTE.filter((colour) => colour !== CHART_SERIES_ORANGE), CHART_PRIMARY_BLUE, CHART_COMPARATOR_GREY];

/** An hour as people say it: "12am", "9am", "12pm", "11pm". */
export function hourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

export function ConversionsByHourChart({ title, hint, controls, days, compare, words, exportName, caption, emptyText }: {
  title: string;
  hint?: ReactNode;
  controls?: ReactNode;
  days: readonly ConversionsByHourDay[];
  /** Whether the readout says what each hour was in the span before. */
  compare: boolean;
  words: {
    /** The readout's heading: "8pm to 9pm, every day in the dates shown". */
    hours: (from: string, to: string) => string;
    /** The readout's one column: what the figures count. */
    conversions: string;
    /** The download's first column. */
    csvHour: string;
  };
  exportName: string;
  caption?: string;
  emptyText?: string;
}) {
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const shown = days.filter((day) => !off.has(day.key));
  const colourOf = (key: string) => COLOURS[days.findIndex((day) => day.key === key) % COLOURS.length];
  const data = Array.from({ length: 24 }, (_, hour) => {
    const row: Record<string, unknown> = { hour, label: hourLabel(hour), readout: words.hours(hourLabel(hour), hourLabel((hour + 1) % 24)) };
    for (const day of days) {
      row[day.key] = day.hours[hour] ?? 0;
      if (day.before) row[`${day.key}__was`] = day.before[hour] ?? 0;
    }
    return row;
  });
  const series: SiteSeries[] = shown.map((day) => ({ key: day.key, name: day.name, colour: colourOf(day.key) }));
  const anything = days.some((day) => day.hours.some((times) => times > 0));
  const readout = ({ row, heading }: { row: Record<string, unknown>; heading: ReactNode }) => (
    <ChartReadoutTable
      heading={heading}
      against={compare ? "" : null}
      columns={[{ key: "times", label: words.conversions, tone: "band" }]}
      rows={shown.map((day) => {
        const times = Number(row[day.key] ?? 0);
        const was = row[`${day.key}__was`];
        return {
          key: day.key,
          name: day.name,
          colour: colourOf(day.key),
          cells: { times: { text: times.toLocaleString("en-GB"), quiet: times === 0, ...(compare && typeof was === "number" ? { was: was.toLocaleString("en-GB") } : {}) } },
        };
      })}
      total={shown.length > 1 ? { times: { text: shown.reduce((sum, day) => sum + Number(row[day.key] ?? 0), 0).toLocaleString("en-GB") } } : null}
    />
  );
  const ticks = (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {days.map((day) => (
        <Checkbox
          key={day.key}
          label={day.name}
          checked={!off.has(day.key)}
          onChange={(checked) => setOff((before) => {
            const next = new Set(before);
            if (checked) next.delete(day.key);
            else next.add(day.key);
            return next;
          })}
        />
      ))}
    </div>
  );
  const csv = () => [
    [words.csvHour, ...days.map((day) => day.name)].join(","),
    ...data.map((row) => [row.label, ...days.map((day) => row[day.key])].join(",")),
  ].join("\n");
  return (
    <ChartCard
      title={title}
      hint={hint}
      controls={<div className="flex flex-col gap-3">{controls}{days.length > 1 ? ticks : null}</div>}
      exportName={exportName}
      csv={csv}
      caption={caption}
      enoughData={anything}
      emptyText={emptyText}
    >
      <div data-part="conversions-by-hour">
        {series.length === 0 || !anything
          ? <p className="py-10 text-center text-[12px] text-muted">{emptyText}</p>
          : <SiteLineChart data={data} series={series} sharedScale updateKey={false} formatValue={(value) => value.toLocaleString("en-GB")} formatScale={(value) => String(value)} readout={readout} keepEmptyRows />}
      </div>
    </ChartCard>
  );
}
