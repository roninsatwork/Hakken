import { v, type Infer, type ObjectType } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { keptCountry } from "./googleAnalyticsCountries";
import { slotKey } from "./googleAnalyticsCollect";
import { decodePages } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { titlesOf } from "./pageTitles";
import { shiftDay } from "./searchConsoleDays";
import { pageTypeByAddress } from "./utils/siteShapes";
import { AI_ASSISTANTS_CHANNEL, GOOGLE_AI_CHANNEL, assistantOf, channelOf } from "./utils/aiAssistants";
import { channelKey, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { analyticsPeriodValidator, type AnalyticsPeriod } from "./googleAnalyticsSchema";
import { FEW_VISITS, addInto, blank, connectionOf, conversionsOf, countedOf, readSlot, type Counted, type Held } from "./googleAnalyticsRows";
import { merged, readChannelPoints } from "./googleAnalyticsHistory";
import { periodRange } from "./googleAnalyticsJobs";
import { seen, seenValidator, type Seen, type SeenPhrase } from "./utils/hakkenSees";
import { pathOfAddress } from "./utils/sees/analytics";
import {
  NO_PAGE_ADDRESS as NOT_SET,
  NO_PAGE_KIND,
  OTHER_KIND,
  channelPageSees,
  channelsPageSees,
  type ChannelPageFacts,
  type CopyFacts,
  type PageFacts,
  type UncountedFacts,
} from "./utils/sees/analyticsChannel";

/**
 * What Channels and a channel's own page read
 * (docs/plans/active/ga-channel-pages-plan.md): one channel's figures with
 * the conversions it started and its dwell time (CH3), where its visits land
 * by page group (CH5), the pages behind the change (CH6), every key event
 * (CH7), the channel a day against the span before (CH4), and — on Channels
 * — each channel by page group, what a visit is worth and each channel's
 * extras for the table (CH9). Google Analytics' own figures only (CH1), read
 * from the lists Hakken already keeps; one device's landing pages are
 * every device's, as those lists are kept. Only the caller's own website.
 */

type Reader = { db: QueryCtx["db"] };
type HoldId = Id<"companyWebsites">;

/** The pages behind the change (CH6): the biggest gains and the biggest losses, each. */
export const MOVERS_EACH = 4;
/** The pages a key event's row names it happened on (CH7); the rest are counted. */
const LANDED_NAMED = 3;
/** Sources drawn as lines of their own on a channel's sources chart; the rest are one. */
const SOURCE_LINES = 4;
/** Page groups drawn as columns of Channels' map; the rest are one, Other. */
const MAP_KINDS = 7;

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** A channel row's channel as the screens show it: assistants as AI assistants, whatever Google filed them under. */
function displayOf(key: string): string {
  const { channel, source } = splitChannelKey(key);
  return channelOf(channel, source);
}

/** A landing list's channel as the screens show it: only Google's own AI Assistant channel can be named there. */
export function landingChannelOf(raw: string): string {
  return raw === GOOGLE_AI_CHANNEL ? AI_ASSISTANTS_CHANNEL : raw;
}

/** A website's page groups: its own classifications, or Hakken's page types while it has none. */
type Classifier = { kindOf: (address: string) => string; nameOf: (kind: string) => string | null };

export async function classifierFor(ctx: Reader, holdId: HoldId): Promise<Classifier> {
  const kinds = await readPageKinds(ctx, holdId);
  return {
    kindOf: (address) => {
      if (address === NOT_SET) return NO_PAGE_KIND;
      if (kinds) return kinds.kindOf(address);
      return pageTypeByAddress(pathOfAddress(address)) ?? "OTHER";
    },
    nameOf: (kind) => kinds?.nameOf(kind) ?? null,
  };
}

type Totals = { visits: number; engaged: number; seconds: number; views: number; people: number; newPeople: number; conversions: number; value: number };

function totalsOf(rows: readonly ListRow[], counted: readonly Counted[]): Totals {
  const total = blank("");
  for (const row of rows) addInto(total, row);
  const { conversions, value } = conversionsOf(total, counted);
  return { visits: total.visits, engaged: total.engaged, seconds: total.seconds, views: total.views, people: total.people, newPeople: total.newPeople, conversions, value };
}

/** A ready-made list's rows, or null while it is not built. */
async function rowsOf(ctx: Reader, holdId: HoldId, key: string): Promise<ListRow[] | null> {
  return (await readSlot(ctx, holdId, key))?.rows ?? null;
}

/** One channel's rows of a channel list. */
function ofChannel(rows: readonly ListRow[] | null, channel: string): ListRow[] {
  return (rows ?? []).filter((row) => displayOf(row.key) === channel);
}

/** One channel's landing pages, each row keyed by its page (CH5, CH6, and its table's Landing pages, CH7), from `landingByChannel`'s rows. */
export function landingOf(rows: readonly ListRow[] | null, channel: string): ListRow[] {
  return (rows ?? []).flatMap((row) => {
    const { channel: page, source: shown } = splitChannelKey(row.key);
    return shown === channel ? [{ ...row, key: page }] : [];
  });
}

/** A row less another's figures, none below nought: a channel's visits on a page without its assistants'. Shared with each page's channels over time (`googleAnalyticsPageChannels.ts`). */
export function less(row: ListRow, taken: ListRow): ListRow {
  const out = blank(row.key);
  const minus = (key: "visits" | "engaged" | "seconds" | "views" | "purchases" | "revenue" | "people" | "newPeople" | "length") => Math.max(0, row[key] - taken[key]);
  for (const key of ["visits", "engaged", "seconds", "views", "purchases", "revenue", "people", "newPeople", "length"] as const) out[key] = minus(key);
  for (const [event, count] of row.counts) out.counts.set(event, Math.max(0, count - (taken.counts.get(event) ?? 0)));
  for (const [event, value] of row.values) out.values.set(event, Math.max(0, value - (taken.values.get(event) ?? 0)));
  return out;
}

/**
 * Each landing page by the channel the screens show (CH5, CH9, CH13), keyed
 * page then channel, every device, as the lists are kept: AI assistants'
 * visits from the assistants' own list, whichever channel Google filed them
 * under, and taken out of that channel's — so ChatGPT's referrals count once,
 * as AI assistants. Before that list is kept, Google's own AI Assistant
 * channel stands for them.
 */
export async function landingByChannel(
  ctx: Reader,
  holdId: HoldId,
  period: AnalyticsPeriod,
  which: "NOW" | "BEFORE",
  country: string,
  /** One device's (ga-stored-figures-plan.md SF5); every device's until a run has built that device's lists. */
  device = "",
): Promise<(Held & { assistants: boolean; everyDevice: boolean }) | null> {
  const own = device !== "" ? await readSlot(ctx, holdId, slotKey("landingChannel", period, which, device, country)) : null;
  const shown = own ? device : "";
  const held = own ?? await readSlot(ctx, holdId, slotKey("landingChannel", period, which, "", country));
  if (!held) return null;
  const everyDevice = device !== "" && !own;
  const assistants = await rowsOf(ctx, holdId, slotKey("landingAssistant", period, which, shown, country));
  if (!assistants) return { ...held, assistants: false, everyDevice, rows: held.rows.map((row) => ({ ...row, key: channelKey(splitChannelKey(row.key).channel, landingChannelOf(splitChannelKey(row.key).source)) })) };
  // Each assistant visit by its page and the channel Google filed it under: only a source on the list counts.
  const taken = new Map<string, ListRow>();
  const ai = new Map<string, ListRow>();
  for (const row of assistants) {
    const { channel: page, source: rest } = splitChannelKey(row.key);
    const { channel: filed, source } = splitChannelKey(rest);
    if (assistantOf(source) === null) continue;
    const filedKey = channelKey(page, filed);
    addInto(taken.get(filedKey) ?? taken.set(filedKey, blank(filedKey)).get(filedKey)!, row);
    const aiKey = channelKey(page, AI_ASSISTANTS_CHANNEL);
    addInto(ai.get(aiKey) ?? ai.set(aiKey, blank(aiKey)).get(aiKey)!, row);
  }
  const rows: ListRow[] = [];
  for (const row of held.rows) {
    const { channel: page, source: filed } = splitChannelKey(row.key);
    const own = taken.get(row.key);
    const rest = own ? less(row, own) : row;
    if (rest.visits <= 0 && rest.counts.size === 0) continue;
    // What Google filed as AI Assistant from a source not on the list is still an assistant's.
    const shown = landingChannelOf(filed);
    if (shown === AI_ASSISTANTS_CHANNEL) {
      const aiKey = channelKey(page, AI_ASSISTANTS_CHANNEL);
      addInto(ai.get(aiKey) ?? ai.set(aiKey, blank(aiKey)).get(aiKey)!, rest);
    } else if (rest.visits > 0) rows.push({ ...rest, key: channelKey(page, shown) });
  }
  return { ...held, assistants: true, everyDevice, rows: [...rows, ...ai.values()] };
}

/** Each kept page key read to its address. */
async function addressesOf(ctx: Reader, holdId: HoldId, keys: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(keys)];
  const named = await decodePages(ctx, holdId, unique);
  return new Map(unique.map((key, index) => [key, named[index]]));
}

