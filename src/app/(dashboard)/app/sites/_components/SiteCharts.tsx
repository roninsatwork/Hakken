"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { CHART_ACTIVE_BAR, CHART_CROSSHAIR, CHART_CURSOR, ChartTooltip } from "@/src/ui/components/charts/ChartTooltip";
import {
  CHART_SERIES_AMBER,
  CHART_SERIES_BLUE,
  CHART_SERIES_ORANGE,
  CHART_SERIES_ROSE,
  CHART_SERIES_SLATE,
  CHART_SERIES_TEAL,
  CHART_SERIES_VIOLET,
} from "@/src/ui/components/charts/chartPalette";
import { formatCompact } from "./siteFormat";

/**
 * The Sites screens' charts: lines over time, stacked bands, and bars — drawn
 * one way on every page, from the shared palette, in the theme's own ink.
 *
 * A line per measure gets **its own scale**, as Ahrefs draws its performance
 * chart: traffic in the thousands and a rank in the hundreds would otherwise
 * squash one into a flat line. The first two scales are labelled, left and
 * right, in their line's colour.
 */

/**
 * Series colours in drawing order. No red beside green: the owner cannot tell
 * them apart (see `chartPalette.ts`), so the site's own line is brand orange
 * and its rivals take blue, violet, amber, teal and slate.
 */
export const SITE_SERIES_COLOURS = [
  CHART_SERIES_ORANGE,
  CHART_SERIES_BLUE,
  CHART_SERIES_VIOLET,
  CHART_SERIES_AMBER,
  CHART_SERIES_TEAL,
  CHART_SERIES_SLATE,
  CHART_SERIES_ROSE,
] as const;

export type SiteSeries = {
  key: string;
  name: string;
  colour: string;
  /** A rival's line beside the site's own. */
  dashed?: boolean;
};

/**
 * Legend entries in the order the series were given. Recharts 3 sorts a
 * legend alphabetically by default, which put "11–20" before "1–3" and the
 * arrows of New and lost out of order; the order a page chose is the meaning.
 */
function inSeriesOrder(series: SiteSeries[]) {
  return (item: { dataKey?: unknown }) => series.findIndex((entry) => entry.key === item.dataKey);
}

const AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
  stroke: "currentColor",
  className: "text-muted",
} as const;

