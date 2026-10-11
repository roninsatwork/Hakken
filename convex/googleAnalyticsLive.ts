import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tenantAction } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { isTrackedHold } from "./utils/websitePairing";
import { mainConsoleCountry } from "./searchConsoleCountries";
import { appError } from "./utils/appError";
import { ask, askList, numberPages, openSession, siteOrigin, slotKey, type CollectTarget } from "./googleAnalyticsCollect";
import { beforeKey, emptyRow, packList, pageAddress, type ListRow } from "./googleAnalyticsLists";
import { encodePagesFromAction } from "./holdPageRefs";
import { shiftDay } from "./searchConsoleDays";
import { EVENT_DETAIL } from "./utils/analyticsEvents";
import { analyticsPackedRows, analyticsPeriodValidator, type AnalyticsList } from "./googleAnalyticsSchema";
import { liveAsk } from "./googleAnalyticsReads";
import { DAY_JOIN, channelSeriesAsk } from "./googleAnalyticsChartReads";
import { keptCountry } from "./googleAnalyticsCountries";
import { countryIdOf } from "./googleAnalyticsCollect";

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
      country: countryIdOf(country || mainConsoleCountry(hold)),
      others: [],
      untitled: false,
      eventless: false,
    };
    return { connectionId: connection._id, target, from: slot.from, to: slot.to, country };
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

/**
 * The name a page's own list is held under: a landing page's chart (`series`)
 * or channels, or — a page of All pages (GA29) — its views a day (`viewed`)
 * and the page before each view (`before`); another home country's ends with
 * its code.
 */
export function pageAsk(kind: "series" | "channel" | "viewed" | "before", page: string, period: string, from: string, to: string, device: string, country = ""): string {
  return `${kind}:${page}|${period}|${from}|${to}|${device}${country ? `|${country}` : ""}`;
}

/**
 * The name an event's own lists are held under (§18.6.5): what it was about
 * (`detail`) and the pages it happened on (`pages`), for the dates chosen and
 * the span before them — both named by the dates chosen.
 */
