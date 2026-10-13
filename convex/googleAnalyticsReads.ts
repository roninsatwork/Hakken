import { v, type Infer, type ObjectType } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { websiteIconUrl } from "./websiteIcons";
import { analyticsStatusValidator } from "./googleAnalyticsSchema";
import { decodePages, isPageRef } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { listOrder, listPageArgs, pageOfList, sortDirectionArg, type ListSorts } from "./siteListPages";
import { wordStartMatcher } from "./utils/wordStarts";
import { assistantOf, channelOf } from "./utils/aiAssistants";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
import { UNTAGGED, VISITOR_LISTS, splitChannelKey, type ListRow, type VisitorList } from "./googleAnalyticsLists";
import { campaignsSees } from "./utils/sees/analyticsCampaigns";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { titlesOf, withTitles } from "./pageTitles";
import { analyticsPeriodValidator, type AnalyticsList, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { searchConsoleMonth, searchConsoleMonthValidator } from "./googleAnalyticsConnect";
import { seeing, seen, seenValidator, type Seen, type SeenPhrase } from "./utils/hakkenSees";
import { PAGE_MOVES, moveOf, type PageMove } from "./utils/pageMoves";
import { moveCountsValidator, withQuietPages, type PageMoves } from "./googleAnalyticsPageMoves";
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
  liveAsk,
  readFor,
  readLive,
  readSlot,
  shown,
  shownRowValidator,
  type Counted,
  type Held,
  type LiveList,
  type ShownRow,
} from "./googleAnalyticsRows";

const SORTS: ListSorts<ShownRow, "name" | "visits" | "engaged" | "bounce" | "pages" | "people" | "length" | "time" | "views" | "conversions" | "rate" | "value" | "change" | "viewsChange" | "conversionsChange"> = {
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
  // All pages' two changes, as counts (all-pages-rethink-plan.md AP4): the most gained first.
  viewsChange: { value: (row) => (row.viewsBefore === null ? null : row.views - row.viewsBefore), first: "desc" },
  conversionsChange: { value: (row) => (row.conversionsBefore === null ? null : row.conversions - row.conversionsBefore), first: "desc" },
};
/** The order a list opens in (GA26): All pages by views, Landing pages and page groups by visits, the channels by value. */
export function openingSort(list: ListKind): keyof typeof SORTS {
  return list === "page" ? "views" : list === "landing" || list === "groups" || list === "campaign" || list === "adKeyword" || isVisitorList(list) ? "visits" : "value";
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
  /** Visits from tagged links, by campaign and where the link was; and by the words a link carries (§18.6.6). */
  v.literal("campaign"),
  v.literal("adKeyword"),
  /** Visitors (§18.6.6): new or returning, browsers, operating systems, age, gender, interests. */
  ...VISITOR_LISTS.map((list) => v.literal(list)),
);
export type ListKind = Infer<typeof listKindValidator>;

function isVisitorList(list: ListKind): list is VisitorList {
  return (VISITOR_LISTS as readonly string[]).includes(list);
}

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
  /** Only the pages of one page group (its classification's id, or Not sorted). */
  group: v.optional(v.string()),
  /** Only the rows that made this conversion. */
  eventName: v.optional(v.string()),
  q: v.optional(v.string()),
  sort: v.optional(sortValidator),
  direction: sortDirectionArg,
  /** All pages' filters (all-pages-rethink-plan.md AP5): the pages that gained, dropped, stayed static or had no visits. */
  move: v.optional(pageMoveValidator),
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
  move?: PageMove | "all";
  /**
   * All pages whole: the pages viewed only before and the website's own pages
   * nobody viewed join the list, with each filter's count (`withQuietPages`).
   * Its screen, its download and Ask Hakken read it so; a top list does not.
   */
  quiet?: boolean;
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
  /** Campaigns: the visits from no tagged link, left out of the list (§18.6.6); null on any other list. */
  untagged: number | null;
  /** All pages read whole: how many pages each filter holds, and the pages nobody viewed Google sends most clicks. */
  moves: PageMoves | null;
};

type Figures = ReturnType<typeof figuresOf>;

