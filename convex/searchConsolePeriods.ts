import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LISTS_OF } from "./searchConsoleApi";
import {
  FAN_OUT_PERIODS,
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
import { UNKNOWN, factsFor, type Facts } from "./searchConsoleFacts";
import { countryScope, stillKeptReady } from "./searchConsoleCountries";
import { askLive, countryFilters } from "./searchConsoleReads";
import { consoleLimitsOf } from "./searchConsoleLimits";
import { FAN_OUT_LIMITS } from "./fanOutLimits";
import { buildSeenDays } from "./searchConsoleSeenDays";
import { longListRows, rowsFor } from "./searchConsoleLongLists";
import {
  addUp,
  bySide,
  firstDayKeptFor,
  firstWeekKept,
  monthStart,
  pack,
  packedColumns,
  stepEnd,
  unpackedPart,
  weekStart,
  type ChartStep,
  type Packed,
  type Row,
  type StoredPacked,
} from "./utils/searchConsolePacks";
import { bandOf, isBrand, pageWithoutSection } from "./utils/searchConsoleViews";
import { tenantQuery } from "./tenantFunctions";
import { addressesOf, decodeWith } from "./searchConsolePageRefs";
import { FIRST_PARTS_READ } from "./searchConsolePeriodReads";
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
export function keptIn(kept: readonly Kept[], span: PeriodSpan, newest: string, searchType = "web"): Packed[] {
  const dayLine = firstDayKeptFor(searchType, newest);
  return kept
    .filter((record) => {
      const held = daysHeld(record, dayLine);
      const from = held.from > span.from ? held.from : span.from;
      const to = held.to < span.to ? held.to : span.to;
      return from <= to && daysBetween(from, to) * 2 >= daysBetween(held.from, held.to);
    })
    .map((record) => record.packed);
}

/** Days of kept day records read per ask, so no one ask reads too much. */
const DAYS_PER_READ = 15;

/**
 * Days of lines read for a build: the 60 kept, and a first collection's 90
 * until its settle clears the rest — from which its charts take their weeks.
 */
const LINES_READ_DAYS = 90;

/**
 * Every kept day of one list — all countries', or one country's — oldest
 * first: the 60 days kept (keep-less-history-plan.md, part 3), or a first
 * collection's 90 before they are cleared. The 90 days and twelve months
 * are asked of Google (`searchConsoleLongLists.ts`).
 */
export async function readKept(
  ctx: ActionCtx,
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsoleList,
  newest: string,
): Promise<Kept[]> {
  const from = shiftDay(newest, 1 - LINES_READ_DAYS);
  const out: Kept[] = [];
  const scope = country === undefined ? {} : { country };
  // Page by page (`keptBetween`): a busy website's span is more than one read may hold.
  const read = async (grain: Kept["grain"], start: string, end: string) => {
    for (let cursor: string | null = null; ;) {
      const page: { records: Array<StoredPacked & { start: string }>; continueCursor: string; isDone: boolean } = await ctx.runQuery(
        internal.searchConsoleRollups.keptBetween,
        { companyWebsiteId, ...scope, searchType, list, grain, from: start, to: end < newest ? end : newest, cursor },
      );
      for (const record of page.records) out.push({ grain, start: record.start, packed: unpackedPart(record) });
      if (page.isDone) return;
      cursor = page.continueCursor;
    }
  };
  // Page references back to addresses, from the website's page list read once a run (`searchConsolePageRefs.ts`).
  const addresses = async () => {
    if (list !== "pair" && list !== "page") return out;
    const book = await addressesOf(ctx, companyWebsiteId);
    return out.map((kept) => ({
      ...kept,
      packed: {
        ...kept.packed,
        ...(list === "page" ? { keys: decodeWith(book, kept.packed.keys) } : {}),
        ...(kept.packed.pages ? { pages: decodeWith(book, kept.packed.pages) } : {}),
      },
    }));
  };
  const span = daysBetween(from, newest);
  for (let offset = 0; offset < span; offset += DAYS_PER_READ) {
    const start = shiftDay(from, offset);
    await read("DAY", start, shiftDay(start, DAYS_PER_READ - 1));
  }
  return await addresses();
}

type Counts = Map<string, { count: number; top: string }>;


type Grain = Kept["grain"];
const GRAIN_OF: Record<ChartStep, Grain> = { day: "DAY", week: "WEEK", month: "MONTH" };
const STEP_OF: Record<Grain, ChartStep> = { DAY: "day", WEEK: "week", MONTH: "month" };

/** One day's, week's or month's figures for the charts: `week` is its first day, as the table names it. */
type ChartPeriod = {
  grain: Grain;
  week: string;
  days: number;
  top3: number;
  top10: number;
  top20: number;
  rest: number;
  brandClicks: number;
  otherClicks: number;
};

/** A day's, week's or month's last day. */
const lastDayOf = (grain: Grain, start: string): string => stepEnd(start, STEP_OF[grain]);

/** The Monday the charts reach back to: as many weeks as they show (`consoleChartWeeks`), the newest among them. */
const chartReach = (newest: string, chartWeeks: number) => weekStart(shiftDay(newest, -7 * (chartWeeks - 1)));

/**
 * The days, weeks and months the charts reach that the lines read cover:
 * each day of the 60 kept, and each week and month whose days held fall
 * inside the 90 read — whole on a first collection, which brings 90 days
 * and clears none until it is built. A week or month starting before the 60
 * days is written only by a first build: one was worked out while its days
 * were kept, and stays as it was (`writeWeeks`; keep-less-history-plan.md,
 * part 3). The week or month at either edge may hold only some of its days.
 */
function chartPeriods(newest: string, oldest: string, chartWeeks: number, dayLine: string): Array<{ grain: Grain; start: string }> {
  const reach = chartReach(newest, chartWeeks);
  const from = reach > oldest ? reach : oldest;
  const readFrom = shiftDay(newest, 1 - LINES_READ_DAYS);
  const held = (start: string) => (start > oldest ? start : oldest) >= readFrom;
  const periods: Array<{ grain: Grain; start: string }> = [];
  for (let day = from > dayLine ? from : dayLine; day <= newest; day = shiftDay(day, 1)) periods.push({ grain: "DAY", start: day });
  for (let week = weekStart(from); week <= newest; week = shiftDay(week, 7)) if (held(week)) periods.push({ grain: "WEEK", start: week });
  for (let month = monthStart(from); month <= newest; month = monthStart(shiftDay(month, 31))) if (held(month)) periods.push({ grain: "MONTH", start: month });
  return periods;
}

/**
 * Each day, week and month the charts reach — its keywords by band of
 * position and its clicks from brand searches and the rest — added up from
 * the kept pairs counting towards it by the same rule as every period
 * (`keptIn`): its days, and a rolled-up week in the month most of its days
 * fall in (§14.3, item 4).
 */
export function chartFigures(kept: readonly Kept[], newest: string, oldest: string, brandWords: readonly string[], chartWeeks: number, searchType = "web"): ChartPeriod[] {
  return chartPeriods(newest, oldest, chartWeeks, firstDayKeptFor(searchType, newest)).map(({ grain, start }) => {
    const end = lastDayOf(grain, start);
    const held = { from: start > oldest ? start : oldest, to: end < newest ? end : newest };
    const figures: ChartPeriod = { grain, week: start, days: daysBetween(held.from, held.to), top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0 };
    for (const keyword of bySide(addUp(keptIn(kept, { from: start, to: end }, newest, searchType)), "query").values()) {
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

const grainValidator = v.union(v.literal("DAY"), v.literal("WEEK"), v.literal("MONTH"));
/** A chart's step, as the page chose it. */
export const chartStepValidator = v.union(v.literal("day"), v.literal("week"), v.literal("month"));

const chartPeriodValidator = v.object({
  grain: grainValidator,
  week: v.string(),
  days: v.number(),
  top3: v.number(),
  top10: v.number(),
  top20: v.number(),
  rest: v.number(),
  brandClicks: v.number(),
  otherClicks: v.number(),
});

/**
 * A kind of result's days, weeks and months, for all countries or one: the
 * ones inside the days kept replace theirs; one starting before them is
 * written by a first build alone — its 90 days all held — and otherwise the
 * finished week or month worked out before stays as it was
 * (keep-less-history-plan.md, part 3); a day before the days kept, and a week
 * or month before the charts' reach, go.
 */
export const writeWeeks = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    weeks: v.array(chartPeriodValidator),
    /** The first day kept as a day, and the first day the charts reach. */
    dayLine: v.string(),
    reach: v.string(),
    builtAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillKeptReady(ctx, args.companyWebsiteId, args.country))) return null;
    const fresh = new Set(args.weeks.map((week) => `${week.grain}|${week.week}`));
    const firstKept: Record<Grain, string> = { DAY: args.dayLine, WEEK: weekStart(args.reach), MONTH: monthStart(args.reach) };
    const rows = await weeksOf(ctx, args.companyWebsiteId, args.country, args.searchType);
    const first = rows.length === 0;
    for (const held of rows) {
      // Rows built before 2026-10-04 carry no grain: they are weeks.
      const grain = held.grain ?? "WEEK";
      if (held.week < firstKept[grain] || (held.week >= args.dayLine && fresh.has(`${grain}|${held.week}`))) await ctx.db.delete(held._id);
    }
    for (const week of args.weeks.filter((one) => one.week >= args.dayLine || (first && one.grain !== "DAY"))) {
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

/** Rows one read returns: more than the most a kind of result holds — 90 days, 52 weeks and 13 months. */
const WEEKS_READ = 200;

/** One kind of result's days, weeks and months, for all countries or one, oldest first. */
async function weeksOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, country: string | undefined, searchType: SearchType) {
  return await ctx.db
    .query("searchConsoleWeeks")
    .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType))
    .take(WEEKS_READ);
}

const shownPeriodValidator = v.object({
  start: v.string(),
  /** Its last day held: the newest day, for the period still going. */
  lastDay: v.string(),
  /** Its days held, against all its days: fewer is a part-week or part-month, drawn as one. */
  days: v.number(),
  length: v.number(),
  top3: v.number(),
  top10: v.number(),
  top20: v.number(),
  rest: v.number(),
  brandClicks: v.number(),
  otherClicks: v.number(),
});

/**
 * A website's Position bands and Brand charts, in the dates and step chosen
 * (Anthony, 2026-10-04: the chart did not move with the dates) — for all
 * countries, or one country kept ready (§16). Every day, week or month
 * touching the dates, oldest first, each whole: a week's keywords by band
 * cannot be cut to the days chosen.
 *
 * Days are kept for 90 days, so daily dates reaching further back are drawn
 * by week (`byWeek`, his choice). Dates reaching past the weeks the charts
 * keep (`consoleChartWeeks`) start at the first of them (`reach`), and say so.
 * Sixteen weeks of keywords by position are not asked of Google live, so a
 * country not kept ready is `notReady` ("Add this country on the Market page
 * to see this"), and one just added, before its first collection, is
 * `preparing`. A step not built yet — days and months, until the first
 * collection after 2026-10-04 — is `notBuilt`.
 */
export const searchConsoleChartFigures = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    country: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    step: chartStepValidator,
  },
  returns: v.object({
    periods: v.array(shownPeriodValidator),
    step: chartStepValidator,
    byWeek: v.boolean(),
    /** Weeks asked for reaching past the six months kept as weeks: shown by month. */
    byMonth: v.optional(v.boolean()),
    /** A kind of result keeping no searches (Google Images, Discover): its bands and brand split are not kept. */
    noSearches: v.optional(v.boolean()),
    reach: v.union(v.null(), v.string()),
    chartWeeks: v.number(),
    notReady: v.boolean(),
    preparing: v.boolean(),
    notBuilt: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id))
      .first();
    const { chartWeeks } = await consoleLimitsOf(ctx, site.hold);
    const nothing = { periods: [], step: args.step, byWeek: false, reach: null, chartWeeks, notBuilt: false, noSearches: false };
    const scope = await countryScope(ctx, site.hold, connection, args.country);
    if (scope.read === "LIVE") return { ...nothing, notReady: !scope.kept, preparing: scope.kept };
    const newest = scope.read === "KEPT" ? scope.newestDay : connection?.newestDay;
    const oldest = scope.read === "KEPT" ? scope.oldestDay : connection?.oldestDay;
    if (!newest || !oldest) return { ...nothing, notReady: false, preparing: false };

    const dayLine = firstDayKeptFor(args.searchType, newest);
    const byWeek = args.step === "day" && args.from < dayLine && oldest < dayLine;
    // Weeks past six months are kept as months (`firstWeekKept`): weeks reaching there are shown by month.
    const weekLine = firstWeekKept(newest);
    const byMonth = (byWeek || args.step === "week") && args.from < weekLine && oldest < weekLine;
    const step: ChartStep = byMonth ? "month" : byWeek ? "week" : args.step;
    const grain = GRAIN_OF[step];
    const reachFrom = chartReach(newest, chartWeeks);
    const reach = args.from < reachFrom && oldest < reachFrom ? reachFrom : null;

    const rows = await weeksOf(ctx, site.hold._id, scope.read === "KEPT" ? scope.country : undefined, args.searchType);
    // Rows built before 2026-10-04 carry no grain: they are weeks.
    const ofGrain = rows.filter((row) => (row.grain ?? "WEEK") === grain);
    const periods = ofGrain
      .filter((row) => row.week <= args.to && lastDayOf(grain, row.week) >= args.from)
      .map((row) => {
        const end = lastDayOf(grain, row.week);
        const from = row.week > oldest ? row.week : oldest;
        const lastDay = end < newest ? end : newest;
        return {
          start: row.week,
          lastDay,
          days: row.days ?? daysBetween(from, lastDay),
          length: daysBetween(row.week, end),
          top3: row.top3,
          top10: row.top10,
          top20: row.top20,
          rest: row.rest,
          brandClicks: row.brandClicks,
          otherClicks: row.otherClicks,
        };
      });
    if (!LISTS_OF[args.searchType].includes("pair")) return { ...nothing, notReady: false, preparing: false, noSearches: true };
    return { periods, step, byWeek, byMonth, reach, chartWeeks, notReady: false, preparing: false, notBuilt: rows.length > 0 && ofGrain.length === 0, noSearches: false };
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

