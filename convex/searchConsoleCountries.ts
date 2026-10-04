import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { readFanOutLimits } from "./fanOutLimits";
import { requireMySite } from "./siteAccess";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isGoogleCountry } from "./utils/countryCodes";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * Where a website trades, for Search Console (docs/plans/active/
 * search-console-plan.md §16): the countries kept ready beside all
 * countries, set only in admin, on the Market page. Each is collected and
 * made ready at every collection, so choosing it on a Search Console page is
 * as quick as all countries; any other country is asked of Google live.
 */

/** Google's "we could not tell" — never a country a website trades in. */
const UNKNOWN_COUNTRY = "zzz";
/** Packed records — lists and ready-made periods — are large, so fewer go at a time than rows. */
const CLEAR_RECORDS = 5;
const CLEAR_ROWS = 500;

/**
 * The countries a website keeps ready: the first `consoleCountriesPerSite`
 * of its list, the countries added first kept when the limit is lower than
 * the list. None for a competitor, which has no Search Console of its own.
 */
export async function countriesKeptReady(ctx: { db: QueryCtx["db"] }, hold: Doc<"companyWebsites">): Promise<string[]> {
  const list = hold.searchConsoleCountries ?? [];
  if (list.length === 0 || isTrackedHold(hold)) return [];
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  return list.slice(0, limits.consoleCountriesPerSite);
}

/**
 * Whether a write for one country still belongs: the country is still kept
 * ready. A country taken off while a run collected or added it up is not
 * filed again behind its clearing. All countries' writes always belong.
 */
export async function stillKeptReady(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, country: string | undefined): Promise<boolean> {
  if (country === undefined) return true;
  const hold = await ctx.db.get(companyWebsiteId);
  return hold !== null && (await countriesKeptReady(ctx, hold)).includes(country);
}

/** The countries on a website's list past its limit: what was kept for them is cleared at the start of each run. */
export async function countriesPastLimit(ctx: { db: QueryCtx["db"] }, hold: Doc<"companyWebsites">): Promise<string[]> {
  const list = hold.searchConsoleCountries ?? [];
  if (list.length === 0) return [];
  if (isTrackedHold(hold)) return list;
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  return list.slice(limits.consoleCountriesPerSite);
}

/** A country as a read names it: one of Google's, as Google writes it (`gbr`), or refused. */
export function checkedCountry(country: string | undefined): string | undefined {
  if (country === undefined) return undefined;
  if (!isGoogleCountry(country)) throw appError("INVALID_INPUT", `"${country}" is not a country Google names.`);
  return country;
}

type HeldEntry = { country: string; newestDay: string; oldestDay: string };
export type HeldRange = { newestDay: string; oldestDay: string };

/** The days held for one country kept ready, as its connection notes them; null before its first collection. */
export function heldFor(connection: { countriesHeld?: HeldEntry[] } | null, country: string): HeldRange | null {
  const entry = connection?.countriesHeld?.find((held) => held.country === country);
  return entry ? { newestDay: entry.newestDay, oldestDay: entry.oldestDay } : null;
}

/** A connection's held days with one country's set, or dropped when `range` is null. */
export function withHeld(list: HeldEntry[] | undefined, country: string, range: HeldRange | null): HeldEntry[] | undefined {
  const rest = (list ?? []).filter((held) => held.country !== country);
  const next = range ? [...rest, { country, ...range }] : rest;
  return next.length > 0 ? next : undefined;
}

/**
 * What a read of one country reads (§16). `ALL`: no country named, all
 * countries as before. `KEPT`: a country kept ready whose first collection
 * is in, read from what is kept, to its own newest day. `LIVE`: any other
 * country — or one kept ready before its first collection (`kept`) — asked
 * of Google, as other dates are; a read Google cannot answer live says the
 * country is not kept ready, or, when `kept`, that it is on its way.
 */
export type CountryScope =
  | { read: "ALL" }
  | { read: "KEPT"; country: string; newestDay: string; oldestDay: string }
  | { read: "LIVE"; country: string; kept: boolean };

export async function countryScope(
  ctx: { db: QueryCtx["db"] },
  hold: Doc<"companyWebsites">,
  connection: { countriesHeld?: HeldEntry[] } | null,
  country: string | undefined,
): Promise<CountryScope> {
  const code = checkedCountry(country);
  if (code === undefined) return { read: "ALL" };
  const kept = (await countriesKeptReady(ctx, hold)).includes(code);
  const held = kept ? heldFor(connection, code) : null;
  return held ? { read: "KEPT", country: code, ...held } : { read: "LIVE", country: code, kept };
}

/**
 * The countries a Search Console page's country choice offers first: the
 * website's countries kept ready, in the order added. Any other country is
 * asked of Google live. The company's own website only, as every read.
 */
export const searchConsoleCountryChoices = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({ ready: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    return { ready: await countriesKeptReady(ctx, site.hold) };
  },
});

