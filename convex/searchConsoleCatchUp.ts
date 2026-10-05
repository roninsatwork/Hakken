import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { periodOf } from "./searchConsoleLists";
import { firstPartOf } from "./searchConsolePeriodReads";
import { LONG_PERIODS } from "./searchConsolePeriods";

/**
 * A website's 90 days and twelve months caught up when someone opens them
 * (docs/plans/active/finish-off-plan.md, cost review — Anthony, 2026-10-05:
 * "we rebuild weekly and after each website collection … and we rebuild when
 * someone opens if it's stale"). They are added up weekly, so between times
 * they may end up to six days before the newest day collected; a screen
 * reading them then shows what is held at once, asks for them to be added up,
 * and shows how far along that is until the new lists are swapped in.
 */

/** A catch-up asked for is not asked for again within this, however many screens open. */
const ASKED_WITHIN_MS = 10 * 60 * 1000;

const datesArgs = { siteId: v.id("companyWebsites"), from: v.string(), to: v.string() };

type Behind = { connection: Doc<"searchConsoleConnections">; heldTo: string; newest: string } | null;

/** Whether the dates on screen read the 90 days or twelve months, and those end before the newest day collected. */
async function behindOf(ctx: { db: QueryCtx["db"] }, holdId: Doc<"companyWebsites">["_id"], from: string, to: string): Promise<Behind> {
  const connection = await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId))
    .first();
  const newest = connection?.newestDay;
  if (!connection || !newest) return null;
  const period = periodOf(from, to, newest);
  if (!period || !LONG_PERIODS.includes(period)) return null;
  // The 90 days' own page list says what they hold to; twelve months is built with them.
  const ninety = await firstPartOf(ctx, holdId, undefined, "web", "page", "90", "NOW");
  if (!ninety || ninety.to >= newest) return null;
  return { connection, heldTo: ninety.to, newest };
}

/** What the screen says: whether its figures are behind, to which day, and how far along adding them up is. */
export const searchConsoleCatchUp = tenantQuery({
  args: datesArgs,
  returns: v.object({
    behind: v.boolean(),
    heldTo: v.union(v.string(), v.null()),
    newest: v.union(v.string(), v.null()),
    progress: v.union(v.null(), v.object({ done: v.number(), parts: v.number() })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const behind = await behindOf(ctx, site.hold._id, args.from, args.to);
    if (!behind) return { behind: false, heldTo: null, newest: null, progress: null };
    const settling = behind.connection.settling;
    return {
      behind: true,
      heldTo: behind.heldTo,
      newest: behind.newest,
      progress: settling ? { done: settling.done, parts: settling.parts } : null,
    };
  },
});

/** Ask for the 90 days and twelve months to be caught up, once: nothing when they are not behind or already being added up. */
export const requestSearchConsoleCatchUp = tenantMutation({
  args: datesArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const behind = await behindOf(ctx, site.hold._id, args.from, args.to);
    if (!behind) return false;
    const { connection } = behind;
    if (connection.settling || (connection.catchUpAt !== undefined && Date.now() - connection.catchUpAt < ASKED_WITHIN_MS)) return false;
    await ctx.db.patch(connection._id, { catchUpAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.catchUpSite, { connectionId: connection._id });
    return true;
  },
});
