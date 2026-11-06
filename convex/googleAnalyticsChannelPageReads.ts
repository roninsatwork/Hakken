import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { addressesOf, classifierFor, displayOf, eachLandingByChannel } from "./googleAnalyticsChannelReads";
import { slotKey } from "./googleAnalyticsCollect";
import { DEVICES } from "./googleAnalyticsConversionsMap";
import { keptCountry } from "./googleAnalyticsCountries";
import { readChannelPoints } from "./googleAnalyticsHistory";
import { periodRange } from "./googleAnalyticsJobs";
import { EVERY_DEVICE, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { SHOP_STEPS_ONLY, connectionOf, conversionsOf, countedOf, readSlot, shopStepsOf, type Counted } from "./googleAnalyticsRows";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { requireMySite, type SiteReader } from "./siteAccess";
import { tenantQuery } from "./tenantFunctions";
import { BASKET_EVENT, CHECKOUT_EVENT } from "./utils/analyticsEvents";
import { chosenActions } from "./utils/campaignActions";
import { NO_PAGE_KIND, OTHER_KIND } from "./utils/sees/analyticsChannel";

/**
 * What Channels reads above its table (docs/plans/active/channels-new-page-plan-2026-11-06.md, step 1): every channel's days with
 * every key event's times in one read, each channel by Classification or device against the dates before, and how far each
 * channel's visits got. Read from the lists Hakken already keeps; nothing is asked of Google. Only the caller's own website. The
 * boxes and the table read the list of channels (`analyticsListPage`), and the boxes' rule is `utils/channelBoxes.ts`.
 */

const argsOf = {
  siteId: v.id("companyWebsites"),
  period: analyticsPeriodValidator,
  device: v.string(),
  /** A home country other than the main one (`fra`); left out for the main one. */
  country: v.optional(v.string()),
};

type Args = { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string };

/** Under this many times, two events the same size aren't the same thing sent twice, however close: 4 forms and 4 phone calls. */
const SENT_TWICE_FROM = 50;
/** Classifications drawn as columns of the squares; the rest are one, Other groups. */
const SQUARE_KINDS = 7;

// ---------------------------------------------------------------------------
// Visits each day, by channel
// ---------------------------------------------------------------------------

const eachDayValidator = v.object({
  /** The dates reach past what is held: the minutes before a new website's two years are filled. */
  live: v.boolean(),
  /** Every channel with visits in these dates, the busiest first: each point's lists are in this order. */
  channels: v.array(v.string()),
  /** The key events that happened in these dates, the most first, one sent twice under two names only once (`chosenActions`). */
  events: v.array(v.object({ eventName: v.string(), counted: v.boolean(), times: v.number() })),
  points: v.array(v.object({
    day: v.string(),
    /** A week's or month's last day, where the past is held by week or month (ga-stored-figures-plan.md SF2b). */
    lastDay: v.optional(v.string()),
    visits: v.array(v.number()),
    /** Each event's times, in `events`' order, then each channel's, in `channels`' order. */
    events: v.array(v.array(v.number())),
  })),
  /** Each channel's visits over the dates they're set against, for the eye. Null while they reach past what is held. */
  before: v.union(v.null(), v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), visits: v.array(v.number()) }))),
});

export const analyticsChannelsEachDay = tenantQuery({
  args: argsOf,
  returns: eachDayValidator,
  handler: async (ctx, args) => await readChannelsEachDay(ctx, args),
});

