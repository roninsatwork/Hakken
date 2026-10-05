import { v } from "convex/values";

import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { countriesKeptReady } from "./searchConsoleCountries";
import { shiftDay } from "./searchConsoleDays";

/**
 * A country kept ready that is nearly all of a website's Google searches
 * keeps no search-and-page lines of its own (docs/plans/active/
 * finish-off-plan.md, item 2B): they were a near copy of all countries' —
 * morehandles.co.uk's United Kingdom lines were 86% the same lines, about 40%
 * of its Search Console storage. Its searches, pages and their periods, its
 * first- and last-seen register and its charts are read from all countries',
 * and the screens say so. Its own day totals, devices and kinds of result are
 * still kept, being small.
 *
 * Judged on the last 28 days of web search: 90% of the website's showings or
 * more makes a country such; under 80% ends it, so a website near the line
 * does not swap back and forth between runs.
 */

export const NEARLY_ALL_SHARE = 0.9;
export const NO_LONGER_SHARE = 0.8;
const SHARE_DAYS = 28;

/** The lists a country nearly all of the searches does not keep, and every list made from them. */
export const FROM_SEARCH_LINES = new Set(["pair", "page", "pairByPage", "competing", "query"]);

/** A country's share of a website's web showings over the last 28 days held, or null with too little to tell. */
async function countryShare(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, country: string): Promise<number | null> {
  const newest = await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", holdId).eq("country", undefined).eq("searchType", "web"))
    .order("desc")
    .first();
  if (!newest) return null;
  const from = shiftDay(newest.day, 1 - SHARE_DAYS);
  const sum = async (scope: string | undefined) => {
    const days = await ctx.db
      .query("searchConsoleDays")
      .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", holdId).eq("country", scope).eq("searchType", "web").gte("day", from))
      .take(SHARE_DAYS + 1);
    return { impressions: days.reduce((total, day) => total + day.impressions, 0), days: days.length };
  };
  const all = await sum(undefined);
  const one = await sum(country);
  if (all.impressions === 0 || one.days < 7) return null;
  return one.impressions / all.impressions;
}

/** Work out again which countries kept ready are nearly all of the website's searches: at the start of each website's run. */
export async function refreshCountriesAsAll(ctx: MutationCtx, connection: Doc<"searchConsoleConnections">): Promise<string[]> {
  const hold = await ctx.db.get(connection.companyWebsiteId);
  if (!hold) return [];
  const was = new Set(connection.countriesAsAll ?? []);
  const now: string[] = [];
  for (const country of await countriesKeptReady(ctx, hold)) {
    const share = await countryShare(ctx, hold._id, country);
    if (share === null ? was.has(country) : share >= NEARLY_ALL_SHARE || (was.has(country) && share >= NO_LONGER_SHARE)) now.push(country);
  }
  const same = now.length === was.size && now.every((country) => was.has(country));
  if (!same) await ctx.db.patch(connection._id, { countriesAsAll: now.length > 0 ? now : undefined });
  return now;
}

/** Whether a country of a website is read as all countries. */
export async function readAsAllCountries(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, country: string | undefined): Promise<boolean> {
  if (country === undefined) return false;
  const connection = await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId))
    .first();
  return (connection?.countriesAsAll ?? []).includes(country);
}

/** The country a read of searches or pages is made for: all countries for one that is nearly all of them. */
export async function searchLinesCountry(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, country: string | undefined): Promise<string | undefined> {
  return await readAsAllCountries(ctx, holdId, country) ? undefined : country;
}

export const countryReadAsAll = internalQuery({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => await readAsAllCountries(ctx, args.holdId, args.country),
});
