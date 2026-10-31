"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  DefaultLegendContent,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  useActiveTooltipDataPoints,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  type DefaultLegendContentProps,
  type LegendPayload,
} from "recharts";
import { useMemo, useState, type ReactNode } from "react";
import { ChartReveal, revealKey } from "@/src/ui/components/screens/ChartReveal";
import { CHART_ACTIVE_BAR, CHART_CROSSHAIR, CHART_CURSOR, ChartReadoutTooltip, ChartTooltip, type ChartTooltipEntry } from "@/src/ui/components/charts/ChartTooltip";
import {
  CHART_SERIES_AMBER,
  CHART_SERIES_BLUE,
  CHART_SERIES_ORANGE,
  CHART_SERIES_ROSE,
  CHART_SERIES_SLATE,
  CHART_SERIES_TEAL,
  CHART_SERIES_VIOLET,
} from "@/src/ui/components/charts/chartPalette";
import { GoogleUpdateFrame, GoogleUpdateMarkers, googleKeyEntry, googleLegend, useGoogleUpdates, type GoogleUpdates } from "./GoogleUpdateMarkers";
import { formatCompact, formatMonthName, formatNumber, formatShortMonth } from "./siteFormat";

/**
 * The Sites screens' charts: lines over time, stacked bands, and bars — drawn
 * one way on every page, from the shared palette, in the theme's own ink.
 *
 * A line per measure gets **its own scale**, as Ahrefs draws its performance
 * chart: traffic in the thousands and a rank in the hundreds would otherwise
 * squash one into a flat line. The first two scales are labelled, left and
 * right, in their line's colour.
 *
 * A chart whose rows are dated (`datedRow`) runs over each row's day and
 * marks the Google updates inside its dates (`GoogleUpdateMarkers`): every
 * line, band and upright bar chart here, never a chart of named things.
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
  /**
   * This line's own scale runs upwards from the top: a position among others
   * that are not (Search Console's average position beside its clicks).
   */
  reversed?: boolean;
  /**
   * A key of the data whose truthy value marks that point of this line with a
   * dot: Google Analytics' Overview marks each day with a conversion on its
   * visits (google-analytics-plan.md §15, screen 2).
   */
  marks?: string;
  /**
   * Bars along only: a scale of the series' own, shared with any series of
   * the same name — times shown beside clicks on Keyword cannibalisation's
   * chart, where tens of thousands would flatten a dozen (Anthony,
   * 2026-10-12, "I want the chart to look like this"). A chart with such a
   * series writes every bar's figure on it and draws no scale, since one
   * row of marks can't speak for two.
   */
  scale?: string;
};

/**
 * Legend entries in the order the series were given. Recharts 3 sorts a
 * legend alphabetically by default, which put "11–20" before "1–3" and the
 * arrows of New and lost out of order; the order a page chose is the meaning.
 */
function inSeriesOrder(series: SiteSeries[]) {
  return (item: { dataKey?: unknown }) => series.findIndex((entry) => entry.key === item.dataKey);
}

/** A part-week's or part-month's bars (`DatedRow.part`): there, but plainly not a whole one. */
const PART_OPACITY = 0.4;

const isPart = (row: Record<string, unknown> | undefined) => row?.part === true;

/**
 * A line's point for a part-week or part-month (`DatedRow.part`): an open
 * ring in the line's colour, so its dip reads as fewer days, not a fall. A
 * point the line marks (`SiteSeries.marks`) is a solid dot in its colour,
 * kept apart from the ring. The other points draw nothing, or the usual dot
 * on a line too short to read.
 */
function PartDot({ cx, cy, stroke, payload, index, solid, marks }: { cx?: number | null; cy?: number | null; stroke?: string; payload?: Record<string, unknown>; index?: number; solid: boolean; marks?: string }) {
  // A point with no figure has no height: nothing to draw.
  if (cx === undefined || cx === null || cy === undefined || cy === null) return <g key={index} />;
  if (isPart(payload)) return <circle key={index} cx={cx} cy={cy} r={4} stroke={stroke} strokeWidth={2} className="fill-background" />;
  // A count marks bigger the more it holds (a day's conversions, ga-channel-pages-plan.md CH4); a flag, the usual dot.
  if (marks && payload?.[marks]) {
    const count = payload[marks];
    return <circle key={index} cx={cx} cy={cy} r={typeof count === "number" ? 3 + Math.min(count, 3) : 4} fill={stroke} strokeWidth={1.5} className="stroke-background" />;
  }
  return solid ? <circle key={index} cx={cx} cy={cy} r={3} fill={stroke} /> : <g key={index} />;
}

/** A line's dot in the legend, on its 32-unit grid; a part of its own, as the legend hands its icon props a circle can't take. */
function MarkDot({ colour }: { colour: string }) {
  return <circle cx={16} cy={16} r={9} fill={colour} />;
}

/** The legend's entry for a line's dots (`SiteSeries.marks`): a dot in the line's colour, and what a dot is. */
function markEntry(label: string, colour: string): LegendPayload {
  return { value: label, color: "var(--color-secondary)", dataKey: "marks", legendIcon: <MarkDot colour={colour} /> as unknown as LegendPayload["legendIcon"] };
}

function MarkedLegend({ marks, google, ...props }: DefaultLegendContentProps & { marks: LegendPayload; google: string | null }) {
  return <DefaultLegendContent {...props} payload={[...(props.payload ?? []), marks, ...(google ? [googleKeyEntry(google)] : [])]} />;
}

