import { v, type Infer, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { decodePages, isPageRef } from "./holdPageRefs";
import { MOST_PLOTTED } from "./utils/pageMoves";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { titlesOf } from "./pageTitles";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { siteNameOf, splitBeforeKey, splitChannelKey, type ListRow, type PartOnly } from "./googleAnalyticsLists";
import { eachLandingByChannel } from "./googleAnalyticsChannelReads";
import { readPageSeries } from "./googleAnalyticsPageSeries";
import { readPageRows } from "./googleAnalyticsPageLists";
import { OTHER_ROWS } from "./utils/analyticsPageStory";
import { assistantOf } from "./utils/aiAssistants";
import { seenValidator } from "./utils/hakkenSees";
import { pageSees, pageStoryFacts, pathOfAddress } from "./utils/sees/analytics";
import { wordStartMatcher } from "./utils/wordStarts";
import { readPageStory, storyValidator } from "./googleAnalyticsPageStory";
import {
  blank,
  connectionOf,
  conversionsOf,
  countedOf,
  figuresOf,
  namedSeen,
  readFor,
  readSlot,
  shown,
  shownRowValidator,
} from "./googleAnalyticsReads";

/**
 * What the Google Analytics screens of one page read
 * (docs/plans/active/google-analytics-plan.md GA22, §18): a landing page's
 * own screen, and — from the second round — a page's own screen from All
 * pages. Apart from `googleAnalyticsReads.ts` to keep each module inside its
 * size. Only the caller's own website (`requireMySite`).
 */

const analyticsLandingPageArgs = { siteId: v.id("companyWebsites"), page: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

/** One page's rows of a list, with only the counted events: all a page's own figures read of a long list (2026-11-04). */
function ownRows(counted: readonly { eventName: string }[], page: string): PartOnly {
  return { events: new Set(counted.map((event) => event.eventName)), keep: (key) => key === page };
}

/**
 * The page list as a page's story reads it (`readPageStory`): each page's figures and the times it was read to its
 * end, every one kept so the story knows the list counts its reading. Read whole as rows, a year's pages ran the story
 * out of its 64MB on More Handles (2026-11-04).
 */
const PAGE_READING: PartOnly = { events: new Set(["scroll"]), zeros: true };

/**
 * One landing page's figures against the span before, the whole website's
 * engagement for comparison, what its visits converted into, and its chart
 * and channels — from the page held over time and the landing pages kept by
 * channel (ga-stored-figures-plan.md SF5); `live` until they are held.
 */
export const analyticsLandingPage = tenantQuery({
  args: analyticsLandingPageArgs,
  returns: v.union(v.null(), v.object({
    address: v.string(),
    /** Its title, from the website's page list (GA27); null without one. */
    title: v.union(v.string(), v.null()),
    /** The path Analytics names it by, for asking Google. */
    path: v.string(),
    group: v.union(v.string(), v.null()),
    row: v.union(shownRowValidator, v.null()),
    siteEngagementRate: v.union(v.number(), v.null()),
    conversions: v.array(v.object({ eventName: v.string(), count: v.number(), each: v.union(v.number(), v.null()), value: v.union(v.number(), v.null()) })),
    live: v.boolean(),
    /** A day; or, past 90 days, a week or a month to its `lastDay` (ga-stored-figures-plan.md SF2b). */
    points: v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), visits: v.number(), engaged: v.number(), conversions: v.number(), value: v.number() })),
    channels: v.array(shownRowValidator),
  })),
  handler: async (ctx, args) => await readLandingPage(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readLandingPage(ctx: SiteReader, args: ObjectType<typeof analyticsLandingPageArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const counted = countedOf(connection);
  const [address] = await decodePages(ctx, holdId, [args.page]);
  const path = address.replace(/^https?:\/\/[^/]+/, "") || "/";
  // Its own rows alone, with the counted events: read whole as rows, the landing pages ran this out of its 64MB from
  // Last 3 months on More Handles (2026-11-04).
  const only = ownRows(counted, args.page);
  const now = await readFor(ctx, holdId, "landing", args.period, "NOW", args.device, undefined, country, only);
  const before = await readFor(ctx, holdId, "landing", args.period, "BEFORE", args.device, undefined, country, only);
  const own = now && now !== "LIVE" ? now.rows.find((row) => row.key === args.page) ?? null : null;
  const was = before && before !== "LIVE" ? before.rows.find((row) => row.key === args.page) ?? null : null;
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
  const whole = total ? figuresOf(total.rows, counted) : null;
  const kinds = await readPageKinds(ctx, holdId, { pages: [address] });
  const kind = kinds?.kindOf(address) ?? null;
  const every = now && now !== "LIVE" ? now : await readSlot(ctx, holdId, slotKey("landing", args.period, "NOW", "", country), only);
  const from = every?.from ?? "";
  const to = every?.to ?? "";
  // Its chart from the page held over time (ga-stored-figures-plan.md SF5), filled by itself after a first collection.
  const stored = await readPageSeries(ctx, connection, "landing", args.page, args.device, from, to, country);
  // Its channels from the landing pages kept by channel (SF5), AI assistants counted once.
  const mine: ListRow[] = [];
  const byChannel = await eachLandingByChannel(ctx, holdId, args.period, "NOW", country, args.device, only, (row) => {
    const { channel: page, source: channel } = splitChannelKey(row.key);
    if (page === args.page) mine.push({ ...row, key: channel });
  });
  const keptChannels = byChannel ? mine : null;
  const titles = await titlesOf(ctx, holdId, [address]);
  return {
    address,
    title: titles.get(address) ?? null,
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
    // Not held yet — the minutes before a new website's pages are filled: nothing is asked of Google (SF1).
    live: !stored || !keptChannels,
    points: (stored ?? []).map((point) => {
      const { conversions, value } = conversionsOf(point.row, counted);
      return { day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}), visits: point.row.visits, engaged: point.row.engaged, conversions, value };
    }),
    channels: (keptChannels ?? [])
      .map((row) => shown(row, null, counted, false))
      .sort((left, right) => right.value - left.value || right.visits - left.visits),
  };
}

