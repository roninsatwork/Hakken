import { v, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { shiftDay } from "./searchConsoleDays";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { UNTAGGED, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { blank, connectionOf, conversionsOf, countedOf, displayChannel, readSlot } from "./googleAnalyticsReads";
import { merged, readChannelPoints, readDayPoints } from "./googleAnalyticsHistory";
import { coverageOf } from "./googleAnalyticsCoverage";
import { dayDevice } from "./utils/analyticsHistory";

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

const analyticsChartArgs = { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

/**
 * The website's figures a day at a time over the span chosen, for one device
 * or every device: from the days kept (§4.3) for up to 30 days, from the long
 * chart asked of Google ready-made for the 90 days and 12 months. Each counted
 * event's own line comes with it, for Conversions' chart.
 */
export const analyticsChart = tenantQuery({
  args: analyticsChartArgs,
  returns: v.object({
    points: v.array(v.object({
      day: v.string(),
      /** A week's or month's last day: the past beyond 90 days is held by week, then month (SF2b). */
      lastDay: v.optional(v.string()),
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
  handler: async (ctx, args) => await readChart(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readChart(ctx: SiteReader, args: ObjectType<typeof analyticsChartArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const counted = connection ? countedOf(connection) : [];
  const events = counted.map((event) => event.eventName);
  if (!connection?.newestDay) return { points: [], events };
  const point = (day: string, row: ListRow, lastDay?: string) => {
    const { conversions, value } = conversionsOf(row, counted);
    return { day, ...(lastDay && lastDay !== day ? { lastDay } : {}), visits: row.visits, engaged: row.engaged, views: row.views, conversions, value, events: events.map((event) => row.counts.get(event) ?? 0) };
  };
  // The website's totals stored a day, then a week, then a month (ga-stored-figures-plan.md SF12): any dates.
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
  // Another home country's own days, kept beside the main one's (SF7).
  const held = total ? await readDayPoints(ctx, connection, "total", args.device, total.from, total.to, country) : null;
  if (held) return { points: held.map((one) => point(one.start, merged(one.rows)[0] ?? blank(""), one.end)), events };
  const newest = coverageOf(connection, country).newestDay;
  if (Number(args.period) <= DAYS_CHARTED && newest) {
    const first = shiftDay(newest, -(Number(args.period) - 1));
    const parts = await ctx.db
      .query("googleAnalyticsDays")
      .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", holdId).eq("list", "total").eq("device", dayDevice(args.device, country)).gte("day", first))
      .take(CHART_RECORDS_READ);
    return { points: parts.map((part) => point(part.day, unpackPart(part as PackedPart)[0] ?? blank(""))), events };
  }
  // Past what is held: the minutes before a new website's two years are filled.
  return { points: [], events };
}

/** Channels drawn as lines of their own on Channels' chart; the rest are one line, "everything else" (§18.2 board 16). */
const CHANNEL_LINES = 4;


/**
 * Each channel's visits a day (GA35; §18.2 board 16): the four channels with
 * the most visits a line each, the rest one line. From each home country's
 * channels kept a day, then a week, then a month (ga-stored-figures-plan.md
 * SF2, SF7) — `live` while the dates reach past what is held, the minutes
 * before a new website's two years are filled; nothing is asked of Google.
 */
export const analyticsChannelChart = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
  returns: v.object({
    live: v.boolean(),
    /** The channels with lines of their own, the most visits first; the last line is everything else when there is any. */
    channels: v.array(v.string()),
    rest: v.boolean(),
    /**
     * Each line's visits a day, and its conversions in the same order (ga-channel-pages-plan.md CH9: a dot on each day
     * with one); a week's or month's last day where the past is held by week or month (ga-stored-figures-plan.md SF2b).
     */
    points: v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), visits: v.array(v.number()), conversions: v.array(v.number()) })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    const none = { live: false, channels: [] as string[], rest: false, points: [] as Array<{ day: string; lastDay?: string; visits: number[]; conversions: number[] }> };
    if (!connection?.newestDay) return none;
    const counted = countedOf(connection);
    const byDay = new Map<string, Map<string, { visits: number; conversions: number }>>();
    const add = (day: string, rows: readonly ListRow[]) => {
      const channels = byDay.get(day) ?? new Map<string, { visits: number; conversions: number }>();
      for (const row of rows) {
        const own = channels.get(displayChannel(row.key)) ?? { visits: 0, conversions: 0 };
        own.visits += row.visits;
        own.conversions += conversionsOf(row, counted).conversions;
        channels.set(displayChannel(row.key), own);
      }
      byDay.set(day, channels);
    };
    const lastDays = new Map<string, string>();
    const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
    if (!total) return none;
    const held = await readChannelPoints(ctx, connection, args.device, total.from, total.to, country);
    if (!held) return { ...none, live: true };
    for (const point of held) {
      add(point.start, point.rows);
      if (point.end !== point.start) lastDays.set(point.start, point.end);
    }
    const totals = new Map<string, number>();
    for (const channels of byDay.values()) for (const [channel, own] of channels) totals.set(channel, (totals.get(channel) ?? 0) + own.visits);
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
        const others = [...channels.entries()].filter(([channel]) => !lines.includes(channel)).map(([, own]) => own);
        const of = (measure: "visits" | "conversions") => {
          const own = lines.map((channel) => channels.get(channel)?.[measure] ?? 0);
          return rest ? [...own, others.reduce((sum, one) => sum + one[measure], 0)] : own;
        };
        return { day, ...(lastDays.has(day) ? { lastDay: lastDays.get(day) } : {}), visits: of("visits"), conversions: of("conversions") };
      }),
    };
  },
});

/**
 * Campaigns' chart (GA28; §18.2 board 17): the visits from tagged links a
 * day, every campaign added up — from each campaign kept a day, then a week,
 * then a month (ga-stored-figures-plan.md SF12) — `live` while the dates
 * reach past what is held, the minutes before a new website's two years are
 * filled. Every point of the period is drawn, one with none as none.
 */
export const analyticsCampaignChart = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
  returns: v.object({ live: v.boolean(), points: v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), visits: v.number() })) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    // Each campaign stored a day, then a week, then a month (ga-stored-figures-plan.md SF12), its untagged visits apart.
    const connection = await connectionOf(ctx, holdId);
    const total = connection ? await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country)) : null;
    const held = connection && total ? await readDayPoints(ctx, connection, "campaign", args.device, total.from, total.to, country) : null;
    if (!held) return { live: Boolean(total), points: [] };
    return {
      live: false,
      points: held.map((point) => ({
        day: point.start,
        ...(point.end !== point.start ? { lastDay: point.end } : {}),
        visits: point.rows.filter((row) => row.key !== UNTAGGED).reduce((sum, row) => sum + row.visits, 0),
      })),
    };
  },
});
