import { v, type Infer, type ObjectType } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { slotKey } from "./googleAnalyticsCollect";
import { decodePages } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { landingByChannel } from "./googleAnalyticsChannelReads";
import { funnelAsk } from "./googleAnalyticsLive";
import { EVERY_DEVICE, PAGE_FACT_JOIN, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { analyticsPeriodValidator, type AnalyticsPeriod, type PageFactList } from "./googleAnalyticsSchema";
import { connectionOf, conversionsOf, countedOf, readLive, readSlot, type Counted } from "./googleAnalyticsRows";
import { WEBSITE_FUNNEL, actionEvents, actionsFrom } from "./googleAnalyticsActionFunnels";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { NO_PAGE_KIND, OTHER_KIND } from "./utils/sees/analyticsChannel";
import { OTHER_ROWS } from "./utils/analyticsSharedLists";
import { isUnknownValue } from "./utils/analyticsUnknown";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
import { FLOW_LEFT, FLOW_MORE } from "./utils/conversionFlow";

/**
 * What Conversions and Visitors draw beyond their figures
 * (docs/plans/active/ga-conversions-visitors-plan.md CV3, CV4, CV7), worked
 * out when read from what the night's run kept (ga-stored-figures-plan.md
 * SF1, SF16) — never asked of Google:
 *
 * - the flow: where the visits came from, the kind of page they landed on,
 *   and how they ended — each key event, or left without converting — from
 *   landing pages by channel, the list Channels' map reads;
 * - what people did before converting: each action's funnel over 12 months
 *   beside the website's own, kept by the night's run;
 * - where each kind of visitor lands, by page classification.
 *
 * A page with no classification is Unclassified (Anthony, 2026-10-14), and so
 * is every page of a website with none yet. Only the caller's own website.
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;

/** The flow's busiest channels and classifications, the rest one box each (CV11). */
export const FLOW_CHANNELS = 4;
export const FLOW_KINDS = 5;
/** The grid's biggest visitor groups, the rest as Everything else; its classifications as Channels' map (CV11). */
export const MAP_GROUPS = 8;
export const MAP_KINDS = 7;
/** Under this many people a bar's rate is too few to judge: grey, never orange (CV4). */
export const FEW_PEOPLE = 100;

/** The flow's and grid's boxes past the busiest, and how a visit ended without any listed event (`utils/conversionFlow.ts`). */
export const MORE = FLOW_MORE;
export const LEFT = FLOW_LEFT;

/** A page's kind for these two pictures: its classification, Unclassified, or no page recorded. */
async function kindsFor(ctx: Reader, holdId: HoldId) {
  const kinds = await readPageKinds(ctx, holdId);
  return {
    kindOf: (address: string) => (address === "(not set)" ? NO_PAGE_KIND : kinds ? kinds.kindOf(address) : NOT_SORTED_KIND),
    nameOf: (kind: string) => kinds?.nameOf(kind) ?? null,
  };
}

/** Each kept page key as its address. */
async function addressesOf(ctx: Reader, holdId: HoldId, keys: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(keys)];
  const named = await decodePages(ctx, holdId, unique);
  return new Map(unique.map((key, index) => [key, named[index]]));
}

/** The classifications in the order the pictures draw them: the busiest named ones, then the rest, Unclassified, no page. */
function rankKinds(visits: ReadonlyMap<string, number>, most: number): { shown: string[]; rest: Set<string> } {
  const named = [...visits.entries()].filter(([kind]) => kind !== NOT_SORTED_KIND && kind !== NO_PAGE_KIND).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([kind]) => kind);
  const top = named.slice(0, most);
  const rest = new Set(named.slice(most));
  return { shown: [...top, ...(rest.size > 0 ? [OTHER_KIND] : []), ...[NOT_SORTED_KIND, NO_PAGE_KIND].filter((kind) => visits.has(kind))], rest };
}

// ---------------------------------------------------------------------------
// The flow (CV3)
// ---------------------------------------------------------------------------

const routeValidator = v.object({
  from: v.string(),
  to: v.string(),
  visits: v.number(),
  conversions: v.number(),
  /** A shop's purchase revenue on the route, in hundredths. */
  revenue: v.number(),
  /** The channels whose visits took this route: following a channel lights its routes two steps on. */
  channels: v.array(v.string()),
});

