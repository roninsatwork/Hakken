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

/** Pages drawn on All pages' "Views a day" beside the website (AP3): five at most, so the lines stay readable. */
export const MOST_PLOTTED = 5;
