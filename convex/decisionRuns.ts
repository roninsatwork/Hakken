import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { calculateModelCostUsd } from "./aiCostService";
import { buildDecisionActedAuditMetadata } from "./auditLogService";
import { getDecision, listDecisions } from "./decisionRegistry";
import { certaintyWords, resolveDecisionMode, type DecisionMode } from "./decisionService";
import { appError } from "./utils/appError";

/**
 * The database side of the Decision engine: modes, run rows, cost and audit.
 *
 * `decisionActions.ts` does the asking (it needs Node for the provider call);
 * everything that touches a table is here, so a query can read it and a test
 * can drive it without a network.
 */

const modeValidator = v.union(v.literal("OFF"), v.literal("ASK_A_PERSON"), v.literal("ACT"));
const certaintyValidator = v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"));
const outcomeValidator = v.union(v.literal("ACTED"), v.literal("HANDED_TO_PERSON"), v.literal("RECORDED"));
const sourceValidator = v.union(v.literal("TYPESAFE"), v.literal("TEXT_MODEL"), v.literal("RULES"));
const fallbackReasonValidator = v.union(v.literal("MODE_OFF"), v.literal("NO_MODEL"), v.literal("PROVIDER_FAILED"));

/**
 * The system agent every TypeSafe call is charged to.
 *
 * Decisions are not an agent, but the cost ledger, the cost screens and the
 * per-agent observability pages are all keyed by one, and the wiki staff
 * set the precedent: a seeded row with a `systemKey`, never deleted, so the
 * spend has a name on the leaderboards. Its switch is not consulted — the
 * Decisions screen and the provider switch are the controls.
 */
export const DECISION_AGENT_SYSTEM_KEY = "DECISION_MAKER";
const DECISION_AGENT_NAME = "The Decision Maker";
const DECISION_AGENT_DESCRIPTION =
  "Answers the platform's yes-or-no, pick-one and how-much questions through TypeSafe, so each screen can act or ask a person. Not an agent you run; the cost of every Decision is charged here.";

async function findDecisionAgent(ctx: { db: QueryCtx["db"] }) {
  const candidates = (
    await ctx.db.query("agents").withIndex("by_active_created", (q) => q.eq("isActive", true)).take(500)
  ).concat(
    await ctx.db.query("agents").withIndex("by_active_created", (q) => q.eq("isActive", false)).take(500),
  );
  return candidates.find((agent) => agent.systemKey === DECISION_AGENT_SYSTEM_KEY) ?? null;
}

async function ensureDecisionAgent(ctx: MutationCtx): Promise<Id<"agents">> {
  const existing = await findDecisionAgent(ctx);
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("agents", {
    name: DECISION_AGENT_NAME,
    description: DECISION_AGENT_DESCRIPTION,
    systemPrompt: "This agent does not run. It exists so every Decision's cost has a name.",
    standingObjective: "Charge each TypeSafe judgment to one place.",
    systemKey: DECISION_AGENT_SYSTEM_KEY,
    modelId: "decision (resolved at run time)",
    thinkingMode: false,
    isActive: true,
    isGlobal: true,
    createdAt: now,
    updatedAt: now,
  });
}

export const ensureDecisionAgentInternal = internalMutation({
  args: {},
  handler: async (ctx): Promise<Id<"agents">> => await ensureDecisionAgent(ctx),
});

/**
 * Each Decision's mode for this company: company row → global row → the
 * registry default. Unknown keys are refused rather than defaulted, because
 * an unregistered Decision has no question to ask and no stakes to weigh.
 */
export async function resolveDecisionModes(
  ctx: { db: QueryCtx["db"] },
  args: { decisionKeys: string[]; companyId?: Id<"companies"> },
): Promise<Record<string, DecisionMode>> {
  const modes: Record<string, DecisionMode> = {};
  for (const key of args.decisionKeys) {
    const definition = getDecision(key);
    if (!definition) throw appError("INVALID_INPUT", `Unknown decision '${key}'.`);
    const globalRow = await ctx.db
      .query("decisionSettings")
      .withIndex("by_scope_key", (q) => q.eq("scope", "global").eq("decisionKey", key))
      .first();
    const companyRow = args.companyId
      ? await ctx.db
          .query("decisionSettings")
          .withIndex("by_company_key", (q) => q.eq("companyId", args.companyId).eq("decisionKey", key))
          .first()
      : null;
    modes[key] = resolveDecisionMode({
      companyMode: companyRow?.mode ?? null,
      globalMode: globalRow?.mode ?? null,
      defaultMode: definition.defaultMode,
    });
  }
  return modes;
}

