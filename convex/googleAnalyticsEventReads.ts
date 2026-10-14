import { v, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { decodePages } from "./holdPageRefs";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { titlesOf } from "./pageTitles";
import { funnelAsk } from "./googleAnalyticsLive";
import type { ListRow } from "./googleAnalyticsLists";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import type { Doc } from "./_generated/dataModel";
import { readDayPoints } from "./googleAnalyticsHistory";
import { readPageRows } from "./googleAnalyticsPageLists";
import { OTHER_ROWS } from "./utils/analyticsPageStory";
import { EVENT_DETAIL, EVENT_KINDS, eventKind } from "./utils/analyticsEvents";
import { seenValidator } from "./utils/hakkenSees";
import { eventSees, eventsSees } from "./utils/sees/analyticsEvents";
import { connectionOf, countedOf, readFor, readLive, readSlot, type Held } from "./googleAnalyticsReads";

/**
 * What Events and an event's own screen read
 * (docs/plans/active/google-analytics-plan.md GA30, §18.2 boards 22 and 23,
 * §18.6.5): every event the website recorded against the span before, each a
 * day, and — asked of Google when an event's screen opens — what it was about
 * and the pages it happened on. Apart from `googleAnalyticsReads.ts` to keep
 * each module inside its size. Only the caller's own website (`requireMySite`).
 */

const kindValidator = v.union(...EVENT_KINDS.map((kind) => v.literal(kind)));

const eventRowValidator = v.object({
  /** Google's own name for it: the screen names it in the reader's words. */
  eventName: v.string(),
  kind: kindValidator,
  counted: v.boolean(),
  /** A key event of the property, listed on the connection, whether it counts or not: Conversions' "Not counted" (CV5). */
  keyEvent: v.boolean(),
  times: v.number(),
  people: v.number(),
  /** Visits it happened in. */
  visits: v.number(),
  /** Its times in the span before; null when there is none to compare. */
  timesBefore: v.union(v.number(), v.null()),
});

const flagsValidator = v.object({ folded: v.boolean(), thresholded: v.boolean(), cut: v.boolean() });

/** A list held, or nothing yet: the ready-made one, or one asked of Google for one device. */
const heldOf = (list: Held | "LIVE" | null) => (list && list !== "LIVE" ? list : null);

/**
 * Each event's times a point from the events stored a day, then a week, then
 * a month (ga-stored-figures-plan.md SF12), over the period's dates — or null
 * before the home country's events are filled.
 */
async function storedTimes(ctx: SiteReader, connection: Doc<"googleAnalyticsConnections">, period: AnalyticsPeriod, device: string, country: string, events: readonly string[]) {
  const total = await readSlot(ctx, connection.companyWebsiteId, slotKey("total", period, "NOW", "", country));
  const held = total ? await readDayPoints(ctx, connection, "event", device, total.from, total.to, country) : null;
  return held?.map((point) => ({
    day: point.start,
    ...(point.end !== point.start ? { lastDay: point.end } : {}),
    times: events.map((event) => point.rows.filter((row) => row.key === event).reduce((sum, row) => sum + (row.times ?? 0), 0)),
  })) ?? null;
}

/** The change in times on the span before; null when there is none to compare. */
const changeOf = (now: number, before: number | null | undefined) => (before ? (now - before) / before : null);

const analyticsEventsArgs = { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

/**
 * Events (§18.2 board 22): every event, by its own name and Google's, its
 * times, people and visits, whether it counts as a conversion — those that
 * count and never happened among them — and the change; scrolls and link
 * clicks a day. Every device's and each device's, kept by each collection.
 */
export const analyticsEvents = tenantQuery({
  args: analyticsEventsArgs,
  returns: v.union(v.null(), v.object({
    /** No event list held yet: it comes in with the next collection. */
    preparing: v.boolean(),
    /** One device's list not built yet: the next collection builds it. */
    live: v.boolean(),
    rows: v.array(eventRowValidator),
    /** A day; past 90 days a week or month to its `lastDay` (ga-stored-figures-plan.md SF2b). */
    points: v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), scroll: v.number(), click: v.number() })),
    flags: flagsValidator,
    seen: seenValidator,
  })),
  handler: async (ctx, args) => await readEvents(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readEvents(ctx: SiteReader, args: ObjectType<typeof analyticsEventsArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const counted = new Set(countedOf(connection).map((event) => event.eventName));
  const keyEvents = new Set((connection.events ?? []).map((event) => event.eventName));
  const nowList = await readFor(ctx, holdId, "event", args.period, "NOW", args.device, undefined, country);
  const beforeList = await readFor(ctx, holdId, "event", args.period, "BEFORE", args.device, undefined, country);
  const stored = await storedTimes(ctx, connection, args.period, args.device, country, ["scroll", "click"]);
  const now = heldOf(nowList);
  const before = heldOf(beforeList);
  const live = nowList === "LIVE";
  const byName = new Map((now?.rows ?? []).map((row) => [row.key, row]));
  const was = new Map((before?.rows ?? []).map((row) => [row.key, row.times ?? 0]));
  // What counts is listed even when it never happened: that is what the screen most wants said.
  const names = now ? [...new Set([...byName.keys(), ...counted])] : [];
  const rows = names.map((eventName) => {
    const row = byName.get(eventName);
    return {
      eventName,
      kind: eventKind(eventName, counted.has(eventName)),
      counted: counted.has(eventName),
      keyEvent: keyEvents.has(eventName),
      times: row?.times ?? 0,
      people: row?.people ?? 0,
      visits: row?.visits ?? 0,
      timesBefore: before ? was.get(eventName) ?? 0 : null,
    };
  }).sort((left, right) => right.times - left.times || left.eventName.localeCompare(right.eventName));
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
  const visits = total?.rows[0]?.visits ?? 0;
  return {
    preparing: nowList === null,
    live,
    rows,
    points: (stored ?? []).map(({ times: [scroll, click], ...when }) => ({ ...when, scroll, click })),
    flags: { folded: now?.folded ?? false, thresholded: now?.thresholded ?? false, cut: now?.cut ?? false },
    seen: now && !live ? eventsSees(rows, visits) : { says: [], steps: [] },
  };
}

const aboutRowValidator = v.object({
/** The link, file, words, depth or video; a page's number on the pages it happened on. */
key: v.string(),
/** As shown: the page's address on the pages it happened on. */
label: v.string(),
title: v.optional(v.string()),
times: v.number(),
people: v.number(),
change: v.union(v.number(), v.null()),
});

/** A detail or page list held, against its span before, as the screen shows it. */
function aboutRows(now: Held | null, before: Held | null): Array<{ key: string; label: string; times: number; people: number; change: number | null }> {
  const was = new Map((before?.rows ?? []).map((row: ListRow) => [row.key, row.times ?? 0]));
  return (now?.rows ?? [])
    .filter((row) => (row.times ?? 0) > 0)
    .map((row) => ({ key: row.key, label: row.key, times: row.times ?? 0, people: row.people, change: before ? changeOf(row.times ?? 0, was.get(row.key) ?? 0) : null }))
    .sort((left, right) => right.times - left.times);
}

const analyticsEventArgs = { siteId: v.id("companyWebsites"), event: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

/**
 * An event's own screen (§18.2 board 23): its times, people and visits
 * against the span before and the website's, its times a day, and what it
 * was about by its kind and the pages it happened on, from the shared lists
 * each collection keeps (ga-stored-figures-plan.md SF13), `live` until they
 * are held; and who converted after it, its funnel asked of Google when the
 * screen opens and kept a week (`askEventFunnel`, SF8), `afterLive` until then.
 */
export const analyticsEvent = tenantQuery({
  args: analyticsEventArgs,
  returns: v.union(v.null(), v.object({
    eventName: v.string(),
    kind: kindValidator,
    counted: v.boolean(),
    /** What it was about, by Google's dimension; null for an event with only its pages. */
    detail: v.union(v.null(), v.literal("linkUrl"), v.literal("fileName"), v.literal("searchTerm"), v.literal("percentScrolled"), v.literal("videoTitle")),
    figures: v.object({
      times: v.number(),
      timesBefore: v.union(v.number(), v.null()),
      people: v.number(),
      /** Its people over the website's, and its visits over the website's: null without any. */
      peopleShare: v.union(v.number(), v.null()),
      visits: v.number(),
      visitsShare: v.union(v.number(), v.null()),
    }),
    /** Its times a day; past 90 days a week or month to its `lastDay` (ga-stored-figures-plan.md SF2b). */
    points: v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), times: v.number() })),
    /** What it was about or its pages not held yet: the next collection builds them. */
    live: v.boolean(),
    /** Its funnel not held yet: asked of Google when the screen opens, kept a week (ga-stored-figures-plan.md SF8). */
    afterLive: v.boolean(),
    about: v.array(aboutRowValidator),
    pages: v.array(aboutRowValidator),
    /** Whether anything else counts as a conversion: without, no one can convert after it. */
    counting: v.boolean(),
    /** The people who did it, and of them who converted after it (Anthony, 2026-10-11); null until asked, or when Google could not say. */
    after: v.union(v.null(), v.object({ did: v.number(), converted: v.number() })),
    seen: seenValidator,
  })),
  handler: async (ctx, args) => await readEvent(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readEvent(ctx: SiteReader, args: ObjectType<typeof analyticsEventArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const counts = countedOf(connection).map((event) => event.eventName);
  const counted = counts.includes(args.event);
  const counting = counts.some((name) => name !== args.event);
  const now = heldOf(await readFor(ctx, holdId, "event", args.period, "NOW", args.device, undefined, country));
  const before = heldOf(await readFor(ctx, holdId, "event", args.period, "BEFORE", args.device, undefined, country));
  const stored = await storedTimes(ctx, connection, args.period, args.device, country, [args.event]);
  const row = now?.rows.find((one) => one.key === args.event) ?? null;
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
  const whole = total?.rows[0] ?? null;
  const detail = EVENT_DETAIL[args.event] ?? null;
  // What it was about and the pages it happened on, kept by each collection for every event and home country
  // (ga-stored-figures-plan.md SF7, SF13, SF15): `live` until the next run has built them.
  const kept = async (list: "eventPage" | "eventDetail", which: "NOW" | "BEFORE"): Promise<Held | null> => {
    const rows = await readPageRows(ctx, holdId, list, args.period, args.device, args.event, which, country);
    return rows ? { rows: rows.rows, from: "", to: "", folded: false, thresholded: rows.thresholded, cut: false } : null;
  };
  const detailNow = detail ? await kept("eventDetail", "NOW") : null;
  const detailBefore = detail ? await kept("eventDetail", "BEFORE") : null;
  const pagesNow = await kept("eventPage", "NOW");
  const pagesBefore = await kept("eventPage", "BEFORE");
  // Its funnel asked of Google when the screen opens and kept a week (SF8): the one figure a screen still asks for.
  const funnel = counting ? await readLive(ctx, holdId, funnelAsk(args.event, args.period, args.device, country)) : null;
  const live = !pagesNow || !pagesBefore || (detail !== null && (!detailNow || !detailBefore));
  const afterLive = counting && !funnel;
  // A link as people read it — `linkedin.com/company/ronins` — its whole address kept as its key, for the link itself.
  const reached = (key: string) => funnel?.rows.find((one) => one.key === key)?.people ?? 0;
  // Google refusing its funnel report is held as `refused`: the figure unsaid, the rest of the screen shown.
  const after = funnel && !funnel.rows.some((one) => one.key === "refused") ? { did: reached("did"), converted: reached("then") } : null;
  const about = aboutRows(detailNow, detailBefore).map((one) => (detail === "linkUrl" ? { ...one, label: one.key.replace(/^https?:\/\//i, "").replace(/^www\./i, "") } : one));
  const listed = aboutRows(pagesNow, pagesBefore);
  // An event's pages past its 20 busiest are one row, "(other)" (SF14): never a page of the website.
  const refs = listed.filter((one) => one.key !== OTHER_ROWS).map((one) => one.key);
  const decoded = refs.length > 0 ? await decodePages(ctx, holdId, refs) : [];
  const addressOf = new Map(refs.map((ref, at) => [ref, decoded[at]]));
  const titles = await titlesOf(ctx, holdId, decoded);
  const pages = listed.map((one) => {
    const address = addressOf.get(one.key);
    const title = address ? titles.get(address) : undefined;
    return { ...one, label: address ?? one.key, ...(title ? { title } : {}) };
  });
  const times = row?.times ?? 0;
  const timesBefore = before ? before.rows.find((one) => one.key === args.event)?.times ?? 0 : null;
  return {
    eventName: args.event,
    kind: eventKind(args.event, counted),
    counted,
    detail,
    figures: {
      times,
      timesBefore,
      people: row?.people ?? 0,
      peopleShare: whole && whole.people > 0 ? (row?.people ?? 0) / whole.people : null,
      visits: row?.visits ?? 0,
      visitsShare: whole && whole.visits > 0 ? (row?.visits ?? 0) / whole.visits : null,
    },
    points: (stored ?? []).map(({ times: [count], ...when }) => ({ ...when, times: count })),
    live,
    afterLive,
    about,
    pages,
    counting,
    after,
    seen: live ? { says: [], steps: [] } : eventSees({
      eventName: args.event, detail, times, timesBefore, people: row?.people ?? 0, about: about.filter((one) => one.key !== OTHER_ROWS), pageViews: whole?.views ?? 0, after,
    }),
  };
}
