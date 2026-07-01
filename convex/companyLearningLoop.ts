import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { recordCompanyAiDriftEvent } from "./companyReadiness";

const TEXT_MAX_CHARS = 4000;
const TITLE_MAX_CHARS = 160;
const JSON_MAX_CHARS = 8000;
const SUGGESTION_LIMIT = 8;
const EVIDENCE_LOOKBACK_LIMIT = 1000;

type SuggestionPriority = "BLOCKER" | "WARNING" | "ADVISORY";
type SuggestionTarget = "EVALS" | "MEMORY" | "SKILLS" | "CHAT_LOGS";

type LearningSuggestion = {
  key: string;
  type: string;
  priority: SuggestionPriority;
  title: string;
  detail: string;
  target: SuggestionTarget;
};

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

const evalCategoryValidator = v.union(
  v.literal("KNOWLEDGE_RETRIEVAL"),
  v.literal("MEMORY_USAGE"),
  v.literal("RULE_COMPLIANCE"),
  v.literal("BRAND_TONE"),
  v.literal("SKILL_ROUTING"),
  v.literal("MODEL_ROUTING"),
  v.literal("NO_HALLUCINATION"),
  v.literal("TENANT_ISOLATION"),
  v.literal("WIDGET_READINESS"),
  v.literal("AGENT_INHERITANCE")
);

const evalSeverityValidator = v.union(
  v.literal("BLOCKER"),
  v.literal("WARNING"),
  v.literal("ADVISORY")
);

const evalTargetSurfaceValidator = v.union(
  v.literal("COMPANY_CHAT"),
  v.literal("WIDGET"),
  v.literal("AGENT"),
  v.literal("WORKFLOW"),
  v.literal("APP_KIT")
);

function normalizeText(value: string | undefined, label: string, maxChars = TEXT_MAX_CHARS) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxChars) throw new Error(`${label} cannot exceed ${maxChars} characters.`);
  return normalized;
}

function normalizeOptionalText(value: string | undefined, maxChars = TEXT_MAX_CHARS) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxChars) throw new Error(`Text cannot exceed ${maxChars} characters.`);
  return normalized;
}

