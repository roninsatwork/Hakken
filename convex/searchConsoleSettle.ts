"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { searchTypeValidator, type SearchType } from "./searchConsoleSchema";
import { failureSummary } from "./roleRuns";
import { count, countryLabel, days, finishRun } from "./searchConsoleAgentRun";
import { dropOldLinesOf } from "./searchConsoleRollups";
import { buildSitePeriods } from "./searchConsolePeriods";

/**
 * A website's run settles after its days are in (search-console-plan.md
 * §14.3): the ready-made periods and the charts' weeks are added up again —
 * for all countries and each country kept ready (§16), as one job per kind
 * of result and country, side by side (cost review 4, 2026-10-05:
 * morehandles.co.uk's in one job took four and a half of an action's ten
 * minutes). The last job to finish clears the lines past the 60 days kept —
 * after the build, so a first collection's 90 days give its charts their
 * weeks (keep-less-history-plan.md, part 3) — and ends the run
 * (`searchConsoleSettling.ts`).
 * In the Node runtime, which gives a job room for a website's 90 days of
 * keyword-and-page pairs at once (reviewed 2026-10-03).
 */
export const settleSite = internalAction({
  args: {
    runId: v.id("agentRuns"),
    workflowExecutionId: v.id("workflowExecutions"),
    connectionId: v.id("searchConsoleConnections"),
    companyId: v.id("companies"),
    host: v.string(),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finish = async () => await finishRun(ctx, args.runId, args.workflowExecutionId, "SUCCESS", args.summary);
    try {
      const plan = await planParts(ctx, args.connectionId);
      if (plan === null) {
        await finish();
        return null;
      }
      await ctx.runMutation(internal.roleRuns.logRunLine, {
        runId: args.runId,
        companyId: args.companyId,
        heading: "Kept",
        detail: `The lists added up as ${count(plan.parts.length)} ${plan.parts.length === 1 ? "job" : "jobs"} side by side, then the lines past the 60 days kept cleared.`,
        failed: false,
      });
      await startParts(ctx, args.connectionId, plan, {
        runId: args.runId, workflowExecutionId: args.workflowExecutionId, companyId: args.companyId, summary: args.summary,
      });
    } catch (error: unknown) {
      await finishRun(ctx, args.runId, args.workflowExecutionId, "FAILED", `The days came in, but adding them up stopped: ${failureSummary(error)} The next run adds them up again.`);
    }
    return null;
  },
});

type Part = { country?: string; searchType: SearchType; newest: string; oldest: string };
type Plan = { holdId: Id<"companyWebsites">; parts: Part[] };

/** Each scope held — all countries, and each country kept ready — with its newest and oldest day; null with nothing held. */
async function scopesOf(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">) {
  const all = await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId });
  if (!all || all.clearing || !all.newestDay || !all.oldestDay) return null;
  const scopes: Array<{ holdId: Id<"companyWebsites">; country?: string; newest: string; oldest: string }> = [];
  for (const country of [undefined, ...all.countries]) {
    const scope = country === undefined ? {} : { country };
    const state = country === undefined ? all : await ctx.runQuery(internal.searchConsoleSync.stepState, { connectionId, ...scope });
    if (!state || !state.kept || !state.newestDay || !state.oldestDay) continue;
    scopes.push({ holdId: state.companyWebsiteId, ...scope, newest: state.newestDay, oldest: state.oldestDay });
  }
  return { holdId: all.companyWebsiteId, scopes };
}

/** The jobs that add up each scope's lists: one per kind of result held. Null with nothing held. */
async function planParts(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">): Promise<Plan | null> {
  const held = await scopesOf(ctx, connectionId);
  if (!held) return null;
  const parts: Part[] = [];
  for (const { holdId, newest, oldest, ...scope } of held.scopes) {
    const types = await ctx.runQuery(internal.searchConsoleRollups.typesHeld, { companyWebsiteId: holdId, ...scope });
    for (const searchType of types) parts.push({ ...scope, searchType, newest, oldest });
  }
  return parts.length > 0 ? { holdId: held.holdId, parts } : null;
}

/** Each scope's lines past the 60 days kept cleared, once the lists have been added up from them. */
async function dropOldLinesAll(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">) {
  const held = await scopesOf(ctx, connectionId);
  for (const { holdId, newest, country } of held?.scopes ?? []) await dropOldLinesOf(ctx, holdId, newest, country);
}

/** The settle's jobs started side by side, counted on the connection. */
async function startParts(
  ctx: ActionCtx,
  connectionId: Id<"searchConsoleConnections">,
  plan: Plan,
  run?: { runId: Id<"agentRuns">; workflowExecutionId: Id<"workflowExecutions">; companyId: Id<"companies">; summary: string },
  long?: boolean,
  onlyLong?: boolean,
) {
  const token = await ctx.runMutation(internal.searchConsoleSettling.startSettle, { connectionId, parts: plan.parts.length, ...(run ? { run } : {}) });
  for (const part of plan.parts) {
    await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.settlePart, {
      connectionId, holdId: plan.holdId, token, ...part, ...(long === undefined ? {} : { long }), ...(onlyLong ? { onlyLong } : {}),
    });
  }
}

/**
 * One job of a settle: one kind of result's ready-made periods for all
 * countries or one, its 90 days and twelve months too when a week old (or
 * asked for); the last job to finish asks for Your pages again and ends the
 * run.
 */
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scope = args.country === undefined ? {} : { country: args.country };
    let written = 0;
    let weekly = false;
    let failed: string | undefined;
    try {
      weekly = args.long ?? await ctx.runQuery(internal.searchConsoleSettling.longPeriodsDue, { holdId: args.holdId, ...scope, searchType: args.searchType });
      written = await buildSitePeriods(ctx, args.holdId, args.newest, args.oldest, args.country, { searchType: args.searchType, long: weekly, onlyLong: args.onlyLong });
    } catch (error: unknown) {
      failed = `${args.searchType}${args.country ? ` (${countryLabel(args.country)})` : ""}: ${failureSummary(error)}`;
    }
    const settle = await ctx.runMutation(internal.searchConsoleSettling.partDone, {
      connectionId: args.connectionId, token: args.token, written, weekly, ...(failed ? { failed } : {}),
    });
    if (!settle) return null;
    // The last job: the lines past the days kept cleared, now built from (keep-less-history-plan.md, part 3).
    await dropOldLinesAll(ctx, args.connectionId);
    // Your pages reads the 90-day page list (asked for, not waited on), and the run ends.
    await ctx.runMutation(internal.holdPages.requestRebuild, { holdId: args.holdId });
    if (!settle.runId || !settle.companyId) return null;
    const newest = args.newest;
    await ctx.runMutation(internal.roleRuns.logRunLine, {
      runId: settle.runId,
      companyId: settle.companyId,
      heading: "Added up",
      detail: `${count(settle.parts)} ${settle.parts === 1 ? "job" : "jobs"}: the 7- and 30-day lists rebuilt${settle.weekly > 0 ? ", and the 90-day and 12-month ones (weekly)" : "; the 90-day and 12-month ones are rebuilt weekly"} (${count(settle.written)} records), to ${days(newest, newest)}.`,
      failed: settle.failed !== undefined,
    });
    await finishRun(
      ctx,
      settle.runId,
      settle.workflowExecutionId,
      settle.failed ? "FAILED" : "SUCCESS",
      settle.failed ? `The days came in, but adding them up stopped: ${settle.failed} The next run adds them up again.` : (settle.summary ?? ""),
    );
    return null;
  },
});

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
