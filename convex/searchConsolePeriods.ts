import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LISTS_OF } from "./searchConsoleApi";
import {
  FAN_OUT_PERIODS,
  VOLATILITY_PERIOD,
  periodListValidator,
  periodValidator,
  searchTypeValidator,
  type SearchConsoleList,
  type SearchConsolePeriod,
  type SearchConsolePeriodList,
  type SearchType,
} from "./searchConsoleSchema";
import { historyLimitDay, shiftDay } from "./searchConsoleDays";
import { UNKNOWN, factsFor, type Facts } from "./searchConsoleFacts";
import { countryScope, stillKeptReady } from "./searchConsoleCountries";
import { askLive, countryFilters } from "./searchConsoleReads";
import { consoleLimitsOf } from "./searchConsoleLimits";
import { FAN_OUT_LIMITS } from "./fanOutLimits";
import { buildSeenDays } from "./searchConsoleSeenDays";
import { longListRows, rowsFor, type PairsCarry } from "./searchConsoleLongLists";
import {
  addUp,
  bookedColumns,
  RanLong,
  bySide,
  firstDayKeptFor,
  firstWeekKept,
  monthStart,
  pack,
  packNumbers,
  packedColumns,
  weekStart,
  type ChartStep,
  type Packed,
  type Row,
} from "./utils/searchConsolePacks";
import { bandOf, isBrand, pageWithoutSection } from "./utils/searchConsoleViews";
import { VOLATILITY_IMPRESSIONS, completeDays, dayVolatility, periodVolatility, type Volatility } from "./utils/searchConsoleVolatility";
import { tenantQuery } from "./tenantFunctions";
import { forgetListBuild, noteListBuild, writeBook } from "./searchConsolePeriodBooks";
import type { BookKind } from "./utils/searchConsoleTerms";
import { FIRST_PARTS_READ } from "./searchConsolePeriodReads";
import { requireMySite } from "./siteAccess";
import { keywordsOnDay, spanKey, streamList, streamPairs } from "./searchConsoleKeptSums";
import { chartPeriods, chartReach, daysBetween, daysFrom, lastDayOf, type ChartGrain, type ChartPeriod } from "./utils/searchConsoleChartDays";
import { CALENDAR_PERIODS, periodSpan as calendarSpan, spanBefore as calendarBefore, ukDay } from "./utils/calendarPeriods";

export { chartReach, daysBetween } from "./utils/searchConsoleChartDays";

/**
 * The ready-made periods every Search Console list reads
 * (docs/plans/active/search-console-plan.md §14.3, item 4): the date menu's
 * seven calendar periods, each to the newest day held, and what each is set
 * against where it is held (calendar-periods-plan.md, phase 4), each list
 * added up once after every collection — so a screen reads one record or a
 * few, never a day at a time.
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

export type PeriodSpan = { from: string; to: string };

/**
 * Fan-out's own days (14 or 28), ending on the newest day held: never before
 * the oldest day held.
 */
export function daysSpan(period: (typeof FAN_OUT_PERIODS)[number], newest: string, oldest: string): PeriodSpan {
  const from = shiftDay(newest, 1 - Number(period));
  return { from: from < oldest ? oldest : from, to: newest };
}

export type Kept = { grain: "DAY" | "WEEK" | "MONTH"; start: string; packed: Packed };

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
 * with most of the days it holds inside the span. Since 2026-10-16 the build
 * adds its periods up as it reads (`searchConsoleKeptSums.ts`); this and
 * `chartFigures` are the rule it is proven against, figure by figure
 * (`searchConsoleKeptSums.test.ts`; search-console-streamed-lists-plan.md, SL6). A period reaching past 90
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

type Counts = Map<string, { count: number; top: string }>;


type Grain = ChartGrain;
const GRAIN_OF: Record<ChartStep, Grain> = { day: "DAY", week: "WEEK", month: "MONTH" };

/**
 * Each day, week and month the charts reach — its keywords by band of
 * position and its clicks from brand searches and the rest — added up from
 * the kept pairs counting towards it by the same rule as every period
 * (`keptIn`): its days, and a rolled-up week in the month most of its days
 * fall in (§14.3, item 4).
 */
