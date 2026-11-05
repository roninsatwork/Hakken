import { v, type ObjectType } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { beforeValidator, flowValidator, readBeforeConverting, readConversionFlow, readVisitorMap, visitorGroupOf, type BeforeConverting, type ConversionFlow } from "./googleAnalyticsConversionReads";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { websiteIconUrl } from "./websiteIcons";
import { analyticsStatusValidator } from "./googleAnalyticsSchema";
import { decodePages, isPageRef } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { SHOP_PAGES_KIND, isShopPage } from "./utils/shopPages";
import { listOrder, listPageArgs, pageOfList, sortDirectionArg } from "./siteListPages";
import { wordStartMatcher } from "./utils/wordStarts";
import { AI_ASSISTANTS_CHANNEL, GOOGLE_AI_CHANNEL, assistantOf, channelOf } from "./utils/aiAssistants";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
import { UNTAGGED, splitChannelKey, type ListRow, type VisitorList } from "./googleAnalyticsLists";
import { LIST_SORTS, isVisitorList, listKindValidator, openingSort, sortValidator, type ListKind } from "./googleAnalyticsListKinds";
import { cameFromOf } from "./utils/campaignNames";
import { campaignsSees } from "./utils/sees/analyticsCampaigns";
import { slotKey } from "./googleAnalyticsCollect";
import { onwardByGroup, onwardOf, withOnward, type Onward } from "./googleAnalyticsOnward";
import { keptCountry } from "./googleAnalyticsCountries";
import { titlesOf, withTitles } from "./pageTitles";
import { analyticsPeriodValidator, type AnalyticsList, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { searchConsoleMonth, searchConsoleMonthValidator } from "./googleAnalyticsConnect";
import { seeing, seen, seenValidator, type Seen, type SeenPhrase } from "./utils/hakkenSees";
import { PAGE_MOVES, moveOf, type PageMove, busyVisitsFor, pageBandsOf, viewsConcentration, type PageBands, type ViewsConcentration } from "./utils/pageMoves";
import { moveCountsValidator, withQuietPages, type PageMoves } from "./googleAnalyticsPageMoves";
import { channelExtras, channelLanding, classifierFor } from "./googleAnalyticsChannelReads";
import {
  addInto,
  blank,
  connectionOf,
  conversionsOf,
  countedOf,
  grouped,
  readFor,
  readSlot,
  shown,
  shownRowValidator,
  type Counted,
  type Held,
  type ShownRow,
} from "./googleAnalyticsRows";
import { OPENING_PERIOD } from "./utils/calendarPeriods";
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

/** Rows in "What changed most" (GA22, §10 Q13) and each top list on Overview. */
export const TOP_ROWS = 5;

type Reader = { db: QueryCtx["db"] };

// A list's rows as kept and as shown are `googleAnalyticsRows.ts`'s, kept apart for this module's size; named here
// too, as every screen's reads import them from here.
export {
  FEW_VISITS,
  blank,
  connectionOf,
  conversionsOf,
  countedOf,
  grouped,
  readFor,
  readLive,
  readSlot,
  shown,
  shownRowValidator,
  type Counted,
  type Held,
  type ShownRow,
} from "./googleAnalyticsRows";

/** All pages' filters, and every page (AP5). */
const pageMoveValidator = v.union(v.literal("all"), ...PAGE_MOVES.map((move) => v.literal(move)));

const listArgs = {
  siteId: v.id("companyWebsites"),
  list: listKindValidator,
  period: analyticsPeriodValidator,
  device: v.string(),
  /** A home country other than the main one, as Search Console names it (`fra`); left out for the main one (§18.6.1). */
  country: v.optional(v.string()),
  /** The channel whose sources are listed. */
  channel: v.optional(v.string()),
  /** AI assistants' own page (ga-channel-pages-plan.md CH8): only the visits Google filed under this channel ("Referral"). */
  filed: v.optional(v.string()),
  /** Only the pages of one page group (its classification's id, or Not sorted). */
  group: v.optional(v.string()),
  /** Only the rows that made this conversion. */
  eventName: v.optional(v.string()),
  /** Campaigns: only the links that were in this place, a code or a source as written (`utils/campaignNames.ts`). */
  cameFrom: v.optional(v.string()),
  q: v.optional(v.string()),
  sort: v.optional(sortValidator),
  direction: sortDirectionArg,
  /** All pages' filters (all-pages-rethink-plan.md AP5): the pages that gained, dropped, stayed static or had no visits. */
  move: v.optional(pageMoveValidator),
  /** All pages (all-pages-way-6-plan-2026-11-04.md, step 2): without the shop's search, basket and account pages. */
  leaveOut: v.optional(v.boolean()),
};

type ListArgs = {
  list: ListKind;
  period: AnalyticsPeriod;
  device: string;
  /** The home country as its lists are named, already checked (`keptCountry`): empty for the main one. */
  country?: string;
  channel?: string;
  filed?: string;
  group?: string;
  eventName?: string;
  cameFrom?: string;
  q?: string;
  sort?: keyof typeof LIST_SORTS;
  direction?: "asc" | "desc";
  move?: PageMove | "all";
  /** All pages and Funnel: without the shop's search, basket and account pages (`isShopPage`). */
  leaveOut?: boolean;
  /** Every row with its address, for a read that sorts them itself (Funnel's chart). */
  named?: boolean;
  /**
   * All pages whole: the pages viewed only before and the website's own pages
   * nobody viewed join the list, with each filter's count (`withQuietPages`).
   * Its screen, its download and Ask Hakken read it so; a top list does not.
   */
  quiet?: boolean;
  /**
   * Channels' table (ga-channel-pages-plan.md CH9): each channel with the
   * conversions it started and the page group most of its visits land on —
   * `group` then keeps the channels landing most on that page group.
   */
  extras?: boolean;
  /**
   * Page groups only: the landing pages themselves too, as Landing pages shows them (address, change, what left),
   * from the same read — Overview's two page panels in one pass (calendar-periods audit, 2026-10-21).
   */
  pages?: boolean;
};

export type ListAnswer = {
  rows: ShownRow[];
  /** A device's list the next collection builds (ga-stored-figures-plan.md SF3): every device's shown meanwhile. */
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
  /** One device's landing pages: every device's rows, to weigh them against. */
  everyDevice: ShownRow[] | null;
  /** The list's rows added up, now and in the span before. */
  totals: { now: Figures; before: Figures | null } | null;
  /** The whole website's visits and engaged visits, from the list read. */
  site: { visits: number; engaged: number } | null;
  /** Whether anything counts as a conversion. */
  counting: boolean;
  /** Campaigns: the visits from no tagged link, left out of the list (§18.6.6); null on any other list. */
  untagged: number | null;
  /** Campaigns: every place a link was, with its visits, the most first, whichever one is chosen; null on any other list. */
  cameFromChoices: Array<{ cameFrom: string; visits: number }> | null;
  /** All pages read whole: how many pages each filter holds, and the pages nobody viewed Google sends most clicks. */
  moves: PageMoves | null;
  /** All pages read whole: its busy and quiet pages, and how few pages make half its views. */
  bands: PageBands | null;
  concentration: ViewsConcentration | null;
  /** All pages, when they were left out or asked for: the shop's search, basket and account pages added up. */
  shop: { pages: number; views: number; viewsBefore: number | null } | null;
  /** All pages: the dates the figures are set against, so the page can name them ("September"). */
  spanBefore: { from: string | null; to: string | null } | null;
  /** Page groups read with `pages`: every landing page, named by its address. */
  pages?: ShownRow[];
};

type Figures = ReturnType<typeof figuresOf>;

const EMPTY: Omit<ListAnswer, "live" | "preparing"> = {
  rows: [], from: null, to: null, folded: false, thresholded: false, cut: false, groups: null,
  every: [], everyDevice: null, totals: null, site: null, counting: false, untagged: null, cameFromChoices: null, moves: null, bands: null, concentration: null, shop: null, spanBefore: null,
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
  const tagged = args.list === "campaign" || args.list === "adKeyword";
  const own = tagged || isVisitorList(args.list);
  // A channel's own landing pages and page groups (ga-channel-pages-plan.md CH7): every device's, as they are kept.
  const ofChannel = (args.list === "landing" || args.list === "groups") && args.channel !== undefined ? args.channel : null;
  const base: AnalyticsList = own ? args.list as AnalyticsList
    : args.list === "channel" || args.list === "source" ? "channel" : args.list === "page" ? "page" : ofChannel !== null ? "landingChannel" : "landing";
  const device = args.device;
  const kept: { every: Held | null } = { every: null };
  // Each row with only the counted events, read a part at a time: all a list here reads of a row. Read whole as rows, a
  // year's pages, or a channel's landing pages, ran this out of its 64MB on More Handles (2026-11-04).
  const only = { events: new Set(counted.map((event) => event.eventName)) };
  // A channel's pages: each assistant's visits credited to AI assistants once, whichever channel Google filed them under (CH13).
  const channelPages = async (which: "NOW" | "BEFORE") => (ofChannel !== null ? await channelLanding(ctx, holdId, args.period, which, args.country ?? "", args.device, ofChannel, only.events) : null);
  const channelNow = await channelPages("NOW");
  const now = ofChannel !== null ? (channelNow ? { ...channelNow.notes, rows: channelNow.rows } : null) : await readFor(ctx, holdId, base, args.period, "NOW", device, kept, args.country, only);
  if (now === "LIVE") return { ...EMPTY, live: true, preparing: false, counting };
  if (!now) return { ...EMPTY, live: false, preparing: true, counting };
  const channelBefore = await channelPages("BEFORE");
  const before = ofChannel !== null ? (channelBefore ? { ...channelBefore.notes, rows: channelBefore.rows } : null) : await readFor(ctx, holdId, base, args.period, "BEFORE", device, undefined, args.country, only);
  const beforeRows = before && before !== "LIVE" ? before.rows : null;
  // The whole website's, from every row read: a channel's pages are only some of them.
  const site = channelNow ? channelNow.site : figuresOf(now.rows, counted);

  let rows: ListRow[] = now.rows;
  let earlier: ListRow[] | null = beforeRows;
  const elsewhere = new Map<string, number>();
  // The visits from no tagged link are said beside the campaigns, never listed among them.
  const untagged = tagged ? rows.find((row) => row.key === UNTAGGED)?.visits ?? 0 : null;
  if (tagged) {
    rows = rows.filter((row) => row.key !== UNTAGGED);
    earlier = earlier ? earlier.filter((row) => row.key !== UNTAGGED) : null;
  }
  // Campaigns' Came from: every place, whichever is chosen, and the list held to the one chosen, so its totals follow.
  let cameFromChoices: ListAnswer["cameFromChoices"] = null;
  if (args.list === "campaign") {
    const placeOf = (row: ListRow) => cameFromOf(splitChannelKey(row.key).source);
    const places = new Map<string, number>();
    for (const row of rows) places.set(placeOf(row), (places.get(placeOf(row)) ?? 0) + row.visits);
    cameFromChoices = [...places.entries()].map(([cameFrom, visits]) => ({ cameFrom, visits })).sort((left, right) => right.visits - left.visits || left.cameFrom.localeCompare(right.cameFrom));
    if (args.cameFrom) {
      rows = rows.filter((row) => placeOf(row) === args.cameFrom);
      earlier = earlier ? earlier.filter((row) => placeOf(row) === args.cameFrom) : null;
    }
  }
  if (args.list === "channel") {
    rows = grouped(rows, (row) => displayChannel(row.key));
    earlier = earlier ? grouped(earlier, (row) => displayChannel(row.key)) : null;
  } else if (isVisitorList(args.list)) {
    // Google's "(not set)" and a blank are one Unknown row (ga-conversions-visitors-plan.md CV7, phase 0).
    rows = grouped(rows, (row) => visitorGroupOf(row.key));
    earlier = earlier ? grouped(earlier, (row) => visitorGroupOf(row.key)) : null;
  } else if (args.list === "source") {
    const channel = args.channel ?? "";
    const filedAs = (row: ListRow) => args.filed === undefined || splitChannelKey(row.key).channel === args.filed;
    const of = (row: ListRow) => (displayChannel(row.key) === channel && filedAs(row) ? displaySource(row.key) : null);
    // Each assistant's visits Google filed outside its own AI Assistant channel (CH8).
    if (channel === AI_ASSISTANTS_CHANNEL) {
      for (const row of rows) {
        if (of(row) === null || splitChannelKey(row.key).channel === GOOGLE_AI_CHANNEL) continue;
        elsewhere.set(displaySource(row.key), (elsewhere.get(displaySource(row.key)) ?? 0) + row.visits);
      }
    }
    rows = grouped(rows, of);
    earlier = earlier ? grouped(earlier, of) : null;
  }

  // Page addresses, read whole only when needed.
  const pageList = args.list === "landing" || args.list === "groups" || args.list === "page";
  const kinds = pageList ? await readPageKinds(ctx, holdId) : null;
  // A channel's pages are grouped as its chart groups them (CH5): Hakken's page types while the website has no classifications.
  const classes = ofChannel !== null ? await classifierFor(ctx, holdId) : kinds;
  const shopSplit = (args.list === "page" || args.list === "landing") && (args.leaveOut === true || args.group === SHOP_PAGES_KIND);
  const needAll = pageList && (Boolean(args.q?.trim()) || args.list === "groups" || args.group !== undefined || args.sort === "name" || shopSplit || args.named === true);
  const addresses = new Map<string, string>();
  const members = new Map<string, number>();
  if (needAll) {
    const keys = [...new Set([...rows, ...(earlier ?? [])].map((row) => row.key))];
    const named = await decodePages(ctx, holdId, keys);
    keys.forEach((key, index) => addresses.set(key, named[index]));
  }
  // The shop's own search, basket and account pages: left out, or the only ones asked for. Added up either way.
  let shop: ListAnswer["shop"] = null;
  if (shopSplit) {
    const isShop = (row: ListRow) => isShopPage(addresses.get(row.key) ?? row.key);
    const shopNow = rows.filter(isShop);
    const shopBefore = (earlier ?? []).filter(isShop);
    shop = {
      pages: new Set([...shopNow, ...shopBefore].map((row) => row.key)).size,
      views: shopNow.reduce((sum, row) => sum + row.views, 0),
      viewsBefore: earlier ? shopBefore.reduce((sum, row) => sum + row.views, 0) : null,
    };
    const wanted = args.group === SHOP_PAGES_KIND;
    rows = rows.filter((row) => isShop(row) === wanted);
    earlier = earlier ? earlier.filter((row) => isShop(row) === wanted) : null;
  }
  // Landing pages' funnel (landing-pages-flow-plan.md LF4): each landing page's visits that went on and the page most
  // opened next, as the collection kept them; added up into page groups below.
  const onward = (args.list === "landing" || args.list === "groups") && ofChannel === null
    ? await onwardOf(ctx, holdId, args.period, args.device, args.country ?? "")
    : null;
  let groupOnward: Map<string, Onward> | null = null;
  let pages: ShownRow[] | undefined;
  if (pageList && classes && (args.list === "groups" || args.group !== undefined)) {
    const kindOf = (row: ListRow) => classes.kindOf(addresses.get(row.key) ?? row.key);
    if (args.list === "groups" && onward) groupOnward = onwardByGroup(rows, onward, kindOf);
    if (args.group !== undefined && args.group !== SHOP_PAGES_KIND) {
      rows = rows.filter((row) => kindOf(row) === args.group);
      earlier = earlier ? earlier.filter((row) => kindOf(row) === args.group) : null;
    }
    if (args.list === "groups") {
      if (args.pages) {
        const pageBefore = new Map((earlier ?? []).map((row) => [row.key, row]));
        pages = rows.map((row) => withOnward({ ...shown(row, pageBefore.get(row.key), counted, earlier !== null), label: addresses.get(row.key) ?? row.key }, onward?.get(row.key), onward !== null));
      }
      for (const row of rows) members.set(kindOf(row), (members.get(kindOf(row)) ?? 0) + 1);
      rows = grouped(rows, kindOf);
      earlier = earlier ? grouped(earlier, kindOf) : null;
    }
  }

  const beforeByKey = new Map((earlier ?? []).map((row) => [row.key, row]));
  let out = rows.map((row) => shown(row, beforeByKey.get(row.key), counted, earlier !== null));
  let moves: PageMoves | null = null;
  if (args.eventName) out = out.filter((row) => row.conversions > 0);
  for (const row of out) {
    if (args.list === "groups") {
      row.label = row.key === NOT_SORTED_KIND ? NOT_SORTED_KIND : classes?.nameOf(row.key) ?? row.key;
      row.members = members.get(row.key) ?? 0;
    } else if (pageList) row.label = addresses.get(row.key) ?? row.key;
    else if (args.list === "campaign") {
      const { channel: campaign, source } = splitChannelKey(row.key);
      row.label = campaign;
      row.source = source;
      row.cameFrom = cameFromOf(source);
    }
  }
  if (args.list === "source" && args.channel === AI_ASSISTANTS_CHANNEL) for (const row of out) row.elsewhere = elsewhere.get(row.key) ?? 0;
  if (onward) {
    const byKey = groupOnward ?? onward;
    for (const row of out) withOnward(row, byKey.get(row.key), true);
  }
  if (args.list === "page" && args.quiet && !args.eventName) {
    const keep = (address: string) => {
      if (args.group === SHOP_PAGES_KIND) return isShopPage(address);
      if (args.leaveOut && isShopPage(address)) return false;
      return args.group === undefined || !classes || classes.kindOf(address) === args.group;
    };
    const whole = await withQuietPages(ctx, holdId, out, earlier, counted, addresses, keep);
    out = whole.rows;
    moves = whole.moves;
  }
  if (args.list === "channel" && args.extras) {
    const extras = await channelExtras(ctx, holdId, args.period, args.country ?? "", counted, args.device);
    for (const row of out) {
      const own = extras.get(row.label);
      row.started = own?.started ?? null;
      row.landsMost = own?.landsMost ?? null;
    }
    if (args.group !== undefined) out = out.filter((row) => row.landsMost?.kind === args.group);
  }
  const every = out;
  const bands = moves ? pageBandsOf(every, busyVisitsFor(now.from, now.to)) : null;
  const concentration = moves ? viewsConcentration(every) : null;
  if (moves && args.move && args.move !== "all") out = out.filter((row) => moveOf(row.views, row.viewsBefore) === args.move);
  // One device's landing pages are weighed against every device's, read on the way (GA20).
  const everyDevice = args.list === "landing" && args.group === undefined && args.device !== "" && kept.every
    ? kept.every.rows.map((row) => shown(row, null, counted, false))
    : null;
  const matches = wordStartMatcher(args.q);
  if (matches) out = out.filter((row) => matches(row.label));
  // Page views before money (GA26): All pages opens by views, Landing pages by visits; the channels by value.
  out.sort(listOrder(LIST_SORTS, args.sort ?? openingSort(args.list), args.direction, (row) => row.label));
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
    untagged,
    cameFromChoices,
    moves,
    bands,
    concentration,
    shop,
    spanBefore: before && before !== "LIVE" ? { from: before.from ?? null, to: before.to ?? null } : null,
    ...(pages ? { pages } : {}),
  };
}