/** Its read, for the screen and Ask Hakken alike: the caller's own website only. */
export async function readChannelsEachDay(ctx: SiteReader, args: Args) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const none = { live: false, channels: [] as string[], events: [] as Array<{ eventName: string; counted: boolean; times: number }>, points: [] as Array<{ day: string; lastDay?: string; visits: number[]; events: number[][] }>, before: null as Array<{ day: string; lastDay?: string; visits: number[] }> | null };
  if (!connection?.newestDay) return none;
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
  if (!total) return none;
  const held = await readChannelPoints(ctx, connection, args.device, total.from, total.to, country);
  if (!held) return { ...none, live: true };
  const keyEvents = connection.events ?? [];
  const names = keyEvents.map((event) => event.eventName);
  const timesOf = (row: ListRow, event: string) => row.eventTimes?.get(event) ?? row.counts.get(event) ?? 0;
  const points = held.map((point) => {
    const channels = new Map<string, { visits: number; times: number[] }>();
    for (const row of point.rows) {
      const channel = displayOf(row.key);
      const own = channels.get(channel) ?? { visits: 0, times: names.map(() => 0) };
      own.visits += row.visits;
      names.forEach((event, at) => (own.times[at] += timesOf(row, event)));
      channels.set(channel, own);
    }
    return { day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}), channels };
  });
  const visitsOf = new Map<string, number>();
  const eventTotals = new Map<string, number>(names.map((event) => [event, 0]));
  for (const point of points) {
    for (const [channel, own] of point.channels) {
      visitsOf.set(channel, (visitsOf.get(channel) ?? 0) + own.visits);
      names.forEach((event, at) => eventTotals.set(event, (eventTotals.get(event) ?? 0) + own.times[at]));
    }
  }
  const channels = [...visitsOf.entries()].filter(([, visits]) => visits > 0).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([channel]) => channel);
  const chosen = chosenActions(eventTotals, Math.max(1, names.length), SENT_TWICE_FROM);
  const totalBefore = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", "", country));
  const range = totalBefore ?? periodRange(args.period, "BEFORE", connection.newestDay);
  const heldBefore = range ? await readChannelPoints(ctx, connection, args.device, range.from, range.to, country) : null;
  return {
    live: false,
    channels,
    events: chosen.map((eventName) => ({ eventName, counted: keyEvents.find((event) => event.eventName === eventName)?.counted ?? false, times: eventTotals.get(eventName) ?? 0 })),
    points: points.map(({ day, lastDay, channels: own }) => ({
      day,
      ...(lastDay ? { lastDay } : {}),
      visits: channels.map((channel) => own.get(channel)?.visits ?? 0),
      events: chosen.map((event) => channels.map((channel) => own.get(channel)?.times[names.indexOf(event)] ?? 0)),
    })),
    before: heldBefore ? heldBefore.map((point) => {
      const visits = new Map<string, number>();
      for (const row of point.rows) visits.set(displayOf(row.key), (visits.get(displayOf(row.key)) ?? 0) + row.visits);
      return { day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}), visits: channels.map((channel) => visits.get(channel) ?? 0) };
    }) : null,
  };
}

// ---------------------------------------------------------------------------
// Where each channel's visits started: the squares
// ---------------------------------------------------------------------------

type Figures = { visits: number; bought: number; conversions: number };
const noFigures = (): Figures => ({ visits: 0, bought: 0, conversions: 0 });
const addFigures = (into: Figures, from: Figures) => {
  into.visits += from.visits;
  into.bought += from.bought;
  into.conversions += from.conversions;
};
const figuresOfRow = (row: ListRow, counted: readonly Counted[]): Figures => ({ visits: row.visits, bought: row.purchases, conversions: conversionsOf(row, counted).conversions });

/** What's held for one span: each channel's figures by column, and the columns' visits. */
type SpanCells = Map<string, Map<string, Figures>>;

function cellIn(cells: SpanCells, channel: string, column: string): Figures {
  const row = cells.get(channel) ?? cells.set(channel, new Map()).get(channel)!;
  return row.get(column) ?? row.set(column, noFigures()).get(column)!;
}

const figuresValidator = {
  visits: v.number(),
  visitsBefore: v.union(v.number(), v.null()),
  bought: v.number(),
  boughtBefore: v.union(v.number(), v.null()),
  conversions: v.number(),
  conversionsBefore: v.union(v.number(), v.null()),
};

