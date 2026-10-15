import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { askLive } from "./searchConsoleReads";
import { historyLimitDay, shiftDay } from "./searchConsoleDays";
import { kindsHeld } from "./searchConsoleRollups";
import { searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { LISTS_OF } from "./searchConsoleApi";
import { consoleLimitsOf } from "./searchConsoleLimits";
import { holdBrandNames } from "./holdProfiles";
import { chartReach, daysBetween } from "./searchConsolePeriods";
import { firstWeekKept, monthStart, stepEnd, weekStart } from "./utils/searchConsolePacks";
import { bandOf, isBrand } from "./utils/searchConsoleViews";

/**
 * A website's day totals fetched back to Google's sixteen-month line, once
 * (docs/plans/active/insights-intelligence-plan.md phase 9; Anthony,
 * 2026-10-12: "go back 16 months … it's free to get"). Every Search Console
 * screen charted from the website's days — Performance, Google updates, Rich
 * results — reads back to there, not to the day collection began. Google asks
 * nothing for it. One ask a kind of result, for the website's main home
 * country (`askLive` filters to it); a day the collection already holds is
 * never written over. The connection's `daysFrom` says where the days begin;
 * `oldestDay` keeps saying where collection began, which New and lost and
 * Volatility count from.
 */

/** Days written a call: a kind's sixteen months in a few writes. */
const DAYS_A_WRITE = 120;

const dayRowValidator = v.object({ day: v.string(), clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() });

/** What a history fetch needs: the connection, while it is connected and collected. */
export const historyTarget = internalQuery({
  /** `again`: for the charts' months alone, once the days are in. */
  args: { connectionId: v.id("searchConsoleConnections"), again: v.optional(v.boolean()) },
  returns: v.union(v.null(), v.object({
    connectionId: v.id("searchConsoleConnections"),
    companyWebsiteId: v.id("companyWebsites"),
    property: v.string(),
    oldestDay: v.string(),
    types: v.array(searchTypeValidator),
  })),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED" || !connection.property || !connection.oldestDay || connection.clearing || (connection.daysFrom && !args.again)) return null;
    return {
      connectionId: connection._id,
      companyWebsiteId: connection.companyWebsiteId,
      property: connection.property,
      oldestDay: connection.oldestDay,
      types: await kindsHeld(ctx, connection.companyWebsiteId),
    };
  },
});

/** One kind of result's days before collection began, for the main country or one kept ready: each written where none is held. */
export const writeHistoryDays = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), property: v.string(), country: v.optional(v.string()), searchType: searchTypeValidator, rows: v.array(dayRowValidator), fetchedAt: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property || connection.clearing) return 0;
    let written = 0;
    for (const row of args.rows) {
      const held = await ctx.db
        .query("searchConsoleDays")
        .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType).eq("day", row.day))
        .first();
      if (held) continue;
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: connection.companyWebsiteId, ...(args.country ? { country: args.country } : {}), searchType: args.searchType, ...row, fetchedAt: args.fetchedAt });
      written += 1;
    }
    return written;
  },
});

