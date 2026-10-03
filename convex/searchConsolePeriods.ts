import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LISTS_OF } from "./searchConsoleApi";
import {
  SEARCH_CONSOLE_PERIODS,
  periodListValidator,
  periodValidator,
  searchTypeValidator,
  type SearchConsoleList,
  type SearchConsolePeriod,
  type SearchConsolePeriodList,
  type SearchType,
} from "./searchConsoleSchema";
import { shiftDay } from "./searchConsoleDays";
import { PARTS_MOST } from "./searchConsoleRollups";
import { UNKNOWN, factsFor, type Facts } from "./searchConsoleFacts";
import { countryScope, stillKeptReady } from "./searchConsoleCountries";
import {
  addUp,
  bySide,
  firstDayKept,
  monthStart,
  pack,
  rowsOf,
  weekStart,
  type Packed,
  type Row,
} from "./utils/searchConsolePacks";
import { bandOf, isBrand } from "./utils/searchConsoleViews";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";

/**
 * The ready-made periods every Search Console list reads
 * (docs/plans/active/search-console-plan.md §14.3, item 4): for the last 7,
 * 30 and 90 days and 12 months ending on the newest day held, and the same
 * span before each where it is held, each list added up once after every
 * collection — so a screen reads one record or a few, never a day at a time.
 *
 * A search's list is added up from the pairs, with how many of the
 * website's pages it brought people to and the top one; a page's list is
 * Google's own page totals (the rare searches it hides included), with how
 * many searches and the top one from the pairs.
 *
 * Built for all countries and for each country kept ready (§16), the same
 * way: `country` missing is all countries, and every read and write is by
 * the hold's index, country second.
 */

/** The periods with a period before them held for the change: twelve months has none (§14.3, item 7). */
const WITH_BEFORE: readonly SearchConsolePeriod[] = ["7", "30", "90"];

const DAY_MS = 86_400_000;

/** Days a ready-made period spans. */
export const periodDays = (period: SearchConsolePeriod): number => Number(period);

export type PeriodSpan = { from: string; to: string };

/**
 * A period's days, ending on the newest day held: never before the oldest
 * day held, so a website connected last week has a 12-month period of the
 * days it holds, and says so.
 */
export function periodSpan(period: SearchConsolePeriod, newest: string, oldest: string): PeriodSpan {
  const from = shiftDay(newest, 1 - periodDays(period));
  return { from: from < oldest ? oldest : from, to: newest };
}

/** The same span just before, when every day of it is held; null otherwise. */
export function spanBefore(period: SearchConsolePeriod, newest: string, oldest: string): PeriodSpan | null {
  if (!WITH_BEFORE.includes(period)) return null;
  const to = shiftDay(newest, -periodDays(period));
  const from = shiftDay(to, 1 - periodDays(period));
  return from < oldest ? null : { from, to };
}

export type Kept = { grain: "DAY" | "WEEK" | "MONTH"; start: string; packed: Packed };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

/**
 * The days a kept record holds. A week holds only the days rolled into it —
 * those before the first day still kept as a day — so the week the 90-day
 * line falls in holds just its first few days. A month holds its own days.
 */
function daysHeld(record: Kept, dayLine: string): PeriodSpan {
  if (record.grain === "DAY") return { from: record.start, to: record.start };
  if (record.grain === "WEEK") {
    const end = shiftDay(record.start, 6);
    return { from: record.start, to: end < dayLine ? end : shiftDay(dayLine, -1) };
  }
  return { from: record.start, to: shiftDay(monthStart(shiftDay(record.start, 31)), -1) };
}

/**
 * The kept records counting towards a span: its days, and each week or month
 * with most of the days it holds inside the span. A period reaching past 90
 * days ends on a week's or a month's edge, the nearest one — rolled up, those
 * days cannot be told apart — and never counts the days just before the
 * 90-day line twice over (§14.3, items 2 and 4).
 */
