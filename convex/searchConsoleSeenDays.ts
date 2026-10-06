import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { searchTypeValidator, seenType, type SearchType } from "./searchConsoleSchema";
import { stillKeptReady } from "./searchConsoleCountries";

/**
 * New and lost's counts by day (2026-10-04): how many searches and pages the
 * first- and last-seen register holds as first shown, and as last shown, on
 * each day. Its list reads at most `consoleNewLostRows` of each — 5,000 to
 * start — so on a busy website the counts and chart stopped there and July
 * read as nothing. Counted from the whole register after each collection,
 * a page at a time, they count every one; the table keeps its limit.
 */

type Kind = "query" | "page";
type Scope = { companyWebsiteId: Id<"companyWebsites">; country: string | undefined; searchType: SearchType };

/** Register entries read per ask: each is a key and two days. */
const REGISTER_PAGE = 4_000;
/** Days of counts one read returns: more than the longest dates a page can ask for (`consoleLongestRange`, 800) and the lost days before them. */
const DAYS_READ = 900;
/** Days of counts one kind holds at most: one per day of Google's sixteen months (about 490), with room to spare. */
const DAYS_HELD = 900;

const kindValidator = v.union(v.literal("query"), v.literal("page"));

/** One page of a register's first and last days, in key order. */
export const registerDays = internalQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    kind: kindValidator,
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({ first: v.array(v.string()), last: v.array(v.string()), cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleSeen")
      .withIndex("by_hold_country_type_kind_key", (q) => q
        .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", seenType(args.searchType)).eq("kind", args.kind))
      .paginate({ numItems: REGISTER_PAGE, cursor: args.cursor });
    return {
      first: page.page.map((entry) => entry.firstDay),
      last: page.page.map((entry) => entry.lastDay),
      cursor: page.continueCursor,
      done: page.isDone,
    };
  },
});

const dayCountValidator = v.object({ day: v.string(), first: v.number(), last: v.number() });

/** One kind's counts, all at once, for all countries or one: the ones held before go. */
export const writeSeenDays = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    kind: kindValidator,
    days: v.array(dayCountValidator),
    builtAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillKeptReady(ctx, args.companyWebsiteId, args.country))) return null;
    const searchType = seenType(args.searchType);
    const held = await ctx.db
      .query("searchConsoleSeenDays")
      .withIndex("by_hold_country_type_kind_day", (q) => q
        .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", searchType).eq("kind", args.kind))
      .take(DAYS_HELD);
    for (const row of held) await ctx.db.delete(row._id);
    for (const day of args.days) {
      await ctx.db.insert("searchConsoleSeenDays", {
        companyWebsiteId: args.companyWebsiteId,
        ...(args.country === undefined ? {} : { country: args.country }),
        ...(searchType === undefined ? {} : { searchType }),
        kind: args.kind,
        ...day,
        builtAt: args.builtAt,
      });
    }
    return null;
  },
});

/** Count one kind of result's register — searches and pages — by first and last day shown, and keep the counts. */
export async function buildSeenDays(ctx: ActionCtx, scope: Scope, builtAt: number): Promise<void> {
  for (const kind of ["query", "page"] as const) {
    const days = new Map<string, { first: number; last: number }>();
    const tally = (day: string, side: "first" | "last") => {
      const counts = days.get(day) ?? { first: 0, last: 0 };
      counts[side] += 1;
      days.set(day, counts);
    };
    let cursor: string | null = null;
    for (;;) {
      const page: { first: string[]; last: string[]; cursor: string; done: boolean } = await ctx.runQuery(internal.searchConsoleSeenDays.registerDays, {
        companyWebsiteId: scope.companyWebsiteId,
        ...(scope.country === undefined ? {} : { country: scope.country }),
        searchType: scope.searchType,
        kind,
        cursor,
      });
      for (const day of page.first) tally(day, "first");
      for (const day of page.last) tally(day, "last");
      if (page.done) break;
      cursor = page.cursor;
    }
    await ctx.runMutation(internal.searchConsoleSeenDays.writeSeenDays, {
      companyWebsiteId: scope.companyWebsiteId,
      ...(scope.country === undefined ? {} : { country: scope.country }),
      searchType: scope.searchType,
      kind,
      days: [...days].sort(([left], [right]) => left.localeCompare(right)).map(([day, counts]) => ({ day, ...counts })),
      builtAt,
    });
  }
}

/**
 * One kind's counts between two days, by day — or null when none have been
 * counted yet (a register built before 2026-10-04, until the next
 * collection), for New and lost to read its own list instead.
 */
export async function seenDaysBetween(
  ctx: { db: QueryCtx["db"] },
  scope: Scope,
  kind: Kind,
  from: string,
  to: string,
): Promise<Map<string, { first: number; last: number }> | null> {
  const searchType = seenType(scope.searchType);
  const country = scope.country;
  const counted = await ctx.db
    .query("searchConsoleSeenDays")
    .withIndex("by_hold_country_type_kind_day", (q) => q
      .eq("companyWebsiteId", scope.companyWebsiteId).eq("country", country).eq("searchType", searchType).eq("kind", kind))
    .first();
  if (!counted) return null;
  const rows = await ctx.db
    .query("searchConsoleSeenDays")
    .withIndex("by_hold_country_type_kind_day", (q) => q
      .eq("companyWebsiteId", scope.companyWebsiteId).eq("country", country).eq("searchType", searchType).eq("kind", kind)
      .gte("day", from).lte("day", to))
    .take(DAYS_READ);
  return new Map(rows.map((row) => [row.day, { first: row.first, last: row.last }]));
}