/** The days now begin at Google's line: said once every kind is in. */
export const markDaysFrom = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), property: v.string(), daysFrom: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property || connection.clearing) return null;
    await ctx.db.patch(connection._id, { daysFrom: args.daysFrom, backfilledAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

/** Fetch the days before collection began, back to Google's line; none when there is nothing older to fetch. */
export const fetchHistoryDays = internalAction({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.object({ written: v.number(), problems: v.array(v.string()) }),
  handler: async (ctx, args): Promise<{ written: number; problems: string[] }> => {
    const target = await ctx.runQuery(internal.searchConsoleHistoryDays.historyTarget, { connectionId: args.connectionId });
    if (!target) return { written: 0, problems: [] };
    const from = historyLimitDay(Date.now());
    const to = shiftDay(target.oldestDay, -1);
    if (from > to) {
      await ctx.runMutation(internal.searchConsoleHistoryDays.markDaysFrom, { connectionId: target.connectionId, property: target.property, daysFrom: target.oldestDay });
      return { written: 0, problems: [] };
    }
    const problems: string[] = [];
    let written = 0;
    const fetchedAt = Date.now();
    for (const searchType of target.types) {
      const answer = await askLive(ctx, { connectionId: target.connectionId, property: target.property }, { startDate: from, endDate: to, type: searchType, dimensions: ["date"] });
      if (!answer.ok) {
        problems.push(`${searchType}: ${answer.problem}`);
        continue;
      }
      const rows = answer.rows
        .map((row) => ({ day: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))
        .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && row.day >= from && row.day <= to);
      for (let start = 0; start < rows.length; start += DAYS_A_WRITE) {
        written += await ctx.runMutation(internal.searchConsoleHistoryDays.writeHistoryDays, { connectionId: target.connectionId, property: target.property, searchType, rows: rows.slice(start, start + DAYS_A_WRITE), fetchedAt });
      }
    }
    problems.push(...await fillChartPeriods(ctx, target, from));
    // Every kind in: the days begin at Google's line. A kind Google refused is asked again on the next collection.
    if (problems.length === 0) await ctx.runMutation(internal.searchConsoleHistoryDays.markDaysFrom, { connectionId: target.connectionId, property: target.property, daysFrom: from });
    return { written, problems };
  },
});


type Target = { connectionId: Id<"searchConsoleConnections">; property: string; oldestDay: string; types: SearchType[] };

/** The Position bands and Brand charts' weeks and months before collection began, inside their reach: one ask a period and kind. */
async function fillChartPeriods(ctx: ActionCtx, target: Target, from: string): Promise<string[]> {
  const problems: string[] = [];
  const charts = await ctx.runQuery(internal.searchConsoleHistoryDays.chartFillTarget, { connectionId: target.connectionId });
  if (charts) {
    for (const searchType of target.types.filter((type) => LISTS_OF[type].includes("pair"))) {
      const periods = chartPeriodsToFill(from, charts.reach, target.oldestDay, charts.newest);
      for (const { grain, start } of periods.filter((one) => searchType !== "web" || !charts.held.includes(`${one.grain} ${one.start}`))) {
        const end = stepEnd(start, grain === "WEEK" ? "week" : "month");
        const answer = await askLive(ctx, { connectionId: target.connectionId, property: target.property }, { startDate: start, endDate: end, type: searchType, dimensions: ["query"] });
        if (!answer.ok) {
          problems.push(`${searchType} ${grain} ${start}: ${answer.problem}`);
          continue;
        }
        const rows = answer.rows.map((row) => ({ key: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, position: row.position }));
        await ctx.runMutation(internal.searchConsoleHistoryDays.writeChartPeriod, {
          connectionId: target.connectionId, property: target.property, searchType, grain, start, days: daysBetween(start, end), figures: periodFigures(rows, charts.brandWords),
        });
      }
    }
  }
  return problems;
}

/** The charts' weeks and months alone, for a website whose days were fetched before they were filled. */
export const fetchChartPeriods = internalAction({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.array(v.string()),
  handler: async (ctx, args): Promise<string[]> => {
    const target = await ctx.runQuery(internal.searchConsoleHistoryDays.historyTarget, { connectionId: args.connectionId, again: true });
    return target ? await fillChartPeriods(ctx, target, historyLimitDay(Date.now())) : [];
  },
});

/**
 * A week's or month's Position bands and Brand figures from Google's searches
 * in it (phase 9): each search by its place's band, and its clicks as brand
 * or the rest. Past the top 20 a search counts only when clicked, as the
 * collection keeps a search there only when clicked (or tracked), so the
 * months before collection read like the months after.
 */
export function periodFigures(rows: ReadonlyArray<{ key: string; clicks: number; impressions: number; position: number }>, brandWords: readonly string[]) {
  const out = { top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0 };
  for (const row of rows) {
    if (row.impressions > 0) {
      const band = bandOf(row.position);
      if (band === "1-3") out.top3 += 1;
      else if (band === "4-10") out.top10 += 1;
      else if (band === "11-20") out.top20 += 1;
      else if (row.clicks > 0) out.rest += 1;
    }
    if (isBrand(row.key, brandWords)) out.brandClicks += row.clicks;
    else out.otherClicks += row.clicks;
  }
  return out;
}

/**
 * The charts' weeks and months to fill: whole ones after Google's line,
 * inside the charts' reach, before the week or month collection began in —
 * which collection builds itself. Weeks only inside the six months kept as
 * weeks (`firstWeekKept`); months all the way.
 */
export function chartPeriodsToFill(googleFrom: string, reach: string, oldestDay: string, newest: string): Array<{ grain: "WEEK" | "MONTH"; start: string }> {
  const periods: Array<{ grain: "WEEK" | "MONTH"; start: string }> = [];
  const latest = (...days: string[]) => [...days].sort().pop()!;
  const weekFrom = latest(googleFrom === weekStart(googleFrom) ? googleFrom : shiftDay(weekStart(googleFrom), 7), reach, firstWeekKept(newest));
  for (let week = weekStart(weekFrom) === weekFrom ? weekFrom : shiftDay(weekStart(weekFrom), 7); week < weekStart(oldestDay); week = shiftDay(week, 7)) {
    periods.push({ grain: "WEEK", start: week });
  }
  const after = (month: string) => monthStart(shiftDay(stepEnd(month, "month"), 1));
  for (let month = latest(googleFrom === monthStart(googleFrom) ? googleFrom : after(monthStart(googleFrom)), monthStart(reach)); month < monthStart(oldestDay); month = after(month)) {
    periods.push({ grain: "MONTH", start: month });
  }
  return periods;
}

/** What the charts' fill needs: their reach, the newest day, the website's brand words, and the weeks and months already held, for the main country or one kept ready. */
export const chartFillTarget = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections"), country: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({ reach: v.string(), newest: v.string(), brandWords: v.array(v.string()), held: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    return connection ? await chartFillOf(ctx, connection, args.country) : null;
  },
});

