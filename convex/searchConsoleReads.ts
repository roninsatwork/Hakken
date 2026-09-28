import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tenantAction, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { companyHolds, requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";
import { accessTokenFor } from "./searchConsoleConnect";
import { queryAnalytics } from "./searchConsoleApi";
import { connectionStatusValidator, searchTypeValidator } from "./searchConsoleSchema";
import { addUp, daysIn, isDay, periodBefore, shiftDay } from "./searchConsoleDays";

/**
 * What the Search Console section reads (docs/plans/active/
 * search-console-plan.md §5): the company's own websites with their last
 * thirty days, a website's figures by day, and one search's or page's own.
 *
 * Every read finds the site through the caller's own hold (`requireMySite`)
 * and reads Search Console's rows by that hold alone — Google's figures for
 * a website are its company's, never another's holding the same host.
 */

/** Days a range may span: Google keeps sixteen months, and the screens offer two years. */
const MOST_DAYS = 800;

/** Rows a live pairing shows: the pages Google showed for a search, or the searches a page was shown for. */
const MOST_PAIRED = 250;

const figuresValidator = v.object({ clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() });
const dayValidator = v.object({ day: v.string(), clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() });

/** A range as the screens send it, or a refusal a page can show. */
export function checkedRange(from: string, to: string): void {
  if (!isDay(from) || !isDay(to) || from > to || daysIn(from, to) > MOST_DAYS) {
    throw appError("INVALID_INPUT", "Those dates are not a range Search Console can show.");
  }
}

async function connectionOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

/** A site's day totals for one kind of result, oldest first. */
async function daysOf(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: "web" | "image" | "video" | "news" | "discover" | "googleNews",
  from: string,
  to: string,
) {
  return await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_type_day", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("searchType", searchType).gte("day", from).lte("day", to))
    .take(MOST_DAYS * 2 + 2);
}

// ---------------------------------------------------------------------------
// The section's list
// ---------------------------------------------------------------------------

/**
 * The company's own websites, each with its connection and its web figures
 * for the thirty days to the newest Google has — a competitor's is never
 * here (SC1, SC8).
 */
export const listSearchConsoleSites = tenantQuery({
  args: {},
  returns: v.array(v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    status: v.union(connectionStatusValidator, v.literal("NOT_CONNECTED")),
    figures: v.union(figuresValidator, v.null()),
    from: v.union(v.string(), v.null()),
    to: v.union(v.string(), v.null()),
    lastCollectedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx) => {
    if (!ctx.companyId) return [];
    const holds = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED");
    return await Promise.all(holds.map(async (entry) => {
      const connection = await connectionOf(ctx, entry.hold._id);
      const to = connection?.newestDay ?? null;
      const from = to ? shiftDay(to, -29) : null;
      const figures = from && to ? addUp(await daysOf(ctx, entry.hold._id, "web", from, to)) : null;
      return {
        siteId: entry.summary.siteId,
        host: entry.summary.host,
        status: connection?.status === "CONNECTING" || !connection ? ("NOT_CONNECTED" as const) : connection.status,
        figures,
        from,
        to,
        lastCollectedAt: connection?.lastCollectedAt ?? null,
      };
    }));
  },
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/**
 * A website's figures for the dates chosen, one kind of result: each day, the
 * totals, the same number of days before (for the change, when those days
 * are held), and how many of the clicks came from searches Google names — the
 * rest it hides for privacy. A day with nothing shown has no row, and reads
 * as nothing; the page says which days are held.
 */
export const searchConsolePerformance = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, from: v.string(), to: v.string() },
  returns: v.object({
    days: v.array(dayValidator),
    totals: v.union(figuresValidator, v.null()),
    previous: v.union(figuresValidator, v.null()),
    named: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOf(ctx, site.hold._id);
    const before = periodBefore(args.from, args.to);
    const rows = await daysOf(ctx, site.hold._id, args.searchType, before.from, args.to);
    const inRange = rows.filter((row) => row.day >= args.from);
    // The change only when the days before are all held; otherwise it would compare with a part.
    const previousHeld = Boolean(connection?.oldestDay && connection.oldestDay <= before.from);
    const namedKnown = inRange.every((row) => row.clicks === 0 || row.namedClicks !== undefined);
    return {
      days: inRange.map((row) => ({ day: row.day, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position })),
      totals: addUp(inRange),
      previous: previousHeld ? addUp(rows.filter((row) => row.day < args.from)) : null,
      named: inRange.length > 0 && namedKnown ? inRange.reduce((sum, row) => sum + (row.namedClicks ?? 0), 0) : null,
    };
  },
});

// ---------------------------------------------------------------------------
// One search, or one page
// ---------------------------------------------------------------------------

const splitValidator = v.union(v.literal("query"), v.literal("page"));

/**
 * One search's or one page's own days: its figures each day it was shown in
 * the dates chosen, their totals, and the same number of days before.
 */
export const searchConsoleKeyDays = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: splitValidator,
    key: v.string(),
    from: v.string(),
    to: v.string(),
  },
  returns: v.object({
    days: v.array(dayValidator),
    totals: v.union(figuresValidator, v.null()),
    previous: v.union(figuresValidator, v.null()),
    /** Whether the days before are held: with none shown then, it is new in these dates. */
    previousHeld: v.boolean(),
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOf(ctx, site.hold._id);
    const before = periodBefore(args.from, args.to);
    const rows = await ctx.db
      .query("searchConsoleRows")
      .withIndex("by_hold_type_dimension_key_day", (q) => q
        .eq("companyWebsiteId", site.hold._id)
        .eq("searchType", args.searchType)
        .eq("dimension", args.dimension)
        .eq("key", args.key)
        .gte("day", before.from)
        .lte("day", args.to))
      .take(MOST_DAYS * 2 + 2);
    const inRange = rows.filter((row) => row.day >= args.from);
    const previousHeld = Boolean(connection?.oldestDay && connection.oldestDay <= before.from);
    return {
      days: inRange.map((row) => ({ day: row.day, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position })),
      totals: addUp(inRange),
      previous: previousHeld ? addUp(rows.filter((row) => row.day < args.from)) : null,
      previousHeld,
    };
  },
});