export const flowValidator = v.object({
  /** Visits that made a listed event are kept from the run after this was built: until then the flow waits. */
  collecting: v.boolean(),
  /** One device's landing pages by channel not kept yet: every device's are shown. */
  everyDevice: v.boolean(),
  visits: v.number(),
  channels: v.array(v.object({ key: v.string(), visits: v.number(), conversions: v.number(), more: v.number() })),
  kinds: v.array(v.object({ kind: v.string(), name: v.union(v.string(), v.null()), visits: v.number(), conversions: v.number(), more: v.number() })),
  /** Each key event — counted, then not counted — then `LEFT`. */
  endings: v.array(v.object({ key: v.string(), counted: v.boolean(), count: v.number(), revenue: v.number() })),
  routes: v.array(routeValidator),
  /**
   * Conversions by page classification (Anthony, 2026-10-14: "add conversion by page classification … in this style"):
   * each counted kind and each key event not counted that happened, down the side; the classifications across, as
   * Visitors' grid ranks them; each square that event's count from visits that started on that kind of page.
   */
  grid: v.object({
    kinds: v.array(v.object({ kind: v.string(), name: v.union(v.string(), v.null()) })),
    rows: v.array(v.object({ eventName: v.string(), counted: v.boolean(), count: v.number(), cells: v.array(v.number()) })),
  }),
});
export type ConversionFlow = Infer<typeof flowValidator>;

/**
 * The flow for the dates, device and home country: landing pages by channel,
 * each landing page's classification, each key event's count and the visits
 * that made any — channels and classifications past the busiest as one box.
 */
