import { scoreWindows, scoresOf as scoresFrom, stepKey, type ExplorerScore, type ExplorerStep, type StepSpan } from "@/src/ui/components/screens/chartExplorerRule";
import { daysSpanned, shiftDays } from "./stepScale";

/**
 * A page's "Visits needed for one conversion, by channel" (docs/plans/active/page-conversion-explorer-plan.md; drawn
 * and approved 2026-10-20): its Google Analytics figures by channel and by kind of conversion, put into the step the
 * page's dates call for, drawn as the lines chosen, with the span before or a year before beside them. What every
 * configurable chart shares — its steps, which are whole, a year before, better or worse — is the kit's
 * (`chartExplorerRule.ts`); what a step holds here is this file's.
 */

export type ExplorerPoint = { day: string; lastDay: string; rows: ReadonlyArray<{ channel: string; visits: number; counts: readonly number[] }> };
export type Measure = "perOne" | "conversions" | "visits" | "rate";
export type LinesBy = "channel" | "kind" | "one";
export type Against = "none" | "before" | "year";
export type Pick = { measure: Measure; kinds: readonly string[]; channels: readonly string[]; lines: LinesBy };
export type Line = { key: string; channels: readonly string[]; kinds: readonly string[] };

/** One step's figures: each channel's visits and each kind's count, and the days it holds. */
export type Bucket = StepSpan & { channels: Map<string, { visits: number; counts: number[] }> };

/** Points into steps: a point held whole for a week or month counts in each step by the share of its days there. */
export function bucketsOf(points: readonly ExplorerPoint[], step: ExplorerStep, events: number): Bucket[] {
  const out = new Map<string, Bucket>();
  for (const point of points) {
    const days = daysSpanned(point.day, point.lastDay);
    for (let at = 0; at < days; at += 1) {
      const day = shiftDays(point.day, at);
      const key = stepKey(day, step);
      const bucket = out.get(key) ?? out.set(key, { key, first: day, last: day, channels: new Map() }).get(key)!;
      if (day < bucket.first) bucket.first = day;
      if (day > bucket.last) bucket.last = day;
      for (const row of point.rows) {
        const into = bucket.channels.get(row.channel) ?? bucket.channels.set(row.channel, { visits: 0, counts: Array<number>(events).fill(0) }).get(row.channel)!;
        into.visits += row.visits / days;
        row.counts.forEach((count, index) => (into.counts[index] += count / days));
      }
    }
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** The lines the pick draws: a line per channel, per kind of conversion, or one for everything ticked. */
export function linesOf(pick: Pick): Line[] {
  if (pick.lines === "channel") return pick.channels.map((channel) => ({ key: `c:${channel}`, channels: [channel], kinds: pick.kinds }));
  if (pick.lines === "kind") return pick.kinds.map((kind) => ({ key: `k:${kind}`, channels: pick.channels, kinds: [kind] }));
  return [{ key: "all", channels: pick.channels, kinds: pick.kinds }];
}

/** A line's visits and conversions over some steps. */
export function sumsOf(line: Line, buckets: readonly Bucket[], events: readonly string[]): { visits: number; conversions: number } {
  const kinds = line.kinds.map((kind) => events.indexOf(kind)).filter((index) => index >= 0);
  let visits = 0;
  let conversions = 0;
  for (const bucket of buckets) {
    for (const channel of line.channels) {
      const own = bucket.channels.get(channel);
      if (!own) continue;
      visits += own.visits;
      conversions += kinds.reduce((sum, index) => sum + (own.counts[index] ?? 0), 0);
    }
  }
  return { visits, conversions };
}

/** The measure of some visits and conversions: none where it cannot be said (no conversion to divide by). */
export function measureOf(measure: Measure, { visits, conversions }: { visits: number; conversions: number }): number | null {
  if (measure === "visits") return Math.round(visits);
  if (measure === "conversions") return Math.round(conversions);
  if (measure === "rate") return visits >= 0.5 ? Math.round((conversions / visits) * 1000) / 10 : null;
  return conversions >= 0.5 ? Math.round((visits / conversions) * 10) / 10 : null;
}

/** Fewer is better only for visits for one conversion. */
export const fewerIsBetter = (measure: Measure) => measure === "perOne";

/**
 * Each step's value for each line, and the same step of the span compared beside it — the span before or a year
 * before, matched from the newest step back, so the latest meets the latest.
 */
export function rowsOf(now: readonly Bucket[], compared: readonly Bucket[] | null, lines: readonly Line[], measure: Measure, events: readonly string[]) {
  const offset = compared ? compared.length - now.length : 0;
  return now.map((bucket, index) => {
    const twin = compared ? compared[index + offset] ?? null : null;
    // Each line's visits and conversions in the step, for its readout: why a step with no conversion has no figure.
    const sums: Record<string, { visits: number; conversions: number } | null> = Object.fromEntries(lines.flatMap((line) => [
      [line.key, sumsOf(line, [bucket], events)],
      ...(compared ? [[`${line.key}~`, twin ? sumsOf(line, [twin], events) : null]] : []),
    ]));
    return {
      bucket,
      /** The step it is set against, for the readout's dates: null with nothing compared, or none held. */
      twin,
      sums,
      values: Object.fromEntries(Object.entries(sums).map(([key, sum]) => [key, sum ? measureOf(measure, sum) : null])) as Record<string, number | null>,
    };
  });
}

/**
 * Better or worse for each line, by the kit's windows: the measure over the steps' visits and conversions together.
 */
export function scoresOf(before: readonly Bucket[], now: readonly Bucket[], year: readonly Bucket[], lines: ReadonlyArray<Line & { name: string }>, measure: Measure, step: ExplorerStep, events: readonly string[]): ExplorerScore[] {
  return scoresFrom(scoreWindows(before, now, year, step), lines, (line, spans) => measureOf(measure, sumsOf(line, spans, events)));
}
