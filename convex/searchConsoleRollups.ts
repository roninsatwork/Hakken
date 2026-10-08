import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LISTS_OF } from "./searchConsoleApi";
import {
  COLLECTED_SEARCH_TYPES,
  listValidator,
  searchTypeValidator,
  storedNumbersValidator,
  type SearchConsoleGrain,
  type SearchConsoleList,
  type SearchType,
} from "./searchConsoleSchema";
import { firstDayKept, monthStart, weekStart } from "./utils/searchConsolePacks";

/**
 * What is kept, as it ages and as it is read back
 * (docs/plans/active/search-console-plan.md §14.3, items 3 and 4, as
 * keep-less-history-plan.md part 3 changed it on 2026-10-07): days kept 60,
 * nothing rolled into weeks or months — the lines past them cleared at each
 * settle — and the kept records read back for the ready-made periods. All
 * countries, and each country kept ready on its own (§16) — `country` missing
 * is all countries — always by the hold's index, country second, so one
 * country's work never passes over another's records.
 */

/** Records cleared per kind of result, list and grain in one step: whole records, each up to a few hundred kilobytes. */
const DROP_PER_SLOT = 2;

/** Steps one settle clears at most: the rest wait for the next. */
const DROP_ROUNDS = 200;

/**
 * Kept records one read returns, a page at a time: a record is at most 8,000
 * rows (`PART_ROWS`), under a megabyte, so a page stays well inside the 16 MB
 * one function may read. Until 2026-10-05 a read took a fixed span at once —
 * fifteen days — and morehandles.co.uk's pairs, about six records a day of
 * 220 KB each, came to 19 MB: its periods were never built.
 */
const KEPT_PAGE = 12;

/**
 * The most parts one slot is read in: 2,000 rows each, so a million rows — a
 * week of pairs for a very large website is a few hundred thousand.
 */
export const PARTS_MOST = 500;

/** A kept record as stored: its number columns packed as text (`packNumbers`), read back by the action. */
const packedValidator = {
  keys: v.array(v.string()),
  pages: v.optional(v.array(v.string())),
  clicks: storedNumbersValidator,
  impressions: storedNumbersValidator,
  positionSums: storedNumbersValidator,
};

const countryArg = { country: v.optional(v.string()) };

/** A kept list's records for one slot: one day, week or month of one list, for all countries or one. */
export async function slotParts(
  ctx: { db: MutationCtx["db"] | QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsoleList,
  grain: SearchConsoleGrain,
  start: string,
) {
  return await ctx.db
    .query("searchConsoleLists")
    .withIndex("by_hold_country_type_list_grain_start", (q) => q
      .eq("companyWebsiteId", companyWebsiteId)
      .eq("country", country)
      .eq("searchType", searchType)
      .eq("list", list)
      .eq("grain", grain)
      .eq("start", start))
    .take(PARTS_MOST);
}

// ---------------------------------------------------------------------------
// Clearing the lines past the days kept
// ---------------------------------------------------------------------------

/**
 * One step of a kind of result's lines past the days kept, for all countries
 * or one: each day before the first kept, and every week and month rolled up
 * before 2026-10-07. True while more are left.
 */
export const dropOldLines = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), newest: v.string(), searchType: searchTypeValidator, ...countryArg },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const dayLine = firstDayKept(args.newest);
    let more = false;
    for (const list of LISTS_OF[args.searchType]) {
      for (const grain of ["DAY", "WEEK", "MONTH"] as const) {
        const old = await ctx.db
          .query("searchConsoleLists")
          .withIndex("by_hold_country_type_list_grain_start", (q) => {
            const slot = q.eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType)
              .eq("list", list).eq("grain", grain);
            return grain === "DAY" ? slot.lt("start", dayLine) : slot;
          })
          .take(DROP_PER_SLOT);
        for (const record of old) await ctx.db.delete(record._id);
        if (old.length === DROP_PER_SLOT) more = true;
      }
    }
    return more;
  },
});

/** A website's lines past the days kept cleared after collecting, for all countries or one kept ready: how many steps it took. */
export async function dropOldLinesOf(ctx: ActionCtx, companyWebsiteId: Id<"companyWebsites">, newest: string, country?: string): Promise<number> {
  const scope = country === undefined ? {} : { country };
  let steps = 0;
  for (const searchType of COLLECTED_SEARCH_TYPES) {
    // A few records at a time, again until none is left: after a long pause there are many, each large.
    while (steps < DROP_ROUNDS) {
      steps += 1;
      if (!(await ctx.runMutation(internal.searchConsoleRollups.dropOldLines, { companyWebsiteId, newest, searchType, ...scope }))) break;
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Reading what is kept, for the ready-made periods
// ---------------------------------------------------------------------------

/**
 * A list's kept records with any day from `from` to `to`: its days in the
 * span, and the weeks and months that hold the rest — counted whole, so a
 * span reaching past the 90 days held as days is counted in whole weeks
 * (§14.3, item 4). Days, weeks and months never hold the same day twice.
 */
export const keptBetween = internalQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    ...countryArg,
    searchType: searchTypeValidator,
    list: listValidator,
    grain: v.union(v.literal("DAY"), v.literal("WEEK"), v.literal("MONTH")),
    from: v.string(),
    to: v.string(),
    /** Where the last page ended; null for the first. */
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    records: v.array(v.object({ start: v.string(), ...packedValidator })),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const from = args.grain === "DAY" ? args.from : args.grain === "WEEK" ? weekStart(args.from) : monthStart(args.from);
    const page = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q
        .eq("companyWebsiteId", args.companyWebsiteId)
        .eq("country", args.country)
        .eq("searchType", args.searchType)
        .eq("list", args.list)
        .eq("grain", args.grain)
        .gte("start", from)
        .lte("start", args.to))
      .paginate({ cursor: args.cursor, numItems: KEPT_PAGE });
    // Page references as they are kept: the action reading them turns them back into addresses
    // from the website's page list read once (`readKept`) — a look-up each here outran a query's second.
    return {
      records: page.page.map((record) => ({
        start: record.start,
        keys: record.keys,
        ...(record.pages ? { pages: record.pages } : {}),
        clicks: record.clicks,
        impressions: record.impressions,
        positionSums: record.positionSums,
      })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Which kinds of result a website — or one country of it — was ever shown in
 * on a day held: the ones worth building periods for, and the tabs its pages
 * show (search-console-home-countries-plan.md, decision 3). Google answers
 * every kind with a row a day, nothing shown or not, so a day counts only
 * with a showing.
 */
export async function kindsHeld(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, country?: string): Promise<SearchType[]> {
  const out: SearchType[] = [];
  for (const searchType of COLLECTED_SEARCH_TYPES) {
    const shown = await ctx.db
      .query("searchConsoleDays")
      .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType))
      .filter((q) => q.gt(q.field("impressions"), 0))
      .first();
    if (shown) out.push(searchType);
  }
  return out;
}

export const typesHeld = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), ...countryArg },
  returns: v.array(searchTypeValidator),
  handler: async (ctx, args) => await kindsHeld(ctx, args.companyWebsiteId, args.country),
});
