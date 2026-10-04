/**
 * A Search Console list as a download (search-console-plan.md §13.1, "Download
 * all (CSV)"): the figures a file can hold and how each is written, shared by
 * the server, which builds a ready-made list's file, and the page, which
 * builds the file of a list asked of Google from the rows it already holds
 * (drift fixes, 2026-10-03: those lists had no download). Pure.
 */

/** The figures a download can hold, by the row's own names. */
export const EXPORT_FIELDS = [
  "key", "clicks", "change", "impressions", "ctr", "position", "positionChange", "count", "top", "tracked", "kind",
  "volume", "estimate", "brand", "usualCtr", "expected", "topShare", "next", "nextShare", "verdict", "gap", "previousClicks", "previousPosition",
] as const;
export type ExportField = (typeof EXPORT_FIELDS)[number];

type ExportRow = { [Field in ExportField]: string | number | boolean | null };

/** A position in a downloaded file: one decimal. */
export function filePosition(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value * 10) / 10;
}

/** A rate or a share, 0–1, in a downloaded file: a percentage with two decimals. */
export function filePercent(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value * 10_000) / 100;
}

/** A figure as a spreadsheet reads it: rates in per cent, positions to one place. */
export function exportValue(row: ExportRow, field: ExportField): string | number | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "yes" : "";
  if (typeof value === "string") return value;
  if (field === "ctr" || field === "usualCtr" || field === "topShare" || field === "nextShare") return filePercent(value);
  if (field === "position" || field === "positionChange" || field === "previousPosition") return filePosition(value);
  return value;
}

/** What a download's file name says it holds: the page's rule, a tracked list's kind too, or the list — and its dates. */
export function exportFileName(host: string, view: string | undefined, dimension: string, from: string, to: string): string {
  const list = view === "tracked" ? `tracked-${dimension}` : view && view !== "all" ? view : dimension;
  return `${host}-search-console-${list}-${from}-${to}.csv`;
}