const squaresValidator = v.object({
  /** Nothing held for the dates yet. */
  collecting: v.boolean(),
  /** One device asked for, every device's shown: the list isn't kept by device for these dates. */
  everyDevice: v.boolean(),
  hasBefore: v.boolean(),
  columns: v.array(v.object({
    /** A Classification's id, `NOT_SORTED`, `OTHER`, `NO_PAGE`; or a device. */
    key: v.string(),
    name: v.union(v.string(), v.null()),
    /** Other groups: the Classifications in it, for its hover. */
    holds: v.optional(v.array(v.object({ kind: v.string(), name: v.union(v.string(), v.null()) }))),
    visits: v.number(),
  })),
  rows: v.array(v.object({ channel: v.string(), ...figuresValidator, cells: v.array(v.object(figuresValidator)) })),
});

export const analyticsChannelSquares = tenantQuery({
  args: { ...argsOf, split: v.union(v.literal("kind"), v.literal("device")) },
  returns: squaresValidator,
  handler: async (ctx, args) => await readChannelSquares(ctx, args),
});

const NO_SQUARES: Infer<typeof squaresValidator> = { collecting: true, everyDevice: false, hasBefore: false, columns: [], rows: [] };

/** Each channel by Classification or device, now and before: a read of its own, as a year of both ran a query out of its 64MB (4 November). */
export async function readChannelSquares(ctx: SiteReader, args: Args & { split: "kind" | "device" }): Promise<Infer<typeof squaresValidator>> {
  const site = await requireMySite(ctx, args.siteId);
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, site.hold._id);
  if (!connection?.newestDay) return NO_SQUARES;
  const counted = countedOf(connection);
  return args.split === "device"
    ? await squaresByDevice(ctx, site.hold, args.period, country, counted)
    : await squaresByKind(ctx, site.hold, args.period, args.device, country, counted);
}

/** Each channel's own figures, from the list the table reads, so a row's total says what the table says. */
async function channelTotals(ctx: SiteReader, hold: Doc<"companyWebsites">, period: AnalyticsPeriod, which: "NOW" | "BEFORE", device: string, country: string, counted: readonly Counted[]): Promise<Map<string, Figures> | null> {
  const list = await readSlot(ctx, hold._id, slotKey("channel", period, which, device, country), { events: new Set(counted.map((event) => event.eventName)) });
  if (!list) return null;
  const by = new Map<string, Figures>();
  for (const row of list.rows) {
    const channel = displayOf(row.key);
    addFigures(by.get(channel) ?? by.set(channel, noFigures()).get(channel)!, figuresOfRow(row, counted));
  }
  return by;
}

/** The answer's rows: the channels with visits in either span, the busiest first, each with its squares. */
function squareRows(columns: readonly string[], now: SpanCells, before: SpanCells | null, totals: Map<string, Figures> | null, totalsBefore: Map<string, Figures> | null, cellOf: (cells: SpanCells, channel: string, column: string) => Figures) {
  const figuresWith = (nowFigures: Figures, was: Figures | null) => ({
    visits: nowFigures.visits, visitsBefore: was ? was.visits : null,
    bought: nowFigures.bought, boughtBefore: was ? was.bought : null,
    conversions: nowFigures.conversions, conversionsBefore: was ? was.conversions : null,
  });
  return [...now.keys()].map((channel) => {
    const cells = columns.map((column) => figuresWith(cellOf(now, channel, column), before ? cellOf(before, channel, column) : null));
    const summed = (key: "visits" | "bought" | "conversions") => cells.reduce((sum, cell) => sum + cell[key], 0);
    const whole = totals?.get(channel) ?? { visits: summed("visits"), bought: summed("bought"), conversions: summed("conversions") };
    return { channel, ...figuresWith(whole, before ? totalsBefore?.get(channel) ?? noFigures() : null), cells };
  }).filter((row) => row.visits > 0).sort((left, right) => right.visits - left.visits || left.channel.localeCompare(right.channel));
}

