import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import { validateSafeUrl } from "./utils/security";
import { validateKnowledgeDocumentMetadata, validateStoredUpload } from "./utils/uploadPolicy";
import { getActiveCompanyId, getCurrentUser, requireAdmin, requireCurrentUser } from "./authz";
import { EMBEDDING_MODEL_USE_CASE, GOOGLE_VERTEX_EMBEDDING_DIMENSIONS, GOOGLE_VERTEX_PROVIDER_KEY } from "./aiModelService";
import { adminMutation, publicQuery, tenantMutation, tenantQuery } from "./tenantFunctions";
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

const KNOWLEDGE_QUALITY_LIMIT = 500;
const KNOWLEDGE_INSPECTION_CHUNK_LIMIT = 12;
const KNOWLEDGE_RETRIEVAL_DOCUMENT_LIMIT = 150;
const KNOWLEDGE_RETRIEVAL_CHUNK_LIMIT = 20;
const KNOWLEDGE_RETRIEVAL_RESULT_LIMIT = 8;
const KNOWLEDGE_HISTORY_LIMIT = 8;
const KNOWLEDGE_WEBSITE_DOCUMENT_LIMIT = 1000;
const STALE_INGESTION_MS = 15 * 60 * 1000;
const KNOWLEDGE_COVERAGE_TERM_LIMIT = 6;
const KNOWLEDGE_COVERAGE_CHUNK_SAMPLE_LIMIT = 8;

const coverageStopWords = new Set([
  "agent",
  "assistant",
  "support",
  "help",
  "with",
  "from",
  "that",
  "this",
  "will",
  "should",
  "using",
  "into",
  "about",
  "company",
  "customer",
  "customers",
  "user",
  "users",
]);

function truncatePreview(value: string | undefined, limit = 900) {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function truncateIngestionError(value: string | undefined, limit = 500) {
  return truncatePreview(value || "Unknown ingestion failure", limit);
}

function getRetrievalTokens(value: string) {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []))
    .filter((token) => token.length >= 2)
    .slice(0, 12);
}

function getCoverageTokens(value: string) {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []))
    .filter((token) => token.length >= 4 && !coverageStopWords.has(token))
    .slice(0, 40);
}

function getAgentCoverageTerms(agent: Pick<Doc<"agents">, "name" | "description" | "systemPrompt">) {
  return getCoverageTokens([
    agent.name,
    agent.description,
    agent.systemPrompt,
  ].filter(Boolean).join(" ")).slice(0, KNOWLEDGE_COVERAGE_TERM_LIMIT);
}

function scoreChunkForRetrieval(args: { chunkText: string; query: string; tokens: string[] }) {
  const normalizedText = args.chunkText.toLowerCase();
  const normalizedQuery = args.query.toLowerCase().trim();
  const tokenHits = args.tokens.filter((token) => normalizedText.includes(token));
  const phraseHit = normalizedQuery.length >= 4 && normalizedText.includes(normalizedQuery);
  return {
    score: tokenHits.length + (phraseHit ? 4 : 0),
    matchedTerms: tokenHits,
    phraseHit,
  };
}

