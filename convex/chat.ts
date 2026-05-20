import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { redactPII } from "./utils/pii";

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
      .take(10000);
  },
});

export const getMessages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;

    // Zero-Trust Enforcer: Allow anonymous capability-based access ONLY if it's a widget thread with no owner.
    if (thread.widgetId && !thread.userId) {
      // Access granted via unguessable ID, but must verify widget is active
      const widget = await ctx.db.get(thread.widgetId);
      if (!widget || !widget.isActive) return null;
    } else {
      // Standard strict authentication for internal threads
      if (!userId || thread.userId !== userId) {
        return null;
      }
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc") // chronological order for rendering UI
      .take(10000);
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
      .take(10000);
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
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    return await ctx.storage.generateUploadUrl();
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
    const activeCompanyId = user?.impersonatingCompanyId || user?.companyId;
    
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
    const userId = await getAuthUserId(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error("Thread not found");
    }

    // Zero-Trust Enforcer: Allow anonymous capability-based write ONLY if it's a widget thread with no owner.
    if (thread.widgetId && !thread.userId) {
      // Access granted via unguessable ID, but must verify widget is active
      const widget = await ctx.db.get(thread.widgetId);
      if (!widget || !widget.isActive) throw new Error("Unauthorized: Widget is inactive");
    } else {
      // Standard strict authentication for internal threads
      if (!userId || thread.userId !== userId) {
        throw new Error("Unauthorized");
      }
    }

    // 🛡️ SECURITY: Strict real-time widget visitor upload validation (Option B)
    if (args.fileIds && args.fileIds.length > 0) {
      const maxBytes = 1024 * 1024; // 1MB
      for (const storageId of args.fileIds) {
        let metadata = null;
        try {
          metadata = await ctx.storage.getMetadata(storageId);
        } catch (e: any) {
          // Fall back to mock table if getMetadata throws or is unsupported in tests
        }

        if (!metadata && process.env.IS_TEST === "true") {
          const mock = await ctx.db
            .query("mockStorageMetadata")
            .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
            .first();
          metadata = mock ? { size: mock.size, contentType: mock.contentType } : null;
        }

        if (!metadata) {
          throw new Error("Attached file not found in storage");
        }

        // Validate size (< 1MB)
        if (metadata.size > maxBytes) {
          try {
            await ctx.storage.delete(storageId);
          } catch (e: any) {
            // Handle test environment lacking storage delete syscall
          }
          if (process.env.IS_TEST === "true") {
            const mock = await ctx.db
              .query("mockStorageMetadata")
              .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
              .first();
            if (mock) {
              await ctx.db.delete(mock._id);
            }
          }
          throw new Error("File exceeds the maximum size limit of 1MB");
        }

        // Validate MIME type (must be image)
        if (!metadata.contentType || !metadata.contentType.startsWith("image/")) {
          try {
            await ctx.storage.delete(storageId);
          } catch (e: any) {
            // Handle test environment lacking storage delete syscall
          }
          if (process.env.IS_TEST === "true") {
            const mock = await ctx.db
              .query("mockStorageMetadata")
              .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
              .first();
            if (mock) {
              await ctx.db.delete(mock._id);
            }
          }
          throw new Error("Invalid file type: strictly images only are allowed");
        }
      }
    }

    // 🛡️ SECURITY: Rate Limiting (Prevent Denial of Wallet / Spam)
    // Max 10 user messages per minute per thread
    const oneMinuteAgo = Date.now() - 60000;
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(15); // Only need to look at the last 15 to find 10 user messages

    const recentUserMessages = recentMessages.filter(m => m.role === "user" && m.createdAt >= oneMinuteAgo);
    
    if (recentUserMessages.length >= 10) {
      throw new Error("429 Too Many Requests: Please wait a moment before sending more messages.");
    }

    let user = null;
    if (userId) {
       user = await ctx.db.get(userId);
       if (!user && !thread.widgetId) throw new Error("Unauthorized");
    }

    let messagesUsed = 0;
    let messageLimit = -1; // -1 represents unlimited
    let isUserOverride = false;
    const resolvingCompanyId = user?.impersonatingCompanyId || user?.companyId || thread.companyId;
    
    // 1. Check User Override
    if (user?.planOverrideId) {
       const userPlan = await ctx.db.get(user.planOverrideId);
       if (userPlan) {
           messageLimit = userPlan.messageLimit;
           messagesUsed = user.messagesUsedThisPeriod || 0;
           isUserOverride = true;
       }
    }
    // 2. Check Company Pool
    else if (resolvingCompanyId) {
       const company = await ctx.db.get(resolvingCompanyId);
       if (company && company.planId) {
           const companyPlan = await ctx.db.get(company.planId);
           if (companyPlan) {
               messageLimit = companyPlan.messageLimit;
               messagesUsed = company.messagesUsedThisPeriod || 0;
           }
       }
    }

    const now = Date.now();

    // 3. Evaluate Limit
    if (messageLimit !== -1 && messagesUsed >= messageLimit) {
       // Sonae Rejection Soft Block
       await ctx.db.insert("messages", {
          threadId: args.threadId,
          role: "user",
          content: args.content,
          createdAt: now,
       });
       await ctx.db.insert("messages", {
          threadId: args.threadId,
          role: "assistant",
          content: "I apologise, but your company has exhausted its AI allocation for this period. Please ask your administrator to review your plan.",
          createdAt: now + 1,
       });
       await ctx.db.patch(args.threadId, { updatedAt: now + 1 });
       return true;
    }

    // 4. Increment appropriate tracker since limit passed
    if (isUserOverride && userId) {
        await ctx.db.patch(userId, { messagesUsedThisPeriod: messagesUsed + 1 });
    } else if (resolvingCompanyId) {
        await ctx.db.patch(resolvingCompanyId, { messagesUsedThisPeriod: messagesUsed + 1 });
    }

    // -- PII FIREWALL EXTRACTION --
    const piiConfigEntry = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PII_REDACTION_CONFIG"))
      .first();
      
    let piiConfig = { enabled: false, maskEmails: true, maskCreditCards: true, maskPhones: false, maskNinos: true };
    if (piiConfigEntry && piiConfigEntry.value) {
        piiConfig = JSON.parse(piiConfigEntry.value);
    }
    
    // Execute Auto-redaction logic masking sensitive data synchronously
    const safeContent = redactPII(args.content, piiConfig as any);

    // 1. Insert User Message
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "user",
      content: safeContent,
      createdAt: now,
      attachments: args.fileIds,
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
    
    // -- PII FIREWALL EXTRACTION (OUTBOUND) --
    const piiConfigEntry = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PII_REDACTION_CONFIG"))
      .first();
      
    let piiConfig = { enabled: false, maskEmails: true, maskCreditCards: true, maskPhones: false, maskNinos: true };
    if (piiConfigEntry && piiConfigEntry.value) {
        piiConfig = JSON.parse(piiConfigEntry.value);
    }
    
    const safeContent = redactPII(args.content, piiConfig as any);

    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: safeContent,
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
      .take(10000);
      
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
