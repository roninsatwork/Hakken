import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { redactPII } from "./utils/pii";
import { appError } from "./utils/appError";
import { getActiveCompanyId, getCurrentUser } from "./authz";
import { publicMutation, publicQuery, tenantMutation, tenantQuery } from "./tenantFunctions";
import {
  assertCanAccessThread,
  assertWithinMessageRateLimit,
  canAccessThread,
  getThreadMessageDimensions,
  isAnonymousWidgetThread,
  incrementChatQuota,
  isChatQuotaExceeded,
  loadPiiConfig,
  quotaRefusalMessage,
  resolveChatQuota,
  resolveTargetAgentId,
  validateChatAttachments,
} from "./chatService";
import { extractPhotoActionProposal } from "./photoActionService";

const USER_THREAD_MESSAGE_LIMIT = 500;
const AI_CONTEXT_MESSAGE_LIMIT = 40;
const THREAD_DELETE_MESSAGE_BATCH_SIZE = 100;

const safetyRefusalCategoryValidator = v.union(
  v.literal("hidden_instructions"),
  v.literal("permission_bypass"),
  v.literal("cross_tenant_access")
);

const safetyRefusalSourceValidator = v.union(v.literal("assistant"), v.literal("agent"));

/**
 * The sidebar's conversation list, a page at a time.
 *
 * This used to take the newest 100 in one call: conversation 101 silently
 * vanished from both the list and the search box, which only filtered what
 * was already loaded. Now the list pages, and a search term asks the
 * database over the full history instead.
 */
/**
 * The thread fields a conversation list actually renders.
 *
 * The list used to hand back whole thread documents: the company and agent
 * ids, the widget id, the URL the chat started from, and
 * `widgetAccessTokenHash` — the hash a widget session authenticates with.
 * The `by_user` index means a personal history does not in practice hold
 * token-bearing widget threads, so this was drift exposure rather than a live
 * leak, but nothing said so and nothing stopped the next column joining them.
 * The history sidebar reads four fields; those are the four that leave.
 */
const clientThreadValidator = v.object({
  _id: v.id("threads"),
  _creationTime: v.number(),
  title: v.optional(v.string()),
  updatedAt: v.number(),
});

export const getThreads = tenantQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  returns: v.object({
    page: v.array(clientThreadValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const term = args.searchTerm?.trim();

    const results = term
      ? await ctx.db
          .query("threads")
          .withSearchIndex("search_title", (q) => q.search("title", term).eq("userId", userId))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("threads")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc") // newest first
          .paginate(args.paginationOpts);

    return {
      ...results,
      // Eval threads belong to the platform, not to the person who triggered
      // them. They are visible on the agent's eval screen, not in a
      // conversation list somebody scrolls looking for their own chats.
      // Filtered after paging, so a page can run slightly short — better a
      // short page than an eval transcript in a personal history.
      page: results.page
        .filter((thread) => thread.purpose !== "EVAL")
        .map((thread) => ({
          _id: thread._id,
          _creationTime: thread._creationTime,
          title: thread.title,
          updatedAt: thread.updatedAt,
        })),
    };
  },
});

/**
 * The message fields a chat client actually renders.
 *
 * The thread surfaces used to receive whole message documents, which carried
 * token counts, the model and provider that answered, and the runtime's own
 * evidence JSON out to every reader — including anonymous widget visitors. This
 * names what leaves instead, so a field added to the table later has to be added
 * here deliberately before any client can see it.
 */
const clientMessageValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  threadId: v.id("threads"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  createdAt: v.number(),
  systemKey: v.optional(v.string()),
  photoActionProposal: v.optional(
    v.object({ title: v.string(), detail: v.string(), reasoning: v.string() })
  ),
  photoActionTaskId: v.optional(v.id("tasks")),
  isStreaming: v.optional(v.boolean()),
  streamStartedAt: v.optional(v.number()),
  streamUpdatedAt: v.optional(v.number()),
  imageAttachments: v.optional(v.array(v.object({ url: v.string() }))),
});

function toClientMessage(
  message: Doc<"messages">,
  imageAttachments?: Array<{ url: string }>
) {
  return {
    _id: message._id,
    _creationTime: message._creationTime,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(message.systemKey !== undefined ? { systemKey: message.systemKey } : {}),
    ...(message.photoActionProposal !== undefined
      ? { photoActionProposal: message.photoActionProposal }
      : {}),
    ...(message.photoActionTaskId !== undefined
      ? { photoActionTaskId: message.photoActionTaskId }
      : {}),
    ...(message.isStreaming !== undefined ? { isStreaming: message.isStreaming } : {}),
    ...(message.streamStartedAt !== undefined
      ? { streamStartedAt: message.streamStartedAt }
      : {}),
    ...(message.streamUpdatedAt !== undefined
      ? { streamUpdatedAt: message.streamUpdatedAt }
      : {}),
    ...(imageAttachments && imageAttachments.length > 0 ? { imageAttachments } : {}),
  };
}