function parseJsonArray(value: string | undefined, label: string) {
  const normalized = normalizeOptionalText(value, JSON_MAX_CHARS);
  if (!normalized) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a JSON array of strings.`);
  }

  const values = Array.from(new Set(parsed.map((entry) => entry.trim()).filter(Boolean)));
  return values.length > 0 ? JSON.stringify(values) : undefined;
}

async function requireCompanyAccess(ctx: QueryCtx | MutationCtx, companyId: Id<"companies">) {
  const { user, userId } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");
  assertAdminCanAccessCompany(user, companyId);
  return { userId, company };
}

function parseStoredStringArray(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)))
      : [];
  } catch {
    return [];
  }
}

function hasStoredJson(value: string | undefined) {
  if (!value) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function pushSuggestion(suggestions: LearningSuggestion[], suggestion: LearningSuggestion) {
  if (suggestions.some((existing) => existing.key === suggestion.key)) return;
  suggestions.push(suggestion);
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

async function requireThreadEvidence(ctx: MutationCtx, args: {
  companyId: Id<"companies">;
  threadId: Id<"threads">;
  messageId?: Id<"messages">;
}) {
  const thread = await ctx.db.get(args.threadId);
  if (!thread || thread.companyId !== args.companyId) throw new Error("Thread not found for this company.");
  let message: Doc<"messages"> | null = null;
  if (args.messageId) {
    message = await ctx.db.get(args.messageId);
    if (!message || message.threadId !== args.threadId) throw new Error("Message not found for this thread.");
  }
  return { thread, message };
}

function buildSourceIdsJson(args: {
  threadId: Id<"threads">;
  messageId?: Id<"messages">;
}) {
  return JSON.stringify({
    source: "company_chat",
    threadId: args.threadId,
    ...(args.messageId ? { messageId: args.messageId } : {}),
  });
}

function buildFixtureContextJson(args: {
  thread: Doc<"threads">;
  message?: Doc<"messages"> | null;
}) {
  return JSON.stringify({
    source: "company_chat",
    threadId: args.thread._id,
    sourceUrl: args.thread.sourceUrl,
    widgetId: args.thread.widgetId,
    observedMessage: args.message
      ? {
        messageId: args.message._id,
        role: args.message.role,
        content: args.message.content.slice(0, 2000),
      }
      : undefined,
  });
}

export const getSuggestionsForCompany = query({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    const [
      unresolvedDriftEvents,
      proposedMemoryCandidates,
      approvedMemories,
      activeEvalCases,
      recentEvalRuns,
      activeSkills,
      enabledBindingGroups,
    ] = await Promise.all([
      ctx.db
        .query("companyAiDriftEvents")
        .withIndex("by_company_resolved_created", (q) => q.eq("companyId", args.companyId).eq("resolvedAt", undefined))
        .order("desc")
        .take(100),
      ctx.db
        .query("companyMemoryCandidates")
        .withIndex("by_company_status_created", (q) => q.eq("companyId", args.companyId).eq("status", "PROPOSED"))
        .order("desc")
        .take(100),
      ctx.db
        .query("companyMemories")
        .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "APPROVED"))
        .take(EVIDENCE_LOOKBACK_LIMIT),
      ctx.db
        .query("companyEvalCases")
        .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
        .take(EVIDENCE_LOOKBACK_LIMIT),
      ctx.db
        .query("companyEvalRuns")
        .withIndex("by_company_completed", (q) => q.eq("companyId", args.companyId))
        .order("desc")
        .take(EVIDENCE_LOOKBACK_LIMIT),
      ctx.db
        .query("companySkills")
        .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
        .take(EVIDENCE_LOOKBACK_LIMIT),
      Promise.all((["COMPANY_CHAT", "WIDGET", "AGENT", "WORKFLOW", "APP_KIT"] as const).map((surfaceType) =>
        ctx.db
          .query("companySkillBindings")
          .withIndex("by_company_surface_enabled", (q) => q.eq("companyId", args.companyId).eq("surfaceType", surfaceType).eq("isEnabled", true))
          .take(EVIDENCE_LOOKBACK_LIMIT)
      )),
    ]);

    const latestRunByCase = new Map<Id<"companyEvalCases">, Doc<"companyEvalRuns">>();
    for (const run of recentEvalRuns) {
      if (!latestRunByCase.has(run.evalCaseId)) latestRunByCase.set(run.evalCaseId, run);
    }

    const latestRuns = activeEvalCases
      .map((evalCase) => latestRunByCase.get(evalCase._id))
      .filter((run): run is Doc<"companyEvalRuns"> => Boolean(run));
    const failedRuns = latestRuns.filter((run) => run.status === "FAILED");
    const reviewRuns = latestRuns.filter((run) => run.status === "NEEDS_REVIEW");
    const blockerCases = activeEvalCases.filter((evalCase) => evalCase.severity === "BLOCKER");
    const blockerFailures = blockerCases.filter((evalCase) => latestRunByCase.get(evalCase._id)?.status === "FAILED");
    const blockerNotRun = blockerCases.filter((evalCase) => !latestRunByCase.has(evalCase._id));
    const widgetBlockers = blockerCases.filter((evalCase) => evalCase.targetSurface === "WIDGET");
    const widgetBlockerNotPassing = widgetBlockers.filter((evalCase) => latestRunByCase.get(evalCase._id)?.status !== "PASSED");

    const enabledBindings = enabledBindingGroups.flat();
    const activeSkillIds = new Set(activeSkills.map((skill) => skill._id));
    const boundActiveSkillIds = new Set(enabledBindings.filter((binding) => activeSkillIds.has(binding.skillId)).map((binding) => binding.skillId));
    const missingToolRequirements = activeSkills.filter((skill) =>
      boundActiveSkillIds.has(skill._id)
      && skill.riskLevel !== "LOW"
      && parseStoredStringArray(skill.requiredToolsJson).length === 0
    );
    const highRiskMissingApproval = activeSkills.filter((skill) =>
      boundActiveSkillIds.has(skill._id)
      && skill.riskLevel === "HIGH"
      && !hasStoredJson(skill.approvalPolicyJson)
    );

    const suggestions: LearningSuggestion[] = [];

    if (blockerFailures.length > 0) {
      pushSuggestion(suggestions, {
        key: "fix-blocker-evals",
        type: "FIX_BLOCKER_EVALS",
        priority: "BLOCKER",
        title: "Fix failed blocker evals",
        detail: `${pluralize(blockerFailures.length, "blocker eval")} failed most recently. Treat these as release blockers for this company AI surface.`,
        target: "EVALS",
      });
    }

    if (missingToolRequirements.length > 0 || highRiskMissingApproval.length > 0) {
      const parts = [
        missingToolRequirements.length > 0 ? `${pluralize(missingToolRequirements.length, "bound skill")} missing required tools` : "",
        highRiskMissingApproval.length > 0 ? `${pluralize(highRiskMissingApproval.length, "high-risk skill")} missing approval policy` : "",
      ].filter(Boolean);
      pushSuggestion(suggestions, {
        key: "fix-skill-requirements",
        type: "FIX_SKILL_REQUIREMENTS",
        priority: "BLOCKER",
        title: "Complete skill safety requirements",
        detail: `${parts.join("; ")} before relying on skill routing in runtime.`,
        target: "SKILLS",
      });
    }

    if (unresolvedDriftEvents.length > 0) {
      pushSuggestion(suggestions, {
        key: "run-evals-for-drift",
        type: "RUN_EVALS_FOR_DRIFT",
        priority: "WARNING",
        title: "Run evals for recent AI changes",
        detail: `${pluralize(unresolvedDriftEvents.length, "drift event")} unresolved. Latest: ${unresolvedDriftEvents[0]?.reason ?? "company AI configuration changed"}.`,
        target: "EVALS",
      });
    }

    if (blockerNotRun.length > 0) {
      pushSuggestion(suggestions, {
        key: "run-blocker-evals",
        type: "RUN_BLOCKER_EVALS",
        priority: "WARNING",
        title: "Run blocker eval coverage",
        detail: `${pluralize(blockerNotRun.length, "blocker eval")} has no latest run, so readiness is based on incomplete evidence.`,
        target: "EVALS",
      });
    }

    if (failedRuns.length > blockerFailures.length || reviewRuns.length > 0) {
      pushSuggestion(suggestions, {
        key: "review-nonpassing-evals",
        type: "REVIEW_NONPASSING_EVALS",
        priority: "WARNING",
        title: "Review non-passing evals",
        detail: `${pluralize(failedRuns.length, "failed run")} and ${pluralize(reviewRuns.length, "run needing review")} are included in the latest eval evidence.`,
        target: "EVALS",
      });
    }

    if (proposedMemoryCandidates.length > 0) {
      pushSuggestion(suggestions, {
        key: "review-memory-candidates",
        type: "REVIEW_MEMORY_CANDIDATES",
        priority: "WARNING",
        title: "Review memory candidates",
        detail: `${pluralize(proposedMemoryCandidates.length, "candidate")} from chat evidence is waiting to be approved or rejected.`,
        target: "MEMORY",
      });
    }

    if (approvedMemories.length === 0) {
      pushSuggestion(suggestions, {
        key: "approve-first-memory",
        type: "APPROVE_FIRST_MEMORY",
        priority: "WARNING",
        title: "Approve first company memory",
        detail: "Runtime has no approved company memory yet, so company-specific learned facts cannot be injected.",
        target: proposedMemoryCandidates.length > 0 ? "MEMORY" : "CHAT_LOGS",
      });
    }

    if (activeEvalCases.length === 0) {
      pushSuggestion(suggestions, {
        key: "create-baseline-evals",
        type: "CREATE_BASELINE_EVALS",
        priority: "WARNING",
        title: "Create baseline evals",
        detail: "No active company evals exist yet. Add a few from chat evidence before treating readiness as durable.",
        target: "CHAT_LOGS",
      });
    }

    if (widgetBlockers.length === 0) {
      pushSuggestion(suggestions, {
        key: "add-widget-blocker-eval",
        type: "ADD_WIDGET_BLOCKER_EVAL",
        priority: "ADVISORY",
        title: "Add a widget blocker eval",
        detail: "No blocker eval currently gates the widget surface. Add one for public-facing answer safety.",
        target: "EVALS",
      });
    } else if (widgetBlockerNotPassing.length > 0) {
      pushSuggestion(suggestions, {
        key: "clear-widget-gate",
        type: "CLEAR_WIDGET_GATE",
        priority: "WARNING",
        title: "Clear widget gate evidence",
        detail: `${pluralize(widgetBlockerNotPassing.length, "widget blocker eval")} is not passing in latest evidence.`,
        target: "EVALS",
      });
    }

    if (activeSkills.length === 0 || boundActiveSkillIds.size === 0) {
      pushSuggestion(suggestions, {
        key: "bind-company-skills",
        type: "BIND_COMPANY_SKILLS",
        priority: "ADVISORY",
        title: "Bind company skills",
        detail: activeSkills.length === 0
          ? "No active skills exist for this company yet."
          : "Active skills exist, but none are enabled on a runtime surface.",
        target: "SKILLS",
      });
    }

    return suggestions.slice(0, SUGGESTION_LIMIT);
  },
});

export const createMemoryCandidateFromChat = mutation({
  args: {
    companyId: v.id("companies"),
    threadId: v.id("threads"),
    messageId: v.optional(v.id("messages")),
    title: v.optional(v.string()),
    content: v.string(),
    category: memoryCategoryValidator,
    reason: v.optional(v.string()),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    const { thread } = await requireThreadEvidence(ctx, args);
    const now = Date.now();
    const content = normalizeText(args.content, "Memory candidate content");
    const title = normalizeOptionalText(args.title, TITLE_MAX_CHARS);
    const candidateId = await ctx.db.insert("companyMemoryCandidates", {
      companyId: args.companyId,
      title,
      content,
      normalizedContent: content.toLowerCase(),
      category: args.category,
      sourceType: thread.widgetId ? "WIDGET" : "CHAT",
      sourceIdsJson: buildSourceIdsJson(args),
      reason: normalizeOptionalText(args.reason, TEXT_MAX_CHARS),
      confidence: Math.min(Math.max(args.confidence ?? 0.7, 0), 1),
      status: "PROPOSED",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_COMPANY_MEMORY_CANDIDATE_FROM_CHAT",
      entityId: candidateId,
      entityType: "companyMemoryCandidates",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({ threadId: args.threadId, messageId: args.messageId, category: args.category }),
    });

    return candidateId;
  },
});

export const createEvalCaseFromChat = mutation({
  args: {
    companyId: v.id("companies"),
    threadId: v.id("threads"),
    messageId: v.optional(v.id("messages")),
    name: v.string(),
    category: evalCategoryValidator,
    severity: evalSeverityValidator,
    targetSurface: evalTargetSurfaceValidator,
    prompt: v.string(),
    expectedBehavior: v.string(),
    forbiddenClaimsJson: v.optional(v.string()),
    requiredMemoriesJson: v.optional(v.string()),
    requiredSkillsJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    const { thread, message } = await requireThreadEvidence(ctx, args);
    const now = Date.now();
    const evalCaseId = await ctx.db.insert("companyEvalCases", {
      companyId: args.companyId,
      name: normalizeText(args.name, "Eval name", TITLE_MAX_CHARS),
      category: args.category,
      severity: args.severity,
      targetSurface: args.targetSurface,
      prompt: normalizeText(args.prompt, "Prompt", TEXT_MAX_CHARS),
      fixtureContextJson: buildFixtureContextJson({ thread, message }),
      expectedBehavior: normalizeText(args.expectedBehavior, "Expected behavior", TEXT_MAX_CHARS),
      forbiddenClaimsJson: parseJsonArray(args.forbiddenClaimsJson, "Forbidden claims"),
      requiredMemoriesJson: parseJsonArray(args.requiredMemoriesJson, "Required memories"),
      requiredSkillsJson: parseJsonArray(args.requiredSkillsJson, "Required skills"),
      status: "ACTIVE",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_COMPANY_EVAL_CASE_FROM_CHAT",
      entityId: evalCaseId,
      entityType: "companyEvalCases",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({ threadId: args.threadId, messageId: args.messageId, category: args.category, severity: args.severity }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: args.companyId,
      sourceType: "EVAL",
      sourceId: evalCaseId,
      reason: "Company eval case was created from chat evidence.",
      affectedEvalCategories: [args.category],
      createdBy: userId,
      createdAt: now,
    });

    return evalCaseId;
  },
});
