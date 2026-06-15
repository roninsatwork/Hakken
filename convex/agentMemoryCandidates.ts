import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { getAssistantSafetyWarnings } from "./aiSafetyPolicy";

const MEMORY_CONTENT_MAX_CHARS = 4000;
const CANDIDATE_LIMIT = 200;
const REVIEW_INBOX_LIMIT = 50;

const candidateDecisionValidator = v.union(
  v.literal("APPROVED"),
  v.literal("REJECTED")
);

type MemoryKind = "FACT" | "PREFERENCE" | "SUMMARY" | "INSTRUCTION";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type CandidateDraft = {
  kind: MemoryKind;
  content: string;
  confidence: number;
  riskLevel: RiskLevel;
  sourceReflectionId?: Id<"agentRunReflections">;
  proposedBy: "SYSTEM_REFLECTION" | "ADMIN";
};

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

function clampScore(value: number | undefined, fallback = 0.5) {
  if (!Number.isFinite(value ?? fallback)) return fallback;
  return Math.min(Math.max(value ?? fallback, 0), 1);
}

function truncateText(value: string | undefined, limit = 360) {
  const normalized = normalizeMemoryContent(value || "");
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function buildRunSummary(run: Doc<"agentRuns"> | null) {
  if (!run) return null;
  return {
    runId: run._id,
    status: run.status,
    objective: truncateText(run.objective, 220),
    error: truncateText(run.error || run.finalOutput, 220),
    startedAt: run.startedAt,
  };
}

function getReflectionRisk(category: Doc<"agentRunReflections">["category"]) {
  if (category === "PROMPT_INJECTION_BLOCKED" || category === "TENANT_SCOPE_BLOCKED" || category === "POLICY_BLOCKED") {
    return "HIGH" as const;
  }
  if (category === "BAD_TOOL_ARGUMENTS" || category === "TOOL_FAILURE" || category === "APPROVAL_REJECTED") {
    return "MEDIUM" as const;
  }
  return "LOW" as const;
}

function shouldAutoApply(candidate: Pick<CandidateDraft, "kind" | "riskLevel">) {
  return candidate.riskLevel === "LOW" && (candidate.kind === "FACT" || candidate.kind === "SUMMARY");
}

function getCandidateDrafts(args: {
  run: Doc<"agentRuns">;
  reflections: Doc<"agentRunReflections">[];
  feedback: Doc<"agentRunFeedback">[];
}) {
  const drafts: CandidateDraft[] = [];
  const latestReflection = args.reflections[0];
  const positiveFeedback = args.feedback.find((entry) => entry.rating === "POSITIVE" || entry.labels.includes("GOOD_ANSWER"));
  const missedContextFeedback = args.feedback.find((entry) => entry.labels.includes("MISSED_CONTEXT"));

  if (latestReflection?.proposedMemory) {
    const kind: MemoryKind = latestReflection.category === "MISSING_CONTEXT" ? "FACT" : "SUMMARY";
    drafts.push({
      kind,
      content: latestReflection.proposedMemory,
      confidence: clampScore(latestReflection.confidence, 0.65),
      riskLevel: kind === "FACT" ? "MEDIUM" : "LOW",
      sourceReflectionId: latestReflection._id,
      proposedBy: "SYSTEM_REFLECTION",
    });
  }

  if (positiveFeedback && args.run.status === "SUCCESS") {
    drafts.push({
      kind: "SUMMARY",
      content: `Successful agent pattern: for objective "${truncateText(args.run.objective, 220)}", operator feedback was positive. Reuse the same approved context and tool approach for similar tenant-scoped objectives.`,
      confidence: 0.75,
      riskLevel: "LOW",
      proposedBy: "ADMIN",
    });
  }

  if (missedContextFeedback) {
    drafts.push({
      kind: "FACT",
      content: `Operator feedback for objective "${truncateText(args.run.objective, 220)}" says required context was missing${missedContextFeedback.comment ? `: ${truncateText(missedContextFeedback.comment, 240)}` : "."}`,
      confidence: 0.65,
      riskLevel: "MEDIUM",
      proposedBy: "ADMIN",
    });
  }

  return drafts;
}

async function applyCandidateMemory(ctx: Pick<MutationCtx, "db">, args: {
  candidate: Doc<"agentMemoryCandidates">;
  userId: Id<"users">;
  now: number;
}) {
  const normalizedContent = validateMemoryContent(args.candidate.content);
  const memoryId = await ctx.db.insert("agentMemories", {
    agentId: args.candidate.agentId,
    companyId: args.candidate.companyId,
    sourceRunId: args.candidate.sourceRunId,
    kind: args.candidate.kind,
    content: normalizedContent,
    normalizedContent: normalizedContent.toLowerCase(),
    importance: clampScore(args.candidate.confidence, 0.5),
    isActive: true,
    createdAt: args.now,
    updatedAt: args.now,
    createdBy: args.userId,
  });

  await ctx.db.patch(args.candidate._id, {
    status: "APPLIED",
    reviewedBy: args.userId,
    reviewedAt: args.now,
    appliedMemoryId: memoryId,
    updatedAt: args.now,
  });

  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "APPLY_AGENT_MEMORY_CANDIDATE",
    entityId: args.candidate._id,
    entityType: "agentMemoryCandidates",
    companyId: args.candidate.companyId,
    timestamp: args.now,
    metadata: JSON.stringify({
      agentId: args.candidate.agentId,
      sourceRunId: args.candidate.sourceRunId,
      memoryId,
      kind: args.candidate.kind,
      riskLevel: args.candidate.riskLevel,
    }),
  });

  return memoryId;
}