export const getMessages = publicQuery({
  reason: "Anonymous widget visitors read their own thread; gated on the hashed widget session token.",
  args: { threadId: v.id("threads"), widgetAccessToken: v.optional(v.string()) },
  returns: v.union(v.null(), v.array(clientMessageValidator)),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;

    if (!(await canAccessThread(ctx, thread, current, args.widgetAccessToken))) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc") // chronological order for rendering UI
      .take(USER_THREAD_MESSAGE_LIMIT);

    // Image attachments become viewable here, and only images: a photo is
    // inline evidence and the thread is where it is looked at. Documents keep
    // their existing life as parsed knowledge, no URL exposed.
    return await Promise.all(
      messages.map(async (message) => {
        if (!message.attachments?.length) return toClientMessage(message);
        const images = await Promise.all(
          message.attachments.map(async (fileId) => {
            const metadata = await ctx.db.system.get(fileId);
            if (!metadata?.contentType?.startsWith("image/")) return null;
            const url = await ctx.storage.getUrl(fileId);
            return url ? { url } : null;
          })
        );
        const imageAttachments = images.filter((image): image is { url: string } => image !== null);
        return toClientMessage(message, imageAttachments);
      })
    );
  },
});

/**
 * Note which real phase the assistant run is in, for the pre-reply pill.
 *
 * Written by `generateSonaeResponse` as it enters each phase and cleared when
 * the reply lands or fails, so the pill can only ever claim work that is
 * actually happening. Passing no stage clears it.
 */
export const setAssistantStage = internalMutation({
  args: {
    threadId: v.id("threads"),
    stage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return;
    await ctx.db.patch(args.threadId, {
      assistantStage: args.stage,
      assistantStageAt: args.stage === undefined ? undefined : Date.now(),
    });
  },
});

export const getAssistantStage = publicQuery({
  reason: "Anonymous widget visitors read their own thread's status pill; gated on the hashed widget session token, same as getMessages.",
  args: { threadId: v.id("threads"), widgetAccessToken: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({ stage: v.optional(v.string()), stageAt: v.optional(v.number()) })),
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;

    if (!(await canAccessThread(ctx, thread, current, args.widgetAccessToken))) return null;

    return {
      stage: thread.assistantStage,
      stageAt: thread.assistantStageAt,
    };
  },
});

/**
 * Just enough of a thread to title the header bar.
 *
 * The bar used to repeat "Ask Sonae", which the highlighted sidebar item
 * already says. Naming the conversation costs one small read and tells the
 * reader something they do not already know.
 */
