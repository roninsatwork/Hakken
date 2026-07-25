import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { getAssistantSafetyWarnings } from "./aiSafetyPolicy";
import { recordCompanyAiDriftEvent } from "./companyReadiness";

const MEMORY_CONTENT_MAX_CHARS = 4000;
const MEMORY_TITLE_MAX_CHARS = 120;
const DEFAULT_CONFIDENCE = 0.8;
const RUNTIME_MEMORY_LIMIT_DEFAULT = 5;
const RUNTIME_MEMORY_LIMIT_MAX = 8;

const memoryCategoryValidator = v.union(
  v.literal("FACT"),
  v.literal("PREFERENCE"),
  v.literal("POSITIONING"),
  v.literal("TONE"),
  v.literal("BOUNDARY"),
  v.literal("SALES"),
  v.literal("SUPPORT"),
  v.literal("OTHER")
);

const memorySourceTypeValidator = v.union(
  v.literal("MANUAL"),
  v.literal("CHAT"),
  v.literal("WIDGET"),
  v.literal("KNOWLEDGE"),
  v.literal("EVAL"),
  v.literal("AGENT_RUN"),
  v.literal("WORKFLOW_RUN")
);

const memoryStatusValidator = v.union(
  v.literal("APPROVED"),
  v.literal("ARCHIVED")
);

const candidateStatusValidator = v.union(
  v.literal("PROPOSED"),
  v.literal("APPROVED"),
  v.literal("REJECTED")
);

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeContent(content: string) {
  const normalizedContent = normalizeText(content);
  if (normalizedContent.length === 0) throw new Error("Memory content cannot be empty.");
  if (normalizedContent.length > MEMORY_CONTENT_MAX_CHARS) {
    throw new Error(`Memory content cannot exceed ${MEMORY_CONTENT_MAX_CHARS} characters.`);
  }

  const warnings = getAssistantSafetyWarnings(normalizedContent);
  if (warnings.length > 0) {
    throw new Error(`Memory content rejected by safety policy: ${warnings.map((warning) => warning.category).join(", ")}`);
  }

  return normalizedContent;
}

function normalizeTitle(title: string | undefined, content: string) {
  const normalizedTitle = normalizeText(title || content.slice(0, MEMORY_TITLE_MAX_CHARS));
  if (normalizedTitle.length === 0) throw new Error("Memory title cannot be empty.");
  if (normalizedTitle.length > MEMORY_TITLE_MAX_CHARS) {
    throw new Error(`Memory title cannot exceed ${MEMORY_TITLE_MAX_CHARS} characters.`);
  }
  return normalizedTitle;
}

function clampConfidence(value: number | undefined) {
  if (!Number.isFinite(value ?? DEFAULT_CONFIDENCE)) return DEFAULT_CONFIDENCE;
  return Math.min(Math.max(value ?? DEFAULT_CONFIDENCE, 0), 1);
}

function getSearchTerms(queryText: string) {
  return queryText
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9]/g, ""))
    .filter((term) => term.length >= 3)
    .slice(0, 10);
}

function scoreMemory(memory: Pick<Doc<"companyMemories">, "title" | "content" | "category" | "confidence">, terms: string[]) {
  if (terms.length === 0) return 0;
  const searchable = `${memory.title} ${memory.content} ${memory.category}`.toLowerCase();
  const termScore = terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0);
  return termScore + memory.confidence * 0.25;
}

function getRuntimeMemoryLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? RUNTIME_MEMORY_LIMIT_DEFAULT)) return RUNTIME_MEMORY_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.floor(limit ?? RUNTIME_MEMORY_LIMIT_DEFAULT), 1), RUNTIME_MEMORY_LIMIT_MAX);
}

function getRejectedFingerprint(content: string) {
  return normalizeContent(content).toLowerCase();
}

async function requireCompanyAccess(ctx: QueryCtx | MutationCtx, companyId: Id<"companies">) {
  const { user, userId } = await requireAdmin(ctx);
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");
  assertAdminCanAccessCompany(user, companyId);
  return { user, userId, company };
}