/** The periods added up once a week, not every night (cost review 1). */
export const LONG_PERIODS: readonly SearchConsolePeriod[] = ["90", "365"];

/**
 * Twelve months holding exactly the 90 days' days — every website, until it
 * has held more than 90 days — is the 90 days again: kept once (finish-off
 * plan item 2E, 2026-10-05: a third of morehandles.co.uk's ready-made
 * periods, 138 MB, were the 90 days twice). Its slot keeps one empty part
 * saying its days, and the readers read the 90 days (`periodToRead`).
 */
function sameAsNinety(slot: Slot, ninety: PeriodSpan | null): boolean {
  return slot.period === "365" && slot.which === "NOW" && ninety !== null && slot.span !== null
    && slot.span.from === ninety.from && slot.span.to === ninety.to;
}

/** A part as written: its rows, and what each row carries beside them. */
type PartToWrite = Packed & {
  counts?: number[];
  tops?: string[];
  kinds?: string[];
  volumes?: number[];
  estimates?: number[];
  firstKey?: string;
  shown?: number;
};

const EMPTY_PART: PartToWrite = { keys: [], clicks: [], impressions: [], positionSums: [] };

/** Every keyword (`keys`) or every page (`pages`) in kept records, once. */
function keysIn(kept: readonly Kept[], side: "keys" | "pages"): Set<string> {
  const keys = new Set<string>();
  for (const record of kept) for (const key of record.packed[side] ?? []) keys.add(key);
  return keys;
}