/** Tracking health's verdicts on the website's conversions (conversion-checks-plan.md): what each one really is. */
function verdictsOf(connection: Doc<"googleAnalyticsConnections">) {
  const checks = connection.health?.checks ?? [];
  const enquiries = new Set(checks.find((check) => check.check === "ENQUIRY_UNCOUNTED" && !check.passing)?.names ?? []);
  const copy = checks.find((check) => check.check === "SOMETHING_ELSE" && !check.passing);
  const copies = new Map((copy?.names ?? []).map((name, index) => [name, copy?.others?.[index] ?? ""]));
  return { enquiries, copies };
}

/** The key events not counted that happened in rows, and the counted ones that are really something else (R3). */
function eventsFacts(connection: Doc<"googleAnalyticsConnections">, total: ListRow): { uncounted: UncountedFacts[]; copies: CopyFacts[] } {
  const { enquiries, copies } = verdictsOf(connection);
  const events = connection.events ?? [];
  return {
    uncounted: events.filter((event) => !event.counted).map((event) => ({ eventName: event.eventName, count: total.counts.get(event.eventName) ?? 0, enquiry: enquiries.has(event.eventName) })),
    copies: events.filter((event) => event.counted && copies.has(event.eventName)).map((event) => ({ eventName: event.eventName, other: copies.get(event.eventName) ?? "", count: total.counts.get(event.eventName) ?? 0 })),
  };
}

function summed(rows: readonly ListRow[]): ListRow {
  const total = blank("");
  for (const row of rows) addInto(total, row);
  return total;
}

const argsOf = {
  siteId: v.id("companyWebsites"),
  period: analyticsPeriodValidator,
  device: v.string(),
  /** A home country other than the main one (`fra`); left out for the main one. */
  country: v.optional(v.string()),
};

// ---------------------------------------------------------------------------
// A channel's own page: its figures, page groups, the pages behind the change
// ---------------------------------------------------------------------------

