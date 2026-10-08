import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { calculateModelCostUsd } from "./aiCostService";
import { findDecisionAgent } from "./decisionRuns";

/**
 * The Decisions on the cost ledger (core-data-normalisation-plan.md §7.1,
 * 2026-10-08).
 *
 * Every Decision used to write two rows: its own (`decisionRuns`) and a cost
 * row on `agentTransactions` saying the same — 38,000 of dev's 40,000 cost
 * rows. Now the call travels on the Decision's row: the first run of each
 * request a model answered carries the model and the tokens
 * (`recordRunsInternal`). Whatever counts the platform's AI calls — the
 * nightly totals, today's figures, the Decision Maker's own page — reads
 * those calls here beside `agentTransactions`, charged to the Decision Maker
 * as the cost rows were.
 */

/** A Decision's run that carries its request's model call. */
export type DecisionCall = Doc<"decisionRuns"> & { model: string };

/** The runs among these that carry their request's model call. */
export function callsOf(runs: readonly Doc<"decisionRuns">[]): DecisionCall[] {
  return runs.filter((run): run is DecisionCall => run.model !== undefined);
}

/**
 * The Decisions made from `from` to `to`, a company's or every one, at most
 * `most`: their calls are `callsOf` them. Read whole rather than filtered, so
 * a caller can tell a read that stopped at `most` from one that did not.
 */
export async function decisionRunsBetween(
  ctx: { db: QueryCtx["db"] },
  args: { companyId?: Id<"companies">; from: number; to: number; most: number },
): Promise<Doc<"decisionRuns">[]> {
  return args.companyId
    ? await ctx.db
      .query("decisionRuns")
      .withIndex("by_company_created", (q) => q.eq("companyId", args.companyId).gte("createdAt", args.from).lte("createdAt", args.to))
      .take(args.most)
    : await ctx.db
      .query("decisionRuns")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", args.from).lte("createdAt", args.to))
      .take(args.most);
}

/** A Decision call as the ledger's interactions are counted: one call, charged to the Decision Maker. */
export function decisionCallInteraction(call: DecisionCall, agentId: Id<"agents"> | undefined) {
  return {
    userId: undefined,
    widgetId: undefined,
    companyId: call.companyId,
    agentId,
    inputTokens: call.inputTokens ?? 0,
    outputTokens: call.outputTokens ?? 0,
    modelUsed: call.model,
    providerKey: undefined,
    providerModelId: undefined,
    createdAt: call.createdAt,
  };
}

/** The Decision Maker's id, when it has been seeded: every Decision call is charged to it. */
export async function decisionAgentId(ctx: { db: QueryCtx["db"] }): Promise<Id<"agents"> | undefined> {
  return (await findDecisionAgent(ctx))?._id;
}

/**
 * A Decision call as the agent page shows a cost row: what was decided, the
 * model, its tokens, and the whole call's cost — priced from its tokens as the
 * cost row was, since each run holds only its share.
 */
export async function decisionCallRows(
  ctx: { db: QueryCtx["db"] },
  calls: readonly DecisionCall[],
  agentId: Id<"agents">,
) {
  const rates = new Map<string, Doc<"aiModels"> | null>();
  for (const model of new Set(calls.map((call) => call.model))) {
    rates.set(model, await ctx.db.query("aiModels").withIndex("by_model_id", (q) => q.eq("modelId", model)).first());
  }
  return calls.map((call) => ({
    _id: call._id,
    _creationTime: call._creationTime,
    agentId,
    ...(call.companyId ? { companyId: call.companyId } : {}),
    ...(call.threadId ? { threadId: call.threadId } : {}),
    actionContext: `decision:${call.decisionKey}`,
    inputTokens: call.inputTokens ?? 0,
    outputTokens: call.outputTokens ?? 0,
    modelUsed: call.model,
    costUsd: calculateModelCostUsd({
      inputTokens: call.inputTokens ?? 0,
      outputTokens: call.outputTokens ?? 0,
      rates: rates.get(call.model) ?? null,
    }),
    status: "SUCCESS" as const,
    createdAt: call.createdAt,
  }));
}

/**
 * One-off, 2026-10-08: each Decision cost row's call moved onto the first
 * Decision of its request — the runs written with it, at the same moment, for
 * the same company and the Decisions it names — and the cost row removed. A
 * cost row whose Decisions are gone (cleared at 90 days) stays as it is.
 * Past days' analytics are already totalled (`analyticsDailySnapshots`) and
 * are not counted again.
 */
export async function moveDecisionCalls(ctx: MutationCtx, cursor: string | null, batchSize: number) {
  const agentId = await decisionAgentId(ctx);
  if (!agentId) return { cursor: null, isDone: true, processed: 0, updated: 0 };
  const page = await ctx.db
    .query("agentTransactions")
    .withIndex("by_agent", (q) => q.eq("agentId", agentId))
    .paginate({ cursor, numItems: Math.min(batchSize, 100) });
  let updated = 0;
  for (const row of page.page) {
    if (!row.actionContext.startsWith("decision:")) continue;
    const keys = new Set(row.actionContext.slice("decision:".length).split(","));
    const runs = await ctx.db.query("decisionRuns").withIndex("by_createdAt", (q) => q.eq("createdAt", row.createdAt)).take(200);
    const first = runs.find((run) => run.companyId === row.companyId && keys.has(run.decisionKey) && run.source !== "RULES" && run.model === undefined);
    if (!first) continue;
    await ctx.db.patch(first._id, { model: row.modelUsed, inputTokens: row.inputTokens, outputTokens: row.outputTokens });
    await ctx.db.delete(row._id);
    updated += 1;
  }
  return { cursor: page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}
