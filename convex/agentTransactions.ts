import { auth } from "./auth";
import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const getForAgent = query({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) throw new Error("Unauthorized");
    const baseQuery = ctx.db
      .query("agentTransactions")
      .withIndex("by_agent", (ix) => ix.eq("agentId", args.agentId));
      
    if (user.role === "ADMIN") {
      if (!user.companyId) throw new Error("Unauthorized");
      return await baseQuery
        .filter((filterQ) => filterQ.eq(filterQ.field("companyId"), user.companyId))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await baseQuery.order("desc").paginate(args.paginationOpts);
  },
});

export const getStatsForAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) throw new Error("Unauthorized");
    const baseQuery = ctx.db
      .query("agentTransactions")
      .withIndex("by_agent", (ix) => ix.eq("agentId", args.agentId));
      
    const txs = await (user.role === "ADMIN"
      ? (() => {
      if (!user.companyId) throw new Error("Unauthorized");
      return baseQuery
        .filter((filterQ) => filterQ.eq(filterQ.field("companyId"), user.companyId))
        .take(10000);
    })()
      : baseQuery.take(10000));
      
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
export const seedForAgent = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) throw new Error("Unauthorized");

    // Generate 15 dummy transactions
    const actions = ["Document Summarization", "Search Intent Analysis", "Competitor Data Aggregation", "Email Drafting", "Code Review"];
    const activeModels = await ctx.db.query("aiModels").take(10000);
    const modelMap = new Map(activeModels.map(m => [m.modelId, m]));
    const defaultModelObj = activeModels.find((m) => m.isDefault);
    const defaultModelId = defaultModelObj ? defaultModelObj.modelId : "gemini-2.5-flash";
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
