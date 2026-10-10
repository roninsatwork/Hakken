import { v, type Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite } from "./siteAccess";
import { websiteIconUrl } from "./websiteIcons";
import { analyticsStatusValidator } from "./googleAnalyticsSchema";
import { decodePages, isPageRef } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { listOrder, listPageArgs, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { wordStartMatcher } from "./utils/wordStarts";
import { assistantOf, channelOf } from "./utils/aiAssistants";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
import { splitChannelKey, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { slotKey } from "./googleAnalyticsCollect";
import { LIVE_PARTS } from "./googleAnalyticsLive";
import { shiftDay } from "./searchConsoleDays";
import { analyticsPeriodValidator, type AnalyticsList, type AnalyticsPeriod, type AnalyticsWhich } from "./googleAnalyticsSchema";

/**
 * What the Google Analytics screens read (docs/plans/active/google-analytics-plan.md
 * §5): every screen reads its ready-made list by index — searched, sorted and
 * paged on the server, nothing added up while it loads but the rows of the one
 * list it shows (§4.3). Only the caller's own website (`requireMySite`).
 *
 * **Conversions and value are worked out when read** (GA6, §4.3): a row keeps
 * every key event's count and the value Analytics gave it; here only the
 * events the company counts are added up, each at Analytics' own value when
 * Analytics has one and at the value set in Hakken when it has none (§10,
 * Q1). Changing what counts, or a value, re-prices all history at once.
 *
 * **A conversion rate from fewer than 100 visits** is marked `fewVisits`, for
 * the screen to grey (GA22).
 */

/** Visits under which a conversion rate is too few to trust (GA22, §10 Q13). */
export const FEW_VISITS = 100;

/** Rows in "What changed most" (GA22, §10 Q13) and each top list on Overview. */
export const TOP_ROWS = 5;

type Reader = { db: QueryCtx["db"] };

// ---------------------------------------------------------------------------
// Conversions and value, worked out when read
// ---------------------------------------------------------------------------

type Counted = { eventName: string; fromAnalytics: boolean; hakken: number | null };

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

/** Rows added into one: a channel from its sources, a page group from its pages. */
function addInto(target: ListRow, row: ListRow) {
  target.visits += row.visits;
  target.engaged += row.engaged;
  target.seconds += row.seconds;
  target.views += row.views;
  target.purchases += row.purchases;
  target.revenue += row.revenue;
  for (const [event, count] of row.counts) target.counts.set(event, (target.counts.get(event) ?? 0) + count);
  for (const [event, value] of row.values) target.values.set(event, (target.values.get(event) ?? 0) + value);
}

function blank(key: string): ListRow {
  return { key, visits: 0, engaged: 0, seconds: 0, views: 0, purchases: 0, revenue: 0, counts: new Map(), values: new Map() };
}

function grouped(rows: readonly ListRow[], keyOf: (row: ListRow) => string | null): ListRow[] {
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

async function connectionOf(ctx: Reader, holdId: Id<"companyWebsites">) {
  return await ctx.db
    .query("googleAnalyticsConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId))
    .first();
}

type Held = { rows: ListRow[]; from: string; to: string; folded: boolean; thresholded: boolean; cut: boolean };

/** A ready-made list, every part of the build screens read, at one moment. */
async function readSlot(ctx: Reader, holdId: Id<"companyWebsites">, key: string): Promise<Held | null> {
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

/** A list a screen asked of Google live and is held until the next collection (GA20, GA23). */
async function readLive(ctx: Reader, holdId: Id<"companyWebsites">, ask: string): Promise<Held | null> {
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

/** The name a live ask of a page list for one device is held under. */
export function liveAsk(list: "landing" | "page", period: AnalyticsPeriod, from: string, to: string, device: string): string {
  return `${list}|${period}|${from}|${to}|${device}`;
}

/**
 * A list for the dates and device chosen: ready-made, or — a page list for
 * one device (GA20) — asked live, `live` until it has been.
 */
async function readFor(
  ctx: Reader,
  holdId: Id<"companyWebsites">,
  list: AnalyticsList,
  period: AnalyticsPeriod,
  which: AnalyticsWhich,
  device: string,
): Promise<Held | "LIVE" | null> {
  if ((list === "landing" || list === "page") && device !== "") {
    const every = await readSlot(ctx, holdId, slotKey(list, period, which, ""));
    if (!every) return null;
    return (await readLive(ctx, holdId, liveAsk(list, period, every.from, every.to, device))) ?? "LIVE";
  }
  return await readSlot(ctx, holdId, slotKey(list, period, which, device));
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
  /** Conversions and value against the span before, for "What changed most". */
  conversionsBefore: v.union(v.number(), v.null()),
  valueBefore: v.union(v.number(), v.null()),
  /** A page group's pages: how many it holds. */
  members: v.optional(v.number()),
});
export type ShownRow = Infer<typeof shownRowValidator>;

function shown(row: ListRow, before: ListRow | null | undefined, counted: readonly Counted[], hadBefore: boolean): ShownRow {
  const { conversions, value } = conversionsOf(row, counted);
  const was = before ? conversionsOf(before, counted) : null;
  return {
    key: row.key,
    label: row.key,
    visits: row.visits,
    engagementRate: row.visits > 0 ? row.engaged / row.visits : null,
    timePerVisit: row.visits > 0 ? row.seconds / row.visits : null,
    views: row.views,
    conversions,
    conversionRate: row.visits > 0 ? conversions / row.visits : null,
    fewVisits: row.visits < FEW_VISITS,
    value,
    purchases: row.purchases,
    revenue: row.revenue,
    change: hadBefore ? (before && before.visits > 0 ? (row.visits - before.visits) / before.visits : null) : null,
    conversionsBefore: hadBefore ? (was?.conversions ?? 0) : null,
    valueBefore: hadBefore ? (was?.value ?? 0) : null,
  };
}

const SORTS: ListSorts<ShownRow, "name" | "visits" | "engaged" | "time" | "views" | "conversions" | "rate" | "value" | "change"> = {
  name: { value: (row) => row.label, first: "asc" },
  visits: { value: (row) => row.visits, first: "desc" },
  engaged: { value: (row) => row.engagementRate, first: "desc" },
  time: { value: (row) => row.timePerVisit, first: "desc" },
  views: { value: (row) => row.views, first: "desc" },
  conversions: { value: (row) => row.conversions, first: "desc" },
  rate: { value: (row) => row.conversionRate, first: "desc" },
  value: { value: (row) => row.value, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
};
export const sortValidator = v.union(...(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => v.literal(key)));

// ---------------------------------------------------------------------------
// The lists
// ---------------------------------------------------------------------------

export const listKindValidator = v.union(
  /** Each channel, the assistants folded into AI assistants (§4.4). */
  v.literal("channel"),
  /** One channel's sources; AI assistants' by assistant (GA22). */
  v.literal("source"),
  v.literal("landing"),
  /** The landing pages added up into the website's page groups (GA15). */
  v.literal("groups"),
  v.literal("page"),
);
export type ListKind = Infer<typeof listKindValidator>;

const listArgs = {
  siteId: v.id("companyWebsites"),
  list: listKindValidator,
  period: analyticsPeriodValidator,
  device: v.string(),
  /** The channel whose sources are listed. */
  channel: v.optional(v.string()),
  /** Only the pages of one page group (its classification's id, or Not sorted). */
  group: v.optional(v.string()),
  /** Only the rows that made this conversion. */
  eventName: v.optional(v.string()),
  q: v.optional(v.string()),
  sort: v.optional(sortValidator),
  direction: sortDirectionArg,
};

type ListArgs = {
  list: ListKind;
  period: AnalyticsPeriod;
  device: string;
  channel?: string;
  group?: string;
  eventName?: string;
  q?: string;
  sort?: keyof typeof SORTS;
  direction?: "asc" | "desc";
};

export type ListAnswer = {
  rows: ShownRow[];
  /** Not asked yet: the screen asks Google for it (a page list for one device). */
  live: boolean;
  /** The first collection has not built it yet. */
  preparing: boolean;
  from: string | null;
  to: string | null;
  folded: boolean;
  thresholded: boolean;
  cut: boolean;
  /** The website's page groups, for the switch and the filter; null without any. */
  groups: { id: string; name: string }[] | null;
};

const EMPTY: Omit<ListAnswer, "live" | "preparing"> = { rows: [], from: null, to: null, folded: false, thresholded: false, cut: false, groups: null };

/** The display channel of a kept channel row. */
function displayChannel(key: string): string {
  const { channel, source } = splitChannelKey(key);
  return channelOf(channel, source);
}

/** A source as its channel's screen shows it: each assistant by its name (GA22). */
function displaySource(key: string): string {
  const { source } = splitChannelKey(key);
  return assistantOf(source) ?? source;
}

/**
 * A list for the dates, device and filters chosen, searched and sorted — every
 * row, for the caller to page. Page addresses are read whole only when a
 * search, a page group or an order by address needs them; otherwise only the
 * page shown is named (`nameRows`).
 */
export async function readAnalyticsList(ctx: Reader, holdId: Id<"companyWebsites">, args: ListArgs): Promise<ListAnswer> {
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return { ...EMPTY, live: false, preparing: connection?.status === "CONNECTED" };
  const counted = countedOf(connection).filter((event) => !args.eventName || event.eventName === args.eventName);
  const base: AnalyticsList = args.list === "channel" || args.list === "source" ? "channel" : args.list === "page" ? "page" : "landing";
  const now = await readFor(ctx, holdId, base, args.period, "NOW", args.device);
  if (now === "LIVE") return { ...EMPTY, live: true, preparing: false };
  if (!now) return { ...EMPTY, live: false, preparing: true };
  const before = await readFor(ctx, holdId, base, args.period, "BEFORE", args.device);
  const beforeRows = before && before !== "LIVE" ? before.rows : null;

  let rows: ListRow[] = now.rows;
  let earlier: ListRow[] | null = beforeRows;
  if (args.list === "channel") {
    rows = grouped(rows, (row) => displayChannel(row.key));
    earlier = earlier ? grouped(earlier, (row) => displayChannel(row.key)) : null;
  } else if (args.list === "source") {
    const channel = args.channel ?? "";
    const of = (row: ListRow) => (displayChannel(row.key) === channel ? displaySource(row.key) : null);
    rows = grouped(rows, of);
    earlier = earlier ? grouped(earlier, of) : null;
  }

  // Page addresses, read whole only when needed.
  const pageList = args.list === "landing" || args.list === "groups" || args.list === "page";
  const kinds = pageList ? await readPageKinds(ctx, holdId) : null;
  const needAll = pageList && (Boolean(args.q?.trim()) || args.list === "groups" || args.group !== undefined || args.sort === "name");
  const addresses = new Map<string, string>();
  const members = new Map<string, number>();
  if (needAll) {
    const keys = [...new Set([...rows, ...(earlier ?? [])].map((row) => row.key))];
    const named = await decodePages(ctx, holdId, keys);
    keys.forEach((key, index) => addresses.set(key, named[index]));
  }
  if (pageList && kinds && (args.list === "groups" || args.group !== undefined)) {
    const kindOf = (row: ListRow) => kinds.kindOf(addresses.get(row.key) ?? row.key);
    if (args.group !== undefined) {
      rows = rows.filter((row) => kindOf(row) === args.group);
      earlier = earlier ? earlier.filter((row) => kindOf(row) === args.group) : null;
    }
    if (args.list === "groups") {
      for (const row of rows) members.set(kindOf(row), (members.get(kindOf(row)) ?? 0) + 1);
      rows = grouped(rows, kindOf);
      earlier = earlier ? grouped(earlier, kindOf) : null;
    }
  }

  const beforeByKey = new Map((earlier ?? []).map((row) => [row.key, row]));
  let out = rows.map((row) => shown(row, beforeByKey.get(row.key), counted, earlier !== null));
  if (args.eventName) out = out.filter((row) => row.conversions > 0);
  for (const row of out) {
    if (args.list === "groups") {
      row.label = row.key === NOT_SORTED_KIND ? NOT_SORTED_KIND : kinds?.nameOf(row.key) ?? row.key;
      row.members = members.get(row.key) ?? 0;
    } else if (pageList) row.label = addresses.get(row.key) ?? row.key;
  }
  const matches = wordStartMatcher(args.q);
  if (matches) out = out.filter((row) => matches(row.label));
  out.sort(listOrder(SORTS, args.sort ?? (args.list === "page" && counted.length > 0 ? "conversions" : "value"), args.direction, (row) => row.label));
  return {
    rows: out,
    live: false,
    preparing: false,
    from: now.from,
    to: now.to,
    folded: now.folded,
    thresholded: now.thresholded,
    cut: now.cut,
    groups: kinds ? kinds.choices.map((choice) => ({ id: choice.id, name: choice.name })) : null,
  };
}

/** The page addresses of the rows a screen shows, read only for them. */
async function nameRows(ctx: Reader, holdId: Id<"companyWebsites">, rows: ShownRow[]): Promise<ShownRow[]> {
  const refs = rows.filter((row) => isPageRef(row.label));
  if (refs.length === 0) return rows;
  const named = await decodePages(ctx, holdId, refs.map((row) => row.label));
  const byRef = new Map(refs.map((row, index) => [row.label, named[index]]));
  return rows.map((row) => (byRef.has(row.label) ? { ...row, label: byRef.get(row.label)! } : row));
}

const answerValidator = {
  live: v.boolean(),
  preparing: v.boolean(),
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
  folded: v.boolean(),
  thresholded: v.boolean(),
  /** Longer than Google gives in one list: the rest left out (`cut` is the paging's own, the length a list was held to). */
  longer: v.boolean(),
  groups: v.union(v.null(), v.array(v.object({ id: v.string(), name: v.string() }))),
};

/** One page of a list, counted exactly: Channels, a channel's sources, Landing pages, page groups, All pages. */
export const analyticsListPage = tenantQuery({
  args: { ...listArgs, ...listPageArgs },
  returns: v.object({
    rows: v.array(shownRowValidator),
    total: v.number(),
    page: v.number(),
    pages: v.number(),
    size: v.number(),
    cut: v.union(v.number(), v.null()),
    ...answerValidator,
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const list = await readAnalyticsList(ctx, site.hold._id, args);
    const page = pageOfList(list.rows, args.page, args.rows);
    return {
      rows: await nameRows(ctx, site.hold._id, page.rows),
      total: page.total,
      page: page.page,
      pages: page.pages,
      size: page.size,
      cut: null,
      live: list.live,
      preparing: list.preparing,
      from: list.from,
      to: list.to,
      folded: list.folded,
      thresholded: list.thresholded,
      longer: list.cut,
      groups: list.groups,
    };
  },
});

/** Every row of a list, named, in the order on screen: its download. */
export const analyticsListAll = tenantQuery({
  args: listArgs,
  returns: v.object({ rows: v.array(shownRowValidator), live: v.boolean() }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const list = await readAnalyticsList(ctx, site.hold._id, args);
    return { rows: await nameRows(ctx, site.hold._id, list.rows), live: list.live };
  },
});

/** The first few rows of a list, by value, and how many it holds: Overview's and Conversions' short lists (§10, Q14). */
export const analyticsTopList = tenantQuery({
  args: listArgs,
  returns: v.object({ rows: v.array(shownRowValidator), total: v.number(), ...answerValidator }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const list = await readAnalyticsList(ctx, site.hold._id, args);
    return {
      rows: await nameRows(ctx, site.hold._id, list.rows.slice(0, TOP_ROWS)),
      total: list.rows.length,
      live: list.live,
      preparing: list.preparing,
      from: list.from,
      to: list.to,
      folded: list.folded,
      thresholded: list.thresholded,
      longer: list.cut,
      groups: list.groups,
    };
  },
});

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const figureValidator = v.object({
  visits: v.number(),
  engaged: v.number(),
  conversions: v.number(),
  value: v.number(),
  purchases: v.number(),
  revenue: v.number(),
  /** Conversions of counted events with no value anywhere. */
  unvalued: v.number(),
});

function figuresOf(rows: readonly ListRow[], counted: readonly Counted[]) {
  const total = blank("");
  for (const row of rows) addInto(total, row);
  const { conversions, value, unvalued } = conversionsOf(total, counted);
  return { visits: total.visits, engaged: total.engaged, conversions, value, purchases: total.purchases, revenue: total.revenue, unvalued };
}

/**
 * Overview's figures (§5): visits, engaged visits, conversions and value,
 * each with the span before, and what changed most — the pages and channels
 * whose conversions and value moved most (GA22).
 */
export const analyticsOverview = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string() },
  returns: v.object({
    preparing: v.boolean(),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    now: v.union(figureValidator, v.null()),
    before: v.union(figureValidator, v.null()),
    changedMost: v.array(v.object({
      kind: v.union(v.literal("landing"), v.literal("channel")),
      key: v.string(),
      label: v.string(),
      conversions: v.number(),
      value: v.number(),
    })),
    /** Landing pages for one device are asked live: what changed most then holds channels only until they are. */
    landingLive: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    const nothing = {
      preparing: connection?.status === "CONNECTED",
      from: null,
      to: null,
      now: null,
      before: null,
      changedMost: [] as Array<{ kind: "landing" | "channel"; key: string; label: string; conversions: number; value: number }>,
      landingLive: false,
    };
    if (!connection?.newestDay) return nothing;
    const counted = countedOf(connection);
    const now = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device));
    if (!now) return nothing;
    const before = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", args.device));
    const moved: Array<{ kind: "landing" | "channel"; key: string; label: string; conversions: number; value: number }> = [];
    const landing = await readAnalyticsList(ctx, holdId, { list: "landing", period: args.period, device: args.device });
    const channels = await readAnalyticsList(ctx, holdId, { list: "channel", period: args.period, device: args.device });
    for (const [kind, list] of [["landing", landing], ["channel", channels]] as const) {
      for (const row of list.rows) {
        if (row.conversionsBefore === null || row.valueBefore === null) continue;
        const conversions = row.conversions - row.conversionsBefore;
        const value = row.value - row.valueBefore;
        if (conversions !== 0 || value !== 0) moved.push({ kind, key: row.key, label: row.label, conversions, value });
      }
    }
    moved.sort((left, right) => Math.abs(right.value) - Math.abs(left.value) || Math.abs(right.conversions) - Math.abs(left.conversions) || left.label.localeCompare(right.label));
    const top = moved.slice(0, TOP_ROWS);
    const named = await decodePages(ctx, holdId, top.map((row) => row.label));
    return {
      preparing: false,
      from: now.from,
      to: now.to,
      now: figuresOf(now.rows, counted),
      before: before ? figuresOf(before.rows, counted) : null,
      changedMost: top.map((row, index) => ({ ...row, label: row.kind === "landing" ? named[index] : row.label })),
      landingLive: landing.live,
    };
  },
});

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

/** Days a chart reads from the days kept; longer spans read the long charts asked of Google weekly. */
const DAYS_CHARTED = 30;
/** Its records: a part a day, with room to spare. */
const CHART_RECORDS_READ = 100;

/**
 * The website's figures a day at a time over the span chosen, for one device
 * or every device: from the days kept (§4.3) for up to 30 days, from the long
 * chart asked of Google ready-made for the 90 days and 12 months. Each counted
 * event's own line comes with it, for Conversions' chart.
 */
export const analyticsChart = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string() },
  returns: v.object({
    points: v.array(v.object({
      day: v.string(),
      visits: v.number(),
      engaged: v.number(),
      conversions: v.number(),
      value: v.number(),
      events: v.array(v.number()),
    })),
    /** The counted events, in the order of each point's `events`. */
    events: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    const counted = connection ? countedOf(connection) : [];
    const events = counted.map((event) => event.eventName);
    if (!connection?.newestDay) return { points: [], events };
    const point = (day: string, row: ListRow) => {
      const { conversions, value } = conversionsOf(row, counted);
      return { day, visits: row.visits, engaged: row.engaged, conversions, value, events: events.map((event) => row.counts.get(event) ?? 0) };
    };
    if (Number(args.period) <= DAYS_CHARTED) {
      const first = shiftDay(connection.newestDay, -(Number(args.period) - 1));
      const parts = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", holdId).eq("list", "total").eq("device", args.device).gte("day", first))
        .take(CHART_RECORDS_READ);
      return { points: parts.map((part) => point(part.day, unpackPart(part as PackedPart)[0] ?? blank(""))), events };
    }
    const series = await readSlot(ctx, holdId, slotKey("series", args.period, "NOW", args.device));
    return { points: (series?.rows ?? []).map((row) => point(row.key, row)), events };
  },
});

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/**
 * Conversions' table (§5): each kind of conversion the company counts — how
 * many, the value of each and where it is set, the value, and the change on
 * the span before; for a shop, purchases, revenue and the average order (GA7).
 */
export const analyticsConversions = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string() },
  returns: v.object({
    preparing: v.boolean(),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    visits: v.number(),
    visitsBefore: v.union(v.number(), v.null()),
    kinds: v.array(v.object({
      eventName: v.string(),
      count: v.number(),
      countBefore: v.union(v.number(), v.null()),
      /** Each one's value, in hundredths, and where it is set; null with none. */
      each: v.union(v.number(), v.null()),
      setIn: v.union(v.literal("ANALYTICS"), v.literal("HAKKEN"), v.literal("REVENUE"), v.null()),
      value: v.union(v.number(), v.null()),
      valueBefore: v.union(v.number(), v.null()),
    })),
    shop: v.union(v.null(), v.object({ purchases: v.number(), revenue: v.number(), purchasesBefore: v.union(v.number(), v.null()), revenueBefore: v.union(v.number(), v.null()) })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    const nothing = {
      preparing: connection?.status === "CONNECTED",
      from: null,
      to: null,
      visits: 0,
      visitsBefore: null,
      kinds: [] as Array<{ eventName: string; count: number; countBefore: number | null; each: number | null; setIn: "ANALYTICS" | "HAKKEN" | "REVENUE" | null; value: number | null; valueBefore: number | null }>,
      shop: null,
    };
    if (!connection?.newestDay) return nothing;
    const now = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device));
    if (!now) return nothing;
    const before = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", args.device));
    const total = blank("");
    for (const row of now.rows) addInto(total, row);
    const was = before ? blank("") : null;
    if (was && before) for (const row of before.rows) addInto(was, row);
    const valueIn = (row: ListRow, event: Counted) => conversionsOf(row, [event]).value;
    const kinds = countedOf(connection).map((event) => {
      const count = total.counts.get(event.eventName) ?? 0;
      const held = connection.events?.find((one) => one.eventName === event.eventName);
      const purchase = event.eventName === PURCHASE_EVENT;
      const setIn = purchase ? "REVENUE" as const : event.fromAnalytics ? "ANALYTICS" as const : event.hakken !== null ? "HAKKEN" as const : null;
      const value = purchase ? total.revenue
        : event.fromAnalytics ? total.values.get(event.eventName) ?? 0
        : event.hakken !== null ? Math.round(count * event.hakken * 100) : null;
      return {
        eventName: event.eventName,
        count,
        countBefore: was ? was.counts.get(event.eventName) ?? 0 : null,
        each: purchase ? (count > 0 ? Math.round(total.revenue / count) : null)
          : event.fromAnalytics ? Math.round((held?.analyticsValue ?? 0) * 100)
          : event.hakken !== null ? Math.round(event.hakken * 100) : null,
        setIn,
        value,
        valueBefore: was && setIn !== null ? valueIn(was, event) : null,
      };
    });
    const isShop = total.purchases > 0 || (connection.events ?? []).some((event) => event.eventName === PURCHASE_EVENT && event.counted);
    return {
      preparing: false,
      from: now.from,
      to: now.to,
      visits: total.visits,
      visitsBefore: was ? was.visits : null,
      kinds,
      shop: isShop ? { purchases: total.purchases, revenue: total.revenue, purchasesBefore: was ? was.purchases : null, revenueBefore: was ? was.revenue : null } : null,
    };
  },
});

