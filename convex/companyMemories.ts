import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { requireCompanyAccess } from "./authz";
import { appError } from "./utils/appError";
import { normalizeContent, normalizeTitle } from "./utils/memoryText";
import { recordCompanyAiDriftEvent } from "./companyReadiness";
import {
  MAX_ALWAYS_MEMORIES,
  resolveCompanyApplyMode,
  type MemoryApplyMode,
} from "./utils/memoryApplication";
import {
  blendedMemoryRank,
  buildMemorySearchQuery,
  companyQualityForRanking,
  rankScore,
} from "./utils/memoryRetrieval";
import { getSelfImprovementConfig } from "./selfImprovementConfig";
import { rowShape } from "./utils/rowShape";

const DEFAULT_CONFIDENCE = 0.8;
const RUNTIME_MEMORY_LIMIT_DEFAULT = 5;
const RUNTIME_MEMORY_LIMIT_MAX = 8;

/**
 * The category column is retained on the row for the audit trail, but a memory
 * is no longer described by one: the only thing that changes its behaviour is
 * applyMode. New rows record this so the column is never silently wrong about
 * something a person chose.
 */
const RETAINED_CATEGORY = "OTHER";

/**
 * One person saying an answer was wrong is a lead, not a fact, so a
 * correction enters the queue below anything the platform inferred from a
 * pattern across runs.
 */
const CORRECTION_CONFIDENCE = 0.3;

const applyModeValidator = v.union(
  v.literal("ALWAYS"),
  v.literal("WHEN_RELEVANT")
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

function clampConfidence(value: number | undefined) {
  if (!Number.isFinite(value ?? DEFAULT_CONFIDENCE)) return DEFAULT_CONFIDENCE;
  return Math.min(Math.max(value ?? DEFAULT_CONFIDENCE, 0), 1);
}

function getRuntimeMemoryLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? RUNTIME_MEMORY_LIMIT_DEFAULT)) return RUNTIME_MEMORY_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.floor(limit ?? RUNTIME_MEMORY_LIMIT_DEFAULT), 1), RUNTIME_MEMORY_LIMIT_MAX);
}

function getRejectedFingerprint(content: string) {
  return normalizeContent(content).toLowerCase();
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
    // Worded for whoever hit it. The old message said "memory candidate" on a
    // form that had never used the word.
    throw appError("INVALID_INPUT", "This was suggested before and turned down, so it cannot be added again. Reword it if it should apply now.");
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

    // Two reads, not four. The archived and rejected totals were counted on
    // every page load for two numbers that appeared on screen and led nowhere;
    // the memory screen lists archived memories directly now, and nothing shows
    // a rejected count at all.
    const [approved, proposed] = await Promise.all([
      ctx.db
        .query("companyMemories")
        .withIndex("by_company_status_updated", (q) =>
          q.eq("companyId", args.companyId).eq("status", "APPROVED")
        )
        .take(1000),
      ctx.db
        .query("companyMemoryCandidates")
        .withIndex("by_company_status_created", (q) =>
          q.eq("companyId", args.companyId).eq("status", "PROPOSED")
        )
        .take(1000),
    ]);

    return {
      approved: approved.length,
      proposed: proposed.length,
      alwaysCount: approved.filter((memory) => resolveCompanyApplyMode(memory) === "ALWAYS").length,
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
  returns: rowShape.companyMemories,
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);
    if (!memory) throw appError("NOT_FOUND", "Company memory not found");
    await requireCompanyAccess(ctx, memory.companyId);
    return memory;
  },
});

function toRuntimeMemory(memory: Doc<"companyMemories">, score: number) {
  return {
    memoryId: memory._id,
    title: memory.title,
    content: memory.content,
    applyMode: resolveCompanyApplyMode(memory),
    confidence: memory.confidence,
    score,
    updatedAt: memory.updatedAt,
  };
}

export type RuntimeCompanyMemory = ReturnType<typeof toRuntimeMemory>;

/**
 * Everything the company's AI should be told about this message.
 *
 * `always` is not a search result — those memories go into the system
 * instruction on every message, which is the whole point of the mode. Only
 * `relevant` is looked up, and it now uses the full-text index rather than
 * scoring the newest hundred rows by substring.
 */
/**
 * The company's ALWAYS memories.
 *
 * Two reads rather than one because `applyMode` is optional: a row written
 * before the backfill has no value, and an index equality on "ALWAYS" would
 * skip it. Reading the unstamped bucket separately and classifying it by its
 * old category means memory keeps working during the deploy instead of going
 * quiet until the migration finishes. The second read costs nothing once the
 * bucket is empty.
 */
