import type { PageKinds } from "./utils/pageKinds";
import { BANDS, type ListRow } from "./utils/searchConsoleViews";
import { listOrder, type ListSorts } from "./siteListPages";

/**
 * How Search Console's lists are ordered by their headings (AGENTS.md, "Every
 * Sites table sorts by its headings, the same way"): over the whole list, the
 * best first, blanks last. A row's keyword, top page and next page are tokens
 * of their build's book where the list keeps them so
 * (core-data-normalisation-plan.md §5.1) — sorted A to Z by the token, since
 * the book is. Apart from `searchConsoleLists.ts`, to keep it a size one can
 * hold in mind.
 */

/** The headings a list orders by, each the best first on its first press. */
export const SORT_KEYS = [
  "key", "clicks", "change", "impressions", "ctr", "position", "positionChange", "share", "count", "top",
  "volume", "estimate", "kind", "brand", "usualCtr", "expected", "topShare", "next", "nextShare", "gap", "band",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
const SORTS: ListSorts<ListRow, SortKey> = {
  key: { value: (row) => row.key, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  // A row Google did not show has no position: a blank, last, never "position 0" first.
  position: { value: (row) => (row.impressions > 0 ? row.position : null), first: "asc" },
  positionChange: { value: (row) => row.positionChange, first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
  count: { value: (row) => row.count, first: "desc" },
  top: { value: (row) => row.top, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  estimate: { value: (row) => row.estimate, first: "desc" },
  kind: { value: (row) => row.kind, first: "asc" },
  brand: { value: (row) => (row.brand === null ? null : row.brand ? 0 : 1), first: "asc" },
  usualCtr: { value: (row) => row.usualCtr, first: "desc" },
  expected: { value: (row) => row.expected, first: "desc" },
  topShare: { value: (row) => row.topShare, first: "desc" },
  next: { value: (row) => row.next, first: "asc" },
  nextShare: { value: (row) => row.nextShare, first: "desc" },
  gap: { value: (row) => row.gap, first: "desc" },
  // Position bands: the top band first; a row Google did not show has none, last.
  band: { value: (row) => (row.impressions > 0 ? BANDS.indexOf(row.band) : null), first: "asc" },
};

/**
 * Ordered over the whole list by the heading pressed. A page's classification
 * sorts by its name, A to Z, Not sorted last — never by its id.
 */
export function sortRows(rows: ListRow[], sort: SortKey | undefined, direction: "asc" | "desc" | undefined, pageKinds: PageKinds | null = null): ListRow[] {
  const sorts: ListSorts<ListRow, SortKey> = pageKinds
    ? { ...SORTS, kind: { value: (row) => (row.kind === null ? null : pageKinds.nameOf(row.kind)), first: "asc" } }
    : SORTS;
  return rows.sort(listOrder(sorts, sort ?? "clicks", direction, (row) => row.key));
}