const kindValidator = v.object({
  /** A classification's id, Hakken's own page type (`SERVICE`) while the website has no classifications, `NOT_SORTED`, or `NO_PAGE`. */
  kind: v.string(),
  /** A classification's name; null for the others, named on screen. */
  name: v.union(v.string(), v.null()),
  pages: v.number(),
  visits: v.number(),
  visitsBefore: v.number(),
  conversions: v.number(),
  conversionsBefore: v.number(),
});
export type ChannelKind = Infer<typeof kindValidator>;

const channelFiguresValidator = v.object({
  visits: v.number(),
  visitsBefore: v.union(v.number(), v.null()),
  engaged: v.number(),
  /** Seconds engaged, all told: dwell time is these over visits. */
  seconds: v.number(),
  people: v.number(),
  newPeople: v.number(),
  conversions: v.number(),
  conversionsBefore: v.union(v.number(), v.null()),
  value: v.number(),
  valueBefore: v.union(v.number(), v.null()),
  /** Conversions by the people this channel first brought, on any visit (CH3); null while not held. */
  started: v.union(v.number(), v.null()),
  startedBefore: v.union(v.number(), v.null()),
  /** The whole website's, to weigh the channel against. */
  siteVisits: v.number(),
  siteEngaged: v.number(),
  siteSeconds: v.number(),
  siteConversions: v.number(),
  /** AI assistants: the visits Google filed outside its own AI Assistant channel (CH8). */
  elsewhere: v.number(),
});

const channelTopValidator = v.object({
  state: v.union(v.literal("READY"), v.literal("PREPARING"), v.literal("NONE")),
  from: v.union(v.string(), v.null()),
  to: v.union(v.string(), v.null()),
  figures: v.union(v.null(), channelFiguresValidator),
  kinds: v.array(kindValidator),
  /** The pages behind the change (CH6): the biggest gains, then the biggest losses. */
  movers: v.array(v.object({ key: v.string(), address: v.string(), title: v.optional(v.string()), visits: v.number(), visitsBefore: v.number() })),
  /** AI assistants (CH8): each assistant, and the channels Google filed its visits under. */
  assistants: v.array(v.object({
    name: v.string(),
    visits: v.number(),
    visitsBefore: v.union(v.number(), v.null()),
    conversions: v.number(),
    filed: v.array(v.object({ channel: v.string(), visits: v.number() })),
  })),
  /** A device was chosen: the page groups and pages are every device's, as those lists are kept. */
  everyDevice: v.boolean(),
  /** AI assistants' landing pages are every assistant visit (CH13); false while only Google's AI Assistant channel is held. */
  everyAssistant: v.boolean(),
  seen: seenValidator,
});

/**
 * A channel's own page above its table (CH2–CH6, CH8): its figures against
 * the span before and the whole website, its visits by page group, the pages
 * behind the change, AI assistants by assistant, and What Hakken sees.
 */
export const analyticsChannelTop = tenantQuery({
  args: { ...argsOf, channel: v.string() },
  returns: channelTopValidator,
  handler: async (ctx, args) => await readChannelTop(ctx, args),
});

type ChannelArgs = { siteId: Id<"companyWebsites">; period: AnalyticsPeriod; device: string; country?: string; channel: string };

const NOTHING = { from: null, to: null, figures: null, kinds: [], movers: [], assistants: [], everyDevice: false, everyAssistant: false, seen: seen([]) };