function parseAuditMetadata(metadata: string | undefined) {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function summarizeEmbeddingDrift(args: {
  document: Pick<Doc<"knowledgeDocuments">, "status" | "embeddingModelId" | "embeddingProviderKey" | "embeddingProviderModelId" | "embeddingDimensions">;
  activeEmbeddingModel: ActiveEmbeddingModel | null;
}) {
  if (args.document.status !== "ready" || !args.activeEmbeddingModel) return null;
  if (!args.document.embeddingModelId && !args.document.embeddingProviderModelId && !args.document.embeddingDimensions) return null;

  const storedProviderKey = args.document.embeddingProviderKey ?? GOOGLE_VERTEX_PROVIDER_KEY;
  const providerChanged = storedProviderKey !== args.activeEmbeddingModel.providerKey;
  const modelChanged = args.document.embeddingModelId !== args.activeEmbeddingModel.modelId;
  const providerModelChanged = args.document.embeddingProviderModelId !== args.activeEmbeddingModel.providerModelId;
  const dimensionsChanged = args.document.embeddingDimensions !== undefined && args.document.embeddingDimensions !== args.activeEmbeddingModel.embeddingDimensions;

  if (!providerChanged && !modelChanged && !providerModelChanged && !dimensionsChanged) return null;

  return {
    storedModelId: args.document.embeddingModelId,
    storedProviderKey,
    storedProviderModelId: args.document.embeddingProviderModelId,
    storedDimensions: args.document.embeddingDimensions,
    activeModelId: args.activeEmbeddingModel.modelId,
    activeProviderKey: args.activeEmbeddingModel.providerKey,
    activeProviderModelId: args.activeEmbeddingModel.providerModelId,
    activeDimensions: args.activeEmbeddingModel.embeddingDimensions,
  };
}

function getKnowledgeDocumentQualityFlag(args: {
  document: {
    status: "pending" | "processing" | "ready" | "failed";
    createdAt: number;
    lastQueuedAt?: number;
    lastIngestionStartedAt?: number;
  };
  chunkCount: number;
  now: number;
  embeddingDrift?: ReturnType<typeof summarizeEmbeddingDrift> | null;
}) {
  if (args.document.status === "failed") return "FAILED";
  if (args.document.status === "ready" && args.chunkCount === 0) return "READY_WITHOUT_CHUNKS";
  if (args.embeddingDrift) return "EMBEDDING_MODEL_DRIFT";
  const ingestionActivityAt = args.document.lastIngestionStartedAt ?? args.document.lastQueuedAt ?? args.document.createdAt;
  if ((args.document.status === "pending" || args.document.status === "processing") && args.now - ingestionActivityAt > STALE_INGESTION_MS) {
    return "STALE_INGESTION";
  }
  return null;
}

type ActiveEmbeddingModel = {
  modelId: string;
  providerKey: string;
  providerModelId: string;
  embeddingDimensions?: number;
};

type KnowledgeReadCtx = Pick<QueryCtx, "db">;

async function getModelByStableId(ctx: KnowledgeReadCtx, modelId: string) {
  return await ctx.db
    .query("aiModels")
    .withIndex("by_model_id", (q) => q.eq("modelId", modelId))
    .first();
}

async function getActiveEmbeddingModelForCompany(
  ctx: KnowledgeReadCtx,
  companyId: Id<"companies"> | undefined
): Promise<ActiveEmbeddingModel | null> {
  const companyDefault = companyId
    ? await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_company_use_case", (q) => q.eq("companyId", companyId).eq("useCase", EMBEDDING_MODEL_USE_CASE))
      .first()
    : null;
  const globalDefault = await ctx.db
    .query("aiModelDefaults")
    .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", EMBEDDING_MODEL_USE_CASE))
    .first();

  const modelIds = [
    companyDefault?.modelId,
    companyDefault?.fallbackModelId,
    globalDefault?.modelId,
    globalDefault?.fallbackModelId,
  ].filter((modelId): modelId is string => !!modelId);

  for (const modelId of modelIds) {
    const model = await getModelByStableId(ctx, modelId);
    if (!model?.isEnabled) continue;
    return {
      modelId: model.modelId,
      providerKey: model.providerKey ?? GOOGLE_VERTEX_PROVIDER_KEY,
      providerModelId: model.providerModelId ?? model.modelId,
      embeddingDimensions: GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
    };
  }

  return null;
}

function getWritableKnowledgeScope(user: Doc<"users">, args: { companyId?: Id<"companies">; agentId?: Id<"agents"> }) {
  const companyId = args.companyId || (args.agentId && user.role === "ADMIN" ? getActiveCompanyId(user) : undefined);
  assertCanAccessKnowledgeScope(user, companyId);
  return {
    companyId,
    agentId: args.agentId,
  };
}

async function getKnowledgeDocumentsForScope(
  ctx: QueryCtx,
  args: { companyId?: Id<"companies">; agentId?: Id<"agents"> },
  limit = KNOWLEDGE_QUALITY_LIMIT
) {
  const { user } = await requireCurrentUser(ctx, "Unauthenticated request");

  if (args.agentId) {
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized");
    }

    if (user.role === "ADMIN") {
      const activeCompanyId = getActiveCompanyId(user);
      if (!activeCompanyId) return [];
      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_agent_company", (q) => q.eq("agentId", args.agentId).eq("companyId", activeCompanyId))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);
  }

  if (!args.companyId) {
    if (user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized access to global knowledge base");
    }
    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_global", (q) => q.eq("companyId", undefined).eq("agentId", undefined).eq("threadId", undefined))
      .order("desc")
      .take(limit);
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
    .take(limit);
}

async function getRepairableKnowledgeDocumentsForScope(
  ctx: MutationCtx,
  args: { companyId?: Id<"companies">; agentId?: Id<"agents"> },
  limit = KNOWLEDGE_QUALITY_LIMIT
) {
  const { user } = await requireCurrentUser(ctx, "Unauthenticated request");

  if (args.agentId) {
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    if (user.role === "ADMIN") {
      const activeCompanyId = getActiveCompanyId(user);
      if (!activeCompanyId) return [];
      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_agent_company", (q) => q.eq("agentId", args.agentId).eq("companyId", activeCompanyId))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);
  }

  if (!args.companyId) {
    if (user.role !== "SUPER_ADMIN") throw new Error("Unauthorized access to global knowledge base");
    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_global", (q) => q.eq("companyId", undefined).eq("agentId", undefined).eq("threadId", undefined))
      .order("desc")
      .take(limit);
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
    .take(limit);
}

async function getKnowledgeDocumentChunkCount(ctx: KnowledgeReadCtx, documentId: Id<"knowledgeDocuments">) {
  const chunks = await ctx.db
    .query("knowledgeChunks")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .take(KNOWLEDGE_INSPECTION_CHUNK_LIMIT);
  return chunks.length;
}

async function assertCanInspectKnowledgeDocument(
  ctx: QueryCtx,
  document: Doc<"knowledgeDocuments">
) {
  const current = await getCurrentUser(ctx);
  if (!current) throw new Error("Unauthenticated request");

  if (document.threadId) {
    const thread = await ctx.db.get(document.threadId);
    if (!thread || !canReadThreadKnowledgeDocuments(thread, current)) throw new Error("Unauthorized");
    return;
  }

  if (!document.companyId) {
    if (current.user.role !== "SUPER_ADMIN") throw new Error("Unauthorized access to global knowledge base");
    return;
  }

  if (current.user.role !== "SUPER_ADMIN" && (current.user.role !== "ADMIN" || getActiveCompanyId(current.user) !== document.companyId)) {
    throw new Error("Unauthorized");
  }
}

async function assertCanRepairKnowledgeDocument(
  ctx: MutationCtx,
  document: Doc<"knowledgeDocuments">
) {
  const { userId, user } = await requireCurrentUser(ctx, "Unauthenticated request");

  if (document.threadId) {
    throw new Error("Thread-scoped documents are repaired from their source thread.");
  }

  if (!document.companyId) {
    if (user.role !== "SUPER_ADMIN") throw new Error("Unauthorized access to global knowledge base");
    return { userId, user };
  }

  if (user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || getActiveCompanyId(user) !== document.companyId)) {
    throw new Error("Unauthorized");
  }

  return { userId, user };
}

async function requeueKnowledgeDocument(
  ctx: MutationCtx,
  document: Doc<"knowledgeDocuments">,
  options: { scheduleWebsiteQueue?: boolean } = {}
) {
  const nextStatus = document.format === "url" ? "pending" : "processing";
  const scheduleWebsiteQueue = options.scheduleWebsiteQueue ?? true;

  await ctx.db.patch(document._id, {
    status: nextStatus,
    lastQueuedAt: Date.now(),
    lastIngestionError: undefined,
  });
  await ctx.scheduler.runAfter(0, internal.knowledge.purgeDocumentChunksInternal, { documentId: document._id });

  if (document.format === "url") {
    if (scheduleWebsiteQueue) {
      await ctx.scheduler.runAfter(0, internal.knowledgeActions.processWebsiteQueue);
    }
  } else {
    await ctx.scheduler.runAfter(0, internal.knowledgeActions.ingestDocument, {
      documentId: document._id,
      ...(document.fileId ? { storageId: document.fileId } : {}),
    });
  }

  return nextStatus;
}

export const generateUploadUrl = adminMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getDocuments = tenantQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    
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

export const getPaginatedDocuments = tenantQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

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

export const getWebsiteDocuments = tenantQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    if (args.agentId) {
      if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized");
      }

      if (user.role === "ADMIN") {
        const activeCompanyId = getActiveCompanyId(user);
        if (!activeCompanyId) return [];

        return await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_agent_format", (q) => q.eq("agentId", args.agentId).eq("format", "url"))
          .filter((q) => q.eq(q.field("companyId"), activeCompanyId))
          .order("desc")
          .take(KNOWLEDGE_WEBSITE_DOCUMENT_LIMIT);
      }

      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_agent_format", (q) => q.eq("agentId", args.agentId).eq("format", "url"))
        .order("desc")
        .take(KNOWLEDGE_WEBSITE_DOCUMENT_LIMIT);
    }

    if (!args.companyId) {
      if (user.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized access to global knowledge base");
      }

      return await ctx.db
        .query("knowledgeDocuments")
        .withIndex("by_global_format", (q) => q.eq("companyId", undefined).eq("agentId", undefined).eq("threadId", undefined).eq("format", "url"))
        .order("desc")
        .take(KNOWLEDGE_WEBSITE_DOCUMENT_LIMIT);
    }

    if (user.role !== "SUPER_ADMIN" && (user.role !== "ADMIN" || getActiveCompanyId(user) !== args.companyId)) {
      throw new Error("Unauthorized access to company knowledge base");
    }

    return await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company_format", (q) => q.eq("companyId", args.companyId).eq("format", "url"))
      .filter((q) => q.and(
        q.eq(q.field("agentId"), undefined),
        q.eq(q.field("threadId"), undefined)
      ))
      .order("desc")
      .take(KNOWLEDGE_WEBSITE_DOCUMENT_LIMIT);
  },
});

