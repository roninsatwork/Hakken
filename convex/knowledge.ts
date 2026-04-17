import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { auth } from "./auth";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    // Secure Gate: Check if user is an admin or super admin
    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      throw new Error("Unauthorized to upload knowledge base documents.");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

export const getDocuments = query({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    
    // Agent-isolated Knowledge Scope (Highest Priority)
    if (args.agentId) {
      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_agent", q => q.eq("agentId", args.agentId))
        .order("desc")
        .collect();
    }
    
    // Global Knowledge Check
    if (!args.companyId) {
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized access to global knowledge base");
      }
      return await ctx.db
        .query("knowledgeDocuments")
        .filter(q => q.and(
            q.eq(q.field("companyId"), undefined),
            q.eq(q.field("agentId"), undefined)
        ))
        .order("desc")
        .collect();
    }

    if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== args.companyId)) {
        throw new Error("Unauthorized access to company knowledge base");
    }

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", q => q.eq("companyId", args.companyId))
      .filter(q => q.eq(q.field("agentId"), undefined))
      .order("desc")
      .collect();
  },
});

export const getThreadDocuments = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return []; // Fallback empty for anonymous/edge cases

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_thread", q => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    
    if (!args.companyId) {
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized access to global knowledge base");
      }
    } else {
      if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== args.companyId)) {
          throw new Error("Unauthorized");
      }
    }

    const documentId = await ctx.db.insert("knowledgeDocuments", {
      title: args.title,
      fileId: args.storageId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      ...(args.agentId ? { agentId: args.agentId } : {}),
      status: "processing",
      format: args.format,
      createdBy: userId,
      createdAt: Date.now(),
    });

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
      metadata: JSON.stringify({ title: args.title, format: args.format, scope: args.companyId ? "company" : args.agentId ? "agent" : "global" })
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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    // Secure Gate: Prevent malicious injection by verifying thread ownership
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.userId !== userId) {
      throw new Error("Unauthorized access to thread");
    }

    const documentId = await ctx.db.insert("knowledgeDocuments", {
      title: args.title,
      fileId: args.storageId,
      threadId: args.threadId,
      status: "processing",
      format: args.format,
      createdBy: userId,
      createdAt: Date.now(),
    });

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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");

    const user = await ctx.db.get(userId);
    
    if (!doc.companyId) {
       if (!user || user.role !== "SUPER_ADMIN") {
         throw new Error("Unauthorized to delete global documents");
       }
    } else {
       if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== doc.companyId)) {
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
      metadata: JSON.stringify({ title: doc.title, format: doc.format })
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
      .collect();
  }
});

