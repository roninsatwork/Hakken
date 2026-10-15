/**
 * The shared lists' one rule for size (docs/plans/active/ga-stored-figures-plan.md
 * SF14; Anthony, 2026-10-14: "we don't need to store this so precisely that
 * it's not reusable"): each page's or event's top rows kept, the rest added
 * into one row. Plain constants, for the collection, the reads and the
 * screens alike.
 */

/** Rows kept for each page or event of a shared list; the rest added into one "other" row. */
export const PAGE_TOP_ROWS = 20;

/**
 * Rows each page keeps while a big website's list is read
 * (ga-big-site-reliability-plan.md BR3): five times the 20 stored, the rest
 * added into its "other" row at once, so the 20 chosen at the end are the
 * same as from the whole list but for rows past a page's 100th.
 */
export const TRIM_KEEP = 100;

/** The row standing for a page's or event's rows past its top 20. */
export const OTHER_ROWS = "(other)";

/**
 * A page list is trimmed while Google's answers arrive once more than this many
 * rows are held (ga-big-site-reliability-plan.md BR3): below it, nothing is
 * trimmed before the end, so a small website keeps exactly what it did.
 */
export const TRIM_ABOVE = 50_000;

/**
 * When a list read a piece at a time is cut next (BR3): past `TRIM_ABOVE`
 * rows held, and again only once twice what the last cut left — so a website
 * whose pages each have under 100 rows, which a cut cannot shorten, is not
 * sorted again with every answer.
 */
export function trimDue() {
  let next = TRIM_ABOVE;
  return {
    now: (size: number) => size > next,
    after: (size: number) => {
      next = Math.max(TRIM_ABOVE, 2 * size);
    },
  };
}
