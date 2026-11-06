import { v, type ObjectType } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { foldedKinds, kindsOf } from "./googleAnalyticsConversionsMap";
import { EVERY_DEVICE, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { connectionOf, conversionsOf, countedOf, readSlot, type Counted } from "./googleAnalyticsRows";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { channelOf } from "./utils/aiAssistants";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { NO_PAGE_KIND, OTHER_KIND } from "./utils/sees/analyticsChannel";

/**
 * What Overview's squares and bands draw (overview-new-page-plan-2026-11-06.md, step 3): for one way of splitting a
 * website's visits, each row's figures and what its visits did, now and in the dates before. Built on the lists the
 * nightly runs keep, so nothing is asked of Google. The page, the eye and Ask Hakken all read it, so they can't disagree.
 */

export const OVERVIEW_SPLITS = ["channel", "kind", "device", "visitorType"] as const;
export type OverviewSplit = (typeof OVERVIEW_SPLITS)[number];

const DEVICES = ["desktop", "mobile", "tablet"] as const;
/** The events a shop's steps need, whether or not they're counted as conversions. */
const SHOP_EVENTS = ["add_to_cart", "begin_checkout", "purchase"] as const;

const splitArgs = {
  siteId: v.id("companyWebsites"),
  period: analyticsPeriodValidator,
  device: v.string(),
  country: v.optional(v.string()),
  split: v.union(...OVERVIEW_SPLITS.map((split) => v.literal(split))),
};

const nullableNumber = v.union(v.number(), v.null());
const nullableNumbers = v.union(v.array(v.number()), v.null());

export const overviewSplitValidator = v.object({
  /** Nothing held for the dates yet. */
  collecting: v.boolean(),
  /** One device asked for, every device's shown: this list isn't kept by device for these dates. */
  everyDevice: v.boolean(),
  /** Whether the dates before are held. */
  hasBefore: v.boolean(),
  /** The events, the counted ones the busiest first. `did` and `times` on each row line up with this. */
  events: v.array(v.object({ name: v.string(), counted: v.boolean() })),
  rows: v.array(v.object({
    /** A channel's name, a Classification's id, a device, or new or returning. */
    key: v.string(),
    /** A Classification's name; null for anything else, or where the key says it. */
    name: v.union(v.string(), v.null()),
    visits: v.number(),
    stayed: v.number(),
    views: v.number(),
    length: v.number(),
    bought: v.number(),
    conversions: v.number(),
    /** The visits that did each event at least once, and the times it happened. */
    did: v.array(v.number()),
    times: v.array(v.number()),
    visitsBefore: nullableNumber,
    stayedBefore: nullableNumber,
    viewsBefore: nullableNumber,
    boughtBefore: nullableNumber,
    conversionsBefore: nullableNumber,
    didBefore: nullableNumbers,
    timesBefore: nullableNumbers,
  })),
});

export const analyticsOverviewSplit = tenantQuery({
  args: splitArgs,
  returns: overviewSplitValidator,
  handler: async (ctx, args) => await readOverviewSplit(ctx, args),
});

type Sum = { visits: number; stayed: number; views: number; length: number; bought: number; conversions: number; did: Map<string, number>; times: Map<string, number> };
const blankSum = (): Sum => ({ visits: 0, stayed: 0, views: 0, length: 0, bought: 0, conversions: 0, did: new Map(), times: new Map() });

function addRow(into: Sum, row: ListRow, events: readonly string[], counted: readonly Counted[]) {
  into.visits += row.visits;
  into.stayed += row.engaged;
  into.views += row.views;
  into.length += row.length;
  into.bought += row.purchases;
  into.conversions += conversionsOf(row, counted).conversions;
  for (const event of events) {
    const count = row.counts.get(event) ?? 0;
    into.did.set(event, (into.did.get(event) ?? 0) + (row.eventVisits?.get(event) ?? count));
    into.times.set(event, (into.times.get(event) ?? 0) + (row.eventTimes?.get(event) ?? count));
  }
}

function addSum(into: Sum, from: Sum) {
  into.visits += from.visits;
  into.stayed += from.stayed;
  into.views += from.views;
  into.length += from.length;
  into.bought += from.bought;
  into.conversions += from.conversions;
  for (const [event, count] of from.did) into.did.set(event, (into.did.get(event) ?? 0) + count);
  for (const [event, count] of from.times) into.times.set(event, (into.times.get(event) ?? 0) + count);
}

type Span = { held: boolean; everyDevice: boolean; by: Map<string, Sum>; nameOf: (key: string) => string | null };

async function spanOf(
  ctx: SiteReader,
  hold: Doc<"companyWebsites">,
  period: AnalyticsPeriod,
  which: "NOW" | "BEFORE",
  device: string,
  country: string,
  split: OverviewSplit,
  events: readonly string[],
  counted: readonly Counted[],
): Promise<Span> {
  const holdId = hold._id;
  const by = new Map<string, Sum>();
  const into = (key: string) => by.get(key) ?? by.set(key, blankSum()).get(key)!;
  if (split === "device") {
    let held = false;
    for (const one of DEVICES) {
      const slot = await readSlot(ctx, holdId, slotKey("total", period, which, one, country));
      if (!slot) continue;
      held = true;
      for (const row of slot.rows) addRow(into(one), row, events, counted);
    }
    return { held, everyDevice: false, by, nameOf: () => null };
  }
  const list = split === "kind" ? "landing" : split;
  let everyDevice = false;
  let slot = await readSlot(ctx, holdId, slotKey(list, period, which, device, country));
  if (!slot && device !== EVERY_DEVICE) {
    slot = await readSlot(ctx, holdId, slotKey(list, period, which, EVERY_DEVICE, country));
    everyDevice = slot !== null;
  }
  if (!slot) return { held: false, everyDevice, by, nameOf: () => null };
  if (split === "channel") {
    for (const row of slot.rows) {
      const { channel, source } = splitChannelKey(row.key);
      addRow(into(channelOf(channel, source)), row, events, counted);
    }
    return { held: true, everyDevice, by, nameOf: () => null };
  }
  if (split === "visitorType") {
    for (const row of slot.rows) addRow(into(row.key), row, events, counted);
    return { held: true, everyDevice, by, nameOf: () => null };
  }
  const kinds = await kindsOf(ctx, holdId, slot.rows.map((row) => row.key));
  for (const row of slot.rows) addRow(into(kinds.kindOf(row.key)), row, events, counted);
  return { held: true, everyDevice, by, nameOf: kinds.nameOf };
}

/** The busiest Classifications apart, the rest as Other, and visits with no page beside those not sorted yet, in both spans alike. */
function foldClassifications(now: Map<string, Sum>, before: Map<string, Sum>) {
  const rest = foldedKinds(new Map([...now].map(([key, one]) => [key, one.visits])), before.keys());
  for (const by of [now, before]) {
    const other = blankSum();
    for (const key of rest) {
      const one = by.get(key);
      if (!one) continue;
      addSum(other, one);
      by.delete(key);
    }
    if (other.visits > 0) by.set(OTHER_KIND, other);
    const noPage = by.get(NO_PAGE_KIND);
    if (noPage) {
      const sorted = by.get(NOT_SORTED_KIND) ?? by.set(NOT_SORTED_KIND, blankSum()).get(NOT_SORTED_KIND)!;
      addSum(sorted, noPage);
      by.delete(NO_PAGE_KIND);
    }
  }
}

export async function readOverviewSplit(ctx: SiteReader, args: ObjectType<typeof splitArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const hold = site.hold;
  const country = await keptCountry(ctx, hold, args.country);
  const connection = await connectionOf(ctx, hold._id);
  const empty = { collecting: true, everyDevice: false, hasBefore: false, events: [], rows: [] };
  if (!connection?.newestDay) return empty;
  const counted = countedOf(connection);
  const countedNames = new Set(counted.map((event) => event.eventName));
  const listed = [...new Set([...counted.map((event) => event.eventName), ...(connection.events ?? []).map((event) => event.eventName), ...SHOP_EVENTS])];
  const now = await spanOf(ctx, hold, args.period, "NOW", args.device, country, args.split, listed, counted);
  if (!now.held) return empty;
  const before = await spanOf(ctx, hold, args.period, "BEFORE", now.everyDevice ? EVERY_DEVICE : args.device, country, args.split, listed, counted);
  if (args.split === "kind") foldClassifications(now.by, before.by);
  const timesOf = (event: string) => [...now.by.values()].reduce((sum, one) => sum + (one.times.get(event) ?? 0), 0);
  const events = [...listed].sort((left, right) => Number(countedNames.has(right)) - Number(countedNames.has(left)) || timesOf(right) - timesOf(left) || left.localeCompare(right));
  const last = (key: string) => (key === OTHER_KIND ? 1 : key === NOT_SORTED_KIND ? 2 : 0);
  const keys = [...new Set([...now.by.keys(), ...before.by.keys()])]
    .sort((left, right) => last(left) - last(right) || (now.by.get(right)?.visits ?? 0) - (now.by.get(left)?.visits ?? 0) || left.localeCompare(right));
  const blank = blankSum();
  return {
    collecting: false,
    everyDevice: now.everyDevice,
    hasBefore: before.held,
    events: events.map((name) => ({ name, counted: countedNames.has(name) })),
    rows: keys.map((key) => {
      const one = now.by.get(key) ?? blank;
      const was = before.by.get(key) ?? blank;
      const held = before.held;
      return {
        key,
        name: now.nameOf(key) ?? before.nameOf(key),
        visits: one.visits,
        stayed: one.stayed,
        views: one.views,
        length: one.length,
        bought: one.bought,
        conversions: one.conversions,
        did: events.map((event) => one.did.get(event) ?? 0),
        times: events.map((event) => one.times.get(event) ?? 0),
        visitsBefore: held ? was.visits : null,
        stayedBefore: held ? was.stayed : null,
        viewsBefore: held ? was.views : null,
        boughtBefore: held ? was.bought : null,
        conversionsBefore: held ? was.conversions : null,
        didBefore: held ? events.map((event) => was.did.get(event) ?? 0) : null,
        timesBefore: held ? events.map((event) => was.times.get(event) ?? 0) : null,
      };
    }),
  };
}
