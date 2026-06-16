"use node";

import { internalAction, action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
// @ts-expect-error pdf-extraction ships incomplete TypeScript declarations.
import pdfParse from "pdf-extraction";
import mammoth from "mammoth";
import { validateSafeUrl } from "./utils/security";
import { requireActionAdmin } from "./actionAuth";
import { chunkKnowledgeText } from "./utils/knowledgeActionsService";
import { createVertexGenAIClient, embedVertexContentWithRetry } from "./vertexProviderService";
import { getGoogleVertexProviderModelId } from "./aiModelService";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const ingestDocument = internalAction({
  args: {
    documentId: v.id("knowledgeDocuments"),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    try {
      const doc = await ctx.runQuery(internal.knowledge.getDocInternal, { id: args.documentId });
      if (!doc) throw new Error("Document missing from DB");
      await ctx.runMutation(internal.knowledge.markDocIngestionStartedInternal, { documentId: args.documentId });

      let rawText = "";

      if (doc.textContent) {
          rawText = doc.textContent;
      } else if (args.storageId) {
          const fileUrl = await ctx.storage.getUrl(args.storageId);
          if (!fileUrl) throw new Error("Storage URL missing");

          const response = await fetch(fileUrl);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          if (doc.format === "application/pdf") {
              const pdfData = await pdfParse(buffer);
              rawText = pdfData.text;
          } else if (doc.format === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
              const result = await mammoth.extractRawText({ buffer });
              rawText = result.value;
          } else {
              rawText = buffer.toString('utf8');
          }
      }

      if (!rawText.trim()) throw new Error("No text content could be extracted from the intelligence file.");

      await embedAndStoreDoc(ctx, args.documentId, doc.companyId, doc.agentId, doc.threadId, rawText);

    } catch (error) {
       console.error("Critical Failure in Knowledge Ingestion:", error);
       await ctx.runMutation(internal.knowledge.markDocFailedInternal, {
         documentId: args.documentId,
         error: getErrorMessage(error),
       });
    }
  },
});

export const mapWebsite = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    await requireActionAdmin(ctx, "Unauthorized: Only administrators can map new external sites.");

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) throw new Error("FIRECRAWL_API_KEY environment variable not set");

    // 🛡️ SECURITY: Prevent internal SSRF scans via Firecrawl
    validateSafeUrl(args.url, "Firecrawl Map Dispatcher");

    const response = await fetch("https://api.firecrawl.dev/v1/map", {
       method: "POST",
       headers: {
           "Authorization": `Bearer ${firecrawlKey}`,
           "Content-Type": "application/json"
       },
       body: JSON.stringify({ url: args.url, limit: 500 }) // Cap at 500
    });

    if (!response.ok) {
       const text = await response.text();
       throw new Error(`Firecrawl mapping failed: ${text}`);
    }

    const data = await response.json();
    if (!data.success) throw new Error("Firecrawl mapping unsuccesful");
    return data.links as string[];
  }
});

export const processWebsiteQueue = internalAction({
  args: {},
  handler: async (ctx) => {
     const nextDoc = await ctx.runQuery(internal.knowledge.getNextPendingUrlInternal);
     if (!nextDoc || nextDoc.status !== "pending") return;
     await ctx.runMutation(internal.knowledge.markDocIngestionStartedInternal, { documentId: nextDoc._id });

     try {
       const firecrawlKey = process.env.FIRECRAWL_API_KEY;
       if (!firecrawlKey) throw new Error("Missing FIRECRAWL_API_KEY");

       const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
           method: "POST",
           headers: {
               "Authorization": `Bearer ${firecrawlKey}`,
               "Content-Type": "application/json"
           },
           body: JSON.stringify({ url: nextDoc.sourceUrl, formats: ["markdown"] })
       });

       if (!response.ok) {
           if (response.status === 429) {
               console.warn("Firecrawl Rate Limit Hit (429). Executing exponential backoff.");
               await ctx.runMutation(internal.knowledge.markDocPendingInternal, {
                 documentId: nextDoc._id,
                 reason: "Firecrawl rate limit hit; queued for retry.",
               });
               await ctx.scheduler.runAfter(10000, internal.knowledgeActions.processWebsiteQueue);
               return; 
           }
           throw new Error("Scrape failed: " + await response.text());
       }
       const data = await response.json();
       const markdownText = data.data?.markdown || "";

       if (!markdownText) throw new Error("No extracted markdown text from URL.");

       await embedAndStoreDoc(ctx, nextDoc._id, nextDoc.companyId, nextDoc.agentId, nextDoc.threadId, markdownText);
     } catch (e) {
       console.error("Queue Scrape Error", e);
       await ctx.runMutation(internal.knowledge.markDocFailedInternal, {
         documentId: nextDoc._id,
         error: getErrorMessage(e),
       });
     }

     // Trigger another check after processing to handle queue
     // Decreased from 5000ms to 2000ms to accelerate ingestion without hitting Firecrawl limit walls
     await ctx.scheduler.runAfter(2000, internal.knowledgeActions.processWebsiteQueue);
  }
});

async function embedAndStoreDoc(
  ctx: ActionCtx,
  documentId: Id<"knowledgeDocuments">,
  companyId: Id<"companies"> | undefined,
  agentId: Id<"agents"> | undefined,
  threadId: Id<"threads"> | undefined,
  rawText: string
) {
      const chunks = chunkKnowledgeText(rawText);

      const ai = createVertexGenAIClient();
      const embeddingModel = await ctx.runQuery(internal.aiModels.resolveEmbeddingModelConfigForExecution, {
        companyId,
      });
      const providerModelId = getGoogleVertexProviderModelId(embeddingModel, "knowledge embedding generation");

      const embeddedChunks = [];
      let failedChunkCount = 0;
      for (const textChunk of chunks) {
         try {
             const embedResponse = await embedVertexContentWithRetry(ai, {
                 model: providerModelId,
                 contents: textChunk,
             }, {
                 operation: "knowledgeChunkEmbedding",
                 retryPolicy: {
                    maxAttempts: 5,
                 },
             });
             
             if (embedResponse.embeddings && embedResponse.embeddings.length > 0) {
                const vector = embedResponse.embeddings[0].values;
                if (vector && vector.length === 768) {
                   embeddedChunks.push({
                      text: textChunk,
                      embedding: vector
                   });
                }
             }
         } catch (e) {
            failedChunkCount++;
            console.error("Vector Embed Failure on chunk", e);
         }
      }

      if (failedChunkCount > 0) {
          throw new Error(`Knowledge embedding failed for ${failedChunkCount} of ${chunks.length} chunks after retries.`);
      }

      if (embeddedChunks.length === 0) {
          throw new Error("Knowledge embedding produced no searchable chunks.");
      }

      // Stagger insertions to avoid 16MB limit
      const chunkSize = 50;
      for (let i = 0; i < embeddedChunks.length; i += chunkSize) {
          const batch = embeddedChunks.slice(i, i + chunkSize);
          await ctx.runMutation(internal.knowledge.saveChunksInternal, {
             documentId,
             ...(companyId ? { companyId: companyId } : {}),
             ...(agentId ? { agentId: agentId } : {}),
             ...(threadId ? { threadId: threadId } : {}),
             embeddingProviderKey: embeddingModel.providerKey,
             embeddingModelId: embeddingModel.modelId,
             embeddingProviderModelId: embeddingModel.providerModelId,
             embeddingDimensions: embeddingModel.embeddingDimensions,
             chunks: batch,
             replaceExisting: i === 0,
             markReady: i + chunkSize >= embeddedChunks.length,
          });
      }
}