/** The charts' fill's needs for one scope, read by `chartFillTarget` and the run's 16-month fill (`searchConsoleHistoryFill.ts`). */
export async function chartFillOf(ctx: { db: QueryCtx["db"] }, connection: Doc<"searchConsoleConnections">, country: string | undefined) {
  const hold = await ctx.db.get(connection.companyWebsiteId);
  const newest = country === undefined ? connection.newestDay : connection.countriesHeld?.find((held) => held.country === country)?.newestDay;
  if (!newest || !hold) return null;
  const { chartWeeks } = await consoleLimitsOf(ctx, hold);
  const rows = await ctx.db.query("searchConsoleWeeks")
    .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", hold._id).eq("country", country).eq("searchType", "web"))
    .take(MONTH_ROWS_READ);
  return {
    reach: chartReach(newest, chartWeeks),
    newest,
    brandWords: (await holdBrandNames(ctx, hold._id)).map((brand) => brand.name),
    // Rows built before 2026-10-04 carry no grain: they are weeks.
    held: rows.filter((row) => row.grain !== "DAY").map((row) => `${row.grain ?? "WEEK"} ${row.week}`),
  };
}

/** One week's or month's chart row, written where none is held: one collected is never written over. */
export const writeChartPeriod = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"), property: v.string(), country: v.optional(v.string()), searchType: searchTypeValidator, grain: v.union(v.literal("WEEK"), v.literal("MONTH")), start: v.string(), days: v.number(),
    figures: v.object({ top3: v.number(), top10: v.number(), top20: v.number(), rest: v.number(), brandClicks: v.number(), otherClicks: v.number() }),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property || connection.clearing) return false;
    const held = await ctx.db.query("searchConsoleWeeks")
      .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType).eq("week", args.start))
      .take(3);
    if (held.some((row) => (row.grain ?? "WEEK") === args.grain)) return false;
    await ctx.db.insert("searchConsoleWeeks", { companyWebsiteId: connection.companyWebsiteId, ...(args.country ? { country: args.country } : {}), searchType: args.searchType, grain: args.grain, week: args.start, days: args.days, ...args.figures, builtAt: Date.now() });
    return true;
  },
});

/** Rows of a kind's chart read: its days, weeks and months, more than it holds. */
const MONTH_ROWS_READ = 200;