export const resolveModesInternal = internalQuery({
  args: {
    decisionKeys: v.array(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args): Promise<Record<string, DecisionMode>> => await resolveDecisionModes(ctx, args),
});

/** Every registered Decision's key and default, for screens and tests. */
export const listRegisteredInternal = internalQuery({
  args: {},
  handler: async () =>
    listDecisions().map((decision) => ({
      key: decision.key,
      copyKey: decision.copyKey,
      usedIn: decision.usedIn,
      stakes: decision.stakes,
      defaultMode: decision.defaultMode,
    })),
});

const runInsertValidator = v.object({
  decisionKey: v.string(),
  answer: v.string(),
  probabilities: v.optional(v.string()),
  certainty: v.optional(certaintyValidator),
  mode: modeValidator,
  outcome: outcomeValidator,
  source: sourceValidator,
  fallbackReason: v.optional(fallbackReasonValidator),
  action: v.optional(v.string()),
});

/**
 * Write one request's worth of runs.
 *
 * Several Decisions asked over the same state travel in one TypeSafe request,
 * so the tokens belong to the request: one cost row on the ledger, charged to
 * the Decision Maker, and each run row carries its equal share so the
 * per-Decision figure on the screen still adds up to the ledger. A request
 * the rule answered has no usage and writes no cost row.
 *
 * Cost goes through `calculateModelCostUsd` like every other call. The two
 * hand-rolled copies elsewhere are recorded debt in the plan; this is not a
 * third.
 */
export const recordRunsInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    subjectKind: v.string(),
    subjectId: v.string(),
    agentRunId: v.optional(v.id("agentRuns")),
    threadId: v.optional(v.id("threads")),
    messageId: v.optional(v.id("messages")),
    usage: v.optional(
      v.object({
        modelId: v.string(),
        providerKey: v.string(),
        providerModelId: v.string(),
        inputTokens: v.number(),
        outputTokens: v.number(),
      }),
    ),
    runs: v.array(runInsertValidator),
  },
  handler: async (ctx, args): Promise<{ runIds: Id<"decisionRuns">[]; costUsd: number }> => {
    const now = Date.now();
    let costUsd = 0;

    if (args.usage && args.runs.length > 0) {
      const rates = await ctx.db
        .query("aiModels")
        .withIndex("by_model_id", (q) => q.eq("modelId", args.usage!.modelId))
        .first();
      costUsd = calculateModelCostUsd({
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        rates: rates ?? null,
      });
      const agentId = await ensureDecisionAgent(ctx);
      await ctx.db.insert("agentTransactions", {
        agentId,
        ...(args.companyId ? { companyId: args.companyId } : {}),
        actionContext: `decision:${args.runs.map((run) => run.decisionKey).join(",")}`,
        modelUsed: args.usage.modelId,
        providerKey: args.usage.providerKey,
        providerModelId: args.usage.providerModelId,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        costUsd,
        status: "SUCCESS",
        createdAt: now,
      });
    }

    const share = args.runs.length > 0 ? costUsd / args.runs.length : 0;
    const links = {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      ...(args.agentRunId ? { agentRunId: args.agentRunId } : {}),
      ...(args.threadId ? { threadId: args.threadId } : {}),
      ...(args.messageId ? { messageId: args.messageId } : {}),
    };

    const runIds: Id<"decisionRuns">[] = [];
    for (const run of args.runs) {
      runIds.push(
        await ctx.db.insert("decisionRuns", {
          ...run,
          ...links,
          subjectKind: args.subjectKind,
          subjectId: args.subjectId,
          costUsd: run.source === "RULES" ? 0 : share,
          createdAt: now,
        }),
      );

      if (run.outcome === "ACTED" && run.action) {
        await ctx.db.insert("auditLogs", {
          actionType: "DECISION_ACTED",
          entityType: "decisions",
          entityId: run.decisionKey,
          ...(args.companyId ? { companyId: args.companyId } : {}),
          timestamp: now,
          metadata: buildDecisionActedAuditMetadata({
            decisionName: getDecision(run.decisionKey)?.name ?? run.decisionKey,
            answer: run.answer,
            certainty: run.certainty ? certaintyWords(run.certainty) : null,
            action: run.action,
            source: run.source,
          }),
        });
      }
    }

    return { runIds, costUsd };
  },
});

export type DecisionRunRow = Doc<"decisionRuns">;

/**
 * How many Decisions this company has given its own mode, for the readiness
 * overview. A bounded read: the registry is small and the rows are per key.
 */
export async function summariseCompanyDecisionModes(ctx: { db: QueryCtx["db"] }, companyId: Id<"companies">) {
  const total = listDecisions().length;
  let setHere = 0;
  for (const decision of listDecisions()) {
    const row = await ctx.db
      .query("decisionSettings")
      .withIndex("by_company_key", (q) => q.eq("companyId", companyId).eq("decisionKey", decision.key))
      .first();
    if (row) setHere += 1;
  }
  return { total, setHere };
}
