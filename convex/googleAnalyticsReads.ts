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
import { emptyRow, splitChannelKey, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { titlesOf, withTitles } from "./pageTitles";
import { LIVE_PARTS } from "./googleAnalyticsLive";
import { shiftDay } from "./searchConsoleDays";
import { analyticsPeriodValidator, type AnalyticsList, type AnalyticsPeriod, type AnalyticsWhich } from "./googleAnalyticsSchema";
import { searchConsoleMonth, searchConsoleMonthValidator } from "./googleAnalyticsConnect";
import { seeing, seen, seenValidator, type Seen, type SeenPhrase } from "./utils/hakkenSees";
import {
  allPagesSees,
  channelSees,
  channelsSees,
  conversionsSees,
  landingSees,
  overviewSees,
  pathOfAddress,
  type ChannelFigures,
} from "./utils/sees/analytics";

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

/**
 * Rows added into one: a channel from its sources, a page group from its
 * pages. People add up only roughly across rows — one person may come by two
 * sources — so a screen shows people only where Google counted the row whole
 * (§18.6.2).
 */
function addInto(target: ListRow, row: ListRow) {
  target.visits += row.visits;
  target.engaged += row.engaged;
  target.seconds += row.seconds;
  target.views += row.views;
  target.purchases += row.purchases;
  target.revenue += row.revenue;
  target.people += row.people;
  target.newPeople += row.newPeople;
  target.length += row.length;
  for (const [event, count] of row.counts) target.counts.set(event, (target.counts.get(event) ?? 0) + count);
  for (const [event, value] of row.values) target.values.set(event, (target.values.get(event) ?? 0) + value);
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

/** A list a screen asked of Google live and is held until the next collection (GA20, GA23). */
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

/** The name a live ask of a page list for one device is held under: another home country's ends with its code (§18.6.1). */
export function liveAsk(list: "landing" | "page", period: AnalyticsPeriod, from: string, to: string, device: string, country = ""): string {
  return `${list}|${period}|${from}|${to}|${device}${country ? `|${country}` : ""}`;
}

/**
 * A list for the dates and device chosen: ready-made, or — a page list for
 * one device (GA20) — asked live, `live` until it has been.
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
  if ((list === "landing" || list === "page") && device !== "") {
    const every = await readSlot(ctx, holdId, slotKey(list, period, which, "", country));
    if (keep) keep.every = every;
    if (!every) return null;
    return (await readLive(ctx, holdId, liveAsk(list, period, every.from, every.to, device, country))) ?? "LIVE";
  }
  return await readSlot(ctx, holdId, slotKey(list, period, which, device, country));
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
  /** Conversions and value against the span before, for "What changed most". */
  conversionsBefore: v.union(v.number(), v.null()),
  valueBefore: v.union(v.number(), v.null()),
  /** A page group's pages: how many it holds. */
  members: v.optional(v.number()),
  /** A page's title, from the website's page list (GA27): only on the rows a screen shows. */
  title: v.optional(v.string()),
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
    conversionsBefore: hadBefore ? (was?.conversions ?? 0) : null,
    valueBefore: hadBefore ? (was?.value ?? 0) : null,
  };
}

