/**
 * What every link list kept as packed records shares (core-data-normalisation-
 * plan.md §6.3): a check's list of linking websites, anchors or servers is a
 * record of up to `LINK_PART_ROWS`, each figure a packed column
 * (`packedColumns.ts`), read back as the rows were and in their order.
 */

/** Rows a record holds: a check's list, at most a thousand a page. */
export const LINK_PART_ROWS = 1_000;

/** Records a website's list may run to: a few thousand rows, and a list being replaced beside its successor. */
export const LINK_PARTS_READ = 64;

export const LINK_STATUSES = ["LIVE", "NEW", "LOST"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

/**
 * Every row of a website's records, strongest first and, among equals, the
 * newest list first and the later in a list first — the order the rows were
 * read in by strength, newest first, when each was a row of its own.
 */
export function strongestFirst<Part extends { _creationTime: number }, Row>(
  parts: readonly Part[],
  rowsOf: (part: Part) => Row[],
  strength: (row: Row) => number,
): Row[] {
  const placed = [...parts]
    .sort((left, right) => right._creationTime - left._creationTime)
    .flatMap((part, partAt) => rowsOf(part).map((row, at) => ({ row, partAt, at })));
  return placed
    .sort((left, right) => strength(right.row) - strength(left.row) || left.partAt - right.partAt || right.at - left.at)
    .map((entry) => entry.row);
}

/** The newest row named so among a website's records, or null: `names` is each record's list of names. */
export function newestNamed<Part extends { _creationTime: number }, Row>(
  parts: readonly Part[],
  names: (part: Part) => readonly string[],
  rowsOf: (part: Part) => Row[],
  name: string,
): Row | null {
  for (const part of [...parts].sort((left, right) => right._creationTime - left._creationTime)) {
    const at = names(part).lastIndexOf(name);
    if (at !== -1) return rowsOf(part)[at];
  }
  return null;
}
