import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { shiftDay } from "./searchConsoleDays";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { DAY_JOIN, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { blank, connectionOf, conversionsOf, countedOf, displayChannel, readLive, readSlot } from "./googleAnalyticsReads";

/**
 * What the Google Analytics charts read (docs/plans/active/google-analytics-plan.md
 * §5, GA35, §18.2): the website's figures a day, and each channel's visits a
 * day. Apart from `googleAnalyticsReads.ts` to keep each module inside its
 * size. Only the caller's own website (`requireMySite`).
 */

/** Days a chart reads from the days kept; longer spans read the long charts asked of Google weekly. */
const DAYS_CHARTED = 30;
/** Its records: a part a day, with room to spare. */
const CHART_RECORDS_READ = 100;

/**
 * The website's figures a day at a time over the span chosen, for one device
 * or every device: from the days kept (§4.3) for up to 30 days, from the long
 * chart asked of Google ready-made for the 90 days and 12 months. Each counted
 * event's own line comes with it, for Conversions' chart.
 */
export const analyticsChart = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
  returns: v.object({
    points: v.array(v.object({
      day: v.string(),
      visits: v.number(),
      engaged: v.number(),
      /** Page views (GA26): Overview's chart leads with them. */
      views: v.number(),
      conversions: v.number(),
      value: v.number(),
      events: v.array(v.number()),
    })),
    /** The counted events, in the order of each point's `events`. */
    events: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    const counted = connection ? countedOf(connection) : [];
    const events = counted.map((event) => event.eventName);
    if (!connection?.newestDay) return { points: [], events };
    const point = (day: string, row: ListRow) => {
      const { conversions, value } = conversionsOf(row, counted);
      return { day, visits: row.visits, engaged: row.engaged, views: row.views, conversions, value, events: events.map((event) => row.counts.get(event) ?? 0) };
    };
    // Another home country keeps no days: its short charts are ready-made too (§18.6.1).
    if (Number(args.period) <= DAYS_CHARTED && country === "") {
      const first = shiftDay(connection.newestDay, -(Number(args.period) - 1));
      const parts = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", holdId).eq("list", "total").eq("device", args.device).gte("day", first))
        .take(CHART_RECORDS_READ);
      return { points: parts.map((part) => point(part.day, unpackPart(part as PackedPart)[0] ?? blank(""))), events };
    }
    const series = await readSlot(ctx, holdId, slotKey("series", args.period, "NOW", args.device, country));
    return { points: (series?.rows ?? []).map((row) => point(row.key, row)), events };
  },
});

/** Channels drawn as lines of their own on Channels' chart; the rest are one line, "everything else" (§18.2 board 16). */
const CHANNEL_LINES = 4;

/** The name a channel chart asked of Google live is held under: another home country's ends with its code. */
export function channelSeriesAsk(period: string, from: string, to: string, device: string, country = ""): string {
  return `channelSeries|${period}|${from}|${to}|${device}${country ? `|${country}` : ""}`;
}

/** A day and a channel's key, as one key of a live channel chart's rows (`googleAnalyticsLists.ts`). */
export { DAY_JOIN };

/**
 * Each channel's visits a day (GA35; §18.2 board 16): the four channels with
 * the most visits a line each, the rest one line. From the days kept for the
 * main home country's 7 and 30 days; for longer spans, or another home
 * country, which keep no channel days, asked of Google when the screen opens
 * (`askGoogleAnalyticsLive`, `chart: "channel"`) and held until the next
 * collection — `live` until it has been.
 */
export const analyticsChannelChart = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
  returns: v.object({
    live: v.boolean(),
    /** The channels with lines of their own, the most visits first; the last line is everything else when there is any. */
    channels: v.array(v.string()),
    rest: v.boolean(),
    points: v.array(v.object({ day: v.string(), visits: v.array(v.number()) })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    const none = { live: false, channels: [] as string[], rest: false, points: [] as Array<{ day: string; visits: number[] }> };
    if (!connection?.newestDay) return none;
    const byDay = new Map<string, Map<string, number>>();
    const add = (day: string, rows: readonly ListRow[]) => {
      const channels = byDay.get(day) ?? new Map<string, number>();
      for (const row of rows) channels.set(displayChannel(row.key), (channels.get(displayChannel(row.key)) ?? 0) + row.visits);
      byDay.set(day, channels);
    };
    if (Number(args.period) <= DAYS_CHARTED && country === "") {
      const first = shiftDay(connection.newestDay, -(Number(args.period) - 1));
      const parts = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", holdId).eq("list", "channel").eq("device", args.device).gte("day", first))
        .take(CHART_RECORDS_READ);
      for (const part of parts) add(part.day, unpackPart(part as PackedPart));
    } else {
      const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
      if (!total) return none;
      const held = await readLive(ctx, holdId, channelSeriesAsk(args.period, total.from, total.to, args.device, country));
      if (!held) return { ...none, live: true };
      for (const row of held.rows) {
        const at = row.key.indexOf(DAY_JOIN);
        if (at > 0) add(row.key.slice(0, at), [{ ...row, key: row.key.slice(at + DAY_JOIN.length) }]);
      }
    }
    const totals = new Map<string, number>();
    for (const channels of byDay.values()) for (const [channel, visits] of channels) totals.set(channel, (totals.get(channel) ?? 0) + visits);
    const ranked = [...totals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([channel]) => channel);
    const lines = ranked.slice(0, CHANNEL_LINES);
    const rest = ranked.length > CHANNEL_LINES;
    const days = [...byDay.keys()].sort();
    return {
      live: false,
      channels: lines,
      rest,
      points: days.map((day) => {
        const channels = byDay.get(day)!;
        const own = lines.map((channel) => channels.get(channel) ?? 0);
        const others = [...channels.entries()].filter(([channel]) => !lines.includes(channel)).reduce((sum, [, visits]) => sum + visits, 0);
        return { day, visits: rest ? [...own, others] : own };
      }),
    };
  },
});
