import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { isPageRef } from "./holdPageRefs";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { shiftDay } from "./searchConsoleDays";
import { EVERY_DEVICE, splitChannelKey, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { addInto, blank, connectionOf, countedOf, readSlot } from "./googleAnalyticsRows";
import { coverageOf } from "./googleAnalyticsCoverage";
import { landingChannelOf, less } from "./googleAnalyticsChannelReads";
import { pointOf } from "./googleAnalyticsPageSeries";
import { AI_ASSISTANTS_CHANNEL } from "./utils/aiAssistants";
import { dayDevice, historyFloors, pointsBetween, type Grain } from "./utils/analyticsHistory";

/**
 * A page's conversions by channel over time (docs/plans/active/page-conversion-explorer-plan.md): the visits that
 * started on it and each counted kind's count, a point at the grain held — a day for 90 days, then a week, then a
 * month, to two years — by channel as the screens show them, AI assistants by their source. Read from each page's
 * records by channel (`googleAnalyticsPageSeries`, every device only), never asking Google. Only the caller's own
 * website (`requireMySite`).
 */

type Reader = { db: QueryCtx["db"] };

/** A point of a page's channels: its dates, at the grain held, and each channel's row. */
export type ChannelPoint = { grain: Grain; start: string; end: string; channels: Map<string, ListRow> };

/**
 * A page's channels over `from` to `to`, a point at the finest grain held for each date: Google's channel for each,
 * less the assistants' visits Google filed there, which count as AI assistants. `heldFrom` is the first day kept by
 * channel (null before any is): a date before it has nothing to say yet, not nought.
 */
export async function readPageChannelPoints(
  ctx: Reader,
  connection: Doc<"googleAnalyticsConnections">,
  page: string,
  from: string,
  to: string,
  country = "",
): Promise<{ heldFrom: string | null; points: ChannelPoint[] }> {
  const { newestDay: newest, pageChannelsFrom } = coverageOf(connection, country);
  if (!newest || !pageChannelsFrom) return { heldFrom: null, points: [] };
  const device = dayDevice(EVERY_DEVICE, country);
  const read = async (list: "landingChannel" | "landingAssistant") => {
    const record = await ctx.db
      .query("googleAnalyticsPageSeries")
      .withIndex("by_hold_list_page_device", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).eq("list", list).eq("page", page).eq("device", device))
      .first();
    return record ? unpackPart(record as PackedPart) : [];
  };
  const [channelRows, assistantRows] = [await read("landingChannel"), await read("landingAssistant")];
  const points = pointsBetween(from, to, newest).map((point) => ({ ...point, filed: new Map<string, ListRow>(), assistants: new Map<string, ListRow>() }));
  const pointOfDay = (when: string) => {
    const day = pointOf(when).start;
    return points.find((point) => day >= point.start && day <= point.end) ?? null;
  };
  const add = (into: Map<string, ListRow>, key: string, row: ListRow) => addInto(into.get(key) ?? into.set(key, blank(key)).get(key)!, row);
  for (const row of channelRows) {
    const { channel: when, source: channel } = splitChannelKey(row.key);
    const point = pointOfDay(when);
    if (point) add(point.filed, channel, row);
  }
  // The assistants' visits, by the channel Google filed them under and their source: only the assistants' are kept.
  for (const row of assistantRows) {
    const { channel: when, source: rest } = splitChannelKey(row.key);
    const point = pointOfDay(when);
    if (point) add(point.assistants, splitChannelKey(rest).channel, row);
  }
  const floor = historyFloors(newest).month;
  return {
    heldFrom: pageChannelsFrom > floor ? pageChannelsFrom : floor,
    points: points.map((point) => {
      const channels = new Map<string, ListRow>();
      for (const [filed, row] of point.filed) {
        const taken = point.assistants.get(filed);
        add(channels, landingChannelOf(filed), taken ? less(row, taken) : row);
      }
      for (const row of point.assistants.values()) add(channels, AI_ASSISTANTS_CHANNEL, row);
      return { grain: point.grain, start: point.start, end: point.end, channels };
    }),
  };
}

const pointValidator = v.object({
  day: v.string(),
  lastDay: v.string(),
  /** Each channel's visits that started on the page, and each counted kind's count in `events`' order. */
  rows: v.array(v.object({ channel: v.string(), visits: v.number(), counts: v.array(v.number()) })),
});

/**
 * The page's figures by channel for its "Visits for one conversion" explorer: the dates chosen, the same span just
 * before them, and the same dates 52 weeks before, each a point at the grain held. `everyDevice` when a device is
 * chosen, as the page's channels are kept for every device only.
 */
export const analyticsPageChannelExplorer = tenantQuery({
  args: { siteId: v.id("companyWebsites"), page: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
  returns: v.object({
    heldFrom: v.union(v.string(), v.null()),
    everyDevice: v.boolean(),
    /** The counted events, in the order of each row's `counts`. */
    events: v.array(v.string()),
    /** Every channel with a visit in any of the three spans, the most visits in the dates chosen first. */
    channels: v.array(v.string()),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    now: v.array(pointValidator),
    before: v.array(pointValidator),
    year: v.array(pointValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    const events = connection ? countedOf(connection).map((event) => event.eventName) : [];
    const none = { heldFrom: null, everyDevice: args.device !== "", events, channels: [], from: null, to: null, now: [], before: [], year: [] };
    if (!connection?.newestDay || !isPageRef(args.page)) return none;
    // The ready-made period's dates, as the page's other charts are drawn over.
    const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
    if (!total) return none;
    const days = Number(args.period);
    const span = async (shift: number) => await readPageChannelPoints(ctx, connection, args.page, shiftDay(total.from, -shift), shiftDay(total.to, -shift), country);
    const [now, before, year] = [await span(0), await span(days), await span(364)];
    const shape = (points: ChannelPoint[]) => points.map((point) => ({
      day: point.start,
      lastDay: point.end,
      rows: [...point.channels.values()].filter((row) => row.visits > 0 || events.some((event) => (row.counts.get(event) ?? 0) > 0)).map((row) => ({
        channel: row.key,
        visits: row.visits,
        counts: events.map((event) => row.counts.get(event) ?? 0),
      })),
    }));
    const visits = new Map<string, number>();
    for (const [at, points] of [now.points, before.points, year.points].entries()) {
      for (const point of points) for (const row of point.channels.values()) visits.set(row.key, (visits.get(row.key) ?? 0) + (at === 0 ? row.visits : row.visits / 1e6));
    }
    return {
      heldFrom: now.heldFrom,
      everyDevice: args.device !== "",
      events,
      channels: [...visits.entries()].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([channel]) => channel),
      from: total.from,
      to: total.to,
      now: shape(now.points),
      before: shape(before.points),
      year: shape(year.points),
    };
  },
});