export async function readConversionFlow(
  ctx: Reader,
  holdId: HoldId,
  connection: Doc<"googleAnalyticsConnections">,
  period: AnalyticsPeriod,
  device: string,
  country: string,
): Promise<ConversionFlow | null> {
  const byChannel = await landingByChannel(ctx, holdId, period, "NOW", country, device);
  if (!byChannel) return null;
  // The visits that made a listed event, by landing page: from the list as kept, whatever channel Google filed them under.
  const kept = await readSlot(ctx, holdId, slotKey("landingChannel", period, "NOW", byChannel.everyDevice ? EVERY_DEVICE : device, country));
  const collecting = !kept || kept.rows.every((row) => row.converting === undefined);
  const counted = countedOf(connection);
  const countedNames = new Set(counted.map((event) => event.eventName));
  const keyEvents = (connection.events ?? []).map((event) => event.eventName);
  const kinds = await kindsFor(ctx, holdId);
  const addresses = await addressesOf(ctx, holdId, [...byChannel.rows, ...(kept?.rows ?? [])].map((row) => splitChannelKey(row.key).channel));
  const kindOfPage = (page: string) => kinds.kindOf(addresses.get(page) ?? page);

  // Channels and classifications ranked by visits; the rest one box each.
  const channelVisits = new Map<string, number>();
  const kindVisits = new Map<string, number>();
  for (const row of byChannel.rows) {
    const { channel: page, source: channel } = splitChannelKey(row.key);
    channelVisits.set(channel, (channelVisits.get(channel) ?? 0) + row.visits);
    kindVisits.set(kindOfPage(page), (kindVisits.get(kindOfPage(page)) ?? 0) + row.visits);
  }
  const rankedChannels = [...channelVisits.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([channel]) => channel);
  const shownChannels = new Set(rankedChannels.slice(0, FLOW_CHANNELS));
  const channelBox = (channel: string) => (shownChannels.has(channel) ? channel : MORE);
  const { shown: kindOrder, rest: restKinds } = rankKinds(kindVisits, FLOW_KINDS);
  const kindBox = (kind: string) => (restKinds.has(kind) ? OTHER_KIND : kind);

  type Box = { visits: number; conversions: number; more: Set<string> };
  const box = (into: Map<string, Box>, key: string) => into.get(key) ?? into.set(key, { visits: 0, conversions: 0, more: new Set() }).get(key)!;
  const channelBoxes = new Map<string, Box>();
  const kindBoxes = new Map<string, Box>();
  type Route = { visits: number; conversions: number; revenue: number; channels: Set<string> };
  const routes = new Map<string, Route & { from: string; to: string }>();
  const route = (from: string, to: string) => {
    const key = `${from}>${to}`;
    return routes.get(key) ?? routes.set(key, { from, to, visits: 0, conversions: 0, revenue: 0, channels: new Set() }).get(key)!;
  };
  const endings = new Map<string, { count: number; revenue: number }>();
  // Each key event's count by the kind of page its visits started on, every classification kept apart: the grid.
  const byKind = new Map<string, Map<string, number>>();
  const conversionsIn = (row: ListRow, events: readonly Counted[]) => conversionsOf(row, events).conversions;
  for (const row of byChannel.rows) {
    const { channel: page, source: channel } = splitChannelKey(row.key);
    const from = `c:${channelBox(channel)}`;
    const kind = kindBox(kindOfPage(page));
    const to = `k:${kind}`;
    const conversions = conversionsIn(row, counted);
    const channelEntry = box(channelBoxes, channelBox(channel));
    channelEntry.visits += row.visits;
    channelEntry.conversions += conversions;
    if (channelBox(channel) === MORE) channelEntry.more.add(channel);
    const kindEntry = box(kindBoxes, kind);
    kindEntry.visits += row.visits;
    kindEntry.conversions += conversions;
    if (kind === OTHER_KIND) kindEntry.more.add(kindOfPage(page));
    const first = route(from, to);
    first.visits += row.visits;
    first.conversions += conversions;
    first.revenue += row.revenue;
    first.channels.add(from);
    // Each key event made from it: counted and not, on the route from its classification.
    for (const event of keyEvents) {
      const count = row.counts.get(event) ?? 0;
      if (count <= 0) continue;
      const ending = endings.get(event) ?? endings.set(event, { count: 0, revenue: 0 }).get(event)!;
      ending.count += count;
      const eventKinds = byKind.get(event) ?? byKind.set(event, new Map()).get(event)!;
      eventKinds.set(kindOfPage(page), (eventKinds.get(kindOfPage(page)) ?? 0) + count);
      const second = route(to, `e:${event}`);
      second.visits += count;
      second.conversions += countedNames.has(event) ? count : 0;
      if (event === PURCHASE_EVENT) {
        ending.revenue += row.revenue;
        second.revenue += row.revenue;
      }
      second.channels.add(from);
    }
  }
  // Left without converting: a classification's visits less those that made any listed event, as kept.
  let left = 0;
  if (!collecting && kept) {
    const made = new Map<string, number>();
    for (const row of kept.rows) {
      const kind = kindBox(kindOfPage(splitChannelKey(row.key).channel));
      made.set(kind, (made.get(kind) ?? 0) + (row.converting ?? 0));
    }
    for (const [kind, entry] of kindBoxes) {
      const gone = Math.max(0, entry.visits - (made.get(kind) ?? 0));
      if (gone <= 0) continue;
      left += gone;
      const end = route(`k:${kind}`, `e:${LEFT}`);
      end.visits += gone;
      for (const one of routes.values()) if (one.to === `k:${kind}`) for (const channel of one.channels) end.channels.add(channel);
    }
  }
  const counts = (event: string) => endings.get(event) ?? { count: 0, revenue: 0 };
  // Every counted kind, happened or not; a key event not counted only when it happened (CV3).
  const endingRows = [
    ...counted.map((event) => ({ key: event.eventName, counted: true, ...counts(event.eventName) })).sort((left, right) => right.count - left.count),
    ...keyEvents.filter((event) => !countedNames.has(event) && counts(event).count > 0).map((event) => ({ key: event, counted: false, ...counts(event) })).sort((left, right) => right.count - left.count),
    ...(collecting ? [] : [{ key: LEFT, counted: false, count: left, revenue: 0 }]),
  ];
  const grid = rankKinds(kindVisits, MAP_KINDS);
  const cellOf = (event: string, kind: string) => {
    const counts = byKind.get(event);
    if (!counts) return 0;
    if (kind !== OTHER_KIND) return counts.get(kind) ?? 0;
    return [...counts.entries()].filter(([own]) => grid.rest.has(own)).reduce((sum, [, count]) => sum + count, 0);
  };
  return {
    grid: {
      kinds: grid.shown.map((kind) => ({ kind, name: kinds.nameOf(kind) })),
      rows: endingRows.filter((ending) => ending.key !== LEFT).map((ending) => ({
        eventName: ending.key, counted: ending.counted, count: ending.count, cells: grid.shown.map((kind) => cellOf(ending.key, kind)),
      })),
    },
    collecting,
    everyDevice: byChannel.everyDevice,
    visits: [...channelBoxes.values()].reduce((sum, entry) => sum + entry.visits, 0),
    channels: [...rankedChannels.filter((channel) => shownChannels.has(channel)), ...(channelBoxes.has(MORE) ? [MORE] : [])].map((key) => {
      const entry = channelBoxes.get(key)!;
      return { key, visits: entry.visits, conversions: entry.conversions, more: entry.more.size };
    }),
    kinds: kindOrder.filter((kind) => kindBoxes.has(kind)).map((kind) => {
      const entry = kindBoxes.get(kind)!;
      return { kind, name: kinds.nameOf(kind), visits: entry.visits, conversions: entry.conversions, more: entry.more.size };
    }),
    endings: endingRows,
    routes: [...routes.values()].filter((one) => one.visits > 0).map((one) => ({ ...one, channels: [...one.channels] })),
  };
}