async function readAlwaysMemories(ctx: QueryCtx, companyId: Id<"companies">) {
  const [stamped, unstamped] = await Promise.all([
    ctx.db
      .query("companyMemories")
      .withIndex("by_company_status_applymode_updated", (q) =>
        q.eq("companyId", companyId).eq("status", "APPROVED").eq("applyMode", "ALWAYS")
      )
      .order("desc")
      .take(MAX_ALWAYS_MEMORIES),
    ctx.db
      .query("companyMemories")
      .withIndex("by_company_status_applymode_updated", (q) =>
        q.eq("companyId", companyId).eq("status", "APPROVED").eq("applyMode", undefined)
      )
      .order("desc")
      .take(MAX_ALWAYS_MEMORIES),
  ]);

  return [...stamped, ...unstamped.filter((memory) => resolveCompanyApplyMode(memory) === "ALWAYS")]
    .slice(0, MAX_ALWAYS_MEMORIES);
}

/**
 * Everything the company's AI should be told about this message.
 *
 * `always` is not a search result — those memories go into the system
 * instruction on every message, which is the whole point of the mode. Only
 * `relevant` is looked up, and it now uses the full-text index rather than
 * scoring the newest hundred rows by substring.
 */
export const getRuntimeMemoriesInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    queryText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // A migrated company reads one brain (one-brain-plan.md, phase 2): its
    // facts arrive pinned to wiki pages and its instructions through the
    // rules. Empty here, not gated at the call sites, so every arm —
    // typed, voice, and any future one — honours the stamp at once.
    const migratedCompany = await ctx.db.get(args.companyId);
    if (migratedCompany?.memoriesMigratedAt) return { always: [], relevant: [] };
    const limit = getRuntimeMemoryLimit(args.limit);
    const alwaysMemories = await readAlwaysMemories(ctx, args.companyId);

    const searchQuery = buildMemorySearchQuery(args.queryText);
    // A message with nothing searchable in it ("hi", "thanks") is not an error
    // and no longer returns nothing at all — the always list above still stands.
    const searchMatches = searchQuery.length === 0
      ? []
      : await ctx.db
        .query("companyMemories")
        .withSearchIndex("search_content", (q) =>
          q.search("normalizedContent", searchQuery)
            .eq("companyId", args.companyId)
            .eq("status", "APPROVED")
        )
        // Room to drop the ALWAYS matches, which are already in the system
        // instruction and would otherwise be sent to the model twice.
        .take(limit * 2);

    const kept = searchMatches.filter((memory) => resolveCompanyApplyMode(memory) === "WHEN_RELEVANT");

    // ALWAYS memories are injected unconditionally by design and never
    // reordered by track record — a quality score must not silently
    // un-approve what a person approved. Only the searched list blends.
    const always = alwaysMemories.map((memory, index) =>
      toRuntimeMemory(memory, rankScore(index, alwaysMemories.length)));

    const config = await getSelfImprovementConfig(ctx.db);
    if (!config.outcomeWeightedRanking) {
      return {
        always,
        relevant: kept
          .slice(0, limit)
          .map((memory, index, list) => toRuntimeMemory(memory, rankScore(index, list.length))),
      };
    }

    const now = Date.now();
    const scored = kept.map((memory, index) => ({
      memory,
      blended: blendedMemoryRank({
        positionalScore: rankScore(index, kept.length),
        quality: companyQualityForRanking({
          confidence: memory.confidence,
          positiveFeedbackCount: memory.positiveFeedbackCount,
          negativeFeedbackCount: memory.negativeFeedbackCount,
          lastFeedbackAt: memory.lastFeedbackAt,
          lastUsedAt: memory.lastUsedAt,
          updatedAt: memory.updatedAt,
          now,
        }),
      }),
      index,
    }));
    scored.sort((a, b) => b.blended - a.blended || a.index - b.index);

    return {
      always,
      relevant: scored.slice(0, limit).map((entry) => toRuntimeMemory(entry.memory, entry.blended)),
    };
  },
});

/**
 * The company's ALWAYS memories on their own, for the agent path.
 *
 * An agent run builds its system instruction well before it has a message to
 * search with, and giving a company a memory has to work on a widget that
 * happens to have an agent attached — which is every normal widget.
 */