const SORTS: ListSorts<ShownRow, "name" | "visits" | "engaged" | "bounce" | "pages" | "people" | "length" | "time" | "views" | "conversions" | "rate" | "value" | "change"> = {
  name: { value: (row) => row.label, first: "asc" },
  visits: { value: (row) => row.visits, first: "desc" },
  engaged: { value: (row) => row.engagementRate, first: "desc" },
  // The fewest bouncing first: the best first, as every Sites table sorts (sortOrder.ts).
  bounce: { value: (row) => row.bounceRate, first: "asc" },
  pages: { value: (row) => row.pagesPerVisit, first: "desc" },
  people: { value: (row) => row.people, first: "desc" },
  length: { value: (row) => row.lengthPerVisit, first: "desc" },
  time: { value: (row) => row.timePerVisit, first: "desc" },
  views: { value: (row) => row.views, first: "desc" },
  conversions: { value: (row) => row.conversions, first: "desc" },
  rate: { value: (row) => row.conversionRate, first: "desc" },
  value: { value: (row) => row.value, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
};
/** The order a list opens in (GA26): All pages by views, Landing pages and page groups by visits, the channels by value. */
export function openingSort(list: ListKind): keyof typeof SORTS {
  return list === "page" ? "views" : list === "landing" || list === "groups" ? "visits" : "value";
}

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
  /** A home country other than the main one, as Search Console names it (`fra`); left out for the main one (§18.6.1). */
  country: v.optional(v.string()),
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
  /** The home country as its lists are named, already checked (`keptCountry`): empty for the main one. */
  country?: string;
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
  /** What Hakken sees reads these: every row the list's own filters leave, whatever is searched. */
  every: ShownRow[];
  /** One device's landing pages asked of Google: every device's rows, to weigh them against. */
  everyDevice: ShownRow[] | null;
  /** The list's rows added up, now and in the span before. */
  totals: { now: Figures; before: Figures | null } | null;
  /** The whole website's visits and engaged visits, from the list read. */
  site: { visits: number; engaged: number } | null;
  /** Whether anything counts as a conversion. */
  counting: boolean;
};

type Figures = ReturnType<typeof figuresOf>;

const EMPTY: Omit<ListAnswer, "live" | "preparing"> = {
  rows: [], from: null, to: null, folded: false, thresholded: false, cut: false, groups: null,
  every: [], everyDevice: null, totals: null, site: null, counting: false,
};

/** The display channel of a kept channel row. */
export function displayChannel(key: string): string {
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
  const counting = countedOf(connection).length > 0;
  const base: AnalyticsList = args.list === "channel" || args.list === "source" ? "channel" : args.list === "page" ? "page" : "landing";
  const kept: { every: Held | null } = { every: null };
  const now = await readFor(ctx, holdId, base, args.period, "NOW", args.device, kept, args.country);
  if (now === "LIVE") return { ...EMPTY, live: true, preparing: false, counting };
  if (!now) return { ...EMPTY, live: false, preparing: true, counting };
  const before = await readFor(ctx, holdId, base, args.period, "BEFORE", args.device, undefined, args.country);
  const beforeRows = before && before !== "LIVE" ? before.rows : null;
  const site = figuresOf(now.rows, counted);

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
  const every = out;
  // One device's landing pages are weighed against every device's, read on the way (GA20).
  const everyDevice = args.list === "landing" && args.group === undefined && args.device !== "" && kept.every
    ? kept.every.rows.map((row) => shown(row, null, counted, false))
    : null;
  const matches = wordStartMatcher(args.q);
  if (matches) out = out.filter((row) => matches(row.label));
  // Page views before money (GA26): All pages opens by views, Landing pages by visits; the channels by value.
  out.sort(listOrder(SORTS, args.sort ?? openingSort(args.list), args.direction, (row) => row.label));
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
    every,
    everyDevice,
    totals: { now: figuresOf(rows, counted), before: earlier ? figuresOf(earlier, counted) : null },
    site: { visits: site.visits, engaged: site.engaged },
    counting,
  };
}

/** The page addresses of the rows a screen shows, and their titles (GA27), read only for them. */
async function nameRows(ctx: Reader, holdId: Id<"companyWebsites">, rows: ShownRow[]): Promise<ShownRow[]> {
  const refs = rows.filter((row) => isPageRef(row.label));
  const named = refs.length > 0 ? await decodePages(ctx, holdId, refs.map((row) => row.label)) : [];
  const byRef = new Map(refs.map((row, index) => [row.label, named[index]]));
  const labelled = rows.map((row) => (byRef.has(row.label) ? { ...row, label: byRef.get(row.label)! } : row));
  return await withTitles(ctx, holdId, labelled, (row) => row.label);
}

/**
 * A box's pages named: each page number its rules quote read to its address
 * — the two or three the box names, never the list's — and shown as its path.
 */