/** The page addresses of the rows given, read only for them. */
async function addressRows(ctx: Reader, holdId: Id<"companyWebsites">, rows: ShownRow[]): Promise<ShownRow[]> {
  const refs = [...new Set(rows.flatMap((row) => [row.label, ...(row.next ? [row.next.page] : [])]).filter(isPageRef))];
  const named = refs.length > 0 ? await decodePages(ctx, holdId, refs) : [];
  const byRef = new Map(refs.map((ref, index) => [ref, named[index]]));
  return rows.map((row) => ({
    ...row,
    ...(byRef.has(row.label) ? { label: byRef.get(row.label)! } : {}),
    ...(row.next && byRef.has(row.next.page) ? { next: { ...row.next, page: byRef.get(row.next.page)! } } : {}),
  }));
}

/** The page addresses of the rows a screen shows, and their titles (GA27), read only for them. */
export async function nameRows(ctx: Reader, holdId: Id<"companyWebsites">, rows: ShownRow[]): Promise<ShownRow[]> {
  return await withTitles(ctx, holdId, await addressRows(ctx, holdId, rows), (row) => row.label);
}

/** A channel's landing pages each with its page group (CH7), read only for the rows shown. */
async function withKinds(ctx: Reader, holdId: Id<"companyWebsites">, rows: ShownRow[]): Promise<ShownRow[]> {
  const classifier = await classifierFor(ctx, holdId);
  return rows.map((row) => ({ ...row, kind: classifier.kindOf(row.label) }));
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

/**
 * A channel's figures above its list (§15, screen 5): its sources added up, and the whole website's engagement. Its
 * value is Ask Hakken's alone (`assistantAnalyticsReads.ts`): the box never weighs money (Anthony, 2026-11-03).
 */
function channelFigures(list: ListAnswer): (ChannelFigures & { value: number; valueBefore: number | null }) | null {
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
  // Visitors' box is the whole screen's, from its own read (`googleAnalyticsVisitorReads.ts`), whichever list is shown.
  // A channel's landing pages are its page's: their box is the page's own (`analyticsChannelTop`).
  if (list.live || list.preparing || isVisitorList(args.list) || (args.channel !== undefined && args.list !== "source")) return seen([]);
  const box = args.list === "channel" ? channelsSees(list.every)
    : args.list === "source" ? channelSees(args.channel ?? "", list.every, channelFigures(list), site.siteId)
      : args.list === "page" ? allPagesSees(list.every, list.counting, list.moves)
        : args.list === "campaign" || args.list === "adKeyword" ? campaignsSees(list.every, list.untagged ?? 0)
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

const analyticsListPageArgs = { ...listArgs, ...listPageArgs };

/**
 * One page of a list, counted exactly: Channels, a channel's sources, Landing
 * pages, page groups, All pages — with the screen's What Hakken sees, and a
 * channel's own figures above its sources (§15, screen 5).
 */
export const analyticsListPage = tenantQuery({
  args: analyticsListPageArgs,
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
    /** Campaigns: the visits from no tagged link (§18.6.6). */
    untagged: v.union(v.number(), v.null()),
    /** Campaigns: every place a link was, and the whole list's figures, so the boxes hold on any page of the table. */
    cameFromChoices: v.union(v.null(), v.array(v.object({ cameFrom: v.string(), visits: v.number() }))),
    campaignTotals: v.union(v.null(), v.object({
      visits: v.number(), visitsBefore: v.union(v.number(), v.null()),
      engaged: v.number(), engagedBefore: v.union(v.number(), v.null()),
      bought: v.number(), boughtBefore: v.union(v.number(), v.null()),
      conversions: v.number(), conversionsBefore: v.union(v.number(), v.null()),
    })),
    /** All pages: how many pages each filter holds (all-pages-rethink-plan.md AP5); null on any other list. */
    moves: v.union(v.null(), moveCountsValidator),
    /** All pages: its busy and quiet pages, and how few pages make half its views. */
    bands: v.union(v.null(), v.object({ busyVisits: v.number(), busy: v.number(), busyFewer: v.number(), quiet: v.number(), quietMore: v.number() })),
    concentration: v.union(v.null(), v.object({ pagesForHalf: v.union(v.number(), v.null()), pagesForHalfBefore: v.union(v.number(), v.null()), noViews: v.number(), noViewsBefore: v.union(v.number(), v.null()) })),
    /** All pages: the shop's search, basket and account pages added up, when they were left out or asked for. */
    shop: v.union(v.null(), v.object({ pages: v.number(), views: v.number(), viewsBefore: v.union(v.number(), v.null()) })),
    /** All pages: the dates the figures are set against, so the page can name them ("September"). */
    spanBefore: v.union(v.null(), v.object({ from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()) })),
    /** One classification's pages added up, with those that went quiet in its figures before; null for a whole list. */
    groupTotals: v.union(v.null(), v.object({ visits: v.number(), onward: v.number(), views: v.number(), viewsBefore: v.union(v.number(), v.null()), conversions: v.number(), conversionsBefore: v.union(v.number(), v.null()) })),
  }),
  handler: async (ctx, args) => await readListPage(ctx, args),
});

