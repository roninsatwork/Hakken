import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { SEO_KEYWORD_CHECK_OPERATION } from "./dataForSeoRegistry";
import { dailyPositionsKeptFrom } from "./seoCollectionPolicy";

/**
 * Daily keyword positions kept 90 days, then a week at a time
 * (docs/plans/active/dataforseo-cost-plan.md, B1; Anthony, 2026-10-06).
 *
 * Past the 90 days (`dailyPositionsKeptFrom`) a search keeps, for each week,
 * its last check — the point a week's step of a position chart already
 * shows, since a position is a level and a week takes its last day's
 * (`siteGoogle.searchPositions`). A week is Monday to Sunday, as a chart's
 * weeks are, and stops at the end of its month, so a month's step keeps its
 * last day too. The rows a keyword list filed and the ones a check of the
 * search filed are kept apart, each its week's last, because a search no
 * company tracks charts only the list's (`siteGoogle.searchPositions`).
 * Nothing about a search's history is lost but the days in between: its
 * first and best checks are kept in its summary (`websiteSearchStats`).
 */

/** A day's positions read per page: each asks after the rest of its week, so a page stays well inside a function's reads. */
export const THIN_PAGE = 100;

/** Later rows in a week read per position: six days, each a list's and a check's, and room to spare. */
const LATER_IN_WEEK = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The days a kept position stands for once its week is thinned: its week, Monday to Sunday, inside its month. */
export function positionWeekOf(day: string): { from: string; to: string } {
  const date = Date.parse(`${day}T00:00:00Z`);
  const weekday = (new Date(date).getUTCDay() + 6) % 7;
  const monday = isoDay(date - weekday * DAY_MS);
  const sunday = isoDay(date + (6 - weekday) * DAY_MS);
  const monthStart = `${day.slice(0, 7)}-01`;
  const at = new Date(date);
  const monthEnd = isoDay(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0));
  return { from: monday < monthStart ? monthStart : monday, to: sunday > monthEnd ? monthEnd : sunday };
}

/** Whether a position came from a check of the search, rather than a keyword list: each pull read once a page. */
function checkKinds(ctx: QueryCtx) {
  const kinds = new Map<Id<"seoDataPulls">, Promise<boolean>>();
  return (pullId: Id<"seoDataPulls">) => {
    const held = kinds.get(pullId) ?? ctx.db.get(pullId).then((pull) => pull?.operationId === SEO_KEYWORD_CHECK_OPERATION);
    kinds.set(pullId, held);
    return held;
  };
}

/**
 * One page of the thinning, from where the last stopped: each position on the
 * day being thinned is cleared when a later one of its kind in its week is
 * kept, so only the week's last remains. Answers whether a page more is
 * waiting now; a day not yet past the 90 days waits for its turn.
 */
export async function thinOldPositions(ctx: MutationCtx, now: number): Promise<{ more: boolean }> {
  const keptFrom = dailyPositionsKeptFrom(isoDay(now));
  const state = await ctx.db.query("positionThinning").first();
  const day = state?.day ?? (await ctx.db.query("seoKeywordPositions").withIndex("by_day").first())?.day;
  if (day === undefined || day >= keptFrom) return { more: false };

  // A week's last day is kept whole: nothing on it to read.
  const week = positionWeekOf(day);
  const page = week.to === day
    ? { page: [], isDone: true, continueCursor: "" }
    : await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_day", (q) => q.eq("day", day))
      .paginate({ cursor: state?.cursor ?? null, numItems: THIN_PAGE });
  const isCheck = checkKinds(ctx);
  for (const row of page.page) {
    // A row from before places were sent is left as it is.
    if (row.locationCode === undefined) continue;
    const later = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_website_keyword_place_day", (q) =>
        q.eq("websiteId", row.websiteId).eq("keyword", row.keyword).eq("locationCode", row.locationCode).gt("day", row.day).lte("day", week.to))
      .take(LATER_IN_WEEK);
    const kind = await isCheck(row.pullId);
    for (const other of later) {
      if ((await isCheck(other.pullId)) !== kind) continue;
      await ctx.db.delete(row._id);
      break;
    }
  }

  const next = page.isDone
    ? { day: (await ctx.db.query("seoKeywordPositions").withIndex("by_day", (q) => q.gt("day", day)).first())?.day ?? isoDay(Date.parse(`${day}T00:00:00Z`) + DAY_MS), cursor: null }
    : { day, cursor: page.continueCursor };
  if (state) await ctx.db.patch(state._id, { ...next, updatedAt: now });
  else await ctx.db.insert("positionThinning", { ...next, updatedAt: now });
  return { more: next.day < keptFrom };
}

/**
 * Where a search stood on a day: that day's check, or, for a day past the 90
 * days kept day by day, its week's last — the one kept. The better of two
 * checks on the same day, as a chart's day is.
 */
export async function positionOnDay(
  ctx: QueryCtx,
  key: { websiteId: Id<"websites">; keyword: string; locationCode: number; day: string; today: string },
): Promise<Doc<"seoKeywordPositions"> | null> {
  const onDay = await ctx.db
    .query("seoKeywordPositions")
    .withIndex("by_website_keyword_place_day", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("locationCode", key.locationCode).eq("day", key.day))
    .first();
  if (onDay || key.day >= dailyPositionsKeptFrom(key.today)) return onDay;
  const week = positionWeekOf(key.day);
  const kept = await ctx.db
    .query("seoKeywordPositions")
    .withIndex("by_website_keyword_place_day", (q) =>
      q.eq("websiteId", key.websiteId).eq("keyword", key.keyword).eq("locationCode", key.locationCode).gte("day", week.from).lte("day", week.to))
    .order("desc")
    .take(LATER_IN_WEEK);
  const last = kept[0]?.day;
  return kept
    .filter((row) => row.day === last)
    .sort((left, right) => (left.position ?? Infinity) - (right.position ?? Infinity))[0] ?? null;
}
