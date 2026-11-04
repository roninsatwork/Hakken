/**
 * All pages' filters (docs/plans/active/all-pages-rethink-plan.md AP5): each
 * page by how its views moved against the span before. A gain or a drop is
 * `MOVE_VIEWS` views or more either way — a page going from 1 view to 2 is
 * "up 100%" and means nothing — and the screen says so beside its table. A
 * page nobody viewed in these dates has no visits, however many it had before
 * (its Views change still shows the fall), so the pages viewed and the pages
 * with no visits always add up to every page. Without a span before, nothing
 * moved.
 */

export const PAGE_MOVES = ["gains", "dropped", "static", "none"] as const;
export type PageMove = (typeof PAGE_MOVES)[number];

/** A gain or a drop: this many views or more, up or down. */
export const MOVE_VIEWS = 3;

/** How a page's views moved: `viewsBefore` is null without a span before. */
export function moveOf(views: number, viewsBefore: number | null): PageMove {
  if (views === 0) return "none";
  const by = viewsBefore === null ? 0 : views - viewsBefore;
  return by >= MOVE_VIEWS ? "gains" : by <= -MOVE_VIEWS ? "dropped" : "static";
}

export type MoveCounts = Record<PageMove | "all", number>;

/** How many pages each filter holds, and all of them. */
export function moveCounts(rows: ReadonlyArray<{ views: number; viewsBefore: number | null }>): MoveCounts {
  const counts: MoveCounts = { all: rows.length, gains: 0, dropped: 0, static: 0, none: 0 };
  for (const row of rows) counts[moveOf(row.views, row.viewsBefore)] += 1;
  return counts;
}

/** A busy page: this many visits a month or more (all-pages-way-6-plan-2026-11-04.md, step 1). */
const BUSY_VISITS_A_MONTH = 50;

/**
 * How many visits make a page busy on these dates: 50 in a month, growing or shrinking with the days chosen, so nothing is
 * busy on a week and far too much isn't on a year. About 12 on a week and 600 on a year.
 */
export function busyVisitsFor(from: string | null, to: string | null): number {
  if (!from || !to) return BUSY_VISITS_A_MONTH;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days < 25) return Math.max(1, Math.round((BUSY_VISITS_A_MONTH * days) / 30));
  return BUSY_VISITS_A_MONTH * Math.round(days / 30.4);
}

export type PageBands = { busyVisits: number; busy: number; busyFewer: number; quiet: number; quietMore: number };

/** How many busy pages got fewer views, and how many quiet ones got more. A page nobody visited is neither. */
export function pageBandsOf(rows: ReadonlyArray<{ visits: number; views: number; viewsBefore: number | null }>, busyVisits: number): PageBands {
  const bands: PageBands = { busyVisits, busy: 0, busyFewer: 0, quiet: 0, quietMore: 0 };
  for (const row of rows) {
    if (row.visits <= 0) continue;
    const move = moveOf(row.views, row.viewsBefore);
    if (row.visits >= busyVisits) {
      bands.busy += 1;
      if (move === "dropped") bands.busyFewer += 1;
    } else {
      bands.quiet += 1;
      if (move === "gains") bands.quietMore += 1;
    }
  }
  return bands;
}

/** How many pages it took to make half of the views. */
function pagesForHalf(views: readonly number[]): number | null {
  const sorted = views.filter((value) => value > 0).sort((left, right) => right - left);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  let held = 0;
  for (let at = 0; at < sorted.length; at += 1) {
    held += sorted[at];
    if (held * 2 >= total) return at + 1;
  }
  return sorted.length;
}

export type ViewsConcentration = { pagesForHalf: number | null; pagesForHalfBefore: number | null; noViews: number; noViewsBefore: number | null };

/** How few pages make half the views, and how many had none, now and in the span before. */
export function viewsConcentration(rows: ReadonlyArray<{ views: number; viewsBefore: number | null }>): ViewsConcentration {
  const hadBefore = rows.some((row) => row.viewsBefore !== null);
  return {
    pagesForHalf: pagesForHalf(rows.map((row) => row.views)),
    pagesForHalfBefore: hadBefore ? pagesForHalf(rows.map((row) => row.viewsBefore ?? 0)) : null,
    noViews: rows.filter((row) => row.views === 0).length,
    noViewsBefore: hadBefore ? rows.filter((row) => !row.viewsBefore).length : null,
  };
}

/** Pages drawn on All pages' "Views a day" beside the website (AP3): five at most, so the lines stay readable. */
export const MOST_PLOTTED = 5;