export const getQualitySummary = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const documents = await getKnowledgeDocumentsForScope(ctx, args);
    const now = Date.now();
    const activeEmbeddingModels = new Map<string, ActiveEmbeddingModel | null>();
    const getActiveEmbeddingModelForDocument = async (document: Doc<"knowledgeDocuments">) => {
      const cacheKey = document.companyId ?? "global";
      if (!activeEmbeddingModels.has(cacheKey)) {
        activeEmbeddingModels.set(cacheKey, await getActiveEmbeddingModelForCompany(ctx, document.companyId));
      }
      return activeEmbeddingModels.get(cacheKey) ?? null;
    };
    const chunkPairs = await Promise.all(documents.map(async (document) => {
      const chunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .take(KNOWLEDGE_INSPECTION_CHUNK_LIMIT);
      return [document._id, chunks.length] as const;
    }));
    const chunkCountByDocument = new Map(chunkPairs);
    const embeddingDriftPairs = await Promise.all(documents.map(async (document) => {
      const activeEmbeddingModel = await getActiveEmbeddingModelForDocument(document);
      return [document._id, summarizeEmbeddingDrift({ document, activeEmbeddingModel })] as const;
    }));
    const embeddingDriftByDocument = new Map(embeddingDriftPairs);
    const statusCounts = documents.reduce<Record<Doc<"knowledgeDocuments">["status"], number>>((counts, document) => {
      counts[document.status] += 1;
      return counts;
    }, { pending: 0, processing: 0, ready: 0, failed: 0 });
    const flaggedDocuments = documents
      .map((document) => {
        const chunkCount = chunkCountByDocument.get(document._id) ?? 0;
        const embeddingDrift = embeddingDriftByDocument.get(document._id);
        const flag = getKnowledgeDocumentQualityFlag({ document, chunkCount, now, embeddingDrift });
        if (!flag) return null;
        return {
          documentId: document._id,
          title: document.title,
          status: document.status,
          format: document.format,
          sourceUrl: document.sourceUrl,
          createdAt: document.createdAt,
          lastQueuedAt: document.lastQueuedAt,
          lastIngestionStartedAt: document.lastIngestionStartedAt,
          lastIngestedAt: document.lastIngestedAt,
          lastIngestionError: document.lastIngestionError,
          chunkCount,
          flag,
          embeddingDrift,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .slice(0, 12);
    const totalChunks = Array.from(chunkCountByDocument.values()).reduce((sum, count) => sum + count, 0);
    const readyDocuments = statusCounts.ready;
    const embeddingDriftCount = Array.from(embeddingDriftByDocument.values()).filter(Boolean).length;
    const agent = args.agentId ? await ctx.db.get(args.agentId) : null;
    const coverageTerms = agent ? getAgentCoverageTerms(agent) : [];
    const readyDocumentsForCoverage = coverageTerms.length > 0
      ? documents.filter((document) => document.status === "ready")
      : [];
    const coverageTextParts = await Promise.all(readyDocumentsForCoverage.map(async (document) => {
      const chunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .take(KNOWLEDGE_COVERAGE_CHUNK_SAMPLE_LIMIT);
      return [
        document.title,
        document.textContent,
        ...chunks.map((chunk) => chunk.text),
      ].filter(Boolean).join(" ");
    }));
    const coverageCorpus = coverageTextParts.join(" ").toLowerCase();
    const coverageCorpusTokens = new Set(coverageCorpus.match(/[a-z0-9]+/g) ?? []);
    const coveredCoverageTerms = coverageTerms.filter((term) => coverageCorpusTokens.has(term));
    const topicCoverage = coverageTerms.length > 0 ? {
      score: coveredCoverageTerms.length / coverageTerms.length,
      terms: coverageTerms.map((term) => ({
        term,
        covered: coverageCorpusTokens.has(term),
      })),
      coveredCount: coveredCoverageTerms.length,
      totalCount: coverageTerms.length,
      readyDocumentCount: readyDocumentsForCoverage.length,
      recommendation: readyDocumentsForCoverage.length === 0
        ? "Add approved knowledge documents before relying on this agent."
        : coverageTerms.some((term) => !coverageCorpusTokens.has(term))
          ? "Add or repair knowledge for missing agent-purpose topics before release."
          : "Agent-purpose topics are represented in sampled ready knowledge.",
    } : null;

    return {
      totals: {
        documents: documents.length,
        ready: readyDocuments,
        pending: statusCounts.pending,
        processing: statusCounts.processing,
        failed: statusCounts.failed,
        flagged: flaggedDocuments.length,
        embeddingDrift: embeddingDriftCount,
        sampledChunks: totalChunks,
        readyCoverage: documents.length > 0 ? readyDocuments / documents.length : 0,
      },
      topicCoverage,
      flaggedDocuments,
    };
  },
});