export function keptIn(kept: readonly Kept[], span: PeriodSpan, newest: string): Packed[] {
  const dayLine = firstDayKept(newest);
  return kept
    .filter((record) => {
      const held = daysHeld(record, dayLine);
      const from = held.from > span.from ? held.from : span.from;
      const to = held.to < span.to ? held.to : span.to;
      return from <= to && daysBetween(from, to) * 2 >= daysBetween(held.from, held.to);
    })
    .map((record) => record.packed);
}

/** How far back the twelve-month period can reach: its first day, at the start of its month. */
function widestFrom(newest: string): string {
  return monthStart(shiftDay(newest, 1 - periodDays("365")));
}

/** Days of kept day records read per ask, so no one ask reads too much. */
const DAYS_PER_READ = 15;

/** Weeks of kept week records read per ask. */
const WEEKS_PER_READ = 4;

/** Every kept record of one list a website's periods could need — all countries', or one country's — oldest first. */
async function readKept(
  ctx: ActionCtx,
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsoleList,
  newest: string,
): Promise<Kept[]> {
  const from = widestFrom(newest);
  const out: Kept[] = [];
  const scope = country === undefined ? {} : { country };
  const read = async (grain: Kept["grain"], start: string, end: string) => {
    const records = await ctx.runQuery(internal.searchConsoleRollups.keptBetween, { companyWebsiteId, ...scope, searchType, list, grain, from: start, to: end < newest ? end : newest });
    for (const record of records) out.push({ grain, start: record.start, packed: record });
  };
  // A month at a time, and four weeks at a time: a week of a busy website's pairs is about a megabyte.
  for (let month = from; month <= newest; month = monthStart(shiftDay(month, 31))) {
    await read("MONTH", month, shiftDay(monthStart(shiftDay(month, 31)), -1));
  }
  for (let week = weekStart(from); week <= newest; week = shiftDay(week, WEEKS_PER_READ * 7)) {
    await read("WEEK", week, shiftDay(week, WEEKS_PER_READ * 7 - 1));
  }
  const span = daysBetween(from, newest);
  for (let offset = 0; offset < span; offset += DAYS_PER_READ) {
    const start = shiftDay(from, offset);
    const end = shiftDay(start, DAYS_PER_READ - 1);
    const records = await ctx.runQuery(internal.searchConsoleRollups.keptBetween, {
      companyWebsiteId,
      ...scope,
      searchType,
      list,
      grain: "DAY",
      from: start,
      to: end < newest ? end : newest,
    });
    for (const record of records) out.push({ grain: "DAY", start: record.start, packed: record });
  }
  return out;
}

type Counts = Map<string, { count: number; top: string }>;

/** Weeks the Position bands and Brand charts show. */
export const CHART_WEEKS = 16;

type Week = { week: string; top3: number; top10: number; top20: number; rest: number; brandClicks: number; otherClicks: number };

/**
 * Each of the last weeks held: its keywords by band of position, added up
 * from the week's pairs, and its clicks from brand searches and the rest. A
 * week's days and the part of it rolled up already count together.
 */
export function weekFigures(kept: readonly Kept[], newest: string, brandWords: readonly string[]): Week[] {
  const first = weekStart(shiftDay(newest, -7 * (CHART_WEEKS - 1)));
  const weeks = new Map<string, Packed[]>();
  for (const record of kept) {
    if (record.grain === "MONTH") continue;
    const week = record.grain === "WEEK" ? record.start : weekStart(record.start);
    if (week < first) continue;
    weeks.set(week, [...(weeks.get(week) ?? []), record.packed]);
  }
  return [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([week, records]) => {
    const figures: Week = { week, top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0 };
    for (const keyword of bySide(addUp(records), "query").values()) {
      if (keyword.impressions > 0) {
        const band = bandOf(keyword.positionSum / keyword.impressions);
        if (band === "1-3") figures.top3 += 1;
        else if (band === "4-10") figures.top10 += 1;
        else if (band === "11-20") figures.top20 += 1;
        else figures.rest += 1;
      }
      if (isBrand(keyword.key, brandWords)) figures.brandClicks += keyword.clicks;
      else figures.otherClicks += keyword.clicks;
    }
    return figures;
  });
}