type BeforeRow = Infer<typeof beforeRowValidator>;

/**
 * Where a page's views were just before, as its screen shows them: the
 * website's own pages by address and title, another website by the name
 * people know it by — one row for each, its addresses added up (Google's
 * google.com, google.es, google.co.uk… are one Google; analytics-page-screen-plan.md
 * PS2) — and "none". Biggest first.
 */
export function beforeRows(
  split: ReadonlyArray<{ kind: "page" | "site" | "none" | "other"; value: string; views: number }>,
  total: number,
  addressOf: (ref: string) => string,
  titleOf: (address: string) => string | undefined,
): BeforeRow[] {
  const byName = new Map<string, { kind: BeforeRow["kind"]; key: string; label: string; title?: string; hosts: Array<{ host: string; views: number }>; views: number }>();
  for (const row of split) {
    if (row.views <= 0) continue;
    const label = row.kind === "page" ? addressOf(row.value) : row.kind === "site" ? siteNameOf(row.value, assistantOf) : "";
    const name = `${row.kind}:${row.kind === "page" ? row.value : label}`;
    const held = byName.get(name);
    if (held) {
      held.views += row.views;
      held.hosts.push({ host: row.value, views: row.views });
      continue;
    }
    const title = row.kind === "page" ? titleOf(label) : undefined;
    byName.set(name, { kind: row.kind, key: row.kind === "none" || row.kind === "other" ? row.kind : row.value, label, ...(title ? { title } : {}), hosts: [{ host: row.value, views: row.views }], views: row.views });
  }
  return [...byName.values()]
    .map(({ hosts, ...row }) => {
      const sorted = [...hosts].sort((left, right) => right.views - left.views);
      // A website keeps the key of its biggest address, so its row reads the same from one collection to the next.
      return { ...row, key: row.kind === "site" ? sorted[0].host : row.key, ...(row.kind === "site" ? { hosts: sorted.map((entry) => entry.host) } : {}), share: total > 0 ? row.views / total : 0 };
    })
    .sort((left, right) => right.views - left.views);
}