/** A line chart's legend: its lines, what a dot is when a line marks its points, and Google's mark when its key is kept. */
function lineLegend(google: GoogleUpdates, updateKey: boolean, marks: { label: string; colour: string } | null) {
  if (!marks) return updateKey ? googleLegend(google) : undefined;
  return <MarkedLegend marks={markEntry(marks.label, marks.colour)} google={updateKey && google.shown ? google.keyLabel : null} />;
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
  scaleOf,
  updateKey = true,
  markLabel,
  formatValue,
  seriesLabel,
  keepEmptyRows = false,
  breakGaps = false,
  readout,
  formatScale = formatCompact,
}: {
  /** How the readout's numbers read, when a whole number is not enough: a time a visit, "1m 04s" (ga-channel-pages-plan.md CH4). */
  formatValue?: (value: number, entry: ChartTooltipEntry) => ReactNode;
  /** What the readout calls a line, when its name needs the point's own figures beneath it: Conversions' visits for one conversion. */
  seriesLabel?: (entry: ChartTooltipEntry) => ReactNode;
  /**
   * Keep a line's row in the readout on a point it has no figure for, so the
   * readout always names every line and says why one is empty (Anthony,
   * 2026-10-20: "there should always be 2"). Off, Recharts drops the row.
   */
  keepEmptyRows?: boolean;
  /**
   * Break a line where a point has no figure, rather than joining across it,
   * and dot a point standing alone between two gaps so it still shows
   * (Anthony, 2026-10-20: a page's visits for one conversion joined across days
   * with no conversion, "the chart looks like it has numbers"). Off, a line
   * runs through its gaps.
   */
  breakGaps?: boolean;
  /**
   * The chart's own hover readout in place of a row a line: handed the hovered
   * point's row and its heading. A page's "Visits needed for one conversion, by
   * channel" draws a table that follows its dropdowns (Anthony, 2026-10-20:
   * Hover B, "it should adapt for drop down selection").
   */
  readout?: (point: { row: Record<string, unknown>; heading: ReactNode }) => ReactNode;
  /** How the scale's marks read, as `SiteBarChart`'s. */
  formatScale?: (value: number) => string;
  data: Array<Record<string, unknown>>;
  series: SiteSeries[];
  xKey?: string;
  height?: number;
  /**
   * What a line's dots are, named in the legend after the lines: "A day
   * with a conversion: bigger for more" (ga-channel-pages-plan.md CH4).
   */
  markLabel?: string;
  /**
   * Whether the legend names Google's update mark. Channels' pages leave it
   * out — the mark says its update on hover (Anthony, 2026-10-13: "we don't
   * need the label").
   */
  updateKey?: boolean;
  /** For positions, where 1 is best: the axis runs upwards from the top. */
  reversed?: boolean;
  /** One scale for every line, when they measure the same thing (a site and its rivals). */
  sharedScale?: boolean;
  /**
   * The scale each line is drawn on, when some share one and others have
   * their own: Google Analytics' conversions, each kind on one scale and their
   * value on its own (google-analytics-plan.md §11, board 7). Lines naming the
   * same scale share it.
   */
  scaleOf?: (entry: SiteSeries) => string;
}) {
  const google = useGoogleUpdates(data);
  // One line's dots in its colour; several lines' dots in the legend's own grey.
  const marking = series.filter((entry) => entry.marks);
  const marked = markLabel && marking.length > 0 ? { label: markLabel, colour: marking.length === 1 ? marking[0].colour : "var(--color-secondary)" } : null;
  const axisOf = (entry: SiteSeries) => (scaleOf ? scaleOf(entry) : sharedScale ? "shared" : entry.key);
  // A point with a figure between two without: with its line broken at gaps, only a dot shows it.
  const figureAt = (key: string, at: number) => data[at]?.[key] !== null && data[at]?.[key] !== undefined;
  const alone = (key: string, index: unknown) => typeof index === "number" && figureAt(key, index) && !figureAt(key, index - 1) && !figureAt(key, index + 1);
  // Each scale once, coloured as its line when it holds only one.
  const axes = [...new Map(series.map((entry) => [axisOf(entry), entry])).entries()]
    .map(([id, entry]) => ({ id, entry, alone: series.filter((other) => axisOf(other) === id).length === 1 }));
  // One line alone fills the area under it, its colour fading to nothing at the axis (Anthony, 2026-10-29, every line
  // chart, from Ahrefs' organic traffic); two or more lines stay bare, a comparison line included.
  const filled = series.length === 1 && !series[0].dashed ? series[0] : null;
  const fillId = `fill-${(filled?.key ?? "none").replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <GoogleUpdateFrame google={google}>
      <ChartReveal replay={revealKey(data, xKey)}>
        <ResponsiveContainer width="100%" height={height} debounce={50}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {filled ? (
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={filled.colour} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={filled.colour} stopOpacity={0} />
                </linearGradient>
              </defs>
            ) : null}
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border-dim" />
            <XAxis {...AXIS_PROPS} minTickGap={24} {...google.axis(xKey)} />
            {sharedScale && !scaleOf ? (
              <YAxis yAxisId="shared" width={48} reversed={reversed} allowDecimals={false} tickFormatter={formatScale} {...AXIS_PROPS} />
            ) : axes.map(({ id, entry, alone }, index) => (
              <YAxis
                key={id}
                yAxisId={id}
                orientation={index === 1 ? "right" : "left"}
                hide={index > 1}
                width={48}
                reversed={reversed || (alone && entry.reversed)}
                allowDecimals={false}
                tickFormatter={formatScale}
                {...AXIS_PROPS}
                {...(alone ? { stroke: entry.colour } : {})}
              />
            ))}
            <Tooltip
              active={google.open ? false : undefined}
              cursor={CHART_CROSSHAIR}
              filterNull={!keepEmptyRows}
              content={readout ? <ChartReadoutTooltip title={google.readoutTitle} render={readout} /> : <ChartTooltip title={google.readoutTitle} formatValue={formatValue} seriesLabel={seriesLabel} />}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={inSeriesOrder(series)} content={lineLegend(google, updateKey, marked)} />
            {filled ? (
              <Area
                yAxisId={axisOf(filled)}
                type="monotone"
                dataKey={filled.key}
                stroke="none"
                fill={`url(#${fillId})`}
                legendType="none"
                tooltipType="none"
                activeDot={false}
                dot={false}
                connectNulls={!breakGaps}
                isAnimationActive={false}
              />
            ) : null}
            {series.map((entry) => (
              <Line
                key={entry.key}
                yAxisId={axisOf(entry)}
                type="monotone"
                dataKey={entry.key}
                name={entry.name}
                stroke={entry.colour}
                strokeWidth={entry.dashed ? 1.5 : 2.25}
                strokeDasharray={entry.dashed ? "5 4" : undefined}
                dot={entry.marks || breakGaps || data.some(isPart) ? (props: Record<string, unknown>) => <PartDot {...props} solid={data.length < 3 || (breakGaps && alone(entry.key, props.index))} marks={entry.marks} /> : data.length < 3}
                connectNulls={!breakGaps}
                isAnimationActive={false}
              />
            ))}
            <GoogleUpdateMarkers google={google} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartReveal>
    </GoogleUpdateFrame>
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
  const google = useGoogleUpdates(data);
  return (
    <GoogleUpdateFrame google={google}>
      <ChartReveal replay={revealKey(data, xKey)}>
        <ResponsiveContainer width="100%" height={height} debounce={50}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border-dim" />
            <XAxis {...AXIS_PROPS} minTickGap={24} {...google.axis(xKey)} />
            <YAxis width={48} allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS} />
            <Tooltip active={google.open ? false : undefined} cursor={CHART_CROSSHAIR} content={<ChartTooltip title={google.readoutTitle} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={inSeriesOrder(series)} content={googleLegend(google)} />
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
            <GoogleUpdateMarkers google={google} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartReveal>
    </GoogleUpdateFrame>
  );
}