export const getAlwaysMemoriesInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    // Same stamp, same silence (one-brain-plan.md, phase 2).
    const migratedCompany = await ctx.db.get(args.companyId);
    if (migratedCompany?.memoriesMigratedAt) return [];
    const memories = await readAlwaysMemories(ctx, args.companyId);
    return memories.map((memory, index) => toRuntimeMemory(memory, rankScore(index, memories.length)));
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
    searchTerm: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    // Narrowed in the database rather than in the browser, so a company with a
    // long list can still find a memory on page nine.
    const searchTerm = args.searchTerm?.trim().toLowerCase();
    if (searchTerm) {
      const status = args.status;
      return await ctx.db
        .query("companyMemories")
        .withSearchIndex("search_content", (q) => {
          const search = q.search("normalizedContent", searchTerm).eq("companyId", args.companyId);
          return status ? search.eq("status", status) : search;
        })
        .paginate(args.paginationOpts);
    }

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

/**
 * Refuse the sixth ALWAYS memory rather than accepting it and quietly not
 * applying it. A rule that only shows up as behaviour nobody can see is the
 * same fault as a silent cap.
 */
async function assertAlwaysCapacity(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  applyMode: MemoryApplyMode,
  excludeMemoryId?: Id<"companyMemories">,
) {
  if (applyMode !== "ALWAYS") return;

  const existing = await readAlwaysMemories(ctx, companyId);
  const others = existing.filter((memory) => memory._id !== excludeMemoryId);
  if (others.length >= MAX_ALWAYS_MEMORIES) {
    throw appError("INVALID_INPUT", 
      `A company can have ${MAX_ALWAYS_MEMORIES} memories set to Always. Change one to "When relevant" before adding another.`,
    );
  }
}

