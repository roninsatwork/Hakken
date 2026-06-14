import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { getAssistantSafetyWarnings } from "./aiSafetyPolicy";

const MEMORY_SEARCH_LIMIT_DEFAULT = 5;
const MEMORY_SEARCH_LIMIT_MAX = 10;
const MEMORY_CONTENT_MAX_CHARS = 4000;
const MEMORY_USAGE_LIMIT = 1000;

const memoryKindValidator = v.union(
  v.literal("FACT"),
  v.literal("PREFERENCE"),
  v.literal("SUMMARY"),
  v.literal("INSTRUCTION")
);

function normalizeMemoryContent(content: string) {
  return content.trim().replace(/\s+/g, " ");
}

function validateMemoryContent(content: string) {
  const normalizedContent = normalizeMemoryContent(content);
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

function getSearchTerms(queryText: string) {
  return queryText
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9]/g, ""))
    .filter((term) => term.length >= 3)
    .slice(0, 8);
}

function scoreMemory(content: string, terms: string[]) {
  if (terms.length === 0) return 0;
  const normalized = content.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 1 : 0), 0);
}

function getMemoryLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? MEMORY_SEARCH_LIMIT_DEFAULT)) return MEMORY_SEARCH_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.floor(limit ?? MEMORY_SEARCH_LIMIT_DEFAULT), 1), MEMORY_SEARCH_LIMIT_MAX);
}

function clampImportance(value: number | undefined) {
  if (!Number.isFinite(value ?? 0.5)) return 0.5;
  return Math.min(Math.max(value ?? 0.5, 0), 1);
}

function getMemoryQualityScore(args: {
  importance: number;
  usageCount: number;
  successCount: number;
  failureCount: number;
  cancelledCount: number;
  lastUsedAt?: number;
  updatedAt: number;
}) {
  const successSignal = args.usageCount > 0 ? args.successCount / args.usageCount : 0;
  const failureSignal = args.usageCount > 0 ? (args.failureCount + args.cancelledCount) / args.usageCount : 0;
  const ageMs = Date.now() - Math.max(args.lastUsedAt ?? 0, args.updatedAt);
  const stalePenalty = ageMs > 90 * 24 * 60 * 60 * 1000 ? 0.15 : 0;
  return Math.min(Math.max(args.importance + successSignal * 0.35 - failureSignal * 0.45 - stalePenalty, 0), 1);
}

export const getForAgent = query({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    if (user.role === "ADMIN") {
      if (!user.companyId) throw new Error("Unauthorized");
      return await ctx.db
        .query("agentMemories")
        .withIndex("by_agent_company_active_updated", (q) =>
          q.eq("agentId", args.agentId).eq("companyId", user.companyId).eq("isActive", true)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("agentMemories")
      .withIndex("by_agent_active_updated", (q) => q.eq("agentId", args.agentId).eq("isActive", true))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const deleteMemory = mutation({
  args: {
    memoryId: v.id("agentMemories"),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.isActive === false) throw new Error("Memory not found");
    assertAdminCanAccessCompany(user, memory.companyId);

    const now = Date.now();
    await ctx.db.patch(args.memoryId, {
      isActive: false,
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "DELETE_AGENT_MEMORY",
      entityId: args.memoryId,
      entityType: "agentMemories",
      companyId: memory.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: memory.agentId,
        memoryKind: memory.kind,
        contentLength: memory.content.length,
      }),
    });

    return true;
  },
});

export const getQualityForAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");
    if (user.role === "ADMIN" && !user.companyId) throw new Error("Unauthorized");

    const memories = user.role === "ADMIN"
      ? await ctx.db
          .query("agentMemories")
          .withIndex("by_agent_company_active_updated", (q) =>
            q.eq("agentId", args.agentId).eq("companyId", user.companyId).eq("isActive", true)
          )
          .order("desc")
          .take(MEMORY_USAGE_LIMIT)
      : await ctx.db
          .query("agentMemories")
          .withIndex("by_agent_active_updated", (q) => q.eq("agentId", args.agentId).eq("isActive", true))
          .order("desc")
          .take(MEMORY_USAGE_LIMIT);

    const rows = await Promise.all(memories.map(async (memory) => {
      const usages = await ctx.db
        .query("agentMemoryUsage")
        .withIndex("by_memory_used", (q) => q.eq("memoryId", memory._id))
        .order("desc")
        .take(MEMORY_USAGE_LIMIT);
      const scopedUsages = user.role === "ADMIN"
        ? usages.filter((usage) => usage.companyId === user.companyId)
        : usages;
      const successCount = scopedUsages.filter((usage) => usage.outcome === "SUCCESS").length;
      const failureCount = scopedUsages.filter((usage) => usage.outcome === "FAILED").length;
      const cancelledCount = scopedUsages.filter((usage) => usage.outcome === "CANCELLED").length;
      const lastUsedAt = scopedUsages[0]?.usedAt;
      const qualityScore = getMemoryQualityScore({
        importance: memory.importance,
        usageCount: scopedUsages.length,
        successCount,
        failureCount,
        cancelledCount,
        lastUsedAt,
        updatedAt: memory.updatedAt,
      });
      const flags = [
        scopedUsages.length === 0 ? "UNUSED" : undefined,
        failureCount + cancelledCount > successCount && scopedUsages.length > 0 ? "REVIEW_NEGATIVE_OUTCOMES" : undefined,
        !lastUsedAt && Date.now() - memory.updatedAt > 90 * 24 * 60 * 60 * 1000 ? "STALE" : undefined,
        memory.kind === "INSTRUCTION" && failureCount > 0 ? "REVIEW_INSTRUCTION" : undefined,
      ].filter((flag): flag is string => Boolean(flag));

      return {
        memory,
        usageCount: scopedUsages.length,
        successCount,
        failureCount,
        cancelledCount,
        lastUsedAt,
        qualityScore,
        flags,
      };
    }));

    return rows.sort((a, b) => a.qualityScore - b.qualityScore);
  },
});