/**
 * What a website's periods are built by: the connection its few asks of
 * Google go through — only a connected website's — and the limits the build
 * reads (the weeks the charts show, the kinds of rich result counted).
 */
export const buildTarget = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.object({
    google: v.union(v.null(), v.object({ connectionId: v.id("searchConsoleConnections"), property: v.string() })),
    chartWeeks: v.number(),
    richResultKinds: v.number(),
  }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .first();
    const limits = hold ? await consoleLimitsOf(ctx, hold) : null;
    return {
      google: connection && connection.status === "CONNECTED" && connection.property ? { connectionId: connection._id, property: connection.property } : null,
      chartWeeks: limits?.chartWeeks ?? FAN_OUT_LIMITS.consoleChartWeeks.fallback,
      richResultKinds: limits?.richResultKinds ?? FAN_OUT_LIMITS.consoleRichResultKinds.fallback,
    };
  },
});

type GoogleTarget = { connectionId: Id<"searchConsoleConnections">; property: string };

/** Asks of Google at once while counting them. */
const ASKS_AT_ONCE = 4;

/**
 * How many of the website's pages Google showed in each kind of rich result
 * over a period — in one country, for a country kept ready. Google will not
 * list a kind beside its pages, so each kind is asked on its own: here, once
 * after each collection, so Rich results reads it ready-made rather than
 * asking each time it opens (drift fixes, 2026-10-03). Null when Google
 * refuses or is busy for any of them: the page then asks for them itself.
 */
