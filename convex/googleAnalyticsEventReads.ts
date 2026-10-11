import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { decodePages } from "./holdPageRefs";
import { shiftDay } from "./searchConsoleDays";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { titlesOf } from "./pageTitles";
import { eventAsk } from "./googleAnalyticsLive";
import { DAY_JOIN, type ListRow } from "./googleAnalyticsLists";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
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

/** Every day from one to another, oldest first: a day with nothing is drawn as nothing. */
function daysFrom(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day && day <= to; day = shiftDay(day, 1)) days.push(day);
  return days;
}

/** Each event's times a day from a list of each event a day, by the events asked. */
function timesADay(series: Held, events: readonly string[]): Array<{ day: string; times: number[] }> {
  const byDay = new Map<string, number[]>();
  for (const row of series.rows) {
    const at = row.key.indexOf(DAY_JOIN);
    if (at < 0) continue;
    const which = events.indexOf(row.key.slice(at + DAY_JOIN.length));
    if (which < 0) continue;
    const day = row.key.slice(0, at);
    const times = byDay.get(day) ?? events.map(() => 0);
    times[which] += row.times ?? 0;
    byDay.set(day, times);
  }
  return daysFrom(series.from, series.to).map((day) => ({ day, times: byDay.get(day) ?? events.map(() => 0) }));
}

/** The change in times on the span before; null when there is none to compare. */
const changeOf = (now: number, before: number | null | undefined) => (before ? (now - before) / before : null);

/**
 * Events (§18.2 board 22): every event, by its own name and Google's, its
 * times, people and visits, whether it counts as a conversion — those that
 * count and never happened among them — and the change; scrolls and link
 * clicks a day. A device chosen is asked of Google when the screen opens.
 */
export const analyticsEvents = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({
    /** No event list held yet: it comes in with the next collection. */
    preparing: v.boolean(),
    /** One device's list or chart, asked of Google when the screen opens. */
    live: v.boolean(),
    rows: v.array(eventRowValidator),
    points: v.array(v.object({ day: v.string(), scroll: v.number(), click: v.number() })),
    flags: flagsValidator,
    seen: seenValidator,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay) return null;
    const counted = new Set(countedOf(connection).map((event) => event.eventName));
    const nowList = await readFor(ctx, holdId, "event", args.period, "NOW", args.device, undefined, country);
    const beforeList = await readFor(ctx, holdId, "event", args.period, "BEFORE", args.device, undefined, country);
    const seriesList = await readFor(ctx, holdId, "eventSeries", args.period, "NOW", args.device, undefined, country);
    const now = heldOf(nowList);
    const before = heldOf(beforeList);
    const series = heldOf(seriesList);
    const live = nowList === "LIVE" || seriesList === "LIVE";
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
      points: series ? timesADay(series, ["scroll", "click"]).map(({ day, times: [scroll, click] }) => ({ day, scroll, click })) : [],
      flags: { folded: now?.folded ?? false, thresholded: now?.thresholded ?? false, cut: now?.cut ?? false },
      seen: now && !live ? eventsSees(rows, visits) : { says: [], steps: [] },
    };
  },
});

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

/**
 * An event's own screen (§18.2 board 23): its times, people and visits
 * against the span before and the website's, its times a day, and — asked of
 * Google when the screen opens (`askGoogleAnalyticsLive`, `event`) — what it
 * was about by its kind and the pages it happened on; `live` until they are.
 */
export const analyticsEvent = tenantQuery({
  args: { siteId: v.id("companyWebsites"), event: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
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
    /** Its times a day: one device's asked of Google when the screen opens. */
    points: v.array(v.object({ day: v.string(), times: v.number() })),
    live: v.boolean(),
    about: v.array(aboutRowValidator),
    pages: v.array(aboutRowValidator),
    /** Whether anything else counts as a conversion: without, no one can convert after it. */
    counting: v.boolean(),
    /** The people who did it, and of them who converted after it (Anthony, 2026-10-11); null until asked, or when Google could not say. */
    after: v.union(v.null(), v.object({ did: v.number(), converted: v.number() })),
    seen: seenValidator,
  })),
  handler: async (ctx, args) => {
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
    const series = heldOf(await readFor(ctx, holdId, "eventSeries", args.period, "NOW", args.device, undefined, country));
    const row = now?.rows.find((one) => one.key === args.event) ?? null;
    const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
    const whole = total?.rows[0] ?? null;
    // Named as the live ask names them: by the dates of every device's ready-made period.
    const every = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
    const named = (kind: "detail" | "pages" | "funnel", which: "NOW" | "BEFORE") =>
      eventAsk(kind, which, args.event, args.period, every?.from ?? "", every?.to ?? "", args.device, country);
    const detail = EVENT_DETAIL[args.event] ?? null;
    const detailNow = detail ? await readLive(ctx, holdId, named("detail", "NOW")) : null;
    const detailBefore = detail ? await readLive(ctx, holdId, named("detail", "BEFORE")) : null;
    const pagesNow = await readLive(ctx, holdId, named("pages", "NOW"));
    const pagesBefore = await readLive(ctx, holdId, named("pages", "BEFORE"));
    const funnel = counting ? await readLive(ctx, holdId, named("funnel", "NOW")) : null;
    const live = !pagesNow || !pagesBefore || (detail !== null && (!detailNow || !detailBefore)) || (counting && !funnel);
    // A link as people read it — `linkedin.com/company/ronins` — its whole address kept as its key, for the link itself.
    const reached = (key: string) => funnel?.rows.find((one) => one.key === key)?.people ?? 0;
    // Google refusing its funnel report is held as `refused`: the figure unsaid, the rest of the screen shown.
    const after = funnel && !funnel.rows.some((one) => one.key === "refused") ? { did: reached("did"), converted: reached("then") } : null;
    const about = aboutRows(detailNow, detailBefore).map((one) => (detail === "linkUrl" ? { ...one, label: one.key.replace(/^https?:\/\//i, "").replace(/^www\./i, "") } : one));
    const listed = aboutRows(pagesNow, pagesBefore);
    const addresses = listed.length > 0 ? await decodePages(ctx, holdId, listed.map((one) => one.key)) : [];
    const titles = await titlesOf(ctx, holdId, addresses);
    const pages = listed.map((one, at) => {
      const title = titles.get(addresses[at]);
      return { ...one, label: addresses[at] ?? one.key, ...(title ? { title } : {}) };
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
      points: series ? timesADay(series, [args.event]).map(({ day, times: [count] }) => ({ day, times: count })) : [],
      live,
      about,
      pages,
      counting,
      after,
      seen: live ? { says: [], steps: [] } : eventSees({
        eventName: args.event, detail, times, timesBefore, people: row?.people ?? 0, about, pageViews: whole?.views ?? 0, after,
      }),
    };
  },
});
