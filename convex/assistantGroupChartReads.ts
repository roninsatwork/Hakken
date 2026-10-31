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
import { ANALYTICS_CHART_MEASURES, type AnalyticsChartMeasure } from "./utils/assistantCharts";
import { isTrackedHold } from "./utils/websitePairing";
import { beforeClicksOf, readList as readBingList, shownRows as shownBingRows } from "./bingWebmasterReads";
import { readClarityPeriod, type ClarityPeriodRead } from "./clarity";
import { classifierFor } from "./googleAnalyticsChannelReads";
import { addUpBy, unpackTotals } from "./utils/clarityPacks";
import { CLARITY_FEW_VISITS, measuresOf, type ClarityTotals, type ClarityTotalsRow } from "./utils/clarityRows";
import { findMySite, myRivals } from "./siteAccess";
import { latestBands, latestFigures, linkingWebsitesOf, searchTotalOf } from "./siteFigures";
import {
  CLARITY_GROUP_MEASURES,
  GROUP_CHART_BY,
  GROUP_CHART_KINDS,
  VISIBILITY_GROUP_MEASURES,
  clarityGroupsChartFrom,
  groupMeasureValidator,
  groupSourceValidator,
  groupsChartFrom,
  hoursGridFrom,
  searchGroupsChartFrom,
  visibilityGroupsChartFrom,
  type ClarityGroupLine,
  type ClarityGroupMeasure,
  type GroupChartBy,
  type GroupChartKind,
  type GroupMeasure,
  type GroupSource,
  type GroupsChart,
  type GroupsView,
  type VisibilityGroupMeasure,
  type VisibilityWebsite,
} from "./utils/assistantGroupCharts";

/**
 * Every chart of groups, read in one place (ask-hakken-every-chart-plan-2026-10-31.md, phase 1 and the gaps): Ask
 * Hakken's chart and a chart sent on its day read the same figures. From Google Analytics: the Conversions map by
 * channel, kind of page, device or country; landing pages from their own list; the hours of each weekday from the
 * list "When people convert" reads. From Search Console: searches, pages, countries or devices from the lists its
 * screens read. From Bing: its searches and pages, from Bing's own lists. From Clarity: devices, pages, kinds of page,
 * sources and browsers, from its ready-made periods. From Visibility: the website against the competitors it is
 * watched with, and its searches by Google position, at the newest check. Saved data only: nothing is asked of
 * Google, Bing, Clarity or the supplier (Anthony, 2026-10-29: a chart, like Insights, reads what the sections saved).
 */

export type GroupsAsk = { kind: GroupChartKind; by: GroupChartBy; measure: GroupMeasure; event?: string; period: CalendarPeriod; source: GroupSource };
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

  if (ask.source === "bing") return await bingChartOf(ctx, hold, ask);
  if (ask.source === "clarity") return await clarityChartOf(ctx, hold, ask);
  if (ask.source === "visibility") return await visibilityChartOf(ctx, companyId, hold, ask);

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

  const measure: AnalyticsChartMeasure = (ANALYTICS_CHART_MEASURES as readonly string[]).includes(ask.measure) ? ask.measure as AnalyticsChartMeasure : "visits";
  if (ask.by === "query") return { ok: false, problem: "Searches come from Search Console: ask with lookup search_console." };
  if (ask.by === "source" || ask.by === "browser") return { ok: false, problem: "Sources and browsers are Clarity's: ask with lookup clarity." };
  if (ask.by === "website" || ask.by === "position") return { ok: false, problem: "The website against its competitors, and its positions, are Visibility's: ask with lookup visibility." };

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

type Hold = { _id: Id<"companyWebsites">; host: string };
type Built = { ok: true; chart: GroupsChart } | { ok: false; problem: string };

/** Bing rows a chart names at most, the busiest by clicks and by times shown: every other row is counted, unnamed. */
const BING_NAMED = 30;