export function eventAsk(kind: "detail" | "pages", which: "NOW" | "BEFORE", event: string, period: string, from: string, to: string, device: string, country = ""): string {
  return `${kind}${which === "BEFORE" ? "Before" : ""}:${event}|${period}|${from}|${to}|${device}${country ? `|${country}` : ""}`;
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
    /** A home country other than the main one (`fra`); left out for the main one (§18.6.1). */
    country: v.optional(v.string()),
    /** A list kept only for every device, for the one device chosen: the pages, and the events (§18.6.5). */
    pages: v.optional(v.union(v.literal("landing"), v.literal("page"), v.literal("event"), v.literal("eventSeries"))),
    /** Channels' chart, each channel a day, for dates or a country that keep no channel days (GA35). */
    chart: v.optional(v.literal("channel")),
    page: v.optional(v.object({ ref: v.string(), path: v.string() })),
    /** A page of All pages (GA29): its views a day, and the page or website each view came from just before. */
    viewed: v.optional(v.object({ ref: v.string(), path: v.string() })),
    /** An event's own screen (GA30): what it was about, by its kind, and the pages it happened on, against the span before. */
    event: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), problem: v.union(v.null(), v.literal("NOT_CONNECTED"), v.literal("GOOGLE_BUSY"), v.literal("GOOGLE_REFUSED")) }),
  handler: async (ctx, args): Promise<{ ok: boolean; problem: null | "NOT_CONNECTED" | "GOOGLE_BUSY" | "GOOGLE_REFUSED" }> => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const found = await ctx.runQuery(internal.googleAnalyticsLive.liveTarget, { companyId: companyId as Id<"companies">, siteId: args.siteId, period: args.period, country: args.country });
    if (!found) return { ok: false, problem: "NOT_CONNECTED" };
    const opened = await openSession(ctx, found.connectionId);
    if (!opened.ok) return { ok: false, problem: opened.problem === "GOOGLE_BUSY" ? "GOOGLE_BUSY" : "NOT_CONNECTED" };
    const range = { from: found.from, to: found.to };
    const device = args.device || undefined;
    const write = async (ask: string, list: AnalyticsList, rows: ListRow[], flags: { folded: boolean; thresholded: boolean; cut: boolean }) => {
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
      const answered = [...asked.groups.values()].flat();
      const rows = args.pages === "landing" || args.pages === "page" ? await numberPages(ctx, found.target, answered, args.pages) : answered;
      await write(liveAsk(args.pages, args.period, range.from, range.to, args.device, found.country), args.pages, rows, asked.flags);
      return { ok: true, problem: null };
    }
    if (args.page) {
      // Analytics names a landing page without its trailing slash: asked both ways.
      const bare = args.page.path.length > 1 ? args.page.path.replace(/\/+$/, "") : args.page.path;
      const only = { landingPage: [...new Set([args.page.path, bare])], ...(device ? { device } : {}) };
      const series = await askList(opened.session, found.target, "series", [], range, only);
      if (!series.ok) return failed(series);
      await write(pageAsk("series", args.page.ref, args.period, range.from, range.to, args.device, found.country), "series", [...series.groups.values()].flat(), series.flags);
      const channels = await askList(opened.session, found.target, "channel", [], range, only);
      if (!channels.ok) return failed(channels);
      await write(pageAsk("channel", args.page.ref, args.period, range.from, range.to, args.device, found.country), "channel", [...channels.groups.values()].flat(), channels.flags);
      return { ok: true, problem: null };
    }
    if (args.viewed) {
      // Analytics names a page as it was viewed, slash or not: asked both ways.
      const paths = [...new Set([args.viewed.path, args.viewed.path.length > 1 ? args.viewed.path.replace(/\/+$/, "") : args.viewed.path])];
      const name = (kind: "viewed" | "before") => pageAsk(kind, args.viewed!.ref, args.period, range.from, range.to, args.device, found.country);
      const series = await askList(opened.session, found.target, "series", [], range, { pagePath: paths, ...(device ? { device } : {}) });
      if (!series.ok) return failed(series);
      await write(name("viewed"), "series", [...series.groups.values()].flat(), series.flags);
      const before = await ask(opened.session, found.target.property!, {
        startDate: range.from,
        endDate: range.to,
        dimensions: ["pageReferrer"],
        metrics: ["screenPageViews"],
        hostNames: found.target.addresses,
        countries: [found.target.country],
        ...(device ? { device } : {}),
        only: { dimension: "pagePath", values: paths },
      });
      if (!before.ok) return failed(before);
      const rows = new Map<string, ListRow>();
      for (const answer of before.rows) {
        const key = beforeKey(answer.keys[0] ?? "", found.target.addresses);
        const row = rows.get(key) ?? emptyRow(key);
        row.views += answer.values[0] ?? 0;
        rows.set(key, row);
      }
      // The website's own pages by their numbers, as every list names them (§4.6): one page, one number.
      const own = [...rows.values()].filter((row) => row.key.startsWith("page:"));
      const refs = await encodePagesFromAction(ctx, found.target.companyWebsiteId, own.map((row) => pageAddress(found.target.origin, row.key.slice(5))));
      const numbered = new Map<string, ListRow>();
      for (const row of rows.values()) {
        const at = own.indexOf(row);
        const key = at >= 0 ? `page:${refs[at]}` : row.key;
        const held = numbered.get(key);
        if (held) held.views += row.views;
        else numbered.set(key, { ...row, key });
      }
      await write(name("before"), "page", [...numbered.values()], { folded: before.folded, thresholded: before.thresholded, cut: before.cut });
      return { ok: true, problem: null };
    }
    if (args.event) {
      const event = args.event;
      const days = Number(args.period);
      const before = { from: shiftDay(range.from, -days), to: shiftDay(range.to, -days) };
      // What it was about only for Google's own events that carry it; the pages it happened on for every event.
      const detail = EVENT_DETAIL[event];
      const asks: Array<["detail" | "pages", string]> = [...(detail ? [["detail", detail] as ["detail", string]] : []), ["pages", "pagePath"]];
      for (const [kind, dimension] of asks) {
        for (const [which, dates] of [["NOW", range], ["BEFORE", before]] as const) {
          const answer = await ask(opened.session, found.target.property!, {
            startDate: dates.from,
            endDate: dates.to,
            dimensions: [dimension],
            metrics: ["eventCount", "totalUsers"],
            hostNames: found.target.addresses,
            countries: [found.target.country],
            eventNames: [event],
            ...(device ? { device } : {}),
          });
          if (!answer.ok) return failed(answer);
          const rows = answer.rows.map((row) => ({ ...emptyRow(row.keys[0] ?? ""), times: row.values[0] ?? 0, people: row.values[1] ?? 0 }));
          const kept = kind === "pages" ? await numberPages(ctx, found.target, rows, "page") : rows;
          await write(eventAsk(kind, which, event, args.period, range.from, range.to, args.device, found.country), "event", kept, {
            folded: answer.folded, thresholded: answer.thresholded, cut: answer.cut,
          });
        }
      }
      return { ok: true, problem: null };
    }
    if (args.chart === "channel") {
      const asked = await askList(opened.session, found.target, "channel", ["date"], range, device ? { device } : {});
      if (!asked.ok) return failed(asked);
      // Each row keyed by its day and its channel and source, so one held list draws every line.
      const rows = [...asked.groups.entries()].flatMap(([day, dayRows]) => dayRows.map((row) => ({ ...row, key: `${day}${DAY_JOIN}${row.key}` })));
      await write(channelSeriesAsk(args.period, range.from, range.to, args.device, found.country), "channel", rows, asked.flags);
      return { ok: true, problem: null };
    }
    throw appError("INVALID_INPUT", "Say which list to ask for.");
  },
});