export const createMemory = adminMutation({
  args: {
    companyId: v.id("companies"),
    title: v.optional(v.string()),
    content: v.string(),
    applyMode: applyModeValidator,
    sourceType: v.optional(memorySourceTypeValidator),
    sourceIdsJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    await assertNoRejectedCandidateMatch(ctx, args.companyId, args.content);
    await assertAlwaysCapacity(ctx, args.companyId, args.applyMode);

    const content = normalizeContent(args.content);
    const title = normalizeTitle(args.title, content);
    const now = Date.now();
    const memoryId = await ctx.db.insert("companyMemories", {
      companyId: args.companyId,
      title,
      content,
      normalizedContent: content.toLowerCase(),
      category: RETAINED_CATEGORY,
      applyMode: args.applyMode,
      status: "APPROVED",
      confidence: clampConfidence(undefined),
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
      metadata: buildAuditMetadata({ applyMode: args.applyMode, contentLength: content.length }),
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
    applyMode: applyModeValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.memoryId);
    if (!existing) throw appError("NOT_FOUND", "Memory not found");
    const { userId } = await requireCompanyAccess(ctx, existing.companyId);
    if (existing.status !== "APPROVED") throw appError("INVALID_INPUT", "Only approved company memories can be edited.");
    await assertNoRejectedCandidateMatch(ctx, existing.companyId, args.content);
    // Excluded from its own count, so re-saving an Always memory is not blocked
    // by the memory being saved.
    await assertAlwaysCapacity(ctx, existing.companyId, args.applyMode, args.memoryId);

    const content = normalizeContent(args.content);
    const title = normalizeTitle(args.title, content);
    const now = Date.now();
    await ctx.db.patch(args.memoryId, {
      title,
      content,
      normalizedContent: content.toLowerCase(),
      applyMode: args.applyMode,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_COMPANY_MEMORY",
      entityId: args.memoryId,
      entityType: "companyMemories",
      companyId: existing.companyId,
      timestamp: now,
      metadata: buildAuditMetadata({ applyMode: args.applyMode, contentLength: content.length }),
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
    if (!existing) throw appError("NOT_FOUND", "Memory not found");
    // Saying "Memory not found" about a memory that plainly exists sends the
    // reader looking for the wrong problem.
    if (existing.status === "ARCHIVED") throw appError("INVALID_INPUT", "This memory has already been removed.");
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
      metadata: buildAuditMetadata({ applyMode: resolveCompanyApplyMode(existing), contentLength: existing.content.length }),
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

/**
 * Put a removed memory back.
 *
 * Removing was one-way and archived memories had nowhere to be seen, so the
 * only recovery was to retype the memory. The screen now lists them, which
 * means it needs a way back.
 */
export const restoreMemory = adminMutation({
  args: {
    memoryId: v.id("companyMemories"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.memoryId);
    if (!existing) throw appError("NOT_FOUND", "Memory not found");
    if (existing.status !== "ARCHIVED") throw appError("INVALID_INPUT", "This memory is already in use.");
    const { userId } = await requireCompanyAccess(ctx, existing.companyId);
    const applyMode = resolveCompanyApplyMode(existing);
    await assertAlwaysCapacity(ctx, existing.companyId, applyMode, args.memoryId);
    const now = Date.now();

    await ctx.db.patch(args.memoryId, {
      status: "APPROVED",
      approvedBy: userId,
      approvedAt: now,
      archivedBy: undefined,
      archivedAt: undefined,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "RESTORE_COMPANY_MEMORY",
      entityId: args.memoryId,
      entityType: "companyMemories",
      companyId: existing.companyId,
      timestamp: now,
      metadata: buildAuditMetadata({ applyMode, contentLength: existing.content.length }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: existing.companyId,
      sourceType: "MEMORY",
      sourceId: args.memoryId,
      reason: "Company memory was restored.",
      affectedEvalCategories: ["MEMORY_USAGE", "NO_HALLUCINATION", "WIDGET_READINESS"],
      createdBy: userId,
      createdAt: now,
    });

    return true;
  },
});

/**
 * A correction typed by whoever was given the answer.
 *
 * `createCandidate` below is the admin door and stays that way — an ordinary
 * person must not gain write access to memory. This is the narrow path for a
 * correction instead: internal, so nothing in a browser reaches it directly,
 * and it proposes rather than writes. It joins the same queue an admin
 * already reviews, with low confidence, because one person's correction is a
 * lead rather than a fact.
 *
 * Returns null rather than throwing when the idea was already turned down.
 * The correction itself is still worth storing, and the person who typed it
 * should not be shown an error about a review queue they cannot see.
 */
export const proposeCorrectionCandidate = internalMutation({
  args: {
    companyId: v.id("companies"),
    correction: v.string(),
    messageId: v.id("messages"),
    threadId: v.id("threads"),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args): Promise<Id<"companyMemoryCandidates"> | null> => {
    let content: string;
    try {
      content = normalizeContent(args.correction);
    } catch {
      // Empty, over-long, or refused by the safety policy. The feedback row
      // still stands; only the suggestion is dropped.
      return null;
    }

    // A migrated company's corrections go where its facts now live: the
    // wiki's open questions (one-brain-plan.md, phase 3). A person settles
    // each by pinning or editing the right page — the same judgement the
    // memory queue used to hold, on the screen that survived the fold.
    const company = await ctx.db.get(args.companyId);
    if (company?.memoriesMigratedAt) {
      const dedupeKey = `correction:${content.toLowerCase().slice(0, 120)}`;
      const existing = await ctx.db
        .query("wikiOpenQuestions")
        .withIndex("by_company_dedupe", (q) =>
          q.eq("companyId", args.companyId).eq("dedupeKey", dedupeKey)
        )
        .first();
      if (!existing) {
        const questionId = await ctx.db.insert("wikiOpenQuestions", {
          companyId: args.companyId,
          kind: "CORRECTION",
          pageKeyA: "POLICY:about-this-company",
          claimA: content.slice(0, 300),
          detail: "Typed by the person who was given the answer, when they marked it not right.",
          dedupeKey,
          status: "OPEN",
          raisedAt: Date.now(),
        });
        await ctx.db.insert("auditLogs", {
          actionType: "WIKI_QUESTION_RAISED",
          entityId: questionId.toString(),
          entityType: "wikiOpenQuestions",
          companyId: args.companyId,
          timestamp: Date.now(),
          metadata: JSON.stringify({ kind: "CORRECTION" }),
        });
      }
      return null;
    }

    const rejectedFingerprint = getRejectedFingerprint(content);
    const alreadyRejected = await ctx.db
      .query("companyMemoryCandidates")
      .withIndex("by_company_rejected_fingerprint", (q) =>
        q.eq("companyId", args.companyId).eq("rejectedFingerprint", rejectedFingerprint)
      )
      .first();
    if (alreadyRejected) return null;

    const now = Date.now();
    return await ctx.db.insert("companyMemoryCandidates", {
      companyId: args.companyId,
      title: normalizeTitle(undefined, content),
      content,
      normalizedContent: content.toLowerCase(),
      category: RETAINED_CATEGORY,
      applyMode: "WHEN_RELEVANT",
      sourceType: "CHAT",
      sourceIdsJson: JSON.stringify({ messageId: args.messageId, threadId: args.threadId }),
      reason: "Typed by the person who was given the answer, when they marked it not right.",
      confidence: CORRECTION_CONFIDENCE,
      status: "PROPOSED",
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createCandidate = adminMutation({
  args: {
    companyId: v.id("companies"),
    title: v.optional(v.string()),
    content: v.string(),
    applyMode: applyModeValidator,
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
      category: RETAINED_CATEGORY,
      applyMode: args.applyMode,
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
      metadata: buildAuditMetadata({ applyMode: args.applyMode, contentLength: content.length }),
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
    if (!candidate) throw appError("NOT_FOUND", "Memory candidate not found");
    const { userId } = await requireCompanyAccess(ctx, candidate.companyId);
    if (candidate.status !== "PROPOSED") throw appError("INVALID_INPUT", "Memory candidate has already been reviewed.");
    await assertNoRejectedCandidateMatch(ctx, candidate.companyId, candidate.content);

    const applyMode = resolveCompanyApplyMode(candidate);
    await assertAlwaysCapacity(ctx, candidate.companyId, applyMode);

    const now = Date.now();
    const memoryId = await ctx.db.insert("companyMemories", {
      companyId: candidate.companyId,
      title: normalizeTitle(candidate.title, candidate.content),
      content: candidate.content,
      normalizedContent: candidate.normalizedContent,
      category: candidate.category,
      applyMode,
      status: "APPROVED",
      confidence: candidate.confidence,
      sourceType: candidate.sourceType,
      sourceIdsJson: candidate.sourceIdsJson,
      // A suggestion the platform made has no author, so the person who
      // accepted it is who put it into memory.
      createdBy: candidate.createdBy ?? userId,
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

/**
 * Apply a platform-proposed candidate with no person involved — the
 * autonomous-memory path (owner decision, 2026-08-10). Same writes as
 * `approveCandidate`, but no actor anywhere: the memory is marked
 * `autoApplied` instead, and the audit row records that it was automatic.
 *
 * Returns null instead of throwing when the candidate cannot be applied
 * (already reviewed, or an ALWAYS suggestion when the ALWAYS slots are full)
 * — those stay PROPOSED for a person, since capacity is a product rule the
 * platform must not silently bend.
 */
export async function autoApplyCompanyCandidate(
  ctx: MutationCtx,
  candidateId: Id<"companyMemoryCandidates">,
) {
  const candidate = await ctx.db.get(candidateId);
  if (!candidate || candidate.status !== "PROPOSED") return null;

  const applyMode = resolveCompanyApplyMode(candidate);
  try {
    await assertAlwaysCapacity(ctx, candidate.companyId, applyMode);
  } catch {
    return null;
  }

  const now = Date.now();
  const memoryId = await ctx.db.insert("companyMemories", {
    companyId: candidate.companyId,
    title: normalizeTitle(candidate.title, candidate.content),
    content: candidate.content,
    normalizedContent: candidate.normalizedContent,
    category: candidate.category,
    applyMode,
    status: "APPROVED",
    confidence: candidate.confidence,
    sourceType: candidate.sourceType,
    sourceIdsJson: candidate.sourceIdsJson,
    autoApplied: true,
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
    usageCount: 0,
  });

  await ctx.db.patch(candidateId, {
    status: "APPROVED",
    reviewedAt: now,
    appliedMemoryId: memoryId,
    updatedAt: now,
  });

  await ctx.db.insert("auditLogs", {
    actionType: "APPROVE_COMPANY_MEMORY_CANDIDATE",
    entityId: candidateId,
    entityType: "companyMemoryCandidates",
    companyId: candidate.companyId,
    timestamp: now,
    metadata: buildAuditMetadata({
      memoryId,
      category: candidate.category,
      contentLength: candidate.content.length,
      automatic: true,
    }),
  });
  await recordCompanyAiDriftEvent(ctx, {
    companyId: candidate.companyId,
    sourceType: "MEMORY",
    sourceId: memoryId,
    reason: "Company memory was saved automatically under the autonomous-memory switch.",
    affectedEvalCategories: ["MEMORY_USAGE", "NO_HALLUCINATION", "WIDGET_READINESS"],
    createdAt: now,
  });

  return memoryId;
}

export const rejectCandidate = adminMutation({
  args: {
    candidateId: v.id("companyMemoryCandidates"),
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw appError("NOT_FOUND", "Memory candidate not found");
    const { userId } = await requireCompanyAccess(ctx, candidate.companyId);
    if (candidate.status !== "PROPOSED") throw appError("INVALID_INPUT", "Memory candidate has already been reviewed.");

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