const weekValidator = v.object({
  week: v.string(),
  top3: v.number(),
  top10: v.number(),
  top20: v.number(),
  rest: v.number(),
  brandClicks: v.number(),
  otherClicks: v.number(),
});

/** A kind of result's weeks, all at once, for all countries or one: the ones held before go. */
export const writeWeeks = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    weeks: v.array(weekValidator),
    builtAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillKeptReady(ctx, args.companyWebsiteId, args.country))) return null;
    for (const week of await weeksOf(ctx, args.companyWebsiteId, args.country, args.searchType)) await ctx.db.delete(week._id);
    for (const week of args.weeks) {
      await ctx.db.insert("searchConsoleWeeks", {
        companyWebsiteId: args.companyWebsiteId,
        ...(args.country === undefined ? {} : { country: args.country }),
        searchType: args.searchType,
        ...week,
        builtAt: args.builtAt,
      });
    }
    return null;
  },
});

/** Weeks one read returns: far more than the 16 kept. */
const WEEKS_READ = 200;

/** One kind of result's weeks, for all countries or one, oldest first. */
async function weeksOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, country: string | undefined, searchType: SearchType) {
  return await ctx.db
    .query("searchConsoleWeeks")
    .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType))
    .take(WEEKS_READ);
}

const weekRow = ({ week, top3, top10, top20, rest, brandClicks, otherClicks }: Week) => ({ week, top3, top10, top20, rest, brandClicks, otherClicks });

/**
 * A website's weeks for its Position bands and Brand charts, oldest first —
 * for all countries, or one country kept ready (§16). Sixteen weeks of
 * keywords by position are not asked of Google live, so a country not kept
 * ready is `notReady` ("Add this country on the Market page to see this"),
 * and one just added, before its first collection, is `preparing`.
 */
export const searchConsoleWeekFigures = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, country: v.optional(v.string()) },
  returns: v.object({ weeks: v.array(weekValidator), notReady: v.boolean(), preparing: v.boolean() }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id))
      .first();
    const scope = await countryScope(ctx, site.hold, connection, args.country);
    if (scope.read === "LIVE") return { weeks: [], notReady: !scope.kept, preparing: scope.kept };
    const weeks = await weeksOf(ctx, site.hold._id, scope.read === "KEPT" ? scope.country : undefined, args.searchType);
    return { weeks: weeks.map(weekRow), notReady: false, preparing: false };
  },
});
type Slot = { period: SearchConsolePeriod; which: "NOW" | "BEFORE"; span: PeriodSpan | null; now: PeriodSpan };

/** Every period and the period before it, as spans of days: null where the days before are not held. */
function slotsOf(newest: string, oldest: string): Slot[] {
  return SEARCH_CONSOLE_PERIODS.flatMap((period) => {
    const now = periodSpan(period, newest, oldest);
    return [
      { period, which: "NOW" as const, span: now, now },
      { period, which: "BEFORE" as const, span: spanBefore(period, newest, oldest), now },
    ];
  });
}

const slotKey = (slot: Slot) => `${slot.period}|${slot.which}`;

/**
 * A website's ready-made periods, rebuilt from what is kept: every list of
 * every kind of result it has, for each period and the period before — for
 * all countries, or one country kept ready from its own held days. A slot
 * with nothing now is emptied, so no period outlives its days. One kept list
 * is read at a time, so a run holds one list's days at once, never all.
 */
