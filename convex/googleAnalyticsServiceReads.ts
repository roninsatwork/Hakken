import { v, type ObjectType } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { findMySite, requireMySite, type SiteReader } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { slotKey, splitChannelKey, type ListRow, type PartOnly } from "./googleAnalyticsLists";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { connectionOf, conversionsOf, countedOf, eachSlotPart, readSlot, type Counted } from "./googleAnalyticsRows";
import { decodePages, isPageRef } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { titlesOf } from "./pageTitles";
import { displayOf, eachLandingByChannel } from "./googleAnalyticsChannelReads";
import { readPageSeries } from "./googleAnalyticsPageSeries";
import { readPageChannelPoints } from "./googleAnalyticsPageChannels";
import { merged, readChannelPoints, readDayPoints } from "./googleAnalyticsHistory";
import { coverageOf } from "./googleAnalyticsCoverage";
import { pointsBetween } from "./utils/analyticsHistory";
import { pageName } from "./utils/pageNames";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * What Services reads (docs/plans/active/services-new-page-plan-2026-11-07.md, step 1; board "The new page so far" on the canvas
 * "Hakken — Services, four ways"). A service is a page in a Classification whose type is Service, by the app's one classifying
 * rule (`readPageKinds`). Its name is the first part of its page title.
 *
 * - **The page** (`analyticsServices`): every service's visits, page views, visits that stayed a while, visits that scrolled to
 *   the bottom and events, now and for the dates before, the visits that started on it, and those split by channel. The boxes,
 *   the dots, the map, the table, the eye and Ask Hakken all read it.
 * - **The month chart** (`analyticsServiceDays`): the ticked services' figures at the grain held (a day for 90 days, then a
 *   week, then a month), for the dates and the dates before, by channel when asked, and the whole website's beside them.
 *
 * **One page, one row.** Google lists `/logo-design-agency` and `/logo-design-agency/` apart: they're added together under the
 * address with the slash, and shown by the one with more visits (7 November: Ronins' figures then matched Conversions' exactly).
 * **Events** are the times the website's counted events happened on the page, as every Google Analytics page counts them. A
 * service business says Events, never Bought (Anthony, 2026-11-06). No money anywhere.
 *
 * Nothing is asked of Google: every figure comes from lists each collection already keeps. Long lists are read a part at a
 * time with only the figures needed (`eachSlotPart`), so a year of pages never runs a read out of its 64MB. Only the caller's
 * own website (`requireMySite`).
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;

/** A Classification's type that makes its pages services. */
export const SERVICE_TYPE = "SERVICE";
/** The event a page's scroll to the bottom is kept as, by visits. */
const SCROLL_EVENT = "scroll";
/** Services a read hands back at most, the most visits first. A website with more is told how many were left out. */
export const MOST_SERVICES = 1_000;
/** Services the month chart reads at once, the busiest first. Its hint says when more were ticked. */
export const MOST_CHARTED = 50;

