import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const getForAgent = query({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentTransactions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getStatsForAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const txs = await ctx.db
      .query("agentTransactions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
      
    const totalGenerations = txs.length;
    let totalTokensIngested = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalOpexCost = 0;

    for (const tx of txs) {
       totalTokensIngested += (tx.inputTokens || 0) + (tx.outputTokens || 0);
       totalInputTokens += (tx.inputTokens || 0);
       totalOutputTokens += (tx.outputTokens || 0);
       totalOpexCost += (tx.costGBP || 0);
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
export const seedForAgent = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .first();
    
    if (!user) throw new Error("User not found");

    // Generate 15 dummy transactions
    const actions = ["Document Summarization", "Search Intent Analysis", "Competitor Data Aggregation", "Email Drafting", "Code Review"];
    const activeModels = await ctx.db.query("aiModels").collect();
    const modelMap = new Map(activeModels.map(m => [m.modelId, m]));
    const defaultModelObj = activeModels.find((m: any) => m.isDefault);
    const defaultModelId = defaultModelObj ? defaultModelObj.modelId : "gemini-1.5-flash";
    const models = activeModels.length > 0 ? activeModels.map(m => m.modelId) : [defaultModelId];
    
    for (let i = 0; i < 15; i++) {
        const inputTokens = Math.floor(Math.random() * 8000) + 200;
        const outputTokens = Math.floor(Math.random() * 1500) + 50;
        const model = models[Math.floor(Math.random() * models.length)];
        
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
            costGBP: cost,
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
    inputTokens: v.number(),
    outputTokens: v.number(),
    costGBP: v.number(),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentTransactions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
