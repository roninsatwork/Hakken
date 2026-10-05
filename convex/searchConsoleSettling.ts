import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { searchTypeValidator } from "./searchConsoleSchema";

/**
 * A website's ready-made periods added up as one job per kind of result and
 * country, side by side (docs/plans/active/finish-off-plan.md, cost review 4,
 * agreed 2026-10-05): morehandles.co.uk's whole rebuild in one job took four
 * and a half minutes of an action's ten. The connection counts the jobs; the
 * last to finish ends the run (`searchConsoleSettle.ts`).
 *
 * The 90 days and twelve months are added up once a week, the 7 and 30 days
 * every night (cost review 1): the long ones barely change from one day to
 * the next, and were the larger part of each night's writing.
 */

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
