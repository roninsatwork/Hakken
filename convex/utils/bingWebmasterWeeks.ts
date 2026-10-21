import { CALENDAR_PERIODS, isRunning, periodBounds, spanBefore, type CalendarPeriod } from "./calendarPeriods";
import { packNumbers, unpackNumbers, type StoredNumbers } from "./searchConsolePacks";

/**
 * Bing's weekly keyword and page lists, as Hakken keeps and adds them up
 * (docs/plans/active/bing-webmaster-plan.md §4.2–§4.4). No database here.
 *
 * A row names its keyword or page by a number — a keyword's place in the
 * website's Bing book, a page's number in its one page numbering — and keeps
 * its position as position × impressions, so weeks and periods add up as
 * Search Console's do.
 */

/** Rows a stored part holds at most, as Search Console's parts. */
export const BING_PART_ROWS = 2_000;

/** A week's or a period's row, by number. */
export type BingRow = { key: number; clicks: number; impressions: number; positionSum: number };

/** Bing's rows for one list, grouped by the week Bing dates them. */
export function byWeek<T extends { day: string }>(rows: readonly T[]): Map<string, T[]> {
  const weeks = new Map<string, T[]>();
  for (const row of rows) {
    const held = weeks.get(row.day);
    if (held) held.push(row);
    else weeks.set(row.day, [row]);
  }
  return weeks;
}

/** Rows added up by key: a keyword Bing lists twice in a week, or the weeks of a period. */
export function addUpRows(lists: readonly (readonly BingRow[])[]): BingRow[] {
  const byKey = new Map<number, BingRow>();
  for (const list of lists) {
    for (const row of list) {
      const held = byKey.get(row.key);
      if (held) {
        held.clicks += row.clicks;
        held.impressions += row.impressions;
        held.positionSum += row.positionSum;
      } else {
        byKey.set(row.key, { ...row });
      }
    }
  }
  return [...byKey.values()];
}

/** Busiest first: most clicks, then impressions, then the lower number — the same order every time. */
export function busiestFirst(rows: BingRow[]): BingRow[] {
  return rows.sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions || left.key - right.key);
}

export type PackedBingPart = { keys: string; clicks: string; impressions: string; positionSums: string };

/** Rows packed into stored parts of 2,000, busiest first; one empty part for none. */
export function packBingRows(rows: readonly BingRow[]): PackedBingPart[] {
  const sorted = busiestFirst([...rows]);
  const parts: PackedBingPart[] = [];
  for (let start = 0; start === 0 || start < sorted.length; start += BING_PART_ROWS) {
    const slice = sorted.slice(start, start + BING_PART_ROWS);
    parts.push({
      keys: packNumbers(slice.map((row) => row.key)),
      clicks: packNumbers(slice.map((row) => row.clicks)),
      impressions: packNumbers(slice.map((row) => row.impressions)),
      positionSums: packNumbers(slice.map((row) => row.positionSum)),
    });
  }
  return parts;
}

/** A stored part's rows back. */
export function rowsOfBingPart(part: { keys: string; clicks: StoredNumbers; impressions: StoredNumbers; positionSums: StoredNumbers }): BingRow[] {
  const keys = unpackNumbers(part.keys);
  const clicks = unpackNumbers(part.clicks);
  const impressions = unpackNumbers(part.impressions);
  const positionSums = unpackNumbers(part.positionSums);
  return keys.map((key, index) => ({ key, clicks: clicks[index] ?? 0, impressions: impressions[index] ?? 0, positionSum: positionSums[index] ?? 0 }));
}

/** A row's average position, or null with nothing shown. */
export function positionOfRow(row: { impressions: number; positionSum: number }): number | null {
  return row.impressions > 0 && row.positionSum > 0 ? row.positionSum / row.impressions : null;
}

/** A fingerprint of a week as Bing gave it, so an unchanged week is not written again. */
export async function fingerprintRows(rows: readonly BingRow[]): Promise<string> {
  const text = busiestFirst([...rows]).map((row) => `${row.key}:${row.clicks}:${row.impressions}:${Math.round(row.positionSum)}`).join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The ready-made periods: the date menu's seven calendar periods (docs/plans/active/calendar-periods-plan.md, phase
 * 5). Bing gives its keywords and pages a week at a time, dated by the week's last day, and runs its weeks its own
 * way: a period is made of the Bing weeks that end inside it.
 */
export const BING_PERIODS = CALENDAR_PERIODS;
export type BingPeriod = CalendarPeriod;

/** The periods built with the span before them: every one but This Year, whose same days a year before are past the 13 months of weeks kept. */
export const WITH_BEFORE: ReadonlySet<BingPeriod> = new Set(CALENDAR_PERIODS.filter((period) => period !== "thisYear"));

/** The weeks a build reads at most, newest first: the 13 months kept. */
export const WEEKS_READ_FOR_PERIODS = 57;

const DAY_MS = 86_400_000;

export function shiftBingDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The weeks a period adds up, newest first, from the weeks held: those ending inside the period on the UK day
 * `today` for `NOW`; for `BEFORE`, those ending inside the span it is set against (rule 4) — the whole period before,
 * or, for one still going, its same days up to this period's newest week. Its days run from six days before its
 * oldest week's date to its newest's, so a month's first week may begin in the month before. Null with none held.
 */
export function weeksOf(held: readonly string[], period: BingPeriod, which: "NOW" | "BEFORE", today: string): { weeks: string[]; from: string; to: string } | null {
  const sorted = [...new Set(held)].sort();
  const inside = (from: string, to: string) => sorted.filter((week) => week >= from && week <= to).reverse();
  const bounds = periodBounds(period, today);
  const now = inside(bounds.from, bounds.to);
  if (now.length === 0) return null;
  const weeks = which === "NOW" ? now : (() => {
    const before = spanBefore(period, { from: bounds.from, to: now[0], whole: !isRunning(period) });
    return inside(before.from, before.to);
  })();
  if (weeks.length === 0) return null;
  return { weeks, from: shiftBingDay(weeks[weeks.length - 1], -6), to: weeks[0] };
}

/** Weeks older than this are dropped: 13 months behind the newest. */
export function oldestWeekKept(newestWeek: string): string {
  return shiftBingDay(newestWeek, -396);
}

/** A page's number from its reference in the website's page numbering ("~1a" → 46). */
export function pageNumberOf(ref: string): number {
  return Number.parseInt(ref.slice(1), 36);
}

/** A page's reference in the website's page numbering from its number. */
export function pageRefOf(number: number): string {
  return `~${number.toString(36)}`;
}

/** A keyword as two engines are matched on it: lower case, single spaces. */
export function keywordMatch(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}
