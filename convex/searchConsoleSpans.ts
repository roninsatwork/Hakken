import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { titlesOf } from "./pageTitles";
import type { BookNames } from "./searchConsolePeriodBooks";
import { googleHasSpan } from "./searchConsolePeriodReads";
import type { MovedPage, TrackedList, TrackedMove } from "./utils/searchConsoleViews";

/**
 * What Search Console's lists need from a span of days, beside `searchConsoleLists.ts` (moved out as it passed a thousand
 * lines, 2026-11-17; search-console-pages-way-1-plan-2026-11-17.md): whether Google has figures for a span, the shape of a
 * page's or keyword's days, and the pages that moved most named for the eye.
 */

const dayValidator = v.object({ day: v.string(), clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() });
const figuresValidator = v.object({ clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() });

export const keySeriesAnswer = v.union(
  // `daysBefore`: the span before's days, asked with the dates, for a keyword's day chart's grey line (2026-11-17).
  v.object({ ok: v.literal(true), days: v.array(dayValidator), daysBefore: v.optional(v.array(dayValidator)), totals: v.union(figuresValidator, v.null()), previous: v.union(figuresValidator, v.null()), previousHeld: v.boolean() }),
  v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
);

/** Whether Google has figures for a span of the website's days (`googleHasSpan`): a page's or keyword's days are set against it only then. */
export const googleHasDays = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites"), from: v.string(), to: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId) return false;
    return await googleHasSpan(ctx, hold._id, args.from, args.to);
  },
});

/** The pages that moved most, named as the rows on screen are, each with its title where the website has one. */
export async function namedMovers(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  movers: { up: MovedPage | null; down: MovedPage | null },
  names: BookNames | null,
): Promise<{ up: MovedPage | null; down: MovedPage | null }> {
  const named = { ...movers };
  for (const way of ["up", "down"] as const) {
    const moved = movers[way];
    if (!moved) continue;
    const key = names ? await names.textOf(moved.key) : moved.key;
    const title = (await titlesOf(ctx, companyWebsiteId, [key])).get(key);
    named[way] = { ...moved, key, ...(title ? { title } : {}) };
  }
  return named;
}

/**
 * A tracked list's rows that moved, and the busiest onto and off Google's first page, named as the rows on screen are: a
 * keyword's text from the book, a page with its title where the website has one (search-console-tracked-way-1-plan-2026-11-18.md).
 */
export async function namedTracked(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  tracked: TrackedList,
  names: BookNames | null,
  pages: boolean,
): Promise<TrackedList> {
  const nameOne = async (moved: TrackedMove | null): Promise<TrackedMove | null> => {
    if (!moved) return null;
    const key = names ? await names.textOf(moved.key) : moved.key;
    const title = pages ? (await titlesOf(ctx, companyWebsiteId, [key])).get(key) : undefined;
    return { ...moved, key, ...(title ? { title } : {}) };
  };
  const pair = async (two: { up: TrackedMove | null; down: TrackedMove | null } | null) => (two ? { up: await nameOne(two.up), down: await nameOne(two.down) } : null);
  return {
    ...tracked,
    movers: await pair(tracked.movers),
    places: await pair(tracked.places),
    firstPage: { ...tracked.firstPage, cameTop: await nameOne(tracked.firstPage.cameTop), leftTop: await nameOne(tracked.firstPage.leftTop) },
    busiest: await nameOne(tracked.busiest),
    quietest: tracked.quietest ? { ...tracked.quietest, ...(await nameOne(tracked.quietest)) } : null,
  };
}

/** Figures added up from days: position weighted by impressions, as Google's own. A page's or keyword's own days (`searchConsoleKeySeries`). */
export function totalsOf(days: readonly { clicks: number; impressions: number; position: number }[]) {
  if (days.length === 0) return null;
  const clicks = days.reduce((sum, day) => sum + day.clicks, 0);
  const impressions = days.reduce((sum, day) => sum + day.impressions, 0);
  const positionSum = days.reduce((sum, day) => sum + day.position * day.impressions, 0);
  return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position: impressions > 0 ? positionSum / impressions : 0 };
}
