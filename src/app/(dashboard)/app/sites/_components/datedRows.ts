import { formatShortDay } from "./siteFormat";

/**
 * A row of a Sites chart that runs over dates: its `day` (the first day of
 * its day, week or month), the newest day folded into it, and what the axis
 * calls it. Every row carrying a `day` is how the chart parts know the chart
 * runs over dates, and so draws the Google updates inside them (docs/plans/
 * active/knowledge-news-and-digest-plan.md, "Google updates on the Sites
 * charts"); a chart of named things — engines, sites, countries — carries none.
 */
export type DatedRow = Record<string, unknown> & { day: string; lastDay: string; label: string };

export function datedRow(
  point: { day: string; lastDay?: string },
  values: Record<string, unknown>,
  label: string = formatShortDay(point.day),
): DatedRow {
  return { ...values, day: point.day, lastDay: point.lastDay ?? point.day, label };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The dates a chart's rows run over, first day to newest, when every row is
 * dated; null for a chart of named things, or one with nothing on it.
 */
export function chartDates(rows: ReadonlyArray<Record<string, unknown>>): { days: string[]; from: string; to: string } | null {
  if (rows.length === 0) return null;
  const days: string[] = [];
  for (const row of rows) {
    if (typeof row.day !== "string" || !DAY.test(row.day)) return null;
    days.push(row.day);
  }
  const newest = days[days.length - 1];
  const lastDay = rows[rows.length - 1].lastDay;
  const to = typeof lastDay === "string" && DAY.test(lastDay) && lastDay > newest ? lastDay : newest;
  return { days, from: days[0], to };
}
