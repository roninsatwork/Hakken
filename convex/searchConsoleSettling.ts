import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { kindsHeld } from "./searchConsoleRollups";
import { isTrackedHold } from "./utils/websitePairing";
import { bookStep } from "./collectionSteps";
import { closeRoleRun, writeRunLine } from "./roleRuns";
import { settlePartKey } from "./searchConsoleSettlePlan";
import { siteRunGoing } from "./searchConsoleConnect";
import { count, days } from "./searchConsoleAgentRun";

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

/** A website's figures added up whole: one kind of result's Last week page list's first part — web search's unless named — all countries unless named (calendar-periods-plan.md: last week is always inside the days kept, so every build writes it). */
async function lastBuilt(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, country?: string, searchType: SearchType = "web"): Promise<number | null> {
  const seven = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", holdId).eq("country", country).eq("searchType", searchType).eq("list", "page").eq("period", "lastWeek").eq("which", "NOW").eq("part", 0))
    .first();
  return seven?.builtAt ?? null;
}

/**
 * Whether all countries', or one country's, lists have been added up — or
 * need none. A kind of result Google showed the website in no search for has
 * no lists to add up (`kindsHeld`), so a country kept ready with no searches
 * never has one, and must not make every nightly fetch add the whole website
 * up as if it were its first (2026-10-07: Yemen, kept ready for
 * conterraops.com, did). Web search's list is read first, so a website with
 * it built costs one read; one without web search is judged by the first
 * kind it has.
 */
async function scopeBuilt(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, country?: string): Promise<boolean> {
  if ((await lastBuilt(ctx, holdId, country)) !== null) return true;
  const [first] = await kindsHeld(ctx, holdId, country);
  return first === undefined || (first !== "web" && (await lastBuilt(ctx, holdId, country, first)) !== null);
}

/** Whether a website's lists have ever been added up, for all countries and each country kept ready, where there is anything to add up: a first collection adds them up. */
export const reportsBuilt = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return true;
    if (!(await scopeBuilt(ctx, connection.companyWebsiteId))) return false;
    for (const held of connection.countriesHeld ?? []) {
      if (!(await scopeBuilt(ctx, connection.companyWebsiteId, held.country))) return false;
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
      if (!connection?.newestDay || settlingNow(connection)) continue;
      await ctx.scheduler.runAfter(asked * REBUILD_SPACING_MS, internal.searchConsoleSettle.refreshSitePeriods, { connectionId: connection._id });
      asked += 1;
    }
    return asked;
  },
});

/** How old the 90 days may be before a night adds them up again: a week, less a little so the same night each week does. */
export const LONG_EVERY_MS = 7 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000;

/** Whether a kind of result's long periods — those asked of Google — are due tonight: the 12 months never built, or a week old. */
export const longPeriodsDue = internalQuery({
  args: { holdId: v.id("companyWebsites"), country: v.optional(v.string()), searchType: searchTypeValidator },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const ninety = await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q
        .eq("companyWebsiteId", args.holdId).eq("country", args.country).eq("searchType", args.searchType).eq("list", "page").eq("period", "last12Months").eq("which", "NOW").eq("part", 0))
      .first();
    return !ninety || Date.now() - ninety.builtAt >= LONG_EVERY_MS;
  },
});

/**
 * A settle that began this long ago and never finished died: a job ended by
 * the platform before it could say so. A newer settle, or a screen's
 * catch-up, starts afresh rather than wait for it for ever. Well past the
 * longest chain a kind takes (three jobs of seven minutes).
 */
export const SETTLE_STALE_MS = 45 * 60 * 1000;

/** The run a settle ends, carried on its count. */
const settleRunValidator = v.object({
  runId: v.id("agentRuns"),
  workflowExecutionId: v.id("workflowExecutions"),
  companyId: v.id("companies"),
  summary: v.string(),
});

/** Whether a connection's settle is still going: started, not finished, and not so long ago it can only have died. */
export function settlingNow(connection: { settling?: { token: number } } | null | undefined, now = Date.now()): boolean {
  return Boolean(connection?.settling && now - connection.settling.token < SETTLE_STALE_MS);
}

/** A settle begins: how many jobs, and the run the last of them finishes. Answers the token the jobs carry. */
export const startSettle = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    parts: v.number(),
    run: v.optional(settleRunValidator),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const token = Date.now();
    await ctx.db.patch(args.connectionId, { settling: { token, parts: args.parts, done: 0, written: 0, weekly: 0, doneParts: [], ...(args.run ?? {}) } });
    return token;
  },
});

const partValidator = v.object({ country: v.optional(v.string()), searchType: searchTypeValidator, newest: v.string(), oldest: v.string() });

/**
 * A settle's jobs booked, each watched (collection-reliability-plan.md, RR1),
 * in one transaction with the settle's count — one settle a website at a time
 * (RR4). A settle already adding the website up is left to it when this one
 * has no run to end: a screen's catch-up, the weekly rebuild. One with a run —
 * a website's first collection — takes over: the jobs it replaces stop at
 * their next stage, their chains booked over, and the run they would have
 * ended ends now, saying why, so no run is left open.
 */