async function assertNoRejectedCandidateMatch(ctx: QueryCtx | MutationCtx, companyId: Id<"companies">, content: string) {
  const rejectedFingerprint = getRejectedFingerprint(content);
  const rejectedCandidate = await ctx.db
    .query("companyMemoryCandidates")
    .withIndex("by_company_rejected_fingerprint", (q) =>
      q.eq("companyId", companyId).eq("rejectedFingerprint", rejectedFingerprint)
    )
    .first();

  if (rejectedCandidate) {
    throw new Error("Memory candidate matches a previously rejected company memory.");
  }
}

function buildAuditMetadata(extra: Record<string, unknown>) {
  return JSON.stringify(extra);
}

export const getSummary = adminQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    const [approved, archived, proposed, rejected] = await Promise.all([
      ctx.db
        .query("companyMemories")
        .withIndex("by_company_status_updated", (q) =>
          q.eq("companyId", args.companyId).eq("status", "APPROVED")
        )
        .take(1000),
      ctx.db
        .query("companyMemories")
        .withIndex("by_company_status_updated", (q) =>
          q.eq("companyId", args.companyId).eq("status", "ARCHIVED")
        )
        .take(1000),
      ctx.db
        .query("companyMemoryCandidates")
        .withIndex("by_company_status_created", (q) =>
          q.eq("companyId", args.companyId).eq("status", "PROPOSED")
        )
        .take(1000),
      ctx.db
        .query("companyMemoryCandidates")
        .withIndex("by_company_status_created", (q) =>
          q.eq("companyId", args.companyId).eq("status", "REJECTED")
        )
        .take(1000),
    ]);

    return {
      approved: approved.length,
      archived: archived.length,
      proposed: proposed.length,
      rejected: rejected.length,
      totalUsageCount: approved.reduce((total, memory) => total + memory.usageCount, 0),
    };
  },
});

export const getPreviewForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);
    const limit = getRuntimeMemoryLimit(args.limit);

    return await ctx.db
      .query("companyMemories")
      .withIndex("by_company_status_updated", (q) =>
        q.eq("companyId", args.companyId).eq("status", "APPROVED")
      )
      .order("desc")
      .take(limit);
  },
});

export const getMemoryById = adminQuery({
  args: {
    memoryId: v.id("companyMemories"),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory) throw new Error("Company memory not found");
    await requireCompanyAccess(ctx, memory.companyId);
    return memory;
  },
});

export const getRuntimeMemoriesInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    queryText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const terms = getSearchTerms(args.queryText);
    if (terms.length === 0) return [];

    const limit = getRuntimeMemoryLimit(args.limit);
    const memories = await ctx.db
      .query("companyMemories")
      .withIndex("by_company_status_updated", (q) =>
        q.eq("companyId", args.companyId).eq("status", "APPROVED")
      )
      .order("desc")
      .take(100);

    return memories
      .map((memory) => ({
        memory,
        score: scoreMemory(memory, terms),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({
        memoryId: entry.memory._id,
        title: entry.memory.title,
        content: entry.memory.content,
        category: entry.memory.category,
        confidence: entry.memory.confidence,
        score: entry.score,
        updatedAt: entry.memory.updatedAt,
      }));
  },
});

export const recordRuntimeUsageInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    threadId: v.id("threads"),
    messageId: v.optional(v.id("messages")),
    queryText: v.string(),
    memories: v.array(v.object({
      memoryId: v.id("companyMemories"),
      score: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const memoryMatch of args.memories) {
      const memory = await ctx.db.get(memoryMatch.memoryId);
      if (!memory || memory.companyId !== args.companyId || memory.status !== "APPROVED") continue;

      await ctx.db.insert("companyMemoryUsage", {
        memoryId: memoryMatch.memoryId,
        companyId: args.companyId,
        threadId: args.threadId,
        messageId: args.messageId,
        queryText: args.queryText,
        score: memoryMatch.score,
        usedAt: now,
      });

      await ctx.db.patch(memoryMatch.memoryId, {
        usageCount: memory.usageCount + 1,
        lastUsedAt: now,
        updatedAt: now,
      });
    }
  },
});

