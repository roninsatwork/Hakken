"use client";

import type { usePaginatedQuery } from "convex/react";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useSiteTablePage } from "./useSiteParam";

/**
 * The house server-paged table, for the Sites tables: fifteen rows a page,
 * and a page the server sent back short topped up before it is shown. The
 * Sites queries narrow their reads with `maximumRowsRead` (D15), so a rare
 * filter on a large site can answer with fewer rows than asked while more
 * remain — see `fillShortPages` in `useServerPagedTable`. The page is kept
 * in the address, so Back from a record's screen opens the page that was left.
 */
export function useSitePagedTable<Query extends Parameters<typeof usePaginatedQuery>[0]>(
  query: Query,
  args: Parameters<typeof usePaginatedQuery<Query>>[1],
) {
  const [page, setPage] = useSiteTablePage();
  return useServerPagedTable(query, args, TABLE_PAGE_SIZE, { fillShortPages: true, initialPage: page, onPageChange: setPage });
}

/**
 * The same, over a list the screen already holds whole — a site's rivals, its
 * cited pages — paged in the browser, with its page kept in the address too.
 * `resetKey` is whatever narrows the list; a change starts again at page one.
 */
export function useSitePagedRows<Row>(rows: Row[], resetKey: string) {
  const [page, setPage] = useSiteTablePage();
  return usePagedRows(rows, { canLoadMore: false, loadMore: () => undefined, resetKey, initialPage: page, onPageChange: setPage });
}