export const inspectDocument = tenantQuery({
  args: {
    documentId: v.id("knowledgeDocuments"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");
    await assertCanInspectKnowledgeDocument(ctx, document);

    const chunks = await ctx.db
      .query("knowledgeChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .take(KNOWLEDGE_INSPECTION_CHUNK_LIMIT);
    const activeEmbeddingModel = await getActiveEmbeddingModelForCompany(ctx, document.companyId);
    const embeddingDrift = summarizeEmbeddingDrift({ document, activeEmbeddingModel });
    const auditLogRows = await ctx.db
      .query("auditLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(200);
    const history = await Promise.all(auditLogRows
      .filter((log) => log.entityType === "knowledgeDocuments" && log.entityId === document._id)
      .slice(0, KNOWLEDGE_HISTORY_LIMIT)
      .map(async (log) => {
        const actor = await ctx.db.get(log.actorId);
        return {
          actionType: log.actionType,
          timestamp: log.timestamp,
          actorEmail: actor?.email,
          metadata: parseAuditMetadata(log.metadata),
        };
      }));

    return {
      document: {
        documentId: document._id,
        title: document.title,
        status: document.status,
        format: document.format,
        sourceUrl: document.sourceUrl,
        createdAt: document.createdAt,
        lastQueuedAt: document.lastQueuedAt,
        lastIngestionStartedAt: document.lastIngestionStartedAt,
        lastIngestedAt: document.lastIngestedAt,
        lastIngestionError: document.lastIngestionError,
        embeddingProviderKey: document.embeddingProviderKey,
        embeddingModelId: document.embeddingModelId,
        embeddingProviderModelId: document.embeddingProviderModelId,
        embeddingDimensions: document.embeddingDimensions,
      },
      activeEmbeddingModel,
      embeddingDrift,
      history,
      chunkCount: chunks.length,
      chunks: chunks.map((chunk, index) => ({
        chunkId: chunk._id,
        index,
        preview: truncatePreview(chunk.text),
        characterCount: chunk.text.length,
        embeddingDimensions: chunk.embeddingDimensions ?? chunk.embedding.length,
        embeddingProviderKey: chunk.embeddingProviderKey,
        embeddingModelId: chunk.embeddingModelId,
        embeddingProviderModelId: chunk.embeddingProviderModelId,
      })),
      safetyNotice: "Chunk text is untrusted reference material and must not be promoted into system instructions.",
    };
  },
});

export const testRetrieval = tenantQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmedQuery = args.query.trim();
    const tokens = getRetrievalTokens(trimmedQuery);
    if (!trimmedQuery || tokens.length === 0) {
      return {
        query: trimmedQuery,
        inspectedDocuments: 0,
        inspectedChunks: 0,
        matches: [],
        safetyNotice: "Retrieval test results are untrusted reference material previews, not system instructions.",
      };
    }

    const documents = (await getKnowledgeDocumentsForScope(ctx, args, KNOWLEDGE_RETRIEVAL_DOCUMENT_LIMIT))
      .filter((document) => document.status === "ready");
    const matches = [];
    let inspectedChunks = 0;

    for (const document of documents) {
      const chunks = await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .take(KNOWLEDGE_RETRIEVAL_CHUNK_LIMIT);

      for (const chunk of chunks) {
        inspectedChunks++;
        const scored = scoreChunkForRetrieval({ chunkText: chunk.text, query: trimmedQuery, tokens });
        if (scored.score === 0) continue;
        matches.push({
          documentId: document._id,
          chunkId: chunk._id,
          title: document.title,
          status: document.status,
          format: document.format,
          sourceUrl: document.sourceUrl,
          score: scored.score,
          matchedTerms: scored.matchedTerms,
          phraseHit: scored.phraseHit,
          preview: truncatePreview(chunk.text, 520),
          embeddingModelId: chunk.embeddingModelId ?? document.embeddingModelId,
          embeddingDimensions: chunk.embeddingDimensions ?? chunk.embedding.length,
        });
      }
    }

    matches.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));

    return {
      query: trimmedQuery,
      inspectedDocuments: documents.length,
      inspectedChunks,
      matches: matches.slice(0, KNOWLEDGE_RETRIEVAL_RESULT_LIMIT),
      safetyNotice: "Retrieval test results are untrusted reference material previews, not system instructions.",
    };
  },
});

