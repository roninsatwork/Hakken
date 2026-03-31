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
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== args.companyId)) {
        throw new Error("Unauthorized access to company knowledge base");
    }

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", q => q.eq("companyId", args.companyId))
      .order("desc")
      .collect();
  },
});

export const saveDocument = mutation({
  args: {
    storageId: v.id("_storage"),
    companyId: v.id("companies"),
    title: v.string(),
    format: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");

    const user = await ctx.db.get(userId);
    if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== args.companyId)) {
        throw new Error("Unauthorized");
    }

    const documentId = await ctx.db.insert("knowledgeDocuments", {
      title: args.title,
      fileId: args.storageId,
      companyId: args.companyId,
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
    if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== doc.companyId)) {
      throw new Error("Unauthorized");
    }

    // Attempt to delete from convex storage
    await ctx.storage.delete(doc.fileId);

    // Eradicate associated memory chunks 
    const chunks = await ctx.db.query("knowledgeChunks").filter(q => q.eq(q.field("documentId"), doc._id)).collect();
    for (const chunk of chunks) {
       await ctx.db.delete(chunk._id);
    }

    // Delete base document record
    await ctx.db.delete(args.documentId);
    return true;
  }
});

export const getDocInternal = internalQuery({
  args: { id: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
      return await ctx.db.get(args.id);
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
      companyId: v.id("companies"),
      chunks: v.array(v.object({
          text: v.string(),
          embedding: v.array(v.number()),
      })),
  },
  handler: async (ctx, args) => {
      for (const chunk of args.chunks) {
         await ctx.db.insert("knowledgeChunks", {
             documentId: args.documentId,
             companyId: args.companyId,
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