// ---------------------------------------------------------------------------
// The section's websites
// ---------------------------------------------------------------------------

/**
 * The company's own websites, each with its Google Analytics status and its
 * last 30 days — visits, conversions, value — for the section's first page
 * (§5, screen 1).
 */
export const analyticsSites = tenantQuery({
  args: {},
  returns: v.array(v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    iconUrl: v.union(v.string(), v.null()),
    status: v.union(analyticsStatusValidator, v.literal("NOT_CONNECTED")),
    visits: v.union(v.number(), v.null()),
    conversions: v.union(v.number(), v.null()),
    value: v.union(v.number(), v.null()),
    currency: v.union(v.string(), v.null()),
    lastCollectedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx) => {
    if (!ctx.companyId) return [];
    const holds = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
    return await Promise.all(holds.map(async (entry) => {
      const connection = await connectionOf(ctx, entry.hold._id);
      const held = connection?.newestDay ? await readSlot(ctx, entry.hold._id, slotKey("total", "30", "NOW", "")) : null;
      const figures = held && connection ? figuresOf(held.rows, countedOf(connection)) : null;
      return {
        siteId: entry.summary.siteId,
        host: entry.summary.host,
        iconUrl: await websiteIconUrl(ctx, entry.hold.websiteId),
        status: !connection || connection.status === "CONNECTING" ? ("NOT_CONNECTED" as const) : connection.status,
        visits: figures?.visits ?? null,
        conversions: figures?.conversions ?? null,
        value: figures?.value ?? null,
        currency: connection?.currency ?? null,
        lastCollectedAt: connection?.lastCollectedAt ?? null,
      };
    }));
  },
});

