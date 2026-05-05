import { auth } from "./auth";
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

export const getOffsetPaginated = query({
  args: {
    agentId: v.id("agents"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) throw new Error("Unauthorized");
    let rawResults = [];

    let q: any = ctx.db.query("agentLogs");
    
    if (args.searchTerm && args.searchTerm.trim() !== "") {
       q = ctx.db.query("agentLogs").withSearchIndex("search_content", (searchQ) =>
          searchQ.search("promptContent", args.searchTerm!).eq("agentId", args.agentId)
       );
    } else {
       q = ctx.db.query("agentLogs").withIndex("by_agent", (ix) => ix.eq("agentId", args.agentId));
    }

    if (user.role === "ADMIN") {
       if (!user.companyId) throw new Error("Unauthorized");
       q = q.filter((filterQ: any) => filterQ.eq(filterQ.field("companyId"), user.companyId));
    }

    rawResults = await q.take(1000);

    const totalCount = rawResults.length;
    const offset = (args.page - 1) * args.pageSize;
    const pageData = rawResults.slice(offset, offset + args.pageSize);

    return {
      data: pageData,
      totalCount,
      totalPages: Math.ceil(totalCount / args.pageSize),
    };
  },
});

export const seedForAgent = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const interactionTypes = [
      "SYSTEM INSTRUCTION",
      "TOOL DISPATCH: weather",
      "MCP PROXY: get_inbox",
      "LLM SYNTHESIS",
      "ERROR: timeout",
    ];

    const promptExtracts = [
      "User: What is the weather like today in London?",
      "Running internal data fetch for company tenant ID: 1982.",
      "<schema_validation_error> Missing required args.",
      "Check my emails for urgent project updates.",
      "Transcribe the audio and summarize the next steps.",
      "User: Write a polite decline for the invitation."
    ];

    const responseExtracts = [
      '{"functionCall": {"name": "get_weather", "args": {"location": "London"}}}',
      "Fetched 214 rows from the analytics dashboard. Sending back to LLM.",
      "Connection to MCP proxy server timed out after 10000ms.",
      "I've drafted a decline email. Would you like me to send it?",
      "The summary is highly technical. Re-synthesizing for wider audience.",
      '{"functionCall": {"name": "mcp.day_ai.get_inbox", "args": {"limit": 5}}}'
    ];

    // Seed 45 logs to span automatically over 3 pages of 20
    for (let i = 0; i < 45; i++) {
        await ctx.db.insert("agentLogs", {
            agentId: args.agentId,
            interactionType: interactionTypes[Math.floor(Math.random() * interactionTypes.length)],
            promptContent: promptExtracts[Math.floor(Math.random() * promptExtracts.length)],
            responseContent: responseExtracts[Math.floor(Math.random() * responseExtracts.length)],
            createdAt: Date.now() - (i * 1000 * 60 * 15), // Backwards 15 mins apart
        });
    }
  },
});

export const insertAgentLogInternal = internalMutation({
  args: {
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    interactionType: v.string(),
    promptContent: v.string(),
    responseContent: v.string(),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentLogs", {
      agentId: args.agentId,
      threadId: args.threadId,
      interactionType: args.interactionType,
      promptContent: args.promptContent,
      responseContent: args.responseContent,
      companyId: args.companyId,
      createdAt: Date.now(),
    });
  },
});

export const getLogById = query({
  args: { id: v.id("agentLogs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) throw new Error("Unauthorized");
    const log = await ctx.db.get(args.id);
    if (!log) return null;
    
    if (user.role === "ADMIN") {
      if (!user.companyId || log.companyId !== user.companyId) {
        throw new Error("Unauthorized");
      }
    }
    return log;
  },
});

export const deleteLog = mutation({
  args: { id: v.id("agentLogs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) throw new Error("Unauthorized");
    const log = await ctx.db.get(args.id);
    if (!log) throw new Error("Log not found");
    
    if (user.role === "ADMIN") {
      if (!user.companyId || log.companyId !== user.companyId) {
        throw new Error("Unauthorized");
      }
    }
    return await ctx.db.delete(args.id);
  },
});