export async function buildSitePeriods(
  ctx: ActionCtx,
  companyWebsiteId: Id<"companyWebsites">,
  newest: string,
  oldest: string,
  country?: string,
): Promise<number> {
  let written = 0;
  const builtAt = Date.now();
  const slots = slotsOf(newest, oldest);
  const scope = country === undefined ? {} : { country };
  const write = async (searchType: SearchType, list: SearchConsolePeriodList, slot: Slot, rows: Row[] | null, counts?: Counts, facts?: Facts) => {
    // Not held, or a list this kind of result does not have: the slot is only emptied.
    const clearOnly = rows === null;
    for (const [part, packed] of pack(rows ?? [], list === "pair").entries()) {
      const extra = {
        ...(counts ? {
          counts: packed.keys.map((key) => counts.get(key)?.count ?? 0),
          tops: packed.keys.map((key) => counts.get(key)?.top ?? ""),
        } : {}),
        // Sites' facts, on the periods the screens list (the ones before are read for the change alone).
        ...(facts && slot.which === "NOW" ? {
          kinds: packed.keys.map((key) => facts.get(key)?.kind ?? "UNJUDGED"),
          ...(list === "query"
            ? { volumes: packed.keys.map((key) => facts.get(key)?.number ?? UNKNOWN) }
            : { estimates: packed.keys.map((key) => facts.get(key)?.number ?? UNKNOWN) }),
        } : {}),
      };
      await ctx.runMutation(internal.searchConsolePeriods.writePeriodPart, {
        companyWebsiteId,
        ...scope,
        searchType,
        list,
        period: slot.period,
        which: slot.which,
        part,
        from: slot.span?.from ?? slot.now.from,
        to: slot.span?.to ?? slot.now.to,
        ...packed,
        ...extra,
        builtAt,
        clearOnly,
      });
      written += 1;
    }
  };

  const types = await ctx.runQuery(internal.searchConsoleRollups.typesHeld, { companyWebsiteId, ...scope });
  const target = await ctx.runQuery(internal.searchConsoleFacts.factsTarget, { companyWebsiteId });
  // Sites' facts for each keyword and page, looked up once for every kind of result.
  const known: Record<"query" | "page", Facts> = { query: new Map(), page: new Map() };
  const factsOf = async (kind: "query" | "page", kept: readonly Kept[]): Promise<Facts | undefined> => {
    if (!target) return undefined;
    const keys = new Set<string>();
    for (const record of kept) for (const key of record.packed.keys) if (!known[kind].has(key)) keys.add(key);
    for (const [key, fact] of await factsFor(ctx, target, kind, [...keys])) known[kind].set(key, fact);
    return known[kind];
  };
  for (const searchType of types) {
    const lists = LISTS_OF[searchType];
    // Each search added up from the pairs, and each page's searches counted from them.
    const pageCounts = new Map<string, Counts>();
    const pairsKept = lists.includes("pair") ? await readKept(ctx, companyWebsiteId, country, searchType, "pair", newest) : null;
    const queryFacts = pairsKept ? await factsOf("query", pairsKept) : undefined;
    await ctx.runMutation(internal.searchConsolePeriods.writeWeeks, {
      companyWebsiteId,
      ...scope,
      searchType,
      weeks: pairsKept ? weekFigures(pairsKept, newest, target?.brandWords ?? []) : [],
      builtAt,
    });
    for (const slot of slots) {
      if (!pairsKept || !slot.span) {
        await write(searchType, "pair", slot, null);
        await write(searchType, "query", slot, null);
        continue;
      }
      const pairs = addUp(keptIn(pairsKept, slot.span, newest));
      await write(searchType, "pair", slot, pairs);
      const queries = bySide(pairs, "query");
      await write(
        searchType,
        "query",
        slot,
        [...queries.values()].map((summed) => ({ key: summed.key, clicks: summed.clicks, impressions: summed.impressions, positionSum: summed.positionSum })),
        new Map([...queries.values()].map((summed) => [summed.key, { count: summed.count, top: summed.top }])),
        queryFacts,
      );
      pageCounts.set(slotKey(slot), new Map([...bySide(pairs, "page").values()].map((summed) => [summed.key, { count: summed.count, top: summed.top }])));
    }
    // Pages, countries, devices and kinds of search appearance: Google's own totals, one list at a time.
    // A country has no country list of its own: its slots are only emptied.
    for (const list of ["page", "country", "device", "appearance"] as const) {
      const kept = lists.includes(list) && !(country !== undefined && list === "country")
        ? await readKept(ctx, companyWebsiteId, country, searchType, list, newest)
        : null;
      const pageFacts = list === "page" && kept ? await factsOf("page", kept) : undefined;
      for (const slot of slots) {
        const rows = kept && slot.span ? addUp(keptIn(kept, slot.span, newest)) : null;
        await write(searchType, list, slot, rows, list === "page" ? pageCounts.get(slotKey(slot)) : undefined, pageFacts);
      }
    }
  }
  return written;
}