export const getThreadDocuments = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
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

export const saveDocument = tenantMutation({
  args: {
    storageId: v.id("_storage"),
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    title: v.string(),
    format: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const scope = getWritableKnowledgeScope(user, args);

    await validateStoredUpload(ctx, args.storageId, validateKnowledgeDocumentMetadata);

    const documentId = await ctx.db.insert("knowledgeDocuments", buildKnowledgeDocumentRecord({
      title: args.title,
      fileId: args.storageId,
      status: "processing",
      format: args.format,
      createdBy: userId,
      createdAt: Date.now(),
      lastQueuedAt: Date.now(),
      companyId: scope.companyId,
      agentId: scope.agentId,
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
      metadata: getKnowledgeAuditMetadata({ title: args.title, format: args.format, scope })
    });

    return documentId;
  },
});

export const saveChatDocument = tenantMutation({
  args: {
    storageId: v.id("_storage"),
    threadId: v.id("threads"),
    title: v.string(),
    format: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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
      lastQueuedAt: Date.now(),
    }));

    // Fire ephemeral doc ingestion job
    await ctx.scheduler.runAfter(0, internal.knowledgeActions.ingestDocument, {
      documentId,
      storageId: args.storageId,
    });

    return documentId;
  },
});

export const deleteDocument = tenantMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

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