/**
 * Bars along are a set depth, 4px apart within a row, rather than whatever
 * the chart's height left them (Anthony, 2026-09-30); the chart grows with
 * its rows instead. 24px since 2026-10-12, on every bars-along chart in
 * Insights, Visibility, Search Console and Analytics (Anthony: "fatter
 * bars, these are too weedy and hard to read"; it was 14px).
 */
const ALONG_BAR = 24;
const ALONG_BAR_GAP = 4;
/** The room above and below each row's bars, as the Overview's rows have. */
const ALONG_ROW_SPACE = 16;

export function SiteBarChart({
  data,
  series,
  xKey = "label",
  height = 220,
  stacked = false,
  horizontal = false,
  formatValue,
  formatScale,
  seriesLabel,
  line,
  highlight,
  labels,
  divided = false,
  updateKey = true,
  faded,
  readout,
}: {
  data: Array<Record<string, unknown>>;
  series: SiteSeries[];
  xKey?: string;
  /** Whether the legend names Google's update mark (`SiteLineChart`'s `updateKey`). */
  updateKey?: boolean;
  /**
   * Rows drawn faint: the span before beside the dates chosen, on one
   * chart — a channel's key events a day (ga-channel-pages-plan.md CH7).
   */
  faded?: (row: Record<string, unknown>) => boolean;
  /**
   * The chart's own hover readout in place of a row a series, as `SiteLineChart`'s: handed the hovered bar's row and
   * its heading. A page's "Visitors to this page" draws its table (page-visitors-explorer-plan.md).
   */
  readout?: (point: { row: Record<string, unknown>; heading: ReactNode }) => ReactNode;
  /**
   * Each bar's figure written on it, so no figure needs a hover (Anthony,
   * 2026-10-12, of Insights' charts: "you have to hover to see the
   * context"): how a series' figure reads, null to leave that series'
   * bars unwritten. A figure too wide for its bar is left to the readout.
   */
  labels?: (value: number, key: string, row: Record<string, unknown>) => string | null;
  /**
   * Rows drawn in another colour: the website itself among its rivals on
   * Insights' leaderboards ("You in orange", insights-analyst-plan.md §5,
   * drawn and approved 2026-10-11). Extended here rather than drawn again.
   */
  highlight?: { colour: string; rows: (row: Record<string, unknown>) => boolean };
  /** Bars along only: a line between rows, where each row is a set of bars about one thing (Keyword cannibalisation's groups). */
  divided?: boolean;
  /** Upright bars only: bars along size themselves to their rows. */
  height?: number;
  stacked?: boolean;
  /** Bars along, one per row — for comparing named things (sites, countries). */
  horizontal?: boolean;
  /** How the hover readout's numbers read, when a grouped whole number is not enough (a share, a count beside it). */
  formatValue?: (value: number, entry: ChartTooltipEntry) => ReactNode;
  /**
   * How the value scale's marks read, for a rate or a share — "0.8%" — whose
   * marks fall between whole numbers. Without it the marks are whole counts,
   * which drew a click rate topping 0.8 against a scale to 4 (2026-10-04).
   */
  formatScale?: (value: number) => string;
  /** What each readout line is called, when more than the series name. */
  seriesLabel?: (entry: ChartTooltipEntry) => ReactNode;
  /**
   * A line over upright bars, on a scale of its own on the right in its
   * colour — Your reviews' average stars over its reviews a month
   * (discovery-local-reputation-ai-plan.md, D18). Added 2026-10-09: the one
   * chart drawn so, extended here rather than drawn again.
   */
  line?: SiteSeries & { domain?: [number, number]; formatScale?: (value: number) => string };
}) {
  const scale = formatScale ? { allowDecimals: true, tickFormatter: formatScale } : { allowDecimals: false, tickFormatter: formatCompact };
  // Bars along compare named things; upright bars may run over dates.
  const google = useGoogleUpdates(data, { dated: !horizontal });
  // How wide the chart is drawn, for an axis of months worded to the room each bar has.
  const [drawnWidth, setDrawnWidth] = useState(0);
  const months = !horizontal && data.length > 0 && data.every((row) => typeof row.month === "string");
  // Each series' figures, worked out here and drawn the same way between draws: the chart library layers
  // each label list and re-layers it when its drawing changes, which looped on a split chart's rivals
  // (2026-10-12). A series with no figure to write gets no label list at all.
  //
  // The chart library draws no bar for a nought, and numbers its labels by the bars it drew, not by the rows: each
  // series keeps the rows it draws, so the third bar drawn is given the third drawn row's figure, never the row after
  // a nought's (2026-10-13: an article's "1 from 593 visits" written beside the next article's bar).
  const labelWords = JSON.stringify(labels ? series.map((entry) => [entry.key, data.map((row) => {
    const value = Number(row[entry.key]);
    return Number.isFinite(value) ? labels(value, entry.key, row) : null;
  }), drawnRows(data, entry.key)]) : []);
  const labelContents = useMemo(() => new Map((JSON.parse(labelWords) as Array<[string, Array<string | null>, number[]]>).map(([key, words, drawn]) => {
    const widest = words.reduce((most, word) => Math.max(most, word?.length ?? 0), 0);
    return [key, widest > 0 ? barLabel((_value, index) => words[drawn[index] ?? index] ?? null, { horizontal, stacked, widest }) : null] as const;
  })), [labelWords, horizontal, stacked]);
  // Bars along keep room at their ends for the widest figure written there, so a longer one —
  // "about 207 (204 more)" — is not cut at the chart's edge (2026-10-12); a short one keeps the usual room.
  const labelRoom = useMemo(() => {
    const widest = (JSON.parse(labelWords) as Array<[string, Array<string | null>, number[]]>).reduce((most, [, words]) => Math.max(most, ...words.map((word) => word?.length ?? 0)), 0);
    return Math.max(BAR_LABEL_ROOM, Math.ceil(widest * LABEL_LETTER) + 12);
  }, [labelWords]);
  if (line && !horizontal) return <BarLineChart data={data} series={series} line={line} xKey={xKey} height={height} scale={scale} google={google} formatValue={formatValue} seriesLabel={seriesLabel} />;
  const barsPerRow = stacked ? 1 : series.length;
  const rowHeight = barsPerRow * ALONG_BAR + (barsPerRow - 1) * ALONG_BAR_GAP + ALONG_ROW_SPACE;
  // Bars along with a series on a scale of its own: each scale an axis of its own, none of them drawn.
  const ownScales = horizontal ? [...new Set(series.flatMap((entry) => (entry.scale ? [entry.scale] : [])))] : [];
  const unscaled = ownScales.length > 0;
  // The rows, then the margin, the scale along the bottom and the legend under it.
  const alongHeight = data.length * rowHeight + 8 + (unscaled ? 0 : 30) + (series.length > 1 ? 30 : 0);
  // A line between rows: where one row's band ends and the next begins.
  const rowLines = divided && horizontal && data.length > 1
    ? ({ offset }: { offset: { top?: number; height?: number } }) => Array.from({ length: data.length - 1 }, (_, at) => (offset.top ?? 0) + ((offset.height ?? 0) / data.length) * (at + 1))
    : undefined;
  return (
    <GoogleUpdateFrame google={google}>
      {/* Upright bars rise; bars along grow from the left, as they read. */}
      <ChartReveal replay={revealKey(data, xKey)} motion={horizontal ? "along" : "rise"}>
        <ResponsiveContainer width="100%" height={horizontal ? alongHeight : height} debounce={50} onResize={months ? (width) => setDrawnWidth(width) : undefined}>
          <BarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
            barSize={horizontal ? ALONG_BAR : undefined}
            barGap={horizontal ? ALONG_BAR_GAP : undefined}
            margin={{ top: labels && !horizontal && !stacked ? 20 : 8, right: labels && horizontal ? (stacked ? BAR_LABEL_ROOM : labelRoom) : 8, bottom: 0, left: horizontal ? 8 : 0 }}
          >
            {rowLines ? (
              <CartesianGrid vertical={false} horizontal horizontalCoordinatesGenerator={rowLines} stroke="currentColor" className="text-border-dim" />
            ) : (
              <CartesianGrid strokeDasharray="3 3" vertical={horizontal && !unscaled} horizontal={!horizontal} stroke="currentColor" className="text-border-dim" />
            )}
            {horizontal ? (
              <>
                <XAxis type="number" {...scale} {...AXIS_PROPS} hide={unscaled} />
                {ownScales.map((own) => <XAxis key={own} xAxisId={own} type="number" hide />)}
                <YAxis type="category" dataKey={xKey} width={ALONG_NAMES} {...AXIS_PROPS} tick={<AlongTick />} interval={0} />
              </>
            ) : (
              <>
                {months ? (
                  <XAxis
                    {...AXIS_PROPS}
                    {...google.axis(xKey)}
                    interval={0}
                    height={(google.shown ? GOOGLE_AXIS_HEIGHT : 8) + MONTH_TICK_HEIGHT}
                    tick={<MonthTick months={data.map((row) => String(row.month))} room={(drawnWidth - 56) / data.length} />}
                  />
                ) : (
                  <XAxis {...AXIS_PROPS} minTickGap={12} {...google.axis(xKey)} />
                )}
                <YAxis width={48} {...scale} {...AXIS_PROPS} />
              </>
            )}
            <Tooltip
              active={google.open ? false : undefined}
              cursor={CHART_CURSOR}
              content={readout ? <ChartReadoutTooltip title={google.readoutTitle} render={readout} /> : <ChartTooltip title={google.readoutTitle} formatValue={formatValue} seriesLabel={seriesLabel} />}
            />
            {series.length > 1 || (google.shown && updateKey) ? (
              <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={inSeriesOrder(series)} content={updateKey ? googleLegend(google, { seriesShown: series.length > 1 }) : undefined} />
            ) : null}
            {series.map((entry) => (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                name={entry.name}
                fill={entry.colour}
                {...(entry.scale && horizontal ? { xAxisId: entry.scale } : {})}
                stackId={stacked ? "stack" : undefined}
                radius={stacked ? 0 : 3}
                activeBar={CHART_ACTIVE_BAR}
                isAnimationActive={false}
              >
                {data.some(isPart) || highlight || faded
                  ? data.map((row, index) => <Cell key={index} fillOpacity={isPart(row) || faded?.(row) ? PART_OPACITY : 1} {...(highlight?.rows(row) ? { fill: highlight.colour } : {})} />)
                  : null}
                {labelContents.get(entry.key) ? <LabelList dataKey={entry.key} content={labelContents.get(entry.key)!} /> : null}
              </Bar>
            ))}
            <GoogleUpdateMarkers google={google} />
          </BarChart>
        </ResponsiveContainer>
      </ChartReveal>
    </GoogleUpdateFrame>
  );
}