const EMPTY: Omit<ListAnswer, "live" | "preparing"> = {
  rows: [], from: null, to: null, folded: false, thresholded: false, cut: false, groups: null,
  every: [], everyDevice: null, totals: null, site: null, counting: false, untagged: null, moves: null,
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
  const base: AnalyticsList = own ? args.list as AnalyticsList
    : args.list === "channel" || args.list === "source" ? "channel" : args.list === "page" ? "page" : "landing";
  const kept: { every: Held | null } = { every: null };
  const now = await readFor(ctx, holdId, base, args.period, "NOW", args.device, kept, args.country);
  if (now === "LIVE") return { ...EMPTY, live: true, preparing: false, counting };
  if (!now) return { ...EMPTY, live: false, preparing: true, counting };
  const before = await readFor(ctx, holdId, base, args.period, "BEFORE", args.device, undefined, args.country);
  const beforeRows = before && before !== "LIVE" ? before.rows : null;
  const site = figuresOf(now.rows, counted);

  let rows: ListRow[] = now.rows;
  let earlier: ListRow[] | null = beforeRows;
  // The visits from no tagged link are said beside the campaigns, never listed among them.
  const untagged = tagged ? rows.find((row) => row.key === UNTAGGED)?.visits ?? 0 : null;
  if (tagged) {
    rows = rows.filter((row) => row.key !== UNTAGGED);
    earlier = earlier ? earlier.filter((row) => row.key !== UNTAGGED) : null;
  }
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
  let moves: PageMoves | null = null;
  if (args.eventName) out = out.filter((row) => row.conversions > 0);
  for (const row of out) {
    if (args.list === "groups") {
      row.label = row.key === NOT_SORTED_KIND ? NOT_SORTED_KIND : kinds?.nameOf(row.key) ?? row.key;
      row.members = members.get(row.key) ?? 0;
    } else if (pageList) row.label = addresses.get(row.key) ?? row.key;
    else if (args.list === "campaign") {
      const { channel: campaign, source } = splitChannelKey(row.key);
      row.label = campaign;
      row.source = source;
    }
  }
  if (args.list === "page" && args.quiet && !args.eventName && args.group === undefined) {
    const whole = await withQuietPages(ctx, holdId, out, earlier, counted, addresses);
    out = whole.rows;
    moves = whole.moves;
  }
  const every = out;
  if (moves && args.move && args.move !== "all") out = out.filter((row) => moveOf(row.views, row.viewsBefore) === args.move);
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
    untagged,
    moves,
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
  // Visitors' box is the whole screen's, from its own read (`googleAnalyticsVisitorReads.ts`), whichever list is shown.
  if (list.live || list.preparing || isVisitorList(args.list)) return seen([]);
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
    /** All pages: how many pages each filter holds (all-pages-rethink-plan.md AP5); null on any other list. */
    moves: v.union(v.null(), moveCountsValidator),
  }),
  handler: async (ctx, args) => await readListPage(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readListPage(ctx: SiteReader, args: ObjectType<typeof analyticsListPageArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const list = await readAnalyticsList(ctx, site.hold._id, { ...args, country: await keptCountry(ctx, site.hold, args.country), quiet: args.list === "page" });
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
    untagged: list.untagged,
    moves: list.moves?.counts ?? null,
  };
}

/** Every row of a list, named, in the order on screen: its download. */
export const analyticsListAll = tenantQuery({
args: listArgs,
returns: v.object({ rows: v.array(shownRowValidator), live: v.boolean() }),
handler: async (ctx, args) => {
  const site = await requireMySite(ctx, args.siteId);
  const list = await readAnalyticsList(ctx, site.hold._id, { ...args, country: await keptCountry(ctx, site.hold, args.country), quiet: args.list === "page" });
  return { rows: await nameRows(ctx, site.hold._id, list.rows), live: list.live };
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
    /** Each channel's visits, the most first: Overview's "Where visits came from" (GA35, §18.2 board 13). */
    channelVisits: v.array(v.object({ label: v.string(), visits: v.number() })),
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
    channelVisits: [] as Array<{ label: string; visits: number }>,
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
    channelVisits: [...channels.rows].sort((left, right) => right.visits - left.visits).map((row) => ({ label: row.label, visits: row.visits })),
    counting: counted.length > 0,
    searchConsole: await searchConsoleMonth(ctx, holdId),
  };
}, overviewSees);

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
}, conversionsSees);

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