export const retryDocumentIngestion = tenantMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");

    const { userId } = await assertCanRepairKnowledgeDocument(ctx, document);
    const nextStatus = await requeueKnowledgeDocument(ctx, document);

    await ctx.db.insert("auditLogs", {
      actionType: "RETRY_KNOWLEDGE_DOCUMENT",
      actorId: userId,
      entityType: "knowledgeDocuments",
      entityId: document._id,
      timestamp: Date.now(),
      metadata: getKnowledgeAuditMetadata({ title: document.title, format: document.format, scope: document }),
    });

    return {
      documentId: document._id,
      status: nextStatus,
    };
  },
});

export const repairFlaggedDocuments = tenantMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const documents = await getRepairableKnowledgeDocumentsForScope(ctx, args);
    const activeEmbeddingModels = new Map<string, ActiveEmbeddingModel | null>();
    const getActiveEmbeddingModelForDocument = async (document: Doc<"knowledgeDocuments">) => {
      const cacheKey = document.companyId ?? "global";
      if (!activeEmbeddingModels.has(cacheKey)) {
        activeEmbeddingModels.set(cacheKey, await getActiveEmbeddingModelForCompany(ctx, document.companyId));
      }
      return activeEmbeddingModels.get(cacheKey) ?? null;
    };

    const repaired = [];
    let repairedWebsiteDocuments = 0;
    const now = Date.now();
    for (const document of documents) {
      if (document.threadId) continue;
      const chunkCount = await getKnowledgeDocumentChunkCount(ctx, document._id);
      const embeddingDrift = summarizeEmbeddingDrift({
        document,
        activeEmbeddingModel: await getActiveEmbeddingModelForDocument(document),
      });
      const flag = getKnowledgeDocumentQualityFlag({ document, chunkCount, now, embeddingDrift });
      if (!flag) continue;

      const status = await requeueKnowledgeDocument(ctx, document, { scheduleWebsiteQueue: false });
      if (document.format === "url") repairedWebsiteDocuments += 1;
      repaired.push({
        documentId: document._id,
        title: document.title,
        flag,
        status,
      });
    }

    if (repairedWebsiteDocuments > 0) {
      await ctx.scheduler.runAfter(0, internal.knowledgeActions.processWebsiteQueue);
    }

    if (repaired.length > 0) {
      await ctx.db.insert("auditLogs", {
        actionType: "BULK_REPAIR_KNOWLEDGE_DOCUMENTS",
        actorId: userId,
        entityType: "knowledgeDocuments",
        entityId: args.agentId ?? args.companyId ?? "GLOBAL_KNOWLEDGE",
        timestamp: Date.now(),
        metadata: JSON.stringify({
          count: repaired.length,
          inspectedCount: documents.length,
          documentIds: repaired.map((entry) => entry.documentId),
          flags: repaired.map((entry) => entry.flag),
        }),
      });
    }

    return {
      inspectedCount: documents.length,
      repairedCount: repaired.length,
      repaired,
    };
  },
});

