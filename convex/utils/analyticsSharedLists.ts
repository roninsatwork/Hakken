/**
 * The shared lists' one rule for size (docs/plans/active/ga-stored-figures-plan.md
 * SF14; Anthony, 2026-10-14: "we don't need to store this so precisely that
 * it's not reusable"): each page's or event's top rows kept, the rest added
 * into one row. Plain constants, for the collection, the reads and the
 * screens alike.
 */

/** Rows kept for each page or event of a shared list; the rest added into one "other" row. */
export const PAGE_TOP_ROWS = 20;

/** The row standing for a page's or event's rows past its top 20. */
export const OTHER_ROWS = "(other)";