/** One part of a ready-made period's list, for all countries or one; the first replaces the slot, and an empty first part empties it. */
export const writePeriodPart = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    list: periodListValidator,
    period: periodValidator,
    which: v.union(v.literal("NOW"), v.literal("BEFORE")),
    part: v.number(),
    from: v.string(),
    to: v.string(),
    keys: v.array(v.string()),
    pages: v.optional(v.array(v.string())),
    clicks: v.array(v.number()),
    impressions: v.array(v.number()),
    positionSums: v.array(v.number()),
    counts: v.optional(v.array(v.number())),
    tops: v.optional(v.array(v.string())),
    kinds: v.optional(v.array(v.string())),
    volumes: v.optional(v.array(v.number())),
    estimates: v.optional(v.array(v.number())),
    builtAt: v.number(),
    /** Empty the slot and keep nothing: the period is not held, or the kind of result has no such list. */
    clearOnly: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { clearOnly, ...record } = args;
    if (!(await stillKeptReady(ctx, args.companyWebsiteId, args.country))) return null;
    if (args.part === 0) {
      for (const old of await periodParts(ctx, args.companyWebsiteId, args.country, args.searchType, args.list, args.period, args.which)) await ctx.db.delete(old._id);
    }
    // A held period with nothing in it keeps its first part, empty: held, and no clicks.
    if (clearOnly || (args.keys.length === 0 && args.part > 0)) return null;
    await ctx.db.insert("searchConsolePeriods", record);
    return null;
  },
});

async function periodParts(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
) {
  return await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", companyWebsiteId)
      .eq("country", country)
      .eq("searchType", searchType)
      .eq("list", list)
      .eq("period", period)
      .eq("which", which))
    .take(PARTS_MOST);
}

/** A row of a ready-made period: its figures, and — where kept — its count and top, and Sites' facts (UNKNOWN for none). */
export type PeriodRow = Row & { count?: number; top?: string; kind?: string; volume?: number; estimate?: number };

/** A ready-made period's list — all countries', or one country's kept ready — its parts put back together; null when nothing is built for it. */
export async function readPeriod(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
  country?: string,
): Promise<{ from: string; to: string; builtAt: number; rows: PeriodRow[] } | null> {
  const parts = (await periodParts(ctx, companyWebsiteId, country, searchType, list, period, which)).sort((left, right) => left.part - right.part);
  if (parts.length === 0) return null;
  const rows: PeriodRow[] = [];
  for (const part of parts) {
    let index = 0;
    for (const row of rowsOf(part)) {
      rows.push({
        ...row,
        ...(part.counts ? { count: part.counts[index] ?? 0 } : {}),
        ...(part.tops ? { top: part.tops[index] ?? "" } : {}),
        ...(part.kinds ? { kind: part.kinds[index] ?? "UNJUDGED" } : {}),
        ...(part.volumes ? { volume: part.volumes[index] ?? UNKNOWN } : {}),
        ...(part.estimates ? { estimate: part.estimates[index] ?? UNKNOWN } : {}),
      });
      index += 1;
    }
  }
  return { from: parts[0].from, to: parts[0].to, builtAt: parts[0].builtAt, rows };
}
