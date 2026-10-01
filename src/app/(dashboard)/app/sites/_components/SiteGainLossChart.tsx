"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, useXAxisScale, useYAxisScale } from "recharts";
import { CHART_ACTIVE_BAR, CHART_CURSOR, ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { GoogleUpdateFrame, GoogleUpdateKey, GoogleUpdateMarkers, useGoogleUpdates } from "./GoogleUpdateMarkers";
import { formatCompact, formatNumber } from "./siteFormat";

/**
 * Searches gained and lost at each check, on one chart: new and up above the
 * line, down and lost below it, and the net beside each bar — New and lost
 * keywords' chart, as agreed with Anthony on 2026-09-27 ("A + B together").
 * A check with nothing before it to compare with — the site's first, or the
 * first day its whole list was held — is drawn as an empty outline and named,
 * never as a tall bar of "new" searches that were only new to the list.
 * The Google updates inside its dates are marked on it, as on every dated
 * Sites chart (`GoogleUpdateMarkers`).
 */

export type GainLossKind = "new" | "up" | "down" | "lost";

export type GainLossStep = {
  /** The step's day: the axis key, one per bar. */
  day: string;
  /** The newest day the step covers, when more than its first. */
  lastDay?: string;
  /** What the axis calls it. */
  label: string;
  /** Under it, stepping daily: what the check covered. */
  detail?: string;
  /** The step's moves; null for a start, drawn as an outline. */
  counts: Record<GainLossKind, number> | null;
  /** A start's name in its outline: "first", "whole list". */
  startLabel?: string;
  /** A start's explanation, on hover. */
  startNote?: string;
};

export type GainLossSeries = { key: GainLossKind; name: string; colour: string };

/** Above the line, then below it: the order the bars stack in. */
const GAINED: readonly GainLossKind[] = ["new", "up"];
const LOST: readonly GainLossKind[] = ["down", "lost"];

/** A bar is half its step's width, and never wider than this. */
const MAX_BAR = 44;
const BAR_SHARE = 0.5;
/** Too narrow for a number beside every bar: the net is then read on hover. */
const NET_MIN_STEP = 30;
/** How tall a start's outline stands. */
const START_HEIGHT = 16;

const AXIS_PROPS = { tickLine: false, axisLine: false, stroke: "currentColor", className: "text-muted" } as const;

type Datum = { day: string; net: number } & Record<GainLossKind, number>;

const signed = (value: number) => (value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : "0");

/**
 * Round marks either side of the line, the line itself among them: a step of
 * 1, 2 or 5 of a power of ten, and at least one step each way, so a range
 * with nothing gained or lost still has a line to stand on.
 */
export function gainLossTicks(gained: number, lost: number): number[] {
  const rough = Math.max(gained, lost, 1) / 2;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((times) => times * power).find((candidate) => candidate >= rough) ?? power * 10);
  const low = -Math.max(1, Math.ceil(lost / step)) * step;
  const high = Math.max(1, Math.ceil(gained / step)) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high; value += step) ticks.push(value);
  return ticks;
}

