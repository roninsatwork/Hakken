import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tenantAction } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";
import { askList, numberPages, openSession, siteOrigin, slotKey, type CollectTarget } from "./googleAnalyticsCollect";
import { packList, type ListRow } from "./googleAnalyticsLists";
import { analyticsPackedRows, analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { liveAsk } from "./googleAnalyticsReads";

/**
 * Lists a screen asks Google for when it needs them (docs/plans/active/google-analytics-plan.md
 * GA20, GA22): a page list for one device, and a landing page's own chart and
 * channels when its screen opens. Each is asked once and held until the next
 * collection (`googleAnalyticsLive`, cleared by `googleAnalyticsCollect.dropLive`),
 * so paging, sorting and searching never ask again (GA23). Free: Google
 * charges nothing. Only the caller's own website.
 */

/** What a live ask needs: the website, its connection, and the dates of the ready-made period it stands beside. */
export const liveTarget = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites"), period: analyticsPeriodValidator },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId || isTrackedHold(hold)) return null;
    const connection = await ctx.db
      .query("googleAnalyticsConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id))
      .first();
    if (!connection || connection.status !== "CONNECTED" || !connection.property || connection.clearing) return null;
    const slot = await ctx.db
      .query("googleAnalyticsPeriodSlots")
      .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", hold._id).eq("key", slotKey("total", args.period, "NOW", "")))
      .first();
    if (!slot) return null;
    const website = await ctx.db.get(hold.websiteId);
    const addresses = connection.addresses ?? (website ? [website.host] : []);
    const target: CollectTarget = {
      status: connection.status,
      clearing: false,
      owned: true,
      companyWebsiteId: hold._id,
      property: connection.property,
      addresses,
      origin: siteOrigin(addresses, website?.host ?? ""),
      timeZone: connection.timeZone ?? "Europe/London",
      events: (connection.events ?? []).map((event) => event.eventName),
      newestDay: connection.newestDay,
      oldestDay: connection.oldestDay,
      weeklyPeriodsAt: connection.weeklyPeriodsAt,
    };
    return { connectionId: connection._id, target, from: slot.from, to: slot.to };
  },
});

const packedPartValidator = v.object(analyticsPackedRows);

/** A live list's parts: 2,000 rows each, as many as Google gives in one list. */
export const LIVE_PARTS = 200;

/** A live list, written whole: what was asked under the same name before goes. */
export const putLive = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    ask: v.string(),
    parts: v.array(packedPartValidator),
    folded: v.boolean(),
    thresholded: v.boolean(),
    cut: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const old of await ctx.db
      .query("googleAnalyticsLive")
      .withIndex("by_hold_ask_part", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("ask", args.ask))
      .take(LIVE_PARTS)) {
      await ctx.db.delete(old._id);
    }
    const flags = { folded: args.folded || undefined, thresholded: args.thresholded || undefined, cut: args.cut || undefined };
    for (const [part, packed] of args.parts.entries()) {
      await ctx.db.insert("googleAnalyticsLive", {
        companyWebsiteId: args.companyWebsiteId, ask: args.ask, part, parts: args.parts.length, ...packed, ...flags, askedAt: Date.now(),
      });
    }
    return null;
  },
});

/** The name a landing page's own list is held under: its chart (`series`) or its channels. */
export function pageAsk(kind: "series" | "channel", page: string, period: string, from: string, to: string, device: string): string {
  return `${kind}:${page}|${period}|${from}|${to}|${device}`;
}

/**
 * Ask Google for a list a screen needs (GA20, GA22): a page list for one
 * device (`pages`), or one landing page's chart and channels (`page`, its
 * path as Analytics names it, and its page number for the name it is held
 * under). Answers whether it was asked, or why not.
 */
export const askGoogleAnalyticsLive = tenantAction({
  args: {
    siteId: v.id("companyWebsites"),
    period: analyticsPeriodValidator,
    device: v.string(),
    pages: v.optional(v.union(v.literal("landing"), v.literal("page"))),
    page: v.optional(v.object({ ref: v.string(), path: v.string() })),
  },
  returns: v.object({ ok: v.boolean(), problem: v.union(v.null(), v.literal("NOT_CONNECTED"), v.literal("GOOGLE_BUSY"), v.literal("GOOGLE_REFUSED")) }),
  handler: async (ctx, args): Promise<{ ok: boolean; problem: null | "NOT_CONNECTED" | "GOOGLE_BUSY" | "GOOGLE_REFUSED" }> => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const found = await ctx.runQuery(internal.googleAnalyticsLive.liveTarget, { companyId: companyId as Id<"companies">, siteId: args.siteId, period: args.period });
    if (!found) return { ok: false, problem: "NOT_CONNECTED" };
    const opened = await openSession(ctx, found.connectionId);
    if (!opened.ok) return { ok: false, problem: opened.problem === "GOOGLE_BUSY" ? "GOOGLE_BUSY" : "NOT_CONNECTED" };
    const range = { from: found.from, to: found.to };
    const device = args.device || undefined;
    const write = async (ask: string, list: "landing" | "page" | "series" | "channel", rows: ListRow[], flags: { folded: boolean; thresholded: boolean; cut: boolean }) => {
      await ctx.runMutation(internal.googleAnalyticsLive.putLive, {
        companyWebsiteId: found.target.companyWebsiteId, ask, parts: packList(list, rows, found.target.events), ...flags,
      });
    };
    const failed = (answer: { reason: string }) => ({
      ok: false,
      problem: answer.reason === "BUSY" || answer.reason === "UNREACHABLE" ? "GOOGLE_BUSY" as const : "GOOGLE_REFUSED" as const,
    });
    if (args.pages) {
      if (!device) throw appError("INVALID_INPUT", "A page list is asked live only for one device.");
      const asked = await askList(opened.session, found.target, args.pages, [], range, { device });
      if (!asked.ok) return failed(asked);
      const rows = await numberPages(ctx, found.target, [...asked.groups.values()].flat(), args.pages);
      await write(liveAsk(args.pages, args.period, range.from, range.to, args.device), args.pages, rows, asked.flags);
      return { ok: true, problem: null };
    }
    if (args.page) {
      // Analytics names a landing page without its trailing slash: asked both ways.
      const bare = args.page.path.length > 1 ? args.page.path.replace(/\/+$/, "") : args.page.path;
      const only = { landingPage: [...new Set([args.page.path, bare])], ...(device ? { device } : {}) };
      const series = await askList(opened.session, found.target, "series", [], range, only);
      if (!series.ok) return failed(series);
      await write(pageAsk("series", args.page.ref, args.period, range.from, range.to, args.device), "series", [...series.groups.values()].flat(), series.flags);
      const channels = await askList(opened.session, found.target, "channel", [], range, only);
      if (!channels.ok) return failed(channels);
      await write(pageAsk("channel", args.page.ref, args.period, range.from, range.to, args.device), "channel", [...channels.groups.values()].flat(), channels.flags);
      return { ok: true, problem: null };
    }
    throw appError("INVALID_INPUT", "Say which list to ask for.");
  },
});