/** One address for both of a page's: with the last slash, as a page's own screen keeps it. A home page's slash is its own. */
export function serviceKeyOf(address: string): string {
  return /^https?:\/\/[^/]+\/.+[^/]$/i.test(address) && !/[?#]/.test(address) ? `${address}/` : /^https?:\/\/[^/]+$/i.test(address) ? `${address}/` : address;
}

/** The other of a page's two addresses, with or without the last slash. */
function twinOf(address: string): string {
  return address.endsWith("/") ? address.slice(0, -1) : `${address}/`;
}

/** A service's name: the first part of its page title, or its address in words. */
export function serviceNameOf(title: string | undefined, address: string): string {
  const first = title?.split(/\s+[|–—]\s+/)[0]?.trim();
  return first || pageName(address);
}

type Figures = { visits: number; views: number; engaged: number; scrolled: number; events: number };
const noFigures = (): Figures => ({ visits: 0, views: 0, engaged: 0, scrolled: 0, events: 0 });
type ChannelFigures = { visits: number; engaged: number; events: number };

/** A row as the reads keep it, with only what Services counts: the rest of a long list is let go as each part is read. */
type Kept = { key: string; figures: Figures };
type KeptChannel = { page: string; channel: string; figures: ChannelFigures };

const figuresOf = (row: ListRow, counted: readonly Counted[]): Figures => ({
  visits: row.visits,
  views: row.views,
  engaged: row.engaged,
  scrolled: row.eventVisits?.get(SCROLL_EVENT) ?? 0,
  events: conversionsOf(row, counted).conversions,
});

function addFigures(into: Figures, row: Figures) {
  into.visits += row.visits;
  into.views += row.views;
  into.engaged += row.engaged;
  into.scrolled += row.scrolled;
  into.events += row.events;
}

/** Whether a list is kept for these dates and device. */
async function isKept(ctx: Reader, holdId: HoldId, key: string): Promise<boolean> {
  return (await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", key)).first()) !== null;
}

/** A kept list's rows with only Services' figures, a part at a time. */
async function keptRows(ctx: Reader, holdId: HoldId, key: string, only: PartOnly, counted: readonly Counted[]) {
  const rows: Kept[] = [];
  const notes = await eachSlotPart(ctx, holdId, key, only, (part) => {
    for (const row of part) rows.push({ key: row.key, figures: figuresOf(row, counted) });
  });
  return notes ? { rows, from: notes.from, to: notes.to } : null;
}

/** Whether a website has any Classification of the Service type: the menu lists Services for it when it doesn't sell. */
export async function hasServiceClassification(ctx: Reader, holdId: HoldId): Promise<boolean> {
  const classifications = await ctx.db.query("pageClassifications").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).take(200);
  return classifications.some((classification) => classification.type === SERVICE_TYPE);
}

const serviceArgs = {
  siteId: v.id("companyWebsites"),
  period: analyticsPeriodValidator,
  device: v.string(),
  country: v.optional(v.string()),
};

const figuresValidator = v.object({ visits: v.number(), views: v.number(), engaged: v.number(), scrolled: v.number(), events: v.number() });

const serviceValidator = v.object({
  /** Both of the page's addresses under one, with the last slash: the row's id. */
  key: v.string(),
  /** The address it's shown and opened by: of its two, the one with more visits. */
  address: v.string(),
  /** That address's page number, which its own screen opens by. */
  page: v.string(),
  name: v.string(),
  /** Its Classification's id. */
  kind: v.string(),
  /** The page numbers it's kept under, for its months (`analyticsServiceDays`). */
  refs: v.array(v.string()),
  now: figuresValidator,
  before: figuresValidator,
  /** Visits that started on it, now and before. */
  started: v.number(),
  startedBefore: v.number(),
  /**
   * The visits that started on it, by channel in `channels`' order, each [visits, stayed, events] now and the same before:
   * six figures. Null with a device picked, as the split is kept for every device only.
   */
  byChannel: v.union(v.null(), v.array(v.array(v.number()))),
});

export const servicesValidator = v.object({
  /** Ready, not connected yet, no Service-type Classification, or these dates' pages not collected yet. */
  state: v.union(v.literal("ready"), v.literal("notConnected"), v.literal("noServices"), v.literal("collecting")),
  /** A device was picked and its pages aren't kept yet, so these are every device's. */
  everyDevice: v.boolean(),
  /** Whether the dates before are kept, to set each figure against. */
  hasBefore: v.boolean(),
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
  beforeFrom: v.union(v.string(), v.null()),
  beforeTo: v.union(v.string(), v.null()),
  /** The Service-type Classifications, A to Z: a chip filters by them when there's more than one. */
  classifications: v.array(v.object({ id: v.string(), name: v.string() })),
  /** Every channel that sent a visit to a service, the most first. Empty with a device picked. */
  channels: v.array(v.string()),
  services: v.array(serviceValidator),
  /** Services past `MOST_SERVICES`, the fewest visits, left out. */
  leftOut: v.number(),
  /** The whole website: visits, stayed and events from its totals; page visits and scrolls added up over every page. */
  website: v.object({
    visits: v.number(), visitsBefore: v.number(), events: v.number(), eventsBefore: v.number(), engaged: v.number(), engagedBefore: v.number(),
    pageVisits: v.number(), pageScrolled: v.number(),
  }),
  /** Events on pages that aren't services, which no service gets credit for, and the page with most of them. */
  elsewhere: v.object({
    events: v.number(),
    eventsBefore: v.number(),
    page: v.union(v.null(), v.object({ address: v.string(), name: v.string(), events: v.number() })),
  }),
});
export type ServicesAnswer = typeof servicesValidator.type;
export type ServiceRow = ServicesAnswer["services"][number];

const NOTHING: Omit<ServicesAnswer, "state"> = {
  everyDevice: false, hasBefore: false, from: null, to: null, beforeFrom: null, beforeTo: null, classifications: [], channels: [], services: [], leftOut: 0,
  website: { visits: 0, visitsBefore: 0, events: 0, eventsBefore: 0, engaged: 0, engagedBefore: 0, pageVisits: 0, pageScrolled: 0 },
  elsewhere: { events: 0, eventsBefore: 0, page: null },
};

/** Services above its table, and the table: one answer, so the boxes, dots, map, table and eye always agree. */
export const analyticsServices = tenantQuery({
  args: serviceArgs,
  returns: servicesValidator,
  handler: async (ctx, args) => await readServices(ctx, args),
});

/** Its read, for the page and Ask Hakken alike: the caller's own website only. */
export async function readServices(ctx: SiteReader, args: ObjectType<typeof serviceArgs>): Promise<ServicesAnswer> {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  if (isTrackedHold(site.hold)) return { ...NOTHING, state: "notConnected" };
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return { ...NOTHING, state: "notConnected" };
  const kinds = await readPageKinds(ctx, holdId);
  // A website with no Service Classification sees the page's note saying why it's empty, as Products does for one that doesn't sell.
  const classifications = (kinds?.choices ?? []).filter((choice) => choice.type === SERVICE_TYPE).map((choice) => ({ id: choice.id, name: choice.name }));
  if (!kinds || classifications.length === 0) return { ...NOTHING, state: "noServices" };
  const counted = countedOf(connection);
  const period = args.period as AnalyticsPeriod;
  // A device's pages, while the next collection hasn't built them, are every device's: the page says so.
  const ownKept = args.device !== "" && (await isKept(ctx, holdId, slotKey("page", period, "NOW", args.device, country)));
  const device = ownKept ? args.device : "";
  const everyDevice = args.device !== "" && !ownKept;
  const only: PartOnly = { events: new Set([...counted.map((event) => event.eventName), SCROLL_EVENT]), units: true };
  const pagesNow = await keptRows(ctx, holdId, slotKey("page", period, "NOW", device, country), only, counted);
  if (!pagesNow) return { ...NOTHING, classifications, everyDevice, state: "collecting" };
  const pagesBefore = await keptRows(ctx, holdId, slotKey("page", period, "BEFORE", device, country), only, counted);
  const landingOnly: PartOnly = { events: new Set(), units: false };
  const landingNow = await keptRows(ctx, holdId, slotKey("landing", period, "NOW", device, country), landingOnly, counted);
  const landingBefore = await keptRows(ctx, holdId, slotKey("landing", period, "BEFORE", device, country), landingOnly, counted);
  // The split by channel is kept for every device only.
  const channelRows = { NOW: [] as KeptChannel[], BEFORE: [] as KeptChannel[] };
  if (args.device === "") {
    const channelOnly: PartOnly = { events: new Set(counted.map((event) => event.eventName)), units: false };
    for (const which of ["NOW", "BEFORE"] as const) {
      await eachLandingByChannel(ctx, holdId, period, which, country, "", channelOnly, (row) => {
        const { channel: page, source: channel } = splitChannelKey(row.key);
        channelRows[which].push({ page, channel, figures: { visits: row.visits, engaged: row.engaged, events: conversionsOf(row, counted).conversions } });
      });
    }
  }

  // Every page number read, as its address, at once: each record of addresses read once.
  const refs = new Set<string>();
  for (const list of [pagesNow.rows, pagesBefore?.rows ?? [], landingNow?.rows ?? [], landingBefore?.rows ?? []]) for (const row of list) if (isPageRef(row.key)) refs.add(row.key);
  for (const row of [...channelRows.NOW, ...channelRows.BEFORE]) if (isPageRef(row.page)) refs.add(row.page);
  const numbered = [...refs];
  const decoded = await decodePages(ctx, holdId, numbered);
  const addressOf = new Map(numbered.map((ref, at) => [ref, decoded[at]]));
  const address = (key: string) => addressOf.get(key) ?? key;

  // A service by either of its addresses: a page whose rules name only one of them is still one page.
  const kindOf = new Map<string, string | null>();
  const serviceKind = (page: string): string | null => {
    const key = serviceKeyOf(page);
    if (kindOf.has(key)) return kindOf.get(key)!;
    const own = kinds.kindOf(page);
    const twin = kinds.kindOf(twinOf(page));
    const kind = kinds.typeOf(own) === SERVICE_TYPE ? own : kinds.typeOf(twin) === SERVICE_TYPE ? twin : null;
    kindOf.set(key, kind);
    return kind;
  };

  type Held = { key: string; address: string; page: string; best: number; refs: Set<string>; kind: string; now: Figures; before: Figures; started: number; startedBefore: number; channels: Map<string, [ChannelFigures, ChannelFigures]> };
  const held = new Map<string, Held>();
  const heldFor = (ref: string): Held | null => {
    const page = address(ref);
    const kind = serviceKind(page);
    if (kind === null) return null;
    const key = serviceKeyOf(page);
    const one = held.get(key) ?? held.set(key, { key, address: page, page: ref, best: -1, refs: new Set(), kind, now: noFigures(), before: noFigures(), started: 0, startedBefore: 0, channels: new Map() }).get(key)!;
    one.refs.add(ref);
    return one;
  };
  const website = { pageVisits: 0, pageScrolled: 0 };
  const elsewhere = { events: 0, eventsBefore: 0 };
  const elsewhereByPage = new Map<string, number>();
  for (const row of pagesNow.rows) {
    website.pageVisits += row.figures.visits;
    website.pageScrolled += row.figures.scrolled;
    const one = heldFor(row.key);
    if (!one) {
      elsewhere.events += row.figures.events;
      if (row.figures.events > 0) {
        const page = serviceKeyOf(address(row.key));
        elsewhereByPage.set(page, (elsewhereByPage.get(page) ?? 0) + row.figures.events);
      }
      continue;
    }
    addFigures(one.now, row.figures);
    if (row.figures.visits > one.best) {
      one.best = row.figures.visits;
      one.address = address(row.key);
      one.page = row.key;
    }
  }
  for (const row of pagesBefore?.rows ?? []) {
    const one = heldFor(row.key);
    if (one) addFigures(one.before, row.figures);
    else elsewhere.eventsBefore += row.figures.events;
  }
  for (const row of landingNow?.rows ?? []) {
    const one = heldFor(row.key);
    if (one) one.started += row.figures.visits;
  }
  for (const row of landingBefore?.rows ?? []) {
    const one = heldFor(row.key);
    if (one) one.startedBefore += row.figures.visits;
  }
  const channelTotals = new Map<string, number>();
  for (const which of ["NOW", "BEFORE"] as const) {
    for (const row of channelRows[which]) {
      const one = heldFor(row.page);
      if (!one) continue;
      const pair = one.channels.get(row.channel) ?? one.channels.set(row.channel, [{ visits: 0, engaged: 0, events: 0 }, { visits: 0, engaged: 0, events: 0 }]).get(row.channel)!;
      const into = pair[which === "NOW" ? 0 : 1];
      into.visits += row.figures.visits;
      into.engaged += row.figures.engaged;
      into.events += row.figures.events;
      if (which === "NOW") channelTotals.set(row.channel, (channelTotals.get(row.channel) ?? 0) + row.figures.visits);
      else if (!channelTotals.has(row.channel)) channelTotals.set(row.channel, 0);
    }
  }
  const channels = args.device === "" ? [...channelTotals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([channel]) => channel) : [];

  // The most visits first; a service with none now but some before stays, as it fell.
  const ranked = [...held.values()]
    .filter((one) => one.now.visits > 0 || one.before.visits > 0)
    .sort((left, right) => right.now.visits - left.now.visits || right.before.visits - left.before.visits || left.key.localeCompare(right.key));
  const kept = ranked.slice(0, MOST_SERVICES);
  const topElsewhere = [...elsewhereByPage.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const titles = await titlesOf(ctx, holdId, [...kept.map((one) => one.address), ...(topElsewhere ? [topElsewhere[0]] : [])]);

  // The whole website's own figures, from its totals: a device's, or every device's while it has none.
  const totalOf = async (which: "NOW" | "BEFORE") => (await readSlot(ctx, holdId, slotKey("total", period, which, device, country))) ?? (await readSlot(ctx, holdId, slotKey("total", period, which, "", country)));
  const [totalNow, totalBefore] = [await totalOf("NOW"), await totalOf("BEFORE")];
  const sum = (held: Awaited<ReturnType<typeof totalOf>>) => {
    const rows = held?.rows ?? [];
    return {
      visits: rows.reduce((all, row) => all + row.visits, 0),
      engaged: rows.reduce((all, row) => all + row.engaged, 0),
      events: rows.reduce((all, row) => all + conversionsOf(row, counted).conversions, 0),
    };
  };
  const [siteNow, siteBefore] = [sum(totalNow), sum(totalBefore)];

  return {
    state: "ready",
    everyDevice,
    hasBefore: pagesBefore !== null,
    from: pagesNow.from,
    to: pagesNow.to,
    beforeFrom: pagesBefore?.from ?? null,
    beforeTo: pagesBefore?.to ?? null,
    classifications,
    channels,
    services: kept.map((one) => ({
      key: one.key,
      address: one.address,
      page: one.page,
      name: serviceNameOf(titles.get(one.address), one.address),
      kind: one.kind,
      refs: [...one.refs],
      now: one.now,
      before: one.before,
      started: one.started,
      startedBefore: one.startedBefore,
      byChannel: args.device === "" ? channels.map((channel) => {
        const pair = one.channels.get(channel);
        return pair ? [pair[0].visits, pair[0].engaged, pair[0].events, pair[1].visits, pair[1].engaged, pair[1].events] : [0, 0, 0, 0, 0, 0];
      }) : null,
    })),
    leftOut: ranked.length - kept.length,
    website: {
      visits: siteNow.visits, visitsBefore: siteBefore.visits, events: siteNow.events, eventsBefore: siteBefore.events, engaged: siteNow.engaged, engagedBefore: siteBefore.engaged,
      pageVisits: website.pageVisits, pageScrolled: website.pageScrolled,
    },
    elsewhere: {
      events: elsewhere.events,
      eventsBefore: elsewhere.eventsBefore,
      // The home page by that name: its title is often the business's own ("Digital Growth Agency"), which reads like a service.
      page: topElsewhere ? { address: topElsewhere[0], name: /^https?:\/\/[^/]+\/?$/i.test(topElsewhere[0]) ? pageName(topElsewhere[0]) : serviceNameOf(titles.get(topElsewhere[0]), topElsewhere[0]), events: topElsewhere[1] } : null,
    },
  };
}

/** Whether to list Services in the menu: a website with a Service-type Classification. A shop keeps Products instead. */
export const analyticsHasServices = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // The menu asks for every website it shows: one that isn't the company's answers no, never an error.
    const site = await findMySite(ctx, args.siteId);
    if (!site || isTrackedHold(site.hold)) return false;
    return await hasServiceClassification(ctx, site.hold._id);
  },
});