export const garbageCollectThreadVectors = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 24 Hours in milliseconds
    const expirationThreshold = Date.now() - 24 * 60 * 60 * 1000;
    
    // Find all thread-scoped documents that have expired
    const expiredDocs = await ctx.db
      .query("knowledgeDocuments")
      .filter(q => q.and(
         q.neq(q.field("threadId"), undefined),
         q.lt(q.field("createdAt"), expirationThreshold)
      ))
      .collect();

    let purgeCount = 0;
    for (const doc of expiredDocs) {
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
     return await ctx.db.query("knowledgeDocuments").filter(q => q.eq(q.field("status"), "pending")).first();
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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    
    if (!args.companyId) {
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized access to global knowledge base");
      }
    } else {
      if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== args.companyId)) {
          throw new Error("Unauthorized");
      }
    }

    const documentId = await ctx.db.insert("knowledgeDocuments", {
      title: args.title,
      textContent: args.textContent,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      ...(args.agentId ? { agentId: args.agentId } : {}),
      status: "processing",
      format: "text/plain",
      createdBy: userId,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.knowledgeActions.ingestDocument, {
      documentId,
    });

    await ctx.db.insert("auditLogs", {
      actionType: "UPLOAD_DOCUMENT",
      actorId: userId,
      entityType: "knowledgeDocuments",
      entityId: documentId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ title: args.title, format: "text/plain", scope: args.companyId ? "company" : args.agentId ? "agent" : "global" })
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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    
    if (!args.companyId) {
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized access to global knowledge base");
      }
    } else {
      if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== args.companyId)) {
          throw new Error("Unauthorized");
      }
    }

    const docIds = [];
    for (const url of args.urls) {
        // 🛡️ SECURITY: SSRF Prevention Shield
        try {
           const parsed = new URL(url);
           const host = parsed.hostname;
           // Block traversal and internal network lookups
           if (host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.") || host.startsWith("10.") || parsed.protocol !== "https:" && parsed.protocol !== "http:") {
               throw new Error(`SSRF Prevention: Cannot scrape internal or restricted URL (${url})`);
           }
        } catch(e) {
           throw new Error(`SSRF Prevention: Malformed URL provided.`);
        }

        // Simple duplicates check
        const existing = await ctx.db.query("knowledgeDocuments")
            .filter(q => q.and(
               q.eq(q.field("sourceUrl"), url),
               args.companyId ? q.eq(q.field("companyId"), args.companyId) : q.eq(q.field("companyId"), undefined)
            )).first();
            
        if (existing) {
             if (args.forceRefresh) {
                 await ctx.db.patch(existing._id, { status: "pending" });
                 docIds.push(existing._id);
             }
             continue;
        }

        const documentId = await ctx.db.insert("knowledgeDocuments", {
          title: url,
          sourceUrl: url,
          ...(args.companyId ? { companyId: args.companyId } : {}),
          ...(args.agentId ? { agentId: args.agentId } : {}),
          status: "pending",
          format: "url",
          createdBy: userId,
          createdAt: Date.now(),
        });
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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    
    if (!args.companyId) {
      if (!user || user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
    } else {
      if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== args.companyId)) throw new Error("Unauthorized");
    }

    // Query documents scoped to company or agent safely satisfying TypeScript's QueryInitializer
    const docs = args.companyId 
        ? await ctx.db.query("knowledgeDocuments").withIndex("by_company", q => q.eq("companyId", args.companyId)).collect()
        : await ctx.db.query("knowledgeDocuments").collect();

    let count = 0;
    for (const doc of docs) {
        if (doc.format === "url" && doc.sourceUrl && doc.sourceUrl.startsWith(args.rootDomain)) {
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
     const chunks = await ctx.db.query("knowledgeChunks").withIndex("by_document", q => q.eq("documentId", args.documentId)).collect();
     for (const chunk of chunks) {
         await ctx.db.delete(chunk._id);
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
      chunks: v.array(v.object({
          text: v.string(),
          embedding: v.array(v.number()),
        })),
  },
  handler: async (ctx, args) => {
      const existingChunks = await ctx.db.query("knowledgeChunks").withIndex("by_document", q => q.eq("documentId", args.documentId)).collect();
      for (const chunk of existingChunks) {
         await ctx.db.delete(chunk._id);
      }

      for (const chunk of args.chunks) {
         await ctx.db.insert("knowledgeChunks", {
             documentId: args.documentId,
             ...((args.companyId || args.agentId || args.threadId) ? { isGlobal: false } : { isGlobal: true }),
             ...(args.companyId ? { companyId: args.companyId } : {}),
             ...(args.agentId ? { agentId: args.agentId } : {}),
             ...(args.threadId ? { threadId: args.threadId } : {}),
             text: chunk.text,
             embedding: chunk.embedding,
         });
      }

      await ctx.db.patch(args.documentId, {
          status: "ready"
      });
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

export const debugCount = query({
  args: {},
  handler: async (ctx) => {
    const chunks = await ctx.db.query("knowledgeChunks").collect();
    const docs = await ctx.db.query("knowledgeDocuments").collect();
    return {
      totalChunks: chunks.length,
      totalDocs: docs.length,
      docsInfo: docs.map(d => ({ id: d._id, title: d.title, format: d.format, status: d.status }))
    };
  }
});
