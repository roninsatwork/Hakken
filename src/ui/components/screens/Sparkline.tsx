"use client";

import { useId } from "react";
import { useElementWidth } from "@/src/hooks/useElementWidth";
import { ChartReveal } from "./ChartReveal";

/**
 * A small line of a figure's days, under the figure (docs/plans/active/dashboard-way-1-plan-2026-11-21.md, "FigureSpark"):
 * the Dashboard's four numbers each show their month as a line. Shared, so any figure on any screen can show its days.
 *
 * Drawn in real pixels at its measured width, never stretched (`src/chart-size-drift.test.ts`), with the curve the app's line
 * charts use (recharts' "monotone", d3's monotone X), so a small line and a big chart of the same days have the same shape.
 * No axis and no words: the figure above it says what it is, and the chart on its own page says the rest.
 */
export function Sparkline({ values, colour, height = 40, label }: {
  values: readonly number[];
  /** A colour from `chartPalette.ts`. */
  colour: string;
  height?: number;
  /** Said to a screen reader, as the figure's days in words. */
  label: string;
}) {
  const [watch, width] = useElementWidth();
  const gradient = useId();
  const path = width > 0 && values.length > 1 ? sparkPath(values, width, height) : null;
  return (
    <div ref={watch} data-part="sparkline" className="w-full" style={{ height }}>
      {path ? (
        <ChartReveal replay={`${values.length}:${values[0]}:${values[values.length - 1]}`} motion="wipe" figures="[data-spark]">
        <svg role="img" aria-label={label} width={width} height={height} className="block">
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.22} />
              <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <g data-spark="">
            <path d={`${path}L${width},${height}L0,${height}Z`} fill={`url(#${gradient})`} />
            <path d={path} fill="none" stroke={colour} strokeWidth={1.75} strokeLinejoin="round" />
          </g>
        </svg>
        </ChartReveal>
      ) : null}
    </div>
  );
}

/** The line through the values at this size: a 3-pixel margin top and bottom so the stroke never clips. */
export function sparkPath(values: readonly number[], width: number, height: number): string {
  const top = Math.max(...values, 0) || 1;
  const points = values.map((value, index) => [
    (index * width) / Math.max(values.length - 1, 1),
    height - 3 - ((height - 6) * Math.max(value, 0)) / top,
  ] as const);
  return monotonePath(points);
}

/** d3's curveMonotoneX, the curve recharts draws for type="monotone": smooth, and never overshooting a day. */
export function monotonePath(points: ReadonlyArray<readonly [number, number]>): string {
  const n = points.length;
  if (n === 0) return "";
  const fmt = (value: number) => Number(value.toFixed(2));
  if (n === 1) return `M${fmt(points[0][0])},${fmt(points[0][1])}`;
  const sign = (value: number) => (value < 0 ? -1 : 1);
  const tangents = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const h0 = x1 - x0;
    const h1 = x2 - x1;
    const s0 = h0 ? (y1 - y0) / h0 : 0;
    const s1 = h1 ? (y2 - y1) / h1 : 0;
    const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1);
    tangents[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  const ends = (a: readonly [number, number], b: readonly [number, number], t: number) => {
    const h = b[0] - a[0];
    return h ? (3 * (b[1] - a[1])) / h / 2 - t / 2 : t;
  };
  tangents[0] = ends(points[0], points[1], tangents[1]);
  tangents[n - 1] = ends(points[n - 2], points[n - 1], tangents[n - 2]);
  let d = `M${fmt(points[0][0])},${fmt(points[0][1])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = (x1 - x0) / 3;
    d += `C${fmt(x0 + dx)},${fmt(y0 + dx * tangents[i])},${fmt(x1 - dx)},${fmt(y1 - dx * tangents[i + 1])},${fmt(x1)},${fmt(y1)}`;
  }
  return d;
}