/** The room the names beside bars along take, and about how many letters fit a line of it. */
const ALONG_NAMES = 140;
const ALONG_NAME_LETTERS = 22;
/** Where a long name may break: after a space, a hyphen, a slash or a dot. */
const NAME_BREAKS = [" ", "-", "/", ".", "_"];

/**
 * A long name on two lines, broken after a space, hyphen, slash or dot
 * where one falls in the first line, cut with "…" only past two lines —
 * never cut at its start, as "/european-accessibility-act-uk/" was
 * (Anthony, 2026-10-12). The readout shows it whole.
 */
export function wrapName(name: string, most: number = ALONG_NAME_LETTERS): string[] {
  if (name.length <= most) return [name];
  const at = Math.max(...NAME_BREAKS.map((mark) => name.lastIndexOf(mark, most - 1)));
  const cut = at >= most / 3 ? at + 1 : most;
  const rest = name.slice(cut).trim();
  return [name.slice(0, cut).trim(), rest.length <= most ? rest : `${rest.slice(0, most - 1)}…`];
}

/** A name beside its bars along, on one line or two (`wrapName`), centred on its row. */
export function AlongTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: unknown } }) {
  if (x === undefined || y === undefined || !payload) return null;
  const lines = wrapName(String(payload.value ?? ""));
  return (
    <text x={x} y={y} textAnchor="end" fontSize={11} fill="currentColor">
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? (lines.length === 1 ? "0.355em" : "-0.3em") : "1.25em"}>{line}</tspan>
      ))}
    </text>
  );
}