async function pagesPerAppearance(
  ctx: ActionCtx,
  google: GoogleTarget | null,
  searchType: SearchType,
  span: PeriodSpan,
  country: string | undefined,
  rows: readonly Row[],
  kindsCounted: number,
): Promise<Counts | null> {
  if (!google) return null;
  const ordered = [...rows].sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions);
  const asked = ordered.slice(0, kindsCounted).map((row) => row.key);
  // Kinds past the limit (`consoleRichResultKinds`) are counted as unknown, never as no pages.
  const counts: Counts = new Map(ordered.slice(kindsCounted).map((row) => [row.key, { count: UNKNOWN, top: "" }]));
  for (let at = 0; at < asked.length; at += ASKS_AT_ONCE) {
    const answers = await Promise.all(asked.slice(at, at + ASKS_AT_ONCE).map(async (kind) => ({
      kind,
      answer: await askLive(ctx, google, {
        startDate: span.from,
        endDate: span.to,
        type: searchType,
        dimensions: ["page"],
        dimensionFilterGroups: [{ filters: [{ dimension: "searchAppearance", operator: "equals", expression: kind }, ...countryFilters(country)] }],
      }),
    })));
    for (const { kind, answer } of answers) {
      if (!answer.ok) return null;
      counts.set(kind, { count: answer.rows.length, top: "" });
    }
  }
  return counts;
}