export async function namedSeen(ctx: Reader, holdId: Id<"companyWebsites">, box: Seen): Promise<Seen> {
  const quoted = [...box.says, ...box.steps].flatMap((phrase) => [phrase.text, phrase.more]);
  const refs = [...new Set(quoted.filter((value): value is string => value !== undefined && isPageRef(value)))];
  const named = refs.length > 0 ? await decodePages(ctx, holdId, refs) : [];
  const byRef = new Map(refs.map((ref, index) => [ref, named[index]]));
  const name = (value: string) => pathOfAddress(byRef.get(value) ?? value);
  const rename = <Phrase extends SeenPhrase>(phrase: Phrase): Phrase => ({
    ...phrase,
    ...(phrase.text !== undefined ? { text: name(phrase.text) } : {}),
    ...(phrase.more !== undefined ? { more: name(phrase.more) } : {}),
  });
  return { says: box.says.map(rename), steps: box.steps.map(rename) };
}

/** A channel's figures above its list (§15, screen 5): its sources added up, and the whole website's engagement. */
function channelFigures(list: ListAnswer): ChannelFigures | null {
  if (!list.totals || !list.site) return null;
  const { now, before } = list.totals;
  return {
    visits: now.visits,
    visitsBefore: before?.visits ?? null,
    engaged: now.engaged,
    conversions: now.conversions,
    conversionsBefore: before?.conversions ?? null,
    value: now.value,
    valueBefore: before?.value ?? null,
    siteVisits: list.site.visits,
    siteEngaged: list.site.engaged,
  };
}

/**
 * What Hakken sees on a list's screen (§14): Channels, a channel's own
 * screen, Landing pages (its pages, its page groups, or one device's), and
 * All pages — worked out over every row the list's own filters leave,
 * whatever is searched, from the list already read.
 */
export async function listSeen(
  ctx: Reader,
  site: { holdId: Id<"companyWebsites">; siteId: string },
  args: Pick<ListArgs, "list" | "channel" | "device">,
  list: ListAnswer,
): Promise<Seen> {
  if (list.live || list.preparing) return seen([]);
  const box = args.list === "channel" ? channelsSees(list.every)
    : args.list === "source" ? channelSees(args.channel ?? "", list.every, channelFigures(list), site.siteId)
      : args.list === "page" ? allPagesSees(list.every, list.counting)
        : landingSees(list.every, { groups: args.list === "groups", device: args.device, everyDevice: list.everyDevice });
  return await namedSeen(ctx, site.holdId, box);
}

const channelFiguresValidator = v.object({
  visits: v.number(),
  visitsBefore: v.union(v.number(), v.null()),
  engaged: v.number(),
  conversions: v.number(),
  conversionsBefore: v.union(v.number(), v.null()),
  value: v.number(),
  valueBefore: v.union(v.number(), v.null()),
  siteVisits: v.number(),
  siteEngaged: v.number(),
});

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

/**
 * One page of a list, counted exactly: Channels, a channel's sources, Landing
 * pages, page groups, All pages — with the screen's What Hakken sees, and a
 * channel's own figures above its sources (§15, screen 5).
 */
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
    seen: seenValidator,
    /** A channel's own screen: its figures, against the span before and the whole website's engagement. */
    figures: v.union(v.null(), channelFiguresValidator),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const list = await readAnalyticsList(ctx, site.hold._id, { ...args, country: await keptCountry(ctx, site.hold, args.country) });
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
      seen: await listSeen(ctx, { holdId: site.hold._id, siteId: args.siteId }, args, list),
      figures: args.list === "source" && !list.live && !list.preparing ? channelFigures(list) : null,
    };
  },
});

/** Every row of a list, named, in the order on screen: its download. */
export const analyticsListAll = tenantQuery({
  args: listArgs,
  returns: v.object({ rows: v.array(shownRowValidator), live: v.boolean() }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const list = await readAnalyticsList(ctx, site.hold._id, { ...args, country: await keptCountry(ctx, site.hold, args.country) });
    return { rows: await nameRows(ctx, site.hold._id, list.rows), live: list.live };
  },
});