/** The room under the axis line a month's two lines take. */
const MONTH_TICK_HEIGHT = 30;
/** Below the axis line, the room the Google update markers take before the months. */
const GOOGLE_AXIS_HEIGHT = 22;
/** Room each month needs: one line, "Dec 24"; two, "Dec" over its year; less, every few months. */
const MONTH_ONE_LINE = 48;
const MONTH_TWO_LINES = 26;

/**
 * A month along a bar chart's axis, worded to the room each bar has
 * (Anthony, 2026-10-12: "they are responsive but the labels are not"):
 * "Dec 24" under every bar where it fits; "Dec" with the year beneath at the
 * first month and each January where only the month fits; and on a narrow
 * phone every second or third month, so none overlap.
 */
function MonthTick({ x, y, payload, index, months, room }: { x?: number; y?: number; payload?: { value: string }; index?: number; months: string[]; room: number }) {
  if (x === undefined || y === undefined || index === undefined || !payload) return null;
  const month = months[index] ?? String(payload.value).slice(0, 7);
  const every = room >= MONTH_TWO_LINES || room <= 0 ? 1 : Math.ceil(MONTH_TWO_LINES / room);
  if (index % every !== 0) return null;
  const first = index === 0;
  // The year under the first month shown and each January; with months left out, under the first shown of each year.
  const yearShown = first || (every === 1 ? month.endsWith("-01") : months[index - every]?.slice(0, 4) !== month.slice(0, 4));
  return (
    <g transform={`translate(${x},${y})`} className="text-muted">
      {room >= MONTH_ONE_LINE || room <= 0 ? (
        <text textAnchor="middle" dy={10} fontSize={11} fill="currentColor">{formatShortMonth(month)}</text>
      ) : (
        <>
          <text textAnchor="middle" dy={10} fontSize={11} fill="currentColor">{formatMonthName(month)}</text>
          {yearShown ? <text textAnchor="middle" dy={23} fontSize={10} fill="currentColor">{month.slice(0, 4)}</text> : null}
        </>
      )}
    </g>
  );
}