/**
 * A website's ready-made periods, rebuilt from what is kept: every list of
 * every kind of result it has, for each period and the period before — for
 * all countries, or one country kept ready from its own held days. A slot
 * with nothing now is emptied, so no period outlives its days. One kept list
 * is read at a time, so a run holds one list's days at once, never all.
 *
 * The pairs of keywords two or more pages were shown for are written for
 * Pages competing. One keyword's pages and one page's keywords are asked of
 * Google when opened, their counts read from the keyword and page lists
 * (keep-less-history-plan.md, 5.1; in key order here until 2026-10-08).
 */
export async function buildSitePeriods(
  ctx: ActionCtx,
  companyWebsiteId: Id<"companyWebsites">,
  newest: string,
  oldest: string,
  country?: string,
  /**
   * One kind of result only — a settle's jobs each take one, side by side —
   * and whether its 90 days and twelve months are added up too: weekly, the
   * 7 and 30 days nightly (cost review 1 and 4, `searchConsoleSettling.ts`).
   */
  options: { searchType?: SearchType; long?: boolean; onlyLong?: boolean } = {},
): Promise<number> {
  let written = 0;
  const builtAt = Date.now();
  const long = options.long ?? true;
  // Caught up when a screen asks (`searchConsoleCatchUp.ts`): the 90 days and twelve months alone, nothing nightly.
  const onlyLong = options.onlyLong === true;
  const allSlots = slotsOf(newest, oldest);
  const slots = onlyLong
    ? allSlots.filter((slot) => LONG_PERIODS.includes(slot.period))
    : long ? allSlots : allSlots.filter((slot) => !LONG_PERIODS.includes(slot.period));
  const scope = country === undefined ? {} : { country };
  const ninety = allSlots.find((slot) => slot.period === "90" && slot.which === "NOW")?.span ?? null;
  const asNinety = (slot: Slot) => sameAsNinety(slot, ninety);
  const writeParts = async (searchType: SearchType, list: SearchConsolePeriodList, slot: Slot, given: PartToWrite[] | null) => {
    // Twelve months on the 90 days' own days: one empty part saying its days, the 90 days read instead (`sameAsNinety`).
    const parts = given !== null && asNinety(slot) ? [] : given;
    // Not held, or a list this kind of result does not have: the slot is only emptied.
    const clearOnly = parts === null;
    const where = { companyWebsiteId, ...scope, searchType, list, period: slot.period, which: slot.which };
    if (clearOnly) {
      while (await ctx.runMutation(internal.searchConsolePeriods.clearPeriodSlot, where)) { /* until none is left */ }
      return;
    }
    // Swapped in whole (2026-10-05): the new build's parts first, its first part — which makes it the one read —
    // last, then the builds before it cleared a few parts at a time. A screen never reads half a list.
    const toWrite = (parts.length > 0 ? parts : [EMPTY_PART]).map((packed, part) => ({ packed, part }));
    for (const { packed, part } of [...toWrite.slice(1), toWrite[0]]) {
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
        builtAt,
      });
      written += 1;
    }
    while (await ctx.runMutation(internal.searchConsolePeriods.clearPeriodSlot, { ...where, before: builtAt })) { /* until none is left */ }
  };
  const write = async (searchType: SearchType, list: SearchConsolePeriodList, slot: Slot, rows: Row[] | null, counts?: Counts, facts?: Facts) => {
    if (rows === null) return await writeParts(searchType, list, slot, null);
    await writeParts(searchType, list, slot, pack(rows, list === "pair" || list === "competing").map((packed) => ({
      ...packed,
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
    })));
  };

  const held = await ctx.runQuery(internal.searchConsoleRollups.typesHeld, { companyWebsiteId, ...scope });
  const types = options.searchType === undefined ? held : held.filter((type) => type === options.searchType);
  const target = await ctx.runQuery(internal.searchConsoleFacts.factsTarget, { companyWebsiteId });
  const { google, chartWeeks, richResultKinds } = await ctx.runQuery(internal.searchConsolePeriods.buildTarget, { companyWebsiteId });
  // The 90 days, the 90 days before and twelve months asked of Google, a week at a time: the days are
  // kept 60 days (`searchConsoleLongLists.ts`; keep-less-history-plan.md, part 3). Asked of nobody when
  // the website is not connected, or Google will not answer: the long periods built before then stay.
  const isLong = (slot: Slot) => LONG_PERIODS.includes(slot.period) && !asNinety(slot);
  const longSpans = slots.filter((slot) => isLong(slot) && slot.span !== null).map((slot) => slot.span!);
  const tracked = google && longSpans.length > 0 ? await ctx.runQuery(internal.searchConsoleKeep.trackedSearches, { holdId: companyWebsiteId }) : [];
  const askedOf = async (searchType: SearchType, list: SearchConsoleList) =>
    google && longSpans.length > 0 ? await longListRows(ctx, google, { searchType, list, country }, longSpans, tracked) : null;
  const keysAsked = (asked: Map<string, Row[]> | null, side: "key" | "page") =>
    [...(asked?.values() ?? [])].flatMap((rows) => rows.map((row) => (side === "key" ? row.key : row.page ?? "")));
  // Sites' facts for each keyword and page, looked up once for every kind of result.
  const known: Record<"query" | "page", Facts> = { query: new Map(), page: new Map() };
  const factsOf = async (kind: "query" | "page", keys: Iterable<string>): Promise<Facts | undefined> => {
    if (!target) return undefined;
    const missing = [...keys].filter((key) => !known[kind].has(key));
    for (const [key, fact] of await factsFor(ctx, target, kind, missing)) known[kind].set(key, fact);
    return known[kind];
  };
  for (const searchType of types) {
    const lists = LISTS_OF[searchType];
    // Each search added up from the pairs, and each page's searches counted from them.
    const pageCounts = new Map<string, Counts>();
    const pairsKept = lists.includes("pair") ? await readKept(ctx, companyWebsiteId, country, searchType, "pair", newest) : null;
    const pairsAsked = pairsKept ? await askedOf(searchType, "pair") : null;
    const queryFacts = pairsKept ? await factsOf("query", [...keysIn(pairsKept, "keys"), ...keysAsked(pairsAsked, "key")]) : undefined;
    if (!onlyLong) await ctx.runMutation(internal.searchConsolePeriods.writeWeeks, {
      companyWebsiteId,
      ...scope,
      searchType,
      weeks: pairsKept ? chartFigures(pairsKept, newest, oldest, target?.brandWords ?? [], chartWeeks, searchType) : [],
      dayLine: firstDayKeptFor(searchType, newest),
      reach: chartReach(newest, chartWeeks),
      builtAt,
    });
    // New and lost's counts by day, from the whole first- and last-seen register (2026-10-04).
    // New and lost is kept for web search, in each home country (search-console-home-countries-plan.md).
    if (searchType === "web" && !onlyLong) await buildSeenDays(ctx, { companyWebsiteId, country, searchType }, builtAt);
    for (const slot of slots) {
      if (!pairsKept || !slot.span) {
        for (const list of ["pair", "pairByPage", "competing", "query"] as const) await writeParts(searchType, list, slot, null);
        continue;
      }
      if (asNinety(slot)) {
        for (const list of ["pair", "pairByPage", "competing", "query"] as const) await writeParts(searchType, list, slot, []);
        continue;
      }
      const pairs = isLong(slot) ? rowsFor(pairsAsked, slot.span) : addUp(keptIn(pairsKept, slot.span, newest, searchType));
      // Google not asked, or not answering: the long period built before stays.
      if (pairs === undefined) continue;
      const queries = bySide(pairs, "query");
      const pages = bySide(pairs, "page");
      const queryCounts: Counts = new Map([...queries.values()].map((summed) => [summed.key, { count: summed.count, top: summed.top }]));
      const pagesCounted: Counts = new Map([...pages.values()].map((summed) => [summed.key, { count: summed.count, top: summed.top }]));
      // One keyword's pages and one page's keywords are asked of Google when opened (keep-less-history-plan.md, 5.1):
      // not kept, and the lists kept before cleared.
      await writeParts(searchType, "pair", slot, null);
      await writeParts(searchType, "pairByPage", slot, null);
      // Pages competing: the pairs of keywords two or more pages were shown for, and how many pages Google showed at all.
      if (slot.which === "NOW") {
        const competing = pairs.filter((pair) => (queries.get(pair.key)?.count ?? 0) >= 2);
        // Each page once, a link to one of its sections being part of it (2026-10-04).
        const shown = new Set([...pages.keys()].map(pageWithoutSection)).size;
        // Its positions are never read (`pagesByKeyword`): not kept (keep-less-history-plan.md, 5.2).
        await writeParts(searchType, "competing", slot, pack(competing, true).map((packed) => ({ ...packed, positionSums: [], shown })));
      } else {
        await writeParts(searchType, "competing", slot, null);
      }
      await write(
        searchType,
        "query",
        slot,
        [...queries.values()].map((summed) => ({ key: summed.key, clicks: summed.clicks, impressions: summed.impressions, positionSum: summed.positionSum })),
        // Each search's page count and top page, on the period the screens list: a period before's are read for nothing (5.3).
        slot.which === "NOW" ? queryCounts : undefined,
        queryFacts,
      );
      pageCounts.set(slotKey(slot), pagesCounted);
    }
    // Fan-out's 14 and 28 days (§15, decision 4): web keywords for all countries, no period before.
    if (searchType === "web" && country === undefined && !onlyLong) {
      for (const period of FAN_OUT_PERIODS) {
        const span = periodSpan(period, newest, oldest);
        const rows = pairsKept
          ? [...bySide(addUp(keptIn(pairsKept, span, newest, searchType)), "query").values()].map((summed) => ({ key: summed.key, clicks: summed.clicks, impressions: summed.impressions, positionSum: summed.positionSum }))
          : null;
        await write(searchType, "query", { period, which: "NOW", span, now: span }, rows);
      }
    }
    // Pages, countries, devices and kinds of search appearance: Google's own totals, one list at a time.
    // A country has no country list of its own: its slots are only emptied.
    for (const list of ["page", "country", "device", "appearance"] as const) {
      const kept = lists.includes(list) && !(country !== undefined && list === "country")
        ? await readKept(ctx, companyWebsiteId, country, searchType, list, newest)
        : null;
      const asked = kept ? await askedOf(searchType, list) : null;
      const pageFacts = list === "page" && kept ? await factsOf("page", [...keysIn(kept, "keys"), ...keysAsked(asked, "key")]) : undefined;
      for (const slot of slots) {
        // Countries, devices and rich results show no change on the period before: none is kept for them (5.3).
        const before = slot.which === "BEFORE" && list !== "page";
        const rows = kept && slot.span && !before ? (isLong(slot) ? rowsFor(asked, slot.span) : addUp(keptIn(kept, slot.span, newest, searchType))) : null;
        // Google not asked, or not answering: the long period built before stays.
        if (rows === undefined) continue;
        // Rich results' pages for each kind, counted once here on the periods the screens list.
        const appearancePages = list === "appearance" && rows && slot.span && slot.which === "NOW"
          ? await pagesPerAppearance(ctx, google, searchType, slot.span, country, rows, richResultKinds)
          : null;
        await write(searchType, list, slot, rows, list === "page" ? (slot.which === "NOW" ? pageCounts.get(slotKey(slot)) : undefined) : (appearancePages ?? undefined), pageFacts);
      }
    }
  }
  return written;
}

