import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { askGoogle, countryFilter } from "./searchConsoleLiveAsks";
import { LISTS_OF } from "./searchConsoleApi";
import { searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { piecesOf } from "./searchConsoleLongLists";
import { chartFillOf, periodFigures } from "./searchConsoleHistoryDays";
import { kindsHeld } from "./searchConsoleRollups";
import { shiftDay } from "./searchConsoleDays";
import { daysBetween, lastDayOf } from "./utils/searchConsoleChartDays";
import { addRowsInto, firstDayKeptFor, monthStart, weekStart, type Row } from "./utils/searchConsolePacks";

/**
 * The Position bands and Brand charts' weeks and months older than the days kept, worked out again from Google's own
 * keyword figures (search-console-and-analytics-data-plan-2026-11-21.md, fix 1, 21 November 2026).
 *
 * A chart's weeks inside the days kept are added up from each search's own lines by every night's build. The weeks and
 * months before them stay as they were built, never built again: from the pairs of a keyword and a page, which counted a
 * search once for each page shown — so its place, and the band it falls in, was the average over the pages — or, before
 * collection began, from Google's keywords but counting a search past the top 20 only when clicked (`periodFigures`, the
 * keep rule that went on 18 November 2026). Each is asked of Google again here: one ask a week or month, in weekly pieces
 * where Google cuts one off at its 50,000 rows, and a day at a time where a week is cut too, so every row is Google's whole
 * answer. Two asks at a time, far inside Google's 1,200 a minute (AGENTS.md, Google's quotas).
 *
 * Run once a website's own lines are all in, by the refill (`searchConsolePageRefetch.refetchSearches`), before its
 * periods are built again.
 */

const ASKS_AT_ONCE = 2;

/** Rows of a kind's chart read: more than its 90 days, 52 weeks and 13 months. */
const ROWS_READ = 200;

const grainValidator = v.union(v.literal("WEEK"), v.literal("MONTH"));

/** What the refill needs for one scope: the property, its newest day and Google's first, its brand words, and each week and month to work out again. */
export const chartRefillTarget = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections"), country: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({
    companyWebsiteId: v.id("companyWebsites"),
    property: v.string(),
    newest: v.string(),
    from: v.string(),
    brandWords: v.array(v.string()),
    periods: v.array(v.object({ searchType: searchTypeValidator, grain: grainValidator, start: v.string() })),
  })),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || !connection.property || connection.clearing) return null;
    const charts = await chartFillOf(ctx, connection, args.country);
    if (!charts) return null;
    const held = args.country === undefined ? connection : connection.countriesHeld?.find((one) => one.country === args.country);
    const from = held?.daysFrom ?? held?.oldestDay;
    if (!from) return null;
    const periods: Array<{ searchType: SearchType; grain: "WEEK" | "MONTH"; start: string }> = [];
    for (const searchType of await kindsHeld(ctx, connection.companyWebsiteId, args.country)) {
      if (!LISTS_OF[searchType].includes("query")) continue;
      const dayLine = firstDayKeptFor(searchType, charts.newest);
      const rows = await ctx.db.query("searchConsoleWeeks")
        .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("country", args.country).eq("searchType", searchType))
        .take(ROWS_READ);
      for (const row of rows) {
        // Rows built before 2026-10-04 carry no grain: they are weeks.
        const grain = row.grain ?? "WEEK";
        if (grain === "DAY" || row.week >= dayLine) continue;
        if (row.week < (grain === "WEEK" ? weekStart(charts.reach) : monthStart(charts.reach))) continue;
        periods.push({ searchType, grain, start: row.week });
      }
    }
    return { companyWebsiteId: connection.companyWebsiteId, property: connection.property, newest: charts.newest, from, brandWords: charts.brandWords, periods };
  },
});