/** A visitor list's rows, each with the classification it lands on most, from Visitors' grid (ga-conversions-visitors-plan.md CV7); any other list's as they are. */
async function withVisitorLands(ctx: SiteReader, args: ObjectType<typeof listArgs>, list: ListAnswer, rows: ShownRow[]): Promise<ShownRow[]> {
  if (!isVisitorList(args.list) || list.live || list.preparing) return rows;
  const map = await readVisitorMap(ctx, { siteId: args.siteId, period: args.period, device: args.device, ...(args.country ? { country: args.country } : {}), list: args.list as VisitorList });
  if (!map) return rows;
  const kindNames = new Map(map.kinds.map((kind) => [kind.kind, kind.name]));
  const lands = new Map(map.rows.flatMap((row) => (row.lands ? [[row.key, { ...row.lands, name: kindNames.get(row.lands.kind) ?? null }] as const] : [])));
  return rows.map((row) => ({ ...row, landsMost: lands.get(row.key) ?? null }));
}

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readListPage(ctx: SiteReader, args: ObjectType<typeof analyticsListPageArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const list = await readAnalyticsList(ctx, site.hold._id, { ...args, country: await keptCountry(ctx, site.hold, args.country), quiet: args.list === "page", extras: args.list === "channel" });
  const page = pageOfList(list.rows, args.page, args.rows);
  const named = await nameRows(ctx, site.hold._id, page.rows);
  return {
    rows: args.list === "landing" && args.channel !== undefined ? await withKinds(ctx, site.hold._id, named) : await withVisitorLands(ctx, args, list, named),
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
    untagged: list.untagged,
    cameFromChoices: list.cameFromChoices,
    campaignTotals: args.list === "campaign" && list.totals ? {
      visits: list.totals.now.visits, visitsBefore: list.totals.before?.visits ?? null,
      engaged: list.totals.now.engaged, engagedBefore: list.totals.before?.engaged ?? null,
      bought: list.totals.now.purchases, boughtBefore: list.totals.before?.purchases ?? null,
      conversions: list.totals.now.conversions, conversionsBefore: list.totals.before?.conversions ?? null,
    } : null,
    moves: list.moves?.counts ?? null,
    bands: list.bands,
    concentration: list.concentration,
    shop: list.shop,
    spanBefore: list.spanBefore,
    groupTotals: args.group !== undefined && list.totals
      ? { visits: list.rows.reduce((sum, row) => sum + row.visits, 0), onward: list.rows.reduce((sum, row) => sum + (row.onward ?? 0), 0), views: list.totals.now.views, viewsBefore: list.totals.before?.views ?? null, conversions: list.totals.now.conversions, conversionsBefore: list.totals.before?.conversions ?? null }
      : null,
  };
}