/** Its screen's read, for the screen and Ask Hakken alike: the caller's own website only. */
export async function readChannelTop(ctx: SiteReader, args: ChannelArgs): Promise<Infer<typeof channelTopValidator>> {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return { ...NOTHING, state: connection?.status === "CONNECTED" ? "PREPARING" : "NONE" };
  const counted = countedOf(connection);
  const key = (list: "channel" | "firstChannel" | "landingChannel", which: "NOW" | "BEFORE" | "YEAR", period: AnalyticsPeriod = args.period, device = "") => slotKey(list, period, which, device, country);
  const now = await readSlot(ctx, holdId, key("channel", "NOW", args.period, args.device));
  if (!now) return { ...NOTHING, state: "PREPARING" };
  const beforeRows = await rowsOf(ctx, holdId, key("channel", "BEFORE", args.period, args.device));
  const mine = ofChannel(now.rows, args.channel);
  const mineBefore = beforeRows ? ofChannel(beforeRows, args.channel) : null;
  const total = totalsOf(mine, counted);
  const was = mineBefore ? totalsOf(mineBefore, counted) : null;
  const website = totalsOf(now.rows, counted);
  // The people a channel first brought, every device: the lists are kept so.
  const firstNow = await rowsOf(ctx, holdId, key("firstChannel", "NOW"));
  const firstBefore = await rowsOf(ctx, holdId, key("firstChannel", "BEFORE"));
  const ai = args.channel === AI_ASSISTANTS_CHANNEL;
  const elsewhere = ai ? mine.filter((row) => splitChannelKey(row.key).channel !== GOOGLE_AI_CHANNEL).reduce((sum, row) => sum + row.visits, 0) : 0;
  const figures = {
    visits: total.visits,
    visitsBefore: was?.visits ?? null,
    engaged: total.engaged,
    seconds: total.seconds,
    people: total.people,
    newPeople: total.newPeople,
    conversions: total.conversions,
    conversionsBefore: was?.conversions ?? null,
    value: total.value,
    valueBefore: was?.value ?? null,
    started: firstNow ? totalsOf(ofChannel(firstNow, args.channel), counted).conversions : null,
    startedBefore: firstBefore ? totalsOf(ofChannel(firstBefore, args.channel), counted).conversions : null,
    siteVisits: website.visits,
    siteEngaged: website.engaged,
    siteSeconds: website.seconds,
    siteConversions: website.conversions,
    elsewhere,
  };

  // Its landing pages, now and before: every device, as the list is kept.
  const landed = await landingByChannel(ctx, holdId, args.period, "NOW", country, args.device);
  const landing = landingOf(landed?.rows ?? null, args.channel);
  const landingBefore = landingOf((await landingByChannel(ctx, holdId, args.period, "BEFORE", country, args.device))?.rows ?? null, args.channel);
  const addresses = await addressesOf(ctx, holdId, [...landing, ...landingBefore].map((row) => row.key));
  const classifier = await classifierFor(ctx, holdId);
  const pageRows = new Map<string, PageFacts & { address: string }>();
  const kinds = new Map<string, ChannelKind>();
  const kindRow = (kind: string) => kinds.get(kind) ?? { kind, name: classifier.nameOf(kind), pages: 0, visits: 0, visitsBefore: 0, conversions: 0, conversionsBefore: 0 };
  for (const [rows, which] of [[landing, "now"], [landingBefore, "before"]] as const) {
    for (const row of rows) {
      const address = addresses.get(row.key) ?? row.key;
      const conversions = conversionsOf(row, counted).conversions;
      const page = pageRows.get(row.key) ?? { key: row.key, address, visits: 0, visitsBefore: 0, conversions: 0, conversionsBefore: 0 };
      const kind = kindRow(classifier.kindOf(address));
      if (which === "now") {
        page.visits += row.visits;
        page.conversions += conversions;
        kind.visits += row.visits;
        kind.conversions += conversions;
        kind.pages += 1;
      } else {
        page.visitsBefore = (page.visitsBefore ?? 0) + row.visits;
        page.conversionsBefore = (page.conversionsBefore ?? 0) + conversions;
        kind.visitsBefore += row.visits;
        kind.conversionsBefore += conversions;
      }
      pageRows.set(row.key, page);
      kinds.set(kind.kind, kind);
    }
  }
  const pages = [...pageRows.values()];
  const kindList = [...kinds.values()].filter((kind) => kind.visits > 0 || kind.visitsBefore > 0).sort((left, right) => right.visits - left.visits || right.visitsBefore - left.visitsBefore);
  const moved = pages.map((page) => ({ page, by: page.visits - (page.visitsBefore ?? 0) })).filter((move) => move.by !== 0);
  const gains = moved.filter((move) => move.by > 0).sort((left, right) => right.by - left.by).slice(0, MOVERS_EACH);
  const losses = moved.filter((move) => move.by < 0).sort((left, right) => left.by - right.by).slice(0, MOVERS_EACH);
  const shownMovers = [...gains, ...losses].map((move) => move.page);
  const titles = await titlesOf(ctx, holdId, shownMovers.map((page) => page.address));
  const movers = shownMovers.map((page) => {
    const title = titles.get(page.address);
    return { key: page.key, address: page.address, ...(title ? { title } : {}), visits: page.visits, visitsBefore: page.visitsBefore ?? 0 };
  });
  const noPage = pageRows.get(NOT_SET) ?? null;
  const noPageEngaged = landing.filter((row) => row.key === NOT_SET).reduce((sum, row) => sum + row.engaged, 0);

  // AI assistants by assistant, and the channels Google filed each one's visits under (CH8).
  const assistants = ai ? assistantsOf(mine, mineBefore, counted) : [];

  // R7: the last 3 months against the 3 before (there is no year before for them: sees-header-and-rolling-dates-plan.md,
  // rule 2), every device, Google's own answers; and the last 12 months against the 12 before, added up from the days,
  // weeks and months held — visits add up where people do not (calendar-periods-plan.md, rule 10).
  const span = async (which: "NOW" | "BEFORE" | "YEAR") => {
    const rows = await rowsOf(ctx, holdId, key("channel", which, "last3Months"));
    return rows ? ofChannel(rows, args.channel).reduce((sum, row) => sum + row.visits, 0) : null;
  };
  const twelveMonths = async (to: string) => {
    const points = await readChannelPoints(ctx, connection, "", shiftDay(to, -364), to, country);
    return points ? points.reduce((sum, point) => sum + ofChannel(point.rows, args.channel).reduce((total, row) => total + row.visits, 0), 0) : null;
  };
  const [last90, previous90, yearAgo90, year, yearBefore] = await Promise.all([
    span("NOW"), span("BEFORE"), span("YEAR"), twelveMonths(connection.newestDay), twelveMonths(shiftDay(connection.newestDay, -365)),
  ]);
  const spans = last90 !== null && previous90 !== null && yearAgo90 !== null && year !== null && yearBefore !== null ? { last90, previous90, yearAgo90, year, yearBefore } : null;

  const facts: ChannelPageFacts = {
    channel: args.channel,
    figures: { visits: total.visits, visitsBefore: figures.visitsBefore, engaged: total.engaged, people: total.people, newPeople: total.newPeople, conversions: total.conversions, conversionsBefore: figures.conversionsBefore, started: figures.started },
    kinds: kindList,
    pages,
    noPage: noPage ? { visits: noPage.visits, engaged: noPageEngaged } : null,
    ...eventsFacts(connection, summed(mine)),
    ai: ai ? { visits: total.visits, elsewhere } : null,
    spans,
  };
  return {
    state: "READY",
    from: now.from,
    to: now.to,
    figures,
    kinds: kindList,
    movers,
    assistants,
    everyDevice: landed?.everyDevice ?? false,
    everyAssistant: landed?.assistants ?? false,
    seen: await namedPages(ctx, holdId, channelPageSees(facts)),
  };
}

