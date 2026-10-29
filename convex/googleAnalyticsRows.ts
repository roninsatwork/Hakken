import { v, type Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
// Only the lists' own module and utilities: every Analytics read imports this one, so it imports none of them.
import { LIVE_PARTS, emptyRow, slotKey, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
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

/** A ready-made list, every part of the build screens read, at one moment. */
export async function readSlot(ctx: Reader, holdId: Id<"companyWebsites">, key: string): Promise<Held | null> {
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
): Promise<Held | "LIVE" | null> {
  // One device's list, with every device's read on the way for What Hakken sees to weigh it against.
  const every = device !== "" ? await readSlot(ctx, holdId, slotKey(list, period, which, "", country)) : null;
  if (keep && device !== "") keep.every = every;
  const own = await readSlot(ctx, holdId, slotKey(list, period, which, device, country));
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
  /** Conversions and value against the span before, for "What changed most". */
  conversionsBefore: v.union(v.number(), v.null()),
  valueBefore: v.union(v.number(), v.null()),
  /** A page group's pages: how many it holds. */
  members: v.optional(v.number()),
  /** A page's title, from the website's page list (GA27): only on the rows a screen shows. */
  title: v.optional(v.string()),
  /** A campaign's source and medium, where its tagged link was: "linkedin.com / social" (§18.6.6). */
  source: v.optional(v.string()),
  /** Channels' table (ga-channel-pages-plan.md CH9): the conversions a channel started, by the people it first brought. */
  started: v.optional(v.union(v.number(), v.null())),
  /** Channels' table: the page group most of a channel's visits land on, and its share. */
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
  landsMost: v.optional(v.union(v.null(), v.object({ kind: v.string(), name: v.union(v.string(), v.null()), share: v.number() }))),
});
export type ShownRow = Infer<typeof shownRowValidator>;

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
    conversionsBefore: hadBefore ? (was?.conversions ?? 0) : null,
    valueBefore: hadBefore ? (was?.value ?? 0) : null,
  };
}
