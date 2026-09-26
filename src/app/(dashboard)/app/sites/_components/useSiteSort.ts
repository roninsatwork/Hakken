"use client";

import { useCallback, useMemo } from "react";
import type { DataTableSort } from "@/src/ui/components/screens/DataTable";
import { byValue, type SortDirection, type SortValue } from "@/convex/utils/sortOrder";
import { useSetSiteParams, useSiteParam } from "./useSiteParam";

const DIRECTIONS = ["asc", "desc"] as const;

/**
 * A Sites table's order, kept in the address (docs/plans/active/
 * sites-table-sorting-plan.md): the column it is sorted by and which way.
 *
 * `firsts` is each sortable column's first press — the best first: a Google
 * position top first, a day newest first, a name A to Z, any other number
 * largest first. `opening` is the column the table opens on, and
 * `openingDirection` its way when that is not the column's first (the Sites
 * list opens on Added, oldest first). Pressing a heading asks for its column
 * its own way first, and the other way when it is already the order. Both go
 * into the address in one write — left out while they are the opening order,
 * so a link stays short — and the list starts again at page one. An order the
 * table does not offer (an old bookmark, a link edited by hand) opens on the
 * table's own.
 *
 * Only the columns in `firsts` sort, so a view without a column can leave it
 * out: an address asking for it then opens on the table's own order. Pass
 * `firsts` from outside the component, so it is the same object each time.
 */
export function useSiteSort<Key extends string>(
  firsts: Readonly<Partial<Record<Key, SortDirection>>>,
  opening: Key,
  openingDirection?: SortDirection,
): { key: Key; direction: SortDirection; tableSort: DataTableSort } {
  const keys = useMemo(() => Object.keys(firsts) as Key[], [firsts]);
  const [key] = useSiteParam<Key>("sort", opening, keys);
  const [chosen] = useSiteParam<SortDirection | "">("dir", "", DIRECTIONS);
  const setParams = useSetSiteParams();
  const unmarked = useCallback(
    (column: Key): SortDirection => (column === opening && openingDirection ? openingDirection : firsts[column] ?? "desc"),
    [firsts, opening, openingDirection],
  );
  const direction = chosen || unmarked(key);
  const onSort = useCallback((pressed: string) => {
    if (!keys.includes(pressed as Key)) return;
    const column = pressed as Key;
    const next = column === key ? (direction === "asc" ? "desc" : "asc") : firsts[column] ?? "desc";
    setParams({ sort: column === opening ? null : column, dir: next === unmarked(column) ? null : next });
  }, [keys, key, direction, firsts, opening, unmarked, setParams]);
  return { key, direction, tableSort: { key, direction, onSort } };
}

/**
 * A whole list's sortable columns: how each reads a row, and which way its
 * first press runs. A column a view does not show can be left out.
 */
export type SiteSortColumns<Row, Key extends string> = Readonly<Partial<Record<Key, { value: (row: Row) => SortValue; first: SortDirection }>>>;

/**
 * A list a Sites page holds whole (`useSitePager`), in the order its headings
 * ask for: sorted here with the server's own rule (`convex/utils/sortOrder.ts`)
 * — blanks last either way, ties by `name` — over every row it holds, before
 * the page is cut. `group` keeps some rows after the others whatever the
 * order: a paused search after the ones being checked. Give the sorted rows
 * to the table's download too, so the file comes in the order on screen.
 *
 * Pass `columns`, `name` and `group` from outside the component, or memoised,
 * so the list is only sorted again when it or its order changes.
 */
export function useSiteSortedList<Row, Key extends string>(
  rows: readonly Row[] | undefined,
  columns: SiteSortColumns<Row, Key>,
  options: { opening: Key; openingDirection?: SortDirection; name: (row: Row) => string; group?: (row: Row) => number },
): { rows: Row[] | undefined; tableSort: DataTableSort } {
  const firsts = useMemo(
    () => Object.fromEntries(Object.entries(columns).map(([column, spec]) => [column, (spec as { first: SortDirection }).first])) as Partial<Record<Key, SortDirection>>,
    [columns],
  );
  const { key, direction, tableSort } = useSiteSort(firsts, options.opening, options.openingDirection);
  const { name, group } = options;
  const sorted = useMemo(() => {
    if (!rows) return undefined;
    // Always one of `columns`: the order in the address is checked against them.
    const value = columns[key]?.value ?? (() => null);
    const order = byValue(value, name, direction);
    return [...rows].sort(group ? (left, right) => group(left) - group(right) || order(left, right) : order);
  }, [rows, columns, key, direction, name, group]);
  return { rows: sorted, tableSort };
}

/**
 * A day-by-day table's sortable columns (docs/plans/active/
 * sites-table-sorting-plan.md, S7): the day, newest first — the order each
 * opens on — and each figure, the most first. Shared by Position bands, New
 * and lost, Link quality and New and lost links, which are the same table.
 */
export function dayTableSorts<Row extends { day: string }, Key extends string>(
  figures: readonly Key[],
  value: (row: Row, figure: Key) => SortValue,
): SiteSortColumns<Row, "day" | Key> {
  const columns: Record<string, { value: (row: Row) => SortValue; first: SortDirection }> = {
    day: { value: (row) => row.day, first: "desc" },
  };
  for (const figure of figures) columns[figure] = { value: (row) => value(row, figure), first: "desc" };
  return columns as SiteSortColumns<Row, "day" | Key>;
}

/** A day-by-day table's rows by their day, for ties. */
export const dayOf = (row: { day: string }) => row.day;