export const getForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    status: v.optional(memoryStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    if (args.status) {
      return await ctx.db
        .query("companyMemories")
        .withIndex("by_company_status_updated", (q) =>
          q.eq("companyId", args.companyId).eq("status", args.status as Doc<"companyMemories">["status"])
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("companyMemories")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getCandidatesForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    status: v.optional(candidateStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    if (args.status) {
      return await ctx.db
        .query("companyMemoryCandidates")
        .withIndex("by_company_status_created", (q) =>
          q.eq("companyId", args.companyId).eq("status", args.status as Doc<"companyMemoryCandidates">["status"])
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("companyMemoryCandidates")
      .withIndex("by_company_created", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const createMemory = adminMutation({
  args: {
    companyId: v.id("companies"),
    title: v.optional(v.string()),
    content: v.string(),
    category: memoryCategoryValidator,
    confidence: v.optional(v.number()),
    sourceType: v.optional(memorySourceTypeValidator),
    sourceIdsJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    await assertNoRejectedCandidateMatch(ctx, args.companyId, args.content);

    const content = normalizeContent(args.content);
    const title = normalizeTitle(args.title, content);
    const now = Date.now();
    const memoryId = await ctx.db.insert("companyMemories", {
      companyId: args.companyId,
      title,
      content,
      normalizedContent: content.toLowerCase(),
      category: args.category,
      status: "APPROVED",
      confidence: clampConfidence(args.confidence),
      sourceType: args.sourceType ?? "MANUAL",
      sourceIdsJson: args.sourceIdsJson,
      createdBy: userId,
      approvedBy: userId,
      createdAt: now,
      updatedAt: now,
      approvedAt: now,
      usageCount: 0,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_COMPANY_MEMORY",
      entityId: memoryId,
      entityType: "companyMemories",
      companyId: args.companyId,
      timestamp: now,
      metadata: buildAuditMetadata({ category: args.category, contentLength: content.length }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: args.companyId,
      sourceType: "MEMORY",
      sourceId: memoryId,
      reason: "Company memory was created.",
      affectedEvalCategories: ["MEMORY_USAGE", "NO_HALLUCINATION", "WIDGET_READINESS"],
      createdBy: userId,
      createdAt: now,
    });

    return memoryId;
  },
});

export const updateMemory = adminMutation({
  args: {
    memoryId: v.id("companyMemories"),
    title: v.string(),
    content: v.string(),
    category: memoryCategoryValidator,
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.memoryId);
    if (!existing) throw new Error("Memory not found");
    const { userId } = await requireCompanyAccess(ctx, existing.companyId);
    if (existing.status !== "APPROVED") throw new Error("Only approved company memories can be edited.");
    await assertNoRejectedCandidateMatch(ctx, existing.companyId, args.content);

    const content = normalizeContent(args.content);
    const title = normalizeTitle(args.title, content);
    const now = Date.now();
    await ctx.db.patch(args.memoryId, {
      title,
      content,
      normalizedContent: content.toLowerCase(),
      category: args.category,
      confidence: clampConfidence(args.confidence),
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_COMPANY_MEMORY",
      entityId: args.memoryId,
      entityType: "companyMemories",
      companyId: existing.companyId,
      timestamp: now,
      metadata: buildAuditMetadata({ category: args.category, contentLength: content.length }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: existing.companyId,
      sourceType: "MEMORY",
      sourceId: args.memoryId,
      reason: "Company memory was edited.",
      affectedEvalCategories: ["MEMORY_USAGE", "NO_HALLUCINATION", "WIDGET_READINESS"],
      createdBy: userId,
      createdAt: now,
    });

    return true;
  },
});

export const archiveMemory = adminMutation({
  args: {
    memoryId: v.id("companyMemories"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.memoryId);
    if (!existing || existing.status === "ARCHIVED") throw new Error("Memory not found");
    const { userId } = await requireCompanyAccess(ctx, existing.companyId);
    const now = Date.now();

    await ctx.db.patch(args.memoryId, {
      status: "ARCHIVED",
      archivedBy: userId,
      archivedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "ARCHIVE_COMPANY_MEMORY",
      entityId: args.memoryId,
      entityType: "companyMemories",
      companyId: existing.companyId,
      timestamp: now,
      metadata: buildAuditMetadata({ category: existing.category, contentLength: existing.content.length }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: existing.companyId,
      sourceType: "MEMORY",
      sourceId: args.memoryId,
      reason: "Company memory was archived.",
      affectedEvalCategories: ["MEMORY_USAGE", "NO_HALLUCINATION", "WIDGET_READINESS"],
      createdBy: userId,
      createdAt: now,
    });

    return true;
  },
});

export const createCandidate = adminMutation({
  args: {
    companyId: v.id("companies"),
    title: v.optional(v.string()),
    content: v.string(),
    category: memoryCategoryValidator,
    sourceType: v.optional(memorySourceTypeValidator),
    sourceIdsJson: v.optional(v.string()),
    reason: v.optional(v.string()),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    await assertNoRejectedCandidateMatch(ctx, args.companyId, args.content);

    const content = normalizeContent(args.content);
    const title = args.title ? normalizeTitle(args.title, content) : undefined;
    const now = Date.now();
    const candidateId = await ctx.db.insert("companyMemoryCandidates", {
      companyId: args.companyId,
      title,
      content,
      normalizedContent: content.toLowerCase(),
      category: args.category,
      sourceType: args.sourceType ?? "MANUAL",
      sourceIdsJson: args.sourceIdsJson,
      reason: args.reason,
      confidence: clampConfidence(args.confidence),
      status: "PROPOSED",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_COMPANY_MEMORY_CANDIDATE",
      entityId: candidateId,
      entityType: "companyMemoryCandidates",
      companyId: args.companyId,
      timestamp: now,
      metadata: buildAuditMetadata({ category: args.category, contentLength: content.length }),
    });

    return candidateId;
  },
});

export const approveCandidate = adminMutation({
  args: {
    candidateId: v.id("companyMemoryCandidates"),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Memory candidate not found");
    const { userId } = await requireCompanyAccess(ctx, candidate.companyId);
    if (candidate.status !== "PROPOSED") throw new Error("Memory candidate has already been reviewed.");
    await assertNoRejectedCandidateMatch(ctx, candidate.companyId, candidate.content);

    const now = Date.now();
    const memoryId = await ctx.db.insert("companyMemories", {
      companyId: candidate.companyId,
      title: normalizeTitle(candidate.title, candidate.content),
      content: candidate.content,
      normalizedContent: candidate.normalizedContent,
      category: candidate.category,
      status: "APPROVED",
      confidence: candidate.confidence,
      sourceType: candidate.sourceType,
      sourceIdsJson: candidate.sourceIdsJson,
      createdBy: candidate.createdBy,
      approvedBy: userId,
      createdAt: now,
      updatedAt: now,
      approvedAt: now,
      usageCount: 0,
    });

    await ctx.db.patch(args.candidateId, {
      status: "APPROVED",
      reviewedBy: userId,
      reviewedAt: now,
      appliedMemoryId: memoryId,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "APPROVE_COMPANY_MEMORY_CANDIDATE",
      entityId: args.candidateId,
      entityType: "companyMemoryCandidates",
      companyId: candidate.companyId,
      timestamp: now,
      metadata: buildAuditMetadata({ memoryId, category: candidate.category, contentLength: candidate.content.length }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: candidate.companyId,
      sourceType: "MEMORY",
      sourceId: memoryId,
      reason: "Company memory candidate was approved.",
      affectedEvalCategories: ["MEMORY_USAGE", "NO_HALLUCINATION", "WIDGET_READINESS"],
      createdBy: userId,
      createdAt: now,
    });

    return memoryId;
  },
});

export const rejectCandidate = adminMutation({
  args: {
    candidateId: v.id("companyMemoryCandidates"),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Memory candidate not found");
    const { userId } = await requireCompanyAccess(ctx, candidate.companyId);
    if (candidate.status !== "PROPOSED") throw new Error("Memory candidate has already been reviewed.");

    const now = Date.now();
    await ctx.db.patch(args.candidateId, {
      status: "REJECTED",
      reviewedBy: userId,
      reviewedAt: now,
      rejectionReason: args.rejectionReason,
      rejectedFingerprint: getRejectedFingerprint(candidate.content),
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "REJECT_COMPANY_MEMORY_CANDIDATE",
      entityId: args.candidateId,
      entityType: "companyMemoryCandidates",
      companyId: candidate.companyId,
      timestamp: now,
      metadata: buildAuditMetadata({
        category: candidate.category,
        contentLength: candidate.content.length,
        rejectionReason: args.rejectionReason,
      }),
    });

    return true;
  },
});