export const generateForRun = mutation({
  args: {
    runId: v.id("agentRuns"),
    autoApplyLowRisk: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    const [reflections, feedback, existingCandidates] = await Promise.all([
      ctx.db
        .query("agentRunReflections")
        .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
        .order("desc")
        .take(CANDIDATE_LIMIT),
      ctx.db
        .query("agentRunFeedback")
        .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
        .order("desc")
        .take(CANDIDATE_LIMIT),
      ctx.db
        .query("agentMemoryCandidates")
        .withIndex("by_run_created", (q) => q.eq("sourceRunId", args.runId))
        .order("desc")
        .take(CANDIDATE_LIMIT),
    ]);

    const existingByContent = new Set(existingCandidates.map((candidate) => candidate.normalizedContent));
    const drafts = getCandidateDrafts({ run, reflections, feedback });
    const now = Date.now();
    const createdIds: Id<"agentMemoryCandidates">[] = [];
    const appliedIds: Id<"agentMemories">[] = [];

    for (const draft of drafts) {
      const normalizedContent = validateMemoryContent(draft.content);
      const normalizedKey = normalizedContent.toLowerCase();
      if (existingByContent.has(normalizedKey)) continue;
      existingByContent.add(normalizedKey);

      const candidateId = await ctx.db.insert("agentMemoryCandidates", {
        agentId: run.agentId,
        companyId: run.companyId,
        sourceRunId: args.runId,
        sourceReflectionId: draft.sourceReflectionId,
        proposedBy: draft.proposedBy,
        kind: draft.kind,
        content: normalizedContent,
        normalizedContent: normalizedKey,
        confidence: clampScore(draft.confidence, 0.5),
        riskLevel: draft.riskLevel,
        status: "PROPOSED",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      createdIds.push(candidateId);

      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "CREATE_AGENT_MEMORY_CANDIDATE",
        entityId: candidateId,
        entityType: "agentMemoryCandidates",
        companyId: run.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          agentId: run.agentId,
          sourceRunId: args.runId,
          kind: draft.kind,
          riskLevel: draft.riskLevel,
          autoApplyLowRisk: args.autoApplyLowRisk === true,
        }),
      });

      const candidate = await ctx.db.get(candidateId);
      if (candidate && args.autoApplyLowRisk === true && shouldAutoApply(candidate)) {
        const memoryId = await applyCandidateMemory(ctx, { candidate, userId, now });
        appliedIds.push(memoryId);
      }
    }

    return {
      createdIds,
      appliedIds,
    };
  },
});