async function squaresByKind(ctx: SiteReader, hold: Doc<"companyWebsites">, period: AnalyticsPeriod, device: string, country: string, counted: readonly Counted[]) {
  const holdId = hold._id;
  const only = { events: new Set(counted.map((event) => event.eventName)) };
  const classifier = await classifierFor(ctx, holdId);
  // Each page read to its address once, whichever span names it first, and each span's rows let go once they're added up.
  const known = new Map<string, string>();
  const readSpan = async (which: "NOW" | "BEFORE") => {
    const rows: Array<{ page: string; channel: string; figures: Figures }> = [];
    const notes = await eachLandingByChannel(ctx, holdId, period, which, country, device, only, (row) => {
      const { channel: page, source: channel } = splitChannelKey(row.key);
      rows.push({ page, channel, figures: figuresOfRow(row, counted) });
    });
    if (!notes) return null;
    const unknown = [...new Set(rows.map((row) => row.page))].filter((page) => !known.has(page));
    for (const [page, address] of await addressesOf(ctx, holdId, unknown)) known.set(page, address);
    const cells: SpanCells = new Map();
    for (const row of rows) addFigures(cellIn(cells, row.channel, classifier.kindOf(known.get(row.page) ?? row.page)), row.figures);
    return { notes, cells };
  };
  const now = await readSpan("NOW");
  if (!now) return NO_SQUARES;
  const before = await readSpan("BEFORE");
  const kindVisits = new Map<string, number>();
  for (const byKind of now.cells.values()) for (const [kind, figures] of byKind) kindVisits.set(kind, (kindVisits.get(kind) ?? 0) + figures.visits);
  // The busiest Classifications a column each, Not sorted yet among them, No page recorded last, the rest as Other groups.
  const ranked = [...kindVisits.entries()].filter(([kind]) => kind !== NO_PAGE_KIND).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([kind]) => kind);
  const named = ranked.slice(0, SQUARE_KINDS);
  const folded = ranked.slice(SQUARE_KINDS);
  const columns = [...named, ...(folded.length > 0 ? [OTHER_KIND] : []), ...(kindVisits.has(NO_PAGE_KIND) ? [NO_PAGE_KIND] : [])];
  const cellOf = (cells: SpanCells, channel: string, column: string) => {
    if (column !== OTHER_KIND) return cells.get(channel)?.get(column) ?? noFigures();
    const rest = noFigures();
    for (const [kind, figures] of cells.get(channel) ?? []) if (!named.includes(kind) && kind !== NO_PAGE_KIND) addFigures(rest, figures);
    return rest;
  };
  // A row's total is the channel's own, as the table says it: every device's where that's what the squares are.
  const listDevice = now.notes.everyDevice ? EVERY_DEVICE : device;
  const totals = await channelTotals(ctx, hold, period, "NOW", listDevice, country, counted);
  const totalsBefore = before ? await channelTotals(ctx, hold, period, "BEFORE", listDevice, country, counted) : null;
  return {
    collecting: false,
    everyDevice: now.notes.everyDevice,
    hasBefore: before !== null,
    columns: columns.map((key) => ({
      key,
      name: classifier.nameOf(key),
      ...(key === OTHER_KIND ? { holds: folded.map((kind) => ({ kind, name: classifier.nameOf(kind) })) } : {}),
      visits: [...now.cells.keys()].reduce((sum, channel) => sum + cellOf(now.cells, channel, key).visits, 0),
    })),
    rows: squareRows(columns, now.cells, before?.cells ?? null, totals, totalsBefore, cellOf),
  };
}

async function squaresByDevice(ctx: SiteReader, hold: Doc<"companyWebsites">, period: AnalyticsPeriod, country: string, counted: readonly Counted[]) {
  const holdId = hold._id;
  const only = { events: new Set(counted.map((event) => event.eventName)) };
  const readSpan = async (which: "NOW" | "BEFORE") => {
    const cells: SpanCells = new Map();
    let held = false;
    for (const device of DEVICES) {
      const list = await readSlot(ctx, holdId, slotKey("channel", period, which, device, country), only);
      if (!list) continue;
      held = true;
      for (const row of list.rows) addFigures(cellIn(cells, displayOf(row.key), device), figuresOfRow(row, counted));
    }
    return held ? cells : null;
  };
  const now = await readSpan("NOW");
  if (!now) return NO_SQUARES;
  const before = await readSpan("BEFORE");
  const cellOf = (cells: SpanCells, channel: string, column: string) => cells.get(channel)?.get(column) ?? noFigures();
  const totals = await channelTotals(ctx, hold, period, "NOW", EVERY_DEVICE, country, counted);
  const totalsBefore = before ? await channelTotals(ctx, hold, period, "BEFORE", EVERY_DEVICE, country, counted) : null;
  return {
    collecting: false,
    everyDevice: false,
    hasBefore: before !== null,
    columns: DEVICES.map((key) => ({ key, name: null, visits: [...now.keys()].reduce((sum, channel) => sum + cellOf(now, channel, key).visits, 0) })).filter((column) => column.visits > 0),
    rows: squareRows(DEVICES.filter((device) => [...now.keys()].some((channel) => cellOf(now, channel, device).visits > 0)), now, before, totals, totalsBefore, cellOf),
  };
}