export function chartFigures(kept: readonly Kept[], newest: string, oldest: string, brandWords: readonly string[], chartWeeks: number, searchType = "web"): ChartPeriod[] {
  const volatilityOn = dailyVolatility(kept);
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
    const scored = grain === "DAY" ? [volatilityOn(start)] : daysFrom(held.from, held.to).map(volatilityOn);
    const days = scored.filter((day): day is Volatility => day !== null);
    return days.length === 0 ? figures : { ...figures, ...(grain === "DAY" ? days[0] : periodVolatility(days)) };
  });
}

/**
 * Each day's volatility against the day before (search-console-volatility-
 * plan.md §3), from the days kept as days — null where either day is not one,
 * as a day past the 60 kept, rolled into its week, cannot be told apart.
 */
function dailyVolatility(kept: readonly Kept[]): (day: string) => Volatility | null {
  const partsOf = new Map<string, Packed[]>();
  for (const record of kept) {
    if (record.grain !== "DAY") continue;
    partsOf.set(record.start, [...(partsOf.get(record.start) ?? []), record.packed]);
  }
  const keywords = new Map<string, ReturnType<typeof bySide>>();
  const keywordsOn = (day: string) => {
    const parts = partsOf.get(day);
    if (!parts) return null;
    if (!keywords.has(day)) keywords.set(day, bySide(addUp(parts), "query"));
    return keywords.get(day)!;
  };
  return (day) => {
    const today = keywordsOn(day);
    const before = keywordsOn(shiftDay(day, -1));
    return today && before ? dayVolatility(today, before) : null;
  };
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
  volatility: v.optional(v.number()),
  volatilityKeywords: v.optional(v.number()),
  movedUp5: v.optional(v.number()),
  movedDown5: v.optional(v.number()),
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
    // A first build holds none of its own rows: rows before its first week and month were filled from Google (phase 9).
    const freshFrom = (grain: Grain) => args.weeks.filter((one) => one.grain === grain).map((one) => one.week).sort()[0];
    const first = !rows.some((held) => {
      const from = freshFrom(held.grain ?? "WEEK");
      return from === undefined || held.week >= from;
    });
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
  /** Volatility's score (search-console-volatility-plan.md §3): missing where too few keywords counted, or on a row built before it. */
  volatility: v.optional(v.number()),
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

    // The main country's weeks and months reach back past collection, filled from Google (phase 9): its days begin there.
    const heldFrom = scope.read === "KEPT" ? oldest : (connection?.daysFrom ?? oldest);
    const dayLine = firstDayKeptFor(args.searchType, newest);
    const byWeek = args.step === "day" && args.from < dayLine && heldFrom < dayLine;
    // Weeks past six months are kept as months (`firstWeekKept`): weeks reaching there are shown by month.
    const weekLine = firstWeekKept(newest);
    const byMonth = (byWeek || args.step === "week") && args.from < weekLine && heldFrom < weekLine;
    const step: ChartStep = byMonth ? "month" : byWeek ? "week" : args.step;
    const grain = GRAIN_OF[step];
    const reachFrom = chartReach(newest, chartWeeks);
    const reach = args.from < reachFrom && heldFrom < reachFrom ? reachFrom : null;

    const rows = await weeksOf(ctx, site.hold._id, scope.read === "KEPT" ? scope.country : undefined, args.searchType);
    // Rows built before 2026-10-04 carry no grain: they are weeks.
    const ofGrain = rows.filter((row) => (row.grain ?? "WEEK") === grain);
    // Volatility's chart leaves out a day Google has only half filled in (search-console-volatility-plan.md §3).
    const complete = grain === "DAY" ? completeDays(ofGrain) : null;
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
          ...(row.volatility === undefined || (complete && !complete.has(row.week)) ? {} : { volatility: row.volatility }),
        };
      });
    if (!LISTS_OF[args.searchType].includes("pair")) return { ...nothing, notReady: false, preparing: false, noSearches: true };
    return { periods, step, byWeek, byMonth, reach, chartWeeks, notReady: false, preparing: false, notBuilt: rows.length > 0 && ofGrain.length === 0, noSearches: false };
  },
});
/**
 * A period's slot: what it is (`NOW`) or is set against (`BEFORE`), its days
 * held (null when none are, or — before — when not every one is), and whether
 * those days reach back past the 60 kept day by day, so are asked of Google a
 * week at a time (`long`).
 */
