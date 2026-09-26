/**
 * How the Sites screens write numbers, days and movement — one way, on every
 * page, so "1,937" and "23 Sep 2026" never appear two different ways — in the
 * reader's own language.
 */

/**
 * The reader's language for days and numbers: the page's own (`<html lang>`,
 * which follows the language chosen in the app), so an Italian reader reads
 * "23 set 2026" and "1.937". British English before there is a page to ask,
 * which is only ever before the data has arrived.
 */
function siteLocale(): string {
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
  return lang.toLowerCase().startsWith("it") ? "it-IT" : "en-GB";
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return Math.round(value).toLocaleString(siteLocale());
}

/** A cost per click, which comes in US dollars: "$11.82". */
export function formatCpc(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : `$${value.toFixed(2)}`;
}

/** A big number the way a chart axis or a menu wants it: 1.9K, 34K, 1.2M. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat(siteLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** `2026-09-23` as "23 Sep 2026". */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "–";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(siteLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `2026-09-23` as "23 Sep" — for chart axes, where the year is on the range picker. */
export function formatShortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(siteLocale(), { day: "numeric", month: "short", timeZone: "UTC" });
}

/** `2026-09` as "September 2026". */
export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(siteLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Places moved, as text that does not rely on colour: "▲ 3" up, "▼ 2" down.
 * The owner cannot tell red from green, so the arrow carries the meaning and
 * colour only repeats it.
 */
export function movement(change: number): { text: string; tone: "up" | "down" | "none" } {
  if (change > 0) return { text: `▲ ${change}`, tone: "up" };
  if (change < 0) return { text: `▼ ${Math.abs(change)}`, tone: "down" };
  return { text: "–", tone: "none" };
}

/** A tone class for a movement: brand-safe tokens, never raw colours. */
export function movementClass(tone: "up" | "down" | "none"): string {
  if (tone === "up") return "text-success";
  if (tone === "down") return "text-destructive";
  return "text-muted";
}

/**
 * Rows to CSV text: quoted where needed, one header row.
 *
 * Text that begins like a spreadsheet formula (`=`, `+`, `-`, `@`) gets a
 * leading apostrophe. Anchors, keywords and answers come from other people's
 * websites, and a cell reading `=HYPERLINK(…)` would otherwise run when the
 * file is opened. Numbers are left alone: a -5 is a number, not a formula.
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
    // Quoted on a carriage return or a semicolon too: a spreadsheet may read
    // either as a break, and start the next cell with a formula.
    return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\n");
}
