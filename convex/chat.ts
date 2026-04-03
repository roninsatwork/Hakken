import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const getThreads = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc") // newest first
      .collect();
  },
});

export const getMessages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      return null;
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc") // chronological order for rendering UI
      .collect();
  },
});

export const getMessagesForAI = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    // Unchecked auth: This is completely secure because internalQuery can strictly ONLY be invoked by our own verified backend Actions, bypassing the dropped Edge auth context.
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});

export const getThreadInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const createThread = mutation({
  args: {
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    
    const user = await ctx.db.get(userId);

    const now = Date.now();
    
    const threadId = await ctx.db.insert("threads", {
      userId,
      companyId: user?.companyId,
      agentId: args.agentId,
      title: "New Conversation",
      createdAt: now,
      updatedAt: now,
    });

    return threadId;
  },
});

export const sendMessage = mutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    modelId: v.optional(v.string()),
    thinkingLevel: v.optional(v.string()),
    dynamicAgentId: v.optional(v.union(v.id("agents"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();

    // 1. Insert User Message
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "user",
      content: args.content,
      createdAt: now,
    });

    // 2. Update Thread timestamp
    await ctx.db.patch(args.threadId, { updatedAt: now });

    // Determine if we need to hot-swap the agent mid-conversation
    let targetAgentId = thread.agentId;
    if (args.dynamicAgentId !== undefined) {
        targetAgentId = args.dynamicAgentId === null ? undefined : args.dynamicAgentId;
        if (targetAgentId !== thread.agentId) {
             await ctx.db.patch(args.threadId, { agentId: targetAgentId });
        }
    }

    // 3. Trigger the asynchronous Vertex AI Orchestrator Action to respond to this message
    if (targetAgentId) {
       await ctx.scheduler.runAfter(0, internal.agentRuntime.generateAgentResponse, {
         threadId: args.threadId,
         agentId: targetAgentId,
         content: args.content,
       });
    } else {
       await ctx.scheduler.runAfter(0, internal.ai.generateSonaeResponse, {
         threadId: args.threadId,
         content: args.content,
         modelId: args.modelId,
         thinkingLevel: args.thinkingLevel,
       });
    }

    // 4. If this is exactly "New Conversation", asynchronously spawn a title generator
    if (thread.title === "New Conversation") {
      await ctx.scheduler.runAfter(0, internal.ai.generateThreadTitle, {
        threadId: args.threadId,
        content: args.content,
      });
    }

    return true;
  },
});

export const saveAssistantMessage = internalMutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    modelUsed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: args.content,
      createdAt: Date.now(),
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      modelUsed: args.modelUsed
    });
  },
});

export const deleteThread = mutation({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized Sonae Deletion");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Cascade: Retrieve and eradicate all intelligence messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
      
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // 2. Eradicate thread root
    await ctx.db.delete(args.threadId);
    
    return true;
  },
});

export const renameThread = mutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.threadId, {
      title: args.title.trim() === "" ? "Untitled Conversation" : args.title.trim(),
      updatedAt: Date.now(),
    });

    return true;
  },
});

export const renameThreadInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    // Internal mutations bypass the Edge auth layer, so no user validation is required
    await ctx.db.patch(args.threadId, {
      title: args.title.trim() === "" ? "Untitled Conversation" : args.title.trim(),
      updatedAt: Date.now(),
    });

    return true;
  },
});
