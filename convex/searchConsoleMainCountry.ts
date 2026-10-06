import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { noteHoldPagesChanged } from "./holdPages";
import { mainConsoleCountry } from "./searchConsoleCountries";

/**
 * A website's Search Console figures held without a country are its main
 * home country's (docs/plans/active/search-console-home-countries-plan.md,
 * 2026-10-06): switching to it, and what clearing resets. Apart from
 * `searchConsoleSync.ts` to keep that module inside its size.
 */

/** What clearing a site's figures resets on its connection: the next collection fetches its whole 90 days again. */
export const NOTHING_HELD = {
  newestDay: undefined,
  oldestDay: undefined,
  countriesHeld: undefined,
  countriesAsAll: undefined,
  backfilledAt: undefined,
  historyAt: undefined,
  lastCollectedAt: undefined,
} as const;

/**
 * Before a website's run: what it holds without a country must be its main
 * home country's (`mainConsoleCountry`; search-console-home-countries-plan.md).
 * When it is not — every website's figures before 2026-10-06 were all
 * countries', and a website's main country can change on its Market page or
 * with its place — everything collected for it is cleared, its connection
 * kept, and a collection started once they are gone fetches the main
 * country's 90 days. A
 * website holding nothing yet only notes its main country, and is collected
 * now. Answers which.
 */
export async function prepareMainCountryOf(ctx: MutationCtx, connection: Doc<"searchConsoleConnections">): Promise<"READY" | "SWITCHING"> {
  const hold = await ctx.db.get(connection.companyWebsiteId);
  if (!hold) return "READY";
  const main = mainConsoleCountry(hold);
  if (connection.mainCountry === main) return "READY";
  const anyDay = await ctx.db
    .query("searchConsoleDays")
    .withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", hold._id))
    .first();
  const holding = anyDay !== null || connection.newestDay !== undefined || (connection.countriesHeld?.length ?? 0) > 0;
  if (!holding) {
    await ctx.db.patch(connection._id, { mainCountry: main, updatedAt: Date.now() });
    return "READY";
  }
  // Marked as clearing first: a step still running drops what it fetched.
  await ctx.db.patch(connection._id, { clearing: true, mainCountry: main, ...NOTHING_HELD, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.searchConsoleSync.clearFigures, { companyWebsiteId: hold._id, collectAfter: true });
  // Your pages' clicks go with them that night (dataforseo-cost-plan.md, A1).
  await noteHoldPagesChanged(ctx, hold._id);
  return "SWITCHING";
}

export const prepareMainCountry = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.union(v.literal("READY"), v.literal("SWITCHING")),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    return connection ? await prepareMainCountryOf(ctx, connection) : "READY";
  },
});

