import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { readMapView } from "./agentReads";
import { holdFor } from "./assistantReads";
import { hourGrid } from "./googleAnalyticsEventReads";
import { nameRows, readAnalyticsList } from "./googleAnalyticsReads";
import { connectionOf, countedOf, readFor } from "./googleAnalyticsRows";
import { readList } from "./searchConsoleLists";
import { calendarPeriodValidator, periodSpan, ukDay, type CalendarPeriod } from "./utils/calendarPeriods";
import { pathOf } from "./utils/hakkenTaskRules";
import { isTrackedHold } from "./utils/websitePairing";
import {
  GROUP_CHART_BY,
  GROUP_CHART_KINDS,
  groupsChartFrom,
  hoursGridFrom,
  searchGroupsChartFrom,
  type GroupChartBy,
  type GroupChartKind,
  type GroupMeasure,
  type GroupsChart,
  type GroupsView,
} from "./utils/assistantGroupCharts";

/**
 * Every chart of groups, read in one place (ask-hakken-every-chart-plan-2026-10-31.md, phase 1 and the gaps): Ask
 * Hakken's chart and a chart sent on its day read the same figures. From Google Analytics: the Conversions map by
 * channel, kind of page, device or country; landing pages from their own list; the hours of each weekday from the
 * list "When people convert" reads. From Search Console: searches, pages, countries or devices from the lists its
 * screens read. Saved data only: nothing is asked of Google.
 */

export type GroupsAsk = { kind: GroupChartKind; by: GroupChartBy; measure: GroupMeasure; event?: string; period: CalendarPeriod; source: "analytics" | "searchConsole" };
type Reader = { db: QueryCtx["db"] };

/** Landing pages a chart weighs: the busiest, enough for any kind. */
const MOST_PAGES = 25;
/** Search Console rows read for a chart: every one a website of any size keeps, for shares of the whole. */
const MOST_SEARCH_ROWS = 20_000;
const round1 = (value: number) => Math.round(value * 10) / 10;