export const decideCandidate = mutation({
  args: {
    candidateId: v.id("agentMemoryCandidates"),
    decision: candidateDecisionValidator,
    rejectionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Memory candidate not found");
    assertAdminCanAccessCompany(user, candidate.companyId);
    if (candidate.status !== "PROPOSED" && candidate.status !== "APPROVED") {
      throw new Error("Memory candidate has already been reviewed");
    }

    const now = Date.now();
    if (args.decision === "REJECTED") {
      await ctx.db.patch(args.candidateId, {
        status: "REJECTED",
        reviewedBy: userId,
        reviewedAt: now,
        rejectionReason: args.rejectionReason,
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "REJECT_AGENT_MEMORY_CANDIDATE",
        entityId: args.candidateId,
        entityType: "agentMemoryCandidates",
        companyId: candidate.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          agentId: candidate.agentId,
          sourceRunId: candidate.sourceRunId,
          kind: candidate.kind,
          riskLevel: candidate.riskLevel,
          reason: args.rejectionReason,
        }),
      });
      return { memoryId: null };
    }

    await ctx.db.patch(args.candidateId, {
      status: "APPROVED",
      reviewedBy: userId,
      reviewedAt: now,
      updatedAt: now,
    });
    const updatedCandidate = await ctx.db.get(args.candidateId);
    if (!updatedCandidate) throw new Error("Memory candidate not found");
    const memoryId = await applyCandidateMemory(ctx, { candidate: updatedCandidate, userId, now });
    return { memoryId };
  },
});

