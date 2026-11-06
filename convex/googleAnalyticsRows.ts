import { v, type Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { BASKET_EVENT, CHECKOUT_EVENT, PURCHASE_EVENT } from "./utils/analyticsEvents";
import { unpackNumbers } from "./utils/searchConsolePacks";
// Only the lists' own module and utilities: every Analytics read imports this one, so it imports none of them.
import { LIVE_PARTS, emptyRow, slotKey, unpackPart, unpackPartOnly, type ListRow, type PackedPart, type PartOnly } from "./googleAnalyticsLists";
import type { AnalyticsList, AnalyticsPeriod, AnalyticsWhich } from "./googleAnalyticsSchema";

/**
 * A Google Analytics list's rows, as kept and as the screens show them
 * (docs/plans/active/google-analytics-plan.md §4.3): conversions and value
 * worked out when read, a ready-made list or one asked live read whole, and a
 * row as a screen shows it. Apart from `googleAnalyticsReads.ts` — which
 * names all of it too — to keep each module inside its size, since every
 * second-round screen reads lists of its own (§18.6).
 */

/** Visits under which a conversion rate is too few to trust (GA22, §10 Q13). */
export const FEW_VISITS = 100;

type Reader = { db: QueryCtx["db"] };

// ---------------------------------------------------------------------------
// Conversions and value, worked out when read
// ---------------------------------------------------------------------------

export type Counted = { eventName: string; fromAnalytics: boolean; hakken: number | null };

/** The events the company counts, and where each one's value comes from. */
export function countedOf(connection: Doc<"googleAnalyticsConnections">): Counted[] {
  return (connection.events ?? []).filter((event) => event.counted).map((event) => ({
    eventName: event.eventName,
    fromAnalytics: event.analyticsValue !== null,
    hakken: event.hakkenValue,
  }));
}

/** A row's conversions and their value in hundredths; a purchase is worth its revenue. */
export function conversionsOf(row: ListRow, counted: readonly Counted[]): { conversions: number; value: number; unvalued: number } {
  let conversions = 0;
  let value = 0;
  let unvalued = 0;
  for (const event of counted) {
    const count = row.counts.get(event.eventName) ?? 0;
    conversions += count;
    if (event.eventName === PURCHASE_EVENT) value += row.revenue;
    else if (event.fromAnalytics) value += row.values.get(event.eventName) ?? 0;
    else if (event.hakken !== null) value += Math.round(count * event.hakken * 100);
    else unvalued += count;
  }
  return { conversions, value, unvalued };
}

/**
 * Rows added into one: a channel from its sources, a page group from its
 * pages. People add up only roughly across rows — one person may come by two
 * sources — so a screen shows people only where Google counted the row whole
 * (§18.6.2).
 */
export function addInto(target: ListRow, row: ListRow) {
  target.visits += row.visits;
  target.engaged += row.engaged;
  target.seconds += row.seconds;
  target.views += row.views;
  target.purchases += row.purchases;
  target.revenue += row.revenue;
  target.people += row.people;
  target.newPeople += row.newPeople;
  target.length += row.length;
  if (row.converting !== undefined) target.converting = (target.converting ?? 0) + row.converting;
  for (const [event, count] of row.counts) target.counts.set(event, (target.counts.get(event) ?? 0) + count);
  for (const [event, value] of row.values) target.values.set(event, (target.values.get(event) ?? 0) + value);
  // Each event's visits and times, where the row carries them (conversion-charts-plan.md).
  if (row.eventVisits) for (const [event, count] of row.eventVisits) (target.eventVisits ??= new Map()).set(event, (target.eventVisits.get(event) ?? 0) + count);
  if (row.eventTimes) for (const [event, count] of row.eventTimes) (target.eventTimes ??= new Map()).set(event, (target.eventTimes.get(event) ?? 0) + count);
}

export function blank(key: string): ListRow {
  return emptyRow(key);
}

export function grouped(rows: readonly ListRow[], keyOf: (row: ListRow) => string | null): ListRow[] {
  const groups = new Map<string, ListRow>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const group = groups.get(key) ?? blank(key);
    addInto(group, row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// Reading a ready-made list
// ---------------------------------------------------------------------------

export async function connectionOf(ctx: Reader, holdId: Id<"companyWebsites">) {
  return await ctx.db
    .query("googleAnalyticsConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId))
    .first();
}

export type Held = { rows: ListRow[]; from: string; to: string; folded: boolean; thresholded: boolean; cut: boolean };

/**
 * A ready-made list, every part of the build screens read, at one moment. With `only`, each row carries only what the
 * read names (`PartOnly`), read a part at a time (`eachSlotPart`): a long list read whole ran its read out of its 64MB.
 */
export async function readSlot(ctx: Reader, holdId: Id<"companyWebsites">, key: string, only?: PartOnly): Promise<Held | null> {
  if (only) {
    const rows: ListRow[] = [];
    const held = await eachSlotPart(ctx, holdId, key, only, (partRows) => {
      for (const row of partRows) rows.push(row);
    });
    return held ? { ...held, rows } : null;
  }
  const slot = await ctx.db
    .query("googleAnalyticsPeriodSlots")
    .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", key))
    .first();
  if (!slot) return null;
  const parts = await ctx.db
    .query("googleAnalyticsPeriods")
    .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", holdId).eq("key", key).eq("slot", slot.slot))
    .take(slot.parts);
  return {
    rows: parts.flatMap((part) => unpackPart(part as PackedPart)),
    from: slot.from,
    to: slot.to,
    folded: slot.folded === true,
    thresholded: slot.thresholded === true,
    cut: slot.cut === true,
  };
}

/**
 * A stored list's rows a part at a time, each with only its key, its visits and the times the named events happened
 * (ask-hakken-every-chart-page-plan-2026-11-03.md). For a read over a long list that needs no more: a year of landing
 * pages by new or returning is 30 parts of 2,000 rows, and read whole as rows it ran the Visits page's query out of its
 * 64MB on Last 6 months and Last 12 months (More Handles, 2026-11-03). Null when the list is not kept.
 */
export async function eachSlotRow(
  ctx: Reader,
  holdId: Id<"companyWebsites">,
  key: string,
  events: readonly string[],
  visit: (key: string, visits: number, times: number) => void,
): Promise<{ from: string; to: string; thresholded: boolean } | null> {
  const slot = await ctx.db
    .query("googleAnalyticsPeriodSlots")
    .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", key))
    .first();
  if (!slot) return null;
  const wanted = new Set(events);
  for (let at = 0; at < slot.parts; at += 1) {
    const part = (await ctx.db
      .query("googleAnalyticsPeriods")
      .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", holdId).eq("key", key).eq("slot", slot.slot).eq("part", at))
      .first()) as PackedPart | null;
    if (!part) continue;
    const visits = unpackNumbers(part.visits);
    const columns = part.events.flatMap((event, index) => (wanted.has(event) ? [unpackNumbers(part.counts[index])] : []));
    part.keys.forEach((rowKey, index) => visit(rowKey, visits[index] ?? 0, columns.reduce((sum, column) => sum + (column[index] ?? 0), 0)));
  }
  return { from: slot.from, to: slot.to, thresholded: slot.thresholded === true };
}

/** A ready-made list's dates and Google's notes on it, without its rows. */
export type SlotNotes = Omit<Held, "rows">;

/**
 * A stored list's rows a part at a time, each part's rows let go before the next is read — with only what the read
 * names (`PartOnly`), or whole as `readSlot` gives them when `only` is null. For a read over a long list that needs a
 * few figures of every row, or every figure of a few rows: `visit` adds each part's into what the read keeps, and is
 * handed the part as kept, for what its rows cannot say (the events it counts). A year of landing pages by channel
 * read whole as rows ran Channels, a channel's page and a page's boxes out of their 64MB on Last 6 and 12 months on
 * More Handles (2026-11-04). Null when the list is not kept.
 */
export async function eachSlotPart(
  ctx: Reader,
  holdId: Id<"companyWebsites">,
  key: string,
  only: PartOnly | null,
  visit: (rows: ListRow[], part: PackedPart) => void,
): Promise<SlotNotes | null> {
  const slot = await ctx.db
    .query("googleAnalyticsPeriodSlots")
    .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", key))
    .first();
  if (!slot) return null;
  for (let at = 0; at < slot.parts; at += 1) {
    const part = (await ctx.db
      .query("googleAnalyticsPeriods")
      .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", holdId).eq("key", key).eq("slot", slot.slot).eq("part", at))
      .first()) as PackedPart | null;
    if (part) visit(only ? unpackPartOnly(part, only) : unpackPart(part), part);
  }
  return { from: slot.from, to: slot.to, folded: slot.folded === true, thresholded: slot.thresholded === true, cut: slot.cut === true };
}

/** A list a screen asked of Google live — an event's funnel, kept a week (ga-stored-figures-plan.md SF8). */
export async function readLive(ctx: Reader, holdId: Id<"companyWebsites">, ask: string): Promise<Held | null> {
  const parts = await ctx.db
    .query("googleAnalyticsLive")
    .withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", holdId).eq("ask", ask))
    .take(LIVE_PARTS);
  if (parts.length === 0 || parts.length < parts[0].parts) return null;
  const [from, to] = ask.split("|").slice(2, 4);
  return {
    rows: parts.flatMap((part) => unpackPart(part as PackedPart)),
    from: from ?? "",
    to: to ?? "",
    folded: parts.some((part) => part.folded === true),
    thresholded: parts.some((part) => part.thresholded === true),
    cut: parts.some((part) => part.cut === true),
  };
}

/**
 * A list for the dates and device chosen, ready-made by each run (GA23) for
 * every device and each (ga-stored-figures-plan.md SF3) — or `LIVE` while a
 * device's list is not built yet, which the next run builds: nothing is asked
 * of Google (SF1).
 */
export async function readFor(
  ctx: Reader,
  holdId: Id<"companyWebsites">,
  list: AnalyticsList,
  period: AnalyticsPeriod,
  which: AnalyticsWhich,
  device: string,
  /** Given, keeps the every device list read on the way, for What Hakken sees to weigh a device against. */
  keep?: { every: Held | null },
  /** The home country, as its lists are named: empty for the main one (§18.6.1). */
  country = "",
  /** Only what the read names of each row (`PartOnly`), for a long list: every device's too. */
  only?: PartOnly,
): Promise<Held | "LIVE" | null> {
  // One device's list, with every device's read on the way for What Hakken sees to weigh it against.
  const every = device !== "" ? await readSlot(ctx, holdId, slotKey(list, period, which, "", country), only) : null;
  if (keep && device !== "") keep.every = every;
  const own = await readSlot(ctx, holdId, slotKey(list, period, which, device, country), only);
  if (own || device === "" || !every) return own;
  return "LIVE";
}

// ---------------------------------------------------------------------------
// A row as the screens show it
// ---------------------------------------------------------------------------

export const shownRowValidator = v.object({
  key: v.string(),
  /** The channel, source or page group's name, or the page's address. */
  label: v.string(),
  visits: v.number(),
  /** Engaged visits over visits, 0–1; null without visits. */
  engagementRate: v.union(v.number(), v.null()),
  /** Seconds engaged a visit; null without visits. */
  timePerVisit: v.union(v.number(), v.null()),
  views: v.number(),
  /** People and new people, as Google counted the row (§18.6.2). */
  people: v.number(),
  newPeople: v.number(),
  /** Visits that didn't engage over visits, 0–1: the engagement rate turned round; null without visits. */
  bounceRate: v.union(v.number(), v.null()),
  /** Views over visits; null without visits. */
  pagesPerVisit: v.union(v.number(), v.null()),
  /** Seconds a visit lasted, start to end; null without visits. */
  lengthPerVisit: v.union(v.number(), v.null()),
  conversions: v.number(),
  /** Conversions over visits, 0–1; null without visits. */
  conversionRate: v.union(v.number(), v.null()),
  /** Under 100 visits: the rate is greyed (GA22). */
  fewVisits: v.boolean(),
  /** In hundredths of the property's currency. */
  value: v.number(),
  purchases: v.number(),
  revenue: v.number(),
  /** Visits against the span before, as a fraction; null when there is none to compare. */
  change: v.union(v.number(), v.null()),
  /** Page views in the span before (All pages' Views change and filters); null when there is none to compare. */
  viewsBefore: v.union(v.number(), v.null()),
  /** All pages' map, when it counts visits. */
  visitsBefore: v.optional(v.union(v.number(), v.null())),
  /** Conversions and value against the span before, for "What changed most". */
  conversionsBefore: v.union(v.number(), v.null()),
  valueBefore: v.union(v.number(), v.null()),
  /** What was bought in the span before: Campaigns' map, boxes and table (campaigns-new-page-plan-2026-11-05.md). */
  purchasesBefore: v.optional(v.union(v.number(), v.null())),
  /** A page group's pages: how many it holds. */
  members: v.optional(v.number()),
  /** A page's title, from the website's page list (GA27): only on the rows a screen shows. */
  title: v.optional(v.string()),
  /** A campaign's source and medium, where its tagged link was: "linkedin.com / social" (§18.6.6). */
  source: v.optional(v.string()),
  /** A campaign's place in a person's words: a code, or its source as it was written (`utils/campaignNames.ts`). */
  cameFrom: v.optional(v.string()),
  /**
   * Channels' table and steps (channels-new-page-plan-2026-11-06.md, steps 6 and 7): the visits that stayed, added to the basket,
   * started checkout and bought, each visit counted once, so none can pass the row's visits. `purchases` counts what was bought.
   */
  engaged: v.optional(v.number()),
  basketVisits: v.optional(v.number()),
  checkoutVisits: v.optional(v.number()),
  boughtVisits: v.optional(v.number()),
  /** An AI assistant on AI assistants' own page (CH8): its visits Google filed outside its own AI Assistant channel. */
  elsewhere: v.optional(v.number()),
  /** A channel's landing page (ga-channel-pages-plan.md CH7): its page group, as the channel's chart groups it. */
  kind: v.optional(v.string()),
  /**
   * Landing pages and page groups (landing-pages-flow-plan.md LF4): the visits
   * that opened another page, counted once a visit; null until a collection
   * has kept them for these dates, device and country.
   */
  onward: v.optional(v.union(v.number(), v.null())),
  /** The page most of those visits opened next: its number, its address once named, and its share of them. */
  next: v.optional(v.union(v.null(), v.object({ key: v.string(), page: v.string(), share: v.number() }))),
  /** Visitors' lists: the page group most of a row's visits land on, and its share. */
  landsMost: v.optional(v.union(v.null(), v.object({ kind: v.string(), name: v.union(v.string(), v.null()), share: v.number() }))),
});
export type ShownRow = Infer<typeof shownRowValidator>;

/** What Channels' steps read of every row: the events a shop's steps count, each in both units. */
export const SHOP_STEPS_ONLY = { events: new Set([BASKET_EVENT, CHECKOUT_EVENT, PURCHASE_EVENT]), units: true } as const;

/**
 * A row's visits at each of a shop's steps. A row kept before both units were has Google's count standing in, and a shop that
 * doesn't send `purchase` as a key event has its purchases.
 */
export function shopStepsOf(row: ListRow): { engaged: number; basketVisits: number; checkoutVisits: number; boughtVisits: number } {
  // Never past the row's visits, where Google's count of times stands in.
  const did = (event: string, otherwise = 0) => Math.min(row.visits, row.eventVisits?.get(event) ?? row.counts.get(event) ?? otherwise);
  return { engaged: row.engaged, basketVisits: did(BASKET_EVENT), checkoutVisits: did(CHECKOUT_EVENT), boughtVisits: did(PURCHASE_EVENT, row.purchases) };
}

export function shown(row: ListRow, before: ListRow | null | undefined, counted: readonly Counted[], hadBefore: boolean): ShownRow {
  const { conversions, value } = conversionsOf(row, counted);
  const was = before ? conversionsOf(before, counted) : null;
  return {
    key: row.key,
    label: row.key,
    visits: row.visits,
    engagementRate: row.visits > 0 ? row.engaged / row.visits : null,
    timePerVisit: row.visits > 0 ? row.seconds / row.visits : null,
    views: row.views,
    people: row.people,
    newPeople: row.newPeople,
    bounceRate: row.visits > 0 ? 1 - row.engaged / row.visits : null,
    pagesPerVisit: row.visits > 0 ? row.views / row.visits : null,
    lengthPerVisit: row.visits > 0 ? row.length / row.visits : null,
    conversions,
    conversionRate: row.visits > 0 ? conversions / row.visits : null,
    fewVisits: row.visits < FEW_VISITS,
    value,
    purchases: row.purchases,
    revenue: row.revenue,
    change: hadBefore ? (before && before.visits > 0 ? (row.visits - before.visits) / before.visits : null) : null,
    viewsBefore: hadBefore ? (before?.views ?? 0) : null,
    visitsBefore: hadBefore ? (before?.visits ?? 0) : null,
    conversionsBefore: hadBefore ? (was?.conversions ?? 0) : null,
    valueBefore: hadBefore ? (was?.value ?? 0) : null,
    purchasesBefore: hadBefore ? (before?.purchases ?? 0) : null,
  };
}