/** A page or website a page's views came from just before (GA29), as its screen shows it. */
const beforeRowValidator = v.object({
/** `other`: the pages and websites past a page's 20 biggest, added up (ga-stored-figures-plan.md SF14). */
kind: v.union(v.literal("page"), v.literal("site"), v.literal("none"), v.literal("other")),
/** The website's page by its number, another website by its address, `none` or `other`. */
key: v.string(),
/** The page's address, or the other website's name as people know it (Google, ChatGPT); empty for none. */
label: v.string(),
title: v.optional(v.string()),
/** Another website's addresses, its biggest first: Google's google.com, google.es and the rest are one row (analytics-page-screen-plan.md PS2). */
hosts: v.optional(v.array(v.string())),
views: v.number(),
/** Its views over the page's, 0–1. */
share: v.number(),
});

const analyticsPageArgs = { siteId: v.id("companyWebsites"), page: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

/**
 * One page of All pages (GA29; §18.2 board 21): its figures against the span
 * before, its views a day, and the page or website each view came from just
 * before — from the page held over time and the shared lists each collection
 * keeps (ga-stored-figures-plan.md SF5, SF13); `live` until they are held.
 */
const pageMainValidator = v.object({
  address: v.string(),
  title: v.union(v.string(), v.null()),
  /** The path Analytics names it by, for asking Google. */
  path: v.string(),
  group: v.union(v.string(), v.null()),
  row: v.union(shownRowValidator, v.null()),
  /** Its views in the span before; null when there is none to compare. */
  viewsBefore: v.union(v.number(), v.null()),
  live: v.boolean(),
  /** A day; or, past 90 days, a week or a month to its `lastDay` (ga-stored-figures-plan.md SF2b). */
  points: v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), visits: v.number(), engaged: v.number(), views: v.number(), conversions: v.number(), value: v.number() })),
  before: v.array(beforeRowValidator),
});

/**
 * A page's own screen, in two reads that run side by side (page-screen-redo-plan-2026-11-03.md: "why don't we do them
 * now not later"): its own figures here, its story in `analyticsPageStory`. Read whole, one query took 0.72–0.85s of
 * Convex's 1s on More Handles' knob, and the first load after new code went live could time out; each half now has the
 * second to itself.
 */
export const analyticsPage = tenantQuery({
  args: analyticsPageArgs,
  returns: v.union(v.null(), pageMainValidator),
  handler: async (ctx, args) => await readPageMain(ctx, args),
});

/** Its story (analytics-page-screen-plan.md §2) and What Hakken sees of it: the visits that started on it, who reads it. */
export const analyticsPageStory = tenantQuery({
  args: analyticsPageArgs,
  returns: v.union(v.null(), v.object({ story: storyValidator, seen: seenValidator })),
  handler: async (ctx, args) => await readPageStoryPart(ctx, args),
});

/**
 * A page of the website by its address or path, as Ask Hakken names it (page-screen-redo-plan-2026-11-03.md): the page
 * with that path, or else the one with most views whose address has those words; a reference (`~fu`) is taken as it is.
 * Read from the page list its screen reads, never All pages' search, which works out the whole screen to find one row
 * and took half of Convex's second on its own (0.53s on More Handles).
 */
