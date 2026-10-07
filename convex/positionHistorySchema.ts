import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * A keyword's positions as a graph line (docs/plans/active/keep-less-history-plan.md,
 * part 1): one record per website, keyword, place and month, holding that
 * month's points as short lists of numbers, row for row across them, in place
 * of a row per keyword per check (`seoKeywordPositions`, 396 bytes a point).
 * Read and written only through `positionHistory.ts`.
 *
 * How fine the points are goes with age (Decision 1, 2026-10-07): each check
 * for 90 days, each week's last to a year, each month's last to two years,
 * and nothing older (`coarsenPositions`). Which purchase filed a point is not
 * kept (Decision 10): a point is found by keyword, day and kind.
 */
export const positionHistoryTables = {
  keywordPositionMonths: defineTable({
    websiteId: v.id("websites"),
    keyword: v.string(),
    locationCode: v.number(),
    /** `YYYY-MM`. */
    month: v.string(),
    /** DAY: a point a day; WEEK: each week's last of each kind; MONTH: the month's last of each kind. */
    grain: v.union(v.literal("DAY"), v.literal("WEEK"), v.literal("MONTH")),
    /** The day of the month of each point, oldest first, one a day. */
    days: v.array(v.number()),
    /** Its place among Google's normal results; null when checked and not found. */
    positions: v.array(v.union(v.number(), v.null())),
    /** Its place among everything on the page; null where none was given. */
    pagePositions: v.array(v.union(v.number(), v.null())),
    /** What filed it: 0 a keyword list, 1 a check of the search. */
    kinds: v.array(v.number()),
    /** Each ranking page's address once; a point names its own by `pageRefs`. */
    pages: v.array(v.string()),
    /** The point's address in `pages`, -1 for none. */
    pageRefs: v.array(v.number()),
  })
    // A search's line: the chart, the compare column, its summary, a watch.
    .index("by_website_keyword_place_month", ["websiteId", "keyword", "locationCode", "month"])
    // A website's searches from a place: the admin's list, the agent's look-up, a website's purge.
    .index("by_website_place_month", ["websiteId", "locationCode", "month"])
    // One search's checks across websites: a check's results taken away when
    // nobody tracks it, a pass carrying on after the last website it reached.
    .index("by_keyword_place_month_website", ["keyword", "locationCode", "month", "websiteId"])
    // The coarsening: the months of each grain, oldest first.
    .index("by_grain_month", ["grain", "month"]),
};
