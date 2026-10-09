import { v, type Infer } from "convex/values";
import { internalMutation, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { calculateModelCostUsd } from "./aiCostService";
import type { ResolvedAiModelConfig } from "./aiRuntimeTypes";

/**
 * Every AI model call's cost row, written one way.
 *
 * On 2026-10-09 eighteen kinds of model call wrote no row in
 * `agentTransactions` — the wiki page picker on every answer, embeddings,
 * thread titles, speech, memory sweeps, eval graders and more — so the cost
 * screens and the high-cost check saw a fraction of the AI spend (Anthony:
 * "fix these"). Each now records here: priced from the model catalogue as the
 * agents' own calls are (`calculateModelCostUsd`), and charged to the agent
 * the call worked for, or to Platform AI when it worked for none.
 *
 * Decisions are not recorded here: their cost travels on `decisionRuns`
 * (`decisionLedger.ts`).
 */

/** How many of one provider's catalogue rows are read to price a call by the provider's model name. */
const PROVIDER_MODELS_READ = 500;

/** The system agent a model call is charged to when it works for no agent. */
export const PLATFORM_AI_SYSTEM_KEY = "PLATFORM_AI";
const PLATFORM_AI_NAME = "Platform AI";
const PLATFORM_AI_DESCRIPTION =
  "The AI work the platform does for no agent in particular — reading documents and articles into the knowledge base, memory sweeps, writing a workflow step's settings, routing a question — charged here so every AI call has a name. Not an agent you run.";

const modelSpendArgs = {
  /** The agent the call worked for. Unset, or gone, and it is charged to `systemKey`'s agent, then Platform AI. */
  agentId: v.optional(v.id("agents")),
  /** A system agent, by its key: the wiki staff, the Translator. */
  systemKey: v.optional(v.string()),
  threadId: v.optional(v.id("threads")),
  userId: v.optional(v.id("users")),
  companyId: v.optional(v.id("companies")),
  /** What the call was for, in a few words: "Writing a thread title". */
  actionContext: v.string(),
  /** The catalogue's model id, which the price is read from. */
  modelId: v.string(),
  providerKey: v.optional(v.string()),
  providerModelId: v.optional(v.string()),
  inputTokens: v.number(),
  outputTokens: v.number(),
  /** The part of `inputTokens` served from cache. */
  cachedInputTokens: v.optional(v.number()),
  status: v.optional(v.union(v.literal("SUCCESS"), v.literal("FAILED"))),
  isRehearsal: v.optional(v.boolean()),
};
const modelSpendValidator = v.object(modelSpendArgs);
type ModelSpend = Infer<typeof modelSpendValidator>;

/** Whom a call is charged to and whom it served: everything on its row but the call itself. */
export type SpendOwner = Pick<ModelSpend, "agentId" | "systemKey" | "threadId" | "userId" | "companyId">;

/** One generation's model and tokens, as its cost row takes them. */
export function generationSpend(
  model: ResolvedAiModelConfig,
  usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number },
) {
  return {
    modelId: model.modelId,
    providerKey: model.providerKey,
    providerModelId: model.providerModelId,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    ...(usage.cachedInputTokens ? { cachedInputTokens: usage.cachedInputTokens } : {}),
  };
}

/** What a call cost, from the catalogue's price for its model. An unpriced model costs nothing, as everywhere else. */
async function modelCallCostUsd(
  ctx: { db: QueryCtx["db"] },
  args: { modelId: string; providerKey?: string; providerModelId?: string; inputTokens: number; outputTokens: number; cachedInputTokens?: number },
): Promise<number> {
  const rates = await ctx.db
    .query("aiModels")
    .withIndex("by_model_id", (q) => q.eq("modelId", args.modelId))
    .first()
    // A call that knows only the provider's name for its model (a browser's
    // voice session) is priced from the catalogue row carrying that name.
    ?? (args.providerKey
      ? (await ctx.db
          .query("aiModels")
          .withIndex("by_provider", (q) => q.eq("providerKey", args.providerKey!))
          .take(PROVIDER_MODELS_READ)).find((model) => model.providerModelId === (args.providerModelId ?? args.modelId)) ?? null
      : null);
  return calculateModelCostUsd({
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    ...(args.cachedInputTokens ? { cachedInputTokens: args.cachedInputTokens } : {}),
    rates,
  });
}

async function ensurePlatformAiAgent(ctx: MutationCtx): Promise<Id<"agents">> {
  const existing = await ctx.db
    .query("agents")
    .withIndex("by_system_key", (q) => q.eq("systemKey", PLATFORM_AI_SYSTEM_KEY))
    .first();
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("agents", {
    name: PLATFORM_AI_NAME,
    description: PLATFORM_AI_DESCRIPTION,
    systemPrompt: "This agent does not run. It exists so the platform's own AI calls have a name.",
    standingObjective: "Charge the AI calls that work for no agent to one place.",
    systemKey: PLATFORM_AI_SYSTEM_KEY,
    modelId: "set per call (resolved at run time)",
    thinkingMode: false,
    isActive: true,
    isGlobal: true,
    createdAt: now,
    updatedAt: now,
  });
}

