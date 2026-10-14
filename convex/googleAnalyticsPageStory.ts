import { v, type Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { decodePages } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { titlesOf } from "./pageTitles";
import { slotKey } from "./googleAnalyticsCollect";
import { PAGE_FACT_JOIN, channelKey, emptyRow, siteNameOf, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { readPageRows, type PageRows } from "./googleAnalyticsPageLists";
import { FEW_VISITS, addInto, conversionsOf, readFor, readSlot, type Counted, type Held } from "./googleAnalyticsRows";
import type { AnalyticsPeriod } from "./googleAnalyticsSchema";
import { assistantOf, channelOf } from "./utils/aiAssistants";
import {
  OTHER_ROWS,
  STORY_JOIN,
  clicksOf,
  devicesOf,
  differentPages,
  nextOf,
  readShare,
  sourcesOf,
  viewsPerVisit,
  joined,
  weekdaysOf,
  whoOf,
} from "./utils/analyticsPageStory";

/**
 * A page's story on its own All pages screen (docs/plans/active/analytics-page-screen-plan.md
 * §2): what its figures come to — each against the website's, its page
 * group's or its own past (PS5). Worked out from the shared page lists every
 * collection keeps (docs/plans/active/ga-stored-figures-plan.md SF13, SF16;
 * `googleAnalyticsPageLists.ts`), so a page's screen never asks Google
 * (SF15): `live` until the next run has built them. Read with the screen's
 * own query (`googleAnalyticsPageReads.readPage`), so the screen and Ask
 * Hakken say one thing.
 */

/** The parts of a page's story, each worked out from the shared lists. */
type StoryList =
  | "channel" | "storyBack" | "storyRead" | "storySourcePages" | "storyPageVisits" | "storyPageRead" | "storyNext" | "storyDevices"
  | "storyWeekdays" | "storyCountries" | "storyAges" | "storyGenders" | "storyAgesConverted" | "storyGendersConverted" | "storyClicks"
  | "storyGroupRead";

type Reader = { db: QueryCtx["db"] };

/** The busiest pages of its group drawn beside it (§2, section 12). */
const LEAGUE_ROWS = 8;
/** Countries drawn, the most readers first. */
const COUNTRY_ROWS = 10;
/** Links out and downloads listed. */
const CLICK_ROWS = 25;

const whoValidator = v.object({
  rows: v.array(v.object({ key: v.string(), readers: v.number(), share: v.number(), websiteShare: v.union(v.number(), v.null()), conversions: v.number() })),
  /** The page's readers Google could place, and all of them. */
  readersPlaced: v.number(),
  readers: v.number(),
  /** The conversions from visits that started here Google could place, and all of them. */
  conversionsPlaced: v.number(),
  conversions: v.number(),
});

export const storyValidator = v.object({
  /** Until the shared lists it is worked out from are built: the next run builds them. */
  live: v.boolean(),
  /** Google held back small groups in one of its answers. */
  thresholded: v.boolean(),
  /** Visits that started on this page, and the conversions they went on to make anywhere on the website (PS1). */
  started: v.union(v.null(), v.object({
    visits: v.number(),
    /** In the span before; null when there is none to compare. */
    visitsBefore: v.union(v.number(), v.null()),
    websiteVisits: v.number(),
    conversions: v.number(),
    value: v.number(),
    visitsPerConversion: v.union(v.number(), v.null()),
    websiteVisitsPerConversion: v.union(v.number(), v.null()),
    /** Pages a visit as Google counts them, repeats and all, and the website's. */
    countedPages: v.union(v.number(), v.null()),
    websiteCountedPages: v.union(v.number(), v.null()),
    fewVisits: v.boolean(),
  })),
  /** Different pages a visit, for visits that started here (PS4). */
  differentPages: v.union(v.number(), v.null()),
  /** Its views a visit that saw it: over 1 when Google counts it again. */
  viewsPerVisit: v.union(v.number(), v.null()),
  /** Its visits that read it past 90% down, and its page group's. */
  read: v.union(v.number(), v.null()),
  groupRead: v.union(v.number(), v.null()),
  group: v.union(v.string(), v.null()),
  sources: v.array(v.object({
    key: v.string(),
    /** The channel as the screens name it ("AI assistants" among them). */
    channel: v.string(),
    /** Google's own name for the source (`(direct)`, `google`), and the name people know it by; null for none. */
    source: v.string(),
    name: v.union(v.string(), v.null()),
    visits: v.number(),
    pages: v.union(v.number(), v.null()),
    time: v.union(v.number(), v.null()),
    read: v.union(v.number(), v.null()),
    back: v.union(v.number(), v.null()),
    conversions: v.number(),
    value: v.number(),
    fewVisits: v.boolean(),
  })),
  next: v.array(v.object({
    kind: v.union(v.literal("page"), v.literal("again"), v.literal("left"), v.literal("others")),
    key: v.union(v.string(), v.null()),
    address: v.string(),
    title: v.optional(v.string()),
    views: v.number(),
    share: v.number(),
  })),
  /** The visits that started here, by people on a first visit and back again; the website's share of visits back again. */
  returning: v.union(v.null(), v.object({ first: v.number(), back: v.number(), unknown: v.number(), websiteBack: v.union(v.number(), v.null()) })),
  devices: v.array(v.object({ device: v.string(), share: v.number(), websiteShare: v.union(v.number(), v.null()) })),
  countries: v.array(v.object({ code: v.string(), people: v.number() })),
  ages: whoValidator,
  genders: whoValidator,
  weekdays: v.array(v.object({ day: v.string(), views: v.number() })),
  clicks: v.array(v.object({ kind: v.union(v.literal("click"), v.literal("download")), url: v.string(), clicks: v.number() })),
  /** The busiest pages of its group: the visits that started on each, and their conversions. */
  league: v.array(v.object({ key: v.string(), address: v.string(), title: v.optional(v.string()), visits: v.number(), conversions: v.number(), isThis: v.boolean() })),
});
export type PageStory = Infer<typeof storyValidator>;

export type StoryInput = {
  holdId: Id<"companyWebsites">;
  /** The page by its number, and its address. */
  page: string;
  address: string;
  period: AnalyticsPeriod;
  device: string;
  country: string;
  counted: readonly Counted[];
  /** The page list as read for the screen: every page's views, for its group's reading. */
  pages: readonly ListRow[];
};

/** A source as people know it, or null for typed in, for Google's "(not set)" and for a channel's other sources. */
function nameOfSource(source: string): string | null {
  return source === "(direct)" || source === "(not set)" || source === "" || source === OTHER_ROWS ? null : siteNameOf(source, assistantOf);
}

/**
 * A source's line: its channel as the screens name it and the source as people
 * know it, so one website's several addresses are one line (PS2) and never a
 * group of sources.
 */
function lineOf(key: string): string {
  const { channel, source } = splitChannelKey(key);
  return channelKey(channelOf(channel, source), nameOfSource(source) ?? source);
}

/** Rows added into one by their line; a joined key's tail (`␞returning`) kept on it. */
function onLines(rows: readonly ListRow[]): ListRow[] {
  const held = new Map<string, ListRow>();
  for (const row of rows) {
    const at = row.key.indexOf(STORY_JOIN);
    const key = at < 0 ? lineOf(row.key) : `${lineOf(row.key.slice(0, at))}${row.key.slice(at)}`;
    const into = held.get(key) ?? { ...row, key, counts: new Map(), values: new Map(), visits: 0, engaged: 0, seconds: 0, views: 0, purchases: 0, revenue: 0, people: 0, newPeople: 0, length: 0, ...(row.times !== undefined ? { times: 0 } : {}) };
    addInto(into, row);
    if (row.times !== undefined) into.times = (into.times ?? 0) + row.times;
    held.set(key, into);
  }
  return [...held.values()];
}

const counts = (held: Held | null, field: "people" | "views" | "times") => (held?.rows ?? []).map((row) => ({ key: row.key, count: field === "times" ? row.times ?? 0 : row[field] }));

/** Rows added up by `keyOf`, each figure and event. */
function summed(rows: readonly ListRow[], keyOf: (row: ListRow) => string): ListRow[] {
  const held = new Map<string, ListRow>();
  for (const row of rows) {
    const key = keyOf(row);
    const into = held.get(key) ?? { ...emptyRow(key), ...(row.times !== undefined ? { times: 0 } : {}) };
    addInto(into, row);
    if (row.times !== undefined) into.times = (into.times ?? 0) + row.times;
    held.set(key, into);
  }
  return [...held.values()];
}

const SHARED = ["landingSource", "landingPagesSeen", "pageNext", "pageClicks", "pageWho", "landingWho", "pageCountry", "pageWeekday"] as const;
type Shared = Record<(typeof SHARED)[number] | "pageDevice", PageRows>;

/**
 * A page's rows of every shared list its story is worked out from (SF13), or
 * null until each is built for the date range and device — and the page
 * list counts its reading. Kept for each home country (SF7).
 */
async function sharedLists(ctx: Reader, input: StoryInput): Promise<Shared | null> {
  if (!input.pages[0]?.counts.has("scroll")) return null;
  const out: Partial<Shared> = {};
  for (const list of SHARED) {
    // Its readers' countries are every country's, whatever the home country (PS8): kept with the main one's lists.
    const rows = await readPageRows(ctx, input.holdId, list, input.period, input.device, input.page, "NOW", list === "pageCountry" ? "" : input.country);
    if (!rows) return null;
    out[list] = rows;
  }
  // Its views on each device, whatever device the screen is set to.
  const devices = await readPageRows(ctx, input.holdId, "pageDevice", input.period, "", input.page, "NOW", input.country);
  if (!devices) return null;
  return { ...out, pageDevice: devices } as Shared;
}

/**
 * The story's lists, as the screen's asks of Google named them, worked out
 * from the shared lists: a landing page's sources, new or returning, and
 * their reading; who reads it; its days, devices, countries and clicks.
 */
function storyFromShared(shared: Shared, page: string, own: ListRow | null, pages: readonly ListRow[], counted: readonly Counted[]): Map<StoryList, Held> {
  const held = (rows: ListRow[], thresholded = false): Held => ({ rows, from: "", to: "", folded: false, thresholded, cut: false });
  // A landing page's row: its channel, source and new or returning.
  const partsOf = (row: ListRow) => {
    const [channel = "", source = "", returning = ""] = row.key.split(PAGE_FACT_JOIN);
    return { channel, source, returning };
  };
  const sources = shared.landingSource.rows;
  const sourceOf = (row: ListRow) => channelKey(partsOf(row).channel, partsOf(row).source);
  const reading = summed(sources, sourceOf).flatMap((row) => ["page_view", "scroll"].map((event) => ({ ...emptyRow(joined(row.key, event)), times: row.counts.get(event) ?? 0 })));
  const byAge = (row: ListRow) => row.key.split(PAGE_FACT_JOIN)[0] ?? "";
  const byGender = (row: ListRow) => row.key.split(PAGE_FACT_JOIN)[1] ?? "";
  const converted = (keyOf: (row: ListRow) => string) => summed(shared.landingWho.rows.map((row) => ({ ...row, times: conversionsOf(row, counted).conversions })), keyOf);
  return new Map<StoryList, Held>([
    ["channel", held(summed(sources, sourceOf), shared.landingSource.thresholded)],
    ["storyBack", held(sources.map((row) => ({ ...row, key: joined(sourceOf(row), partsOf(row).returning) })), shared.landingSource.thresholded)],
    ["storyRead", held(reading, shared.landingSource.thresholded)],
    ["storyPageVisits", held(own ? [{ ...own, key: "all" }] : [])],
    ["storyPageRead", held(own ? [{ ...emptyRow("scroll"), times: own.counts.get("scroll") ?? 0 }] : [])],
    // A view of this page whose page before is itself is one of its repeats, counted apart.
    ["storyNext", held(shared.pageNext.rows.filter((row) => row.key !== page), shared.pageNext.thresholded)],
    ["storyDevices", held(shared.pageDevice.rows, shared.pageDevice.thresholded)],
    ["storyWeekdays", held(shared.pageWeekday.rows, shared.pageWeekday.thresholded)],
    ["storyCountries", held(shared.pageCountry.rows, shared.pageCountry.thresholded)],
    ["storyAges", held(summed(shared.pageWho.rows, byAge), shared.pageWho.thresholded)],
    ["storyGenders", held(summed(shared.pageWho.rows, byGender), shared.pageWho.thresholded)],
    ["storyAgesConverted", held(converted(byAge), shared.landingWho.thresholded)],
    ["storyGendersConverted", held(converted(byGender), shared.landingWho.thresholded)],
    ["storyClicks", held(shared.pageClicks.rows, shared.pageClicks.thresholded)],
    ["storyGroupRead", held(pages.map((row) => ({ ...emptyRow(row.key), times: row.counts.get("scroll") ?? 0 })))],
  ]);
}

export async function readPageStory(ctx: Reader, input: StoryInput): Promise<PageStory> {
  const { holdId, page, period, device, country, counted } = input;
  const shared = await sharedLists(ctx, input);
  const lists = shared ? storyFromShared(shared, page, input.pages.find((row) => row.key === page) ?? null, input.pages, counted) : new Map<StoryList, Held>();
  const held = (name: StoryList) => lists.get(name) ?? null;
  const money = (row: ListRow) => conversionsOf(row, counted);

  // Visits that started here, kept with the landing pages; the website's, with its totals (PS1, PS5).
  const landingNow = await readFor(ctx, holdId, "landing", period, "NOW", device, undefined, country);
  const landingBefore = await readFor(ctx, holdId, "landing", period, "BEFORE", device, undefined, country);
  const landing = landingNow && landingNow !== "LIVE" ? landingNow.rows : [];
  const own = landing.find((row) => row.key === page) ?? null;
  const was = landingBefore && landingBefore !== "LIVE" ? landingBefore.rows.find((row) => row.key === page) ?? null : null;
  const total = (await readSlot(ctx, holdId, slotKey("total", period, "NOW", device, country)))?.rows[0] ?? null;
  const ownMoney = own ? money(own) : null;
  const totalMoney = total ? money(total) : null;
  const started = own && ownMoney && total && totalMoney ? {
    visits: own.visits,
    visitsBefore: landingBefore && landingBefore !== "LIVE" ? was?.visits ?? 0 : null,
    websiteVisits: total.visits,
    conversions: ownMoney.conversions,
    value: ownMoney.value,
    visitsPerConversion: ownMoney.conversions > 0 ? own.visits / ownMoney.conversions : null,
    websiteVisitsPerConversion: totalMoney.conversions > 0 ? total.visits / totalMoney.conversions : null,
    countedPages: own.visits > 0 ? own.views / own.visits : null,
    websiteCountedPages: total.visits > 0 ? total.views / total.visits : null,
    fewVisits: own.visits < FEW_VISITS,
  } : null;

  // Each source's visits that started here, one line each.
  const channels = onLines(held("channel")?.rows ?? []);
  // The pages visits that started here saw, each once a visit: by source until the shared lists are built.
  const sourcePages = shared ? [] : onLines(held("storySourcePages")?.rows ?? []);
  const pagesSeen = shared ? shared.landingPagesSeen.rows : sourcePages;
  // A line's source is the name people know it by, or Google's own word for typed in and for not known.
  const sources = sourcesOf(channels, sourcePages, onLines(held("storyBack")?.rows ?? []), onLines(held("storyRead")?.rows ?? []), money, shared !== null)
    .map((row) => ({ ...row, name: nameOfSource(row.source) === null ? null : row.source, fewVisits: row.visits < FEW_VISITS }));
  const startedVisits = channels.reduce((sum, row) => sum + row.visits, 0);
  const pageVisits = held("storyPageVisits")?.rows[0] ?? null;

  // Where its views went next: the website's pages by address and title.
  const next = nextOf(pageVisits?.views ?? 0, pageVisits?.visits ?? 0, held("storyNext")?.rows ?? []);
  const nextRefs = next.flatMap((row) => (row.key ? [row.key] : []));
  const nextAddresses = nextRefs.length > 0 ? await decodePages(ctx, holdId, nextRefs) : [];
  const addressOf = new Map(nextRefs.map((ref, at) => [ref, nextAddresses[at]]));

  // Its page group, and the group's busiest pages beside it: visits that started on each, and their conversions.
  const leagueRows = [...landing].sort((a, b) => b.visits - a.visits);
  const groupRefs = [...new Set([...leagueRows.map((row) => row.key), ...input.pages.map((row) => row.key)])];
  const groupAddresses = groupRefs.length > 0 ? await decodePages(ctx, holdId, groupRefs) : [];
  const addressOfRef = new Map(groupRefs.map((ref, at) => [ref, groupAddresses[at]]));
  const kinds = await readPageKinds(ctx, holdId, { pages: [input.address, ...groupAddresses] });
  const kind = kinds?.kindOf(input.address) ?? null;
  const inGroup = (ref: string) => kind !== null && kind !== NOT_SORTED_KIND && kinds?.kindOf(addressOfRef.get(ref) ?? "") === kind;
  const group = kind && kind !== NOT_SORTED_KIND ? kinds?.nameOf(kind) ?? null : null;
  const league = group ? leagueRows.filter((row) => inGroup(row.key) && row.visits > 0) : [];
  const shown = league.slice(0, LEAGUE_ROWS);
  if (own && group && !shown.some((row) => row.key === page)) shown.splice(LEAGUE_ROWS - 1, 1, own);
  const scrolls = new Map((held("storyGroupRead")?.rows ?? []).map((row) => [row.key, row.times ?? 0]));
  const groupPages = group ? input.pages.filter((row) => inGroup(row.key)) : [];
  // Readers past 90% down over the visits that saw each page, as this page's own is read.
  const groupVisits = groupPages.reduce((sum, row) => sum + row.visits, 0);
  const groupRead = groupVisits > 0 && held("storyGroupRead") ? Math.min(1, groupPages.reduce((sum, row) => sum + (scrolls.get(row.key) ?? 0), 0) / groupVisits) : null;

  const titles = await titlesOf(ctx, holdId, [...nextAddresses, ...shown.map((row) => addressOfRef.get(row.key) ?? "")].filter(Boolean));

  // Who reads it, beside the website's: devices, new and back again, age and gender.
  const deviceViews = new Map<string, number>();
  for (const one of ["desktop", "mobile", "tablet"]) {
    const slot = await readSlot(ctx, holdId, slotKey("total", period, "NOW", one, country));
    if (slot?.rows[0]) deviceViews.set(one, slot.rows[0].views);
  }
  const visitors = await readSlot(ctx, holdId, slotKey("visitorType", period, "NOW", "", country));
  const visitorVisits = (visitors?.rows ?? []).reduce((sum, row) => sum + row.visits, 0);
  const returningVisits = visitors?.rows.find((row) => row.key.toLowerCase() === "returning")?.visits ?? null;
  // Each source's visits that started here, new and back again, added up: the same visits as the figure and the table.
  const byVisitor = new Map<string, number>();
  for (const row of held("storyBack")?.rows ?? []) {
    const kind = row.key.slice(row.key.lastIndexOf(STORY_JOIN) + STORY_JOIN.length).toLowerCase();
    byVisitor.set(kind, (byVisitor.get(kind) ?? 0) + row.visits);
  }
  const ages = await readSlot(ctx, holdId, slotKey("age", period, "NOW", "", country));
  const genders = await readSlot(ctx, holdId, slotKey("gender", period, "NOW", "", country));
  const pageReaders = input.pages.find((row) => row.key === page)?.people ?? 0;
  // Google holds back a small group whole, the one conversion's among them: the conversions are the page's own count.
  const who = (mine: StoryList, theirs: Held | null, converted: StoryList) => {
    const split = whoOf(counts(held(mine), "people"), counts(theirs, "people"), counts(held(converted), "times"));
    return { ...split, conversions: Math.max(split.conversions, started?.conversions ?? 0), readers: pageReaders };
  };

  return {
    live: shared === null,
    thresholded: [...lists.values()].some((one) => one.thresholded) || shared?.landingPagesSeen.thresholded === true,
    started,
    differentPages: pagesSeen.length > 0 ? differentPages(pagesSeen.reduce((sum, row) => sum + row.visits, 0), startedVisits) : null,
    viewsPerVisit: pageVisits ? viewsPerVisit(pageVisits.views, pageVisits.visits) : null,
    read: pageVisits ? readShare(held("storyPageRead")?.rows ?? [], pageVisits.visits) : null,
    groupRead,
    group,
    sources,
    next: next.map((row) => {
      const address = row.key ? addressOf.get(row.key) ?? row.key : "";
      const title = address ? titles.get(address) : undefined;
      return { kind: row.kind, key: row.key, address, ...(title ? { title } : {}), views: row.views, share: row.share };
    }),
    returning: byVisitor.size > 0 ? {
      first: byVisitor.get("new") ?? 0,
      back: byVisitor.get("returning") ?? 0,
      // Visits Google can't place as either — and the visit or two its estimates differ by between two asks — so the
      // chart adds up to the visits that started here, as the sources chart does (Google's visit counts are estimates).
      unknown: Math.max(0, startedVisits - (byVisitor.get("new") ?? 0) - (byVisitor.get("returning") ?? 0)),
      websiteBack: returningVisits !== null && visitorVisits > 0 ? returningVisits / visitorVisits : null,
    } : null,
    devices: devicesOf(held("storyDevices")?.rows ?? [], deviceViews),
    countries: (held("storyCountries")?.rows ?? []).filter((row) => row.people > 0 && /^[A-Z]{2}$/.test(row.key)).sort((a, b) => b.people - a.people).slice(0, COUNTRY_ROWS).map((row) => ({ code: row.key, people: row.people })),
    ages: who("storyAges", ages, "storyAgesConverted"),
    genders: who("storyGenders", genders, "storyGendersConverted"),
    weekdays: held("storyWeekdays") ? weekdaysOf(held("storyWeekdays")?.rows ?? []) : [],
    clicks: clicksOf(held("storyClicks")?.rows ?? [], CLICK_ROWS),
    league: shown.map((row) => {
      const address = addressOfRef.get(row.key) ?? row.key;
      const title = titles.get(address);
      return { key: row.key, address, ...(title ? { title } : {}), visits: row.visits, conversions: money(row).conversions, isThis: row.key === page };
    }),
  };
}
