import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { countriesKeptReady } from "./searchConsoleCountries";
import { slotKey } from "./googleAnalyticsCollect";
import { decodePages } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { titlesOf } from "./pageTitles";
import { landingByChannel } from "./googleAnalyticsChannelReads";
import { EVERY_DEVICE, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { connectionOf, countedOf, readSlot } from "./googleAnalyticsRows";
import { readDayPoints } from "./googleAnalyticsHistory";
import { periodRange } from "./googleAnalyticsJobs";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { NO_PAGE_KIND, OTHER_KIND } from "./utils/sees/analyticsChannel";
import { conversionPagesSees } from "./utils/sees/analytics";
import { seenValidator } from "./utils/hakkenSees";

/**
 * The Conversions map and the lines by kind (conversion-charts-plan.md, agreed 2026-10-29): each conversion
 * by the kind of page its visits landed on, or by channel, device or country, in visits, as a rate of the
 * column's visits, or in times — and the same a day at a time, a line per column. Both read what the
 * nightly runs keep; nothing is asked of Google. A row kept before the two units were stored carries only
 * Google's own count, which stands in for both until the next night's run replaces it.
 */

export const conversionColumnsValidator = v.union(v.literal("kind"), v.literal("channel"), v.literal("device"), v.literal("country"));
export type ConversionColumns = "kind" | "channel" | "device" | "country";

const DEVICES = ["desktop", "mobile", "tablet"] as const;


/** A cell's two units; null where the span before is not held. */
const cellValidator = v.object({ visits: v.number(), times: v.number(), visitsBefore: v.union(v.number(), v.null()), timesBefore: v.union(v.number(), v.null()) });

const mapArgs = {
  siteId: v.id("companyWebsites"),
  period: analyticsPeriodValidator,
  device: v.string(),
  country: v.optional(v.string()),
  columns: conversionColumnsValidator,
};

export const conversionsMapValidator = v.object({
  /** Nothing held for the dates yet. */
  collecting: v.boolean(),
  /** One device asked for, every device's shown: the list is not kept by device for these dates. */
  everyDevice: v.boolean(),
  /** Whether the rows carry both units yet: before the first night's run after 2026-10-29 they carry Google's own count only. */
  bothUnits: v.boolean(),
  /** Whether the span before is held, so Compare can show the change. */
  hasBefore: v.boolean(),
  columns: v.array(v.object({ key: v.string(), name: v.union(v.string(), v.null()), visits: v.number(), visitsBefore: v.union(v.number(), v.null()) })),
  rows: v.array(v.object({ eventName: v.string(), counted: v.boolean(), cells: v.array(cellValidator) })),
});

export const analyticsConversionsMap = tenantQuery({
  args: mapArgs,
  returns: conversionsMapValidator,
  handler: async (ctx, args) => await readConversionsMap(ctx, args),
});

type Sums = { visits: number; visitsOf: Map<string, number>; timesOf: Map<string, number>; bothUnits: boolean };
const sums = (): Sums => ({ visits: 0, visitsOf: new Map(), timesOf: new Map(), bothUnits: false });
/** The busiest page kinds drawn apart; the rest one column, Other, as the old grid folded them (MAP_KINDS). */
const MAP_KINDS = 8;

/** The named kinds folded into Other: every one past the `MAP_KINDS` busiest now, and any held only in the span before. */
export function foldedKinds(visitsNow: ReadonlyMap<string, number>, keysBefore: Iterable<string> = []): Set<string> {
  const named = [...visitsNow.keys()].filter((key) => key !== NOT_SORTED_KIND && key !== NO_PAGE_KIND && key !== OTHER_KIND).sort((left, right) => (visitsNow.get(right) ?? 0) - (visitsNow.get(left) ?? 0) || left.localeCompare(right));
  const rest = new Set(named.slice(MAP_KINDS));
  for (const key of keysBefore) if (!visitsNow.has(key) && key !== NOT_SORTED_KIND && key !== NO_PAGE_KIND && key !== OTHER_KIND) rest.add(key);
  return rest;
}

/** The kinds past the busiest folded into Other, in both spans alike, so the columns match the drawing and the headings have room. */
function foldKinds(now: Map<string, Sums>, before: Map<string, Sums>) {
  const rest = foldedKinds(new Map([...now].map(([key, one]) => [key, one.visits])), before.keys());
  if (rest.size === 0) return;
  for (const by of [now, before]) {
    const other = sums();
    for (const key of rest) {
      const one = by.get(key);
      if (!one) continue;
      other.visits += one.visits;
      other.bothUnits ||= one.bothUnits;
      for (const [event, count] of one.visitsOf) other.visitsOf.set(event, (other.visitsOf.get(event) ?? 0) + count);
      for (const [event, count] of one.timesOf) other.timesOf.set(event, (other.timesOf.get(event) ?? 0) + count);
      by.delete(key);
    }
    if (other.visits > 0 || other.visitsOf.size > 0) by.set(OTHER_KIND, other);
  }
}


/** A row's figures added into a column's, each event in both units — Google's own count standing in for both on an older row. */
function addRow(into: Sums, row: ListRow, events: readonly string[]) {
  into.visits += row.visits;
  if (row.eventVisits && row.eventVisits.size > 0) into.bothUnits = true;
  for (const event of events) {
    const count = row.counts.get(event) ?? 0;
    into.visitsOf.set(event, (into.visitsOf.get(event) ?? 0) + (row.eventVisits?.get(event) ?? count));
    into.timesOf.set(event, (into.timesOf.get(event) ?? 0) + (row.eventTimes?.get(event) ?? count));
  }
}

/** Each page's kind, from the page keys a list carries: its classification, Unclassified, or no page recorded. */
async function kindsOf(ctx: SiteReader, holdId: Id<"companyWebsites">, keys: readonly string[]) {
  const kinds = await readPageKinds(ctx, holdId);
  const unique = [...new Set(keys)];
  const addresses = await decodePages(ctx, holdId, unique);
  const byKey = new Map(unique.map((key, index) => [key, addresses[index]]));
  return {
    kindOf: (key: string) => {
      const address = byKey.get(key) ?? key;
      return address === "(not set)" ? NO_PAGE_KIND : kinds ? kinds.kindOf(address) : NOT_SORTED_KIND;
    },
    nameOf: (kind: string) => kinds?.nameOf(kind) ?? null,
  };
}

/** The columns' sums for one span: by kind of landing page, channel, device or country. */
async function columnSums(
  ctx: SiteReader,
  hold: Doc<"companyWebsites">,
  period: AnalyticsPeriod,
  which: "NOW" | "BEFORE",
  device: string,
  country: string,
  columns: ConversionColumns,
  events: readonly string[],
): Promise<{ held: boolean; everyDevice: boolean; by: Map<string, Sums>; nameOf: (key: string) => string | null }> {
  const holdId = hold._id;
  const by = new Map<string, Sums>();
  const into = (key: string) => by.get(key) ?? by.set(key, sums()).get(key)!;
  if (columns === "device") {
    let held = false;
    for (const one of DEVICES) {
      const slot = await readSlot(ctx, holdId, slotKey("total", period, which, one, country));
      if (!slot) continue;
      held = true;
      for (const row of slot.rows) addRow(into(one), row, events);
    }
    return { held, everyDevice: false, by, nameOf: () => null };
  }
  if (columns === "country") {
    const codes = ["", ...(await countriesKeptReady(ctx, hold))];
    let held = false;
    for (const code of codes) {
      const slot = await readSlot(ctx, holdId, slotKey("total", period, which, device, code));
      if (!slot) continue;
      held = true;
      for (const row of slot.rows) addRow(into(code), row, events);
    }
    return { held, everyDevice: false, by, nameOf: () => null };
  }
  const list = columns === "kind" ? "landing" : "channel";
  let everyDevice = false;
  let slot = await readSlot(ctx, holdId, slotKey(list, period, which, device, country));
  if (!slot && device !== EVERY_DEVICE) {
    slot = await readSlot(ctx, holdId, slotKey(list, period, which, EVERY_DEVICE, country));
    everyDevice = slot !== null;
  }
  if (!slot) return { held: false, everyDevice, by, nameOf: () => null };
  if (columns === "channel") {
    for (const row of slot.rows) addRow(into(splitChannelKey(row.key).channel), row, events);
    return { held: true, everyDevice, by, nameOf: (key) => key };
  }
  const kinds = await kindsOf(ctx, holdId, slot.rows.map((row) => row.key));
  for (const row of slot.rows) addRow(into(kinds.kindOf(row.key)), row, events);
  return { held: true, everyDevice, by, nameOf: kinds.nameOf };
}

/** The columns in the order drawn: devices and countries as listed; kinds and channels the busiest first, Unclassified and no page last. */
function orderColumns(columns: ConversionColumns, by: Map<string, Sums>, before: Map<string, Sums>): string[] {
  if (columns === "device") return DEVICES.filter((one) => by.has(one) || before.has(one));
  const keys = [...new Set([...by.keys(), ...before.keys()])];
  if (columns === "country") return keys.sort((left, right) => (left === "" ? -1 : right === "" ? 1 : left.localeCompare(right)));
  const last = (key: string) => (key === OTHER_KIND ? 1 : key === NOT_SORTED_KIND ? 2 : key === NO_PAGE_KIND ? 3 : 0);
  return keys.sort((left, right) => last(left) - last(right) || (by.get(right)?.visits ?? 0) - (by.get(left)?.visits ?? 0) || left.localeCompare(right));
}

export async function readConversionsMap(ctx: SiteReader, args: { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string; columns: ConversionColumns }) {
  const site = await requireMySite(ctx, args.siteId);
  const hold = site.hold;
  const country = await keptCountry(ctx, hold, args.country);
  const connection = await connectionOf(ctx, hold._id);
  const empty = { collecting: true, everyDevice: false, bothUnits: false, hasBefore: false, columns: [], rows: [] };
  if (!connection?.newestDay) return empty;
  const counted = countedOf(connection);
  const countedNames = new Set(counted.map((event) => event.eventName));
  const keyEvents = (connection.events ?? []).map((event) => event.eventName);
  const now = await columnSums(ctx, hold, args.period, "NOW", args.device, country, args.columns, keyEvents);
  if (!now.held) return empty;
  const before = await columnSums(ctx, hold, args.period, "BEFORE", now.everyDevice ? EVERY_DEVICE : args.device, country, args.columns, keyEvents);
  if (args.columns === "kind") foldKinds(now.by, before.by);
  const keys = orderColumns(args.columns, now.by, before.by);
  const total = (event: string) => keys.reduce((sum, key) => sum + (now.by.get(key)?.visitsOf.get(event) ?? 0), 0);
  // The counted kinds, the busiest first, then the key events not counted that happened. A kind that never happened is not drawn.
  const rows = [
    ...counted.map((event) => event.eventName).filter((event) => total(event) > 0).sort((left, right) => total(right) - total(left)).map((eventName) => ({ eventName, counted: true })),
    ...keyEvents.filter((event) => !countedNames.has(event) && total(event) > 0).sort((left, right) => total(right) - total(left)).map((eventName) => ({ eventName, counted: false })),
  ];
  return {
    collecting: false,
    everyDevice: now.everyDevice,
    bothUnits: [...now.by.values()].some((column) => column.bothUnits),
    hasBefore: before.held,
    columns: keys.map((key) => ({ key, name: now.nameOf(key), visits: now.by.get(key)?.visits ?? 0, visitsBefore: before.held ? before.by.get(key)?.visits ?? 0 : null })),
    rows: rows.map((row) => ({
      ...row,
      cells: keys.map((key) => ({
        visits: now.by.get(key)?.visitsOf.get(row.eventName) ?? 0,
        times: now.by.get(key)?.timesOf.get(row.eventName) ?? 0,
        visitsBefore: before.held ? before.by.get(key)?.visitsOf.get(row.eventName) ?? 0 : null,
        timesBefore: before.held ? before.by.get(key)?.timesOf.get(row.eventName) ?? 0 : null,
      })),
    })),
  };
}

// ---------- The pages behind a square ----------

/** Pages listed behind a square, the most conversions first; past this the list says it was cut. */
export const MOST_SQUARE_PAGES = 500;

export const conversionsPagesValidator = v.object({
  /** The list the square was drawn from is not held for these dates. */
  collecting: v.boolean(),
  everyDevice: v.boolean(),
  /** The column's name where the read knows it: a page kind's classification. */
  name: v.union(v.string(), v.null()),
  /** More pages converted than are listed. */
  cut: v.boolean(),
  /** The column's visits, every landing page's together: the rate's base. */
  visits: v.number(),
  /** What Hakken sees of the pages listed. */
  seen: seenValidator,
  rows: v.array(v.object({
    page: v.string(),
    address: v.string(),
    title: v.optional(v.string()),
    visits: v.number(),
    /** The visits that made the conversion, and the times it happened. */
    did: v.number(),
    times: v.number(),
  })),
});

/**
 * The pages behind a square (conversion-charts-plan.md, agreed 2026-10-29: "the pages behind it"): the landing pages
 * in the square's column — a page kind, a channel, a device or a country — on which a visit that made the conversion
 * landed, each with its visits and the conversion in both units, the most conversions first. Read from the landing
 * pages the nightly runs keep, by the same column rule as the map, so a square and its list agree.
 */
export const analyticsConversionsPages = tenantQuery({
  args: { ...mapArgs, key: v.string(), eventName: v.string() },
  returns: conversionsPagesValidator,
  handler: async (ctx, args) => await readConversionsPages(ctx, args),
});

export async function readConversionsPages(ctx: SiteReader, args: { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string; columns: ConversionColumns; key: string; eventName: string }) {
  const site = await requireMySite(ctx, args.siteId);
  const hold = site.hold;
  const holdId = hold._id;
  const country = await keptCountry(ctx, hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const none = { collecting: true, everyDevice: false, name: null, cut: false, visits: 0, seen: conversionPagesSees([]), rows: [] };
  if (!connection?.newestDay) return none;
  let pages: Array<{ page: string; row: ListRow }> = [];
  let everyDevice = false;
  let name: string | null = null;
  if (args.columns === "channel") {
    const held = await landingByChannel(ctx, holdId, args.period, "NOW", country, args.device);
    if (!held) return none;
    everyDevice = held.everyDevice;
    name = args.key;
    for (const row of held.rows) {
      const { channel: page, source: channel } = splitChannelKey(row.key);
      if (channel === args.key) pages.push({ page, row });
    }
  } else {
    // A device's column reads that device's landing pages; a country's, that country's; a kind's, the ones shown.
    const device = args.columns === "device" ? args.key : args.device;
    const code = args.columns === "country" ? args.key : country;
    let slot = await readSlot(ctx, holdId, slotKey("landing", args.period, "NOW", device, code));
    if (!slot && args.columns !== "device" && device !== EVERY_DEVICE) {
      slot = await readSlot(ctx, holdId, slotKey("landing", args.period, "NOW", EVERY_DEVICE, code));
      everyDevice = slot !== null;
    }
    if (!slot) return none;
    if (args.columns === "kind") {
      const kinds = await kindsOf(ctx, holdId, slot.rows.map((row) => row.key));
      const visitsOf = new Map<string, number>();
      for (const row of slot.rows) visitsOf.set(kinds.kindOf(row.key), (visitsOf.get(kinds.kindOf(row.key)) ?? 0) + row.visits);
      const folded = foldedKinds(visitsOf);
      const columnOf = (key: string) => (folded.has(kinds.kindOf(key)) ? OTHER_KIND : kinds.kindOf(key));
      name = kinds.nameOf(args.key);
      pages = slot.rows.filter((row) => columnOf(row.key) === args.key).map((row) => ({ page: row.key, row }));
    } else {
      pages = slot.rows.map((row) => ({ page: row.key, row }));
    }
  }
  const event = args.eventName;
  const unitsOf = (row: ListRow) => {
    const count = row.counts.get(event) ?? 0;
    return { did: row.eventVisits?.get(event) ?? count, times: row.eventTimes?.get(event) ?? count };
  };
  const visits = pages.reduce((sum, one) => sum + one.row.visits, 0);
  const converted = pages
    .map((one) => ({ ...one, ...unitsOf(one.row) }))
    .filter((one) => one.did > 0 || one.times > 0)
    .sort((left, right) => right.did - left.did || right.times - left.times || right.row.visits - left.row.visits || left.page.localeCompare(right.page));
  const kept = converted.slice(0, MOST_SQUARE_PAGES);
  const addresses = await decodePages(ctx, holdId, kept.map((one) => one.page));
  const titles = await titlesOf(ctx, holdId, addresses);
  const rows = kept.map((one, at) => {
    const address = addresses[at] ?? one.page;
    const title = titles.get(address);
    return { page: one.page, address, ...(title ? { title } : {}), visits: one.row.visits, did: one.did, times: one.times };
  });
  return {
    collecting: false,
    everyDevice,
    name,
    cut: converted.length > kept.length,
    visits,
    seen: conversionPagesSees(rows.map((row) => ({ key: row.page, address: row.address, visits: row.visits, did: row.did }))),
    rows,
  };
}

// ---------- The lines by kind: one conversion, a day at a time, a line per column ----------

export const conversionsByKindValidator = v.object({
  /** The dates reach past what is held by the day: nothing to draw. */
  held: v.boolean(),
  everyDevice: v.boolean(),
  bothUnits: v.boolean(),
  columns: v.array(v.object({ key: v.string(), name: v.union(v.string(), v.null()) })),
  /** Each day (or a week or month held whole, with its last day): every column's visits, and its visits and times with the event. */
  points: v.array(v.object({
    day: v.string(),
    lastDay: v.optional(v.string()),
    cells: v.array(v.object({ visits: v.number(), did: v.number(), times: v.number() })),
  })),
});

export const analyticsConversionsByKindChart = tenantQuery({
  args: { ...mapArgs, eventName: v.string() },
  returns: conversionsByKindValidator,
  handler: async (ctx, args) => await readConversionsByKind(ctx, args),
});

type DayCell = { visits: number; did: number; times: number };
const dayCell = (): DayCell => ({ visits: 0, did: 0, times: 0 });
function addDay(into: DayCell, row: ListRow, event: string, seen: { bothUnits: boolean }) {
  into.visits += row.visits;
  const count = row.counts.get(event) ?? 0;
  if (row.eventVisits && row.eventVisits.size > 0) seen.bothUnits = true;
  into.did += row.eventVisits?.get(event) ?? count;
  into.times += row.eventTimes?.get(event) ?? count;
}

export async function readConversionsByKind(ctx: SiteReader, args: { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string; columns: ConversionColumns; eventName: string }) {
  const site = await requireMySite(ctx, args.siteId);
  const hold = site.hold;
  const holdId = hold._id;
  const country = await keptCountry(ctx, hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const none = { held: false, everyDevice: false, bothUnits: false, columns: [], points: [] };
  if (!connection?.newestDay) return none;
  // The dates: the period as kept, else as the newest day gives them.
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country));
  const range = total ? { from: total.from, to: total.to } : periodRange(args.period, "NOW", connection.newestDay);
  if (!range) return none;
  const seen = { bothUnits: false };
  const event = args.eventName;
  // Each column's cells by point, keyed by the point's start day.
  const byColumn = new Map<string, Map<string, { lastDay?: string; cell: DayCell }>>();
  const cellAt = (column: string, day: string, lastDay?: string) => {
    const points = byColumn.get(column) ?? byColumn.set(column, new Map()).get(column)!;
    return (points.get(day) ?? points.set(day, { lastDay, cell: dayCell() }).get(day)!).cell;
  };
  let nameOf: (key: string) => string | null = () => null;
  const everyDevice = false;
  if (args.columns === "kind") {
    // The landing pages by kind, kept a day at a time (DAY_ONLY_LISTS): a row a kind, the website's classification
    // as it stood the night each day was collected. The busiest kinds apart and the rest Other, as the map folds them.
    const points = await readDayPoints(ctx, connection, "landingKind", args.device, range.from, range.to, country);
    if (!points) return none;
    const kinds = await readPageKinds(ctx, holdId);
    nameOf = (key) => kinds?.nameOf(key) ?? null;
    for (const point of points) for (const row of point.rows) addDay(cellAt(row.key, point.start, point.end), row, event, seen);
    const visitsNow = new Map([...byColumn].map(([key, points]) => [key, [...points.values()].reduce((sum, one) => sum + one.cell.visits, 0)]));
    for (const key of foldedKinds(visitsNow)) {
      for (const [day, point] of byColumn.get(key) ?? []) {
        const other = cellAt(OTHER_KIND, day, point.lastDay);
        other.visits += point.cell.visits;
        other.did += point.cell.did;
        other.times += point.cell.times;
      }
      byColumn.delete(key);
    }
  } else if (args.columns === "channel") {
    const points = await readDayPoints(ctx, connection, "channel", args.device, range.from, range.to, country);
    if (!points) return none;
    nameOf = (key) => key;
    for (const point of points) for (const row of point.rows) addDay(cellAt(splitChannelKey(row.key).channel, point.start, point.end), row, event, seen);
  } else if (args.columns === "device") {
    for (const one of DEVICES) {
      const points = await readDayPoints(ctx, connection, "total", one, range.from, range.to, country);
      if (!points) continue;
      for (const point of points) for (const row of point.rows) addDay(cellAt(one, point.start, point.end), row, event, seen);
    }
    if (byColumn.size === 0) return none;
  } else {
    const codes = ["", ...(await countriesKeptReady(ctx, hold))];
    for (const code of codes) {
      const points = await readDayPoints(ctx, connection, "total", args.device, range.from, range.to, code);
      if (!points) continue;
      for (const point of points) for (const row of point.rows) addDay(cellAt(code, point.start, point.end), row, event, seen);
    }
    if (byColumn.size === 0) return none;
  }
  // Columns in the order drawn, by their visits over the dates; every day any column has, in order.
  const visitsOf = (key: string) => [...(byColumn.get(key)?.values() ?? [])].reduce((sum, one) => sum + one.cell.visits, 0);
  const keys = args.columns === "device" ? DEVICES.filter((one) => byColumn.has(one))
    : args.columns === "country" ? [...byColumn.keys()].sort((left, right) => (left === "" ? -1 : right === "" ? 1 : left.localeCompare(right)))
      : [...byColumn.keys()].sort((left, right) => {
        const last = (key: string) => (key === OTHER_KIND ? 1 : key === NOT_SORTED_KIND ? 2 : key === NO_PAGE_KIND ? 3 : 0);
        return last(left) - last(right) || visitsOf(right) - visitsOf(left) || left.localeCompare(right);
      });
  const days = new Map<string, string | undefined>();
  for (const points of byColumn.values()) for (const [day, point] of points) days.set(day, point.lastDay);
  const ordered = [...days.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  return {
    held: true,
    everyDevice,
    bothUnits: seen.bothUnits,
    columns: keys.map((key) => ({ key, name: nameOf(key) })),
    points: ordered.map(([day, lastDay]) => ({
      day,
      ...(lastDay && lastDay !== day ? { lastDay } : {}),
      cells: keys.map((key) => byColumn.get(key)?.get(day)?.cell ?? dayCell()),
    })),
  };
}
