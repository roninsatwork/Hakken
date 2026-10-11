import { v, type ObjectType } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite, type SiteReader } from "./siteAccess";
import { decodePages } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { titlesOf } from "./pageTitles";
import { pageAsk } from "./googleAnalyticsLive";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { siteNameOf, splitBeforeKey } from "./googleAnalyticsLists";
import { assistantOf } from "./utils/aiAssistants";
import { seenValidator } from "./utils/hakkenSees";
import { pageSees, type BeforeFacts } from "./utils/sees/analytics";
import {
  blank,
  connectionOf,
  conversionsOf,
  countedOf,
  displayChannel,
  figuresOf,
  grouped,
  namedSeen,
  readFor,
  readLive,
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
 * and channels — those two asked of Google when the screen opens and held
 * (`googleAnalyticsLive.askGoogleAnalyticsLive`); `live` until they are.
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
    points: v.array(v.object({ day: v.string(), visits: v.number(), engaged: v.number(), conversions: v.number(), value: v.number() })),
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
  const series = await readLive(ctx, holdId, pageAsk("series", args.page, args.period, from, to, args.device, country));
  const channels = await readLive(ctx, holdId, pageAsk("channel", args.page, args.period, from, to, args.device, country));
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
    live: !series || !channels,
    points: (series?.rows ?? []).map((row) => {
      const { conversions, value } = conversionsOf(row, counted);
      return { day: row.key, visits: row.visits, engaged: row.engaged, conversions, value };
    }),
    channels: grouped(channels?.rows ?? [], (row) => displayChannel(row.key))
      .map((row) => shown(row, null, counted, false))
      .sort((left, right) => right.value - left.value || right.visits - left.visits),
  };
}

/** A page or website a page's views came from just before (GA29), as its screen shows it. */
const beforeRowValidator = v.object({
kind: v.union(v.literal("page"), v.literal("site"), v.literal("none")),
/** The website's page by its number, another website by its address, or `none`. */
key: v.string(),
/** The page's address, or the other website's name as people know it (Google, ChatGPT); empty for none. */
label: v.string(),
title: v.optional(v.string()),
views: v.number(),
/** Its views over the page's, 0–1. */
share: v.number(),
});

const analyticsPageArgs = { siteId: v.id("companyWebsites"), page: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) };

/**
 * One page of All pages (GA29; §18.2 board 21): its figures against the span
 * before, its views a day, and the page or website each view came from just
 * before — those two asked of Google when the screen opens and held until
 * the next collection (`googleAnalyticsLive.askGoogleAnalyticsLive`, `viewed`);
 * `live` until they are.
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
    points: v.array(v.object({ day: v.string(), visits: v.number(), engaged: v.number(), views: v.number(), conversions: v.number(), value: v.number() })),
    before: v.array(beforeRowValidator),
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
  const viewed = await readLive(ctx, holdId, pageAsk("viewed", args.page, args.period, from, to, args.device, country));
  const came = await readLive(ctx, holdId, pageAsk("before", args.page, args.period, from, to, args.device, country));
  // The website's own pages named by their addresses and titles; other websites as people know them.
  const split = (came?.rows ?? []).map((row) => ({ ...splitBeforeKey(row.key), views: row.views }));
  const refs = split.filter((row) => row.kind === "page").map((row) => row.value);
  const named = refs.length > 0 ? await decodePages(ctx, holdId, refs) : [];
  const addressOf = new Map(refs.map((ref, at) => [ref, named[at]]));
  const titles = await titlesOf(ctx, holdId, [address, ...named]);
  const total = split.reduce((sum, row) => sum + row.views, 0);
  const rows = split
    .filter((row) => row.views > 0)
    .map((row) => {
      const label = row.kind === "page" ? addressOf.get(row.value) ?? row.value : row.kind === "site" ? siteNameOf(row.value, assistantOf) : "";
      const title = row.kind === "page" ? titles.get(label) : undefined;
      return { kind: row.kind, key: row.kind === "none" ? "none" : row.value, label, ...(title ? { title } : {}), views: row.views, share: total > 0 ? row.views / total : 0 };
    })
    .sort((left, right) => right.views - left.views);
  const facts: BeforeFacts[] = rows.map((row) => ({ kind: row.kind, key: row.key, name: row.label, views: row.views }));
  return {
    address,
    title: titles.get(address) ?? null,
    path,
    group: kind && kind !== NOT_SORTED_KIND ? kinds?.nameOf(kind) ?? null : null,
    row: own ? shown(own, was, counted, before !== null && before !== "LIVE") : null,
    viewsBefore: before && before !== "LIVE" ? was?.views ?? 0 : null,
    live: !viewed || !came,
    points: (viewed?.rows ?? []).map((row) => {
      const { conversions, value } = conversionsOf(row, counted);
      return { day: row.key, visits: row.visits, engaged: row.engaged, views: row.views, conversions, value };
    }),
    before: rows,
    seen: viewed && came ? await namedSeen(ctx, holdId, pageSees(facts, args.siteId, (name) => assistantOf(name) !== null, args.page)) : { says: [], steps: [] },
  };
}