/** The first few rows of a list, by value, and how many it holds: Overview's and Conversions' short lists (§10, Q14). */
export const analyticsTopList = tenantQuery({
  args: listArgs,
  returns: v.object({ rows: v.array(shownRowValidator), total: v.number(), ...answerValidator }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const list = await readAnalyticsList(ctx, site.hold._id, { ...args, country: await keptCountry(ctx, site.hold, args.country) });
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
  /** Page views, people, new people and the seconds visits lasted (GA24–GA26, §18.6.2). */
  views: v.number(),
  people: v.number(),
  newPeople: v.number(),
  length: v.number(),
  conversions: v.number(),
  value: v.number(),
  purchases: v.number(),
  revenue: v.number(),
  /** Conversions of counted events with no value anywhere. */
  unvalued: v.number(),
});

export function figuresOf(rows: readonly ListRow[], counted: readonly Counted[]) {
  const total = blank("");
  for (const row of rows) addInto(total, row);
  const { conversions, value, unvalued } = conversionsOf(total, counted);
  return {
    visits: total.visits, engaged: total.engaged, views: total.views, people: total.people, newPeople: total.newPeople, length: total.length,
    conversions, value, purchases: total.purchases, revenue: total.revenue, unvalued,
  };
}

type Moved = { kind: "landing" | "channel"; key: string; label: string; conversions: number; value: number; conversionsNow: number; title?: string };

/**
 * Overview's figures (§5): visits, engaged visits, conversions and value,
 * each with the span before, and what changed most — the pages and channels
 * whose conversions and value moved most (GA22) — with What Hakken sees
 * (§14), which weighs them against Search Console's last 30 days.
 */
export const analyticsOverview = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
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
      /** The change in conversions and value on the span before, and the conversions now. */
      conversions: v.number(),
      value: v.number(),
      conversionsNow: v.number(),
      /** A page's title (GA27). */
      title: v.optional(v.string()),
    })),
    /** Landing pages for one device are asked live: what changed most then holds channels only until they are. */
    landingLive: v.boolean(),
    /** Whether anything counts as a conversion. */
    counting: v.boolean(),
    /** Search Console's last 30 days, when it is connected: how often Google shows the pages, and how often they are clicked. */
    searchConsole: searchConsoleMonthValidator,
    seen: seenValidator,
  }),
  handler: seeing(async (ctx, args: { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string }) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    const nothing = {
      preparing: connection?.status === "CONNECTED",
      from: null,
      to: null,
      now: null,
      before: null,
      changedMost: [] as Moved[],
      landingLive: false,
      counting: false,
      searchConsole: null,
    };
    if (!connection?.newestDay) return nothing;
    const counted = countedOf(connection);
    const now = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
    if (!now) return nothing;
    const before = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", args.device, country));
    const moved: Moved[] = [];
    const landing = await readAnalyticsList(ctx, holdId, { list: "landing", period: args.period, device: args.device, country });
    const channels = await readAnalyticsList(ctx, holdId, { list: "channel", period: args.period, device: args.device, country });
    for (const [kind, list] of [["landing", landing], ["channel", channels]] as const) {
      for (const row of list.rows) {
        if (row.conversionsBefore === null || row.valueBefore === null) continue;
        const conversions = row.conversions - row.conversionsBefore;
        const value = row.value - row.valueBefore;
        if (conversions !== 0 || value !== 0) moved.push({ kind, key: row.key, label: row.label, conversions, value, conversionsNow: row.conversions });
      }
    }
    moved.sort((left, right) => Math.abs(right.value) - Math.abs(left.value) || Math.abs(right.conversions) - Math.abs(left.conversions) || left.label.localeCompare(right.label));
    const top = moved.slice(0, TOP_ROWS);
    const named = await decodePages(ctx, holdId, top.map((row) => row.label));
    const titles = await titlesOf(ctx, holdId, top.map((row, index) => (row.kind === "landing" ? named[index] : "")));
    return {
      preparing: false,
      from: now.from,
      to: now.to,
      now: figuresOf(now.rows, counted),
      before: before ? figuresOf(before.rows, counted) : null,
      changedMost: top.map((row, index) => {
        const title = row.kind === "landing" ? titles.get(named[index]) : undefined;
        return { ...row, label: row.kind === "landing" ? named[index] : row.label, ...(title ? { title } : {}) };
      }),
      landingLive: landing.live,
      counting: counted.length > 0,
      searchConsole: await searchConsoleMonth(ctx, holdId),
    };
  }, overviewSees),
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
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
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
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    const counted = connection ? countedOf(connection) : [];
    const events = counted.map((event) => event.eventName);
    if (!connection?.newestDay) return { points: [], events };
    const point = (day: string, row: ListRow) => {
      const { conversions, value } = conversionsOf(row, counted);
      return { day, visits: row.visits, engaged: row.engaged, conversions, value, events: events.map((event) => row.counts.get(event) ?? 0) };
    };
    // Another home country keeps no days: its short charts are ready-made too (§18.6.1).
    if (Number(args.period) <= DAYS_CHARTED && country === "") {
      const first = shiftDay(connection.newestDay, -(Number(args.period) - 1));
      const parts = await ctx.db
        .query("googleAnalyticsDays")
        .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", holdId).eq("list", "total").eq("device", args.device).gte("day", first))
        .take(CHART_RECORDS_READ);
      return { points: parts.map((part) => point(part.day, unpackPart(part as PackedPart)[0] ?? blank(""))), events };
    }
    const series = await readSlot(ctx, holdId, slotKey("series", args.period, "NOW", args.device, country));
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
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
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
    /** The property's key events not counted that happened in these dates, most first: what Nothing counted yet offers to tick. */
    fired: v.array(v.object({ eventName: v.string(), count: v.number() })),
    seen: seenValidator,
  }),
  handler: seeing(async (ctx, args: { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string }) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    const nothing = {
      preparing: connection?.status === "CONNECTED",
      from: null,
      to: null,
      visits: 0,
      visitsBefore: null,
      kinds: [] as Array<{ eventName: string; count: number; countBefore: number | null; each: number | null; setIn: "ANALYTICS" | "HAKKEN" | "REVENUE" | null; value: number | null; valueBefore: number | null }>,
      shop: null,
      fired: [] as Array<{ eventName: string; count: number }>,
    };
    if (!connection?.newestDay) return nothing;
    const now = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
    if (!now) return nothing;
    const before = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", args.device, country));
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
    // Every key event is kept as a column (§12): those not counted are counted here too, for the box.
    const fired = (connection.events ?? [])
      .filter((event) => !event.counted)
      .map((event) => ({ eventName: event.eventName, count: total.counts.get(event.eventName) ?? 0 }))
      .filter((event) => event.count > 0)
      .sort((left, right) => right.count - left.count || left.eventName.localeCompare(right.eventName));
    return {
      preparing: false,
      from: now.from,
      to: now.to,
      visits: total.visits,
      visitsBefore: was ? was.visits : null,
      kinds,
      shop: isShop ? { purchases: total.purchases, revenue: total.revenue, purchasesBefore: was ? was.purchases : null, revenueBefore: was ? was.revenue : null } : null,
      fired,
    };
  }, conversionsSees),
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
    /**
     * For What Hakken sees (§14, screen 1): the 30 days before — one more
     * small ready-made total each — whether anything counts as a conversion,
     * and tracking health's checks failing of all, with the share of visits of
     * unknown origin when that check fails.
     */
    visitsBefore: v.union(v.number(), v.null()),
    valueBefore: v.union(v.number(), v.null()),
    counting: v.boolean(),
    failing: v.number(),
    checks: v.number(),
    unknownShare: v.union(v.number(), v.null()),
  })),
  handler: async (ctx) => {
    if (!ctx.companyId) return [];
    const holds = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
    return await Promise.all(holds.map(async (entry) => {
      const connection = await connectionOf(ctx, entry.hold._id);
      const held = connection?.newestDay ? await readSlot(ctx, entry.hold._id, slotKey("total", "30", "NOW", "")) : null;
      const figures = held && connection ? figuresOf(held.rows, countedOf(connection)) : null;
      const heldBefore = held ? await readSlot(ctx, entry.hold._id, slotKey("total", "30", "BEFORE", "")) : null;
      const before = heldBefore && connection ? figuresOf(heldBefore.rows, countedOf(connection)) : null;
      const checks = connection?.health?.checks ?? [];
      const unknown = checks.find((check) => check.check === "TOO_MUCH_UNKNOWN" && !check.passing);
      return {
        visitsBefore: before?.visits ?? null,
        valueBefore: before?.value ?? null,
        counting: connection ? countedOf(connection).length > 0 : false,
        failing: checks.filter((check) => !check.passing).length,
        checks: checks.length,
        unknownShare: unknown?.share ?? null,
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