export async function findPage(ctx: SiteReader, args: Omit<ObjectType<typeof analyticsPageArgs>, "page"> & { page: string }) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  // Each page's figures and reading, as its story reads them (`PAGE_READING`): the list is handed on to it.
  const now = await readFor(ctx, holdId, "page", args.period, "NOW", args.device, undefined, country, PAGE_READING);
  if (!now || now === "LIVE") return null;
  const asked = args.page.trim();
  // Its views come with it: a page found is one viewed in these dates.
  if (isPageRef(asked)) {
    const row = now.rows.find((one) => one.key === asked);
    return row ? { key: asked, address: (await decodePages(ctx, holdId, [asked]))[0], views: row.views, pages: now.rows } : null;
  }
  const path = pathOfAddress(asked);
  const addresses = await decodePages(ctx, holdId, now.rows.map((row) => row.key));
  const exact = addresses.findIndex((address) => pathOfAddress(address) === path);
  const matches = wordStartMatcher(path.replace(/^\//, "") || "/");
  let best = exact;
  if (best < 0) {
    addresses.forEach((address, at) => {
      if (matches?.(address) && (best < 0 || now.rows[at].views > now.rows[best].views)) best = at;
    });
  }
  return best >= 0 ? { key: now.rows[best].key, address: addresses[best], views: now.rows[best].views, pages: now.rows } : null;
}

/** Its own figures: its row, views a day and where its views came from, for the screen and Ask Hakken alike. */
export async function readPageMain(ctx: SiteReader, args: ObjectType<typeof analyticsPageArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const counted = countedOf(connection);
  const [address] = await decodePages(ctx, holdId, [args.page]);
  const path = address.replace(/^https?:\/\/[^/]+/, "") || "/";
  // Its own rows alone, with the counted events (`ownRows`): every page's read whole as rows is what ran All pages out
  // of its 64MB on Last 12 months on More Handles (2026-11-04).
  const only = ownRows(counted, args.page);
  const now = await readFor(ctx, holdId, "page", args.period, "NOW", args.device, undefined, country, only);
  const before = await readFor(ctx, holdId, "page", args.period, "BEFORE", args.device, undefined, country, only);
  const own = now && now !== "LIVE" ? now.rows.find((row) => row.key === args.page) ?? null : null;
  const was = before && before !== "LIVE" ? before.rows.find((row) => row.key === args.page) ?? null : null;
  const kinds = await readPageKinds(ctx, holdId, { pages: [address] });
  const kind = kinds?.kindOf(address) ?? null;
  const every = now && now !== "LIVE" ? now : await readSlot(ctx, holdId, slotKey("page", args.period, "NOW", "", country), only);
  const from = every?.from ?? "";
  const to = every?.to ?? "";
  // Its views over time from the page held (SF5), and where they came from, kept by every collection for each page
  // (SF13): `live` until held, and nothing asked of Google (SF1).
  const stored = await readPageSeries(ctx, connection, "page", args.page, args.device, from, to, country);
  const came = await readPageRows(ctx, holdId, "pageReferrer", args.period, args.device, args.page, "NOW", country);
  // The website's own pages named by their addresses and titles; other websites as people know them.
  const split = (came?.rows ?? []).map((row) => ({ ...(row.key === OTHER_ROWS ? { kind: "other" as const, value: "" } : splitBeforeKey(row.key)), views: row.views }));
  const refs = split.filter((row) => row.kind === "page").map((row) => row.value);
  const named = refs.length > 0 ? await decodePages(ctx, holdId, refs) : [];
  const addressOf = new Map(refs.map((ref, at) => [ref, named[at]]));
  const titles = await titlesOf(ctx, holdId, [address, ...named]);
  const total = split.reduce((sum, row) => sum + row.views, 0);
  const rows = beforeRows(split, total, (ref) => addressOf.get(ref) ?? ref, (label) => titles.get(label));
  return {
    address,
    title: titles.get(address) ?? null,
    path,
    group: kind && kind !== NOT_SORTED_KIND ? kinds?.nameOf(kind) ?? null : null,
    row: own ? shown(own, was, counted, before !== null && before !== "LIVE") : null,
    viewsBefore: before && before !== "LIVE" ? was?.views ?? 0 : null,
    live: !stored || !came,
    points: (stored ?? []).map((point) => {
      const { conversions, value } = conversionsOf(point.row, counted);
      return { day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}), visits: point.row.visits, engaged: point.row.engaged, views: point.row.views, conversions, value };
    }),
    before: rows,
  };
}

