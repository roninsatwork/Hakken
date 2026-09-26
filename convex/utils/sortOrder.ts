/**
 * How every Sites table sorts (docs/plans/active/sites-table-sorting-plan.md):
 * by one column's values, either way round, with blanks last whichever way —
 * so turning a list round never floods its first page with dashes — and ties
 * settled by the row's name, so equal values keep one order from page to page.
 * Numbers by size, days (`2026-09-23`) by age, names A to Z.
 *
 * Nothing here needs Convex. The server's lists and the lists a Sites page
 * holds whole sort with the same rule, as they search with the same words
 * (`wordStarts.ts`), so the two can never disagree about where a row goes.
 */

/** Which way a list runs: smallest, earliest or A first; or the other way round. */
export type SortDirection = "asc" | "desc";

/** What a column sorts by: a number, a day or a name. Null, undefined, NaN and "" are blanks. */
export type SortValue = number | string | null | undefined;

function isBlank(value: SortValue): boolean {
  return value === null || value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value));
}

/** Two values one way round, blanks after everything else whichever way; 0 when they tie. */
export function compareSortValues(left: SortValue, right: SortValue, direction: SortDirection): number {
  const leftBlank = isBlank(left);
  const rightBlank = isBlank(right);
  if (leftBlank || rightBlank) return leftBlank === rightBlank ? 0 : leftBlank ? 1 : -1;
  const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
  return direction === "asc" ? order : -order;
}

/**
 * Rows by one value either way round — blanks last — then by a name. What a
 * sortable heading asks for, pressed once and then again.
 */
export function byValue<Row>(value: (row: Row) => SortValue, name: (row: Row) => string, direction: SortDirection) {
  return (left: Row, right: Row) => compareSortValues(value(left), value(right), direction) || name(left).localeCompare(name(right));
}

/** By a number either way round, rows with none last, then by a name. */
export function byNumber<Row>(value: (row: Row) => number | null | undefined, name: (row: Row) => string, direction: SortDirection) {
  return byValue(value, name, direction);
}

/** Largest first, then by a name so equal values keep one order from page to page. */
export function byNumberDesc<Row>(value: (row: Row) => number | null | undefined, name: (row: Row) => string) {
  return byValue(value, name, "desc");
}

/** Newest first by a day or date string, undated rows last, then by a name. */
export function byTextDesc<Row>(value: (row: Row) => string | null | undefined, name: (row: Row) => string) {
  return byValue(value, name, "desc");
}

/**
 * An address as text that sorts in number order — "9.1.2.3" before
 * "10.0.0.1", which plain text puts the other way round: an IPv4 address's
 * four numbers padded to three digits, and anything else (an IPv6 address)
 * after every IPv4 one, as written.
 */
export function ipSortKey(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))) {
    return `4 ${parts.map((part) => part.padStart(3, "0")).join(".")}`;
  }
  return `6 ${ip.toLowerCase()}`;
}