/** Each step's net beside its bar, and each start's outline: drawn from the chart's own scales. */
function StepMarks({ steps }: { steps: GainLossStep[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  const zero = yScale(0);
  if (zero === undefined) return null;
  return (
    <g pointerEvents="none">
      {steps.map((step) => {
        const start = xScale(step.day, { position: "start" });
        const middle = xScale(step.day, { position: "middle" });
        const end = xScale(step.day, { position: "end" });
        if (start === undefined || middle === undefined || end === undefined) return null;
        const width = Math.min(MAX_BAR, (end - start) * BAR_SHARE);
        if (!step.counts) {
          return (
            <g key={step.day} className="text-muted">
              <rect x={middle - width / 2} y={zero - START_HEIGHT} width={width} height={START_HEIGHT} rx={3} fill="none" stroke="currentColor" strokeDasharray="3 3" />
              {end - start >= 56 && step.startLabel ? (
                <text x={middle} y={zero - START_HEIGHT - 5} textAnchor="middle" fontSize={11} fill="currentColor">{step.startLabel}</text>
              ) : null}
            </g>
          );
        }
        if (end - start < NET_MIN_STEP) return null;
        const net = step.counts.new + step.counts.up - step.counts.down - step.counts.lost;
        return (
          <text key={step.day} x={middle + width / 2 + 4} y={zero} dominantBaseline="central" fontSize={11} fill="currentColor" className="text-foreground">
            {signed(net)}
          </text>
        );
      })}
    </g>
  );
}

/** The day under each bar, and what the check covered under that when there is room. */
function StepTick({ x, y, payload, steps }: { x?: number; y?: number; payload?: { value: string }; steps: GainLossStep[] }) {
  const step = steps.find((entry) => entry.day === payload?.value);
  if (!step || x === undefined || y === undefined) return null;
  return (
    <g transform={`translate(${x},${y})`} className="text-muted">
      <text textAnchor="middle" dy={10} fontSize={11} fill="currentColor">{step.label}</text>
      {step.detail ? <text textAnchor="middle" dy={24} fontSize={10} fill="currentColor">{step.detail}</text> : null}
    </g>
  );
}

function StepReadout({ active, label, steps, series, netLabel }: {
  active?: boolean;
  label?: string | number;
  steps: GainLossStep[];
  series: GainLossSeries[];
  netLabel: string;
}) {
  const step = steps.find((entry) => entry.day === label);
  if (!active || !step) return null;
  const heading = step.detail ? `${step.label} · ${step.detail}` : step.label;
  if (!step.counts) {
    return (
      <ChartTooltipSurface heading={heading}>
        <span className="text-[12px] text-secondary">{step.startNote}</span>
      </ChartTooltipSurface>
    );
  }
  const counts = step.counts;
  return (
    <ChartTooltipSurface heading={heading}>
      {series.map((entry) => (
        <ChartTooltipRow key={entry.key} colour={entry.colour} value={formatNumber(counts[entry.key])} label={entry.name} />
      ))}
      <ChartTooltipRow value={signed(counts.new + counts.up - counts.down - counts.lost)} label={netLabel} />
    </ChartTooltipSurface>
  );
}

export function SiteGainLossChart({ steps, series, netLabel, startLegend, height = 280 }: {
  steps: GainLossStep[];
  /** New, up, down and lost: their names and colours, in that order. */
  series: GainLossSeries[];
  /** What the net is called on hover. */
  netLabel: string;
  /** What an outline means, in the legend when there is one. */
  startLegend: string;
  height?: number;
}) {
  const data: Datum[] = steps.map((step) => {
    const counts = step.counts;
    // A start draws no bar, but says so in numbers: a value left out spoils the stacked scale for every bar.
    if (!counts) return { day: step.day, new: 0, up: 0, down: 0, lost: 0, net: 0 };
    return {
      day: step.day,
      new: counts.new,
      up: counts.up,
      // Below the line: a count drawn downwards.
      down: -counts.down,
      lost: -counts.lost,
      net: counts.new + counts.up - counts.down - counts.lost,
    };
  });
  const detailed = steps.some((step) => step.detail);
  const ticks = gainLossTicks(Math.max(0, ...data.map((row) => row.new + row.up)), Math.max(0, ...data.map((row) => -(row.down + row.lost))));
  const ordered = [...GAINED, ...LOST].flatMap((key) => series.filter((entry) => entry.key === key));
  const google = useGoogleUpdates(steps);
  return (
    <div>
      <GoogleUpdateFrame google={google}>
        <ResponsiveContainer width="100%" height={height} debounce={50}>
          <BarChart data={data} stackOffset="sign" barCategoryGap="25%" maxBarSize={MAX_BAR} margin={{ top: 22, right: 28, bottom: detailed ? 16 : 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border-dim" />
            <XAxis {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} {...google.axis("day")} tick={<StepTick steps={steps} />} />
            {/*
              The marks are set here rather than left to the chart: bars stacked
              either side of the line draw no axis at all when every value is
              nought (recharts 3.8), and its own marks skipped the line itself.
            */}
            <YAxis
              width={48}
              ticks={ticks}
              domain={[ticks[0], ticks[ticks.length - 1]]}
              allowDataOverflow
              tickFormatter={(value: number) => formatCompact(Math.abs(value))}
              {...AXIS_PROPS}
              tick={{ fontSize: 11 }}
            />
            <ReferenceLine y={0} stroke="currentColor" className="text-secondary" strokeOpacity={0.5} />
            <Tooltip active={google.open ? false : undefined} cursor={CHART_CURSOR} content={<StepReadout steps={steps} series={series} netLabel={netLabel} />} />
            {ordered.map((entry) => (
              <Bar key={entry.key} dataKey={entry.key} name={entry.name} stackId="moves" fill={entry.colour} activeBar={CHART_ACTIVE_BAR} isAnimationActive={false} />
            ))}
            <StepMarks steps={steps} />
            <GoogleUpdateMarkers google={google} />
          </BarChart>
        </ResponsiveContainer>
      </GoogleUpdateFrame>
      {/* The key in the order the bars stack, the outline when one is drawn, and Google's updates when one is marked. */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-secondary">
        {ordered.map((entry) => (
          <span key={entry.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.colour }} />
            {entry.name}
          </span>
        ))}
        {steps.some((step) => !step.counts) ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-3.5 rounded-sm border border-dashed border-muted" />
            {startLegend}
          </span>
        ) : null}
        {google.shown ? <GoogleUpdateKey label={google.keyLabel} /> : null}
      </div>
    </div>
  );
}
