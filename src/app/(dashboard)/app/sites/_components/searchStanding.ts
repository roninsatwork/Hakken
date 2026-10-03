import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import type { SiteSortColumns } from "./useSiteSort";

/**
 * Where the site stands on a tracked search, as two pages show it: Your
 * searches, and Tracked fan-out queries — the same searches, the second only
 * the ones ticked from Fan-out queries (Anthony, 2026-10-03). One copy, so the
 * two never judge or order a search differently.
 */

/** How a search is doing (`convex/utils/trackingVerdicts.ts`), in the order the "How it's doing" filter offers them. */
export const SEARCH_VERDICTS = ["TOP_THREE", "PAGE_ONE", "SLIPPING", "RANKING", "TOO_NEW", "NOT_FOUND", "NEVER_RANKED", "NOT_CHECKED"] as const;
export type SearchVerdict = (typeof SEARCH_VERDICTS)[number];

/** The icon each verdict wears: the words carry it, the tone only repeats it. */
export const SEARCH_VERDICT_TONES: Record<SearchVerdict, StatusTone> = {
  TOP_THREE: "success",
  PAGE_ONE: "success",
  SLIPPING: "warning",
  RANKING: "neutral",
  TOO_NEW: "neutral",
  NOT_FOUND: "warning",
  NEVER_RANKED: "neutral",
  NOT_CHECKED: "neutral",
};

/** A search's standing, as `siteGoogle.listSearches` sends it. */
type Standing = { lastPosition: number | null; previousPosition: number | null; bestPosition: number | null; lastCheckedDay: string | null };

/**
 * The standing's columns that sort (docs/plans/active/sites-table-sorting-plan.md):
 * the position — the order both pages open on — and the best from the top;
 * the biggest rise first; the newest checked first.
 */
export const STANDING_SORTS: SiteSortColumns<Standing, "position" | "change" | "best" | "checked"> = {
  position: { value: (row) => row.lastPosition, first: "asc" },
  change: { value: (row) => (row.lastPosition !== null && row.previousPosition !== null ? row.previousPosition - row.lastPosition : null), first: "desc" },
  best: { value: (row) => row.bestPosition, first: "asc" },
  checked: { value: (row) => row.lastCheckedDay, first: "desc" },
};
