import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { isPageRef } from "./holdPageRefs";
import { periodRange, slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { shiftDay } from "./searchConsoleDays";
import { splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { connectionOf, conversionsOf, countedOf, readFor, readSlot } from "./googleAnalyticsRows";
import { readPageSeries } from "./googleAnalyticsPageSeries";
import { landingByChannel } from "./googleAnalyticsChannelReads";

/**
 * A page's own conversions on its All pages screen, under "Views a day"
 * (Anthony, 2026-10-20: "add the same graph style to the page detail screen
 * … using the data just for the individual page", and Conversions' squares
 * "aligned to this page"): the visits that started on it and the conversions
 * they went on to make, a day at a time, against the days just before; and
 * those conversions by the channel the visits came from. Read from what every
 * collection keeps — each page over time as a landing page
 * (ga-stored-figures-plan.md SF5) and the landing pages by channel
 * Conversions' squares read (CV3) — so nothing is asked of Google. Only the
 * caller's own website (`requireMySite`).
 */

const pageArgs = { siteId: v.id("companyWebsites"), page: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

/** The periods drawn with the span before beside them, day for day: the weeks and months, as Conversions' chart. */
const PERIODS_DRAWN_BEFORE: ReadonlySet<string> = new Set(["thisWeek", "lastWeek", "thisMonth", "lastMonth"]);

const pointValidator = v.object({ day: v.string(), lastDay: v.optional(v.string()), visits: v.number(), conversions: v.number(), events: v.array(v.number()) });

/**
 * The page's "Visits needed for one conversion": its visits as a landing page
 * and their conversions a point at the grain held — a day for 90 days, then a
 * week, then a month — each counted kind's own count beside them, for the tick
 * boxes; for the weeks and months the span before, each day dated onto the day it is
 * laid over; and the period's figures as the screen's "Visits that started
 * here" counts them, now and before, so the words and the figures agree.
 * `live` while the page's days are not held yet.
 */
export const analyticsPageVisitsPerConversion = tenantQuery({
  args: pageArgs,
  returns: v.object({
    live: v.boolean(),
    /** The counted events, in the order of each point's `events`. */
    events: v.array(v.string()),
    points: v.array(pointValidator),
    before: v.union(v.null(), v.object({ shift: v.number(), points: v.array(pointValidator) })),
    figures: v.union(v.null(), v.object({
      visits: v.number(),
      visitsBefore: v.union(v.number(), v.null()),
      kinds: v.array(v.object({ eventName: v.string(), count: v.number(), countBefore: v.union(v.number(), v.null()) })),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    const counted = connection ? countedOf(connection) : [];
    const events = counted.map((event) => event.eventName);
    const none = { live: false, events, points: [], before: null, figures: null };
    if (!connection?.newestDay || !isPageRef(args.page)) return none;
    // The ready-made period's dates, as "Views a day" beside it is drawn over.
    const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
    if (!total) return none;
    const pointOf = (day: string, row: ListRow, lastDay?: string) => ({
      day,
      ...(lastDay && lastDay !== day ? { lastDay } : {}),
      visits: row.visits,
      conversions: conversionsOf(row, counted).conversions,
      events: events.map((event) => row.counts.get(event) ?? 0),
    });
    const stored = await readPageSeries(ctx, connection, "landing", args.page, args.device, total.from, total.to, country);
    if (!stored) return { ...none, live: true };
    // The span the period is set against (calendar-periods-plan.md, phase 6), each of its days laid over the same day
    // of the period, its first over the first.
    const totalBefore = PERIODS_DRAWN_BEFORE.has(args.period) ? await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", "", country)) : null;
    const beforeRange = PERIODS_DRAWN_BEFORE.has(args.period) && connection.newestDay ? totalBefore ?? periodRange(args.period, "BEFORE", connection.newestDay) : null;
    const shift = beforeRange ? daysBetween(beforeRange.from, total.from) : 0;
    const earlier = beforeRange
      ? await readPageSeries(ctx, connection, "landing", args.page, args.device, beforeRange.from, beforeRange.to, country)
      : null;
    // The landing pages' ready-made lists, as the screen's "Visits that started here" reads them (PS1).
    const now = await readFor(ctx, holdId, "landing", args.period, "NOW", args.device, undefined, country);
    const was = await readFor(ctx, holdId, "landing", args.period, "BEFORE", args.device, undefined, country);
    const own = now && now !== "LIVE" ? now.rows.find((row) => row.key === args.page) ?? null : null;
    const ownBefore = was && was !== "LIVE" ? was.rows.find((row) => row.key === args.page) ?? null : null;
    const heldBefore = was !== null && was !== "LIVE";
    return {
      live: false,
      events,
      points: stored.map((point) => pointOf(point.start, point.row, point.end)),
      // Every point a day: anything coarser is not the day-for-day line this is.
      before: earlier && earlier.every((point) => point.grain === "day")
        ? { shift, points: earlier.map((point) => pointOf(shiftDay(total.from, shift + daysBetween(total.from, point.start)), point.row)) }
        : null,
      figures: now && now !== "LIVE" ? {
        visits: own?.visits ?? 0,
        visitsBefore: heldBefore ? ownBefore?.visits ?? 0 : null,
        kinds: events.map((eventName) => ({
          eventName,
          count: own?.counts.get(eventName) ?? 0,
          countBefore: heldBefore ? ownBefore?.counts.get(eventName) ?? 0 : null,
        })),
      } : null,
    };
  },
});

/**
 * The page's conversions by channel, Conversions' squares "aligned to this
 * page": each counted kind, happened or not, and each key event not counted
 * that happened, down the side; each channel whose visits started here
 * across, the most visits first; each square that event's count from visits
 * that came from that channel and started here. Each channel's visits that
 * started here and their conversions beside the whole website's from the same
 * channel, for its bars ("it's the channels I want"). From the same landing
 * pages by channel Conversions' squares read, so they all say one thing. Null
 * until that list is kept.
 */
export const analyticsPageConversionGrid = tenantQuery({
  args: pageArgs,
  returns: v.union(v.null(), v.object({
    /** One device's landing pages by channel not kept yet: every device's are shown. */
    everyDevice: v.boolean(),
    /** Each channel's visits that started here and their counted conversions; the whole website's from it beside them. */
    channels: v.array(v.object({ channel: v.string(), visits: v.number(), conversions: v.number(), websiteVisits: v.number(), websiteConversions: v.number() })),
    rows: v.array(v.object({ eventName: v.string(), counted: v.boolean(), count: v.number(), cells: v.array(v.number()) })),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay || !isPageRef(args.page)) return null;
    const byChannel = await landingByChannel(ctx, holdId, args.period, "NOW", country, args.device);
    if (!byChannel) return null;
    const countedEvents = countedOf(connection);
    // This page's rows, one a channel: keyed page then channel; and every page's from each channel, the website's.
    const own = new Map<string, ListRow>();
    const website = new Map<string, { visits: number; conversions: number }>();
    for (const row of byChannel.rows) {
      const { channel: page, source: channel } = splitChannelKey(row.key);
      if (page === args.page && row.visits > 0) own.set(channel, row);
      const whole = website.get(channel) ?? website.set(channel, { visits: 0, conversions: 0 }).get(channel)!;
      whole.visits += row.visits;
      whole.conversions += conversionsOf(row, countedEvents).conversions;
    }
    const channels = [...own.entries()].sort((left, right) => right[1].visits - left[1].visits || left[0].localeCompare(right[0]));
    const countOf = (event: string) => channels.reduce((sum, [, row]) => sum + (row.counts.get(event) ?? 0), 0);
    const counted = countedEvents.map((event) => event.eventName);
    const countedNames = new Set(counted);
    const notCounted = (connection.events ?? []).map((event) => event.eventName).filter((event) => !countedNames.has(event) && countOf(event) > 0);
    const byCount = (left: string, right: string) => countOf(right) - countOf(left);
    return {
      everyDevice: byChannel.everyDevice,
      channels: channels.map(([channel, row]) => ({
        channel,
        visits: row.visits,
        conversions: conversionsOf(row, countedEvents).conversions,
        websiteVisits: website.get(channel)?.visits ?? 0,
        websiteConversions: website.get(channel)?.conversions ?? 0,
      })),
      rows: [...[...counted].sort(byCount).map((event) => ({ event, counted: true })), ...notCounted.sort(byCount).map((event) => ({ event, counted: false }))]
        .map(({ event, counted: isCounted }) => ({ eventName: event, counted: isCounted, count: countOf(event), cells: channels.map(([, row]) => row.counts.get(event) ?? 0) })),
    };
  },
});

/** Whole days from one day to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
