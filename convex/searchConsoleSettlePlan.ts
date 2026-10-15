import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { SearchType } from "./searchConsoleSchema";
import { stepKey } from "./collectionSteps";

/**
 * What a website's settle adds up, and its jobs started (search-console-plan.md
 * §14.3; collection-reliability-plan.md, RR1 and RR4): one watched job per kind
 * of result and country, side by side, booked in one transaction with the
 * settle's own count (`searchConsoleSettling.startSettleParts`). In the default
 * runtime, so a step of the run itself — the 16-month fill's last — starts
 * them, inside its own watch, rather than an action of its own that nothing
 * watched.
 */

export type SettlePart = { country?: string; searchType: SearchType; newest: string; oldest: string };
export type SettlePlan = { holdId: Id<"companyWebsites">; parts: SettlePart[] };
export type SettleRun = { runId: Id<"agentRuns">; workflowExecutionId: Id<"workflowExecutions">; companyId: Id<"companies">; summary: string };

/** A settle job's watched chain: one a kind of result, country and website, written over by each settle. */
export function settlePartKey(connectionId: Id<"searchConsoleConnections">, part: { searchType: SearchType; country?: string }): string {
  return stepKey("SC_SETTLE", connectionId, part.searchType, part.country);
}

/** Each scope held — all countries, and each country kept ready — with its newest and oldest day; null with nothing held. */
export async function scopesOf(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">) {
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
export async function planParts(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">): Promise<SettlePlan | null> {
  const held = await scopesOf(ctx, connectionId);
  if (!held) return null;
  const parts: SettlePart[] = [];
  for (const { holdId, newest, oldest, ...scope } of held.scopes) {
    const types = await ctx.runQuery(internal.searchConsoleRollups.typesHeld, { companyWebsiteId: holdId, ...scope });
    for (const searchType of types) parts.push({ ...scope, searchType, newest, oldest });
  }
  return parts.length > 0 ? { holdId: held.holdId, parts } : null;
}

/**
 * A settle's jobs started side by side, counted on the connection — or not,
 * when one is already adding the website up and this one has no run to end
 * (RR4): "STARTED" or "ALREADY_GOING".
 */
export async function startParts(
  ctx: ActionCtx,
  connectionId: Id<"searchConsoleConnections">,
  plan: SettlePlan,
  run?: SettleRun,
  long?: boolean,
  onlyLong?: boolean,
): Promise<"STARTED" | "ALREADY_GOING"> {
  return await ctx.runMutation(internal.searchConsoleSettling.startSettleParts, {
    connectionId,
    holdId: plan.holdId,
    parts: plan.parts,
    ...(run ? { run } : {}),
    ...(long === undefined ? {} : { long }),
    ...(onlyLong ? { onlyLong } : {}),
  });
}
