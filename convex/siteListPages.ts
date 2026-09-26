import { v, type Validator } from "convex/values";
import { SITE_PAGE_MAX } from "./siteAccess";
import { byValue, type SortDirection, type SortValue } from "./utils/sortOrder";

/**
 * One page of a Sites list, counted exactly (docs/plans/active/
 * sites-table-pages-plan.md §5.3): the rows for the page asked for, the total
 * across the whole list after its search and filters, and how many pages that
 * makes — so the numbered footer can show the last page and open any page in
 * one request, rather than walking Convex's cursor pages to reach it.
 *
 * The list arrives here whole — read in full when it can never pass a
 * thousand or so rows (§5.1), or from its compact copy — and is narrowed,
 * sorted and cut into a page here, so the total and the page always agree.
 */

/** The page and page size a Sites table asks for. The size is held to `SITE_PAGE_MAX` however it is asked. */
export const listPageArgs = { page: v.number(), rows: v.number() };

/**
 * What one page answers: its rows; the exact total and the page count; the
 * page actually shown (the last one when the list has shrunk under the page
 * asked for) and its size; `cut` — the length the list was held to when it
 * was longer than could be read, or null when the total is the whole list;
 * and `preparing` — true while a list read from a compact copy has none yet,
 * which the table shows as its loading row while the copy is built.
 */
export function listPageResult<Row extends Validator<unknown, "required", string>>(row: Row) {
  return v.object({
    rows: v.array(row),
    total: v.number(),
    page: v.number(),
    pages: v.number(),
    size: v.number(),
    cut: v.union(v.number(), v.null()),
    preparing: v.boolean(),
  });
}

export type ListPage<Row> = {
  rows: Row[];
  total: number;
  page: number;
  pages: number;
  size: number;
  cut: number | null;
  preparing: boolean;
};

/** The page size asked for, held to what a Sites page may show. */
function sizeOf(rows: number): number {
  return Math.min(Math.max(1, Math.floor(rows) || 1), SITE_PAGE_MAX);
}

/** The page asked for of a list held whole, with its exact total. */
export function pageOfList<Row>(list: readonly Row[], page: number, rows: number, cut: number | null = null): ListPage<Row> {
  const size = sizeOf(rows);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const shown = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { rows: list.slice((shown - 1) * size, shown * size), total: list.length, page: shown, pages, size, cut, preparing: false };
}

/** The answer while a list's compact copy is being built for the first time. */
export function preparingPage(rows: number): ListPage<never> {
  return { rows: [], total: 0, page: 1, pages: 1, size: sizeOf(rows), cut: null, preparing: true };
}

/**
 * Every row of the newest list, and an older list's row only where the newest
 * has none for the same key. While a new list is being filed its rows sit
 * beside the last list's until those are cleared (`clearOlder` in
 * `siteLinkFiling.ts`), and counting both would count a linking website twice;
 * two rows alike within one list are two rows, and both stay.
 */
export function newestPerKey<Row extends { _creationTime: number; pullId: string }>(rows: readonly Row[], keyOf: (row: Row) => string): Row[] {
  const lists = new Map<string, { newest: number; rows: Row[] }>();
  for (const row of rows) {
    const list = lists.get(row.pullId) ?? { newest: 0, rows: [] };
    list.newest = Math.max(list.newest, row._creationTime);
    list.rows.push(row);
    lists.set(row.pullId, list);
  }
  const seen = new Set<string>();
  const kept: Row[] = [];
  for (const list of [...lists.values()].sort((left, right) => right.newest - left.newest)) {
    const keys = list.rows.map(keyOf);
    list.rows.forEach((row, index) => {
      if (!seen.has(keys[index])) kept.push(row);
    });
    for (const key of keys) seen.add(key);
  }
  return kept;
}

/**
 * Read one past a limit and report whether the list was longer (`readCoverage.ts`
 * is the same idea for figures): the rows kept, and the limit when there were
 * more, so the page can say where the list stops instead of passing it off as
 * the whole (T11).
 */
export function heldTo<Row>(rows: Row[], limit: number): { rows: Row[]; cut: number | null } {
  return rows.length > limit ? { rows: rows.slice(0, limit), cut: limit } : { rows, cut: null };
}

/** Which way a heading asked a list to run (`convex/utils/sortOrder.ts`). */
export const sortDirectionArg = v.optional(v.union(v.literal("asc"), v.literal("desc")));

/**
 * The columns a server list sorts by (docs/plans/active/
 * sites-table-sorting-plan.md): each column's value for a row, and which way
 * its heading's first press runs — the best first. Held beside the query, so
 * every column it sorts by is one it can read for every row before the page
 * is cut, never only for the rows on screen.
 */
export type ListSorts<Row, Key extends string> = Readonly<Record<Key, { value: (row: Row) => SortValue; first: SortDirection }>>;

/** The order asked for, or the column's own first direction, as a comparator: blanks last, ties by name. */
export function listOrder<Row, Key extends string>(
  sorts: ListSorts<Row, Key>,
  key: Key,
  direction: SortDirection | undefined,
  name: (row: Row) => string,
) {
  const column = sorts[key];
  return byValue(column.value, name, direction ?? column.first);
}

/**
 * A list sent whole to the page that pages it (`useSitePager`), with `cut`
 * when a read stopped short of all of it: the page then says the list is
 * longer rather than passing what it holds off as everything (T11).
 */
export function listWithCut<Row extends Validator<unknown, "required", string>>(row: Row) {
  return v.object({ rows: v.array(row), cut: v.union(v.number(), v.null()) });
}