export const getThreadHeading = tenantQuery({
  args: { threadId: v.id("threads") },
  returns: v.union(v.null(), v.object({ title: v.optional(v.string()), updatedAt: v.number() })),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    if (thread.userId !== ctx.userId) return null;

    return { title: thread.title, updatedAt: thread.updatedAt };
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

export const generateChatUploadUrl = tenantMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const createThread = tenantMutation({
  args: {
    agentId: v.optional(v.id("agents")),
  },
  returns: v.id("threads"),
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

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

export const sendMessage = publicMutation({
  reason: "Anonymous widget visitors post to their own thread; gated on the hashed widget session token.",
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    modelId: v.optional(v.string()),
    thinkingLevel: v.optional(v.string()),
    dynamicAgentId: v.optional(v.union(v.id("agents"), v.null())),
    fileIds: v.optional(v.array(v.id("_storage"))),
    widgetAccessToken: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (args.content.length > 10000) {
      throw appError("INVALID_INPUT", "Payload size limit exceeded: Message cannot exceed 10000 characters.");
    }

    // 🛡️ SECURITY: Run Auth and Thread verification BEFORE heavy file metadata lookups
    const current = await getCurrentUser(ctx);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw appError("NOT_FOUND", "Thread not found");
    }

    await assertCanAccessThread(ctx, thread, current, args.widgetAccessToken);

    // Strict upload validation: images can be attached inline, documents can be ingested as thread knowledge.
    await validateChatAttachments(ctx, args.fileIds);

    // 🛡️ SECURITY: Rate Limiting (Prevent Denial of Wallet / Spam)
    // Max 10 user messages per minute per thread
    const rateLimitNow = Date.now();
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_thread_role_created", (q) =>
        q.eq("threadId", args.threadId).eq("role", "user")
      )
      .order("desc")
      .take(10);

    assertWithinMessageRateLimit(recentMessages, rateLimitNow);

    const user = current?.user ?? null;

    const quota = await resolveChatQuota(ctx, user, thread);

    const now = Date.now();

    // -- PII FIREWALL EXTRACTION --
    // Redaction runs before the quota gate on purpose: the refused message is
    // stored too, and refusal must not be the one path that writes an
    // unredacted email address into the transcript.
    const piiConfig = await loadPiiConfig(ctx);
    const safeContent = redactPII(args.content, piiConfig);

    // 3. Evaluate Limit
    if (isChatQuotaExceeded(quota)) {
       const messageDimensions = getThreadMessageDimensions(thread);
       // Sonae Rejection Soft Block
       await ctx.db.insert("messages", {
          threadId: args.threadId,
          role: "user",
          content: safeContent,
          createdAt: now,
          ...messageDimensions,
       });
       await ctx.db.insert("messages", {
          threadId: args.threadId,
          role: "assistant",
          content: quotaRefusalMessage(thread),
          // Lets the widget render this in the visitor's language; the stored
          // English is the fallback for every other reader of the transcript.
          systemKey: "quotaRefusal",
          createdAt: now + 1,
          ...messageDimensions,
       });
       await ctx.db.patch(args.threadId, { updatedAt: now + 1 });
       return true;
    }

    // 4. Increment appropriate tracker since limit passed
    await incrementChatQuota(ctx, quota);

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
    if (isAnonymousWidgetThread(thread) && args.dynamicAgentId !== undefined && targetAgentId !== thread.agentId) {
      throw appError("UNAUTHORIZED", "Unauthorized: Widget conversations cannot switch agents");
    }
    if (args.dynamicAgentId !== undefined && targetAgentId !== thread.agentId) {
        await ctx.db.patch(args.threadId, { agentId: targetAgentId });
    }

    // 3. Trigger the asynchronous AI orchestrator action to respond to this message
    if (targetAgentId) {
       await ctx.scheduler.runAfter(0, internal.agentRuntime.runAgentObjective, {
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
       await ctx.scheduler.runAfter(0, internal.aiChat.generateSonaeResponse, {
         threadId: args.threadId,
         content: safeContent,
         modelId: args.modelId,
         thinkingLevel: args.thinkingLevel,
         fileIds: args.fileIds,
       });
    }

    // 4. If this is exactly "New Conversation", asynchronously spawn a title generator
    if (thread.title === "New Conversation") {
      await ctx.scheduler.runAfter(0, internal.aiChat.generateThreadTitle, {
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
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    companyMemoryEvidenceJson: v.optional(v.string()),
    companyRuntimeEvidenceJson: v.optional(v.string()),
    photoTurn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);

    // Only a turn that actually carried a photo may yield an action proposal —
    // the gate that stops an injected block on an ordinary turn growing a chip.
    const extracted = args.photoTurn
      ? extractPhotoActionProposal(args.content)
      : { content: args.content, proposal: undefined };

    return await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: extracted.content,
      createdAt: Date.now(),
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      modelUsed: args.modelUsed,
      providerKey: args.providerKey,
      providerModelId: args.providerModelId,
      companyMemoryEvidenceJson: args.companyMemoryEvidenceJson,
      companyRuntimeEvidenceJson: args.companyRuntimeEvidenceJson,
      ...(extracted.proposal ? { photoActionProposal: extracted.proposal } : {}),
      ...getThreadMessageDimensions(thread),
    });
  },
});

/**
 * Open a streamed assistant reply.
 *
 * Deliberately called on the *first* text fragment rather than when the run
 * starts. The chat surfaces infer "assistant is thinking" from the last message
 * being the user's, so inserting an empty row up front would replace the
 * thinking indicator with a blank bubble for however long the model takes to
 * produce its first token.
 */
export const startStreamingAssistantMessage = internalMutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    modelUsed: v.optional(v.string()),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);

    return await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: args.content,
      createdAt: Date.now(),
      isStreaming: true,
      streamUpdatedAt: Date.now(),
      streamStartedAt: Date.now(),
      modelUsed: args.modelUsed,
      providerKey: args.providerKey,
      providerModelId: args.providerModelId,
      ...getThreadMessageDimensions(thread),
    });
  },
});

/**
 * Replace the partial text of a streamed reply.
 *
 * Takes the whole accumulated answer rather than a delta so a retried or
 * out-of-order write cannot corrupt the text — the last write always wins with
 * the correct value.
 */
export const appendStreamingAssistantMessage = internalMutation({
  args: { messageId: v.id("messages"), content: v.string() },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    // The row can legitimately be gone if the thread was deleted mid-run.
    if (!message || !message.isStreaming) return;

    await ctx.db.patch(args.messageId, {
      content: args.content,
      streamUpdatedAt: Date.now(),
    });
  },
});

/**
 * Close a streamed reply.
 *
 * Clearing `isStreaming` is what stops the caret, so every path out of a run —
 * success, budget stop, provider failure — must reach this. A reply left marked
 * as streaming is shown as stalled once it ages out; see `streamingService`.
 */
