export const TABLE_PAGE_SIZE = 15;

export function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

export function matchesSearchTerm(searchTerm: string, values: Array<string | null | undefined>) {
  const normalizedSearch = normalizeSearchTerm(searchTerm);

  if (!normalizedSearch) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedSearch));
}

/** One place in a numbered footer: a page number, or "gap" for the "…" standing in for the pages between. */
export type PageSlot = number | "gap";

/**
 * The page numbers a numbered footer shows (the Sites tables, docs/plans/active/
 * sites-table-pages-plan.md §2): the first and last page always, the pages
 * either side of the current one, and "…" for the rest — `1 2 3 4 5 … 31` on
 * page 1, `1 … 9 10 11 … 31` on page 10, `1 … 27 28 29 30 31` on the last.
 *
 * Always the same number of places once there are enough pages, so the
 * numbers do not shuffle about as the reader steps through them, and a "…"
 * never stands for a single page — that page is shown instead, since the
 * number takes no more room than the dots.
 */
export function pageSlots(current: number, total: number, siblings = 1): PageSlot[] {
  const last = Math.max(1, Math.floor(total));
  const page = Math.min(Math.max(1, Math.floor(current)), last);
  // The first and last pages, the current one, its siblings, and two gaps.
  const width = siblings * 2 + 5;
  if (last <= width) return Array.from({ length: last }, (_, index) => index + 1);

  const from = Math.max(Math.min(page - siblings, last - siblings * 2 - 2), 3);
  const to = Math.min(Math.max(page + siblings, siblings * 2 + 3), last - 2);
  const middle = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  return [1, from > 3 ? "gap" : 2, ...middle, to < last - 2 ? "gap" : last - 1, last];
}

export function paginateItems<T>(items: T[], page: number, pageSize: number = TABLE_PAGE_SIZE) {
  const totalItems = items.length;
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
  };
}