// ---------------------------------------------------------------------------
// A landing page's own screen (GA22)
// ---------------------------------------------------------------------------

/**
 * One landing page's figures against the span before, the whole website's
 * engagement for comparison, what its visits converted into, and its chart
 * and channels — those two asked of Google when the screen opens and held
 * (`googleAnalyticsLive.askGoogleAnalyticsLive`); `live` until they are.
 */
export const analyticsLandingPage = tenantQuery({
  args: { siteId: v.id("companyWebsites"), page: v.string(), period: analyticsPeriodValidator, device: v.string() },
  returns: v.union(v.null(), v.object({
    address: v.string(),
    /** The path Analytics names it by, for asking Google. */
    path: v.string(),
    group: v.union(v.string(), v.null()),
    row: v.union(shownRowValidator, v.null()),
    siteEngagementRate: v.union(v.number(), v.null()),
    conversions: v.array(v.object({ eventName: v.string(), count: v.number(), each: v.union(v.number(), v.null()), value: v.union(v.number(), v.null()) })),
    live: v.boolean(),
    points: v.array(v.object({ day: v.string(), visits: v.number(), engaged: v.number(), conversions: v.number(), value: v.number() })),
    channels: v.array(shownRowValidator),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay) return null;
    const counted = countedOf(connection);
    const [address] = await decodePages(ctx, holdId, [args.page]);
    const origin = connection.stream ? new URL(connection.stream).origin : null;
    const path = origin && address.startsWith(origin) ? address.slice(origin.length) || "/" : address.replace(/^https?:\/\/[^/]+/, "") || "/";
    const now = await readFor(ctx, holdId, "landing", args.period, "NOW", args.device);
    const before = await readFor(ctx, holdId, "landing", args.period, "BEFORE", args.device);
    const own = now && now !== "LIVE" ? now.rows.find((row) => row.key === args.page) ?? null : null;
    const was = before && before !== "LIVE" ? before.rows.find((row) => row.key === args.page) ?? null : null;
    const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device));
    const whole = total ? figuresOf(total.rows, counted) : null;
    const kinds = await readPageKinds(ctx, holdId, { pages: [address] });
    const kind = kinds?.kindOf(address) ?? null;
    const every = now && now !== "LIVE" ? now : await readSlot(ctx, holdId, slotKey("landing", args.period, "NOW", ""));
    const from = every?.from ?? "";
    const to = every?.to ?? "";
    const series = await readLive(ctx, holdId, `series:${args.page}|${args.period}|${from}|${to}|${args.device}`);
    const channels = await readLive(ctx, holdId, `channel:${args.page}|${args.period}|${from}|${to}|${args.device}`);
    return {
      address,
      path,
      group: kind && kind !== NOT_SORTED_KIND ? kinds?.nameOf(kind) ?? null : null,
      row: own ? shown(own, was, counted, before !== null && before !== "LIVE") : null,
      siteEngagementRate: whole && whole.visits > 0 ? whole.engaged / whole.visits : null,
      conversions: counted.map((event) => {
        const count = own?.counts.get(event.eventName) ?? 0;
        const each = event.fromAnalytics
          ? Math.round((connection.events?.find((one) => one.eventName === event.eventName)?.analyticsValue ?? 0) * 100)
          : event.hakken !== null ? Math.round(event.hakken * 100) : null;
        const value = own ? conversionsOf({ ...blank(""), counts: new Map([[event.eventName, count]]), values: new Map([[event.eventName, own.values.get(event.eventName) ?? 0]]), revenue: event.eventName === PURCHASE_EVENT ? own.revenue : 0 }, [event]).value : 0;
        return { eventName: event.eventName, count, each, value: count > 0 ? value : null };
      }),
      live: !series || !channels,
      points: (series?.rows ?? []).map((row) => {
        const { conversions, value } = conversionsOf(row, counted);
        return { day: row.key, visits: row.visits, engaged: row.engaged, conversions, value };
      }),
      channels: grouped(channels?.rows ?? [], (row) => displayChannel(row.key))
        .map((row) => shown(row, null, counted, false))
        .sort((left, right) => right.value - left.value || right.visits - left.visits),
    };
  },
});
