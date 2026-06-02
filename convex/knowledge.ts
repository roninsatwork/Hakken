import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { validateSafeUrl } from "./utils/security";
import { validateKnowledgeDocumentMetadata, validateStoredUpload } from "./utils/uploadPolicy";
import { getActiveCompanyId, getCurrentUser, requireAdmin, requireCurrentUser } from "./authz";
import {
  assertCanAccessKnowledgeScope,
  buildKnowledgeChunkRecords,
  buildKnowledgeDocumentRecord,
  canReadThreadKnowledgeDocuments,
  getKnowledgeAuditMetadata,
  getThreadVectorExpirationThreshold,
  isExpiredThreadKnowledgeDocument,
  isWebsiteDocumentUnderRootDomain,
} from "./knowledgeService";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "Unauthorized to upload knowledge base documents.", "Unauthenticated request");

    return await ctx.storage.generateUploadUrl();
  },
});

export const getDocuments = query({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCurrentUser(ctx, "Unauthenticated request");
    
    // Agent-isolated Knowledge Scope (Highest Priority)
    if (args.agentId) {
      if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized");
      }

      if (user.role === "ADMIN") {
        return await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_agent_company", (q) => q.eq("agentId", args.agentId).eq("companyId", getActiveCompanyId(user)))
          .order("desc")
          .take(100);
      }

      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
        .order("desc")
        .take(100);
    }
    
    // Global Knowledge Check
    if (!args.companyId) {
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized access to global knowledge base");
      }
      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_global", (q) => q.eq("companyId", undefined).eq("agentId", undefined).eq("threadId", undefined))
        .order("desc")
        .take(100);
    }

    if (user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || getActiveCompanyId(user) !== args.companyId)) {
        throw new Error("Unauthorized access to company knowledge base");
    }

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", q => q.eq("companyId", args.companyId))
      .filter(q => q.and(
          q.eq(q.field("agentId"), undefined),
          q.eq(q.field("threadId"), undefined)
      ))
      .order("desc")
      .take(100);
  },
});

export const getPaginatedDocuments = query({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCurrentUser(ctx, "Unauthenticated request");

    if (args.agentId) {
      if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized");
      }

      if (user.role === "ADMIN") {
        const activeCompanyId = getActiveCompanyId(user);
        if (!activeCompanyId) return { page: [], isDone: true, continueCursor: "" };

        return await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_agent_company", (q) => q.eq("agentId", args.agentId).eq("companyId", activeCompanyId))
          .order("desc")
          .paginate(args.paginationOpts);
      }

      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (!args.companyId) {
      if (user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized access to global knowledge base");
      }

      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_global", (q) => q.eq("companyId", undefined).eq("agentId", undefined).eq("threadId", undefined))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || getActiveCompanyId(user) !== args.companyId)) {
      throw new Error("Unauthorized access to company knowledge base");
    }

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .filter((q) => q.and(
        q.eq(q.field("agentId"), undefined),
        q.eq(q.field("threadId"), undefined)
      ))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getThreadDocuments = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const thread = await ctx.db.get(args.threadId);
    if (!thread) return [];

    if (!canReadThreadKnowledgeDocuments(thread, current)) return [];

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .order("asc")
      .take(100);
  }
});

export const saveDocument = mutation({
  args: {
    storageId: v.id("_storage"),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    title: v.string(),
    format: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireCurrentUser(ctx, "Unauthenticated request");
    assertCanAccessKnowledgeScope(user, args.companyId);

    await validateStoredUpload(ctx, args.storageId, validateKnowledgeDocumentMetadata);

    const documentId = await ctx.db.insert("knowledgeDocuments", buildKnowledgeDocumentRecord({
      title: args.title,
      fileId: args.storageId,
      status: "processing",
      format: args.format,
      createdBy: userId,
      createdAt: Date.now(),
      companyId: args.companyId,
      agentId: args.agentId,
    }));

    // Trigger off the heavy-duty background action for processing & embeddings
    await ctx.scheduler.runAfter(0, internal.knowledgeActions.ingestDocument, {
      documentId,
      storageId: args.storageId,
    });

    await ctx.db.insert("auditLogs", {
      actionType: "UPLOAD_DOCUMENT",
      actorId: userId,
      entityType: "knowledgeDocuments",
      entityId: documentId,
      timestamp: Date.now(),
      metadata: getKnowledgeAuditMetadata({ title: args.title, format: args.format, scope: args })
    });

    return documentId;
  },
});

