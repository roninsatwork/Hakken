import { shiftMonth } from "./insightHistory";

/**
 * The periods Insights reads (docs/plans/active/insights-intelligence-plan.md,
 * phase 1; Anthony, 2026-10-12: "an agency would report on month on month
 * gains or losses and quarter on quarter … where are the months or
 * quarters"): a month, a calendar quarter (Anthony: "yes" to calendar
 * quarters) or the last twelve months, each compared with the period just
 * before and with the same period a year ago — whole months only, so like is
 * set against like. Google keeps sixteen months, so twelve months has no year
 * before to set against.
 */

export type PeriodKind = "MONTH" | "QUARTER" | "YEAR";
export type Period = { id: string; kind: PeriodKind; months: string[] };

/** The id of the last twelve months. */
export const TWELVE_MONTHS = "12M";

const quarterOf = (month: string) => `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`;

function quarterMonths(id: string): string[] {
  const [year, quarter] = id.split("-Q").map(Number);
  const first = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map((at) => `${year}-${String(first + at).padStart(2, "0")}`);
}

/**
 * The periods a reader can choose, newest first: each whole month held, each
 * calendar quarter whose three months are held, and the last twelve whole
 * months when all twelve are. `whole` is the months held from their first day
 * to their last, oldest first.
 */
export function periodsFrom(whole: readonly string[]): Period[] {
  const held = new Set(whole);
  const sorted = [...held].sort();
  const periods: Period[] = [];
  if (sorted.length >= 12) {
    const last = sorted[sorted.length - 1];
    const months = Array.from({ length: 12 }, (_, at) => shiftMonth(last, at - 11));
    if (months.every((month) => held.has(month))) periods.push({ id: TWELVE_MONTHS, kind: "YEAR", months });
  }
  const quarters = [...new Set(sorted.map(quarterOf))].sort().reverse();
  for (const quarter of quarters) {
    const months = quarterMonths(quarter);
    if (months.every((month) => held.has(month))) periods.push({ id: quarter, kind: "QUARTER", months });
  }
  for (const month of [...sorted].reverse()) periods.push({ id: month, kind: "MONTH", months: [month] });
  return periods;
}

/** A period by its id among those held; null when it is not one. */
export function periodById(id: string | undefined, periods: readonly Period[]): Period | null {
  return periods.find((period) => period.id === id) ?? null;
}

/** The newest whole month: the period Insights opens on. */
export function openingPeriod(periods: readonly Period[]): Period | null {
  return periods.find((period) => period.kind === "MONTH") ?? null;
}

/** The same span just before: the month before, the quarter before, the twelve months before. */
export function beforeOf(period: Period): string[] {
  return period.months.map((month) => shiftMonth(month, -period.months.length));
}

/** The same span a year before; none for twelve months, which would be the twelve before. */
export function yearAgoOf(period: Period): string[] | null {
  return period.kind === "YEAR" ? null : period.months.map((month) => shiftMonth(month, -12));
}

/** Whether every month of a span is held whole. */
export const heldWhole = (months: readonly string[] | null, whole: ReadonlySet<string>): months is string[] => months !== null && months.every((month) => whole.has(month));
