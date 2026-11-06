"use client";

import type { ReactNode } from "react";
import { coarserThanStep, perStep, stepKey } from "@/src/app/(dashboard)/app/analytics/_components/stepScale";
import { datedRow } from "@/src/app/(dashboard)/app/sites/_components/datedRows";
import type { SiteSeries } from "@/src/app/(dashboard)/app/sites/_components/SiteCharts";
import { formatMonth, formatNumber, formatShortDay, toCsv } from "@/src/app/(dashboard)/app/sites/_components/siteFormat";
import type { ChartReadoutTableProps } from "@/src/ui/components/charts/ChartReadoutTable";
import { ChartExplorer, type ExplorerControl } from "./ChartExplorer";
import { scoreWindows, scoresOf, type ExplorerScore, type ExplorerStep, type StepSpan } from "./chartExplorerRule";

/**
 * Figures over the page's dates, stepping by day, week or month, with their menus and their hover: the kit's chart with
 * menus (`ChartExplorer`), with the sums every such chart needs done once (Anthony, 2026-11-05: "I only want reusable shared
 * components"; docs/plans/active/campaigns-new-page-plan-2026-11-05.md). Visits, All pages, Funnel and Campaigns each wrote
 * their own until then. It's given plain figures and reads nothing: the page does the reading and hands over the words.
 *
 * A week or month held whole is drawn as its average for the step, so it sits on the same scale as the points beside it. A line
 * can be laid under the dates step by step (`under`, the first under the first), or have no figure where it has no point (`gaps`).
 */

export type DaysPoint = { day: string; lastDay?: string; value: number };

export type DaysLine = {
  key: string;
  name: string;
  colour: string;
  dashed?: boolean;
  points: readonly DaysPoint[];
  /** The span before, laid under the dates step by step, so a month's weekends need not line up. */
  under?: boolean;
  /** A step this line has no point in has no figure, rather than none: 31 October against a September with 30 days. */
  gaps?: boolean;
};

type Bucket = { first: string; last: string; sum: number };

function bucketsOf(points: readonly DaysPoint[], step: ExplorerStep): Array<[string, Bucket]> {
  const buckets = new Map<string, Bucket>();
  for (const point of points) {
    const key = stepKey(step, point.day, point.lastDay);
    const bucket = buckets.get(key) ?? { first: point.day, last: point.day, sum: 0 };
    if (point.day < bucket.first) bucket.first = point.day;
    const last = point.lastDay ?? point.day;
    if (last > bucket.last) bucket.last = last;
    bucket.sum += point.value;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right));
}

const shown = (bucket: Bucket, step: ExplorerStep) => Math.round(perStep(bucket.sum, bucket.first, bucket.last, step) * 10) / 10;

/** A chart's rows: each step's first and last day, and each line's figure. Plain code, so a chart and its tests share one sum. */
export function daysChartRows(step: ExplorerStep, lines: readonly DaysLine[]): Array<Record<string, unknown>> {
  const steps = new Map<string, { first: string; last: string; sums: Map<string, number> }>();
  for (const line of lines.filter((one) => !one.under)) {
    for (const point of line.points) {
      const key = stepKey(step, point.day, point.lastDay);
      const held = steps.get(key) ?? { first: point.day, last: point.day, sums: new Map<string, number>() };
      if (point.day < held.first) held.first = point.day;
      const last = point.lastDay ?? point.day;
      if (last > held.last) held.last = last;
      held.sums.set(line.key, (held.sums.get(line.key) ?? 0) + point.value);
      steps.set(key, held);
    }
  }
  const underneath = lines.filter((one) => one.under).map((line) => ({ key: line.key, buckets: bucketsOf(line.points, step) }));
  return [...steps.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, held], at) => {
    const values: Record<string, unknown> = {};
    for (const line of lines) {
      if (line.under) continue;
      const sum = held.sums.get(line.key);
      values[line.key] = sum === undefined && line.gaps ? null : Math.round(perStep(sum ?? 0, held.first, held.last, step) * 10) / 10;
    }
    for (const line of underneath) {
      const bucket = line.buckets[at]?.[1];
      values[line.key] = bucket ? shown(bucket, step) : null;
    }
    if (coarserThanStep(held.first, held.last, step)) values.coarse = true;
    return datedRow(
      { day: step === "month" ? `${key}-01` : held.first, lastDay: held.last },
      values,
      step === "month" ? formatMonth(key) : formatShortDay(held.first),
    );
  });
}

