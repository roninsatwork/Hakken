import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getSwarmLogs = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return [];

    if (thread.widgetId && !thread.userId) {
       // Allow access
    } else {
       if (!userId || thread.userId !== userId) {
         return [];
       }
    }

    return await ctx.db
      .query("swarmLogs")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});

export const appendSwarmLog = internalMutation({
  args: {
    threadId: v.id("threads"),
    message: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("success"), v.literal("error")),
    order: v.number(),
    isHeading: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("swarmLogs", {
      threadId: args.threadId,
      message: args.message,
      status: args.status,
      order: args.order,
      isHeading: args.isHeading,
      createdAt: Date.now(),
    });
  },
});

export const updateSwarmLogStatus = internalMutation({
  args: {
    logId: v.id("swarmLogs"),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("success"), v.literal("error")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.logId, { status: args.status });
  },
});

export const clearSwarmLogs = internalMutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("swarmLogs")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }
  },
});

export const getDemoAgents = internalQuery({
  args: {},
  handler: async (ctx) => {
    const names = [
      "Market Sourcing Agent", 
      "Internal Platform Architect", 
      "Verification Agent", 
      "Financial Modeler", 
      "Executive Synthesis Agent"
    ];
    const all = await ctx.db.query("agents").collect();
    return names.map(n => all.find(a => a.name === n)).filter(Boolean);
  }
});

export const getCompanyContextForThread = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread || !thread.companyId) return { name: "Unknown Enterprise", systemPrompt: "", companyId: null };
    const company = await ctx.db.get(thread.companyId);
    return { 
      name: company?.name || "Unknown Enterprise",
      systemPrompt: company?.systemPrompt || "",
      companyId: thread.companyId
    };
  }
});


