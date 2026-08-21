import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { getAssistantSafetyWarnings } from "./aiSafetyPolicy";
import { appError } from "./utils/appError";
import type { Doc, Id } from "./_generated/dataModel";
import {
  MAX_ALWAYS_MEMORIES,
  resolveAgentApplyMode,
  type MemoryApplyMode,
} from "./utils/memoryApplication";
import {
  blendedMemoryRank,
  buildMemorySearchQuery,
  memoryQualityScore,
  qualityForRanking,
  rankScore,
} from "./utils/memoryRetrieval";
import { getSelfImprovementConfig } from "./selfImprovementConfig";

const MEMORY_SEARCH_LIMIT_DEFAULT = 5;
const MEMORY_SEARCH_LIMIT_MAX = 10;
const MEMORY_CONTENT_MAX_CHARS = 4000;
const MEMORY_USAGE_LIMIT = 1000;

const applyModeValidator = v.union(
  v.literal("ALWAYS"),
  v.literal("WHEN_RELEVANT")
);

/**
 * Tidy a memory's body without flattening it: runs of spaces and tabs collapse,
 * line breaks are what the writer meant.
 */
function normalizeMemoryContent(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function validateMemoryContent(content: string) {
  const normalizedContent = normalizeMemoryContent(content);
  if (normalizedContent.length === 0) throw appError("INVALID_INPUT", "Memory content cannot be empty.");
  if (normalizedContent.length > MEMORY_CONTENT_MAX_CHARS) {
    throw appError("INVALID_INPUT", `Memory content cannot exceed ${MEMORY_CONTENT_MAX_CHARS} characters.`);
  }

  const warnings = getAssistantSafetyWarnings(normalizedContent);
  if (warnings.length > 0) {
    throw appError("INVALID_INPUT", `Memory content rejected by safety policy: ${warnings.map((warning) => warning.category).join(", ")}`);
  }

  return normalizedContent;
}

function getMemoryLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? MEMORY_SEARCH_LIMIT_DEFAULT)) return MEMORY_SEARCH_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.floor(limit ?? MEMORY_SEARCH_LIMIT_DEFAULT), 1), MEMORY_SEARCH_LIMIT_MAX);
}

function clampImportance(value: number | undefined) {
  if (!Number.isFinite(value ?? 0.5)) return 0.5;
  return Math.min(Math.max(value ?? 0.5, 0), 1);
}


export const getForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
    /** False lists what has been removed, which had nowhere to be seen before. */
    isActive: v.optional(v.boolean()),
    searchTerm: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw appError("NOT_FOUND", "Agent not found");
    if (user.role === "ADMIN" && !user.companyId) throw appError("UNAUTHORIZED", "Unauthorized");

    const isActive = args.isActive ?? true;
    const companyId = user.role === "ADMIN" ? user.companyId : undefined;

    // Narrowed in the database rather than in the browser, so an agent with a
    // long list can still be searched past the first page.
    const searchTerm = args.searchTerm?.trim().toLowerCase();
    if (searchTerm) {
      return await ctx.db
        .query("agentMemories")
        .withSearchIndex("search_content", (q) => {
          const search = q.search("normalizedContent", searchTerm)
            .eq("agentId", args.agentId)
            .eq("isActive", isActive);
          return companyId ? search.eq("companyId", companyId) : search;
        })
        .paginate(args.paginationOpts);
    }

    if (companyId) {
      return await ctx.db
        .query("agentMemories")
        .withIndex("by_agent_company_active_updated", (q) =>
          q.eq("agentId", args.agentId).eq("companyId", companyId).eq("isActive", isActive)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("agentMemories")
      .withIndex("by_agent_active_updated", (q) => q.eq("agentId", args.agentId).eq("isActive", isActive))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const deleteMemory = adminMutation({
  args: {
    memoryId: v.id("agentMemories"),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.isActive === false) throw appError("NOT_FOUND", "Memory not found");
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

export const getQualityForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw appError("NOT_FOUND", "Agent not found");
    if (user.role === "ADMIN" && !user.companyId) throw appError("UNAUTHORIZED", "Unauthorized");

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
      const qualityScore = memoryQualityScore({
        importance: memory.importance,
        usageCount: scopedUsages.length,
        successCount,
        failureCount,
        cancelledCount,
        lastUsedAt,
        updatedAt: memory.updatedAt,
        now: Date.now(),
      });
      // What ranking actually used, so "why did this memory move" has an
      // answer on the screen rather than in a debugger.
      const rankingQuality = qualityForRanking({
        importance: memory.importance,
        successCount: memory.successCount,
        failureCount: memory.failureCount,
        cancelledCount: memory.cancelledCount,
        lastOutcomeAt: memory.lastOutcomeAt,
        now: Date.now(),
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
        rankingQuality,
        flags,
      };
    }));

    return rows.sort((a, b) => a.qualityScore - b.qualityScore);
  },
});

