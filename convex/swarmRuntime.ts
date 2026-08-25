import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { getCurrentUser } from "./authz";
import { canAccessThread } from "./chatService";
import { publicQuery } from "./tenantFunctions";

export const getSwarmLogs = publicQuery({
  reason: "Widget conversations show agent progress; gated on the hashed widget session token.",
  args: { threadId: v.id("threads"), widgetAccessToken: v.optional(v.string()) },
  returns: v.array(v.object({ _id: v.id("swarmLogs"), message: v.string(), status: v.union(v.literal("pending"), v.literal("running"), v.literal("success"), v.literal("error")), isHeading: v.optional(v.boolean()) })),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);

    const thread = await ctx.db.get(args.threadId);
    if (!thread) return [];

    // Swarm logs expose agent reasoning and tool-dispatch traces, so they are
    // gated exactly like thread messages. Anonymous widget threads must present
    // a valid widget session token; this previously allowed unauthenticated
    // reads for any widget thread id.
    if (!(await canAccessThread(ctx, thread, current, args.widgetAccessToken))) {
      return [];
    }

    const logs = await ctx.db
      .query("swarmLogs")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(10000);

    return logs.map((log) => ({
      _id: log._id,
      message: log.message,
      status: log.status,
      ...(log.isHeading !== undefined ? { isHeading: log.isHeading } : {}),
    }));
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
    // Carry the owning thread's tenant onto the log row so swarm logs can be
    // scoped and purged by company without a thread join.
    const thread = await ctx.db.get(args.threadId);

    return await ctx.db.insert("swarmLogs", {
      threadId: args.threadId,
      companyId: thread?.companyId,
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
      .take(10000);
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
    const all = await ctx.db.query("agents").take(10000);
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