type Slot = { period: SearchConsolePeriod; which: "NOW" | "BEFORE"; span: PeriodSpan | null; now: PeriodSpan; long: boolean };

/**
 * Every calendar period and what it is set against, as spans of days, on the
 * UK day `today` (calendar-periods-plan.md, phase 4). A span reaching past
 * the days kept (`dayLine`) is asked of Google a week at a time, so reaches
 * back to Google's sixteen-month line (`googleFrom`; insights-intelligence-
 * plan.md phase 9); one inside them is added up from the days collected and
 * stops where collection began. A period Google has sent none of yet — This
 * week on a Monday — has no span, so its lists are emptied; what it is set
 * against is held only when every day of it is.
 */
export function slotsOf(newest: string, oldest: string, googleFrom: string = oldest, today: string = ukDay(), dayLine: string = firstDayKeptFor("web", newest)): Slot[] {
  const floorOf = (from: string) => (from < dayLine && googleFrom < oldest ? googleFrom : oldest);
  return CALENDAR_PERIODS.flatMap((period): Slot[] => {
    const whole = calendarSpan(period, today, newest);
    const nowFrom = whole ? (whole.from < floorOf(whole.from) ? floorOf(whole.from) : whole.from) : null;
    if (!whole || nowFrom === null || nowFrom > whole.to) {
      const none = { from: newest, to: newest };
      return [
        { period, which: "NOW", span: null, now: none, long: false },
        { period, which: "BEFORE", span: null, now: none, long: false },
      ];
    }
    const now = { from: nowFrom, to: whole.to };
    const before = calendarBefore(period, whole);
    const beforeHeld = before.from >= floorOf(before.from);
    return [
      { period, which: "NOW", span: now, now, long: now.from < dayLine },
      { period, which: "BEFORE", span: beforeHeld ? { from: before.from, to: before.to } : null, now, long: beforeHeld && before.from < dayLine },
    ];
  });
}

const slotKey = (slot: Slot) => `${slot.period}|${slot.which}`;

/** A long slot's group, each a settle stage of its own: the 12 months' (`YEAR`; the retired This year's too), and every other period's (`QUARTERS`, as the 3 and 6 months were the quarters' until 2026-10-29). */
export type LongGroup = "QUARTERS" | "YEAR";
const groupOf = (slot: Slot): LongGroup => (slot.period === "last12Months" || slot.period === "thisYear" ? "YEAR" : "QUARTERS");

/**
 * The period whose identical days a NOW slot repeats — This month and This
 * quarter in a quarter's first month, This quarter and This year in its first
 * quarter — or null: kept once, under the first of them in the menu's order
 * (finish-off plan item 2E, 2026-10-05: a third of morehandles.co.uk's
 * ready-made periods, 138 MB, were the 90 days twice). Its slot keeps one
 * empty part saying its days, and the readers read the other (`partsToRead`).
 */
function sameDaysAs(slot: Slot, slots: readonly Slot[]): SearchConsolePeriod | null {
  if (slot.which !== "NOW" || !slot.span) return null;
  const first = slots.find((other) => other.which === "NOW" && other.span !== null && other.span.from === slot.span!.from && other.span.to === slot.span!.to);
  return first && first.period !== slot.period ? first.period : null;
}

/** Google settles a day's figures within three days: a finished period built this long after its last day is final. */
const SETTLED_AFTER_MS = 4 * 86_400_000;

/**
 * A long slot of a finished period already built once its days settled, for
 * the same days: kept as it is, never asked of Google again (calendar-periods-
 * plan.md: "the finished periods once") — Last quarter, and what it and Last
 * month are set against.
 */
export const settledSlots = internalQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    slots: v.array(v.object({ period: periodValidator, which: v.union(v.literal("NOW"), v.literal("BEFORE")), from: v.string(), to: v.string() })),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const settled: string[] = [];
    for (const slot of args.slots) {
      for (const list of ["page", "query"] as const) {
        const first = await ctx.db
          .query("searchConsolePeriods")
          .withIndex("by_hold_country_type_list_period", (q) => q
            .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType)
            .eq("list", list).eq("period", slot.period).eq("which", slot.which).eq("part", 0))
          .first();
        if (first && first.from === slot.from && first.to === slot.to && first.builtAt >= Date.parse(`${slot.to}T00:00:00Z`) + SETTLED_AFTER_MS) {
          settled.push(`${slot.period}|${slot.which}`);
          break;
        }
      }
    }
    return settled;
  },
});