/** The connection a live ask goes through, when the site is the caller's company's own and connected. */
export const pairingTarget = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites") },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId || isTrackedHold(hold)) return null;
    const connection = await connectionOf(ctx, hold._id);
    if (!connection || connection.status !== "CONNECTED" || !connection.property) return null;
    return { connectionId: connection._id, property: connection.property };
  },
});

/**
 * Which pages Google showed for one search, or which searches it showed one
 * page for, in the dates chosen — asked of Google when the screen opens: the
 * pairing is not among what is collected each day, and asking is free and
 * answers for any dates (agreed with the drawings, 2026-09-27).
 */
export const searchConsolePairing = tenantAction({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: splitValidator,
    key: v.string(),
    from: v.string(),
    to: v.string(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      rows: v.array(v.object({ key: v.string(), clicks: v.number(), impressions: v.number(), ctr: v.number(), position: v.number() })),
      cut: v.union(v.number(), v.null()),
    }),
    v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
  ),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.searchConsoleReads.pairingTarget, { companyId, siteId: args.siteId });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    const other = args.dimension === "query" ? "page" : "query";
    const ask = {
      startDate: args.from,
      endDate: args.to,
      type: args.searchType,
      dimensions: [other],
      dimensionFilterGroups: [{ filters: [{ dimension: args.dimension, operator: "equals", expression: args.key }] }],
    };
    for (const renew of [false, true]) {
      const token = await accessTokenFor(ctx, target.connectionId, renew);
      if (!token.ok) return { ok: false as const, problem: token.problem === "GOOGLE_BUSY" ? "GOOGLE_BUSY" as const : "NOT_CONNECTED" as const };
      const answer = await queryAnalytics(token.accessToken, target.property, ask);
      if (answer.ok) {
        const rows = answer.rows
          .map((row) => ({ key: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))
          .sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions);
        return { ok: true as const, rows: rows.slice(0, MOST_PAIRED), cut: rows.length > MOST_PAIRED ? MOST_PAIRED : null };
      }
      if (answer.reason !== "EXPIRED") {
        return { ok: false as const, problem: answer.reason === "BUSY" || answer.reason === "UNREACHABLE" ? "GOOGLE_BUSY" as const : "GOOGLE_REFUSED" as const };
      }
    }
    return { ok: false as const, problem: "NOT_CONNECTED" as const };
  },
});