export const startSettleParts = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    holdId: v.id("companyWebsites"),
    parts: v.array(partValidator),
    run: v.optional(settleRunValidator),
    long: v.optional(v.boolean()),
    onlyLong: v.optional(v.boolean()),
  },
  returns: v.union(v.literal("STARTED"), v.literal("ALREADY_GOING")),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return "ALREADY_GOING";
    const now = Date.now();
    const old = connection.settling;
    const going = settlingNow(connection, now);
    if (going && !args.run) return "ALREADY_GOING";
    // A website whose own run is still bringing its days in is added up by that run, from all of them — never by a
    // screen's catch-up or the weekly rebuild part-way, which once left a first collection's 90 days never added up.
    if (!args.run && (await siteRunGoing(ctx, connection))) return "ALREADY_GOING";
    if (old?.runId && old.runId !== args.run?.runId) {
      const run = await ctx.db.get(old.runId);
      if (run && (run.status === "RUNNING" || run.status === "QUEUED")) {
        await closeRoleRun(ctx, {
          runId: old.runId,
          ...(old.workflowExecutionId ? { workflowExecutionId: old.workflowExecutionId } : {}),
          status: going ? "SUCCESS" : "FAILED",
          summary: going
            ? `${old.summary ?? "Collected."} Its lists are added up with the next run's days, which came in meanwhile.`
            : "The days came in, but adding them up stopped and never finished. The next run adds them up again.",
        });
      }
    }
    const token = now;
    await ctx.db.patch(connection._id, { settling: { token, parts: args.parts.length, done: 0, written: 0, weekly: 0, doneParts: [], ...(args.run ?? {}) } });
    for (const part of args.parts) {
      const stage = args.onlyLong ? "NINETY" : undefined;
      await bookStep(ctx, {
        key: settlePartKey(connection._id, part),
        chain: "SC_SETTLE",
        ...(args.run ? { runId: args.run.runId } : {}),
        args: {
          connectionId: connection._id,
          holdId: args.holdId,
          token,
          ...part,
          ...(args.long === undefined ? {} : { long: args.long }),
          ...(args.onlyLong ? { onlyLong: true } : {}),
        },
        place: stageName(part, stage ?? "SHORT"),
      });
    }
    return "STARTED";
  },
});

/** A settle job's stage, in plain words: the place its watch names. */
export function stageName(part: { searchType: string; country?: string }, stage: "SHORT" | "NINETY" | "YEAR"): string {
  const what = stage === "SHORT" ? "the weeks and months held day by day" : stage === "NINETY" ? "the months and quarters asked of Google" : "this year";
  return `adding up ${part.searchType}${part.country ? ` (${part.country.toUpperCase()})` : ""}, ${what}`;
}

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
  doneParts: v.optional(v.array(v.string())),
});

/**
 * One job done, counted once (RR4): a job its watch started again after its
 * count says so again, and is not counted twice. Answers the settle once every
 * job is in — to the last job, and to any job that says so again before the
 * settle has ended, so a last job stopped in its ending ends it on its next
 * try; null otherwise.
 */
export const partDone = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    token: v.number(),
    part: v.optional(v.string()),
    written: v.number(),
    weekly: v.boolean(),
    failed: v.optional(v.string()),
  },
  returns: v.union(v.null(), settlingValidator),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    const settling = connection?.settling;
    // A settle started since: this job's count belongs to no one.
    if (!connection || !settling || settling.token !== args.token) return null;
    const doneParts = settling.doneParts ?? [];
    if (args.part !== undefined && doneParts.includes(args.part)) return settling.done >= settling.parts ? settling : null;
    const next = {
      ...settling,
      done: settling.done + 1,
      written: settling.written + args.written,
      weekly: settling.weekly + (args.weekly ? 1 : 0),
      doneParts: args.part === undefined ? doneParts : [...doneParts, args.part],
      ...(args.failed && !settling.failed ? { failed: args.failed } : {}),
    };
    await ctx.db.patch(connection._id, { settling: next });
    return next.done < next.parts ? null : next;
  },
});

/** The run a settle carries, while it is the settle going: its jobs' chains are the run's. */
export const settleRunOf = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections"), token: v.number() },
  returns: v.union(v.id("agentRuns"), v.null()),
  handler: async (ctx, args) => {
    const settling = (await ctx.db.get(args.connectionId))?.settling;
    return settling && settling.token === args.token ? settling.runId ?? null : null;
  },
});

/** Whether a settle job is already counted: started again by its watch, it goes straight to the settle's ending. */
export const partCounted = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections"), token: v.number(), part: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const settling = (await ctx.db.get(args.connectionId))?.settling;
    return Boolean(settling && settling.token === args.token && (settling.doneParts ?? []).includes(args.part));
  },
});

/**
 * A settle's ending, once (RR1): the settle cleared, and the run it carries
 * ended with a line saying what was added up, in one transaction. A second
 * ending — a last job started again after it — finds the settle gone.
 */
export const settleEnded = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), token: v.number(), newest: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    const settle = connection?.settling;
    if (!connection || !settle || settle.token !== args.token) return null;
    await ctx.db.patch(connection._id, { settling: undefined });
    if (!settle.runId) return null;
    const run = await ctx.db.get(settle.runId);
    if (!run || (run.status !== "RUNNING" && run.status !== "QUEUED")) return null;
    await writeRunLine(ctx, {
      runId: settle.runId,
      ...(settle.companyId ? { companyId: settle.companyId } : {}),
      heading: "Added up",
      detail: `${count(settle.parts)} ${settle.parts === 1 ? "job" : "jobs"}: the 7- and 30-day lists rebuilt${settle.weekly > 0 ? ", and the 90-day and 12-month ones (weekly)" : "; the 90-day and 12-month ones are rebuilt weekly"} (${count(settle.written)} records), to ${days(args.newest, args.newest)}.`,
      failed: settle.failed !== undefined,
    });
    await closeRoleRun(ctx, {
      runId: settle.runId,
      ...(settle.workflowExecutionId ? { workflowExecutionId: settle.workflowExecutionId } : {}),
      status: settle.failed ? "FAILED" : "SUCCESS",
      summary: settle.failed ? `The days came in, but adding them up stopped: ${settle.failed} The next run adds them up again.` : (settle.summary ?? ""),
    });
    return null;
  },
});