/** A part as written: its rows, and what each row carries beside them. */
export type PartToWrite = Packed & {
  counts?: number[];
  tops?: string[];
  kinds?: string[];
  volumes?: number[];
  estimates?: number[];
  firstKey?: string;
  shown?: number;
};

const EMPTY_PART: PartToWrite = { keys: [], clicks: [], impressions: [], positionSums: [] };

/** Spans once each, in order. */
function uniqueSpans(spans: readonly PeriodSpan[]): PeriodSpan[] {
  const seen = new Map<string, PeriodSpan>();
  for (const span of spans) if (!seen.has(spanKey(span))) seen.set(spanKey(span), span);
  return [...seen.values()];
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
  // `longGroup`, with `onlyLong`: one group of long periods alone, a job of its own; `stopAt`: past it the job stops itself (`RanLong`),
  // its long periods' pairs pausing for the next job a little before (`PairsPaused`); `carry`: where a job before paused them.
  options: { searchType?: SearchType; long?: boolean; onlyLong?: boolean; longGroup?: LongGroup; stopAt?: number; careful?: boolean; held?: { pruned: boolean }; carry?: PairsCarry } = {},
): Promise<number> {
  let written = 0;
  const builtAt = Date.now();
  const long = options.long ?? true;
  // Caught up when a screen asks (`searchConsoleCatchUp.ts`): the 90 days and twelve months alone, nothing nightly.
  const onlyLong = options.onlyLong === true;
  const allSlots = slotsOf(newest, oldest, historyLimitDay(builtAt), ukDay(builtAt), firstDayKeptFor("web", newest));
  const slots = onlyLong
    ? allSlots.filter((slot) => slot.long && (options.longGroup === undefined || groupOf(slot) === options.longGroup))
    : long ? allSlots : allSlots.filter((slot) => !slot.long);
  const inTime = (what: string) => { if (options.stopAt !== undefined && Date.now() > options.stopAt) throw new RanLong(what); };
  // The long periods alone read only whether a line is kept: their rows are asked of Google (the adding-up that hands on).
  const anyKeptOf = async (searchType: SearchType, list: SearchConsoleList): Promise<boolean> =>
    await ctx.runQuery(internal.searchConsoleRollups.anyKept, { companyWebsiteId, ...scope, searchType, list });
  const scope = country === undefined ? {} : { country };
  // A period on another's very days, kept once under the first (`sameDaysAs`).
  const asNinety = (slot: Slot) => sameDaysAs(slot, allSlots) !== null;
  // A kind of result's lists, held until all are worked out: then its book, then each list holding places in it
  // (core-data-normalisation-plan.md §5.1, `searchConsolePeriodBooks.ts`).
  const waiting: Array<{ searchType: SearchType; list: SearchConsolePeriodList; slot: Slot; parts: PartToWrite[] }> = [];
  const writeParts = async (searchType: SearchType, list: SearchConsolePeriodList, slot: Slot, given: PartToWrite[] | null) => {
    // A period on another's very days: one empty part saying its days, the other read instead (`sameDaysAs`).
    const parts = given !== null && asNinety(slot) ? [] : given;
    // Not held, or a list this kind of result does not have: the slot is only emptied.
    if (parts === null) {
      const where = { companyWebsiteId, ...scope, searchType, list, period: slot.period, which: slot.which };
      while (await ctx.runMutation(internal.searchConsolePeriods.clearPeriodSlot, where)) { /* until none is left */ }
      return;
    }
    waiting.push({ searchType, list, slot, parts });
  };
  const writeHeld = async (searchType: SearchType) => {
    const lists = waiting.filter((one) => one.searchType === searchType);
    const book = { companyWebsiteId, ...scope, searchType, builtAt };
    const places = {
      query: await writeBook(ctx, book, "query", lists.flatMap((one) => one.parts.flatMap((part) => termsOf(one.list, part, "query")))),
      page: await writeBook(ctx, book, "page", lists.flatMap((one) => one.parts.flatMap((part) => termsOf(one.list, part, "page")))),
    };
    const brandWords = target?.brandWords ?? [];
    for (const one of lists) await writeList(searchType, one.list, one.slot, one.parts.map((part) => inBook(one.list, part, places, brandWords)));
    while (await ctx.runMutation(internal.searchConsolePeriodBooks.dropUnusedBooks, { companyWebsiteId, ...scope, searchType })) { /* until none is left */ }
  };
  const writeList = async (searchType: SearchType, list: SearchConsolePeriodList, slot: Slot, parts: StoredPart[]) => {
    const where = { companyWebsiteId, ...scope, searchType, list, period: slot.period, which: slot.which };
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
  const isLong = (slot: Slot) => slot.long && !asNinety(slot);
  // The periods added up from the days kept: those inside the 60 days and the spans before them (SL1).
  const shortSpans = uniqueSpans(slots.filter((slot) => !isLong(slot) && !asNinety(slot) && slot.span).map((slot) => slot.span!));
  // A finished period's long slot, built once its days settled, is kept as it is: never asked of Google again.
  const settledOf = async (searchType: SearchType): Promise<Set<string>> => {
    const finished = slots.filter((slot) => isLong(slot) && slot.span !== null && slot.span.to < newest);
    if (finished.length === 0) return new Set();
    return new Set(await ctx.runQuery(internal.searchConsolePeriods.settledSlots, {
      companyWebsiteId, ...scope, searchType,
      slots: finished.map((slot) => ({ period: slot.period, which: slot.which, from: slot.span!.from, to: slot.span!.to })),
    }));
  };
  let settled = new Set<string>();
  const longSpansOf = () => uniqueSpans(slots.filter((slot) => isLong(slot) && slot.span !== null && !settled.has(slotKey(slot))).map((slot) => slot.span!));
  const tracked = google && slots.some((slot) => isLong(slot) && slot.span !== null) ? await ctx.runQuery(internal.searchConsoleKeep.trackedSearches, { holdId: companyWebsiteId }) : [];
  const askedOf = async (searchType: SearchType, list: SearchConsoleList) => {
    const longSpans = longSpansOf();
    return google && longSpans.length > 0 ? await longListRows(ctx, google, { searchType, list, country }, longSpans, tracked, options.stopAt, options.held, list === "pair" ? options.carry : undefined) : null;
  };
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
    settled = await settledOf(searchType);
    // Each search added up from the pairs, and each page's searches counted from them.
    const pageCounts = new Map<string, Counts>();
    // The days kept read once, a day at a time, into every period they count for (search-console-streamed-lists-plan.md,
    // SL1): the 7 and 30 days, the fan-out's days, the charts, the volatility day. The long periods alone read none.
    const streamed = lists.includes("pair") && !onlyLong ? await streamPairs(ctx, companyWebsiteId, country, searchType, {
      newest,
      oldest,
      pairSpans: shortSpans,
      keywordSpans: searchType === "web" && country === undefined ? FAN_OUT_PERIODS.map((period) => daysSpan(period, newest, oldest)) : [],
      chart: { chartWeeks, brandWords: target?.brandWords ?? [], dayLine: firstDayKeptFor(searchType, newest) },
    }) : null;
    const anyPairs = streamed !== null || (lists.includes("pair") && onlyLong && await anyKeptOf(searchType, "pair"));
    const pairsAsked = anyPairs ? await askedOf(searchType, "pair") : null;
    const queryFacts = anyPairs ? await factsOf("query", [...(streamed?.keys.texts ?? []), ...keysAsked(pairsAsked, "key")]) : undefined;
    // The charts are written by the nightly build alone, never the long periods'.
    const weeks = streamed ? streamed.weeks() : [];
    if (!onlyLong) await ctx.runMutation(internal.searchConsolePeriods.writeWeeks, {
      companyWebsiteId,
      ...scope,
      searchType,
      weeks,
      dayLine: firstDayKeptFor(searchType, newest),
      reach: chartReach(newest, chartWeeks),
      builtAt,
    });
    // New and lost's counts by day, from the whole first- and last-seen register (2026-10-04).
    // New and lost is kept for web search, in each home country (search-console-home-countries-plan.md).
    // Kept up as the register is written (`noteRegister`): counted whole only when none is held, or a month on.
    if (searchType === "web" && !onlyLong && await ctx.runQuery(internal.searchConsoleSeenDays.recountDue, { companyWebsiteId, ...scope, searchType, now: builtAt })) {
      await buildSeenDays(ctx, { companyWebsiteId, country, searchType }, builtAt);
    }
    for (const slot of slots) {
      inTime(`Adding up the ${searchType} searches`);
      // A finished period settled and kept: left as it is.
      if (settled.has(slotKey(slot))) continue;
      if (!anyPairs || !slot.span) {
        for (const list of ["pair", "pairByPage", "competing", "query"] as const) await writeParts(searchType, list, slot, null);
        continue;
      }
      if (asNinety(slot)) {
        for (const list of ["pair", "pairByPage", "competing", "query"] as const) await writeParts(searchType, list, slot, []);
        continue;
      }
      const pairs = isLong(slot) ? rowsFor(pairsAsked, slot.span) : streamed?.pairs.get(spanKey(slot.span))?.rows() ?? [];
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
        // Its positions are never read (`pagesByKeyword`): not kept (keep-less-history-plan.md, 5.2). A link to one of a
        // page's sections folded into the page here, at build, so the screen groups by place (core-data plan §5.2).
        const folded = competing.map((pair) => ({ ...pair, page: pageWithoutSection(pair.page ?? "") }));
        await writeParts(searchType, "competing", slot, pack(folded, true).map((packed) => ({ ...packed, positionSums: [], shown })));
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
        const span = daysSpan(period, newest, oldest);
        const rows = streamed
          ? [...(streamed.keywords.get(spanKey(span))?.summed() ?? [])].map((summed) => ({ key: summed.key, clicks: summed.clicks, impressions: summed.impressions, positionSum: summed.positionSum }))
          : null;
        await write(searchType, "query", { period, which: "NOW", span, now: span, long: false }, rows);
      }
    }
    // Volatility's day (search-console-volatility-plan.md §2.1, V7): the web keywords counted on the newest day and the
    // day before — 10 or more impressions each day (§3) — for all countries and each country kept.
    if (searchType === "web" && !onlyLong) {
      // The newest day Google has filled in, as the page judges it (§3): a half-filled newest day is passed over.
      const days = weeks.filter((week) => week.grain === "DAY");
      const complete = completeDays(days);
      const judged = [...days].reverse().find((week) => complete.has(week.week))?.week ?? newest;
      const now = { from: judged, to: judged };
      for (const which of ["NOW", "BEFORE"] as const) {
        const day = which === "NOW" ? judged : shiftDay(judged, -1);
        const span = { from: day, to: day };
        const rows = streamed && day >= oldest
          ? [...(await keywordsOnDay(ctx, companyWebsiteId, country, searchType, streamed, newest, day)).summed()]
            .filter((summed) => summed.impressions >= VOLATILITY_IMPRESSIONS)
            .map((summed) => ({ key: summed.key, clicks: summed.clicks, impressions: summed.impressions, positionSum: summed.positionSum }))
          : null;
        await write(searchType, "query", { period: VOLATILITY_PERIOD, which, span, now, long: false }, rows);
      }
    }
    // Pages, countries, devices and kinds of search appearance: Google's own totals, one list at a time.
    // A country has no country list of its own: its slots are only emptied.
    for (const list of ["page", "country", "device", "appearance"] as const) {
      inTime(`Adding up the ${searchType} ${list} list`);
      const wanted = lists.includes(list) && !(country !== undefined && list === "country");
      // A day at a time into each period, as the pairs (SL1); only the page list keeps the spans before.
      const listSpans = uniqueSpans(slots.filter((slot) => !isLong(slot) && !asNinety(slot) && slot.span && (slot.which === "NOW" || list === "page")).map((slot) => slot.span!));
      const listed = wanted && !onlyLong ? await streamList(ctx, companyWebsiteId, country, searchType, list, newest, listSpans) : null;
      const anyKept = listed !== null || (wanted && onlyLong && await anyKeptOf(searchType, list));
      const asked = anyKept ? await askedOf(searchType, list) : null;
      const pageFacts = list === "page" && anyKept ? await factsOf("page", [...(listed?.keys.texts ?? []), ...keysAsked(asked, "key")]) : undefined;
      for (const slot of slots) {
        if (settled.has(slotKey(slot))) continue;
        // Countries, devices and rich results show no change on the period before: none is kept for them (5.3).
        const before = slot.which === "BEFORE" && list !== "page";
        const rows = anyKept && slot.span && !before ? (isLong(slot) ? rowsFor(asked, slot.span) : listed?.sums.get(spanKey(slot.span))?.rows() ?? []) : null;
        // Google not asked, or not answering: the long period built before stays.
        if (rows === undefined) continue;
        // Rich results' pages for each kind, counted once here on the periods the screens list.
        const appearancePages = list === "appearance" && rows && slot.span && slot.which === "NOW"
          ? await pagesPerAppearance(ctx, google, searchType, slot.span, country, rows, richResultKinds)
          : null;
        await write(searchType, list, slot, rows, list === "page" ? (slot.which === "NOW" ? pageCounts.get(slotKey(slot)) : undefined) : (appearancePages ?? undefined), pageFacts);
      }
    }
    await writeHeld(searchType);
  }
  return written;
}