// ---------------------------------------------------------------------------
// How far people got
// ---------------------------------------------------------------------------

const stepsValidator = { arrived: v.number(), stayed: v.number(), basket: v.number(), checkout: v.number(), bought: v.number() };

const channelStepsValidator = v.object({
  collecting: v.boolean(),
  /** One device asked for, every device's shown: the lists aren't kept by device for these dates. */
  everyDevice: v.boolean(),
  /** Whether the website sends each step, so one it doesn't send is left off rather than drawn as nobody. */
  tracks: v.object({ basket: v.boolean(), checkout: v.boolean() }),
  /** The whole website, by Google's own total. Every list of channels is counted on its own, so they can add up to a little more or less. */
  everywhere: v.union(v.null(), v.object(stepsValidator)),
  channels: v.array(v.object({ channel: v.string(), ...stepsValidator })),
});

export const analyticsChannelSteps = tenantQuery({
  args: argsOf,
  returns: channelStepsValidator,
  handler: async (ctx, args) => await readChannelSteps(ctx, args),
});

const stepsOf = (row: ListRow) => {
  const steps = shopStepsOf(row);
  return { arrived: row.visits, stayed: steps.engaged, basket: steps.basketVisits, checkout: steps.checkoutVisits, bought: steps.boughtVisits };
};

/** How many visits reached each step, for the whole website and each channel, in visits: no step can pass 100%. Its read, for the screen and Ask Hakken alike. */
export async function readChannelSteps(ctx: SiteReader, args: Args) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const none = { collecting: true, everyDevice: false, tracks: { basket: false, checkout: false }, everywhere: null, channels: [] };
  if (!connection?.newestDay) return none;
  const own = await readSlot(ctx, holdId, slotKey("channel", args.period, "NOW", args.device, country), SHOP_STEPS_ONLY);
  const every = !own && args.device !== EVERY_DEVICE ? await readSlot(ctx, holdId, slotKey("channel", args.period, "NOW", EVERY_DEVICE, country), SHOP_STEPS_ONLY) : null;
  const list = own ?? every;
  if (!list) return none;
  const device = own ? args.device : EVERY_DEVICE;
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", device, country), SHOP_STEPS_ONLY);
  const channels = new Map<string, ReturnType<typeof stepsOf>>();
  for (const row of list.rows) {
    const channel = displayOf(row.key);
    const steps = stepsOf(row);
    const held = channels.get(channel);
    channels.set(channel, held ? { arrived: held.arrived + steps.arrived, stayed: held.stayed + steps.stayed, basket: held.basket + steps.basket, checkout: held.checkout + steps.checkout, bought: held.bought + steps.bought } : steps);
  }
  const events = new Set((connection.events ?? []).map((event) => event.eventName));
  const wholeRow = total?.rows[0];
  return {
    collecting: false,
    everyDevice: !own && args.device !== EVERY_DEVICE,
    tracks: { basket: events.has(BASKET_EVENT), checkout: events.has(CHECKOUT_EVENT) },
    everywhere: wholeRow ? stepsOf(wholeRow) : null,
    channels: [...channels.entries()].map(([channel, steps]) => ({ channel, ...steps })).filter((row) => row.arrived > 0).sort((left, right) => right.arrived - left.arrived || left.channel.localeCompare(right.channel)),
  };
}
