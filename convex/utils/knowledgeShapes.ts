import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { rowShape } from "./rowShape";

/**
 * What the knowledge surfaces hand back.
 *
 * `getQualitySummary` already carried most of these inline, as one validator
 * long enough to be unreadable and impossible to reuse — the drift block and
 * the quality flag are wanted by three surfaces between them. They are named
 * once here, with every field that comes from a table read off
 * `convex/schema.ts`.
 */

const documentFields = schema.tables.knowledgeDocuments.validator.fields;
const chunkFields = schema.tables.knowledgeChunks.validator.fields;

export const documentStatusShape = documentFields.status;

export const embeddingDriftShape = v.union(v.null(), v.object({
  storedModelId: v.optional(v.string()),
  storedProviderKey: v.string(),
  storedProviderModelId: v.optional(v.string()),
  storedDimensions: v.optional(v.number()),
  activeModelId: v.string(),
  activeProviderKey: v.string(),
  activeProviderModelId: v.string(),
  activeDimensions: v.optional(v.number()),
}));

export const qualityFlagShape = v.union(
  v.literal("FAILED"),
  v.literal("READY_WITHOUT_CHUNKS"),
  v.literal("EMBEDDING_MODEL_DRIFT"),
  v.literal("STALE_INGESTION"),
);

export const qualitySummaryShape = v.object({
  totals: v.object({
    documents: v.number(),
    ready: v.number(),
    pending: v.number(),
    processing: v.number(),
    failed: v.number(),
    flagged: v.number(),
    embeddingDrift: v.number(),
    sampledChunks: v.number(),
    readyCoverage: v.number(),
  }),
  topicCoverage: v.union(v.null(), v.object({
    score: v.number(),
    terms: v.array(v.object({ term: v.string(), covered: v.boolean() })),
    coveredCount: v.number(),
    totalCount: v.number(),
    readyDocumentCount: v.number(),
    recommendation: v.string(),
  })),
  flaggedDocuments: v.array(v.object({
    documentId: v.id("knowledgeDocuments"),
    title: documentFields.title,
    status: documentStatusShape,
    format: documentFields.format,
    sourceUrl: documentFields.sourceUrl,
    createdAt: documentFields.createdAt,
    lastQueuedAt: documentFields.lastQueuedAt,
    lastIngestionStartedAt: documentFields.lastIngestionStartedAt,
    lastIngestedAt: documentFields.lastIngestedAt,
    lastIngestionError: documentFields.lastIngestionError,
    chunkCount: v.number(),
    flag: qualityFlagShape,
    embeddingDrift: v.optional(embeddingDriftShape),
  })),
});

export const documentListShape = v.array(rowShape.knowledgeDocuments);

export const documentPageShape = paginationResultValidator(rowShape.knowledgeDocuments);

export const documentInspectionShape = v.object({
  document: v.object({
    documentId: v.id("knowledgeDocuments"),
    title: documentFields.title,
    status: documentStatusShape,
    format: documentFields.format,
    sourceUrl: documentFields.sourceUrl,
    createdAt: documentFields.createdAt,
    lastQueuedAt: documentFields.lastQueuedAt,
    lastIngestionStartedAt: documentFields.lastIngestionStartedAt,
    lastIngestedAt: documentFields.lastIngestedAt,
    lastIngestionError: documentFields.lastIngestionError,
    embeddingProviderKey: documentFields.embeddingProviderKey,
    embeddingModelId: documentFields.embeddingModelId,
    embeddingProviderModelId: documentFields.embeddingProviderModelId,
    embeddingDimensions: documentFields.embeddingDimensions,
  }),
  activeEmbeddingModel: v.union(v.null(), v.object({
    modelId: v.string(),
    providerKey: v.string(),
    providerModelId: v.string(),
    embeddingDimensions: v.optional(v.number()),
  })),
  embeddingDrift: embeddingDriftShape,
  history: v.array(v.object({
    actionType: v.string(),
    timestamp: v.number(),
    actorEmail: v.optional(v.string()),
    metadata: v.union(v.null(), v.any()),
  })),
  chunkCount: v.number(),
  chunks: v.array(v.object({
    chunkId: v.id("knowledgeChunks"),
    index: v.number(),
    preview: v.string(),
    characterCount: v.number(),
    embeddingDimensions: v.number(),
    embeddingProviderKey: chunkFields.embeddingProviderKey,
    embeddingModelId: chunkFields.embeddingModelId,
    embeddingProviderModelId: chunkFields.embeddingProviderModelId,
  })),
  safetyNotice: v.string(),
});

export const retrievalTestShape = v.object({
  query: v.string(),
  inspectedDocuments: v.number(),
  inspectedChunks: v.number(),
  matches: v.array(v.object({
    documentId: v.id("knowledgeDocuments"),
    chunkId: v.id("knowledgeChunks"),
    title: documentFields.title,
    status: documentStatusShape,
    format: documentFields.format,
    sourceUrl: documentFields.sourceUrl,
    score: v.number(),
    matchedTerms: v.array(v.string()),
    phraseHit: v.boolean(),
    preview: v.string(),
    embeddingModelId: v.optional(v.string()),
    embeddingDimensions: v.number(),
  })),
  safetyNotice: v.string(),
});

export const documentRequeueShape = v.object({
  documentId: v.id("knowledgeDocuments"),
  status: documentStatusShape,
});

export const documentRepairShape = v.object({
  inspectedCount: v.number(),
  repairedCount: v.number(),
  repaired: v.array(v.object({
    documentId: v.id("knowledgeDocuments"),
    title: documentFields.title,
    flag: qualityFlagShape,
    status: documentStatusShape,
  })),
});