/** Room right of bars along for the figure written at each one's end. */
const BAR_LABEL_ROOM = 56;
/** About how wide a figure's letters are at the labels' size, to leave off one its bar cannot hold. */
const LABEL_LETTER = 6.7;

/**
 * The rows a series draws a bar for, in order: those whose figure is a number
 * other than nought. The chart library leaves out a bar with no width or
 * height, and numbers the labels of the bars it drew.
 */
export function drawnRows(data: ReadonlyArray<Record<string, unknown>>, key: string): number[] {
  return data.flatMap((row, at) => {
    const value = Number(row[key]);
    return Number.isFinite(value) && value !== 0 ? [at] : [];
  });
}

type BarLabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown; index?: number };

/**
 * A bar's figure, as `labels` words it: at the end of a bar along, above an
 * upright bar, inside a stacked one. Upright bars too narrow for the
 * widest figure carry none, so a chart is never half written, as on a
 * phone's many months; a stacked part too short for its figure goes without.
 */
function barLabel(word: (value: number, index: number) => string | null, { horizontal, stacked, widest }: { horizontal: boolean; stacked: boolean; widest: number }) {
  function BarLabel(props: BarLabelProps) {
    const value = typeof props.value === "number" ? props.value : Number(props.value);
    const x = Number(props.x ?? 0), y = Number(props.y ?? 0), width = Number(props.width ?? 0), height = Number(props.height ?? 0);
    if (!Number.isFinite(value)) return null;
    const text = word(value, props.index ?? 0);
    if (!text) return null;
    const wide = text.length * LABEL_LETTER;
    const look = { fontSize: 11, className: "fill-foreground font-mono" } as const;
    if (horizontal && !stacked) return <text x={x + width + 6} y={y + height / 2} dominantBaseline="central" {...look}>{text}</text>;
    if (horizontal) return wide + 6 <= width && height >= 12 ? <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" {...look}>{text}</text> : null;
    // Above its bar a figure may use a little of the gap beside it, never so much that neighbours touch.
    if (widest * LABEL_LETTER + 4 > width * 1.15) return null;
    if (stacked) return height >= 14 ? <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" {...look}>{text}</text> : null;
    return <text x={x + width / 2} y={y - 5} textAnchor="middle" {...look}>{text}</text>;
  }
  return BarLabel;
}

