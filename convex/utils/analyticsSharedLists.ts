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
 * The most rows one list holds while it is read, whatever the website's size
 * (collection-reliability-plan.md, RR2; Anthony, 2026-10-15: "we need this
 * reliable and scalable"): about 65 MB, an eighth of a step's 512. Each page
 * keeps fewer than `TRIM_KEEP` rows while read when that many pages would pass
 * it — never fewer than the 20 stored and its "other" row, so what is stored is
 * what the whole list would give but for rows past a page's 21st on the
 * biggest websites.
 */
export const HOLD_ROWS = 100_000;

/** Rows each page keeps while read, for a list of `pages` pages held within `hold` rows. */
export function keepPerPage(pages: number, hold: number = HOLD_ROWS): number {
  return Math.max(PAGE_TOP_ROWS + 1, Math.min(TRIM_KEEP, Math.floor(hold / 2 / Math.max(1, pages))));
}

/**
 * When a list read a piece at a time is cut next (BR3): past `TRIM_ABOVE`
 * rows held, then once another half of `hold` has come in since the last cut
 * — so the rows held never pass what the last cut left and half of `hold`
 * more, and a website whose pages each have few rows, which a cut cannot
 * shorten, is not sorted again with every answer. Before RR2 it waited for
 * twice what the last cut left, which let a 10,000-page website's list grow
 * to Google's whole 500,000 rows.
 */
export function trimDue(hold: number = HOLD_ROWS) {
  let next = Math.min(TRIM_ABOVE, hold / 2);
  return {
    now: (size: number) => size > next,
    after: (size: number) => {
      next = Math.max(Math.min(TRIM_ABOVE, hold / 2), size + hold / 2);
    },
  };
}