/** AI assistants' rows by assistant, each with the channels Google filed its visits under. */
function assistantsOf(rows: readonly ListRow[], before: readonly ListRow[] | null, counted: readonly Counted[]) {
  const by = new Map<string, { name: string; visits: number; visitsBefore: number | null; conversions: number; filed: Map<string, number> }>();
  const nameOf = (row: ListRow) => assistantOf(splitChannelKey(row.key).source) ?? splitChannelKey(row.key).source;
  for (const row of rows) {
    const name = nameOf(row);
    const entry = by.get(name) ?? { name, visits: 0, visitsBefore: before ? 0 : null, conversions: 0, filed: new Map<string, number>() };
    entry.visits += row.visits;
    entry.conversions += conversionsOf(row, counted).conversions;
    const channel = splitChannelKey(row.key).channel;
    entry.filed.set(channel, (entry.filed.get(channel) ?? 0) + row.visits);
    by.set(name, entry);
  }
  for (const row of before ?? []) {
    const entry = by.get(nameOf(row));
    if (entry) entry.visitsBefore = (entry.visitsBefore ?? 0) + row.visits;
  }
  return [...by.values()]
    .sort((left, right) => right.visits - left.visits || left.name.localeCompare(right.name))
    .map((entry) => ({ ...entry, filed: [...entry.filed.entries()].sort((left, right) => right[1] - left[1]).map(([channel, visits]) => ({ channel, visits })) }));
}

/** A box's page numbers read to their paths: only the pages it quotes. */
async function namedPages(ctx: Reader, holdId: HoldId, box: Seen): Promise<Seen> {
  const quoted = [...box.says, ...box.steps].flatMap((phrase) => [phrase.text, phrase.more]).filter((value): value is string => Boolean(value?.startsWith("~")));
  if (quoted.length === 0) return box;
  const named = await addressesOf(ctx, holdId, quoted);
  const rename = <Phrase extends SeenPhrase>(phrase: Phrase): Phrase => ({
    ...phrase,
    ...(phrase.text?.startsWith("~") ? { text: pathOfAddress(named.get(phrase.text) ?? phrase.text) } : {}),
    ...(phrase.more?.startsWith("~") ? { more: pathOfAddress(named.get(phrase.more) ?? phrase.more) } : {}),
  });
  return { says: box.says.map(rename), steps: box.steps.map((step) => ({ ...rename(step), to: step.to })) };
}

// ---------------------------------------------------------------------------
// A channel's key events (CH7)
// ---------------------------------------------------------------------------

/**
 * Every key event of the property for one channel (CH7): counted as a
 * conversion or not, how many now and before, the value of those counted,
 * and the pages those visits landed on most.
 */