// ---------------------------------------------------------------------------
// What people did before converting (CV4)
// ---------------------------------------------------------------------------

export const beforeValidator = v.object({
  /** The night's funnels not kept yet: they come with the next run. */
  collecting: v.boolean(),
  /** People who started a visit over 12 months and went on to convert, over them; null until kept or when Google refused. */
  siteRate: v.union(v.number(), v.null()),
  few: v.number(),
  rows: v.array(v.object({ eventName: v.string(), did: v.number(), then: v.number() })),
});
export type BeforeConverting = Infer<typeof beforeValidator>;

/** Each action's funnel over 12 months, every device, as the night's run kept it; the website's beside them. */
export async function readBeforeConverting(ctx: Reader, holdId: HoldId, connection: Doc<"googleAnalyticsConnections">): Promise<BeforeConverting | null> {
  const counted = countedOf(connection).map((event) => event.eventName);
  if (counted.length === 0) return null;
  // The actions as the run chose them (rule 10): from the events' months held, or this year's list before they are.
  const eventRows = await actionEvents(ctx, connection);
  if (eventRows.length === 0) return { collecting: true, siteRate: null, few: FEW_PEOPLE, rows: [] };
  const events = { rows: eventRows };
  const funnelOf = async (event: string) => {
    const held = await readLive(ctx, holdId, funnelAsk(event, "365", EVERY_DEVICE));
    if (!held || held.rows.some((row) => row.key === "refused")) return null;
    const people = (key: string) => held.rows.find((row) => row.key === key)?.people ?? 0;
    return { did: people("did"), then: people("then") };
  };
  const site = await funnelOf(WEBSITE_FUNNEL);
  const rows: BeforeConverting["rows"] = [];
  for (const eventName of actionsFrom(events.rows, counted)) {
    const funnel = await funnelOf(eventName);
    if (funnel && funnel.did > 0) rows.push({ eventName, ...funnel });
  }
  return {
    collecting: site === null && rows.length === 0,
    siteRate: site && site.did > 0 ? site.then / site.did : null,
    few: FEW_PEOPLE,
    rows: rows.sort((left, right) => right.then / right.did - left.then / left.did || right.did - left.did),
  };
}

// ---------------------------------------------------------------------------
// Where each kind of visitor lands (CV7)
// ---------------------------------------------------------------------------

const VISITOR_MAP_LISTS = ["visitorType", "browser", "system", "age", "gender", "interest"] as const;
type VisitorMapList = (typeof VISITOR_MAP_LISTS)[number];

/** Where each visitor list's groups are kept by landing page, and which part of the key names the group. */
const SOURCE: Record<VisitorMapList, { list: PageFactList; part: number }> = {
  // Landing page × channel × source × new or returning.
  visitorType: { list: "landingSource", part: 2 },
  browser: { list: "landingBrowser", part: 0 },
  system: { list: "landingSystem", part: 0 },
  // Landing page × age × gender.
  age: { list: "landingWho", part: 0 },
  gender: { list: "landingWho", part: 1 },
  interest: { list: "landingInterest", part: 0 },
};

/** Google's words for not knowing — "(not set)", a blank, "unknown" — one Unknown group (CV7). */
export const UNKNOWN_GROUP = "(not set)";

/** A visitor group's key: Unknown for Google's words for not knowing, its own name otherwise. */
export function visitorGroupOf(name: string): string {
  return isUnknownValue(name) && name !== OTHER_ROWS ? UNKNOWN_GROUP : name;
}

const visitorMapArgs = {
  siteId: v.id("companyWebsites"),
  period: analyticsPeriodValidator,
  device: v.string(),
  country: v.optional(v.string()),
  list: v.union(...VISITOR_MAP_LISTS.map((list) => v.literal(list))),
};

export const visitorMapValidator = v.union(v.null(), v.object({
  /** The list not kept yet, for these dates and device: it comes with the next run. */
  collecting: v.boolean(),
  thresholded: v.boolean(),
  /** Whether the squares carry conversions: interests are kept without the key events (CV10). */
  conversions: v.boolean(),
  kinds: v.array(v.object({ kind: v.string(), name: v.union(v.string(), v.null()) })),
  rows: v.array(v.object({
    /** The group's name as Google gives it (Unknown as "(not set)"), or `MORE` for everything else. */
    key: v.string(),
    visits: v.number(),
    cells: v.array(v.object({ visits: v.number(), conversions: v.number() })),
    /** The classification most of the group's visits started on, and its share; null with none. */
    lands: v.union(v.null(), v.object({ kind: v.string(), share: v.number() })),
  })),
}));

