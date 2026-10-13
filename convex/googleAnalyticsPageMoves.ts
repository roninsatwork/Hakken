import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { decodePages } from "./holdPageRefs";
import { yourPagePaths } from "./yourPages";
import { normalisePage } from "./utils/pageClassification";
import { moveCounts, moveOf, type MoveCounts } from "./utils/pageMoves";
import { blank, shown, type Counted, type ShownRow } from "./googleAnalyticsRows";
import type { ListRow } from "./googleAnalyticsLists";

/**
 * All pages whole (docs/plans/active/all-pages-rethink-plan.md AP5): the
 * pages viewed in these dates, those viewed only in the span before (none
 * now), and the website's own pages (Sites → Your pages) nobody viewed, each
 * a row of its own — with how many pages each filter holds, and the pages
 * nobody viewed that Google sends most clicks, for What Hakken sees.
 */

/** Pages nobody viewed that What Hakken sees names: the two Google sends most clicks. */
const QUIET_NAMED = 2;

export type PageMoves = { counts: MoveCounts; quiet: string[] };

export const moveCountsValidator = v.object({
  all: v.number(),
  gains: v.number(),
  dropped: v.number(),
  static: v.number(),
  none: v.number(),
});

/** An address's scheme and host, from the first full address there is: the website's own pages are written as its list writes them. */
function originOf(addresses: Iterable<string>): string {
  for (const address of addresses) {
    const found = /^https?:\/\/[^/]+/i.exec(address);
    if (found) return found[0];
  }
  return "";
}

/**
 * The page list's rows with the quiet pages added, every row named by its
 * address (`addresses` holds those already read whole and gains the rest).
 * A page viewed only before keeps its page number, so it opens its own
 * screen; a page nobody viewed is named by its address and opens none.
 */
export async function withQuietPages(
  ctx: { db: QueryCtx["db"] },
  holdId: Id<"companyWebsites">,
  rows: readonly ShownRow[],
  earlier: readonly ListRow[] | null,
  counted: readonly Counted[],
  addresses: Map<string, string>,
): Promise<{ rows: ShownRow[]; moves: PageMoves }> {
  const viewed = new Set(rows.map((row) => row.key));
  const gone = (earlier ?? []).filter((row) => !viewed.has(row.key) && row.views > 0).map((row) => shown(blank(row.key), row, counted, true));
  const named = [...rows, ...gone];
  const unread = named.map((row) => row.key).filter((key) => !addresses.has(key));
  const read = unread.length > 0 ? await decodePages(ctx, holdId, unread) : [];
  unread.forEach((key, index) => addresses.set(key, read[index]));
  for (const row of named) row.label = addresses.get(row.key) ?? row.label;

  const listed = new Set(named.map((row) => normalisePage(row.label)));
  const clicks = new Map<string, number>();
  const origin = originOf(addresses.values());
  const quiet: ShownRow[] = [];
  for (const page of (await yourPagePaths(ctx, holdId)) ?? []) {
    const path = normalisePage(page.page);
    clicks.set(path, Math.max(clicks.get(path) ?? 0, page.clicks));
    if (listed.has(path)) continue;
    listed.add(path);
    const address = /^https?:\/\//i.test(page.page) ? page.page : `${origin}${page.page}`;
    quiet.push(shown(blank(address), null, counted, earlier !== null));
  }
  const all = [...named, ...quiet];
  const clicksOf = (row: ShownRow) => clicks.get(normalisePage(row.label)) ?? 0;
  const none = all
    .filter((row) => moveOf(row.views, row.viewsBefore) === "none")
    .sort((left, right) => clicksOf(right) - clicksOf(left) || left.label.localeCompare(right.label));
  return { rows: all, moves: { counts: moveCounts(all), quiet: none.slice(0, QUIET_NAMED).map((row) => row.label) } };
}