/** The Market page's "Where it trades": the website's countries and how many are kept ready. */
export const searchConsoleMarket = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(
    v.null(),
    v.object({
      /** False for a competitor: it has no Search Console, so no countries. */
      owned: v.boolean(),
      countries: v.array(v.string()),
      /** `consoleCountriesPerSite` for this website; past it, the countries added first are kept ready. */
      limit: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) return null;
    const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
    return { owned: !isTrackedHold(hold), countries: hold.searchConsoleCountries ?? [], limit: limits.consoleCountriesPerSite };
  },
});

/**
 * Set where a website trades. Codes are Google's three-letter ones, kept in
 * the order given; a country taken off has what was kept for it cleared in
 * the background. More countries than the limit can't be added — though a
 * list already longer than a lowered limit can still be edited down.
 */
export const setSearchConsoleCountries = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), countries: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) throw appError("NOT_FOUND", "That website is no longer held by this company.");
    if (isTrackedHold(hold)) {
      throw appError("INVALID_INPUT", "Search Console is only connected to the company's own websites, so a competitor has no countries to keep ready.");
    }

    const countries: string[] = [];
    for (const raw of args.countries) {
      const code = raw.trim().toLowerCase();
      if (!isGoogleCountry(code) || code === UNKNOWN_COUNTRY) throw appError("INVALID_INPUT", `"${raw}" is not a country Google names.`);
      if (!countries.includes(code)) countries.push(code);
    }

    const before = hold.searchConsoleCountries ?? [];
    const { consoleCountriesPerSite: limit } = await readFanOutLimits(ctx, hold.companyId, hold._id);
    if (countries.length > limit && countries.length > before.length) {
      throw appError(
        "INVALID_INPUT",
        `This website keeps ${limit} ${limit === 1 ? "country" : "countries"} ready. Raise "Countries kept ready per website" on the Limits page to add more.`,
      );
    }

    await ctx.db.patch(args.companyWebsiteId, { searchConsoleCountries: countries.length > 0 ? countries : undefined, updatedAt: Date.now() });
    for (const country of before.filter((code) => !countries.includes(code))) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleCountries.clearCountry, { companyWebsiteId: args.companyWebsiteId, country });
    }

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SET_SEARCH_CONSOLE_COUNTRIES",
      entityId: args.companyWebsiteId,
      entityType: "companyWebsites",
      companyId: hold.companyId,
      metadata: JSON.stringify({ before, after: countries }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/** One batch of a country's kept figures, from every table that keeps them; true when none were left. */
async function clearSomeOf(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">, country: string): Promise<boolean> {
  const lists = await ctx.db
    .query("searchConsoleLists")
    .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country))
    .take(CLEAR_RECORDS);
  for (const record of lists) await ctx.db.delete(record._id);
  const periods = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country))
    .take(CLEAR_RECORDS);
  for (const record of periods) await ctx.db.delete(record._id);
  const days = await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country))
    .take(CLEAR_ROWS);
  for (const row of days) await ctx.db.delete(row._id);
  const weeks = await ctx.db
    .query("searchConsoleWeeks")
    .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country))
    .take(CLEAR_ROWS);
  for (const row of weeks) await ctx.db.delete(row._id);
  const seen = await ctx.db
    .query("searchConsoleSeen")
    .withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country))
    .take(CLEAR_ROWS);
  for (const row of seen) await ctx.db.delete(row._id);
  const seenDays = await ctx.db
    .query("searchConsoleSeenDays")
    .withIndex("by_hold_country_type_kind_day", (q) => q.eq("companyWebsiteId", companyWebsiteId).eq("country", country))
    .take(CLEAR_ROWS);
  for (const row of seenDays) await ctx.db.delete(row._id);
  return lists.length < CLEAR_RECORDS && periods.length < CLEAR_RECORDS && days.length < CLEAR_ROWS && weeks.length < CLEAR_ROWS && seen.length < CLEAR_ROWS
    && seenDays.length < CLEAR_ROWS;
}

/** A country's held days forgotten on its connection: the next collection fetches its whole 90 days again. */
async function forgetHeld(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">, country: string) {
  const connection = await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
  if (!connection || !heldFor(connection, country)) return;
  await ctx.db.patch(connection._id, { countriesHeld: withHeld(connection.countriesHeld, country, null), updatedAt: Date.now() });
}

/**
 * What was kept for a country no longer kept ready goes, a batch at a time,
 * and its held days are forgotten first. Stops if the country is put back on
 * the list (or back under the limit) before it finishes: with its held days
 * forgotten, the next collection fetches its whole 90 days again.
 */
export const clearCountry = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), country: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (hold && (await countriesKeptReady(ctx, hold)).includes(args.country)) return null;
    await forgetHeld(ctx, args.companyWebsiteId, args.country);
    if (!(await clearSomeOf(ctx, args.companyWebsiteId, args.country))) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleCountries.clearCountry, args);
    }
    return null;
  },
});