/**
 * The rows one read of a download answers: inside the 8,192 an answer may hold to a list, and few enough to name and
 * send in what is left of a query's second once the whole list is read. More Handles' All pages is 13,803 to 21,934
 * rows: one answer holding all of them, with a read for each page's title, stopped at a query's limits (2026-11-04).
 */
export const DOWNLOAD_PART = 4_000;

/**
 * One part of a list's download, in the order on screen, and how many rows the whole list holds: the browser asks for
 * each part in turn (`readListInParts`). Each row is named by its address, and not given its title: no file holds one.
 */
export const analyticsListAll = tenantQuery({
args: { ...listArgs, part: v.number() },
returns: v.object({ rows: v.array(shownRowValidator), total: v.number(), live: v.boolean() }),
handler: async (ctx, { part, ...args }) => {
  const site = await requireMySite(ctx, args.siteId);
  const list = await readAnalyticsList(ctx, site.hold._id, { ...args, country: await keptCountry(ctx, site.hold, args.country), quiet: args.list === "page", extras: args.list === "channel" });
  const start = Math.max(0, Math.floor(part)) * DOWNLOAD_PART;
  const rows = await addressRows(ctx, site.hold._id, list.rows.slice(start, start + DOWNLOAD_PART));
  return { rows: await withVisitorLands(ctx, args, list, rows), total: list.rows.length, live: list.live };
},
});

