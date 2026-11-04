import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { slotKey } from "./googleAnalyticsLists";
import { addInto, blank, connectionOf, conversionsOf, countedOf, readSlot } from "./googleAnalyticsRows";
import { daysIn } from "./searchConsoleDays";
import { readDayPoints } from "./googleAnalyticsHistory";
import { readListPage } from "./googleAnalyticsReads";

/**
 * A usual half hour on the website, for Live's eye (ask-hakken-every-chart-page-plan-2026-11-03.md, decision 3: Anthony,
 * 2026-11-03, "Yes, write one"): last month's people, views, visits and conversions as Hakken keeps them day by day,
 * each divided by the half hours in the month, and the share of last month's views each of its busiest pages had, by
 * its title as Live names pages. Worked out from saved figures only: Live asks Google each minute for right now, and
 * this never asks Google anything. People are each day's own, added up (a month's people counted once would be fewer),
 * so "a usual half hour" is a guide, not a count; it is the same at 3am as at noon, as no hour of the day is kept.
 */

/** The month a usual half hour is worked out from: the last whole calendar month, as the date menu names it. */
const USUAL_PERIOD = "lastMonth" as const;
/** Half hours in a day. */
const HALF_HOURS = 48;
/** Last month's busiest pages whose share of views Live's eye may set beside a page's share of the people now. */
const USUAL_PAGES = 50;

export const analyticsLiveUsual = tenantQuery({
  args: { siteId: v.id("companyWebsites"), device: v.string() },
  returns: v.union(v.null(), v.object({
    from: v.string(),
    to: v.string(),
    /** Each figure in a usual half hour of the month: last month's total over its half hours, one decimal. */
    people: v.number(),
    visits: v.number(),
    views: v.number(),
    conversions: v.number(),
    /** Every device's month, where the device chosen has none kept yet. */
    everyDevice: v.boolean(),
    pages: v.array(v.object({ title: v.string(), viewsShare: v.number() })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay) return null;
    const country = await keptCountry(ctx, site.hold, undefined);
    const own = await readSlot(ctx, holdId, slotKey("total", USUAL_PERIOD, "NOW", args.device, country));
    const held = own ?? (args.device !== "" ? await readSlot(ctx, holdId, slotKey("total", USUAL_PERIOD, "NOW", "", country)) : null);
    if (!held) return null;
    const total = blank("");
    for (const row of held.rows) addInto(total, row);
    // People a day, added up: the month's own row counts a person once in the month, not once in each half hour.
    const days = await readDayPoints(ctx, connection, "total", own ? args.device : "", held.from, held.to, country);
    const people = days ? days.reduce((sum, day) => sum + day.rows.reduce((one, row) => one + row.people, 0), 0) : total.people;
    const halfHours = daysIn(held.from, held.to) * HALF_HOURS;
    if (halfHours <= 0) return null;
    const each = (count: number) => Math.round((count / halfHours) * 10) / 10;
    // The busiest pages by views, titled as Live names them (Google's page title), each its share of the month's views.
    const pages = await readListPage(ctx, { siteId: args.siteId, list: "page", period: USUAL_PERIOD, device: own ? args.device : "", sort: "views", direction: "desc", page: 1, rows: USUAL_PAGES });
    const byTitle = new Map<string, number>();
    for (const row of pages.rows) if (row.title && total.views > 0) byTitle.set(row.title, (byTitle.get(row.title) ?? 0) + row.views);
    return {
      from: held.from,
      to: held.to,
      people: each(people),
      visits: each(total.visits),
      views: each(total.views),
      conversions: each(conversionsOf(total, countedOf(connection)).conversions),
      everyDevice: !own && args.device !== "",
      pages: [...byTitle.entries()].map(([title, views]) => ({ title, viewsShare: views / total.views })),
    };
  },
});
