"use client";

import { useState } from "react";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";

/**
 * Page numbers over a list a screen has already assembled.
 *
 * `useServerPagedTable` covers the common case — one Convex query, paged on the
 * server. Some screens cannot use it because the table is two lists stitched
 * together: a directory shows pending invitations above people, and they come
 * from different queries. This does the same job over whatever array the screen
 * ends up with.
 *
 * The behaviour matches `useServerPagedTable` deliberately, because the reader
 * should not be able to tell which one a screen used: one page on screen at a
 * time, Next fetches from the server only when it walks past what is already in
 * hand, and the count never claims a total nobody has counted.
 *
 * The house footer — "Showing 1-15 of N", Previous, Page X of Y, Next — is the
 * standard on every table. Screens that used to end in a lone "Load more" button
 * were the drift, not the rule.
 */
export function usePagedRows<Row>(
  rows: Row[],
  options: {
    /** True while the server still has rows it has not sent. */
    canLoadMore: boolean;
    /** Asks for the next batch. */
    loadMore: (count: number) => void;
    /** Resets to page one when it changes — a new search, a new filter. */
    resetKey?: string;
    pageSize?: number;
  }
) {
  const pageSize = options.pageSize ?? TABLE_PAGE_SIZE;
  const [page, setPage] = useState(1);

  // A new search starts at the beginning; staying on page 4 of a list that just
  // became one page long shows an empty table. Adjusted during render rather
  // than in an effect, so nobody ever sees the stale page.
  const resetKey = options.resetKey ?? "";
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setPage(1);
  }

  const loadedCount = rows.length;
  const loadedPages = Math.max(1, Math.ceil(loadedCount / pageSize));
  // One more page exists whenever the server still has rows to give.
  const totalPages = options.canLoadMore ? loadedPages + 1 : loadedPages;
  const safePage = Math.min(page, totalPages);

  const goToPage = (next: number) => {
    const wanted = Math.max(1, next);
    // Fetch only when the reader walks past what is already in hand.
    if (wanted * pageSize > loadedCount && options.canLoadMore) loadMoreOnce(options, pageSize);
    setPage(wanted);
  };

  return {
    pageRows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    pageSize,
    totalPages,
    /** What has been fetched so far — never a total nobody has counted. */
    loadedCount,
    goToPage,
  };
}

function loadMoreOnce(
  options: { canLoadMore: boolean; loadMore: (count: number) => void },
  pageSize: number
) {
  options.loadMore(pageSize);
}
