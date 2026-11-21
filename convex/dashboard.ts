import { v } from "convex/values";
import { tenantQuery, effectiveModulesFor } from "./tenantFunctions";
import { MENU_FEATURES } from "./utils/coreModules";
import { companyHolds, type SiteReader } from "./siteAccess";
import { readOverview } from "./googleAnalyticsReads";
import { readChart } from "./googleAnalyticsChartReads";
import { connectionOf as consoleConnectionOf } from "./searchConsoleListSources";
import { readPerformance } from "./searchConsoleReads";
import { isShop } from "./utils/conversionSteps";
import { CALENDAR_PERIODS, calendarPeriodValidator, periodSpan, ukDay, type MenuPeriod } from "./utils/calendarPeriods";
import type { Id } from "./_generated/dataModel";

/**
 * The client Dashboard's four numbers (docs/plans/active/dashboard-way-1-plan-2026-11-21.md, "The one new read"):
 * Visits and Events (or Bought) from Google Analytics, Clicks and Impressions from Search Console, each with its days,
 * added up over the company's own websites, or for the one the Website menu picks.
 *
 * It reads only what each section has already saved, through the section's own reads (`readOverview`, `readChart`,
 * `readPerformance`), so the Dashboard and each section's page can never disagree. It never asks Google. A section
 * switched off for the company, or for everyone, is left out (null), so the read never throws for a company without it.
 */

const dayFigure = v.object({ day: v.string(), value: v.number() });
const measure = v.object({ now: v.number(), before: v.union(v.number(), v.null()), days: v.array(dayFigure) });

export const dashboardFiguresValidator = v.object({
  /** The websites added up: every own website, or the one asked for. */
  sites: v.array(v.id("companyWebsites")),
  /** Whether Google Analytics counts what's bought: a shop sees Bought where any other website sees Events. */
  shop: v.boolean(),
  analytics: v.union(v.null(), v.object({ visits: measure, done: measure })),
  searchConsole: v.union(v.null(), v.object({ clicks: measure, impressions: measure })),
});

export type DayFigure = { day: string; value: number };
export type Measure = { now: number; before: number | null; days: DayFigure[] };

/** Days from several websites, added up day by day, oldest first. */
export function addDays(lists: ReadonlyArray<readonly DayFigure[]>): DayFigure[] {
  const byDay = new Map<string, number>();
  for (const list of lists) for (const { day, value } of list) byDay.set(day, (byDay.get(day) ?? 0) + value);
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value }));
}

/** Several websites' figures for one measure, added up. "Before" is known only when every website knows it. */
export function addMeasures(list: readonly Measure[]): Measure | null {
  if (list.length === 0) return null;
  const befores = list.map((one) => one.before);
  return {
    now: list.reduce((sum, one) => sum + one.now, 0),
    before: befores.every((one) => one !== null) ? befores.reduce<number>((sum, one) => sum + (one ?? 0), 0) : null,
    days: addDays(list.map((one) => one.days)),
  };
}

export const dashboardFigures = tenantQuery({
  args: { period: calendarPeriodValidator, siteId: v.optional(v.id("companyWebsites")) },
  returns: dashboardFiguresValidator,
  handler: async (ctx, args) => {
    const empty = { sites: [] as Id<"companyWebsites">[], shop: false, analytics: null, searchConsole: null };
    if (!ctx.companyId) return empty;
    const company = await ctx.db.get(ctx.companyId);
    const on = new Set(await effectiveModulesFor(ctx, company));
    const own = (await companyHolds(ctx, ctx.companyId)).filter((one) => one.summary.relationship === "OWNED");
    const holds = args.siteId ? own.filter((one) => one.hold._id === args.siteId) : own;
    const reader: SiteReader = ctx;
    const period = args.period as MenuPeriod;

    const analytics = on.has(MENU_FEATURES.googleAnalytics) ? await addAnalytics(reader, holds.map((one) => one.hold._id), period) : null;
    const searchConsole = on.has(MENU_FEATURES.searchConsole) ? await addSearchConsole(reader, holds.map((one) => one.hold._id), period) : null;
    return {
      sites: holds.map((one) => one.hold._id),
      shop: analytics?.shop ?? false,
      analytics: analytics ? { visits: analytics.visits, done: analytics.done } : null,
      searchConsole,
    };
  },
});

async function addAnalytics(ctx: SiteReader, siteIds: readonly Id<"companyWebsites">[], period: MenuPeriod) {
  const visits: Measure[] = [];
  const conversions: Measure[] = [];
  const bought: Measure[] = [];
  let anyShop = false;
  for (const siteId of siteIds) {
    const overview = await readOverview(ctx, { siteId, period, device: "" });
    if (!overview.now) continue;
    const chart = await readChart(ctx, { siteId, period, device: "" });
    anyShop ||= isShop(undefined, overview.now.purchases, overview.before?.purchases);
    const points = chart.points ?? [];
    // What's bought each day is the "purchase" event, as Overview's Bought line counts it.
    const purchaseAt = (chart.events ?? []).indexOf("purchase");
    visits.push({ now: overview.now.visits, before: overview.before?.visits ?? null, days: points.map((point) => ({ day: point.day, value: point.visits })) });
    conversions.push({ now: overview.now.conversions, before: overview.before?.conversions ?? null, days: points.map((point) => ({ day: point.day, value: point.conversions })) });
    bought.push({ now: overview.now.purchases, before: overview.before?.purchases ?? null, days: points.map((point) => ({ day: point.day, value: purchaseAt < 0 ? 0 : point.events[purchaseAt] ?? 0 })) });
  }
  const addedVisits = addMeasures(visits);
  if (!addedVisits) return null;
  const done = addMeasures(anyShop ? bought : conversions)!;
  return { shop: anyShop, visits: addedVisits, done };
}

async function addSearchConsole(ctx: SiteReader, siteIds: readonly Id<"companyWebsites">[], period: MenuPeriod) {
  const clicks: Measure[] = [];
  const impressions: Measure[] = [];
  const today = ukDay();
  for (const siteId of siteIds) {
    const connection = await consoleConnectionOf(ctx, siteId);
    if (!connection?.newestDay) continue;
    const span = periodSpan(period, today, connection.newestDay);
    if (!span) continue;
    const performance = await readPerformance(ctx, { siteId, searchType: "web", from: span.from, to: span.to, period });
    if (!performance.totals) continue;
    clicks.push({
      now: performance.totals.clicks,
      before: performance.previous?.clicks ?? null,
      days: performance.days.map((day) => ({ day: day.day, value: day.clicks })),
    });
    impressions.push({
      now: performance.totals.impressions,
      before: performance.previous?.impressions ?? null,
      days: performance.days.map((day) => ({ day: day.day, value: day.impressions })),
    });
  }
  const addedClicks = addMeasures(clicks);
  return addedClicks ? { clicks: addedClicks, impressions: addMeasures(impressions)! } : null;
}

export const DASHBOARD_PERIODS = CALENDAR_PERIODS;
