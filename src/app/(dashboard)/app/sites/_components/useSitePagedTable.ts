"use client";

import type { usePaginatedQuery } from "convex/react";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";

/**
 * The house server-paged table, for the Sites tables: fifteen rows a page,
 * and a page the server sent back short topped up before it is shown. The
 * Sites queries narrow their reads with `maximumRowsRead` (D15), so a rare
 * filter on a large site can answer with fewer rows than asked while more
 * remain — see `fillShortPages` in `useServerPagedTable`.
 */
export function useSitePagedTable<Query extends Parameters<typeof usePaginatedQuery>[0]>(
  query: Query,
  args: Parameters<typeof usePaginatedQuery<Query>>[1],
) {
  return useServerPagedTable(query, args, TABLE_PAGE_SIZE, { fillShortPages: true });
}