/** Upright bars on the left scale and one line on the right: `SiteBarChart`'s `line`. */
function BarLineChart({ data, series, line, xKey, height, scale, google, formatValue, seriesLabel }: {
  data: Array<Record<string, unknown>>;
  series: SiteSeries[];
  line: SiteSeries & { domain?: [number, number]; formatScale?: (value: number) => string };
  xKey: string;
  height: number;
  scale: { allowDecimals: boolean; tickFormatter: (value: number) => string };
  google: ReturnType<typeof useGoogleUpdates>;
  formatValue?: (value: number, entry: ChartTooltipEntry) => ReactNode;
  seriesLabel?: (entry: ChartTooltipEntry) => ReactNode;
}) {
  const every = [...series, line];
  return (
    <GoogleUpdateFrame google={google}>
      <ChartReveal replay={revealKey(data, xKey)} motion="rise">
        <ResponsiveContainer width="100%" height={height} debounce={50}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border-dim" />
            <XAxis {...AXIS_PROPS} minTickGap={12} {...google.axis(xKey)} />
            <YAxis yAxisId="bars" width={48} {...scale} {...AXIS_PROPS} />
            <YAxis
              yAxisId="line"
              orientation="right"
              width={48}
              allowDecimals
              domain={line.domain ?? ["auto", "auto"]}
              // A whole-number scale across a set range: 0 to 5 stars reads 0, 1, 2, 3, 4, 5.
              {...(line.domain ? { tickCount: line.domain[1] - line.domain[0] + 1 } : {})}
              tickFormatter={line.formatScale ?? formatCompact}
              {...AXIS_PROPS}
              stroke={line.colour}
            />
            <Tooltip active={google.open ? false : undefined} cursor={CHART_CURSOR} content={<ChartTooltip title={google.readoutTitle} formatValue={formatValue} seriesLabel={seriesLabel} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} itemSorter={inSeriesOrder(every)} content={googleLegend(google, { seriesShown: true })} />
            {series.map((entry) => (
              <Bar key={entry.key} yAxisId="bars" dataKey={entry.key} name={entry.name} fill={entry.colour} radius={3} activeBar={CHART_ACTIVE_BAR} isAnimationActive={false} />
            ))}
            <Line yAxisId="line" type="monotone" dataKey={line.key} name={line.name} stroke={line.colour} strokeWidth={2.25} dot={false} connectNulls isAnimationActive={false} />
            <GoogleUpdateMarkers google={google} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartReveal>
    </GoogleUpdateFrame>
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

/** A slice of a pie: its name, its figure and its colour. */
export type SitePieSlice = { key: string; name: string; value: number; colour: string };

/**
 * Shares at a glance, as a ring (ask-hakken-every-chart-plan-2026-10-31.md, drawn and signed off 2026-10-31 — canvas
 * "Ask Hakken, every kind of chart", board 1): each slice in the series colours, and beside the ring each one's name,
 * figure and share of the whole, so no figure needs a hover; a hover says the same in the app's own readout.
 */
export function SitePieChart({ slices, formatValue = formatNumber, size = 200 }: {
  slices: SitePieSlice[];
  /** How a slice's figure reads beside its name: a whole number unless said. */
  formatValue?: (value: number) => string;
  size?: number;
}) {
  const whole = slices.reduce((sum, slice) => sum + slice.value, 0);
  const shareOf = (value: number) => (whole > 0 ? `${((value / whole) * 100).toFixed(1)}%` : "");
  return (
    <ChartReveal replay={slices.map((slice) => `${slice.key}:${slice.value}`).join("|")} motion="fade">
      <div className="flex flex-wrap items-center gap-6">
        {/* A ring is as wide as it is tall, so it is drawn at its own size rather than filling a box. */}
        <div className="shrink-0">
          <PieChart width={size} height={size}>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="63%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {slices.map((slice) => <Cell key={slice.key} fill={slice.colour} />)}
            </Pie>
            <Tooltip content={<ChartTooltip formatValue={(value) => `${formatValue(value)} · ${shareOf(value)}`} />} />
          </PieChart>
        </div>
        <ul className="flex min-w-0 flex-col gap-2 text-[13px]">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: slice.colour }} aria-hidden />
              <span className="text-foreground">{slice.name}</span>
              <span className="font-mono text-secondary">{formatValue(slice.value)}</span>
              <span className="font-mono text-muted">{shareOf(slice.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartReveal>
  );
}

export type SiteScatterGroup = {
  key: string;
  name: string;
  colour: string;
  /** Write each point's name beside its dot, on the chart itself: the Overview's competitors. */
  labelled?: boolean;
  points: Array<{ x: number; y: number; label: string }>;
};

/** A dot's radius: every point is the same plain circle, area 90 (the ZAxis below). */
const DOT_RADIUS = 5.5;

/**
 * The ring round the dot under the pointer, as a hovered bar wears
 * `CHART_ACTIVE_BAR`. Drawn here from the point the tooltip is showing rather
 * than with each Scatter's `activeShape`: recharts 3.8 matches that by the
 * point's place in its own group, so hovering one website ringed the first,
 * second… of every other group too.
 */
function ScatterActiveRing() {
  const active = useActiveTooltipDataPoints<{ x?: unknown; y?: unknown }>();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const point = active?.[0];
  if (!point || !xScale || !yScale) return null;
  const cx = xScale(point.x);
  const cy = yScale(point.y);
  if (cx === undefined || cy === undefined) return null;
  return (
    <circle cx={cx} cy={cy} r={DOT_RADIUS + 2} fill="none" stroke="currentColor" strokeWidth={2} className="text-foreground" pointerEvents="none" />
  );
}

/** Roughly how wide one character of an 11px name is — enough to keep names apart, not to typeset them. */
const LABEL_CHAR_WIDTH = 6.4;
const LABEL_HEIGHT = 13;
const LABEL_GAP = 6;

type Box = { left: number; right: number; top: number; bottom: number };
type LabelAnchor = "start" | "middle" | "end";

function overlaps(one: Box, other: Box): boolean {
  return one.left < other.right && other.left < one.right && one.top < other.bottom && other.top < one.bottom;
}

/**
 * Each labelled point's name beside its dot, on whichever side is clear of
 * the other dots and names — right, left, above, below, then the corners — so
 * two websites close together both stay readable. Drawn inside the chart from
 * its own scales, since only the chart knows where each dot landed.
 *
 * Names rather than a legend of colours or shapes: the owner cannot tell red
 * from green, and did not like a shape per website (Anthony, 2026-09-25: "not
 * really a fan of the design of the icons on the graphs").
 */
function ScatterLabels({ points }: { points: Array<{ x: number; y: number; label: string }> }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const area = usePlotArea();
  if (!xScale || !yScale || !area) return null;
  const dots = points.flatMap((point) => {
    const cx = xScale(point.x);
    const cy = yScale(point.y);
    return cx === undefined || cy === undefined ? [] : [{ label: point.label, cx, cy }];
  });
  const taken: Box[] = dots.map((dot) => ({
    left: dot.cx - DOT_RADIUS, right: dot.cx + DOT_RADIUS, top: dot.cy - DOT_RADIUS, bottom: dot.cy + DOT_RADIUS,
  }));
  const inside = (box: Box) =>
    box.left >= area.x && box.right <= area.x + area.width && box.top >= area.y && box.bottom <= area.y + area.height;
  const placed = dots.map((dot) => {
    const width = dot.label.length * LABEL_CHAR_WIDTH;
    const away = DOT_RADIUS + LABEL_GAP;
    const sides: Array<{ anchor: LabelAnchor; x: number; y: number }> = [
      { anchor: "start", x: dot.cx + away, y: dot.cy },
      { anchor: "end", x: dot.cx - away, y: dot.cy },
      { anchor: "middle", x: dot.cx, y: dot.cy - away - LABEL_HEIGHT / 2 },
      { anchor: "middle", x: dot.cx, y: dot.cy + away + LABEL_HEIGHT / 2 },
      { anchor: "start", x: dot.cx + DOT_RADIUS, y: dot.cy - away - LABEL_HEIGHT / 2 },
      { anchor: "start", x: dot.cx + DOT_RADIUS, y: dot.cy + away + LABEL_HEIGHT / 2 },
      { anchor: "end", x: dot.cx - DOT_RADIUS, y: dot.cy - away - LABEL_HEIGHT / 2 },
      { anchor: "end", x: dot.cx - DOT_RADIUS, y: dot.cy + away + LABEL_HEIGHT / 2 },
    ];
    const boxOf = (side: (typeof sides)[number]): Box => {
      const left = side.anchor === "start" ? side.x : side.anchor === "end" ? side.x - width : side.x - width / 2;
      return { left, right: left + width, top: side.y - LABEL_HEIGHT / 2, bottom: side.y + LABEL_HEIGHT / 2 };
    };
    // The first clear side; failing that the first on the chart; failing that the right.
    const side = sides.find((entry) => inside(boxOf(entry)) && !taken.some((box) => overlaps(boxOf(entry), box)))
      ?? sides.find((entry) => inside(boxOf(entry)))
      ?? sides[0];
    taken.push(boxOf(side));
    return { ...side, label: dot.label };
  });
  return (
    <g className="text-secondary" pointerEvents="none">
      {placed.map((entry) => (
        <text key={entry.label} x={entry.x} y={entry.y} textAnchor={entry.anchor} dominantBaseline="central" fontSize={11} fill="currentColor">
          {entry.label}
        </text>
      ))}
    </g>
  );
}

/**
 * Websites as points: how many searches each ranks for across, and the
 * traffic they bring up. Every point is the same plain dot in its group's
 * colour; a labelled group names each of its dots, and a chart whose every
 * group is labelled needs no legend.
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
  readout,
  height = 340,
}: {
  groups: SiteScatterGroup[];
  xLabel: string;
  yLabel: string;
  /** Short names for the two numbers in the hover readout, where an axis's own name is too long to fit it. */
  readout?: { x: string; y: string };
  height?: number;
}) {
  const onChart = (point: { x: number; y: number }) => point.x > 0 && point.y > 0;
  const placed = groups.flatMap((group) => group.points).filter(onChart);
  const xAxis = logAxis(placed.map((point) => point.x));
  const yAxis = logAxis(placed.map((point) => point.y));
  const named = groups.filter((group) => group.labelled).flatMap((group) => group.points).filter(onChart);
  const legend = groups.some((group) => !group.labelled);
  const shown = groups.map((group) => `${group.key}:${group.points.length}`).join("|");
  return (
    // The dots run along no dates, so they fade in.
    <ChartReveal replay={shown} motion="fade">
      <ResponsiveContainer width="100%" height={height} debounce={50}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-dim" />
          <XAxis type="number" dataKey="x" name={xLabel} scale="log" domain={xAxis.domain} ticks={xAxis.ticks} allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS}
            label={{ value: xLabel, position: "insideBottom", offset: -8, fontSize: 11, fill: "currentColor" }} />
          <YAxis type="number" dataKey="y" name={yLabel} scale="log" domain={yAxis.domain} ticks={yAxis.ticks} width={56} allowDecimals={false} tickFormatter={formatCompact} {...AXIS_PROPS}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "currentColor" }} />
          <ZAxis range={[90, 90]} />
          {/* The website leads the readout: the axes already say what the numbers are. */}
          <Tooltip
            cursor={CHART_CROSSHAIR}
            content={(
              <ChartTooltip
                title={(_, entries) => String(entries[0]?.payload?.label ?? "")}
                // Whole numbers, in the site's own way of writing them: an estimate's decimals read as thousands in Italian.
                formatValue={(value) => formatNumber(value)}
                seriesLabel={(entry) => (entry.dataKey === "x" ? readout?.x ?? xLabel : readout?.y ?? yLabel)}
              />
            )}
          />
          {legend ? (
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} itemSorter={(item) => groups.findIndex((group) => group.name === item.value)} />
          ) : null}
          {groups.map((group) => (
            <Scatter
              key={group.key}
              name={group.name}
              data={group.points.filter(onChart).map((point) => ({ ...point, name: point.label }))}
              fill={group.colour}
              isAnimationActive={false}
            />
          ))}
          {named.length > 0 ? <ScatterLabels points={named} /> : null}
          <ScatterActiveRing />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartReveal>
  );
}