export const finishStreamingAssistantMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    modelUsed: v.optional(v.string()),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    companyMemoryEvidenceJson: v.optional(v.string()),
    companyRuntimeEvidenceJson: v.optional(v.string()),
    photoTurn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return;

    // Same gate as saveAssistantMessage: the streamed reader may glimpse the
    // raw block for a moment, but the closing write is authoritative and
    // stores it as structured data instead.
    const extracted = args.photoTurn
      ? extractPhotoActionProposal(args.content)
      : { content: args.content, proposal: undefined };

    await ctx.db.patch(args.messageId, {
      content: extracted.content,
      isStreaming: false,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      modelUsed: args.modelUsed,
      providerKey: args.providerKey,
      providerModelId: args.providerModelId,
      companyMemoryEvidenceJson: args.companyMemoryEvidenceJson,
      companyRuntimeEvidenceJson: args.companyRuntimeEvidenceJson,
      ...(extracted.proposal ? { photoActionProposal: extracted.proposal } : {}),
    });
  },
});

export const saveAssistantSafetyRefusal = internalMutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
    category: safetyRefusalCategoryValidator,
    source: safetyRefusalSourceValidator,
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    const now = Date.now();

    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: args.content,
      createdAt: now,
      ...getThreadMessageDimensions(thread),
    });

    if (thread?.userId) {
      await ctx.db.insert("auditLogs", {
        actionType: "ASSISTANT_SAFETY_REFUSAL",
        actorId: thread.userId,
        entityType: "threads",
        entityId: args.threadId,
        companyId: thread.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          category: args.category,
          source: args.source,
        }),
      });
    }
  },
});

export const deleteThread = tenantMutation({
  args: {
    threadId: v.id("threads"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
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

export const renameThread = tenantMutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
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

const VOICE_TURN_MAX_LENGTH = 4000;

/**
 * What was said, kept like any other conversation.
 *
 * The realtime model answers in audio directly, so nothing goes through
 * `sendMessage` — asking that to record the turn would start a second,
 * written reply to a question already answered aloud. This writes the pair
 * the session heard, so closing the overlay leaves a readable transcript in
 * the thread under the usual retention and audit rules.
 */
export const recordVoiceTurn = tenantMutation({
  args: {
    threadId: v.id("threads"),
    userText: v.string(),
    assistantText: v.string(),
    modelUsed: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw appError("NOT_FOUND", "Thread not found");
    const current = await getCurrentUser(ctx);
    await assertCanAccessThread(ctx, thread, current, undefined);

    const userText = args.userText.trim().slice(0, VOICE_TURN_MAX_LENGTH);
    const assistantText = args.assistantText.trim().slice(0, VOICE_TURN_MAX_LENGTH);
    if (!userText && !assistantText) return null;

    const now = Date.now();
    const dimensions = {
      ...(thread.companyId ? { companyId: thread.companyId } : {}),
      ...(thread.userId ? { userId: thread.userId } : {}),
    };

    if (userText) {
      await ctx.db.insert("messages", {
        threadId: args.threadId,
        role: "user",
        content: userText,
        createdAt: now,
        ...dimensions,
      });
    }
    if (assistantText) {
      await ctx.db.insert("messages", {
        threadId: args.threadId,
        role: "assistant",
        content: assistantText,
        createdAt: now + 1,
        ...(args.modelUsed ? { modelUsed: args.modelUsed } : {}),
        providerKey: "openai",
        ...dimensions,
      });
    }

    await ctx.db.patch(args.threadId, { updatedAt: now });
    return null;
  },
});

/**
 * What kind of files a message carries, read from storage's own metadata.
 * The model router asks this before spending anything: a photo must reach a
 * model that can see, and the stored content type is the truth about that.
 */
export const getAttachmentContentTypesInternal = internalQuery({
  args: { fileIds: v.array(v.id("_storage")) },
  handler: async (ctx, args): Promise<Array<string | null>> => {
    const metadata = await Promise.all(args.fileIds.map((fileId) => ctx.db.system.get(fileId)));
    return metadata.map((entry) => entry?.contentType ?? null);
  },
});

/**
 * A plain sentence from the platform itself — used when a message cannot be
 * processed at all (an image on a deployment with no vision-capable model)
 * and silence would read as the assistant ignoring the user.
 */
export const saveAssistantNoticeInternal = internalMutation({
  args: { threadId: v.id("threads"), content: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const thread = await ctx.db.get(args.threadId);
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "assistant",
      content: args.content,
      createdAt: Date.now(),
      ...getThreadMessageDimensions(thread),
    });
    await ctx.db.patch(args.threadId, { updatedAt: Date.now() });
  },
});