export const getForRun = query({
  args: {
    runId: v.id("agentRuns"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    return await ctx.db
      .query("agentMemoryCandidates")
      .withIndex("by_run_created", (q) => q.eq("sourceRunId", args.runId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getRecentForAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    if (user.role === "ADMIN" && !user.companyId) {
      throw new Error("Unauthorized");
    }

    if (user.role === "SUPER_ADMIN") {
      return await ctx.db
        .query("agentMemoryCandidates")
        .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", "PROPOSED"))
        .order("desc")
        .take(CANDIDATE_LIMIT);
    }

    return await ctx.db
      .query("agentMemoryCandidates")
      .withIndex("by_company_status_created", (q) => q.eq("companyId", user.companyId).eq("status", "PROPOSED"))
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .order("desc")
      .take(CANDIDATE_LIMIT);
  },
});

export const getReviewInboxForAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    if (user.role === "ADMIN" && !user.companyId) {
      throw new Error("Unauthorized");
    }

    const [memoryCandidates, improvementSuggestions, reflections] = user.role === "SUPER_ADMIN"
      ? await Promise.all([
          ctx.db
            .query("agentMemoryCandidates")
            .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", "PROPOSED"))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT),
          ctx.db
            .query("agentImprovementSuggestions")
            .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", "PROPOSED"))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT),
          ctx.db
            .query("agentRunReflections")
            .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT),
        ])
      : await Promise.all([
          ctx.db
            .query("agentMemoryCandidates")
            .withIndex("by_company_status_created", (q) => q.eq("companyId", user.companyId).eq("status", "PROPOSED"))
            .filter((q) => q.eq(q.field("agentId"), args.agentId))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT),
          ctx.db
            .query("agentImprovementSuggestions")
            .withIndex("by_company_status_created", (q) => q.eq("companyId", user.companyId).eq("status", "PROPOSED"))
            .filter((q) => q.eq(q.field("agentId"), args.agentId))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT),
          ctx.db
            .query("agentRunReflections")
            .withIndex("by_company_created", (q) => q.eq("companyId", user.companyId))
            .filter((q) => q.eq(q.field("agentId"), args.agentId))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT),
        ]);

    const activeReflectionIds = new Set([
      ...memoryCandidates.map((candidate) => candidate.sourceReflectionId).filter(Boolean),
      ...improvementSuggestions.map((suggestion) => suggestion.sourceReflectionId).filter(Boolean),
    ]);
    const openReflections = reflections
      .filter((reflection) => reflection.status === "GENERATED")
      .filter((reflection) => activeReflectionIds.has(reflection._id) || reflection.proposedEvalFixture || reflection.proposedMemory || reflection.proposedPromptChange || reflection.proposedToolChange)
      .slice(0, REVIEW_INBOX_LIMIT);

    const runIds = Array.from(new Set([
      ...memoryCandidates.map((candidate) => candidate.sourceRunId),
      ...improvementSuggestions.map((suggestion) => suggestion.sourceRunId).filter(Boolean),
      ...openReflections.map((reflection) => reflection.runId),
    ]));
    const runPairs = await Promise.all(runIds.map(async (runId) => {
      if (!runId) return null;
      const run = await ctx.db.get(runId);
      if (!run) return null;
      if (user.role === "ADMIN" && run.companyId !== user.companyId) return null;
      return [runId, buildRunSummary(run)] as const;
    }));
    const runById = new Map(runPairs.filter((pair): pair is NonNullable<typeof pair> => pair !== null));

    return {
      totals: {
        open: memoryCandidates.length + improvementSuggestions.length + openReflections.length,
        memoryCandidates: memoryCandidates.length,
        improvementSuggestions: improvementSuggestions.length,
        reflections: openReflections.length,
        highRisk: memoryCandidates.filter((candidate) => candidate.riskLevel === "HIGH").length
          + improvementSuggestions.filter((suggestion) => suggestion.riskLevel === "HIGH").length
          + openReflections.filter((reflection) => getReflectionRisk(reflection.category) === "HIGH").length,
      },
      memoryCandidates: memoryCandidates.map((candidate) => ({
        candidateId: candidate._id,
        sourceRun: runById.get(candidate.sourceRunId) || null,
        sourceReflectionId: candidate.sourceReflectionId,
        kind: candidate.kind,
        content: truncateText(candidate.content, 500),
        confidence: candidate.confidence,
        riskLevel: candidate.riskLevel,
        proposedBy: candidate.proposedBy,
        createdAt: candidate.createdAt,
      })),
      improvementSuggestions: improvementSuggestions.map((suggestion) => ({
        suggestionId: suggestion._id,
        sourceRun: suggestion.sourceRunId ? runById.get(suggestion.sourceRunId) || null : null,
        sourceReflectionId: suggestion.sourceReflectionId,
        sourceEvalFixtureId: suggestion.sourceEvalFixtureId,
        type: suggestion.type,
        title: suggestion.title,
        description: truncateText(suggestion.description, 500),
        riskLevel: suggestion.riskLevel,
        proposedPatchJson: suggestion.proposedPatchJson,
        createdAt: suggestion.createdAt,
      })),
      reflections: openReflections.map((reflection) => ({
        reflectionId: reflection._id,
        sourceRun: runById.get(reflection.runId) || null,
        category: reflection.category,
        riskLevel: getReflectionRisk(reflection.category),
        rootCause: truncateText(reflection.rootCause, 500),
        confidence: reflection.confidence,
        proposedMemory: truncateText(reflection.proposedMemory, 360),
        proposedPromptChange: truncateText(reflection.proposedPromptChange, 360),
        proposedToolChange: truncateText(reflection.proposedToolChange, 360),
        proposedEvalFixture: truncateText(reflection.proposedEvalFixture, 360),
        createdAt: reflection.createdAt,
      })),
    };
  },
});
