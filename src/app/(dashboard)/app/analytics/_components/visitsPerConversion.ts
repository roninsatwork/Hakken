import { datedRow, type DatedRow } from "../../sites/_components/datedRows";
import { formatMonth, formatShortDay } from "../../sites/_components/siteFormat";
import { coarserThanStep, daysSpanned, stepKey } from "./stepScale";
import type { Step } from "./useAnalytics";

/**
 * Conversions' "Visits needed for one conversion" (Anthony, 2026-10-20):
 * each step's visits over its counted conversions, this period's and, for 7
 * and 30 days, the days just before laid over them day for day. A step with
 * no conversion has no figure — there is nothing to divide by — so its line
 * skips it. A week or month held whole gives the same figure however it is
 * spread, so a point past 90 days is never averaged.
 */

/** A point of the website's figures: a day, or a week or month held whole with its last day. */
export type CostPoint = { day: string; lastDay?: string; visits: number; conversions: number };

export type CostRow = DatedRow & {
  /** The step's first day with figures: a month's row is dated by the 1st, which may come before it. */
  first: string;
  visits: number;
  conversions: number;
  perConversion: number | null;
  /** Whether this period's point is a week held whole on a chart stepping by day (before the last 90 days). */
  coarse: boolean;
  visitsBefore: number | null;
  conversionsBefore: number | null;
  perConversionBefore: number | null;
};

const perConversion = (visits: number, conversions: number) => (conversions > 0 ? Math.round((visits / conversions) * 10) / 10 : null);

/** The days two spans share, both ends counted; none when apart. */
function overlap(first: string, last: string, from: string, to: string): number {
  const start = first > from ? first : from;
  const end = last < to ? last : to;
  return start > end ? 0 : daysSpanned(start, end);
}

/** The days before's visits and conversions laid over `from` to `to`: each point by the share of its days inside. */
export function beforeOver(points: readonly CostPoint[], from: string, to: string): { visits: number; conversions: number } {
  let visits = 0;
  let conversions = 0;
  for (const point of points) {
    const last = point.lastDay ?? point.day;
    const inside = overlap(point.day, last, from, to);
    if (inside === 0) continue;
    const days = daysSpanned(point.day, last);
    visits += (point.visits * inside) / days;
    conversions += (point.conversions * inside) / days;
  }
  return { visits, conversions };
}

/** The chart's rows: this period's points into the step chosen, dated by their first day, each with the days before's. */
export function visitsPerConversion(now: readonly CostPoint[], before: readonly CostPoint[] | null, step: Step): CostRow[] {
  const buckets = new Map<string, { first: string; last: string; visits: number; conversions: number }>();
  for (const point of [...now].sort((left, right) => left.day.localeCompare(right.day))) {
    const key = stepKey(step, point.day, point.lastDay);
    const bucket = buckets.get(key) ?? { first: point.day, last: point.day, visits: 0, conversions: 0 };
    const last = point.lastDay ?? point.day;
    if (last > bucket.last) bucket.last = last;
    bucket.visits += point.visits;
    bucket.conversions += point.conversions;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].map(([key, bucket]) => {
    const laid = before ? beforeOver(before, bucket.first, bucket.last) : null;
    const values = {
      first: bucket.first,
      visits: bucket.visits,
      conversions: bucket.conversions,
      perConversion: perConversion(bucket.visits, bucket.conversions),
      coarse: coarserThanStep(bucket.first, bucket.last, step),
      visitsBefore: laid ? Math.round(laid.visits) : null,
      conversionsBefore: laid ? Math.round(laid.conversions) : null,
      perConversionBefore: laid ? perConversion(laid.visits, laid.conversions) : null,
    };
    return datedRow({ day: step === "month" ? `${key}-01` : bucket.first, lastDay: bucket.last }, values, step === "month" ? formatMonth(key) : formatShortDay(bucket.first)) as CostRow;
  });
}
