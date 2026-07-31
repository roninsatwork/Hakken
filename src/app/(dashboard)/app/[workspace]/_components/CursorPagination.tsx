"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Page-at-a-time pagination against a Convex cursor.
 *
 * The alternative already in this codebase accumulates every page fetched so
 * far and slices the array to show one — which means page 30 of the sales
 * table holds all 4,500 rows in the browser, and the "processing" the table
 * does grows with how far someone has scrolled. This keeps exactly one page in
 * memory: moving forward asks the server for the next page, moving back
 * replays a cursor already seen.
 *
 * Cursors are kept in a stack rather than recomputed because Convex cursors
 * are opaque and only move forward; the stack is what makes Previous possible
 * without refetching from the start.
 *
 * `resetKey` names the query the cursors belong to — a table, a filter, any
 * argument that changes which rows are being walked. Convex rejects a cursor
 * offered to a query it did not come from, so the position has to be dropped
 * in the same render the key changes: clearing it from an effect afterwards
 * still lets one render fire a query with the previous query's cursor, which
 * is an InvalidCursor error on the server rather than a wasted fetch.
 */
export function useCursorPagination(resetKey: string = "") {
  const [state, setState] = useState<{
    key: string;
    cursors: (string | null)[];
    pageIndex: number;
  }>({ key: resetKey, cursors: [null], pageIndex: 0 });

  // Derived, not read from state: on the render where the key changes, state
  // is still the old query's and must not reach a `useQuery` below.
  const isStale = state.key !== resetKey;
  const pageIndex = isStale ? 0 : state.pageIndex;
  const cursor = isStale ? null : (state.cursors[state.pageIndex] ?? null);

  if (isStale) {
    setState({ key: resetKey, cursors: [null], pageIndex: 0 });
  }

  const next = useCallback((continueCursor: string) => {
    setState((previous) => {
      const nextIndex = previous.pageIndex + 1;
      return {
        key: previous.key,
        cursors:
          previous.cursors.length > nextIndex
            ? previous.cursors
            : [...previous.cursors, continueCursor],
        pageIndex: nextIndex,
      };
    });
  }, []);

  const previous = useCallback(() => {
    setState((current) => ({
      ...current,
      pageIndex: Math.max(0, current.pageIndex - 1),
    }));
  }, []);

  const reset = useCallback(() => {
    setState((current) => ({ key: current.key, cursors: [null], pageIndex: 0 }));
  }, []);

  return useMemo(
    () => ({ cursor, pageIndex, next, previous, reset }),
    [cursor, pageIndex, next, previous, reset]
  );
}

export function CursorPaginationFooter({
  pageIndex,
  rowsOnPage,
  isDone,
  isLoading,
  onPrevious,
  onNext,
  labels,
}: {
  pageIndex: number;
  rowsOnPage: number;
  isDone: boolean;
  isLoading: boolean;
  onPrevious: () => void;
  onNext: () => void;
  labels: { page: (page: number) => string; showing: (count: number) => string };
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border-dim">
      <span className="text-[12px] text-secondary">
        {isLoading ? "" : `${labels.page(pageIndex + 1)} · ${labels.showing(rowsOnPage)}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={pageIndex === 0 || isLoading}
          className="p-1.5 rounded-[8px] border border-border-dim text-secondary disabled:opacity-40 hover:text-foreground transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={isDone || isLoading}
          className="p-1.5 rounded-[8px] border border-border-dim text-secondary disabled:opacity-40 hover:text-foreground transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