/** Rows a top list may ask for: a chart's ten bars at most. */
const MOST_TOP_ROWS = 10;

/**
 * The first few rows of a list, in its order, and how many it holds:
 * Overview's and Conversions' short lists (§10, Q14), and the top-ten bars
 * above a list (GA35) — `count` of them, five unless asked.
 */
export const analyticsTopList = tenantQuery({
  args: { ...listArgs, count: v.optional(v.number()) },
  returns: v.object({ rows: v.array(shownRowValidator), total: v.number(), ...answerValidator }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const list = await readAnalyticsList(ctx, site.hold._id, { ...args, country: await keptCountry(ctx, site.hold, args.country) });
    return {
      rows: await nameRows(ctx, site.hold._id, list.rows.slice(0, Math.max(1, Math.min(MOST_TOP_ROWS, Math.floor(args.count ?? TOP_ROWS))))),
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
    /** The website asked about: What Hakken sees links its Search Console screens by it. */
    siteId: v.id("companyWebsites"),
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
  handler: async (ctx, args) => await readOverview(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export const readOverview = seeing(async (ctx: SiteReader, args: { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string }) => {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const nothing = {
    siteId: holdId,
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
    siteId: holdId,
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
}, overviewSees);

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/**
 * Conversions' table (§5): each kind of conversion the company counts — how
 * many, and the change on the span before; for a shop, its purchases (GA7).
 * Each kind's value is kept for Ask Hakken alone.
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
      /** In hundredths; null with none. Ask Hakken's alone: no screen shows it (Anthony, 2026-11-03: "Take money off"). */
      value: v.union(v.number(), v.null()),
    })),
    shop: v.union(v.null(), v.object({ purchases: v.number(), purchasesBefore: v.union(v.number(), v.null()) })),
    /** The property's key events not counted that happened in these dates, most first: what Nothing counted yet offers to tick. */
    fired: v.array(v.object({ eventName: v.string(), count: v.number() })),
    /** How visits reached a conversion, by page classification (ga-conversions-visitors-plan.md CV3); null before landing pages by channel are kept. */
    flow: v.union(v.null(), flowValidator),
    /** What people did before converting, over 12 months (CV4); null with nothing counted. */
    before: v.union(v.null(), beforeValidator),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => await readConversions(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export const readConversions = seeing(async (ctx: SiteReader, args: { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string }) => {
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
    kinds: [] as Array<{ eventName: string; count: number; countBefore: number | null; value: number | null }>,
    shop: null,
    fired: [] as Array<{ eventName: string; count: number }>,
    flow: null as ConversionFlow | null,
    before: null as BeforeConverting | null,
  };
  if (!connection?.newestDay) return nothing;
  const now = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
  if (!now) return nothing;
  const before = await readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", args.device, country));
  const total = blank("");
  for (const row of now.rows) addInto(total, row);
  const was = before ? blank("") : null;
  if (was && before) for (const row of before.rows) addInto(was, row);
  // Each kind's value is Ask Hakken's alone (`assistantAnalyticsReads.ts`): the screens show no money (Anthony, 2026-11-03).
  const kinds = countedOf(connection).map((event) => {
    const count = total.counts.get(event.eventName) ?? 0;
    const purchase = event.eventName === PURCHASE_EVENT;
    const value = purchase ? total.revenue
      : event.fromAnalytics ? total.values.get(event.eventName) ?? 0
      : event.hakken !== null ? Math.round(count * event.hakken * 100) : null;
    return {
      eventName: event.eventName,
      count,
      countBefore: was ? was.counts.get(event.eventName) ?? 0 : null,
      value,
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
    shop: isShop ? { purchases: total.purchases, purchasesBefore: was ? was.purchases : null } : null,
    fired,
    flow: await readConversionFlow(ctx, holdId, connection, args.period, args.device, country),
    before: await readBeforeConverting(ctx, holdId, connection),
  };
}, conversionsSees);

// ---------------------------------------------------------------------------
// The section's websites
// ---------------------------------------------------------------------------

/**
 * The company's own websites, each with its Google Analytics status and its
 * last month — visits, conversions, value — for the section's first page
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
    lastCollectedAt: v.union(v.number(), v.null()),
    /**
     * For What Hakken sees (§14, screen 1): the 30 days before — one more
     * small ready-made total each — whether anything counts as a conversion,
     * and tracking health's checks failing of all, with the share of visits of
     * unknown origin when that check fails. Never money (Anthony, 2026-11-03:
     * "Take money off").
     */
    visitsBefore: v.union(v.number(), v.null()),
    conversionsBefore: v.union(v.number(), v.null()),
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
      const held = connection?.newestDay ? await readSlot(ctx, entry.hold._id, slotKey("total", OPENING_PERIOD, "NOW", "")) : null;
      const figures = held && connection ? figuresOf(held.rows, countedOf(connection)) : null;
      const heldBefore = held ? await readSlot(ctx, entry.hold._id, slotKey("total", OPENING_PERIOD, "BEFORE", "")) : null;
      const before = heldBefore && connection ? figuresOf(heldBefore.rows, countedOf(connection)) : null;
      const checks = connection?.health?.checks ?? [];
      const unknown = checks.find((check) => check.check === "TOO_MUCH_UNKNOWN" && !check.passing);
      return {
        visitsBefore: before?.visits ?? null,
        conversionsBefore: before?.conversions ?? null,
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
        lastCollectedAt: connection?.lastCollectedAt ?? null,
      };
    }));
  },
});
