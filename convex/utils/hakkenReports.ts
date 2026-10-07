import type { TaskMeasure } from "./hakkenTaskRules";

/**
 * A Hakken report (docs/plans/active/hakken-tasks-plan.md, item 4.1, board
 * EmailReportB): "every Monday, the five pages that lost the most visitors".
 * Its pages are Search Console's own Pages list over the newest 7 days held
 * against the 7 before — the list "See all your pages" opens — and which go
 * in is plain code. Free of any Convex function, so the proposal, The Stat
 * Report Agent and the screens agree.
 */

export type ReportSpec = { look: "pagesChange"; direction: "lost" | "gained"; count: number; every: "week"; weekday: number };

/** The report's days: Search Console's ready-made 7. */
export const REPORT_DAYS = 7;

/** How many pages a report may hold. */
export const REPORT_PAGES = { fewest: 3, most: 10, usual: 5 } as const;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Monday" for 1 … "Sunday" for 7, in English: the title's words. */
export function weekdayName(weekday: number): string {
  return WEEKDAYS[(Math.round(weekday) + 6) % 7];
}

/** Monday to Sunday from what a person said: "monday", "Mon", 1. Monday when it cannot tell. */
export function weekdayOf(said: unknown): number {
  if (typeof said === "number" && Number.isInteger(said) && said >= 1 && said <= 7) return said;
  if (typeof said !== "string") return 1;
  const at = WEEKDAYS.findIndex((name) => name.toLowerCase().startsWith(said.trim().toLowerCase().slice(0, 3)));
  return at >= 0 ? at + 1 : 1;
}

/** The pages a report may hold, kept to its bounds. */
export function reportCount(said: unknown): number {
  const count = typeof said === "number" && Number.isFinite(said) ? Math.round(said) : REPORT_PAGES.usual;
  return Math.min(REPORT_PAGES.most, Math.max(REPORT_PAGES.fewest, count));
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** The report in plain words, as the Hakken tasks page shows it: "Every Monday, send me the five pages that lost the most visitors". */
export function reportTitle(report: ReportSpec, measure: TaskMeasure): string {
  const what = measure === "visitors" ? "visitors" : "impressions";
  return `Every ${weekdayName(report.weekday)}, send me the ${NUMBER_WORDS[report.count] ?? report.count} pages that ${report.direction} the most ${what}`;
}

export type PageChange = { page: string; now: number; before: number; change: number };

/**
 * The pages that lost, or gained, the most, most first: only those that
 * moved that way, ties by the larger page now, then by address.
 */
export function pickPages(rows: ReadonlyArray<{ page: string; now: number; before: number }>, direction: ReportSpec["direction"], count: number): PageChange[] {
  return rows
    .map((row) => ({ ...row, change: row.now - row.before }))
    .filter((row) => (direction === "lost" ? row.change < 0 : row.change > 0))
    .sort((a, b) => (direction === "lost" ? a.change - b.change : b.change - a.change) || b.now - a.now || a.page.localeCompare(b.page))
    .slice(0, count);
}

/** A change written as people read one: "−224" and "+96", with a real minus sign. */
export function signed(change: number, locale = "en-GB"): string {
  const size = Math.abs(change).toLocaleString(locale);
  return change < 0 ? `−${size}` : change > 0 ? `+${size}` : "0";
}