export const searchMemoryInternal = internalQuery({
  args: {
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    queryText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const terms = getSearchTerms(args.queryText);
    const limit = getMemoryLimit(args.limit);
    if (terms.length === 0) return [];

    const memories = args.companyId
      ? await ctx.db
          .query("agentMemories")
          .withIndex("by_agent_company_active_updated", (q) =>
            q.eq("agentId", args.agentId).eq("companyId", args.companyId).eq("isActive", true)
          )
          .order("desc")
          .take(100)
      : await ctx.db
          .query("agentMemories")
          .withIndex("by_agent_active_updated", (q) => q.eq("agentId", args.agentId).eq("isActive", true))
          .order("desc")
          .take(100);

    return memories
      .map((memory) => ({
        memory,
        score: scoreMemory(memory.normalizedContent, terms) + memory.importance,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({
        id: entry.memory._id,
        kind: entry.memory.kind,
        content: entry.memory.content,
        importance: entry.memory.importance,
        score: entry.score,
        updatedAt: entry.memory.updatedAt,
      }));
  },
});

export const recordUsageInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    queryText: v.string(),
    memories: v.array(v.object({
      memoryId: v.id("agentMemories"),
      score: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const memory of args.memories) {
      const existing = await ctx.db
        .query("agentMemoryUsage")
        .withIndex("by_run", (q) => q.eq("runId", args.runId))
        .filter((q) => q.eq(q.field("memoryId"), memory.memoryId))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          score: memory.score,
          queryText: args.queryText,
          updatedAt: now,
        });
        continue;
      }
      await ctx.db.insert("agentMemoryUsage", {
        memoryId: memory.memoryId,
        agentId: args.agentId,
        companyId: args.companyId,
        runId: args.runId,
        score: memory.score,
        queryText: args.queryText,
        outcome: "OBSERVED",
        usedAt: now,
        updatedAt: now,
      });
    }
  },
});

export const writeMemoryInternal = internalMutation({
  args: {
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    sourceRunId: v.optional(v.id("agentRuns")),
    sourceThreadId: v.optional(v.id("threads")),
    kind: memoryKindValidator,
    content: v.string(),
    importance: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const normalizedContent = validateMemoryContent(args.content);
    const now = Date.now();
    const memoryId = await ctx.db.insert("agentMemories", {
      agentId: args.agentId,
      companyId: args.companyId,
      userId: args.userId,
      sourceRunId: args.sourceRunId,
      sourceThreadId: args.sourceThreadId,
      kind: args.kind,
      content: normalizedContent,
      normalizedContent: normalizedContent.toLowerCase(),
      importance: clampImportance(args.importance),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: args.createdBy,
    });

    if (args.createdBy) {
      await ctx.db.insert("auditLogs", {
        actorId: args.createdBy,
        actionType: "WRITE_AGENT_MEMORY",
        entityId: memoryId,
        entityType: "agentMemories",
        companyId: args.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          agentId: args.agentId,
          sourceRunId: args.sourceRunId,
          kind: args.kind,
          contentLength: normalizedContent.length,
        }),
      });
    }

    return memoryId;
  },
});
