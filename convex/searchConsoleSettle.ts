"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { memoryNow } from "./utils/stepMemory";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { searchTypeValidator } from "./searchConsoleSchema";
import { failureSummary } from "./roleRuns";
import { countryLabel } from "./searchConsoleAgentRun";
import { planParts, scopesOf, settlePartKey, startParts } from "./searchConsoleSettlePlan";
import { stageName } from "./searchConsoleSettling";
import { dropOldLinesOf } from "./searchConsoleRollups";
import { buildSitePeriods } from "./searchConsolePeriods";
import { RanLong } from "./utils/searchConsolePacks";
import { MOST_PAIRS_HELD, PairsPaused, type PairsCarry } from "./searchConsoleLongLists";

/**
 * A website's settle: its ready-made periods and the charts' weeks added up
 * again after its days are in (search-console-plan.md §14.3) — for all
 * countries and each country kept ready (§16), one watched job per kind of
 * result and country, side by side (cost review 4, 2026-10-05:
 * morehandles.co.uk's in one job took four and a half of an action's ten
 * minutes), booked by `searchConsoleSettlePlan.ts`. The last job to finish
 * clears the lines past the 60 days kept — after the build, so a first
 * collection's 90 days give its charts their weeks (keep-less-history-plan.md,
 * part 3) — and ends the run (`searchConsoleSettling.settleEnded`).
 * In the Node runtime, which gives a job room for a website's 90 days of
 * keyword-and-page pairs at once (reviewed 2026-10-03).
 */

/** Each scope's lines past the 60 days kept cleared, once the lists have been added up from them. */
async function dropOldLinesAll(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">) {
  const held = await scopesOf(ctx, connectionId);
  for (const { holdId, newest, country } of held?.scopes ?? []) await dropOldLinesOf(ctx, holdId, newest, country);
}

/**
 * One job of a settle: one kind of result's ready-made periods for all
 * countries or one, its 90 days and twelve months too when a week old (or
 * asked for); the last job to finish asks for Your pages again and ends the
 * run.
 *
 * **It hands itself on** (2026-10-15, after kordatackle.com's web job ran past
 * the ten minutes an action has and the run never ended): a kind is added up
 * as a chain of jobs, one after another:
 * - the short periods, from the 60 days kept
 * - the 90 days and those before, asked of Google
 * - the twelve months, asked of Google
 * Each job has its own budget (`STAGE_BUDGET_MS`). One that still runs past it
 * stops itself between pieces, saying so (`RanLong`), so the run always ends.
 * The periods it didn't reach keep what was built before, and are added up
 * when a screen opens them or the next week. A long period's pairs asked of
 * Google pause a little before the budget runs out instead, their running
 * sums saved, and a job of the same stage carries on from that week
 * (`PairsPaused`; search-console-streamed-lists-plan.md, SL4): at ten times
 * kordatackle.com the twelve months outlast one job (2026-10-16).
 */

/** A chain job's own time, well inside the ten minutes Convex gives an action. */
const STAGE_BUDGET_MS = 7 * 60 * 1000;

const stageValidator = v.union(v.literal("SHORT"), v.literal("NINETY"), v.literal("YEAR"));
type Stage = "SHORT" | "NINETY" | "YEAR";