/** A list's part as written: its keywords and pages as places in the build's book where the list is one of the three that hold them. */
export type StoredPart = Omit<PartToWrite, "keys" | "tops" | "pages"> & { keys: string[] | string; tops?: string[] | string; pages?: string[] | string; brands?: string };

/** The lists whose keywords and pages go in the build's book: the keyword lists, the page lists and Pages competing. */
const BOOKED_LISTS: ReadonlySet<SearchConsolePeriodList> = new Set(["query", "page", "competing"]);

/** The keywords (`query`) or pages a list's part names: its own keys, a keyword's top page or a page's top keyword, Pages competing's pages. */
export function termsOf(list: SearchConsolePeriodList, part: PartToWrite, kind: BookKind): string[] {
  if (!BOOKED_LISTS.has(list)) return [];
  const keysKind: BookKind = list === "page" ? "page" : "query";
  return [
    ...(keysKind === kind ? part.keys : []),
    ...(part.tops && (list === "page" ? "query" : "page") === kind ? part.tops : []),
    ...(part.pages && kind === "page" ? part.pages : []),
  ];
}

/** A part with its keywords and pages as places in the build's book, packed, and each keyword's brand flag. Exported for the load test. */
export function inBook(list: SearchConsolePeriodList, part: PartToWrite, places: Record<BookKind, Map<string, number>>, brandWords: readonly string[]): StoredPart {
  if (!BOOKED_LISTS.has(list)) return part;
  const placed = (kind: BookKind, texts: readonly string[]) => packNumbers(texts.map((text) => places[kind].get(text) ?? 0));
  return {
    ...part,
    keys: placed(list === "page" ? "page" : "query", part.keys),
    ...(part.tops ? { tops: placed(list === "page" ? "query" : "page", part.tops) } : {}),
    ...(part.pages ? { pages: placed("page", part.pages) } : {}),
    ...(list === "query" && brandWords.length > 0 ? { brands: packNumbers(part.keys.map((key) => (isBrand(key, brandWords) ? 1 : 0))) } : {}),
  };
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
    // Emptied whole: the list names no build any more.
    if (args.before === undefined && old.length < CLEAR_SLOT_PARTS) {
      await forgetListBuild(ctx, { companyWebsiteId: args.companyWebsiteId, country: args.country, searchType: args.searchType, list: args.list, period: args.period as SearchConsolePeriod, which: args.which });
    }
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
    // Places in the build's book, packed, for the keyword and page lists and Pages competing (§5.1); text for the rest.
    keys: v.union(v.array(v.string()), v.string()),
    pages: v.optional(v.union(v.array(v.string()), v.string())),
    brands: v.optional(v.string()),
    clicks: v.array(v.number()),
    impressions: v.array(v.number()),
    positionSums: v.array(v.number()),
    counts: v.optional(v.array(v.number())),
    tops: v.optional(v.union(v.array(v.string()), v.string())),
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
      // The list is read from this build now: its book stays while it is (`searchConsolePeriodBooks.ts`).
      await noteListBuild(ctx, { companyWebsiteId: args.companyWebsiteId, country: args.country, searchType: args.searchType, list: args.list, period: args.period as SearchConsolePeriod, which: args.which }, args.builtAt);
    }
    // Its numbers packed as text, a few characters each where Convex keeps nine bytes (`packNumbers`), and its
    // page addresses once each in its own book (`bookPages`): a keyword's top page, Pages competing's pages.
    await ctx.db.insert("searchConsolePeriods", { ...args, ...packedColumns(args), ...bookedColumns(args) });
    return null;
  },
});