export const getDocInternal = internalQuery({
  args: { id: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
      return await ctx.db.get(args.id);
  }
});

export const markDocIngestionStartedInternal = internalMutation({
  args: { documentId: v.id("knowledgeDocuments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      status: "processing",
      lastIngestionStartedAt: Date.now(),
      lastIngestionError: undefined,
    });
  },
});

export const markDocPendingInternal = internalMutation({
  args: {
    documentId: v.id("knowledgeDocuments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      status: "pending",
      lastQueuedAt: Date.now(),
      lastIngestionError: args.reason ? truncateIngestionError(args.reason) : undefined,
    });
  },
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

export const saveManualText = tenantMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    title: v.string(),
    textContent: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const scope = getWritableKnowledgeScope(user, args);

    const documentId = await ctx.db.insert("knowledgeDocuments", buildKnowledgeDocumentRecord({
      title: args.title,
      textContent: args.textContent,
      status: "processing",
      format: "text/plain",
      createdBy: userId,
      createdAt: Date.now(),
      lastQueuedAt: Date.now(),
      companyId: scope.companyId,
      agentId: scope.agentId,
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
      metadata: getKnowledgeAuditMetadata({ title: args.title, format: "text/plain", scope })
    });

    return documentId;
  },
});

export const queueWebsiteUrls = tenantMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    urls: v.array(v.string()),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const scope = getWritableKnowledgeScope(user, args);

    const docIds = [];
    for (const url of args.urls) {
        // 🛡️ SECURITY: Central SSRF Prevention Shield
        validateSafeUrl(url, "Knowledge Base Import");

        // Simple duplicates check
        const existing = await ctx.db
            .query("knowledgeDocuments")
            .withIndex("by_source_company", (q) => q.eq("sourceUrl", url).eq("companyId", scope.companyId).eq("agentId", scope.agentId))
            .first();
            
        if (existing) {
             if (args.forceRefresh) {
                 await ctx.db.patch(existing._id, {
                   status: "pending",
                   lastQueuedAt: Date.now(),
                   lastIngestionError: undefined,
                 });
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
          lastQueuedAt: Date.now(),
          companyId: scope.companyId,
          agentId: scope.agentId,
        }));
        docIds.push(documentId);
    }

    if (docIds.length > 0) {
       await ctx.scheduler.runAfter(0, internal.knowledgeActions.processWebsiteQueue);
    }
    
    return docIds;
  },
});

export const deleteWebsiteBulk = tenantMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    agentId: v.optional(v.id("agents")),
    rootDomain: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const scope = getWritableKnowledgeScope(user, args);

    const docs = scope.agentId
        ? await ctx.db
          .query("knowledgeDocuments")
          .withIndex("by_agent_format", (q) => q.eq("agentId", scope.agentId).eq("format", "url"))
          .filter((q) => q.eq(q.field("companyId"), scope.companyId))
          .order("desc")
          .take(500)
        : scope.companyId
          ? await ctx.db
            .query("knowledgeDocuments")
            .withIndex("by_company_format", (q) => q.eq("companyId", scope.companyId).eq("format", "url"))
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
            lastIngestedAt: Date.now(),
            lastIngestionError: undefined,
        });
      }
  }
});

export const markDocFailedInternal = internalMutation({
  args: {
    documentId: v.id("knowledgeDocuments"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
     await ctx.db.patch(args.documentId, {
         status: "failed",
         lastIngestionError: truncateIngestionError(args.error),
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
