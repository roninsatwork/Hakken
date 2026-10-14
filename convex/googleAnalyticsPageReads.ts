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
import { siteNameOf, splitBeforeKey, splitChannelKey } from "./googleAnalyticsLists";
import { landingByChannel } from "./googleAnalyticsChannelReads";
import { readPageSeries } from "./googleAnalyticsPageSeries";
import { readPageRows } from "./googleAnalyticsPageLists";
import { OTHER_ROWS } from "./utils/analyticsPageStory";
import { assistantOf } from "./utils/aiAssistants";
import { seenValidator } from "./utils/hakkenSees";
import { pageSees, type BeforeFacts, type PageStoryFacts } from "./utils/sees/analytics";
import { readPageStory, storyValidator, type PageStory } from "./googleAnalyticsPageStory";
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
  const now = await readFor(ctx, holdId, "landing", args.period, "NOW", args.device, undefined, country);
  const before = await readFor(ctx, holdId, "landing", args.period, "BEFORE", args.device, undefined, country);
  const own = now && now !== "LIVE" ? now.rows.find((row) => row.key === args.page) ?? null : null;
  const was = before && before !== "LIVE" ? before.rows.find((row) => row.key === args.page) ?? null : null;
  const total = await readSlot(ctx, holdId, slotKey("total", args.period, "NOW", args.device, country));
  const whole = total ? figuresOf(total.rows, counted) : null;
  const kinds = await readPageKinds(ctx, holdId, { pages: [address] });
  const kind = kinds?.kindOf(address) ?? null;
  const every = now && now !== "LIVE" ? now : await readSlot(ctx, holdId, slotKey("landing", args.period, "NOW", "", country));
  const from = every?.from ?? "";
  const to = every?.to ?? "";
  // Its chart from the page held over time (ga-stored-figures-plan.md SF5), filled by itself after a first collection.
  const stored = await readPageSeries(ctx, connection, "landing", args.page, args.device, from, to, country);
  // Its channels from the landing pages kept by channel (SF5), AI assistants counted once.
  const byChannel = await landingByChannel(ctx, holdId, args.period, "NOW", country, args.device);
  const keptChannels = byChannel ? byChannel.rows.flatMap((row) => {
    const { channel: page, source: channel } = splitChannelKey(row.key);
    return page === args.page ? [{ ...row, key: channel }] : [];
  }) : null;
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

/**
 * What the page's box says of its story (analytics-page-screen-plan.md §5):
 * the visits that started on it and their conversions, with those made on
 * the page itself; its biggest source and the one its conversions came from;
 * its views a visit; and the busiest page of its group whose visits converted
 * better, with two conversions at least.
 */
export function storyFacts(story: PageStory, madeHere: number): PageStoryFacts {
  const nameOf = (row: PageStory["sources"][number]) => row.name ?? row.source;
  // A channel's other sources, added up past a page's 20 biggest, are never one source.
  const named = story.sources.filter((row) => row.source !== OTHER_ROWS);
  const [biggest] = named;
  const converter = [...named].filter((row) => row.conversions > 0).sort((a, b) => b.conversions - a.conversions)[0] ?? null;
  const own = story.started;
  const rate = own && own.visits > 0 ? own.conversions / own.visits : 0;
  const nearest = story.league.find((row) => !row.isThis && row.conversions >= 2 && row.visits > 0 && row.conversions / row.visits > rate) ?? null;
  return {
    started: own ? { visits: own.visits, websiteVisits: own.websiteVisits, conversions: own.conversions, madeHere } : null,
    biggest: biggest ? { name: nameOf(biggest), visits: biggest.visits, conversions: biggest.conversions } : null,
    converter: converter ? { name: nameOf(converter), conversions: converter.conversions } : null,
    viewsPerVisit: story.viewsPerVisit,
    pages: story.differentPages !== null && own?.countedPages !== null && own?.countedPages !== undefined ? { different: Math.round(story.differentPages * 10) / 10, counted: Math.round(own.countedPages * 10) / 10 } : null,
    nearest: nearest ? { page: nearest.key, visits: nearest.visits, conversions: nearest.conversions } : null,
  };
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
export const analyticsPage = tenantQuery({
  args: analyticsPageArgs,
  returns: v.union(v.null(), v.object({
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
    /** Its story (analytics-page-screen-plan.md §2): the visits that started on it, where its views went, who reads it. */
    story: storyValidator,
    seen: seenValidator,
  })),
  handler: async (ctx, args) => await readPage(ctx, args),
});

/** Its screen's read, for the screen and Ask Hakken alike (google-analytics-plan.md §18.6.8): the caller's own website only. */
export async function readPage(ctx: SiteReader, args: ObjectType<typeof analyticsPageArgs>) {
  const site = await requireMySite(ctx, args.siteId);
  const holdId = site.hold._id;
  const country = await keptCountry(ctx, site.hold, args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  const counted = countedOf(connection);
  const [address] = await decodePages(ctx, holdId, [args.page]);
  const path = address.replace(/^https?:\/\/[^/]+/, "") || "/";
  const now = await readFor(ctx, holdId, "page", args.period, "NOW", args.device, undefined, country);
  const before = await readFor(ctx, holdId, "page", args.period, "BEFORE", args.device, undefined, country);
  const own = now && now !== "LIVE" ? now.rows.find((row) => row.key === args.page) ?? null : null;
  const was = before && before !== "LIVE" ? before.rows.find((row) => row.key === args.page) ?? null : null;
  const kinds = await readPageKinds(ctx, holdId, { pages: [address] });
  const kind = kinds?.kindOf(address) ?? null;
  const every = now && now !== "LIVE" ? now : await readSlot(ctx, holdId, slotKey("page", args.period, "NOW", "", country));
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
  const facts: BeforeFacts[] = rows.map((row) => ({ kind: row.kind, key: row.key, name: row.label, views: row.views }));
  const story = await readPageStory(ctx, {
    holdId, page: args.page, address, period: args.period, device: args.device, country, counted, pages: now && now !== "LIVE" ? now.rows : [],
  });
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
    story,
    seen: stored && came
      ? await namedSeen(ctx, holdId, pageSees(facts, args.siteId, (name) => assistantOf(name) !== null, args.page, storyFacts(story, own ? conversionsOf(own, counted).conversions : 0)))
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
      /** Its views a day, the days with none left out — past 90 days a week or month to its `lastDay` (SF2b); null until held. */
      points: v.union(v.null(), v.array(v.object({ day: v.string(), lastDay: v.optional(v.string()), views: v.number() }))),
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
    const pages = [];
    for (const [index, ref] of refs.entries()) {
      const stored = await readPageSeries(ctx, connection, "page", ref, args.device, slot.from, slot.to, country);
      pages.push({
        ref,
        address: addresses[index],
        points: stored ? stored.filter((point) => point.row.views > 0).map((point) => ({ day: point.start, ...(point.end !== point.start ? { lastDay: point.end } : {}), views: point.row.views })) : null,
      });
    }
    return { pages };
  },
});
