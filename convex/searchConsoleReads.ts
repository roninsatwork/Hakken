import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tenantAction, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { companyHolds, requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { websiteIconUrl } from "./websiteIcons";
import { checkedLongest, consoleLimitsOf } from "./searchConsoleLimits";
import { appError } from "./utils/appError";
import { accessTokenFor } from "./searchConsoleConnect";
import { queryAnalytics, type AnalyticsRow } from "./searchConsoleApi";
import { connectionStatusValidator, searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { addUp, daysIn, historyLimitDay, isDay, periodBefore, shiftDay } from "./searchConsoleDays";
import { checkedCountry, countryScope } from "./searchConsoleCountries";

/**
 * What the Search Console section reads (docs/plans/active/
 * search-console-plan.md §5): the company's own websites with their last
 * thirty days, a website's figures by day, and one search's or page's own.
 *
 * Every read finds the site through the caller's own hold (`requireMySite`)
 * and reads Search Console's rows by that hold alone — Google's figures for
 * a website are its company's, never another's holding the same host.
 *
 * A read may name one country (§16): one the website keeps ready reads its
 * own kept days; any other is asked of Google live, with Google's country
 * filter (`searchConsoleLiveDays`).
 */

/**
 * Days a range may ever span: the largest choice of a website's longest date
 * range (`consoleLongestRange`), which each read then holds it to.
 */
const MOST_DAYS = 800;

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

/** A site's day totals for one kind of result — all countries', or one country's kept ready — oldest first. */
export async function daysOf(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  from: string,
  to: string,
  country?: string,
) {
  return await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_country_type_day", (q) => q
      .eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType).gte("day", from).lte("day", to))
    .take(MOST_DAYS * 2 + 2);
}

/** Google's country filter for a live ask: only that country's rows; none for all countries. */
export function countryFilters(country: string | undefined): Array<{ dimension: string; operator: string; expression: string }> {
  return country === undefined ? [] : [{ dimension: "country", operator: "equals", expression: country }];
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
    /** The website's own icon, as Sites draws it; null to draw its letter. */
    iconUrl: v.union(v.string(), v.null()),
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
        iconUrl: await websiteIconUrl(ctx, entry.hold.websiteId),
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
 *
 * For one country kept ready, its own days. For any other country `live`,
 * with nothing read: the page asks Google instead (`searchConsoleLiveDays`).
 */
export const searchConsolePerformance = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, from: v.string(), to: v.string(), country: v.optional(v.string()) },
  returns: v.object({
    days: v.array(dayValidator),
    totals: v.union(figuresValidator, v.null()),
    previous: v.union(figuresValidator, v.null()),
    named: v.union(v.number(), v.null()),
    /** A country not kept ready: asked of Google instead. */
    live: v.boolean(),
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    checkedLongest(args.from, args.to, await consoleLimitsOf(ctx, site.hold));
    const connection = await connectionOf(ctx, site.hold._id);
    const scope = await countryScope(ctx, site.hold, connection, args.country);
    if (scope.read === "LIVE") return { days: [], totals: null, previous: null, named: null, live: true };
    const country = scope.read === "KEPT" ? scope.country : undefined;
    const oldestDay = scope.read === "KEPT" ? scope.oldestDay : connection?.oldestDay;
    const before = periodBefore(args.from, args.to);
    const rows = await daysOf(ctx, site.hold._id, args.searchType, before.from, args.to, country);
    const inRange = rows.filter((row) => row.day >= args.from);
    // The change only when the days before are all held; otherwise it would compare with a part.
    const previousHeld = Boolean(oldestDay && oldestDay <= before.from);
    const namedKnown = inRange.every((row) => row.clicks === 0 || row.namedClicks !== undefined);
    return {
      days: inRange.map((row) => ({ day: row.day, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position })),
      totals: addUp(inRange),
      previous: previousHeld ? addUp(rows.filter((row) => row.day < args.from)) : null,
      named: inRange.length > 0 && namedKnown ? inRange.reduce((sum, row) => sum + (row.namedClicks ?? 0), 0) : null,
      live: false,
    };
  },
});

const problemValidator = v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY"));

/**
 * A website's figures for the dates chosen in one country it does not keep
 * ready (§16): `searchConsolePerformance`'s answer, asked of Google in one
 * ask — the dates and the same number of days before, filtered to the
 * country. How many clicks Google names is not asked (it would take the
 * day's searches): `named` is null. The days before are compared only where
 * Google still keeps them, sixteen months.
 */
export const searchConsoleLiveDays = tenantAction({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, from: v.string(), to: v.string(), country: v.string() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      days: v.array(dayValidator),
      totals: v.union(figuresValidator, v.null()),
      previous: v.union(figuresValidator, v.null()),
      named: v.null(),
    }),
    v.object({ ok: v.literal(false), problem: problemValidator }),
  ),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    checkedCountry(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.searchConsoleReads.liveDaysTarget, { companyId, siteId: args.siteId });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    checkedLongest(args.from, args.to, target.limits);
    const before = periodBefore(args.from, args.to);
    const beforeHeld = before.from >= historyLimitDay(Date.now());
    const answer = await askLive(ctx, target, {
      startDate: beforeHeld ? before.from : args.from,
      endDate: args.to,
      type: args.searchType,
      dimensions: ["date"],
      dimensionFilterGroups: [{ filters: countryFilters(args.country) }],
    });
    if (!answer.ok) return answer;
    const all = answer.rows
      .map((row) => ({ day: row.keys[0] ?? "", clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }))
      .sort((left, right) => left.day.localeCompare(right.day));
    const days = all.filter((day) => day.day >= args.from);
    return { ok: true as const, days, totals: addUp(days), previous: beforeHeld ? addUp(all.filter((day) => day.day < args.from)) : null, named: null };
  },
});

type LiveAsk = Parameters<typeof queryAnalytics>[2];

/** One ask of Google through a company's own connection, renewing the token once: its rows, or why not. */
export async function askLive(
  ctx: ActionCtx,
  target: { connectionId: Id<"searchConsoleConnections">; property: string },
  ask: LiveAsk,
): Promise<{ ok: true; rows: AnalyticsRow[] } | { ok: false; problem: "NOT_CONNECTED" | "GOOGLE_REFUSED" | "GOOGLE_BUSY" }> {
  for (const renew of [false, true]) {
    const token = await accessTokenFor(ctx, target.connectionId, renew);
    if (!token.ok) return { ok: false, problem: token.problem === "GOOGLE_BUSY" ? "GOOGLE_BUSY" : "NOT_CONNECTED" };
    const answer = await queryAnalytics(token.accessToken, target.property, ask);
    if (answer.ok) return { ok: true, rows: answer.rows };
    if (answer.reason !== "EXPIRED") return { ok: false, problem: answer.reason === "BUSY" || answer.reason === "UNREACHABLE" ? "GOOGLE_BUSY" : "GOOGLE_REFUSED" };
  }
  return { ok: false, problem: "NOT_CONNECTED" };
}

// ---------------------------------------------------------------------------
// Asked of Google
// ---------------------------------------------------------------------------

/** The connection a live ask of the days goes through, when the site is the caller's company's own and connected, with its limits. */
export const liveDaysTarget = internalQuery({
  args: { companyId: v.id("companies"), siteId: v.id("companyWebsites") },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId || isTrackedHold(hold)) return null;
    const connection = await connectionOf(ctx, hold._id);
    if (!connection || connection.status !== "CONNECTED" || !connection.property) return null;
    return { connectionId: connection._id, property: connection.property, limits: await consoleLimitsOf(ctx, hold) };
  },
});