/** The agent a call is charged to: its own, else its system agent's, else Platform AI. */
async function chargedAgent(ctx: MutationCtx, args: Pick<ModelSpend, "agentId" | "systemKey">): Promise<Id<"agents">> {
  if (args.agentId && (await ctx.db.get(args.agentId))) return args.agentId;
  if (args.systemKey) {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_system_key", (q) => q.eq("systemKey", args.systemKey!))
      .first();
    if (agent) return agent._id;
  }
  return await ensurePlatformAiAgent(ctx);
}

/** The row, written: priced, charged, and never dropped for want of an agent. */
export async function writeModelSpend(
  ctx: MutationCtx,
  args: ModelSpend,
): Promise<{ agentId: Id<"agents">; costUsd: number }> {
  const agentId = await chargedAgent(ctx, args);
  const costUsd = await modelCallCostUsd(ctx, args);
  await ctx.db.insert("agentTransactions", {
    agentId,
    ...(args.threadId ? { threadId: args.threadId } : {}),
    ...(args.userId ? { userId: args.userId } : {}),
    ...(args.companyId ? { companyId: args.companyId } : {}),
    ...(args.isRehearsal ? { isRehearsal: true } : {}),
    actionContext: args.actionContext,
    modelUsed: args.modelId,
    ...(args.providerKey ? { providerKey: args.providerKey } : {}),
    ...(args.providerModelId ? { providerModelId: args.providerModelId } : {}),
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costUsd,
    status: args.status ?? "SUCCESS",
    createdAt: Date.now(),
  });
  return { agentId, costUsd };
}

/**
 * An agent run's cost row, from totals already priced and its own record for
 * whom it served: the loop's close and stop, and the single-shot path. One a
 * run — the loop's totals carry across its segments.
 */
export const recordRunCostInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    actionContext: v.string(),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    modelId: v.string(),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    await ctx.db.insert("agentTransactions", {
      agentId: run.agentId,
      ...(run.threadId ? { threadId: run.threadId } : {}),
      ...(run.userId ? { userId: run.userId } : {}),
      ...(run.companyId ? { companyId: run.companyId } : {}),
      // Drills carry their flag into the ledger: the spend is real and stays
      // in cost figures, but interaction analytics must not read a rehearsal
      // as customer traffic.
      ...(run.isRehearsal ? { isRehearsal: true } : {}),
      actionContext: args.actionContext,
      modelUsed: args.modelId,
      ...(args.providerKey ? { providerKey: args.providerKey } : {}),
      ...(args.providerModelId ? { providerModelId: args.providerModelId } : {}),
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      status: args.status,
      createdAt: Date.now(),
    });
    return null;
  },
});

/** A run in one of these has ended, and its row was written when it did. */
const ENDED_RUN_STATUSES = new Set(["SUCCESS", "FAILED", "CANCELLED"]);

/**
 * An agent run that ended away from its loop's own close — failed, or
 * cancelled or expired while waiting on a person — charged once, from the
 * furthest it reached: its saved position, or its record's totals. The loop's
 * close writes the row for every other ending, so a run already ended is left
 * alone. Called before the run is marked ended.
 */
export async function chargeEndedRun(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  args: { status: "SUCCESS" | "FAILED"; actionContext: string },
): Promise<void> {
  const run = await ctx.db.get(runId);
  if (!run?.modelId || ENDED_RUN_STATUSES.has(run.status)) return;
  const checkpoint = await ctx.db
    .query("agentRunCheckpoints")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .first();
  const inputTokens = Math.max(run.inputTokens ?? 0, checkpoint?.inputTokens ?? 0);
  const outputTokens = Math.max(run.outputTokens ?? 0, checkpoint?.outputTokens ?? 0);
  if (inputTokens === 0 && outputTokens === 0) return;
  await writeModelSpend(ctx, {
    agentId: run.agentId,
    ...(run.threadId ? { threadId: run.threadId } : {}),
    ...(run.userId ? { userId: run.userId } : {}),
    ...(run.companyId ? { companyId: run.companyId } : {}),
    ...(run.isRehearsal ? { isRehearsal: true } : {}),
    actionContext: args.actionContext,
    modelId: run.modelId,
    ...(run.providerKey ? { providerKey: run.providerKey } : {}),
    ...(run.providerModelId ? { providerModelId: run.providerModelId } : {}),
    inputTokens,
    outputTokens,
    status: args.status,
  });
}

export const chargeEndedRunInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    actionContext: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await chargeEndedRun(ctx, args.runId, { status: args.status, actionContext: args.actionContext });
    return null;
  },
});

export const recordModelSpendInternal = internalMutation({
  args: modelSpendValidator,
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => (await writeModelSpend(ctx, args)).costUsd,
});

/**
 * From an action: the call's row, written after the call. A failure to write
 * it is logged and never fails the work it records — the person still gets
 * their answer.
 */
export async function recordModelSpend(ctx: Pick<ActionCtx, "runMutation">, args: ModelSpend): Promise<void> {
  try {
    await ctx.runMutation(internal.modelSpend.recordModelSpendInternal, args);
  } catch (error) {
    console.error("Model spend not recorded:", args.actionContext, error instanceof Error ? error.message : String(error));
  }
}
