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
  type SearchConsoleGrain,
  type SearchConsoleList,
  type SearchType,
} from "./searchConsoleSchema";
import { addUp, firstDayKeptFor, firstWeekKept, monthStart, pack, weekStart } from "./utils/searchConsolePacks";
import { stillKeptReady } from "./searchConsoleCountries";

/**
 * What is kept, as it ages and as it is read back
 * (docs/plans/active/search-console-plan.md §14.3, items 3 and 4): days past
 * 90 rolled into their week and weeks past 12 months into their month, and
 * the kept records read back for the ready-made periods. All countries, and
 * each country kept ready on its own (§16) — `country` missing is all
 * countries — always by the hold's index, country second, so one country's
 * work never passes over another's records.
 */

/** Days rolled into weeks, or weeks into months, per site run at most; the rest roll next run. */
export const ROLLUPS_PER_RUN = 200;

/** Kept records one ask for due rollups reads, per kind of result, list and grain: whole records, so few. */
const ROLLUP_SLOTS_PER_READ = 4;

/** Rounds of rollups one settle makes at most: the rest wait for the next run. */
const ROLLUP_ROUNDS = 100;

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

const packedValidator = {
  keys: v.array(v.string()),
  pages: v.optional(v.array(v.string())),
  clicks: v.array(v.number()),
  impressions: v.array(v.number()),
  positionSums: v.array(v.number()),
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
// Rolling up: days past 90 into weeks, weeks past 12 months into months
// ---------------------------------------------------------------------------

type Slot = { searchType: SearchType; list: SearchConsoleList; start: string };

/**
 * The records old enough to roll up, oldest first: days before the first day
 * kept as a day, and weeks before the first week kept as a week.
 */
export const rollUpsDue = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), newest: v.string(), ...countryArg },
  returns: v.object({
    days: v.array(v.object({ searchType: searchTypeValidator, list: listValidator, start: v.string() })),
    weeks: v.array(v.object({ searchType: searchTypeValidator, list: listValidator, start: v.string() })),
  }),
  handler: async (ctx, args) => {
    const weekLine = firstWeekKept(args.newest);
    const days = new Map<string, Slot>();
    const weeks = new Map<string, Slot>();
    for (const searchType of COLLECTED_SEARCH_TYPES) {
      // Image search's days go into their weeks once the week is over (finish-off plan 2C).
      const dayLine = firstDayKeptFor(searchType, args.newest);
      for (const list of LISTS_OF[searchType]) {
        for (const [grain, line, into] of [["DAY", dayLine, days], ["WEEK", weekLine, weeks]] as const) {
          const old = await ctx.db
            .query("searchConsoleLists")
            .withIndex("by_hold_country_type_list_grain_start", (q) => q
              .eq("companyWebsiteId", args.companyWebsiteId)
              .eq("country", args.country)
              .eq("searchType", searchType)
              .eq("list", list)
              .eq("grain", grain)
              .lt("start", line))
            .take(ROLLUP_SLOTS_PER_READ);
          for (const record of old) into.set(`${searchType}|${list}|${record.start}`, { searchType, list, start: record.start });
        }
      }
    }
    return { days: [...days.values()].slice(0, ROLLUPS_PER_RUN), weeks: [...weeks.values()].slice(0, ROLLUPS_PER_RUN) };
  },
});

/**
 * One day into its week, or one week into its month: the two added up and
 * kept as the larger, the smaller gone — in one mutation, so a figure is
 * never in both or in neither.
 */
export const rollUp = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    ...countryArg,
    searchType: searchTypeValidator,
    list: listValidator,
    from: v.union(v.literal("DAY"), v.literal("WEEK")),
    start: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillKeptReady(ctx, args.companyWebsiteId, args.country))) return null;
    const into: SearchConsoleGrain = args.from === "DAY" ? "WEEK" : "MONTH";
    const intoStart = args.from === "DAY" ? weekStart(args.start) : monthStart(args.start);
    const small = await slotParts(ctx, args.companyWebsiteId, args.country, args.searchType, args.list, args.from, args.start);
    if (small.length === 0) return null;
    const large = await slotParts(ctx, args.companyWebsiteId, args.country, args.searchType, args.list, into, intoStart);
    const pairs = args.list === "pair";
    const merged = pack(addUp([...small, ...large]), pairs);
    for (const record of [...small, ...large]) await ctx.db.delete(record._id);
    const fetchedAt = Math.max(...small.map((record) => record.fetchedAt), ...large.map((record) => record.fetchedAt));
    for (const [part, packed] of merged.entries()) {
      if (packed.keys.length === 0) continue;
      await ctx.db.insert("searchConsoleLists", {
        companyWebsiteId: args.companyWebsiteId,
        ...(args.country === undefined ? {} : { country: args.country }),
        searchType: args.searchType,
        list: args.list,
        grain: into,
        start: intoStart,
        part,
        ...packed,
        fetchedAt,
      });
    }
    return null;
  },
});

/** The rollups a site's run makes after collecting, for all countries or one kept ready: how many it made. */
export async function rollUpSite(ctx: ActionCtx, companyWebsiteId: Id<"companyWebsites">, newest: string, country?: string): Promise<number> {
  let rolled = 0;
  const scope = country === undefined ? {} : { country };
  // A few at a time, asking again until none is due: after a long pause many days are, each a large record.
  for (let round = 0; round < ROLLUP_ROUNDS; round += 1) {
    const due = await ctx.runQuery(internal.searchConsoleRollups.rollUpsDue, { companyWebsiteId, newest, ...scope });
    if (due.days.length + due.weeks.length === 0) break;
    for (const slot of due.days) await ctx.runMutation(internal.searchConsoleRollups.rollUp, { companyWebsiteId, ...scope, ...slot, from: "DAY" });
    for (const slot of due.weeks) await ctx.runMutation(internal.searchConsoleRollups.rollUp, { companyWebsiteId, ...scope, ...slot, from: "WEEK" });
    rolled += due.days.length + due.weeks.length;
  }
  return rolled;
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