function toRuntimeAgentMemory(memory: Doc<"agentMemories">, score: number) {
  return {
    id: memory._id,
    title: memory.content.slice(0, 80),
    content: memory.content,
    applyMode: resolveAgentApplyMode(memory),
    importance: memory.importance,
    score,
    updatedAt: memory.updatedAt,
  };
}

/**
 * The agent's ALWAYS memories.
 *
 * Two reads for the same reason as the company side: `applyMode` is optional,
 * so a row written before the backfill carries no value and an index equality
 * would skip it. The unstamped bucket is classified by its old kind and empties
 * out once the migration has run.
 */
export const getAlwaysMemoriesInternal = internalQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const [stamped, unstamped] = await Promise.all([
      ctx.db
        .query("agentMemories")
        .withIndex("by_agent_active_applymode_updated", (q) =>
          q.eq("agentId", args.agentId).eq("isActive", true).eq("applyMode", "ALWAYS")
        )
        .order("desc")
        .take(MAX_ALWAYS_MEMORIES),
      ctx.db
        .query("agentMemories")
        .withIndex("by_agent_active_applymode_updated", (q) =>
          q.eq("agentId", args.agentId).eq("isActive", true).eq("applyMode", undefined)
        )
        .order("desc")
        .take(MAX_ALWAYS_MEMORIES),
    ]);

    const memories = [
      ...stamped,
      ...unstamped.filter((memory) => resolveAgentApplyMode(memory) === "ALWAYS"),
    ].slice(0, MAX_ALWAYS_MEMORIES);

    return memories.map((memory, index) => toRuntimeAgentMemory(memory, rankScore(index, memories.length)));
  },
});

/**
 * The WHEN_RELEVANT memories matching this message.
 *
 * This used to read the newest hundred rows, count substring hits, then add the
 * memory's importance to that count *before* filtering on `score > 0` — and
 * since importance defaults to 0.5, the filter passed everything. It always
 * returned five memories whether or not any of them had anything to do with the
 * question. The full-text index does the selecting now.
 */
export const searchMemoryInternal = internalQuery({
  args: {
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    queryText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = getMemoryLimit(args.limit);
    const searchQuery = buildMemorySearchQuery(args.queryText);
    if (searchQuery.length === 0) return [];

    const matches = await ctx.db
      .query("agentMemories")
      .withSearchIndex("search_content", (q) => {
        const search = q.search("normalizedContent", searchQuery)
          .eq("agentId", args.agentId)
          .eq("isActive", true);
        return args.companyId ? search.eq("companyId", args.companyId) : search;
      })
      // Room to drop the ALWAYS matches, which the system instruction already
      // carries and which would otherwise reach the model twice.
      .take(limit * 2);

    const kept = matches.filter((memory) => resolveAgentApplyMode(memory) === "WHEN_RELEVANT");

    const config = await getSelfImprovementConfig(ctx.db);
    if (!config.outcomeWeightedRanking) {
      return kept
        .slice(0, limit)
        .map((memory, index, list) => toRuntimeAgentMemory(memory, rankScore(index, list.length)));
    }

    // Outcome-weighted: text relevance keeps 70% of the say, track record 30%
    // (self-improvement plan, Phase 2). Reordering only — every match the
    // positional path would return is still returned, in different order.
    const now = Date.now();
    const scored = kept.map((memory, index) => ({
      memory,
      blended: blendedMemoryRank({
        positionalScore: rankScore(index, kept.length),
        quality: qualityForRanking({
          importance: memory.importance,
          successCount: memory.successCount,
          failureCount: memory.failureCount,
          cancelledCount: memory.cancelledCount,
          lastOutcomeAt: memory.lastOutcomeAt,
          now,
        }),
      }),
      index,
    }));
    // Stable on the original search order for equal scores.
    scored.sort((a, b) => b.blended - a.blended || a.index - b.index);

    return scored
      .slice(0, limit)
      .map((entry) => toRuntimeAgentMemory(entry.memory, entry.blended));
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

/**
 * The kind column is kept on the row for the audit trail but no longer decides
 * anything. Deriving it from the mode keeps it truthful rather than arbitrary.
 */
function kindForApplyMode(applyMode: MemoryApplyMode) {
  return applyMode === "ALWAYS" ? "INSTRUCTION" as const : "FACT" as const;
}

/**
 * Insert an agent memory.
 *
 * Shared by the admin form and by the path that applies an approved suggestion,
 * so both write the same shape. This replaces `writeMemoryInternal`, an
 * internalMutation that nothing but its own tests ever called.
 */
export async function insertAgentMemory(ctx: MutationCtx, args: {
  agentId: Id<"agents">;
  companyId?: Id<"companies">;
  userId?: Id<"users">;
  sourceRunId?: Id<"agentRuns">;
  sourceThreadId?: Id<"threads">;
  applyMode: MemoryApplyMode;
  content: string;
  importance?: number;
  createdBy?: Id<"users">;
}) {
  const normalizedContent = validateMemoryContent(args.content);
  const now = Date.now();
  const memoryId = await ctx.db.insert("agentMemories", {
    agentId: args.agentId,
    companyId: args.companyId,
    userId: args.userId,
    sourceRunId: args.sourceRunId,
    sourceThreadId: args.sourceThreadId,
    kind: kindForApplyMode(args.applyMode),
    applyMode: args.applyMode,
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
        applyMode: args.applyMode,
        contentLength: normalizedContent.length,
      }),
    });
  }

  return memoryId;
}