export const settlePart = internalAction({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    holdId: v.id("companyWebsites"),
    token: v.number(),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    newest: v.string(),
    oldest: v.string(),
    /** Add up the 90 days and twelve months whatever their age: a rebuild by hand. */
    long: v.optional(v.boolean()),
    /** Only the 90 days and twelve months: caught up because a screen asked (`searchConsoleCatchUp.ts`). */
    onlyLong: v.optional(v.boolean()),
    /** The chain's job this is, and what the jobs before it wrote and whether the long periods were due (missing: its first). */
    stage: v.optional(stageValidator),
    /** Where the job before paused this stage's pairs, their sums saved: carried on from there (SL4). */
    carry: v.optional(v.object({ at: v.number(), of: v.number(), saved: v.id("_storage"), pruned: v.boolean() })),
    writtenBefore: v.optional(v.number()),
    weeklyBefore: v.optional(v.boolean()),
    /** When this job must stop by; missing, its budget from now. A test sets it to see a job stop itself. */
    stopAt: v.optional(v.number()),
    /** The booking this job is (`collectionSteps.ts`, RR1): missing on one booked before the watch. */
    booking: v.optional(v.number()),
    /** Its watch gave up carrying it on: counted as done, saying why, so the settle still ends. */
    closeOnly: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scope = args.country === undefined ? {} : { country: args.country };
    const part = { searchType: args.searchType, ...scope };
    const key = settlePartKey(args.connectionId, part);
    const begun = await ctx.runMutation(internal.collectionSteps.stepStarted, { key, ...(args.booking !== undefined ? { booking: args.booking } : {}) });
    if (!begun.go) return null;
    const name = `${args.searchType}${args.country ? ` (${countryLabel(args.country)})` : ""}`;
    let written = args.writtenBefore ?? 0;
    let weekly = args.weeklyBefore ?? false;
    let failed: string | undefined;
    let next: Stage | undefined;
    let stage: Stage | undefined;
    let paused: PairsCarry | undefined;
    // Counted already — started again by its watch in the settle's ending: straight to the ending (RR1).
    const counted = await ctx.runQuery(internal.searchConsoleSettling.partCounted, { connectionId: args.connectionId, token: args.token, part: key });
    if (!counted && args.closeOnly) {
      failed = `${name}: the platform kept stopping this job, so what it didn't reach keeps what was built before, and is added up when a screen opens it.`;
      await letGo(ctx, args.carry);
    }
    if (!counted && !args.closeOnly) {
      try {
        if (args.stage === undefined) weekly = args.long ?? await ctx.runQuery(internal.searchConsoleSettling.longPeriodsDue, { holdId: args.holdId, ...scope, searchType: args.searchType });
        const stages: Stage[] = args.onlyLong ? ["NINETY", "YEAR"] : weekly ? ["SHORT", "NINETY", "YEAR"] : ["SHORT"];
        stage = args.stage ?? stages[0];
        next = stages[stages.indexOf(stage) + 1];
        if (begun.skip) {
          // Stopped by the platform three times at this stage: left out, saying so, and the chain goes on (RR1).
          failed = `${name}: ${stageName(part, stage)} was stopped by the platform three times, so it keeps what was built before.`;
          await letGo(ctx, args.carry);
          // Said now when a stage follows: only the chain's last job hands its words to the settle's end.
          const { runId } = await runOf(ctx, args.connectionId, args.token);
          if (next !== undefined && runId) await ctx.runMutation(internal.roleRuns.logRunLine, { runId, heading: "Left out", detail: failed, failed: true });
        } else {
          const stopAt = args.stopAt ?? Date.now() + STAGE_BUDGET_MS;
          const held = { pruned: false };
          written += await buildSitePeriods(ctx, args.holdId, args.newest, args.oldest, args.country, stage === "SHORT"
            ? { searchType: args.searchType, long: false, stopAt, careful: begun.careful, held }
            : { searchType: args.searchType, long: true, onlyLong: true, longPeriod: stage === "NINETY" ? "90" : "365", stopAt, careful: begun.careful, held, ...(args.carry ? { carry: args.carry } : {}) });
          // A period's pairs past what one job may hold: never in silence (RR2).
          const { runId } = await runOf(ctx, args.connectionId, args.token);
          if (held.pruned && runId) {
            await ctx.runMutation(internal.roleRuns.logRunLine, {
              runId,
              heading: "Too many searches to hold",
              detail: `${stageName(part, stage)}: more than ${MOST_PAIRS_HELD.toLocaleString("en-GB")} searches by page came in, so the least-seen searches the keep rule could not keep yet — no click, one page, an average position past 20 — were let go as they came.`,
              failed: true,
            });
          }
        }
      } catch (error: unknown) {
        // The stage's pairs paused near the end of the job's time: the same stage again, carried on from where they stood.
        if (error instanceof PairsPaused) {
          paused = error.carry;
          next = stage;
        } else {
          next = undefined;
          failed = error instanceof RanLong
            ? `${name}: ${error.message}; what it didn't reach keeps what was built before, and is added up when a screen opens it.`
            : `${name}: ${failureSummary(error)}`;
          await letGo(ctx, args.carry);
        }
      }
      // The next job of the chain, handed what this one wrote: the settle counts a kind once, at the chain's end.
      if (next !== undefined) {
        const { stopAt: _stopAt, booking: _booking, carry: _carry, ...rest } = args;
        await ctx.runMutation(internal.collectionSteps.handOn, { ...memoryNow(),
          key,
          chain: "SC_SETTLE",
          args: { ...rest, stage: next, writtenBefore: written, weeklyBefore: weekly, ...(paused ? { carry: paused } : {}) },
          place: paused ? `${stageName(part, next)}, from week ${paused.at + 1} of ${paused.of}` : stageName(part, next),
          ...(args.booking !== undefined ? { from: args.booking } : {}),
          ...(await runOf(ctx, args.connectionId, args.token)),
        });
        return null;
      }
    }
    const settle = await ctx.runMutation(internal.searchConsoleSettling.partDone, {
      connectionId: args.connectionId, token: args.token, part: key, written, weekly, ...(failed ? { failed } : {}),
    });
    if (settle) {
      // The last job: the lines past the days kept cleared, now built from (keep-less-history-plan.md, part 3), and Your
      // pages, which reads the 90-day page list, asked for (not waited on). Both safe to do again if this job is.
      await dropOldLinesAll(ctx, args.connectionId);
      await ctx.runMutation(internal.holdPages.requestRebuild, { holdId: args.holdId });
      await ctx.runMutation(internal.searchConsoleSettling.settleEnded, { connectionId: args.connectionId, token: args.token, newest: args.newest });
    }
    await ctx.runMutation(internal.collectionSteps.closeChain, { ...memoryNow(), key, ...(args.booking !== undefined ? { booking: args.booking } : {}) });
    return null;
  },
});

