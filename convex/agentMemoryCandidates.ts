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

const reviewInboxModeValidator = v.union(
  v.literal("OPEN"),
  v.literal("REVIEWED"),
  v.literal("HIGH_RISK"),
  v.literal("ALL")
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

type PatchPreviewRow = {
  operation: "APPEND" | "SET" | "CREATE" | "REVIEW";
  target: string;
  before?: string;
  after?: string;
  note?: string;
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

function parseJsonObject(value: string | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function buildRunSummary(run: Doc<"agentRuns"> | null) {
  if (!run) return null;
  return {
    runId: run._id,
    status: run.status,
    triggerType: run.triggerType,
    objective: truncateText(run.objective, 220),
    error: truncateText(run.error || run.finalOutput, 220),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    costGBP: run.costGBP,
  };
}

function buildUserSummary(user: Doc<"users"> | null) {
  if (!user) return null;
  return {
    userId: user._id,
    name: user.name || user.email || "Unknown reviewer",
    email: user.email,
    role: user.role,
  };
}

function buildSuggestionAppliedEffect(suggestion: Doc<"agentImprovementSuggestions">) {
  if (suggestion.status !== "APPLIED") return null;
  if (suggestion.type === "PROMPT_CHANGE") return "Prompt guidance appended and version snapshot updated.";
  if (suggestion.type === "APPROVAL_POLICY_CHANGE") return "Human approval requirement enabled and version snapshot updated.";
  if (suggestion.type === "RULE_CHANGE") return "AI rule created and version snapshot updated.";
  if (suggestion.type === "TOOL_SCHEMA_CHANGE") return "Tool schema review rule created and version snapshot updated.";
  if (suggestion.type === "ROUTING_CHANGE") return "Routing review rule created and version snapshot updated.";
  return "Suggestion applied and version snapshot updated.";
}

function buildSuggestionPatchPreview(suggestion: Doc<"agentImprovementSuggestions">): PatchPreviewRow[] {
  const patch = parseJsonObject(suggestion.proposedPatchJson);
  const appliedNote = suggestion.status === "APPLIED" ? "Applied to the agent and captured in a version snapshot." : undefined;

  if (suggestion.type === "PROMPT_CHANGE") {
    return [{
      operation: "APPEND",
      target: "Agent system prompt",
      before: "Existing prompt",
      after: typeof patch.appendSystemPrompt === "string" ? truncateText(patch.appendSystemPrompt, 700) : suggestion.description,
      note: appliedNote || "Adds approved learning guidance to the end of the prompt.",
    }];
  }

  if (suggestion.type === "APPROVAL_POLICY_CHANGE") {
    return [{
      operation: "SET",
      target: "Human approval required",
      before: "Current agent policy",
      after: patch.humanApprovalRequired === true ? "Enabled" : String(patch.humanApprovalRequired ?? "Enabled"),
      note: appliedNote || "Requires operator approval for similar actions.",
    }];
  }

  if (suggestion.type === "RULE_CHANGE" || suggestion.type === "TOOL_SCHEMA_CHANGE" || suggestion.type === "ROUTING_CHANGE") {
    return [
      {
        operation: suggestion.type === "TOOL_SCHEMA_CHANGE" ? "REVIEW" : "CREATE",
        target: "AI rule",
        after: typeof patch.name === "string" ? patch.name : suggestion.title,
        note: appliedNote || "Creates or records a rule-style learning item for future review.",
      },
      {
        operation: "SET",
        target: "Rule trigger",
        after: typeof patch.trigger === "string" ? patch.trigger : suggestion.type,
      },
      {
        operation: "SET",
        target: "Rule instruction",
        after: typeof patch.instruction === "string"
          ? truncateText(patch.instruction, 700)
          : truncateText(typeof patch.note === "string" ? patch.note : suggestion.description, 700),
      },
      {
        operation: "SET",
        target: "Rule priority",
        after: typeof patch.priority === "string" ? patch.priority : (suggestion.riskLevel === "HIGH" ? "HIGH" : "NORMAL"),
      },
    ];
  }

  return Object.entries(patch).map(([key, value]) => ({
    operation: "SET" as const,
    target: key,
    after: typeof value === "string" ? truncateText(value, 700) : JSON.stringify(value),
  }));
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
    mode: v.optional(reviewInboxModeValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    if (user.role === "ADMIN" && !user.companyId) {
      throw new Error("Unauthorized");
    }

    const mode = args.mode ?? "OPEN";
    const reviewStatuses = ["APPROVED" as const, "REJECTED" as const, "APPLIED" as const];
    const candidateStatuses = mode === "OPEN"
      ? ["PROPOSED" as const]
      : mode === "REVIEWED"
        ? reviewStatuses
        : ["PROPOSED" as const, ...reviewStatuses];
    const suggestionStatuses = candidateStatuses;
    const reflectionStatuses = mode === "OPEN"
      ? ["GENERATED" as const]
      : mode === "REVIEWED"
        ? ["DISMISSED" as const, "CONVERTED" as const]
        : ["GENERATED" as const, "DISMISSED" as const, "CONVERTED" as const];

    const memoryCandidatePages = await Promise.all(candidateStatuses.map((status) => (
      user.role === "SUPER_ADMIN"
        ? ctx.db
            .query("agentMemoryCandidates")
            .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", status))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT)
        : ctx.db
            .query("agentMemoryCandidates")
            .withIndex("by_company_status_created", (q) => q.eq("companyId", user.companyId).eq("status", status))
            .filter((q) => q.eq(q.field("agentId"), args.agentId))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT)
    )));
    const suggestionPages = await Promise.all(suggestionStatuses.map((status) => (
      user.role === "SUPER_ADMIN"
        ? ctx.db
            .query("agentImprovementSuggestions")
            .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", status))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT)
        : ctx.db
            .query("agentImprovementSuggestions")
            .withIndex("by_company_status_created", (q) => q.eq("companyId", user.companyId).eq("status", status))
            .filter((q) => q.eq(q.field("agentId"), args.agentId))
            .order("desc")
            .take(REVIEW_INBOX_LIMIT)
    )));
    const reflections = user.role === "SUPER_ADMIN"
      ? await ctx.db
          .query("agentRunReflections")
          .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
          .order("desc")
          .take(REVIEW_INBOX_LIMIT * reflectionStatuses.length)
      : await ctx.db
          .query("agentRunReflections")
          .withIndex("by_company_created", (q) => q.eq("companyId", user.companyId))
          .filter((q) => q.eq(q.field("agentId"), args.agentId))
          .order("desc")
          .take(REVIEW_INBOX_LIMIT * reflectionStatuses.length);

    const memoryCandidates = memoryCandidatePages
      .flat()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, REVIEW_INBOX_LIMIT);
    const improvementSuggestions = suggestionPages
      .flat()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, REVIEW_INBOX_LIMIT);

    const activeReflectionIds = new Set([
      ...memoryCandidates.map((candidate) => candidate.sourceReflectionId).filter(Boolean),
      ...improvementSuggestions.map((suggestion) => suggestion.sourceReflectionId).filter(Boolean),
    ]);
    const selectedReflections = reflections
      .filter((reflection) => reflectionStatuses.includes(reflection.status))
      .filter((reflection) => activeReflectionIds.has(reflection._id) || reflection.proposedEvalFixture || reflection.proposedMemory || reflection.proposedPromptChange || reflection.proposedToolChange)
      .slice(0, REVIEW_INBOX_LIMIT);

    const memoryItems = mode === "HIGH_RISK"
      ? memoryCandidates.filter((candidate) => candidate.riskLevel === "HIGH")
      : memoryCandidates;
    const suggestionItems = mode === "HIGH_RISK"
      ? improvementSuggestions.filter((suggestion) => suggestion.riskLevel === "HIGH")
      : improvementSuggestions;
    const reflectionItems = mode === "HIGH_RISK"
      ? selectedReflections.filter((reflection) => getReflectionRisk(reflection.category) === "HIGH")
      : selectedReflections;

    const runIds = Array.from(new Set([
      ...memoryItems.map((candidate) => candidate.sourceRunId),
      ...suggestionItems.map((suggestion) => suggestion.sourceRunId).filter(Boolean),
      ...reflectionItems.map((reflection) => reflection.runId),
    ]));
    const runPairs = await Promise.all(runIds.map(async (runId) => {
      if (!runId) return null;
      const run = await ctx.db.get(runId);
      if (!run) return null;
      if (user.role === "ADMIN" && run.companyId !== user.companyId) return null;
      return [runId, buildRunSummary(run)] as const;
    }));
    const runById = new Map(runPairs.filter((pair): pair is NonNullable<typeof pair> => pair !== null));
    const reviewerIds = Array.from(new Set([
      ...memoryItems.map((candidate) => candidate.reviewedBy).filter(Boolean),
      ...suggestionItems.map((suggestion) => suggestion.reviewedBy).filter(Boolean),
      ...reflectionItems.map((reflection) => reflection.reviewedBy).filter(Boolean),
    ]));
    const reviewerPairs = await Promise.all(reviewerIds.map(async (reviewerId) => {
      if (!reviewerId) return null;
      const reviewer = await ctx.db.get(reviewerId);
      if (!reviewer) return null;
      if (user.role === "ADMIN" && reviewer.companyId && reviewer.companyId !== user.companyId) return null;
      return [reviewerId, buildUserSummary(reviewer)] as const;
    }));
    const reviewerById = new Map(reviewerPairs.filter((pair): pair is NonNullable<typeof pair> => pair !== null));

    return {
      totals: {
        open: memoryItems.length + suggestionItems.length + reflectionItems.length,
        memoryCandidates: memoryItems.length,
        improvementSuggestions: suggestionItems.length,
        reflections: reflectionItems.length,
        highRisk: memoryItems.filter((candidate) => candidate.riskLevel === "HIGH").length
          + suggestionItems.filter((suggestion) => suggestion.riskLevel === "HIGH").length
          + reflectionItems.filter((reflection) => getReflectionRisk(reflection.category) === "HIGH").length,
      },
      memoryCandidates: memoryItems.map((candidate) => ({
        candidateId: candidate._id,
        sourceRun: runById.get(candidate.sourceRunId) || null,
        sourceReflectionId: candidate.sourceReflectionId,
        kind: candidate.kind,
        content: truncateText(candidate.content, 500),
        confidence: candidate.confidence,
        riskLevel: candidate.riskLevel,
        status: candidate.status,
        proposedBy: candidate.proposedBy,
        reviewedAt: candidate.reviewedAt,
        reviewer: candidate.reviewedBy ? reviewerById.get(candidate.reviewedBy) || null : null,
        rejectionReason: candidate.rejectionReason,
        createdAt: candidate.createdAt,
      })),
      improvementSuggestions: suggestionItems.map((suggestion) => ({
        suggestionId: suggestion._id,
        sourceRun: suggestion.sourceRunId ? runById.get(suggestion.sourceRunId) || null : null,
        sourceReflectionId: suggestion.sourceReflectionId,
        sourceEvalFixtureId: suggestion.sourceEvalFixtureId,
        type: suggestion.type,
        title: suggestion.title,
        description: truncateText(suggestion.description, 500),
        riskLevel: suggestion.riskLevel,
        status: suggestion.status,
        proposedPatchJson: suggestion.proposedPatchJson,
        patchPreview: buildSuggestionPatchPreview(suggestion),
        reviewedAt: suggestion.reviewedAt,
        reviewer: suggestion.reviewedBy ? reviewerById.get(suggestion.reviewedBy) || null : null,
        rejectionReason: suggestion.rejectionReason,
        appliedAgentVersionId: suggestion.appliedAgentVersionId,
        appliedEffect: buildSuggestionAppliedEffect(suggestion),
        createdAt: suggestion.createdAt,
      })),
      reflections: reflectionItems.map((reflection) => ({
        reflectionId: reflection._id,
        sourceRun: runById.get(reflection.runId) || null,
        category: reflection.category,
        riskLevel: getReflectionRisk(reflection.category),
        status: reflection.status,
        rootCause: truncateText(reflection.rootCause, 500),
        confidence: reflection.confidence,
        proposedMemory: truncateText(reflection.proposedMemory, 360),
        proposedPromptChange: truncateText(reflection.proposedPromptChange, 360),
        proposedToolChange: truncateText(reflection.proposedToolChange, 360),
        proposedEvalFixture: truncateText(reflection.proposedEvalFixture, 360),
        reviewedAt: reflection.reviewedAt,
        reviewer: reflection.reviewedBy ? reviewerById.get(reflection.reviewedBy) || null : null,
        dismissalReason: reflection.dismissalReason,
        createdAt: reflection.createdAt,
      })),
    };
  },
});
