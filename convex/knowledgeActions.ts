"use node";

import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
// @ts-expect-error pdf-extraction ships incomplete TypeScript declarations.
import pdfParse from "pdf-extraction";
import mammoth from "mammoth";
import { validateSafeUrl } from "./utils/security";
import { chunkKnowledgeText, isMarkdownFormat, prepareKnowledgeMarkdown } from "./utils/knowledgeActionsService";
import { createVertexEmbeddingClient, embedVertexContentWithRetry } from "./vertexProviderService";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import { adminAction } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { getErrorMessage } from "./utils/lang";
import { appError } from "./utils/appError";
import { readBoundedBody } from "./utils/boundedRequestBody";
import {
  KNOWLEDGE_WEBSITE_MAX_CHUNKS,
  KNOWLEDGE_WEBSITE_REQUEST_TIMEOUT_MS,
  KNOWLEDGE_WEBSITE_RESPONSE_MAX_BYTES,
  KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS,
  KNOWLEDGE_WEBSITE_URLS_PER_REQUEST,
} from "./knowledgeImportPolicy";


/**
 * Shared by the direct single-file path and the bulk file queue. Swallows its
 * own failures into the document's status so a bad file never stops the queue
 * behind it.
 */
async function ingestStoredDocument(
  ctx: ActionCtx,
  documentId: Id<"knowledgeDocuments">,
  storageId: Id<"_storage"> | undefined,
  options: { alreadyClaimed?: boolean } = {}
) {
    try {
      const doc = await ctx.runQuery(internal.knowledge.getDocInternal, { id: documentId });
      if (!doc) throw appError("NOT_FOUND", "Document missing from DB");
      if (!options.alreadyClaimed) {
        await ctx.runMutation(internal.knowledge.markDocIngestionStartedInternal, { documentId });
      }

      let rawText = "";

      if (doc.textContent) {
          rawText = doc.textContent;
      } else if (storageId) {
          const fileUrl = await ctx.storage.getUrl(storageId);
          if (!fileUrl) throw appError("NOT_FOUND", "Storage URL missing");

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

      if (!rawText.trim()) throw appError("INVALID_INPUT", "No text content could be extracted from the intelligence file.");

      let ingestText = rawText;

      if (isMarkdownFormat(doc.format)) {
        const prepared = prepareKnowledgeMarkdown(rawText);
        ingestText = prepared.text;

        // An OKF concept names itself. Prefer that over the uploaded filename.
        if (prepared.frontmatter.title && prepared.frontmatter.title !== doc.title) {
          await ctx.runMutation(internal.knowledge.setDocumentTitleInternal, {
            documentId,
            title: prepared.frontmatter.title,
          });
        }
      }

      if (!ingestText.trim()) throw appError("INVALID_INPUT", "No text content could be extracted from the intelligence file.");

      await embedAndStoreDoc(ctx, documentId, doc.companyId, doc.agentId, doc.threadId, ingestText);

    } catch (error) {
       console.error("Critical Failure in Knowledge Ingestion:", error);
       await ctx.runMutation(internal.knowledge.markDocFailedInternal, {
         documentId,
         error: getErrorMessage(error),
       });
    }
}

export const ingestDocument = internalAction({
  args: {
    documentId: v.id("knowledgeDocuments"),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await ingestStoredDocument(ctx, args.documentId, args.storageId);
  },
});

/**
 * Drains bulk-uploaded files one document per pass, rescheduling itself until
 * the pending queue is empty. Several of these chains run at once — see
 * KNOWLEDGE_FILE_QUEUE_WIDTH — and the claim is transactional so no two chains
 * take the same document.
 */
export const processKnowledgeFileQueue = internalAction({
  args: {},
  handler: async (ctx) => {
    const claimed = await ctx.runMutation(internal.knowledge.claimNextPendingFileInternal, {});
    if (!claimed) return;

    await ingestStoredDocument(ctx, claimed.documentId, claimed.fileId ?? undefined, { alreadyClaimed: true });

    await ctx.scheduler.runAfter(0, internal.knowledgeActions.processKnowledgeFileQueue, {});
  },
});

export const mapWebsite = adminAction({
  args: { url: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) throw appError("NOT_CONFIGURED", "FIRECRAWL_API_KEY environment variable not set");

    // 🛡️ SECURITY: Prevent internal SSRF scans via Firecrawl
    validateSafeUrl(args.url, "Firecrawl Map Dispatcher");
    await ctx.runMutation(internal.knowledge.reserveWebsiteMapInternal, {
      companyId: getActiveCompanyId(ctx.user),
    });

    const response = await fetch("https://api.firecrawl.dev/v1/map", {
       method: "POST",
       headers: {
           "Authorization": `Bearer ${firecrawlKey}`,
           "Content-Type": "application/json"
       },
       body: JSON.stringify({ url: args.url, limit: KNOWLEDGE_WEBSITE_URLS_PER_REQUEST }),
       signal: AbortSignal.timeout(KNOWLEDGE_WEBSITE_REQUEST_TIMEOUT_MS),
    });

    const data = await readFirecrawlJson(response, "mapping");
    if (!data.success) throw appError("UPSTREAM_FAILURE", "Firecrawl mapping unsuccesful");
    return Array.isArray(data.links)
      ? (data.links as unknown[])
        .filter((link: unknown): link is string => typeof link === "string")
        .slice(0, KNOWLEDGE_WEBSITE_URLS_PER_REQUEST)
      : [];
  }
});

