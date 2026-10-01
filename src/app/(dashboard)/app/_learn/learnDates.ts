/**
 * The days Learn reads by (docs/plans/active/knowledge-news-and-digest-plan.md,
 * revised again 2026-10-01): the reader's own calendar day, which the News
 * front page and its side menu count the week from, and the dates News prints.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The locale days are written in: British English, or Italian for an Italian
 * reader — "1 October", never "October 1" — as Sites writes them
 * (`siteFormat.ts`, `siteLocale`).
 */
function dateLocale(language: string): string {
  return language.toLowerCase().startsWith("it") ? "it-IT" : "en-GB";
}

/** The reader's calendar day, "YYYY-MM-DD", in their own timezone. */
export function localDay(at: Date = new Date()): string {
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${at.getFullYear()}-${month}-${day}`;
}

/** A calendar day's own date, at noon UTC, so no timezone moves it to the day before or after. */
function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/** Whole days from one calendar day to another; negative when `to` comes first. */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayDate(to).getTime() - dayDate(from).getTime()) / DAY_MS);
}

/** The calendar day `days` after `day`. */
export function addDays(day: string, days: number): string {
  return new Date(dayDate(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** The ISO week a calendar day falls in: weeks start on Monday, and week 1 holds the year's first Thursday. */
export function isoWeek(day: string): number {
  const date = new Date(`${day}T00:00:00Z`);
  // The Thursday of the same week decides which year, and so which week, it is.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** "Thursday, 1 October 2026", in the reader's language. */
export function formatLongDay(day: string, locale: string): string {
  return dayDate(day).toLocaleDateString(dateLocale(locale), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "24 Sep", in the reader's language. */
export function formatShortDay(day: string, locale: string): string {
  return dayDate(day).toLocaleDateString(dateLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Tue 29 Sep" for a moment, in the reader's language and timezone. */
export function formatWireDay(at: number, locale: string): string {
  return new Date(at).toLocaleDateString(dateLocale(locale), { weekday: "short", day: "numeric", month: "short" });
}

/**
 * When a story arrived, as a reader says it: "2 hours ago" or "yesterday"
 * within two days, its date after that.
 */
export function formatWhen(at: number, locale: string, now: number = Date.now()): string {
  const hours = Math.floor((now - at) / (60 * 60 * 1000));
  const relative = new Intl.RelativeTimeFormat(dateLocale(locale), { numeric: "auto" });
  if (hours < 1) return relative.format(0, "hour");
  if (hours < 24) return relative.format(-hours, "hour");
  if (hours < 48) return relative.format(-1, "day");
  return new Date(at).toLocaleDateString(dateLocale(locale), { day: "numeric", month: "short" });
}
