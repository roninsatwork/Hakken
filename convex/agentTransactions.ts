import { v } from "convex/values";
import { internalMutation, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DECISION_AGENT_SYSTEM_KEY } from "./decisionRuns";
import { decisionCallRows, type DecisionCall } from "./decisionLedger";
import { paginationOptsValidator } from "convex/server";
import { adminQuery } from "./tenantFunctions";
import * as tailShapes from "./utils/tailShapes";
import { requireAdmin } from "./authz";
import { getDefaultModelId, getExecutionModelPool } from "./aiModelService";
import { appError } from "./utils/appError";

const AGENT_TRANSACTION_STATS_LIMIT = 1000;
const MODEL_SEED_CATALOG_LIMIT = 500;

/**
 * The Decision Maker's calls travel on its Decisions' rows, not on cost rows
 * (`decisionLedger.ts`; core-data-normalisation-plan.md §7.1): its page reads
 * them there, in the same shape.
 */
async function isDecisionMaker(ctx: QueryCtx, agentId: Id<"agents">): Promise<boolean> {
  return (await ctx.db.get(agentId))?.systemKey === DECISION_AGENT_SYSTEM_KEY;
}

/** The Decision Maker's calls, newest first: a company admin's own company's, a super admin's every one. */
function decisionCallsQuery(ctx: QueryCtx, companyId: Id<"companies"> | undefined) {
  const runs = companyId
    ? ctx.db.query("decisionRuns").withIndex("by_company_created", (q) => q.eq("companyId", companyId))
    : ctx.db.query("decisionRuns").withIndex("by_createdAt");
  return runs.order("desc").filter((q) => q.neq(q.field("model"), undefined));
}

function adminCompany(user: { role?: string; companyId?: Id<"companies"> }): Id<"companies"> | undefined {
  if (user.role !== "ADMIN") return undefined;
  if (!user.companyId) throw appError("UNAUTHORIZED", "Unauthorized");
  return user.companyId;
}

export const getForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
  },
  returns: tailShapes.agentTransactionPageShape,
  handler: async (ctx, args) => {
    const { user } = ctx;
    const companyId = adminCompany(user);
    if (await isDecisionMaker(ctx, args.agentId)) {
      const page = await decisionCallsQuery(ctx, companyId).paginate(args.paginationOpts);
      return { ...page, page: await decisionCallRows(ctx, page.page as DecisionCall[], args.agentId) };
    }

    const baseQuery = ctx.db
      .query("agentTransactions")
      .withIndex("by_agent", (ix) => ix.eq("agentId", args.agentId));
    if (companyId) {
      return await baseQuery
        .filter((filterQ) => filterQ.eq(filterQ.field("companyId"), companyId))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await baseQuery.order("desc").paginate(args.paginationOpts);
  },
});

export const getStatsForAgent = adminQuery({
  args: { agentId: v.id("agents") },
  returns: tailShapes.agentTransactionStatsShape,
  handler: async (ctx, args) => {
    const { user } = ctx;
    const companyId = adminCompany(user);
    let txs: Array<{ inputTokens: number; outputTokens: number; costUsd: number }>;
    if (await isDecisionMaker(ctx, args.agentId)) {
      const calls = await decisionCallsQuery(ctx, companyId).take(AGENT_TRANSACTION_STATS_LIMIT);
      txs = await decisionCallRows(ctx, calls as DecisionCall[], args.agentId);
    } else {
      const baseQuery = ctx.db
        .query("agentTransactions")
        .withIndex("by_agent", (ix) => ix.eq("agentId", args.agentId));
      txs = await (companyId
        ? baseQuery.filter((filterQ) => filterQ.eq(filterQ.field("companyId"), companyId)).take(AGENT_TRANSACTION_STATS_LIMIT)
        : baseQuery.take(AGENT_TRANSACTION_STATS_LIMIT));
    }

    const totalGenerations = txs.length;
    let totalTokensIngested = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalOpexCost = 0;

    for (const tx of txs) {
       totalTokensIngested += (tx.inputTokens || 0) + (tx.outputTokens || 0);
       totalInputTokens += (tx.inputTokens || 0);
       totalOutputTokens += (tx.outputTokens || 0);
       totalOpexCost += (tx.costUsd || 0);
    }

    return {
       totalGenerations,
       totalTokensIngested,
       totalInputTokens,
       totalOutputTokens,
       totalOpexCost
    };
  },
});

// Seed data mutation for testing
export const seedForAgent = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx);

    // Generate 15 dummy transactions
    const actions = ["Document Summarization", "Search Intent Analysis", "Competitor Data Aggregation", "Email Drafting", "Code Review"];
    const activeModels = await ctx.db.query("aiModels").take(MODEL_SEED_CATALOG_LIMIT);
    const modelMap = new Map(activeModels.map(m => [m.modelId, m]));
    const models = getExecutionModelPool(activeModels);
    
    for (let i = 0; i < 15; i++) {
        const inputTokens = Math.floor(Math.random() * 8000) + 200;
        const outputTokens = Math.floor(Math.random() * 1500) + 50;
        const model = models[Math.floor(Math.random() * models.length)] ?? getDefaultModelId(activeModels);
        
        const config = modelMap.get(model);
        const inRate = config ? (inputTokens > 200000 ? (config.standardInputCostAbove200k || 0) : (config.standardInputCostBelow200k || 0)) : 0;
        const outRate = config ? (config.outputResponseCost || 0) : 0;
        const cost = (inputTokens / 1000000) * inRate + (outputTokens / 1000000) * outRate;

        await ctx.db.insert("agentTransactions", {
            agentId: args.agentId,
            userId: user._id,
            actionContext: actions[Math.floor(Math.random() * actions.length)],
            inputTokens,
            outputTokens,
            modelUsed: model,
            costUsd: cost,
            status: Math.random() > 0.1 ? "SUCCESS" : "FAILED",
            createdAt: Date.now() - (i * 1000 * 60 * 60 * 4), // Spread over last few days
        });
    }
  },
});

export const insertTransactionInternal = internalMutation({
  args: {
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    actionContext: v.string(),
    modelUsed: v.string(),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    isRehearsal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentTransactions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