/** The website's pages in a span, as the page list holds them. */
type PageRows = Exclude<Awaited<ReturnType<typeof readFor>>, null | "LIVE">["rows"];

/**
 * Its story and What Hakken sees of it, read apart from its own figures (`analyticsPageStory`). Handed the page list
 * when its reader has read it already (`findPage`), so the list is unpacked once.
 */
export async function readPageStoryPart(ctx: SiteReader, args: ObjectType<typeof analyticsPageArgs>, read?: PageRows) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const counted = countedOf(connection);
  const [address] = await decodePages(ctx, holdId, [args.page]);
  const now = read ? null : await readFor(ctx, holdId, "page", args.period, "NOW", args.device, undefined, country, PAGE_READING);
  const pages = read ?? (now && now !== "LIVE" ? now.rows : []);
  const story = await readPageStory(ctx, { holdId, page: args.page, address, period: args.period, device: args.device, country, counted, pages });
  const viewed = pages.some((row) => row.key === args.page);
  return {
    story,
    seen: !story.live
      // Its story as the redone screen shows it (page-screen-redo-plan-2026-11-03.md, item 13). The boxes' items and
      // sale are their own read (`analyticsPageBoxes`), so the screen runs the same rules again with them.
      ? await namedSeen(ctx, holdId, pageSees(args.page, address, viewed, pageStoryFacts(story, null)))
      : { says: [], steps: [] },
  };
}

/**
 * All pages' "Views a day" (docs/plans/active/all-pages-rethink-plan.md AP3):
 * each page ticked in its table, five at most, by its page number — its views
 * a day over the dates chosen, from each page held over time
 * (ga-stored-figures-plan.md SF5); null until held. The website's own line is
 * Overview's (`analyticsChart`).
 */
export const analyticsPagesDaily = tenantQuery({
  args: { siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()), pages: v.array(v.string()) },
  returns: v.object({
    pages: v.array(v.object({
      ref: v.string(),
      address: v.string(),
      /** The page's own title, where one is known: the line's name on All pages. */
      title: v.optional(v.string()),
      /** Its views a day, the days with none left out — past 90 days a week or month to its `lastDay` (SF2b); null until held. */
      points: v.union(v.null(), v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), views: v.number(), visits: v.number(), conversions: v.number() }))),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const refs = [...new Set(args.pages.filter(isPageRef))].slice(0, MOST_PLOTTED);
    const connection = await connectionOf(ctx, holdId);
    if (!connection?.newestDay || refs.length === 0) return { pages: [] };
    const country = await keptCountry(ctx, site.hold, args.country);
    // The ready-made period's dates, as the chart beside it is drawn over.
    const slot = await ctx.db
      .query("googleAnalyticsPeriodSlots")
      .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", slotKey("total", args.period, "NOW", "", country)))
      .first();
    if (!slot) return { pages: [] };
    const addresses = await decodePages(ctx, holdId, refs);
    const counted = countedOf(connection);
    const pages = [];
    for (const [index, ref] of refs.entries()) {
      const stored = await readPageSeries(ctx, connection, "page", ref, args.device, slot.from, slot.to, country);
      pages.push({
        ref,
        address: addresses[index],
        points: stored ? stored.filter((point) => point.row.views > 0).map((point) => ({
          day: point.start,
          ...(point.end !== point.start ? { lastDay: point.end } : {}),
          views: point.row.views,
          visits: point.row.visits,
          conversions: conversionsOf(point.row, counted).conversions,
        })) : null,
      });
    }
    const titles = await titlesOf(ctx, holdId, addresses);
    return { pages: pages.map((page): typeof page & { title?: string } => {
      const title = titles.get(page.address);
      return title ? { ...page, title } : page;
    }) };
  },
});