/** Bing's searches or pages over the period, from the lists its screens read, each set against the period before. */
async function bingChartOf(ctx: Reader, hold: Hold, ask: GroupsAsk): Promise<Built> {
  if (ask.by !== "query" && ask.by !== "page") return { ok: false, problem: "From Bing a chart is by search (query) or page." };
  const connection = await ctx.db.query("bingConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
  if (!connection?.newestWeek) return { ok: false, problem: `${hold.host} has no Bing figures yet.` };
  const list = ask.by;
  const measure = ask.measure === "impressions" ? "impressions" : "clicks";
  const read = await readBingList(ctx, hold._id, { list, period: ask.period, sort: measure });
  if (read.from === null) return { ok: false, problem: "Bing's lists for those dates are built when its next week of figures lands." };
  // Only the rows a chart can show are named: the busiest by clicks and by times shown.
  const byImpressions = [...read.rows].sort((a, b) => b.impressions - a.impressions).slice(0, BING_NAMED);
  const picked = [...new Map([...read.rows.slice(0, BING_NAMED), ...byImpressions].map((row) => [row.number, row])).values()];
  const shown = await shownBingRows(ctx, hold._id, list, picked, read.names);
  const names = new Map(picked.map((row, at) => [row.number, list === "page" ? pathOf(shown[at].key) : shown[at].key]));
  // The period before only where Bing kept any of it: none kept is no comparison, never every row at nought.
  const kept = measure === "clicks" ? await beforeClicksOf(ctx, hold._id, list, ask.period) : null;
  const before = kept && kept.size > 0 ? kept : null;
  const rows = read.rows.map((row) => ({
    key: names.get(row.number) ?? "", clicks: row.clicks, impressions: row.impressions, ctr: row.ctr ?? 0, previousClicks: before ? before.get(row.number) ?? 0 : null,
  }));
  return searchGroupsChartFrom(rows, {
    kind: ask.kind, by: ask.by, measure, website: hold.host, period: ask.period, look: "bingGroups",
    link: `/app/bing-webmaster/${hold._id}/${list === "page" ? "pages" : "keywords"}?period=${ask.period}`,
  });
}

/** Clarity's devices as Google Analytics names them, so the screens word a chart's devices one way. */
const CLARITY_DEVICES: Record<string, string> = { PC: "desktop", Mobile: "mobile", Tablet: "tablet" };

/** A Clarity group's figures from its totals, as Clarity's screens work them out. */
function clarityLine(name: string, totals: ClarityTotals): ClarityGroupLine {
  const measures = measuresOf(totals);
  return {
    name, visits: measures.visits, scroll: measures.scroll,
    quickBacks: measures.shares.quickBack, rageClicks: measures.shares.rage, deadClicks: measures.shares.dead, errors: measures.shares.errors,
  };
}

/** Clarity's devices, pages, kinds of page, sources or browsers over the period, each set against the period before. */
async function clarityChartOf(ctx: Reader, hold: Hold, ask: GroupsAsk): Promise<Built> {
  if (!["device", "page", "kind", "source", "browser"].includes(ask.by)) return { ok: false, problem: "From Clarity a chart is by device, page, kind (of page), source or browser." };
  if (ask.measure !== "visits" && !(CLARITY_GROUP_MEASURES as readonly string[]).includes(ask.measure)) return { ok: false, problem: `From Clarity a chart shows visits or ${CLARITY_GROUP_MEASURES.join(", ")}.` };
  const connection = await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
  if (!connection?.newestDay) return { ok: false, problem: `${hold.host} has no Clarity figures yet.` };
  const kind = ask.by === "source" ? "SOURCES" : ask.by === "browser" ? "BROWSERS" : undefined;
  const withPages = ask.by === "page" || ask.by === "kind";
  const now = await readClarityPeriod(ctx, hold._id, ask.period, { ...(kind ? { kind } : {}), withPages });
  if (!now) return { ok: false, problem: "Clarity's figures for those dates are worked out each morning: none are kept for them yet." };
  // Like is set against like: the period before only when Clarity recorded as many of its days.
  const then = await readClarityPeriod(ctx, hold._id, ask.period, { ...(kind ? { kind } : {}), withPages, before: true });
  const before = then && then.first.days >= now.first.days ? then : null;
  const classifier = ask.by === "kind" ? await classifierFor(ctx, hold._id) : null;
  const kindName = (address: string) => {
    const one = classifier!.kindOf(address);
    const named = classifier!.nameOf(one) ?? one.toLowerCase().replace(/_/g, " ");
    return named.charAt(0).toUpperCase() + named.slice(1);
  };
  const keyOf = (row: ClarityTotalsRow): string | null => ask.by === "device" ? CLARITY_DEVICES[row.device] ?? row.device.toLowerCase()
    : ask.by === "page" ? row.page ?? null
      : ask.by === "kind" ? (row.page ? kindName(row.page) : null)
        : row.split ?? null;
  const linesOf = (read: ClarityPeriodRead) => [...addUpBy(withPages ? read.pages : unpackTotals(read.first.site), keyOf)].map(([name, totals]) => clarityLine(name, totals));
  const beforeLines = before ? new Map(linesOf(before).map((line) => [line.name, line])) : null;
  return clarityGroupsChartFrom(linesOf(now), beforeLines, {
    kind: ask.kind, by: ask.by, measure: ask.measure as "visits" | ClarityGroupMeasure, website: hold.host, period: ask.period, trusted: CLARITY_FEW_VISITS,
    link: `/app/clarity/${hold._id}${withPages ? "/pages" : ""}?period=${ask.period}`,
  });
}

/**
 * Visibility's figures at the newest check: the website and the competitors it is watched with, as Side by side
 * reads them (`siteCompetitors.marketMap`), each measured in the website's own market; or its searches by position.
 */
async function visibilityChartOf(ctx: Reader, companyId: Id<"companies">, hold: Hold, ask: GroupsAsk): Promise<Built> {
  if (ask.by !== "website" && ask.by !== "position") return { ok: false, problem: "From Visibility a chart is by website (the website against its competitors) or position (its searches by Google position)." };
  const measure = (VISIBILITY_GROUP_MEASURES as readonly string[]).includes(ask.measure) ? ask.measure as VisibilityGroupMeasure : "estimatedVisitors";
  const site = await findMySite({ db: ctx.db, companyId }, hold._id);
  if (!site) return { ok: false, problem: "That website is not one this company holds." };
  const group = ask.by === "position" ? [site.website] : [site.website, ...(await myRivals(ctx, site)).map((rival) => rival.website)];
  // Widened by hand: set inside the callbacks below, which narrowing cannot see.
  let asOf = null as string | null;
  const websites: VisibilityWebsite[] = await Promise.all(group.map(async (website) => {
    const latest = await latestFigures(ctx, website._id, site.place);
    if (website._id === site.website._id) asOf = latest.metrics?.day ?? latest.ranking?.day ?? null;
    const bands = latestBands(latest) ?? null;
    return {
      host: website.displayHost,
      estimatedVisitors: latest.metrics?.estimatedTraffic ?? null,
      searches: searchTotalOf(latest),
      topThree: bands ? bands.p01_03 : null,
      linkingWebsites: linkingWebsitesOf(latest.links),
      bands: bands ? { p01_03: bands.p01_03, p04_10: bands.p04_10, p11_20: bands.p11_20, p21_50: bands.p21_50, p51_up: bands.p51_up } : null,
    };
  }));
  return visibilityGroupsChartFrom(websites, {
    kind: ask.kind, by: ask.by, measure, website: site.website.displayHost, asOf,
    link: `/app/sites/${hold._id}${ask.by === "website" ? "/competitors" : "/keywords"}`,
  });
}

/**
 * Ask Hakken's chart of groups, for the conversation's company: a website it holds. Google Analytics, Search Console,
 * Bing and Clarity cover its own websites alone; Visibility charts a competitor's too, as its screens do.
 */
export const groupsChartInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    website: v.string(),
    period: calendarPeriodValidator,
    kind: v.union(...GROUP_CHART_KINDS.map((kind) => v.literal(kind))),
    by: v.union(...GROUP_CHART_BY.map((by) => v.literal(by))),
    measure: groupMeasureValidator,
    event: v.optional(v.string()),
    source: groupSourceValidator,
  },
  handler: async (ctx, args) => {
    const found = await holdFor(ctx, args.companyId, args.website);
    if ("problem" in found) return { ok: false as const, problem: found.problem };
    const hold = found.held.hold;
    const host = found.held.summary.host;
    const sectionName = { analytics: "Google Analytics", searchConsole: "Search Console", bing: "Bing", clarity: "Clarity", visibility: "Visibility" }[args.source];
    if (isTrackedHold(hold) && args.source !== "visibility") return { ok: false as const, problem: `${sectionName} covers the company's own websites only, and ${host} is a competitor. Its figures against the company's are in Visibility.` };
    const built = await groupsChartOf(ctx, args.companyId, { _id: hold._id, host }, args);
    return built.ok ? { ok: true as const, siteId: hold._id, host, chart: built.chart } : { ok: false as const, problem: built.problem };
  },
});
