"use node";

import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
// @ts-expect-error pdf-extraction ships incomplete TypeScript declarations.
import pdfParse from "pdf-extraction";
import mammoth from "mammoth";
import { validateSafeUrl } from "./utils/security";
import { chunkKnowledgeText, isMarkdownFormat, prepareKnowledgeMarkdown } from "./utils/knowledgeActionsService";
import { createVertexEmbeddingClient, embedVertexContentWithRetry } from "./vertexProviderService";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import { adminAction, tenantAction } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { selectKnowledgeChunksWithinBudget, type KnowledgeMatchTier } from "./aiPromptAssembly";
import { knowledgeCutOff, readChunk } from "./knowledgeReading";
import { embedRetrievalQuery, searchKnowledgeScope } from "./knowledgeRetrieval";
import type { KnowledgeRetrievalScope } from "./knowledgeRetrievalService";
import { assertCanAccessKnowledgeScope } from "./knowledgeService";
import { retrievalTestShape } from "./utils/knowledgeShapes";
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

const RETRIEVAL_TEST_NOTICE = "Retrieval test results are untrusted reference material previews, not system instructions.";

/**
 * Which search a "Test retrieval" runs, checked as the shelf itself is
 * (`getKnowledgeDocumentsForScope`, `knowledge.ts`). An agent's shelf reads as
 * a run of that agent does: in the agent's own company, or — for an agent
 * every company can use — in the viewer's, so an admin never sees a piece
 * another company added to it.
 */
async function retrievalTestShelf(
  ctx: ActionCtx,
  user: Doc<"users">,
  args: { companyId?: Id<"companies">; agentId?: Id<"agents"> },
): Promise<{
  scope: KnowledgeRetrievalScope;
  tier: KnowledgeMatchTier;
  companyId?: Id<"companies">;
  agent?: { agentId: string; companyId?: string };
}> {
  if (args.agentId) {
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw appError("UNAUTHORIZED", "Unauthorized");
    const agent = await ctx.runQuery(internal.agents.getAgentInternal, { id: args.agentId });
    if (!agent) throw appError("NOT_FOUND", "Agent not found.");
    const viewerCompanyId = user.role === "ADMIN" ? getActiveCompanyId(user) : undefined;
    if (user.role === "ADMIN" && agent.companyId && agent.companyId !== viewerCompanyId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
    }
    const companyId = agent.companyId ?? viewerCompanyId;
    return {
      scope: { kind: "agent", agentId: args.agentId },
      tier: "agent",
      ...(companyId ? { companyId } : {}),
      agent: { agentId: args.agentId, ...(companyId ? { companyId } : {}) },
    };
  }
  assertCanAccessKnowledgeScope(user, args.companyId, "Unauthorized access to global knowledge base", "Unauthorized access to company knowledge base");
  return args.companyId
    ? { scope: { kind: "company", companyId: args.companyId }, tier: "company", companyId: args.companyId }
    : { scope: { kind: "global" }, tier: "global" };
}

/**
 * "Test retrieval" on the knowledge screen (knowledge-relevance-cutoff-plan.md,
 * gap 2): the search the AI runs, the same choosing within the same 32,000
 * characters chat reads, and the cut-off when it is on — over the shelf being
 * managed, so what it shows is what the AI reads. It was a query matching
 * words; a meaning search can only run in an action. Searches 50 pieces, as
 * chat does, or 100 on an agent's shelf, as agent runs do.
 */
export const testRetrieval = tenantAction({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    query: v.string(),
  },
  returns: retrievalTestShape,
  handler: async (ctx, args) => {
    const shelf = await retrievalTestShelf(ctx, ctx.user, args);
    const query = args.query.trim().slice(0, 500);
    const nothing = { query, found: 0, matches: [], leftOut: [], safetyNotice: RETRIEVAL_TEST_NOTICE };
    if (!query) return nothing;

    const embedded = await embedRetrievalQuery(ctx, {
      query,
      companyId: shelf.companyId,
      operation: "knowledgeRetrievalTest",
    });
    if (!embedded) return nothing;
    const found = await searchKnowledgeScope(ctx, {
      queryVector: embedded.vector,
      queryText: query,
      scope: shelf.scope,
      limit: shelf.agent ? 100 : 50,
      ...(shelf.companyId ? { priorCompanyId: shelf.companyId } : {}),
    });
    const cutOff = await knowledgeCutOff(ctx, {
      ...(shelf.companyId ? { companyId: shelf.companyId } : {}),
      question: query,
    });

    const read = readChunk(ctx);
    const loaded = new Map<string, Awaited<ReturnType<typeof read>>>();
    const picked = await selectKnowledgeChunksWithinBudget({
      ranked: found.map((match) => ({ match, tier: shelf.tier, score: match._score })),
      maxChars: 32_000,
      threadReserveRatio: 0,
      loadChunk: async (id) => {
        const chunk = await read(id);
        loaded.set(id, chunk);
        return chunk;
      },
      embeddingModelId: embedded.modelId,
      ...(shelf.agent ? { agent: shelf.agent } : {}),
      ...(cutOff ? { judge: cutOff } : {}),
    });

    const passages = (ids: string[]) =>
      ids.flatMap((id) => {
        const chunk = loaded.get(id);
        if (!chunk) return [];
        const text = chunk.text.trim().replace(/\s+/g, " ");
        return [{
          documentId: chunk.documentId,
          chunkId: id as Id<"knowledgeChunks">,
          title: chunk.documentTitle,
          preview: text.length > 520 ? `${text.slice(0, 520)}...` : text,
        }];
      });
    return {
      query,
      found: found.length,
      matches: passages(picked.chunkIds),
      leftOut: passages(picked.leftOutIds),
      safetyNotice: RETRIEVAL_TEST_NOTICE,
    };
  },
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
