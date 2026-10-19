import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tenantAction } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { isTrackedHold } from "./utils/websitePairing";
import { mainConsoleCountry } from "./searchConsoleCountries";
import { appError } from "./utils/appError";
import { askFunnel, conversionTargetOf, countryIdOf, openSession, perVisitOf, siteOrigin, slotKey, type CollectTarget } from "./googleAnalyticsCollect";
import { LIVE_PARTS, emptyRow, packList } from "./googleAnalyticsLists";
import { analyticsPackedRows, analyticsPeriodValidator } from "./googleAnalyticsSchema";
import { keptCountry } from "./googleAnalyticsCountries";

/**
 * The one figure a Google Analytics screen still asks Google for
 * (docs/plans/active/ga-stored-figures-plan.md SF1, SF8): an event's people
 * who did it and converted after it, a funnel Google works out for each pair
 * of events. Asked when the event's screen opens, held a week
 * (`googleAnalyticsLive`, kept by `googleAnalyticsCollect.dropLive`). Every
 * other figure is read from what each collection stores; Live, the realtime
 * page, asks Google itself (`googleAnalyticsRealtime.ts`). Only the caller's
 * own website.
 */

/** What a live ask needs: the website, its connection, and the dates of the ready-made period it stands beside. */
export const liveTarget = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites"), period: analyticsPeriodValidator, country: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId || isTrackedHold(hold)) return null;
    const connection = await ctx.db
      .query("googleAnalyticsConnections")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id))
      .first();
    if (!connection || connection.status !== "CONNECTED" || !connection.property || connection.clearing) return null;
    // The home country asked for, as its lists are named; a country the website does not keep reads as the main one (§18.6.1).
    const country = await keptCountry(ctx, hold, args.country);
    const slot = await ctx.db
      .query("googleAnalyticsPeriodSlots")
      .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", hold._id).eq("key", slotKey("total", args.period, "NOW", "", country)))
      .first();
    if (!slot) return null;
    const website = await ctx.db.get(hold.websiteId);
    const addresses = connection.addresses ?? (website ? [website.host] : []);
    const conversion = conversionTargetOf(connection);
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
      counted: (connection.events ?? []).filter((event) => event.counted).map((event) => event.eventName),
      perVisit: perVisitOf(connection),
      ...conversion,
      newestDay: connection.newestDay,
      oldestDay: connection.oldestDay,
      pagesHeld: connection.pageHistoryFrom !== undefined,
      weeklyPeriodsAt: connection.weeklyPeriodsAt,
      country: countryIdOf(country || mainConsoleCountry(hold)),
      others: [],
      countryHistory: [],
      untitled: false,
      shop: connection.shop === true || conversion.salesElsewhere,
      shopNoted: connection.shop === true,
      fillsReached: [],
      eventless: false,
    };
    // What counts as a conversion: an event's screen asks who converted after it (§18.6.5).
    const counted = (connection.events ?? []).filter((event) => event.counted).map((event) => event.eventName);
    return { connectionId: connection._id, target, from: slot.from, to: slot.to, country, counted };
  },
});

const packedPartValidator = v.object(analyticsPackedRows);

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

/**
 * The name an event's funnel is held under (§18.6.5): the people who did it
 * and converted after it, for the date range, device and home country —
 * named without its dates, so a collection's new day keeps it its week (SF8).
 */
export function funnelAsk(event: string, period: string, device: string, country = ""): string {
  return `funnel:${event}|${period}|${device}${country ? `|${country}` : ""}`;
}

/**
 * Ask Google for an event's funnel (Anthony, 2026-10-11): the people who did
 * it, and of them who converted after it, when anything else counts. Google's
 * funnel report is still in its alpha: a refusal is held too, so the screen
 * says Google could not answer rather than asking again and again. Answers
 * whether it was asked, or why not.
 */
export const askEventFunnel = tenantAction({
  args: {
    siteId: v.id("companyWebsites"),
    period: analyticsPeriodValidator,
    device: v.string(),
    /** A home country other than the main one (`fra`); left out for the main one (§18.6.1). */
    country: v.optional(v.string()),
    event: v.string(),
  },
  returns: v.object({ ok: v.boolean(), problem: v.union(v.null(), v.literal("NOT_CONNECTED"), v.literal("GOOGLE_BUSY"), v.literal("GOOGLE_REFUSED")) }),
  handler: async (ctx, args): Promise<{ ok: boolean; problem: null | "NOT_CONNECTED" | "GOOGLE_BUSY" | "GOOGLE_REFUSED" }> => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const found = await ctx.runQuery(internal.googleAnalyticsLive.liveTarget, { companyId: companyId as Id<"companies">, siteId: args.siteId, period: args.period, country: args.country });
    if (!found) return { ok: false, problem: "NOT_CONNECTED" };
    const conversions = found.counted.filter((name) => name !== args.event);
    if (conversions.length === 0) return { ok: true, problem: null };
    const opened = await openSession(ctx, found.connectionId);
    if (!opened.ok) return { ok: false, problem: opened.problem === "GOOGLE_BUSY" ? "GOOGLE_BUSY" : "NOT_CONNECTED" };
    const funnel = await askFunnel(opened.session, found.target.property!, {
      startDate: found.from, endDate: found.to, first: args.event, then: conversions,
      hostNames: found.target.addresses, countries: [found.target.country], ...(args.device ? { device: args.device } : {}),
      // The conversion on the shop too (conversion-addresses-plan.md), the event itself on the website's own address.
      ...(found.target.alsoConverting.length > 0 ? { thenHostNames: [...found.target.addresses, ...found.target.alsoConverting] } : {}),
    });
    const rows = funnel.ok ? [{ ...emptyRow("did"), people: funnel.did }, { ...emptyRow("then"), people: funnel.then }] : [emptyRow("refused")];
    await ctx.runMutation(internal.googleAnalyticsLive.putLive, {
      companyWebsiteId: found.target.companyWebsiteId,
      ask: funnelAsk(args.event, args.period, args.device, found.country),
      parts: packList("event", rows, found.target.events),
      folded: false,
      thresholded: false,
      cut: false,
    });
    return { ok: true, problem: null };
  },
});