export const analyticsChannelEvents = tenantQuery({
  args: { ...argsOf, channel: v.string() },
  returns: v.object({
    rows: v.array(v.object({
      eventName: v.string(),
      counted: v.boolean(),
      count: v.number(),
      countBefore: v.union(v.number(), v.null()),
      /** In hundredths; 0 for an event not counted. */
      value: v.number(),
      landed: v.array(v.object({ address: v.string(), count: v.number() })),
      /** The other pages it happened on, past the three named. */
      landedMore: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const country = await keptCountry(ctx, site.hold, args.country);
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay) return { rows: [] };
    const counted = countedOf(connection);
    const now = await rowsOf(ctx, holdId, slotKey("channel", args.period, "NOW", args.device, country));
    if (!now) return { rows: [] };
    const before = await rowsOf(ctx, holdId, slotKey("channel", args.period, "BEFORE", args.device, country));
    const total = summed(ofChannel(now, args.channel));
    const was = before ? summed(ofChannel(before, args.channel)) : null;
    const landing = landingOf((await landingByChannel(ctx, holdId, args.period, "NOW", country, args.device))?.rows ?? null, args.channel);
    const events = connection.events ?? [];
    const landedOn = events.map((event) => landing
      .filter((row) => (row.counts.get(event.eventName) ?? 0) > 0)
      .sort((left, right) => (right.counts.get(event.eventName) ?? 0) - (left.counts.get(event.eventName) ?? 0)));
    const tops = landedOn.map((rows) => rows.slice(0, LANDED_NAMED));
    const addresses = await addressesOf(ctx, holdId, tops.flat().map((row) => row.key));
    return {
      rows: events.map((event, index) => {
        const own = counted.find((one) => one.eventName === event.eventName);
        return {
          eventName: event.eventName,
          counted: event.counted,
          count: total.counts.get(event.eventName) ?? 0,
          countBefore: was ? was.counts.get(event.eventName) ?? 0 : null,
          value: own ? conversionsOf(total, [own]).value : 0,
          landed: tops[index].map((row) => ({ address: addresses.get(row.key) ?? row.key, count: row.counts.get(event.eventName) ?? 0 })),
          landedMore: landedOn[index].length - tops[index].length,
        };
      }).sort((left, right) => right.count - left.count || (right.countBefore ?? 0) - (left.countBefore ?? 0) || Number(right.counted) - Number(left.counted)),
    };
  },
});

// ---------------------------------------------------------------------------
// The channel a day, against the span before (CH4, CH7, CH8)
// ---------------------------------------------------------------------------

const dayValidator = v.object({
  day: v.string(),
  /** A week's or month's last day: the past beyond 90 days is held by week, then month (ga-stored-figures-plan.md SF2b). */
  lastDay: v.optional(v.string()),
  visits: v.number(),
  engaged: v.number(),
  seconds: v.number(),
  conversions: v.number(),
  /** Each key event's times, in `events`' order. */
  events: v.array(v.number()),
  /** Each source's visits, in `sources`' order; the last is the rest when `rest`. */
  sources: v.array(v.number()),
});
type ChannelDay = Infer<typeof dayValidator>;

/**
 * One channel a day over the dates chosen and the span before them (CH4):
 * its visits, engaged visits, seconds engaged and conversions, each key
 * event's times (CH7) and each source's visits — each assistant's, on AI
 * assistants (CH8). From each home country's channels kept a day, then a
 * week, then a month (ga-stored-figures-plan.md SF2, SF7); `live` while the
 * dates reach past what is held, the minutes before a new website's two
 * years are filled.
 */
export const analyticsChannelDays = tenantQuery({
  args: { ...argsOf, channel: v.string() },
  returns: v.object({
    /** The dates chosen, or the span before, still to be asked of Google. */
    live: v.boolean(),
    liveBefore: v.boolean(),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    /** Days from the span before's first day to the period's: what lays one over the other (calendar-periods-plan.md). */
    shift: v.number(),
    events: v.array(v.object({ eventName: v.string(), counted: v.boolean() })),
    sources: v.array(v.string()),
    rest: v.boolean(),
    now: v.array(dayValidator),
    before: v.array(dayValidator),
  }),
  handler: async (ctx, args) => await readChannelDays(ctx, args),
});

export async function readChannelDays(ctx: SiteReader, args: ChannelArgs) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const none = { live: false, liveBefore: false, from: null, to: null, shift: 0, events: [], sources: [], rest: false, now: [], before: [] };
  if (!connection?.newestDay) return none;
  const counted = countedOf(connection);
  const events = (connection.events ?? []).map((event) => ({ eventName: event.eventName, counted: event.counted }));
  // The period's dates and the span it is set against, as the lists were asked for (calendar-periods-plan.md, phase 6).
  const [total, totalBefore] = await Promise.all([
    readSlot(ctx, holdId, slotKey("total", args.period, "NOW", "", country)),
    readSlot(ctx, holdId, slotKey("total", args.period, "BEFORE", "", country)),
  ]);
  const nowRange = total ?? periodRange(args.period, "NOW", connection.newestDay);
  const beforeRange = totalBefore ?? periodRange(args.period, "BEFORE", connection.newestDay);
  if (!nowRange || !beforeRange) return none;
  const { from, to } = nowRange;
  const { from: beforeFrom, to: beforeTo } = beforeRange;
  // Each span's points, from what Hakken holds for the home country (ga-stored-figures-plan.md SF2, SF7): null while
  // the dates reach past it — the minutes before a new website's two years are filled. Nothing is asked of Google.
  type Entry = { day: string; lastDay?: string; rows: ListRow[] };
  const spanOf = async (first: string, last: string): Promise<Entry[] | null> => {
    const held = await readChannelPoints(ctx, connection, args.device, first, last, country);
    return held?.map((point) => ({ day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}), rows: point.rows })) ?? null;
  };
  const nowEntries = await spanOf(from, to);
  const beforeEntries = await spanOf(beforeFrom, beforeTo);
  const ai = args.channel === AI_ASSISTANTS_CHANNEL;
  const sourceOf = (row: ListRow) => {
    const { source } = splitChannelKey(row.key);
    return ai ? assistantOf(source) ?? source : source;
  };
  const mine = (entry: Entry) => entry.rows.filter((row) => displayOf(row.key) === args.channel);
  // The busiest sources a line each, over both spans.
  const sourceTotals = new Map<string, number>();
  for (const entry of [...(nowEntries ?? []), ...(beforeEntries ?? [])]) for (const row of mine(entry)) sourceTotals.set(sourceOf(row), (sourceTotals.get(sourceOf(row)) ?? 0) + row.visits);
  const ranked = [...sourceTotals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([source]) => source);
  const sources = ranked.slice(0, SOURCE_LINES);
  const rest = ranked.length > SOURCE_LINES;
  const pointOf = (entry: Entry): ChannelDay => {
    const rows = mine(entry);
    const sum = summed(rows);
    const bySource = sources.map((source) => rows.filter((row) => sourceOf(row) === source).reduce((all, row) => all + row.visits, 0));
    const others = rows.filter((row) => !sources.includes(sourceOf(row))).reduce((all, row) => all + row.visits, 0);
    return {
      day: entry.day,
      ...(entry.lastDay ? { lastDay: entry.lastDay } : {}),
      visits: sum.visits,
      engaged: sum.engaged,
      seconds: sum.seconds,
      conversions: conversionsOf(sum, counted).conversions,
      events: events.map((event) => sum.counts.get(event.eventName) ?? 0),
      sources: rest ? [...bySource, others] : bySource,
    };
  };
  return {
    live: nowEntries === null,
    liveBefore: beforeEntries === null,
    from,
    to,
    shift: Math.round((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${beforeFrom}T00:00:00Z`)) / 86_400_000),
    events,
    sources,
    rest,
    now: (nowEntries ?? []).map(pointOf),
    before: (beforeEntries ?? []).map(pointOf),
  };
}

// ---------------------------------------------------------------------------
// Channels (CH9)
// ---------------------------------------------------------------------------

/** A channel's extras for Channels' table (CH9): the conversions it started, and the page group most of its visits land on. */
export type ChannelExtras = { started: number | null; landsMost: { kind: string; name: string | null; share: number } | null };

/** Each channel's extras, by its name as the screens show it: every device, as the two lists are kept. */
export async function channelExtras(ctx: Reader, holdId: HoldId, period: AnalyticsPeriod, country: string, counted: readonly Counted[], device = ""): Promise<Map<string, ChannelExtras>> {
  const first = await rowsOf(ctx, holdId, slotKey("firstChannel", period, "NOW", "", country));
  const landing = (await landingByChannel(ctx, holdId, period, "NOW", country, device))?.rows ?? null;
  const out = new Map<string, ChannelExtras>();
  const extrasOf = (channel: string) => out.get(channel) ?? { started: first ? 0 : null, landsMost: null };
  for (const row of first ?? []) {
    const channel = displayOf(row.key);
    const entry = extrasOf(channel);
    entry.started = (entry.started ?? 0) + conversionsOf(row, counted).conversions;
    out.set(channel, entry);
  }
  if (landing) {
    const addresses = await addressesOf(ctx, holdId, landing.map((row) => splitChannelKey(row.key).channel));
    const classifier = await classifierFor(ctx, holdId);
    const byChannel = new Map<string, Map<string, number>>();
    for (const row of landing) {
      const { channel: page, source: channel } = splitChannelKey(row.key);
      const kinds = byChannel.get(channel) ?? new Map<string, number>();
      const kind = classifier.kindOf(addresses.get(page) ?? page);
      kinds.set(kind, (kinds.get(kind) ?? 0) + row.visits);
      byChannel.set(channel, kinds);
    }
    for (const [channel, kinds] of byChannel) {
      const visits = [...kinds.values()].reduce((sum, count) => sum + count, 0);
      const [kind, count] = [...kinds.entries()].sort((left, right) => right[1] - left[1])[0] ?? [null, 0];
      if (!kind || visits === 0) continue;
      out.set(channel, { ...extrasOf(channel), landsMost: { kind, name: classifier.nameOf(kind), share: count / visits } });
    }
  }
  return out;
}

const mapCellValidator = v.object({ kind: v.string(), visits: v.number(), conversions: v.number() });

/**
 * Channels above its table (CH9): the website's figures with the channel
 * converting best over 12 months and the key events not counted, each
 * channel by page group (ChannelMap), what a visit is worth by channel over
 * 12 months, and What Hakken sees.
 */
export const analyticsChannelsTop = tenantQuery({
  args: argsOf,
  returns: v.object({
    state: v.union(v.literal("READY"), v.literal("PREPARING"), v.literal("NONE")),
    figures: v.union(v.null(), v.object({
      visits: v.number(),
      visitsBefore: v.union(v.number(), v.null()),
      conversions: v.number(),
      conversionsBefore: v.union(v.number(), v.null()),
      value: v.number(),
      seconds: v.number(),
      /** The channel converting best over 12 months, from 100 visits (R8). */
      best: v.union(v.null(), v.object({ channel: v.string(), rate: v.number(), siteRate: v.number(), visits: v.number() })),
      /** The key events not counted that happened in these dates, most first. */
      uncounted: v.array(v.object({ eventName: v.string(), count: v.number(), enquiry: v.boolean() })),
    })),
    map: v.object({
      kinds: v.array(v.object({ kind: v.string(), name: v.union(v.string(), v.null()) })),
      rows: v.array(v.object({ channel: v.string(), visits: v.number(), cells: v.array(mapCellValidator) })),
    }),
    /** What a visit is worth, by channel, over 12 months (CH9). */
    worth: v.object({
      siteRate: v.number(),
      /** The visits a channel needs before its rate is trusted (`FEW_VISITS`), for the chart's words. */
      few: v.number(),
      /** `fewVisits`: under 100 visits, too few to judge its rate (GA22), never shown as beating the website. */
      rows: v.array(v.object({ channel: v.string(), visits: v.number(), conversions: v.number(), value: v.number(), fewVisits: v.boolean() })),
    }),
    everyDevice: v.boolean(),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => await readChannelsTop(ctx, args),
});

export async function readChannelsTop(ctx: SiteReader, args: ObjectType<typeof argsOf>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  const empty = { figures: null, map: { kinds: [], rows: [] }, worth: { siteRate: 0, few: FEW_VISITS, rows: [] }, everyDevice: false, seen: seen([]) };
  if (!connection?.newestDay) return { ...empty, state: connection?.status === "CONNECTED" ? "PREPARING" as const : "NONE" as const };
  const counted = countedOf(connection);
  const now = await rowsOf(ctx, holdId, slotKey("channel", args.period, "NOW", args.device, country));
  if (!now) return { ...empty, state: "PREPARING" as const };
  const before = await rowsOf(ctx, holdId, slotKey("channel", args.period, "BEFORE", args.device, country));
  const group = (rows: readonly ListRow[]) => {
    const by = new Map<string, ListRow>();
    for (const row of rows) {
      const channel = displayOf(row.key);
      const entry = by.get(channel) ?? blank(channel);
      addInto(entry, row);
      by.set(channel, entry);
    }
    return by;
  };
  const nowBy = group(now);
  const beforeBy = before ? group(before) : null;
  const total = totalsOf(now, counted);
  const was = before ? totalsOf(before, counted) : null;

  // What a visit is worth over the last 12 months, every device (CH9, R8): added up from the days, weeks and months
  // held — visits and conversions add up (calendar-periods-plan.md, rule 10).
  const yearPoints = await readChannelPoints(ctx, connection, "", shiftDay(connection.newestDay, -364), connection.newestDay, country);
  const year = yearPoints ? merged(yearPoints.flatMap((point) => point.rows)) : null;
  const yearBy = year ? group(year) : new Map<string, ListRow>();
  const yearTotal = year ? totalsOf(year, counted) : null;
  const siteRate = yearTotal && yearTotal.visits > 0 ? yearTotal.conversions / yearTotal.visits : 0;
  const worthRows = [...yearBy.values()]
    .map((row) => ({ channel: row.key, visits: row.visits, ...conversionsOf(row, counted) }))
    .filter((row) => row.visits > 0)
    .map((row) => ({ channel: row.channel, visits: row.visits, conversions: row.conversions, value: row.value, fewVisits: row.visits < FEW_VISITS }))
    .sort((left, right) => right.conversions / right.visits - left.conversions / left.visits || right.visits - left.visits);
  const bestRow = worthRows.filter((row) => row.visits >= FEW_VISITS && row.conversions > 0)[0] ?? null;
  const best = bestRow && bestRow.conversions / bestRow.visits > siteRate ? { channel: bestRow.channel, rate: bestRow.conversions / bestRow.visits, siteRate, visits: bestRow.visits } : null;

  // Key events not counted, each with the channel bringing it most (R3).
  const { enquiries } = verdictsOf(connection);
  const all = summed(now);
  const uncounted = (connection.events ?? [])
    .filter((event) => !event.counted)
    .map((event) => {
      const count = all.counts.get(event.eventName) ?? 0;
      const top = [...nowBy.values()].sort((left, right) => (right.counts.get(event.eventName) ?? 0) - (left.counts.get(event.eventName) ?? 0))[0];
      return { eventName: event.eventName, count, enquiry: enquiries.has(event.eventName), channel: top?.key ?? "" };
    })
    .filter((event) => event.count > 0)
    .sort((left, right) => right.count - left.count);

  // Each channel by page group (ChannelMap), every device.
  const mapped = await landingByChannel(ctx, holdId, args.period, "NOW", country, args.device);
  const landing = mapped?.rows ?? null;
  const addresses = landing ? await addressesOf(ctx, holdId, landing.map((row) => splitChannelKey(row.key).channel)) : new Map<string, string>();
  const classifier = await classifierFor(ctx, holdId);
  const cells = new Map<string, Map<string, { visits: number; conversions: number }>>();
  const kindTotals = new Map<string, number>();
  let noPage = 0;
  for (const row of landing ?? []) {
    const { channel: page, source: channel } = splitChannelKey(row.key);
    const kind = classifier.kindOf(addresses.get(page) ?? page);
    if (kind === NO_PAGE_KIND) noPage += row.visits;
    const byKind = cells.get(channel) ?? new Map<string, { visits: number; conversions: number }>();
    const cell = byKind.get(kind) ?? { visits: 0, conversions: 0 };
    cell.visits += row.visits;
    cell.conversions += conversionsOf(row, counted).conversions;
    byKind.set(kind, cell);
    cells.set(channel, byKind);
    kindTotals.set(kind, (kindTotals.get(kind) ?? 0) + row.visits);
  }
  // The busiest page groups a column each, No page recorded last, the rest as Other.
  const ranked = [...kindTotals.entries()].filter(([kind]) => kind !== NO_PAGE_KIND).sort((left, right) => right[1] - left[1]).map(([kind]) => kind);
  const columns = ranked.slice(0, MAP_KINDS);
  const others = ranked.length > MAP_KINDS;
  const mapKinds = [...columns, ...(others ? [OTHER_KIND] : []), ...(kindTotals.has(NO_PAGE_KIND) ? [NO_PAGE_KIND] : [])];
  const mapRows = [...cells.entries()].map(([channel, byKind]) => {
    const row = mapKinds.map((kind) => {
      if (kind !== OTHER_KIND) return { kind, ...(byKind.get(kind) ?? { visits: 0, conversions: 0 }) };
      const rest = [...byKind.entries()].filter(([own]) => !columns.includes(own) && own !== NO_PAGE_KIND);
      return { kind, visits: rest.reduce((sum, [, cell]) => sum + cell.visits, 0), conversions: rest.reduce((sum, [, cell]) => sum + cell.conversions, 0) };
    });
    return { channel, visits: [...byKind.values()].reduce((sum, cell) => sum + cell.visits, 0), cells: row };
  }).filter((row) => row.visits > 0).sort((left, right) => right.visits - left.visits);

  const aiRows = now.filter((row) => displayOf(row.key) === AI_ASSISTANTS_CHANNEL);
  const aiVisits = aiRows.reduce((sum, row) => sum + row.visits, 0);
  const aiElsewhere = aiRows.filter((row) => splitChannelKey(row.key).channel !== GOOGLE_AI_CHANNEL).reduce((sum, row) => sum + row.visits, 0);
  const box = channelsPageSees({
    rows: [...nowBy.values()].map((row) => {
      const earlier = beforeBy?.get(row.key);
      return {
        channel: row.key,
        visits: row.visits,
        visitsBefore: beforeBy ? earlier?.visits ?? 0 : null,
        conversions: conversionsOf(row, counted).conversions,
        conversionsBefore: beforeBy ? (earlier ? conversionsOf(earlier, counted).conversions : 0) : null,
      };
    }),
    best: best ? { channel: best.channel, rate: best.rate, siteRate: best.siteRate } : null,
    uncounted,
    noPage,
    ai: aiVisits > 0 ? { visits: aiVisits, elsewhere: aiElsewhere } : null,
  });
  return {
    state: "READY" as const,
    figures: {
      visits: total.visits,
      visitsBefore: was?.visits ?? null,
      conversions: total.conversions,
      conversionsBefore: was?.conversions ?? null,
      value: total.value,
      seconds: total.seconds,
      best,
      uncounted: uncounted.map((event) => ({ eventName: event.eventName, count: event.count, enquiry: event.enquiry })),
    },
    map: { kinds: mapKinds.map((kind) => ({ kind, name: classifier.nameOf(kind) })), rows: mapRows },
    worth: { siteRate, few: FEW_VISITS, rows: worthRows },
    everyDevice: mapped?.everyDevice ?? false,
    seen: box,
  };
}