/** Pairs a paused stage saved, let go when its chain ends without carrying them on (SL4). */
async function letGo(ctx: ActionCtx, carry: PairsCarry | undefined) {
  if (!carry) return;
  try {
    await ctx.storage.delete(carry.saved);
  } catch {
    // Let go already, by the job that carried them on.
  }
}

/** The run a settle carries, for its jobs' chains: their lines and their liveness are the run's. */
async function runOf(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">, token: number): Promise<{ runId?: Id<"agentRuns"> }> {
  const runId = await ctx.runQuery(internal.searchConsoleSettling.settleRunOf, { connectionId, token });
  return runId ? { runId } : {};
}

/**
 * A website's lists caught up because someone opened a screen reading them
 * while they were behind the newest day collected (`searchConsoleCatchUp.ts`):
 * the 90 days and twelve months alone (`long`), or the 7 and 30 days with the
 * charts — every kind and country side by side, the screen showing what is
 * held until the new lists are swapped in.
 */
export const catchUpSite = internalAction({
  args: { connectionId: v.id("searchConsoleConnections"), long: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await planParts(ctx, args.connectionId);
    if (plan) await startParts(ctx, args.connectionId, plan, undefined, args.long, args.long);
    return null;
  },
});

/**
 * A website's figures added up after its company's own collection
 * (`searchConsoleSettling.afterCompanyCollection`): the 7 and 30 days, and the
 * 90 days and twelve months when a week old.
 */
export const refreshSitePeriods = internalAction({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await planParts(ctx, args.connectionId);
    if (plan) await startParts(ctx, args.connectionId, plan);
    return null;
  },
});

/**
 * A website's ready-made periods built again, with no collection, every
 * period whatever its age: for all countries and each country kept ready, as
 * one job per kind of result, side by side. Run by hand when what the periods
 * hold changes shape, and by the tidy after it changes what is kept. The 7
 * and 30 days from what is kept; the 90 days and twelve months, and Rich
 * results' pages per kind, asked of Google — free
 * (keep-less-history-plan.md, part 3).
 */
export const rebuildSitePeriods = internalAction({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await planParts(ctx, args.connectionId);
    if (plan) await startParts(ctx, args.connectionId, plan, undefined, true);
    return null;
  },
});
