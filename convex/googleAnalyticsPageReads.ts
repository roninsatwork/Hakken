import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { decodePages } from "./holdPageRefs";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { PURCHASE_EVENT } from "./utils/analyticsEvents";
import { slotKey } from "./googleAnalyticsCollect";
import { keptCountry } from "./googleAnalyticsCountries";
import { titlesOf } from "./pageTitles";
import { pageAsk } from "./googleAnalyticsLive";
import { analyticsPeriodValidator } from "./googleAnalyticsSchema";
import {
  blank,
  connectionOf,
  conversionsOf,
  countedOf,
  displayChannel,
  figuresOf,
  grouped,
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

/**
 * One landing page's figures against the span before, the whole website's
 * engagement for comparison, what its visits converted into, and its chart
 * and channels — those two asked of Google when the screen opens and held
 * (`googleAnalyticsLive.askGoogleAnalyticsLive`); `live` until they are.
 */
export const analyticsLandingPage = tenantQuery({
  args: { siteId: v.id("companyWebsites"), page: v.string(), period: analyticsPeriodValidator, device: v.string(), country: v.optional(v.string()) },
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
  handler: async (ctx, args) => {
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
  },
});