// ---------------------------------------------------------------------------
// The month chart
// ---------------------------------------------------------------------------

const pointValidator = v.object({ day: v.string(), lastDay: v.optional(v.string()) });
/** A line's figures, a point at a time in the points' order: [visits, page views, events] for a service, [visits, events] by channel. */
const seriesValidator = v.array(v.array(v.number()));
const channelSeriesValidator = v.array(v.object({ channel: v.string(), now: seriesValidator, before: v.union(v.null(), seriesValidator) }));

export const serviceDaysValidator = v.object({
  /** Ready, or the dates' figures not collected yet. */
  state: v.union(v.literal("ready"), v.literal("collecting")),
  points: v.array(pointValidator),
  /** The dates before, each point laid under the dates' point at the same place. Null while they aren't held. */
  before: v.union(v.null(), v.object({ points: v.array(pointValidator) })),
  services: v.array(v.object({ key: v.string(), now: seriesValidator, before: v.union(v.null(), seriesValidator), channels: v.union(v.null(), channelSeriesValidator) })),
  website: v.object({ now: seriesValidator, before: v.union(v.null(), seriesValidator), channels: v.union(v.null(), channelSeriesValidator) }),
  /** Ticked services past `MOST_CHARTED`, the fewest visits, not drawn. */
  leftOut: v.number(),
});
export type ServiceDaysAnswer = typeof serviceDaysValidator.type;

