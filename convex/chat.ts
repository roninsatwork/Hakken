import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { redactPII } from "./utils/pii";
import { getActiveCompanyId, getCurrentUser, requireCurrentUser } from "./authz";
import {
  assertCanAccessThread,
  assertWithinMessageRateLimit,
  canAccessThread,
  incrementChatQuota,
  isChatQuotaExceeded,
  loadPiiConfig,
  resolveChatQuota,
  resolveTargetAgentId,
  validateChatAttachments,
} from "./chatService";

const USER_THREAD_LIST_LIMIT = 100;
const USER_THREAD_MESSAGE_LIMIT = 500;
const AI_CONTEXT_MESSAGE_LIMIT = 40;
const THREAD_DELETE_MESSAGE_BATCH_SIZE = 100;

function getThreadMessageDimensions(thread: Doc<"threads"> | null) {
  return {
    companyId: thread?.companyId,
    userId: thread?.userId,
    agentId: thread?.agentId,
    widgetId: thread?.widgetId,
    analyticsDimensionsVersion: 1,
  };
}

export const getThreads = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireCurrentUser(ctx, "Unauthorized");

    return await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc") // newest first
      .take(USER_THREAD_LIST_LIMIT);
  },
});

export const getMessages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;

    if (!(await canAccessThread(ctx, thread, current))) return null;

    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc") // chronological order for rendering UI
      .take(USER_THREAD_MESSAGE_LIMIT);
  },
});

export const getMessagesForAI = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    // Unchecked auth: This is completely secure because internalQuery can strictly ONLY be invoked by our own verified backend Actions, bypassing the dropped Edge auth context.
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(AI_CONTEXT_MESSAGE_LIMIT);

    return recentMessages.reverse();
  },
});

export const getThreadInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const generateChatUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCurrentUser(ctx, "Unauthorized");
    return await ctx.storage.generateUploadUrl();
  },
});

export const createThread = mutation({
  args: {
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireCurrentUser(ctx, "Unauthorized");

    const now = Date.now();
    const activeCompanyId = getActiveCompanyId(user);
    
    const threadId = await ctx.db.insert("threads", {
      userId,
      companyId: activeCompanyId,
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
    fileIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    if (args.content.length > 10000) {
      throw new Error("Payload size limit exceeded: Message cannot exceed 10000 characters.");
    }

    // 🛡️ SECURITY: Run Auth and Thread verification BEFORE heavy file metadata lookups
    const current = await getCurrentUser(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    await assertCanAccessThread(ctx, thread, current);

    // Strict upload validation: images can be attached inline, documents can be ingested as thread knowledge.
    await validateChatAttachments(ctx, args.fileIds);

    // 🛡️ SECURITY: Rate Limiting (Prevent Denial of Wallet / Spam)
    // Max 10 user messages per minute per thread
    const rateLimitNow = Date.now();
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(15); // Only need to look at the last 15 to find 10 user messages

    assertWithinMessageRateLimit(recentMessages, rateLimitNow);

    const user = current?.user ?? null;

    const quota = await resolveChatQuota(ctx, user, thread);

    const now = Date.now();

    // 3. Evaluate Limit
    if (isChatQuotaExceeded(quota)) {
       const messageDimensions = getThreadMessageDimensions(thread);
       // Sonae Rejection Soft Block
       await ctx.db.insert("messages", {
          threadId: args.threadId,
          role: "user",
          content: args.content,
          createdAt: now,
          ...messageDimensions,
       });
       await ctx.db.insert("messages", {
          threadId: args.threadId,
          role: "assistant",
          content: "I apologise, but your company has exhausted its AI allocation for this period. Please ask your administrator to review your plan.",
          createdAt: now + 1,
          ...messageDimensions,
       });
       await ctx.db.patch(args.threadId, { updatedAt: now + 1 });
       return true;
    }

    // 4. Increment appropriate tracker since limit passed
    await incrementChatQuota(ctx, quota);

    // -- PII FIREWALL EXTRACTION --
    const piiConfig = await loadPiiConfig(ctx);
    
    // Execute Auto-redaction logic masking sensitive data synchronously
    const safeContent = redactPII(args.content, piiConfig);

    // 1. Insert User Message
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "user",
      content: safeContent,
      createdAt: now,
      attachments: args.fileIds,
      ...getThreadMessageDimensions(thread),
    });

    // 2. Update Thread timestamp
    await ctx.db.patch(args.threadId, { updatedAt: now });

    // Determine if we need to hot-swap the agent mid-conversation
    const targetAgentId = resolveTargetAgentId(thread.agentId, args.dynamicAgentId);
    if (args.dynamicAgentId !== undefined && targetAgentId !== thread.agentId) {
        await ctx.db.patch(args.threadId, { agentId: targetAgentId });
    }

    // 3. Trigger the asynchronous Vertex AI Orchestrator Action to respond to this message
    if (targetAgentId) {
       await ctx.scheduler.runAfter(0, internal.agentRuntime.generateAgentResponse, {
         threadId: args.threadId,
         agentId: targetAgentId,
         content: safeContent,
         fileIds: args.fileIds,
       });
    } else if (args.thinkingLevel === "SWARM") {
       await ctx.scheduler.runAfter(0, internal.swarmActions.executeSwarmObjective, {
         threadId: args.threadId,
         content: safeContent,
       });
    } else {
       await ctx.scheduler.runAfter(0, internal.ai.generateSonaeResponse, {
         threadId: args.threadId,
         content: safeContent,
         modelId: args.modelId,
         thinkingLevel: args.thinkingLevel,
         fileIds: args.fileIds,
       });
    }

    // 4. If this is exactly "New Conversation", asynchronously spawn a title generator
    if (thread.title === "New Conversation") {
      await ctx.scheduler.runAfter(0, internal.ai.generateThreadTitle, {
        threadId: args.threadId,
        content: safeContent,
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
    const thread = await ctx.db.get(args.threadId);

    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: args.content,
      createdAt: Date.now(),
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      modelUsed: args.modelUsed,
      ...getThreadMessageDimensions(thread),
    });
  },
});

export const deleteThread = mutation({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCurrentUser(ctx, "Unauthorized Sonae Deletion");

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Cascade: Retrieve and eradicate all intelligence messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .take(THREAD_DELETE_MESSAGE_BATCH_SIZE);
      
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
    const { userId } = await requireCurrentUser(ctx, "Unauthorized");

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