/** A scorecard line: its figures over the dates, the span before them on its own dates, and those a year before. */
export type DaysScoreLine = { key: string; name: string; now: readonly DaysPoint[]; before?: readonly DaysPoint[]; year?: readonly DaysPoint[] };
type SumSpan = StepSpan & { sum: number };

/** Each line's Up or down, whole steps only. Plain code, for its tests. */
export function daysScores(step: ExplorerStep, lines: readonly DaysScoreLine[]): ExplorerScore[] {
  const spans = (points: readonly DaysPoint[] | undefined): SumSpan[] => bucketsOf(points ?? [], step).map(([key, bucket]) => ({ key, first: bucket.first, last: bucket.last, sum: bucket.sum }));
  return lines.flatMap((line) => scoresOf(
    // One timeline, as a week can start in the span before and end in the dates, and it's still a whole week.
    scoreWindows([], spans([...(line.before ?? []), ...line.now]), spans(line.year), step),
    [line],
    (_, chosen) => chosen.reduce((total, span) => total + span.sum, 0),
  ));
}

export function DaysChart({ title, hint, exportName, csvDay, host, step, waiting, controls, nothingTicked = null, lines, figure, plain = false, anything, empty, height, scored }: {
  title: string;
  /** What the chart shows. Given as a function, told whether a step stands for more than the step drawn, for the words that say so. */
  hint: ReactNode | ((coarse: boolean) => ReactNode);
  exportName: string;
  /** The download's first heading. */
  csvDay: string;
  host: string;
  step: ExplorerStep;
  /** As `ChartExplorer`'s: undefined while the figures load, words in place of everything while they can't be drawn. */
  waiting: string | null | undefined;
  controls: readonly ExplorerControl[];
  /** Words in place of the chart when a tick box has nothing ticked. */
  nothingTicked?: string | null;
  lines: readonly DaysLine[];
  /** What the lines are, at the head of the hover's column. */
  figure: string;
  /** A plain hover column, for a chart whose lines aren't one figure set against itself: a step with none says 0. */
  plain?: boolean;
  /** Whether there's anything to draw, where having rows isn't enough. */
  anything?: (rows: ReadonlyArray<Record<string, unknown>>) => boolean;
  empty: string;
  height?: number;
  /** Up or down, under the chart. Its step can be longer than the chart's: a day against the day before says little. */
  scored?: { step: ExplorerStep; lines: readonly DaysScoreLine[]; fewerIsBetter?: boolean; withYear?: boolean };
}) {
  const data = daysChartRows(step, lines);
  const series: SiteSeries[] = lines.map((line) => ({ key: line.key, name: line.name, colour: line.colour, ...(line.dashed ? { dashed: true } : {}) }));
  const coarse = data.some((row) => row.coarse === true);
  const readout = ({ row, heading }: { row: Record<string, unknown>; heading: ReactNode }): ChartReadoutTableProps => ({
    heading,
    columns: [{ key: "figure", label: figure, ...(plain ? {} : { tone: "band" as const, drawn: true }) }],
    rows: lines.map((line) => {
      const value = row[line.key];
      const cell = plain
        ? { text: formatNumber(typeof value === "number" ? value : 0), quiet: !value }
        : typeof value === "number" ? { text: formatNumber(value) } : { text: "–", quiet: true };
      return { key: line.key, name: line.name, colour: line.colour, cells: { figure: cell } };
    }),
  });
  return (
    <ChartExplorer
      title={title}
      hint={typeof hint === "function" ? hint(coarse) : hint}
      exportName={exportName}
      csv={() => toCsv([csvDay, ...lines.map((line) => line.name)], data.map((row) => [String(row.day), ...lines.map((line) => (row[line.key] as number | null | undefined) ?? null)]))}
      host={host}
      from={null}
      to={null}
      step={step}
      waiting={waiting}
      controls={controls}
      nothingTicked={nothingTicked}
      data={data}
      series={series}
      readout={readout}
      anything={anything ? anything(data) : data.length > 0}
      empty={empty}
      height={height}
      scores={scored ? { rows: daysScores(scored.step, scored.lines), figure: (value) => (value === null ? "–" : formatNumber(value)), fewerIsBetter: scored.fewerIsBetter ?? false, withYear: scored.withYear ?? false, step: scored.step } : undefined}
    />
  );
}