export const saveChatDocument = mutation({
  args: {
    storageId: v.id("_storage"),
    threadId: v.id("threads"),
    title: v.string(),
    format: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCurrentUser(ctx, "Unauthenticated request");

    // Secure Gate: Prevent malicious injection by verifying thread ownership
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      throw new Error("Unauthorized access to thread");
    }

    await validateStoredUpload(ctx, args.storageId, validateKnowledgeDocumentMetadata);

    const documentId = await ctx.db.insert("knowledgeDocuments", buildKnowledgeDocumentRecord({
      title: args.title,
      fileId: args.storageId,
      threadId: args.threadId,
      status: "processing",
      format: args.format,
      createdBy: userId,
      createdAt: Date.now(),
    }));

    // Fire ephemeral doc ingestion job
    await ctx.scheduler.runAfter(0, internal.knowledgeActions.ingestDocument, {
      documentId,
      storageId: args.storageId,
    });

    return documentId;
  },
});

export const deleteDocument = mutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireCurrentUser(ctx, "Unauthenticated request");

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    
    // Allow users to delete their own thread-scoped documents
    if (doc.threadId) {
        const thread = await ctx.db.get(doc.threadId);
        if (!thread || thread.userId !== userId) {
            throw new Error("Unauthorized to delete this document");
        }
    } else if (!doc.companyId) {
       if (user.role !== "SUPER_ADMIN") {
         throw new Error("Unauthorized to delete global documents");
       }
    } else {
       if (user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || getActiveCompanyId(user) !== doc.companyId)) {
         throw new Error("Unauthorized");
       }
    }

    // Attempt to delete from convex storage
    if (doc.fileId) {
       await ctx.storage.delete(doc.fileId);
    }

    // Eradicate associated memory chunks in an isolated transaction
    await ctx.scheduler.runAfter(0, internal.knowledge.purgeDocumentChunksInternal, { documentId: doc._id });

    // Delete base document record
    await ctx.db.delete(args.documentId);

    await ctx.db.insert("auditLogs", {
      actionType: "DELETE_DOCUMENT",
      actorId: userId,
      entityType: "knowledgeDocuments",
      entityId: args.documentId,
      timestamp: Date.now(),
      metadata: getKnowledgeAuditMetadata({ title: doc.title, format: doc.format })
    });

    return true;
  }
});

export const getDocInternal = internalQuery({
  args: { id: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
      return await ctx.db.get(args.id);
  }
});

export const getThreadDocumentsInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .order("asc")
      .take(100);
  }
});

export const garbageCollectThreadVectors = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expirationThreshold = getThreadVectorExpirationThreshold();
    
    // Find all thread-scoped documents that have expired
    const expiredDocs = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .filter(q => q.and(
        q.neq(q.field("threadId"), undefined),
        q.lt(q.field("createdAt"), expirationThreshold)
      ))
      .take(100);

    let purgeCount = 0;
    for (const doc of expiredDocs.filter((doc) => isExpiredThreadKnowledgeDocument(doc, expirationThreshold))) {
        if (doc.fileId) {
            await ctx.storage.delete(doc.fileId).catch(() => {});
        }
        await ctx.scheduler.runAfter(0, internal.knowledge.purgeDocumentChunksInternal, { documentId: doc._id });
        await ctx.db.delete(doc._id);
        purgeCount++;
    }
    
    if (purgeCount > 0) {
        console.log(`[Vector GC] Purged ${purgeCount} expired ephemeral thread vectors.`);
    }
  }
});

export const getNextPendingUrlInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
     return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .first();
  }
});

export const saveManualText = mutation({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    title: v.string(),
    textContent: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireCurrentUser(ctx, "Unauthenticated request");
    assertCanAccessKnowledgeScope(user, args.companyId);

    const documentId = await ctx.db.insert("knowledgeDocuments", buildKnowledgeDocumentRecord({
      title: args.title,
      textContent: args.textContent,
      status: "processing",
      format: "text/plain",
      createdBy: userId,
      createdAt: Date.now(),
      companyId: args.companyId,
      agentId: args.agentId,
    }));

    await ctx.scheduler.runAfter(0, internal.knowledgeActions.ingestDocument, {
      documentId,
    });

    await ctx.db.insert("auditLogs", {
      actionType: "UPLOAD_DOCUMENT",
      actorId: userId,
      entityType: "knowledgeDocuments",
      entityId: documentId,
      timestamp: Date.now(),
      metadata: getKnowledgeAuditMetadata({ title: args.title, format: "text/plain", scope: args })
    });

    return documentId;
  },
});

export const queueWebsiteUrls = mutation({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    urls: v.array(v.string()),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireCurrentUser(ctx, "Unauthenticated request");
    assertCanAccessKnowledgeScope(user, args.companyId);

    const docIds = [];
    for (const url of args.urls) {
        // 🛡️ SECURITY: Central SSRF Prevention Shield
        validateSafeUrl(url, "Knowledge Base Import");

        // Simple duplicates check
        const existing = await ctx.db
            .query("knowledgeDocuments")
            .withIndex("by_source_company", (q) => q.eq("sourceUrl", url).eq("companyId", args.companyId).eq("agentId", args.agentId))
            .first();
            
        if (existing) {
             if (args.forceRefresh) {
                 await ctx.db.patch(existing._id, { status: "pending" });
                 docIds.push(existing._id);
             }
             continue;
        }

        const documentId = await ctx.db.insert("knowledgeDocuments", buildKnowledgeDocumentRecord({
          title: url,
          sourceUrl: url,
          status: "pending",
          format: "url",
          createdBy: userId,
          createdAt: Date.now(),
          companyId: args.companyId,
          agentId: args.agentId,
        }));
        docIds.push(documentId);
    }

    if (docIds.length > 0) {
       await ctx.scheduler.runAfter(0, internal.knowledgeActions.processWebsiteQueue);
    }
    
    return docIds;
  },
});