export function SiteLineChart({
  data,
  series,
  xKey = "label",
  height = 260,
  reversed = false,
  sharedScale = false,
}: {
  data: Array<Record<string, unknown>>;
  series: SiteSeries[];
  xKey?: string;
  height?: number;
  /** For positions, where 1 is best: the axis runs upwards from the top. */
  reversed?: boolean;
  /** One scale for every line, when they measure the same thing (a site and its rivals). */
  sharedScale?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height} debounce={50}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border-dim" />
        <XAxis dataKey={xKey} {...AXIS_PROPS} minTickGap={24} />
        {sharedScale ? (
          <YAxis yAxisId="shared" width={48} reversed={reversed} allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS} />
        ) : series.map((entry, index) => (
          <YAxis
            key={entry.key}
            yAxisId={entry.key}
            orientation={index === 1 ? "right" : "left"}
            hide={index > 1}
            width={48}
            reversed={reversed}
            allowDecimals={false}
            tickFormatter={formatCompact}
            {...AXIS_PROPS}
            stroke={entry.colour}
          />
        ))}
        <Tooltip cursor={CHART_CROSSHAIR} content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={inSeriesOrder(series)} />
        {series.map((entry) => (
          <Line
            key={entry.key}
            yAxisId={sharedScale ? "shared" : entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.name}
            stroke={entry.colour}
            strokeWidth={entry.dashed ? 1.5 : 2.25}
            strokeDasharray={entry.dashed ? "5 4" : undefined}
            dot={data.length < 3}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SiteStackedAreaChart({
  data,
  series,
  xKey = "label",
  height = 220,
}: {
  data: Array<Record<string, unknown>>;
  series: SiteSeries[];
  xKey?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height} debounce={50}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border-dim" />
        <XAxis dataKey={xKey} {...AXIS_PROPS} minTickGap={24} />
        <YAxis width={48} allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS} />
        <Tooltip cursor={CHART_CROSSHAIR} content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={inSeriesOrder(series)} />
        {series.map((entry) => (
          <Area
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.name}
            stackId="stack"
            stroke={entry.colour}
            fill={entry.colour}
            fillOpacity={0.35}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SiteBarChart({
  data,
  series,
  xKey = "label",
  height = 220,
  stacked = false,
  horizontal = false,
}: {
  data: Array<Record<string, unknown>>;
  series: SiteSeries[];
  xKey?: string;
  height?: number;
  stacked?: boolean;
  /** Bars along, one per row — for comparing named things (sites, countries). */
  horizontal?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height} debounce={50}>
      <BarChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 8, bottom: 0, left: horizontal ? 8 : 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} stroke="currentColor" className="text-border-dim" />
        {horizontal ? (
          <>
            <XAxis type="number" allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS} />
            <YAxis type="category" dataKey={xKey} width={140} {...AXIS_PROPS} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...AXIS_PROPS} minTickGap={12} />
            <YAxis width={48} allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS} />
          </>
        )}
        <Tooltip cursor={CHART_CURSOR} content={<ChartTooltip />} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={inSeriesOrder(series)} /> : null}
        {series.map((entry) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.name}
            fill={entry.colour}
            stackId={stacked ? "stack" : undefined}
            radius={stacked ? 0 : 3}
            activeBar={CHART_ACTIVE_BAR}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Round marks for a logarithmic axis — 1, 2 and 5 of each power of ten, or
 * just the powers when the values span more than three of them — and the
 * domain from the power below the smallest value to the one above the largest.
 */
function logAxis(values: number[]): { ticks: number[]; domain: [number, number] } {
  const positive = values.filter((value) => value > 0);
  if (positive.length === 0) return { ticks: [1, 10], domain: [1, 10] };
  const low = 10 ** Math.floor(Math.log10(Math.min(...positive)));
  const high = 10 ** Math.ceil(Math.log10(Math.max(...positive)));
  const steps = Math.log10(high / low) > 3 ? [1] : [1, 2, 5];
  const ticks: number[] = [];
  for (let decade = low; decade <= high; decade *= 10) {
    for (const step of steps) if (decade * step <= high) ticks.push(decade * step);
  }
  return { ticks, domain: [low, high === low ? low * 10 : high] };
}

export type SiteScatterGroup = {
  key: string;
  name: string;
  colour: string;
  /** Each group its own shape too, so the groups part without colour. */
  shape: "star" | "circle" | "triangle" | "diamond" | "square";
  points: Array<{ x: number; y: number; label: string }>;
};

/**
 * Websites as points: how many searches each ranks for across, and the
 * traffic they bring up.
 *
 * Both scales are logarithmic — each step along an axis is ten times the one
 * before — because a market holds a local agency and a national directory a
 * thousand times its size, and on an even scale every small site sits in one
 * dot at the corner. A point needs both figures above nothing to be placed;
 * the table beside the chart lists the rest.
 */
export function SiteScatterChart({
  groups,
  xLabel,
  yLabel,
  height = 340,
}: {
  groups: SiteScatterGroup[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const placed = groups.flatMap((group) => group.points).filter((point) => point.x > 0 && point.y > 0);
  const xAxis = logAxis(placed.map((point) => point.x));
  const yAxis = logAxis(placed.map((point) => point.y));
  return (
    <ResponsiveContainer width="100%" height={height} debounce={50}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-dim" />
        <XAxis type="number" dataKey="x" name={xLabel} scale="log" domain={xAxis.domain} ticks={xAxis.ticks} allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS}
          label={{ value: xLabel, position: "insideBottom", offset: -8, fontSize: 11, fill: "currentColor" }} />
        <YAxis type="number" dataKey="y" name={yLabel} scale="log" domain={yAxis.domain} ticks={yAxis.ticks} width={56} allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "currentColor" }} />
        <ZAxis range={[90, 90]} />
        {/* The website leads the readout: the axes already say what the numbers are. */}
        <Tooltip cursor={CHART_CROSSHAIR} content={<ChartTooltip title={(_, entries) => String(entries[0]?.payload?.label ?? "")} />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} itemSorter={(item) => groups.findIndex((group) => group.name === item.value)} />
        {groups.map((group) => (
          <Scatter
            key={group.key}
            name={group.name}
            data={group.points.filter((point) => point.x > 0 && point.y > 0).map((point) => ({ ...point, name: point.label }))}
            fill={group.colour}
            shape={group.shape}
            isAnimationActive={false}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