/**
 * Refuse the sixth ALWAYS memory rather than accepting it and quietly not
 * applying it — the same rule, and the same reason, as the company side.
 */
export async function assertAgentAlwaysCapacity(
  ctx: MutationCtx,
  agentId: Id<"agents">,
  applyMode: MemoryApplyMode,
  excludeMemoryId?: Id<"agentMemories">,
) {
  if (applyMode !== "ALWAYS") return;

  const [stamped, unstamped] = await Promise.all([
    ctx.db
      .query("agentMemories")
      .withIndex("by_agent_active_applymode_updated", (q) =>
        q.eq("agentId", agentId).eq("isActive", true).eq("applyMode", "ALWAYS")
      )
      .take(MAX_ALWAYS_MEMORIES + 1),
    ctx.db
      .query("agentMemories")
      .withIndex("by_agent_active_applymode_updated", (q) =>
        q.eq("agentId", agentId).eq("isActive", true).eq("applyMode", undefined)
      )
      .take(MAX_ALWAYS_MEMORIES + 1),
  ]);

  const existing = [...stamped, ...unstamped.filter((memory) => resolveAgentApplyMode(memory) === "ALWAYS")]
    .filter((memory) => memory._id !== excludeMemoryId);

  if (existing.length >= MAX_ALWAYS_MEMORIES) {
    throw appError("INVALID_INPUT", 
      `An agent can have ${MAX_ALWAYS_MEMORIES} memories set to Always. Change one to "When relevant" before adding another.`,
    );
  }
}

/**
 * Add a memory to an agent by hand.
 *
 * Agent memory had no create or update path at all: every memory arrived by
 * approving a suggestion generated from a run, so there was no way to simply
 * tell an agent something.
 */
export const createMemory = adminMutation({
  args: {
    agentId: v.id("agents"),
    content: v.string(),
    applyMode: applyModeValidator,
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw appError("NOT_FOUND", "Agent not found");
    if (user.role === "ADMIN" && !user.companyId) throw appError("UNAUTHORIZED", "Unauthorized");
    await assertAgentAlwaysCapacity(ctx, args.agentId, args.applyMode);

    return await insertAgentMemory(ctx, {
      agentId: args.agentId,
      // An admin's memory belongs to their company; a super admin writing on an
      // agent directly leaves it unscoped, as the runtime already allows.
      companyId: user.role === "ADMIN" ? user.companyId : undefined,
      applyMode: args.applyMode,
      content: args.content,
      createdBy: userId,
    });
  },
});

export const updateMemory = adminMutation({
  args: {
    memoryId: v.id("agentMemories"),
    content: v.string(),
    applyMode: applyModeValidator,
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const memory = await ctx.db.get(args.memoryId);
    if (!memory || memory.isActive === false) throw appError("NOT_FOUND", "Memory not found");
    assertAdminCanAccessCompany(user, memory.companyId);
    await assertAgentAlwaysCapacity(ctx, memory.agentId, args.applyMode, args.memoryId);

    const normalizedContent = validateMemoryContent(args.content);
    const now = Date.now();
    await ctx.db.patch(args.memoryId, {
      content: normalizedContent,
      normalizedContent: normalizedContent.toLowerCase(),
      kind: kindForApplyMode(args.applyMode),
      applyMode: args.applyMode,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_AGENT_MEMORY",
      entityId: args.memoryId,
      entityType: "agentMemories",
      companyId: memory.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: memory.agentId,
        applyMode: args.applyMode,
        contentLength: normalizedContent.length,
      }),
    });

    return true;
  },
});

/**
 * Put a removed memory back. Removal was one-way and removed memories were
 * invisible, so the only recovery was to retype them.
 */
export const restoreMemory = adminMutation({
  args: {
    memoryId: v.id("agentMemories"),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const memory = await ctx.db.get(args.memoryId);
    if (!memory) throw appError("NOT_FOUND", "Memory not found");
    if (memory.isActive !== false) throw appError("INVALID_INPUT", "This memory is already in use.");
    assertAdminCanAccessCompany(user, memory.companyId);
    await assertAgentAlwaysCapacity(ctx, memory.agentId, resolveAgentApplyMode(memory), args.memoryId);

    const now = Date.now();
    await ctx.db.patch(args.memoryId, {
      isActive: true,
      deletedAt: undefined,
      deletedBy: undefined,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "RESTORE_AGENT_MEMORY",
      entityId: args.memoryId,
      entityType: "agentMemories",
      companyId: memory.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: memory.agentId,
        contentLength: memory.content.length,
      }),
    });

    return true;
  },
});