const serviceDaysArgs = {
  ...serviceArgs,
  /** The ticked services, the busiest first, each with the page numbers it's kept under (`analyticsServices`' `refs`). */
  services: v.array(v.object({ key: v.string(), refs: v.array(v.string()) })),
  /** Each split by channel as well: only when the chart shows channels, as it reads twice as much. */
  channels: v.boolean(),
};

/** The month chart's figures: each ticked service's, by channel when asked, and the whole website's. */
export const analyticsServiceDays = tenantQuery({
  args: serviceDaysArgs,
  returns: serviceDaysValidator,
  handler: async (ctx, args) => await readServiceDays(ctx, args),
});

/** Its read, for the page and Ask Hakken's charts alike: the caller's own website only. Nothing is asked of Google. */
export async function readServiceDays(ctx: SiteReader, args: ObjectType<typeof serviceDaysArgs>): Promise<ServiceDaysAnswer> {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const none: ServiceDaysAnswer = { state: "collecting", points: [], before: null, services: [], website: { now: [], before: null, channels: null }, leftOut: 0 };
  if (isTrackedHold(site.hold)) return none;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const newest = connection ? coverageOf(connection, country).newestDay : undefined;
  if (!connection || !newest) return none;
  const period = args.period as AnalyticsPeriod;
  const [total, totalBefore] = [await readSlot(ctx, holdId, slotKey("total", period, "NOW", "", country)), await readSlot(ctx, holdId, slotKey("total", period, "BEFORE", "", country))];
  if (!total) return none;
  const spans = { now: { from: total.from, to: total.to }, before: totalBefore ? { from: totalBefore.from, to: totalBefore.to } : null };
  const frame = (from: string, to: string) => pointsBetween(from, to, newest);
  const nowFrame = frame(spans.now.from, spans.now.to);
  const beforeFrame = spans.before ? frame(spans.before.from, spans.before.to) : null;
  const charted = args.services.slice(0, MOST_CHARTED);
  const byChannel = args.channels && args.device === "";
  const counted = countedOf(connection);

  /** A service's points over a span: its page numbers' series added up, or null while that span isn't held. */
  const serviceSpan = async (refs: readonly string[], span: { from: string; to: string }, points: ReturnType<typeof frame>): Promise<number[][] | null> => {
    const out = points.map(() => [0, 0, 0]);
    let any = false;
    for (const ref of new Set(refs)) {
      const series = await readPageSeries(ctx, connection, "page", ref, args.device, span.from, span.to, country);
      if (series === null) return null;
      any = true;
      const at = new Map(series.map((point) => [point.start, point.row]));
      points.forEach((point, index) => {
        const row = at.get(point.start);
        if (!row) return;
        out[index][0] += row.visits;
        out[index][1] += row.views;
        out[index][2] += conversionsOf(row, counted).conversions;
      });
    }
    return any || refs.length === 0 ? out : null;
  };
  /** Channels' points over a span, [visits, events] each, from the visits that started on the pages: Google splits only those. */
  const channelSpan = (found: { heldFrom: string | null; points: Array<{ start: string; channels: Map<string, ListRow> }> }, span: { from: string }, points: ReturnType<typeof frame>) => {
    if (found.heldFrom === null || span.from < found.heldFrom) return null;
    const names = new Set<string>();
    for (const point of found.points) for (const channel of point.channels.keys()) names.add(channel);
    const at = new Map(found.points.map((point) => [point.start, point.channels]));
    return [...names].map((channel) => ({
      channel,
      series: points.map((point) => {
        const row = at.get(point.start)?.get(channel);
        return row ? [row.visits, conversionsOf(row, counted).conversions] : [0, 0];
      }),
    }));
  };
  const joinChannels = (now: ReturnType<typeof channelSpan>, before: ReturnType<typeof channelSpan>) => {
    if (now === null) return null;
    const earlier = new Map((before ?? []).map((one) => [one.channel, one.series]));
    return now.map((one) => ({ channel: one.channel, now: one.series, before: before === null ? null : earlier.get(one.channel) ?? beforeFrame!.map(() => [0, 0]) }));
  };

  const services: ServiceDaysAnswer["services"] = [];
  for (const service of charted) {
    const now = await serviceSpan(service.refs, spans.now, nowFrame);
    if (now === null) return { ...none, leftOut: Math.max(0, args.services.length - MOST_CHARTED) };
    const before = spans.before && beforeFrame ? await serviceSpan(service.refs, spans.before, beforeFrame) : null;
    let channels: ServiceDaysAnswer["services"][number]["channels"] = null;
    if (byChannel && service.refs.length > 0) {
      const nowChannels = channelSpan(await readPageChannelPoints(ctx, connection, service.refs, spans.now.from, spans.now.to, country), spans.now, nowFrame);
      const beforeChannels = spans.before && beforeFrame ? channelSpan(await readPageChannelPoints(ctx, connection, service.refs, spans.before.from, spans.before.to, country), spans.before, beforeFrame) : null;
      channels = joinChannels(nowChannels, beforeChannels);
    }
    services.push({ key: service.key, now, before, channels });
  }

  // The whole website's own, from its totals, and by channel from its channels' days.
  const websiteSpan = async (span: { from: string; to: string }, points: ReturnType<typeof frame>): Promise<number[][] | null> => {
    const held = await readDayPoints(ctx, connection, "total", args.device, span.from, span.to, country);
    if (!held) return null;
    const at = new Map(held.map((point) => [point.start, merged(point.rows)[0] ?? null]));
    return points.map((point) => {
      const row = at.get(point.start);
      return row ? [row.visits, row.views, conversionsOf(row, counted).conversions] : [0, 0, 0];
    });
  };
  const websiteChannels = async (span: { from: string; to: string }, points: ReturnType<typeof frame>) => {
    const held = await readChannelPoints(ctx, connection, "", span.from, span.to, country);
    if (!held) return null;
    const names = new Set<string>();
    const sums = held.map((point) => {
      const byName = new Map<string, [number, number]>();
      for (const row of point.rows) {
        const name = displayOf(row.key);
        names.add(name);
        const into = byName.get(name) ?? byName.set(name, [0, 0]).get(name)!;
        into[0] += row.visits;
        into[1] += conversionsOf(row, counted).conversions;
      }
      return { start: point.start, byName };
    });
    const at = new Map(sums.map((one) => [one.start, one.byName]));
    return [...names].map((channel) => ({ channel, series: points.map((point) => [...(at.get(point.start)?.get(channel) ?? [0, 0])]) }));
  };
  const websiteNow = (await websiteSpan(spans.now, nowFrame)) ?? nowFrame.map(() => [0, 0, 0]);
  const websiteBefore = spans.before && beforeFrame ? await websiteSpan(spans.before, beforeFrame) : null;
  const siteChannels = byChannel ? joinChannels(await websiteChannels(spans.now, nowFrame), spans.before && beforeFrame ? await websiteChannels(spans.before, beforeFrame) : null) : null;

  const pointOf = (point: ReturnType<typeof frame>[number]) => ({ day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}) });
  const beforeHeld = beforeFrame !== null && services.every((service) => service.before !== null);
  return {
    state: "ready",
    points: nowFrame.map(pointOf),
    before: beforeHeld && beforeFrame ? { points: beforeFrame.map(pointOf) } : null,
    services: beforeHeld ? services : services.map((service) => ({ ...service, before: null, channels: service.channels?.map((one) => ({ ...one, before: null })) ?? null })),
    website: { now: websiteNow, before: beforeHeld ? websiteBefore : null, channels: siteChannels },
    leftOut: Math.max(0, args.services.length - MOST_CHARTED),
  };
}