export const processWebsiteQueue = internalAction({
  args: {},
  handler: async (ctx) => {
     // Claim and mark are one transaction. Several queue chains may be awake,
     // but only one can receive a given document and spend provider work on it.
     const nextDoc = await ctx.runMutation(internal.knowledge.claimNextPendingUrlInternal);
     if (!nextDoc) return;

     try {
       const firecrawlKey = process.env.FIRECRAWL_API_KEY;
       if (!firecrawlKey) throw appError("INVALID_INPUT", "Missing FIRECRAWL_API_KEY");

       const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
           method: "POST",
           headers: {
               "Authorization": `Bearer ${firecrawlKey}`,
               "Content-Type": "application/json"
           },
           body: JSON.stringify({ url: nextDoc.sourceUrl, formats: ["markdown"] }),
           signal: AbortSignal.timeout(KNOWLEDGE_WEBSITE_REQUEST_TIMEOUT_MS),
       });

       if (!response.ok) {
           if (response.status === 429) {
               await response.body?.cancel();
               console.warn("Firecrawl Rate Limit Hit (429). Executing exponential backoff.");
               await ctx.runMutation(internal.knowledge.markDocPendingInternal, {
                 documentId: nextDoc._id,
                 reason: "Firecrawl rate limit hit; queued for retry.",
               });
               await ctx.scheduler.runAfter(10000, internal.knowledgeActions.processWebsiteQueue);
               return; 
           }
       }
       const data = await readFirecrawlJson(response, "scrape");
       const markdownText = typeof data.data?.markdown === "string" ? data.data.markdown : "";

       if (!markdownText) throw appError("UPSTREAM_FAILURE", "No extracted markdown text from URL.");

       await embedAndStoreDoc(
         ctx,
         nextDoc._id,
         nextDoc.companyId,
         nextDoc.agentId,
         nextDoc.threadId,
         markdownText,
         {
           maxCharacters: KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS,
           maxChunks: KNOWLEDGE_WEBSITE_MAX_CHUNKS,
         },
       );
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
  rawText: string,
  limits?: { maxCharacters: number; maxChunks: number },
) {
      if (limits && rawText.length > limits.maxCharacters) {
        throw appError(
          "INVALID_INPUT",
          `Knowledge source exceeds ${limits.maxCharacters} characters.`,
        );
      }
      const chunks = chunkKnowledgeText(rawText);
      if (limits && chunks.length > limits.maxChunks) {
        throw appError(
          "INVALID_INPUT",
          `Knowledge source exceeds ${limits.maxChunks} embedding chunks.`,
        );
      }

      const embeddingAi = createVertexEmbeddingClient();
      const embeddingModel = await ctx.runQuery(internal.aiModels.resolveEmbeddingModelConfigForExecution, {
        companyId,
      });
      const providerModelId = getGoogleVertexProviderModelId(embeddingModel, "knowledge embedding generation");

      const embeddedChunks = [];
      let failedChunkCount = 0;
      for (const textChunk of chunks) {
         try {
             const embedResponse = await embedVertexContentWithRetry(embeddingAi, {
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
          throw appError("UPSTREAM_FAILURE", `Knowledge embedding failed for ${failedChunkCount} of ${chunks.length} chunks after retries.`);
      }

      if (embeddedChunks.length === 0) {
          throw appError("INVALID_INPUT", "Knowledge embedding produced no searchable chunks.");
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

type FirecrawlPayload = {
  success?: boolean;
  links?: unknown;
  data?: { markdown?: unknown };
};

async function readFirecrawlJson(response: Response, operation: string): Promise<FirecrawlPayload> {
  const body = await readBoundedBody(response, KNOWLEDGE_WEBSITE_RESPONSE_MAX_BYTES);
  if (!body.ok) {
    throw appError(
      "UPSTREAM_FAILURE",
      body.reason === "too_large"
        ? `Firecrawl ${operation} response exceeded ${KNOWLEDGE_WEBSITE_RESPONSE_MAX_BYTES} bytes.`
        : `Firecrawl ${operation} response could not be read.`,
    );
  }
  if (!response.ok) {
    throw appError("UPSTREAM_FAILURE", `Firecrawl ${operation} failed: ${body.text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(body.text) as FirecrawlPayload;
  } catch {
    throw appError("UPSTREAM_FAILURE", `Firecrawl ${operation} returned invalid JSON.`);
  }
}
