import { v } from "convex/values";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { countriesKeptReady, mainConsoleCountry } from "./searchConsoleCountries";
import { countryOfKey } from "./googleAnalyticsLists";
import { countryOfDayDevice } from "./utils/analyticsHistory";

/**
 * Google Analytics keeps a website's home countries, and only those
 * (docs/plans/active/google-analytics-plan.md §18.6.1; Anthony, 2026-10-11:
 * "store each coutnry thats selected as a hoem country"). They are Search
 * Console's — the website's Market list, the first its main country — so the
 * two are compared home country to home country. The main country's lists
 * carry no country in their names; each other home country's carry its code.
 */

/** Ready-made lists read a call when looking for a country no longer kept: a page at a time. */
const SLOTS_PER_PAGE = 200;
/** Parts removed a call. */
const PARTS_PER_DELETE = 64;
/** Day, week, month and page records looked through a call for a home country no longer kept. */
const RECORDS_PER_PAGE = 200;
/** The stores a home country's own records sit in, beside the main one's (ga-stored-figures-plan.md SF7), swept in turn. */
const COUNTRY_STORES = ["googleAnalyticsDays", "googleAnalyticsHistory", "googleAnalyticsPageSeries"] as const;

/**
 * The home country a read is for, as its lists are named: empty for the main
 * one — and for a country the website does not keep, which reads as the main
 * one, as Search Console's do.
 */
export async function keptCountry(ctx: { db: QueryCtx["db"] }, hold: Doc<"companyWebsites">, country: string | undefined): Promise<string> {
  if (!country || country === mainConsoleCountry(hold)) return "";
  return (await countriesKeptReady(ctx, hold)).includes(country) ? country : "";
}

/**
 * Before a website's run: what it holds must be its main home country's. When
 * it is not — every website the day home countries arrived, and later when its
 * Market list's first country changes — everything held is cleared and the
 * next collection fetches the main country's again, as Search Console's
 * `prepareMainCountryOf` does. A website holding nothing yet only notes its
 * main country. Answers which.
 */
export async function prepareAnalyticsCountry(ctx: MutationCtx, connection: Doc<"googleAnalyticsConnections">): Promise<"READY" | "SWITCHING"> {
  const hold = await ctx.db.get(connection.companyWebsiteId);
  if (!hold) return "READY";
  const main = mainConsoleCountry(hold);
  if (connection.mainCountry === main) return "READY";
  const anySlot = await ctx.db
    .query("googleAnalyticsPeriodSlots")
    .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", hold._id))
    .first();
  if (anySlot === null && connection.newestDay === undefined) {
    await ctx.db.patch(connection._id, { mainCountry: main, updatedAt: Date.now() });
    return "READY";
  }
  // Marked as clearing first: a step still running drops what it fetched (`writeDay`, `putPeriodParts`).
  await ctx.db.patch(connection._id, { clearing: true, mainCountry: main, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.googleAnalyticsCollect.clearFigures, { companyWebsiteId: hold._id });
  return "SWITCHING";
}

/**
 * The lists no run keeps any more (ga-stored-figures-plan.md SF12): each
 * event, campaign, new and returning people and products a day for every
 * period, and the website's days a period beside Insights' 12 months, every
 * device — the charts read the days, weeks and months kept.
 */
const RETIRED_LISTS = new Set(["eventSeries", "campaignSeries", "visitorSeries", "productSeries"]);
const KEPT_SERIES = "series|365|NOW|";

function retired(key: string): boolean {
  const list = key.split("|")[0];
  return RETIRED_LISTS.has(list) || (list === "series" && key !== KEPT_SERIES);
}

/**
 * The lists of a home country the website no longer keeps, and the lists no
 * run keeps any more, cleared after each collection a page of lists at a time.
 */
export const dropCountriesNotKept = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) return null;
    const kept = new Set(await countriesKeptReady(ctx, hold));
    const page = await ctx.db
      .query("googleAnalyticsPeriodSlots")
      .withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", hold._id))
      .paginate({ cursor: args.cursor ?? null, numItems: SLOTS_PER_PAGE });
    for (const slot of page.page) {
      const country = countryOfKey(slot.key);
      if ((!country || kept.has(country)) && !retired(slot.key)) continue;
      const parts = await ctx.db
        .query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", hold._id).eq("key", slot.key))
        .take(PARTS_PER_DELETE);
      for (const part of parts) await ctx.db.delete(part._id);
      // A list longer than one call's parts: the same page again, the rest of its parts first.
      if (parts.length === PARTS_PER_DELETE) {
        await ctx.scheduler.runAfter(0, internal.googleAnalyticsCountries.dropCountriesNotKept, args);
        return null;
      }
      await ctx.db.delete(slot._id);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCountries.dropCountriesNotKept, { companyWebsiteId: args.companyWebsiteId, cursor: page.continueCursor });
      return null;
    }
    // Its days, weeks, months and pages too, once — only when a country taken off still has them (SF7).
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (connection?.countryHistory?.some((one) => !kept.has(one.country))) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCountries.dropCountryRecords, { companyWebsiteId: hold._id, store: 0 });
    }
    return null;
  },
});

/**
 * The days, weeks, months and pages of a home country the website no longer
 * keeps (ga-stored-figures-plan.md SF7), a page of records at a time, store
 * by store; then its place on the connection goes.
 */
export const dropCountryRecords = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), store: v.number(), cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) return null;
    const kept = new Set(await countriesKeptReady(ctx, hold));
    const gone = (device: string) => {
      const country = countryOfDayDevice(device);
      return country !== "" && !kept.has(country);
    };
    const options = { cursor: args.cursor ?? null, numItems: RECORDS_PER_PAGE };
    const store = COUNTRY_STORES[args.store];
    const page = store === "googleAnalyticsDays"
      ? await ctx.db.query("googleAnalyticsDays").withIndex("by_hold_list_day_device", (q) => q.eq("companyWebsiteId", hold._id)).paginate(options)
      : store === "googleAnalyticsHistory"
        ? await ctx.db.query("googleAnalyticsHistory").withIndex("by_hold_grain_start", (q) => q.eq("companyWebsiteId", hold._id)).paginate(options)
        : await ctx.db.query("googleAnalyticsPageSeries").withIndex("by_hold_last", (q) => q.eq("companyWebsiteId", hold._id)).paginate(options);
    for (const record of page.page) if (gone(record.device)) await ctx.db.delete(record._id);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCountries.dropCountryRecords, { ...args, cursor: page.continueCursor });
    } else if (args.store + 1 < COUNTRY_STORES.length) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsCountries.dropCountryRecords, { companyWebsiteId: args.companyWebsiteId, store: args.store + 1 });
    } else {
      const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
      if (connection) {
        // Its fills' places go with its records (ga-big-site-reliability-plan.md BR6): kept again, it fills from the start.
        const reached = (connection.fillsReached ?? []).filter((one) => one.country === "" || kept.has(one.country));
        await ctx.db.patch(connection._id, {
          countryHistory: (connection.countryHistory ?? []).filter((one) => kept.has(one.country)),
          fillsReached: reached.length > 0 ? reached : undefined,
          updatedAt: Date.now(),
        });
      }
    }
    return null;
  },
});