/**
 * Visitors' grid for one of its lists: the biggest groups down the side, the
 * website's classifications across, each square the group's visits that
 * started on that kind of page with their conversions; and each group's
 * classification most landed on, for the table's "Lands most on".
 */
export const analyticsVisitorMap = tenantQuery({
  args: visitorMapArgs,
  returns: visitorMapValidator,
  handler: async (ctx, args) => await readVisitorMap(ctx, args),
});

export async function readVisitorMap(ctx: SiteReader, args: ObjectType<typeof visitorMapArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const source = SOURCE[args.list];
  const held = await readSlot(ctx, holdId, slotKey(source.list, args.period, "NOW", args.device, country));
  const empty = { collecting: true, thresholded: false, conversions: false, kinds: [], rows: [] };
  if (!held) return empty;
  const counted = countedOf(connection);
  const kinds = await kindsFor(ctx, holdId);
  const addresses = await addressesOf(ctx, holdId, held.rows.map((row) => splitChannelKey(row.key).channel));
  type Cell = { visits: number; conversions: number };
  const groups = new Map<string, Map<string, Cell>>();
  const kindVisits = new Map<string, number>();
  for (const row of held.rows) {
    const { channel: page, source: rest } = splitChannelKey(row.key);
    const group = visitorGroupOf(rest.split(PAGE_FACT_JOIN)[source.part] ?? "");
    const kind = kinds.kindOf(addresses.get(page) ?? page);
    const byKind = groups.get(group) ?? groups.set(group, new Map()).get(group)!;
    const cell = byKind.get(kind) ?? byKind.set(kind, { visits: 0, conversions: 0 }).get(kind)!;
    cell.visits += row.visits;
    cell.conversions += conversionsOf(row, counted).conversions;
    kindVisits.set(kind, (kindVisits.get(kind) ?? 0) + row.visits);
  }
  const { shown, rest } = rankKinds(kindVisits, MAP_KINDS);
  const visitsOf = (byKind: ReadonlyMap<string, Cell>) => [...byKind.values()].reduce((sum, cell) => sum + cell.visits, 0);
  // The biggest groups, the rest — and the folded rows past a page's twenty — as Everything else.
  const ranked = [...groups.entries()].filter(([group]) => group !== OTHER_ROWS).sort((left, right) => visitsOf(right[1]) - visitsOf(left[1]) || left[0].localeCompare(right[0]));
  const top = ranked.slice(0, MAP_GROUPS);
  const restGroups = [...ranked.slice(MAP_GROUPS), ...(groups.has(OTHER_ROWS) ? [[OTHER_ROWS, groups.get(OTHER_ROWS)!] as const] : [])];
  const everything = new Map<string, Cell>();
  for (const [, byKind] of restGroups) {
    for (const [kind, cell] of byKind) {
      const into = everything.get(kind) ?? everything.set(kind, { visits: 0, conversions: 0 }).get(kind)!;
      into.visits += cell.visits;
      into.conversions += cell.conversions;
    }
  }
  const rows = [...top, ...(restGroups.length > 0 ? [[MORE, everything] as const] : [])].map(([key, byKind]) => {
    const visits = visitsOf(byKind);
    const cellOf = (kind: string): Cell => {
      if (kind !== OTHER_KIND) return byKind.get(kind) ?? { visits: 0, conversions: 0 };
      const others = [...byKind.entries()].filter(([own]) => rest.has(own));
      return { visits: others.reduce((sum, [, cell]) => sum + cell.visits, 0), conversions: others.reduce((sum, [, cell]) => sum + cell.conversions, 0) };
    };
    const most = [...byKind.entries()].sort((left, right) => right[1].visits - left[1].visits)[0];
    return {
      key,
      visits,
      cells: shown.map(cellOf),
      lands: most && visits > 0 ? { kind: most[0], share: most[1].visits / visits } : null,
    };
  }).filter((row) => row.visits > 0);
  return {
    collecting: false,
    thresholded: held.thresholded,
    conversions: source.list !== "landingInterest",
    kinds: shown.map((kind) => ({ kind, name: kinds.nameOf(kind) })),
    rows,
  };
}