/** Old parts of a ready-made period cleared per step: each up to a few hundred kilobytes, and a step reads at most 16 MB. */
const CLEAR_SLOT_PARTS = 8;

/** A few of a ready-made period's parts removed — every one, or the builds before `before` — true while more are left. */
export const clearPeriodSlot = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    list: periodListValidator,
    period: periodValidator,
    which: v.union(v.literal("NOW"), v.literal("BEFORE")),
    /** Keep the build of this time and any later: the one just written. */
    before: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_slot_built", (q) => {
        const slot = q.eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType)
          .eq("list", args.list).eq("period", args.period).eq("which", args.which);
        return args.before === undefined ? slot : slot.lt("builtAt", args.before);
      })
      .take(CLEAR_SLOT_PARTS);
    for (const part of old) await ctx.db.delete(part._id);
    return old.length === CLEAR_SLOT_PARTS;
  },
});

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
    firstKey: v.optional(v.string()),
    shown: v.optional(v.number()),
    builtAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await stillKeptReady(ctx, args.companyWebsiteId, args.country))) return null;
    // A held period with nothing in it keeps its first part, empty: held, and no clicks.
    if (args.keys.length === 0 && args.part > 0) return null;
    if (args.part === 0) {
      // The first part, written last, makes this build the one read: the first parts before it go now, their other parts after.
      const firsts = await ctx.db
        .query("searchConsolePeriods")
        .withIndex("by_hold_country_type_list_period", (q) => q
          .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType)
          .eq("list", args.list).eq("period", args.period).eq("which", args.which).eq("part", 0))
        .take(FIRST_PARTS_READ);
      for (const old of firsts) if (old.builtAt <= args.builtAt) await ctx.db.delete(old._id);
    }
    // Its numbers packed as text, a few characters each where Convex keeps nine bytes (`packNumbers`).
    await ctx.db.insert("searchConsolePeriods", { ...args, ...packedColumns(args) });
    return null;
  },
});
