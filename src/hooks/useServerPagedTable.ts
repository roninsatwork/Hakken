"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";

/**
 * The house table footer, over a query that pages on the server.
 *
 * The admin tables all wear the same footer — "Showing 1-15 of N",
 * Previous, Page X of Y, Next — and that footer wants page numbers, while
 * Convex pages by cursor. Screens used to bridge the two by fetching a few
 * hundred rows and cutting them up in the browser, which is a bill that
 * grows with the table and a list that silently stops at the cap.
 *
 * This bridges it the other way round: one page is fetched at a time, and
 * pressing Next fetches the next one only if it is not already in hand.
 * The count shown is what has been fetched so far, and Next stays live
 * while the server says there is more — so the footer never claims to know
 * a total it has not counted.
 */
export function useServerPagedTable<Query extends Parameters<typeof usePaginatedQuery>[0]>(
  query: Query,
  args: Parameters<typeof usePaginatedQuery<Query>>[1],
  pageSize: number = TABLE_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const paginated = usePaginatedQuery(query, args, { initialNumItems: pageSize });
  const { results, status, loadMore } = paginated;

  // A new search or filter starts at the beginning; staying on page 4 of a
  // list that just became one page long shows an empty table. Adjusted
  // during render rather than in an effect: React re-renders immediately
  // with the corrected page, so nobody ever sees the stale one.
  const argsKey = JSON.stringify(args ?? {});
  const [lastArgsKey, setLastArgsKey] = useState(argsKey);
  if (lastArgsKey !== argsKey) {
    setLastArgsKey(argsKey);
    setPage(1);
  }

  const loadedCount = results.length;
  const canLoadMore = status === "CanLoadMore";
  const loadedPages = Math.max(1, Math.ceil(loadedCount / pageSize));
  // One more page exists whenever the server still has rows to give.
  const totalPages = canLoadMore ? loadedPages + 1 : loadedPages;
  const safePage = Math.min(page, totalPages);
  const rows = results.slice((safePage - 1) * pageSize, safePage * pageSize);

  const goToPage = (next: number) => {
    const wanted = Math.max(1, next);
    // Fetch only when the reader walks past what is already in hand.
    if (wanted * pageSize > loadedCount && canLoadMore) loadMore(pageSize);
    setPage(wanted);
  };

  return {
    rows,
    page: safePage,
    pageSize,
    totalPages,
    /** What has been fetched so far — never a total nobody has counted. */
    loadedCount,
    hasMore: canLoadMore,
    isLoading: status === "LoadingFirstPage",
    isLoadingMore: status === "LoadingMore",
    /**
     * Waiting on the server for any reason — what the footer wants.
     *
     * Fifteen screens handed the footer `isLoadingMore`, which is false during
     * the very first load, so the footer read a count of zero as an answer of
     * zero and said "nothing found" underneath a table that was showing a
     * spinner. Both states want the same thing from the footer, so they are
     * said once here rather than combined by hand fifteen times.
     */
    isBusy: status === "LoadingFirstPage" || status === "LoadingMore",
    goToPage,
  };
}