export const deleteWebsiteBulk = mutation({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    rootDomain: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCurrentUser(ctx, "Unauthenticated request");
    assertCanAccessKnowledgeScope(user, args.companyId, "Unauthorized");

    const docs = args.agentId
        ? await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_agent_format", (q) => q.eq("agentId", args.agentId).eq("format", "url"))
          .order("desc")
          .take(500)
        : args.companyId
          ? await ctx.db
            .query("knowledgeDocuments")
            .withIndex("by_company_format", (q) => q.eq("companyId", args.companyId).eq("format", "url"))
            .order("desc")
            .take(500)
          : await ctx.db
            .query("knowledgeDocuments")
            .withIndex("by_global_format", (q) => q.eq("companyId", undefined).eq("agentId", undefined).eq("threadId", undefined).eq("format", "url"))
            .order("desc")
            .take(500);

    let count = 0;
    for (const doc of docs) {
        if (isWebsiteDocumentUnderRootDomain(doc, args.rootDomain)) {
            await ctx.scheduler.runAfter(0, internal.knowledge.purgeDocumentChunksInternal, { documentId: doc._id });
            await ctx.db.delete(doc._id);
            count++;
        }
    }
    return count;
  }
});

export const purgeDocumentChunksInternal = internalMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
     const chunks = await ctx.db.query("knowledgeChunks").withIndex("by_document", q => q.eq("documentId", args.documentId)).take(100);
     for (const chunk of chunks) {
         await ctx.db.delete(chunk._id);
     }
     
     if (chunks.length === 100) {
         await ctx.scheduler.runAfter(0, internal.knowledge.purgeDocumentChunksInternal, { documentId: args.documentId });
     }
  }
});

export const getChunkInternal = internalQuery({
  args: { id: v.id("knowledgeChunks") },
  handler: async (ctx, args) => {
      return await ctx.db.get(args.id);
  }
});

export const saveChunksInternal = internalMutation({
  args: {
      documentId: v.id("knowledgeDocuments"),
      companyId: v.optional(v.id("companies")),
      agentId: v.optional(v.id("agents")),
      threadId: v.optional(v.id("threads")),
      embeddingProviderKey: v.optional(v.string()),
      embeddingModelId: v.optional(v.string()),
      embeddingProviderModelId: v.optional(v.string()),
      embeddingDimensions: v.optional(v.number()),
      chunks: v.array(v.object({
          text: v.string(),
          embedding: v.array(v.number()),
        })),
      replaceExisting: v.optional(v.boolean()),
      markReady: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
      if (args.replaceExisting !== false) {
        const existingChunks = await ctx.db.query("knowledgeChunks").withIndex("by_document", q => q.eq("documentId", args.documentId)).take(500);
        for (const chunk of existingChunks) {
           await ctx.db.delete(chunk._id);
        }
      }

      for (const chunk of buildKnowledgeChunkRecords({
        documentId: args.documentId,
        scope: {
          companyId: args.companyId,
          agentId: args.agentId,
          threadId: args.threadId,
        },
        chunks: args.chunks.map((chunk) => ({
          ...chunk,
          embeddingProviderKey: args.embeddingProviderKey,
          embeddingModelId: args.embeddingModelId,
          embeddingProviderModelId: args.embeddingProviderModelId,
          embeddingDimensions: args.embeddingDimensions,
        })),
      })) {
         await ctx.db.insert("knowledgeChunks", chunk);
      }

      if (args.markReady !== false) {
        await ctx.db.patch(args.documentId, {
            status: "ready",
            embeddingProviderKey: args.embeddingProviderKey,
            embeddingModelId: args.embeddingModelId,
            embeddingProviderModelId: args.embeddingProviderModelId,
            embeddingDimensions: args.embeddingDimensions,
        });
      }
  }
});

export const markDocFailedInternal = internalMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
     await ctx.db.patch(args.documentId, {
         status: "failed"
     });
  }
});

export const debugCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const chunks = await ctx.db.query("knowledgeChunks").take(10000);
    const docs = await ctx.db.query("knowledgeDocuments").take(10000);
    return {
      totalChunks: chunks.length,
      totalDocs: docs.length,
      docsInfo: docs.map(d => ({ id: d._id, title: d.title, format: d.format, status: d.status }))
    };
  }
});