/** The chart of groups asked for, for one of the company's own websites, or why there is none. */
export async function groupsChartOf(
  ctx: Reader,
  companyId: Id<"companies">,
  hold: { _id: Id<"companyWebsites">; host: string },
  ask: GroupsAsk,
): Promise<{ ok: true; chart: GroupsChart } | { ok: false; problem: string }> {
  const site = `/app/${ask.source === "searchConsole" ? "search-console" : "analytics"}/${hold._id}`;

  if (ask.source === "searchConsole") {
    if (!["query", "page", "country", "device"].includes(ask.by)) return { ok: false, problem: "From Search Console a chart is by search (query), page, country or device." };
    const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (!connection?.newestDay) return { ok: false, problem: `${hold.host} has no Search Console figures yet.` };
    const span = periodSpan(ask.period, ukDay(), connection.newestDay);
    if (!span) return { ok: false, problem: `Search Console hasn't sent any of that period's days yet for ${hold.host}.` };
    const list = await readList(ctx, hold._id, { searchType: "web", dimension: ask.by as "query" | "page" | "country" | "device", from: span.from, to: span.to, period: ask.period });
    if (list.live || list.preparing) return { ok: false, problem: "Search Console's figures for those dates are still being added up." };
    // A page by its address; a device as Google Analytics names it ("mobile"), so the screens word it the same way.
    const keyOf = (key: string) => (ask.by === "page" ? pathOf(key) : ask.by === "device" ? key.toLowerCase() : key);
    const rows = list.rows.slice(0, MOST_SEARCH_ROWS).map((row) => ({ key: keyOf(row.key), clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, previousClicks: row.previousClicks }));
    const screen = ask.by === "query" ? "keywords" : ask.by === "page" ? "pages" : "countries-and-devices";
    const measure = ask.measure === "impressions" ? "impressions" : "clicks";
    return searchGroupsChartFrom(rows, { kind: ask.kind, by: ask.by, measure, website: hold.host, period: ask.period, link: `${site}/${screen}` });
  }

  const measure = ask.measure === "clicks" ? "visits" : ask.measure === "impressions" ? "visits" : ask.measure;
  if (ask.by === "query") return { ok: false, problem: "Searches come from Search Console: ask with lookup search_console." };

  if (ask.by === "hour") {
    // The hours of each weekday, for one conversion: the one named, else a shop's purchase, else the busiest.
    const connection = await connectionOf(ctx, hold._id);
    if (!connection?.newestDay) return { ok: false, problem: `${hold.host} has no Google Analytics figures yet.` };
    const held = await readFor(ctx, hold._id, "eventHour", ask.period, "NOW", "");
    if (!held || held === "LIVE") return { ok: false, problem: "No times by hour are kept for those dates yet: they come with the next collection." };
    const counted = countedOf(connection).map((one) => one.eventName);
    const totals = counted.map((event) => ({ event, total: hourGrid(held.rows, event).times.flat().reduce((sum, count) => sum + count, 0) }));
    const event = ask.event ?? (totals.find((one) => one.event === "purchase" && one.total > 0) ?? [...totals].sort((a, b) => b.total - a.total)[0])?.event;
    if (!event) return { ok: false, problem: "That website counts no conversions." };
    if (!counted.includes(event)) return { ok: false, problem: `${event} is not one of the conversions this website counts: ${counted.join(", ")}.` };
    return hoursGridFrom(hourGrid(held.rows, event).times, { event, website: hold.host, period: ask.period, link: `${site}/events/event?key=${encodeURIComponent(event)}&period=${ask.period}` });
  }

  if (ask.by === "page") {
    // Landing pages, as their screen lists them: each one's visits, and the conversion named (a shop's purchase, else every one).
    if (ask.kind === "grid") return { ok: false, problem: "A grid lays conversions across groups: ask for one by channel, kind of page, device or country." };
    const connection = await connectionOf(ctx, hold._id);
    if (!connection?.newestDay) return { ok: false, problem: `${hold.host} has no Google Analytics figures yet.` };
    const counted = countedOf(connection).map((one) => one.eventName);
    const eventName = ask.event ?? (counted.includes("purchase") ? "purchase" : undefined);
    if (eventName && !counted.includes(eventName)) return { ok: false, problem: `${eventName} is not one of the conversions this website counts: ${counted.join(", ")}.` };
    const list = await readAnalyticsList(ctx, hold._id, { list: "landing", period: ask.period, device: "", ...(eventName ? { eventName } : {}), sort: "visits", direction: "desc" });
    if (list.live || list.preparing) return { ok: false, problem: "Landing pages for those dates come with the next collection." };
    const rows = await nameRows(ctx, hold._id, list.rows.slice(0, MOST_PAGES));
    const visits = rows.map((row) => ({ column: pathOf(row.label), visits: row.visits, ...(row.change !== null ? { visitsBefore: Math.round(row.visits / (1 + row.change)) } : {}) }));
    const view: GroupsView = {
      visits,
      conversions: [{
        event: eventName ?? "*",
        visitsThatDidIt: rows.reduce((sum, row) => sum + row.conversions, 0),
        by: rows.map((row, at) => ({
          column: visits[at].column,
          visitsThatDidIt: row.conversions,
          ...(row.conversionsBefore !== null ? { visitsThatDidItBefore: row.conversionsBefore } : {}),
          ratePercent: row.conversionRate !== null ? round1(row.conversionRate * 100) : null,
        })),
      }],
    };
    return groupsChartFrom(view, { kind: ask.kind, by: "page", measure, ...(eventName ? { event: eventName } : {}), website: hold.host, period: ask.period, link: `${site}/landing-pages?period=${ask.period}` });
  }

  const read = await readMapView({ db: ctx.db, companyId }, { siteId: hold._id, period: ask.period, device: "", columns: ask.by });
  if (!("visits" in read) || !read.visits) return { ok: false, problem: `${hold.host} has no Google Analytics figures for that period yet.` };
  return groupsChartFrom({ visits: read.visits, conversions: read.conversions }, {
    kind: ask.kind, by: ask.by, measure, ...(ask.event ? { event: ask.event } : {}), website: hold.host, period: ask.period, link: `${site}/conversions?period=${ask.period}`,
  });
}

/** Ask Hakken's chart of groups, for the conversation's company: a website it holds, never a competitor's. */
export const groupsChartInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    period: calendarPeriodValidator,
    kind: v.union(...GROUP_CHART_KINDS.map((kind) => v.literal(kind))),
    by: v.union(...GROUP_CHART_BY.map((by) => v.literal(by))),
    measure: v.union(v.literal("visits"), v.literal("conversions"), v.literal("conversionRate"), v.literal("clicks"), v.literal("impressions")),
    event: v.optional(v.string()),
    source: v.union(v.literal("analytics"), v.literal("searchConsole")),
  },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false as const, problem: found.problem };
    const hold = found.held.hold;
    const host = found.held.summary.host;
    if (isTrackedHold(hold)) return { ok: false as const, problem: `${args.source === "searchConsole" ? "Search Console" : "Google Analytics"} covers the company's own websites only, and ${host} is a competitor.` };
    const built = await groupsChartOf(ctx, args.companyId, { _id: hold._id, host }, args);
    return built.ok ? { ok: true as const, siteId: hold._id, host, chart: built.chart } : { ok: false as const, problem: built.problem };
  },
});