/** One week's or month's chart figures replaced, its volatility kept: where none is held, written. */
export const replaceChartPeriod = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    grain: grainValidator,
    start: v.string(),
    days: v.number(),
    figures: v.object({ top3: v.number(), top10: v.number(), top20: v.number(), rest: v.number(), brandClicks: v.number(), otherClicks: v.number() }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("searchConsoleWeeks")
      .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType).eq("week", args.start))
      .take(3);
    const held = rows.find((row) => (row.grain ?? "WEEK") === args.grain);
    if (held) await ctx.db.patch(held._id, { days: args.days, ...args.figures, builtAt: Date.now() });
    else await ctx.db.insert("searchConsoleWeeks", { companyWebsiteId: args.companyWebsiteId, ...(args.country ? { country: args.country } : {}), searchType: args.searchType, grain: args.grain, week: args.start, days: args.days, ...args.figures, builtAt: Date.now() });
    return null;
  },
});

type Google = { connectionId: Id<"searchConsoleConnections">; property: string };
type Span = { from: string; to: string };

/** Google's keywords for a span, each its whole answer: in weekly pieces where Google cuts the span off, a day at a time where it cuts a week. Null when Google won't answer. */
async function searchesOf(ctx: ActionCtx, google: Google, searchType: SearchType, span: Span, country: string | undefined): Promise<{ rows: Row[]; asks: number } | null> {
  const filters = countryFilter(country);
  const whole = await askGoogle(ctx, google, searchType, "query", span.from, span.to, filters);
  if (!whole.ok) return null;
  if (!whole.cut || span.from === span.to) return { rows: whole.rows, asks: 1 };
  const sums = new Map<string, Row>();
  let asks = 1;
  const pieces = span.to > span.from && daysBetween(span.from, span.to) > 7 ? piecesOf([span]) : daysOfSpan(span);
  for (const piece of pieces) {
    const answer = await searchesOf(ctx, google, searchType, piece, country);
    if (!answer) return null;
    asks += answer.asks;
    addRowsInto(sums, answer.rows);
  }
  return { rows: [...sums.values()], asks };
}

function daysOfSpan(span: Span): Span[] {
  const days: Span[] = [];
  for (let day = span.from; day <= span.to; day = shiftDay(day, 1)) days.push({ from: day, to: day });
  return days;
}

/**
 * Every chart week and month older than the days kept, for the website's main home country and each country kept ready,
 * worked out again from Google's keywords. What Google won't answer is left as it was, and said.
 */
export async function refillChartPeriods(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">, countries: readonly string[]): Promise<{ periods: number; asks: number; problems: string[] }> {
  let periods = 0;
  let asks = 0;
  const problems: string[] = [];
  for (const country of [undefined, ...countries]) {
    const target = await ctx.runQuery(internal.searchConsoleChartRefill.chartRefillTarget, { connectionId, ...(country ? { country } : {}) });
    if (!target) continue;
    const google = { connectionId, property: target.property };
    for (let at = 0; at < target.periods.length; at += ASKS_AT_ONCE) {
      await Promise.all(target.periods.slice(at, at + ASKS_AT_ONCE).map(async ({ searchType, grain, start }) => {
        const end = lastDayOf(grain, start);
        const span = { from: start > target.from ? start : target.from, to: end < target.newest ? end : target.newest };
        if (span.from > span.to) return;
        const answer = await searchesOf(ctx, google, searchType, span, country);
        if (!answer) {
          problems.push(`${country ?? "main"} ${searchType} ${grain.toLowerCase()} of ${start}`);
          return;
        }
        asks += answer.asks;
        const rows = answer.rows.map((row) => ({ key: row.key, clicks: row.clicks, impressions: row.impressions, position: row.impressions > 0 ? row.positionSum / row.impressions : 0 }));
        await ctx.runMutation(internal.searchConsoleChartRefill.replaceChartPeriod, {
          companyWebsiteId: target.companyWebsiteId,
          ...(country ? { country } : {}),
          searchType,
          grain,
          start,
          days: daysBetween(span.from, span.to),
          figures: periodFigures(rows, target.brandWords),
        });
        periods += 1;
      }));
    }
  }
  return { periods, asks, problems };
}

/** The same for one website, by hand (`npx convex run searchConsoleChartRefill:refillCharts '{"connectionId": …}'`). */
export const refillCharts = internalAction({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.object({ periods: v.number(), asks: v.number(), problems: v.array(v.string()) }),
  handler: async (ctx, args): Promise<{ periods: number; asks: number; problems: string[] }> => {
    const state = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId: args.connectionId });
    return await refillChartPeriods(ctx, args.connectionId, state?.countries ?? []);
  },
});
