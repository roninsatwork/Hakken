import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { bookStep, chainGoing, stepKey } from "./collectionSteps";
import { countriesKeptReady } from "./searchConsoleCountries";
import { isTrackedHold } from "./utils/websitePairing";
import { coverageOf, filledLists } from "./googleAnalyticsCoverage";
import { FILLED_DAY_LISTS } from "./googleAnalyticsSchema";

/**
 * Two years filled by themselves once a night's collection is in
 * (ga-stored-figures-plan.md SF9; ga-big-site-reliability-plan.md BR7,
 * Anthony, 2026-10-15): a new website's, and each new home country's, every
 * day list and each page — and a fill that stopped short, where it stopped
 * (BR6). Only after the night's run: a website just connected gets its 90
 * days and its lists at once, and its two years from 01:00. Each list's days
 * already held are not asked again. `nightFrom` is when the night's run began:
 * a fill that spends the hour's budget waits for the hour while the night lasts.
 */
export async function fillAfterCollection(ctx: MutationCtx, connection: Doc<"googleAnalyticsConnections">, nightFrom: number) {
  const hold = await ctx.db.get(connection.companyWebsiteId);
  const others = hold && !isTrackedHold(hold) ? await countriesKeptReady(ctx, hold) : [];
  for (const country of ["", ...others]) {
    const coverage = coverageOf(connection, country);
    if (!coverage.newestDay) continue;
    const of = country ? { country } : {};
    const filled = filledLists(coverage);
    // The landing pages by kind are kept as days only (DAY_ONLY_LISTS): never filled back.
    const lists = FILLED_DAY_LISTS.filter((list) => list !== "product" || connection.shop === true).filter((list) => !filled.includes(list));
    // Each fill watched (collection-reliability-plan.md, RR1), and started once: one still going is left to go on (RR4).
    const days = fillStepKey("GA_FILL_DAYS", connection._id, country);
    if (lists.length > 0 && !(await chainGoing(ctx, days))) {
      await bookStep(ctx, { key: days, chain: "GA_FILL_DAYS", args: { connectionId: connection._id, lists, nightFrom, ...of }, place: "its first piece" });
    }
    const pages = fillStepKey("GA_FILL_PAGES", connection._id, country);
    if (!coverage.pageHistoryFrom && !(await chainGoing(ctx, pages))) {
      await bookStep(ctx, { key: pages, chain: "GA_FILL_PAGES", args: { connectionId: connection._id, nightFrom, ...of }, place: "its first piece" });
    }
  }
}

/** A fill's watched chain (`collectionSteps.ts`): one a list kind, website and home country. */
export function fillStepKey(chain: "GA_FILL_DAYS" | "GA_FILL_PAGES", connectionId: Id<"googleAnalyticsConnections">, country = ""): string {
  return stepKey(chain, connectionId, country);
}

/**
 * The fills a night's collection starts, started now: as the night does after
 * its run, or by hand for one website on Anthony's go
 * (`npx convex run googleAnalyticsFillAfter:startFills '{"connectionId": "…"}'`),
 * the hour's waits counted from now.
 */
export const startFills = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "CONNECTED") return null;
    await fillAfterCollection(ctx, connection, Date.now());
    return null;
  },
});

/** A fill's place in the two years (BR6): a day list's name, or `pages` for each page over time. */
export type FillName = string;

/** The last day a fill has written, oldest first, for the main home country (`""`) or another; null when not begun. */
export function fillReachedOf(connection: Pick<Doc<"googleAnalyticsConnections">, "fillsReached">, country: string, fill: FillName): string | null {
  return connection.fillsReached?.find((one) => one.country === country && one.fill === fill)?.to ?? null;
}

/** The fills' places with these taken out: a fill finished, or begun again for another property. */
export function withoutReached(connection: Pick<Doc<"googleAnalyticsConnections">, "fillsReached">, country: string, fills: readonly FillName[]) {
  const kept = (connection.fillsReached ?? []).filter((one) => one.country !== country || !fills.includes(one.fill));
  return kept.length > 0 ? kept : undefined;
}

/**
 * A fill's piece written (BR6): how far it has got, so the next time it starts
 * after it. Only for the property it was asked of.
 */
export const noteFillReached = internalMutation({
  args: { connectionId: v.id("googleAnalyticsConnections"), property: v.string(), country: v.string(), fill: v.string(), to: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.property !== args.property) return null;
    const kept = withoutReached(connection, args.country, [args.fill]) ?? [];
    await ctx.db.patch(connection._id, { fillsReached: [...kept, { country: args.country, fill: args.fill, to: args.to }], updatedAt: Date.now() });
    return null;
  },
});
