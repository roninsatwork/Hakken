import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { searchTypeValidator } from "./searchConsoleSchema";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * A website's ready-made periods added up as one job per kind of result and
 * country, side by side (docs/plans/active/finish-off-plan.md, cost review 4,
 * agreed 2026-10-05): morehandles.co.uk's whole rebuild in one job took four
 * and a half minutes of an action's ten. The connection counts the jobs; the
 * last to finish ends the run (`searchConsoleSettle.ts`).
 *
 * When (Anthony, 2026-10-05: "we rebuild weekly and after each website
 * collection for that website … and when someone opens if it's stale"):
 * Search Console's own nightly fetch adds nothing up but a website's first
 * collection; every website is added up once a week (`weeklyRebuilds`),
 * after its company's own collection (`afterCompanyCollection`), and when a
 * screen opens figures behind the newest day (`searchConsoleCatchUp.ts`).
 * The 90 days and twelve months within a rebuild are added up when a week
 * old (cost review 1): they barely change from one day to the next.
 */

/** A website's figures added up whole: its 7-day page list's first part, all countries. */
async function lastBuilt(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, country?: string): Promise<number | null> {
  const seven = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", holdId).eq("country", country).eq("searchType", "web").eq("list", "page").eq("period", "7").eq("which", "NOW").eq("part", 0))
    .first();
  return seven?.builtAt ?? null;
}

/** Whether a website's lists have ever been added up, for all countries and each country kept ready: a first collection adds them up. */
export const reportsBuilt = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return true;
    if ((await lastBuilt(ctx, connection.companyWebsiteId)) === null) return false;
    for (const held of connection.countriesHeld ?? []) {
      if ((await lastBuilt(ctx, connection.companyWebsiteId, held.country)) === null) return false;
    }
    return true;
  },
});

/** Gap between the websites one sweep asks to be added up, so they do not all start at once. */
const REBUILD_SPACING_MS = 20 * 1000;

/** When each website's figures were last added up whole; null for never. */
export const builtTimes = internalQuery({
  args: { holds: v.array(v.id("companyWebsites")) },
  returns: v.array(v.union(v.number(), v.null())),
  handler: async (ctx, args) => {
    const times: Array<number | null> = [];
    for (const holdId of args.holds) times.push(await lastBuilt(ctx, holdId));
    return times;
  },
});

/** Websites whose last added-up is read per ask. */
const BUILT_PER_READ = 100;

/** Every website's figures added up once a week, whatever else adds them up: the daily sweep finds the week-old. */
export const weeklyRebuilds = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const connections: Array<{ connectionId: Id<"searchConsoleConnections">; holdId: Id<"companyWebsites"> }> =
      await ctx.runQuery(internal.searchConsoleSync.connectionsWithFigures, {});
    let asked = 0;
    for (let start = 0; start < connections.length; start += BUILT_PER_READ) {
      const slice = connections.slice(start, start + BUILT_PER_READ);
      const times: Array<number | null> = await ctx.runQuery(internal.searchConsoleSettling.builtTimes, { holds: slice.map((one) => one.holdId) });
      for (const [index, { connectionId }] of slice.entries()) {
        const built = times[index];
        if (built !== null && Date.now() - built < LONG_EVERY_MS) continue;
        await ctx.scheduler.runAfter(asked * REBUILD_SPACING_MS, internal.searchConsoleSettle.rebuildSitePeriods, { connectionId });
        asked += 1;
      }
    }
    return asked;
  },
});

/** Holds read for a company's own websites. */
const OWN_HOLDS_READ = 200;

/** After a company's own collection finished: each of its own websites' Search Console figures added up. */
export const afterCompanyCollection = internalMutation({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return 0;
    const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", cycle.companyId)).take(OWN_HOLDS_READ);
    let asked = 0;
    for (const hold of holds) {
      if (isTrackedHold(hold)) continue;
      const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
      if (!connection?.newestDay || connection.settling) continue;
      await ctx.scheduler.runAfter(asked * REBUILD_SPACING_MS, internal.searchConsoleSettle.refreshSitePeriods, { connectionId: connection._id });
      asked += 1;
    }
    return asked;
  },
});

/** How old the 90 days may be before a night adds them up again: a week, less a little so the same night each week does. */
export const LONG_EVERY_MS = 7 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000;

/** Whether a kind of result's 90 days and twelve months are due tonight: never built, or a week old. */
export const longPeriodsDue = internalQuery({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()), searchType: searchTypeValidator },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const ninety = await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q
        .eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("searchType", args.searchType).eq("list", "page").eq("period", "90").eq("which", "NOW").eq("part", 0))
      .first();
    return !ninety || Date.now() - ninety.builtAt >= LONG_EVERY_MS;
  },
});

/** A settle begins: how many jobs, and the run the last of them finishes. Answers the token the jobs carry. */
export const startSettle = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    parts: v.number(),
    run: v.optional(v.object({
      runId: v.id("agentRuns"),
      workflowExecutionId: v.id("workflowExecutions"),
      companyId: v.id("companies"),
      summary: v.string(),
    })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const token = Date.now();
    await ctx.db.patch(args.connectionId, { settling: { token, parts: args.parts, done: 0, written: 0, weekly: 0, ...(args.run ?? {}) } });
    return token;
  },
});

const settlingValidator = v.object({
  token: v.number(),
  parts: v.number(),
  done: v.number(),
  written: v.number(),
  weekly: v.number(),
  failed: v.optional(v.string()),
  runId: v.optional(v.id("agentRuns")),
  workflowExecutionId: v.optional(v.id("workflowExecutions")),
  companyId: v.optional(v.id("companies")),
  summary: v.optional(v.string()),
});

/** One job done. Answers the settle when it was the last, so that job ends the run; null otherwise. */
export const partDone = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), token: v.number(), written: v.number(), weekly: v.boolean(), failed: v.optional(v.string()) },
  returns: v.union(v.null(), settlingValidator),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    const settling = connection?.settling;
    // A settle started since: this job's count belongs to no one.
    if (!connection || !settling || settling.token !== args.token) return null;
    const next = {
      ...settling,
      done: settling.done + 1,
      written: settling.written + args.written,
      weekly: settling.weekly + (args.weekly ? 1 : 0),
      ...(args.failed && !settling.failed ? { failed: args.failed } : {}),
    };
    if (next.done < next.parts) {
      await ctx.db.patch(connection._id, { settling: next });
      return null;
    }
    await ctx.db.patch(connection._id, { settling: undefined });
    return next;
  },
});
