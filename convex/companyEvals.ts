import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { recordCompanyAiDriftEvent, resolveCompanyAiDriftEvents } from "./companyReadiness";

const CASE_NAME_MAX_CHARS = 140;
const PROMPT_MAX_CHARS = 4000;
const EXPECTED_BEHAVIOR_MAX_CHARS = 4000;
const ANSWER_MAX_CHARS = 12000;
const JSON_FIELD_MAX_CHARS = 8000;

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

const evalStatusValidator = v.union(v.literal("ACTIVE"), v.literal("ARCHIVED"));

type DeterministicResult = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

type EvidencePayload = {
  sourceIds?: unknown;
  memoryIds?: unknown;
  skillIds?: unknown;
};

function normalizeText(value: string, label: string, maxChars: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`${label} cannot be empty.`);
  if (normalized.length > maxChars) throw new Error(`${label} cannot exceed ${maxChars} characters.`);
  return normalized;
}

function normalizeOptionalText(value: string | undefined, maxChars: number) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxChars) throw new Error(`Value cannot exceed ${maxChars} characters.`);
  return normalized;
}

function parseJsonArray(value: string | undefined, label: string) {
  const normalized = normalizeOptionalText(value, JSON_FIELD_MAX_CHARS);
  if (!normalized) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`${label} must be a JSON array of strings.`);
  }

  return parsed.map((item) => item.trim());
}

function parseEvidence(value: string | undefined) {
  const normalized = normalizeOptionalText(value, JSON_FIELD_MAX_CHARS);
  if (!normalized) return {};

  try {
    const parsed = JSON.parse(normalized) as EvidencePayload;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error("Evidence must be valid JSON.");
  }
}

function parseOptionalJson(value: string | undefined, label: string) {
  const normalized = normalizeOptionalText(value, JSON_FIELD_MAX_CHARS);
  if (!normalized) return;

  try {
    JSON.parse(normalized);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function stringSet(value: unknown) {
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}

function buildDeterministicResults(args: {
  evalCase: Doc<"companyEvalCases">;
  answer: string;
  evidenceJson?: string;
  resolvedUseCase?: string;
}) {
  const forbiddenClaims = parseJsonArray(args.evalCase.forbiddenClaimsJson, "Forbidden claims");
  const requiredSources = parseJsonArray(args.evalCase.requiredSourcesJson, "Required sources");
  const requiredMemories = parseJsonArray(args.evalCase.requiredMemoriesJson, "Required memories");
  const requiredSkills = parseJsonArray(args.evalCase.requiredSkillsJson, "Required skills");
  const evidence = parseEvidence(args.evidenceJson);
  const sourceIds = stringSet(evidence.sourceIds);
  const memoryIds = stringSet(evidence.memoryIds);
  const skillIds = stringSet(evidence.skillIds);
  const answerLower = args.answer.toLowerCase();
  const results: DeterministicResult[] = [];

  for (const claim of forbiddenClaims) {
    const passed = !answerLower.includes(claim.toLowerCase());
    results.push({
      key: `forbidden:${claim}`,
      label: "Forbidden claim",
      passed,
      detail: passed ? `Did not include "${claim}".` : `Answer included forbidden claim "${claim}".`,
    });
  }

  for (const sourceId of requiredSources) {
    const passed = sourceIds.has(sourceId);
    results.push({
      key: `source:${sourceId}`,
      label: "Required source",
      passed,
      detail: passed ? `Source ${sourceId} was present.` : `Source ${sourceId} was missing from evidence.`,
    });
  }

  for (const memoryId of requiredMemories) {
    const passed = memoryIds.has(memoryId);
    results.push({
      key: `memory:${memoryId}`,
      label: "Required memory",
      passed,
      detail: passed ? `Memory ${memoryId} was present.` : `Memory ${memoryId} was missing from evidence.`,
    });
  }

  for (const skillId of requiredSkills) {
    const passed = skillIds.has(skillId);
    results.push({
      key: `skill:${skillId}`,
      label: "Required skill",
      passed,
      detail: passed ? `Skill ${skillId} was present.` : `Skill ${skillId} was missing from evidence.`,
    });
  }

  if (args.evalCase.expectedModelUseCase) {
    const expected = args.evalCase.expectedModelUseCase;
    const passed = args.resolvedUseCase === expected;
    results.push({
      key: `model-use-case:${expected}`,
      label: "Expected model use case",
      passed,
      detail: passed ? `Resolved use case matched ${expected}.` : `Expected ${expected}, got ${args.resolvedUseCase || "missing"}.`,
    });
  }

  return results;
}

function getRunStatus(results: DeterministicResult[]) {
  if (results.length === 0) return "NEEDS_REVIEW" as const;
  return results.every((result) => result.passed) ? "PASSED" as const : "FAILED" as const;
}

function getRunScore(results: DeterministicResult[]) {
  if (results.length === 0) return 0;
  return results.filter((result) => result.passed).length / results.length;
}

async function requireCompanyAccess(ctx: QueryCtx | MutationCtx, companyId: Id<"companies">) {
  const { user, userId } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");
  assertAdminCanAccessCompany(user, companyId);
  return { userId, company };
}

export const getSummary = query({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    const activeCases = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(1000);
    const recentRuns = await ctx.db
      .query("companyEvalRuns")
      .withIndex("by_company_completed", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(1000);
    const latestRunByCase = new Map<Id<"companyEvalCases">, Doc<"companyEvalRuns">>();
    for (const run of recentRuns) {
      if (!latestRunByCase.has(run.evalCaseId)) latestRunByCase.set(run.evalCaseId, run);
    }

    const activeCaseIds = new Set(activeCases.map((evalCase) => evalCase._id));
    const latestRuns = Array.from(latestRunByCase.entries())
      .filter(([caseId]) => activeCaseIds.has(caseId))
      .map(([, run]) => run);
    const passedRuns = latestRuns.filter((run) => run.status === "PASSED").length;
    const failedRuns = latestRuns.filter((run) => run.status === "FAILED").length;
    const blockerCases = activeCases.filter((evalCase) => evalCase.severity === "BLOCKER");
    const blockerFailures = blockerCases.filter((evalCase) => latestRunByCase.get(evalCase._id)?.status === "FAILED").length;
    const blockerNotRun = blockerCases.filter((evalCase) => !latestRunByCase.has(evalCase._id)).length;

    return {
      totalCases: activeCases.length,
      blockerCases: blockerCases.length,
      latestRuns: latestRuns.length,
      passedRuns,
      failedRuns,
      needsReviewRuns: latestRuns.filter((run) => run.status === "NEEDS_REVIEW").length,
      blockerFailures,
      blockerNotRun,
      passRate: latestRuns.length > 0 ? passedRuns / latestRuns.length : 0,
    };
  },
});

export const getCasesForCompany = query({
  args: {
    companyId: v.id("companies"),
    status: v.optional(evalStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    if (args.status) {
      return await ctx.db
        .query("companyEvalCases")
        .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", args.status as Doc<"companyEvalCases">["status"]))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getCaseById = query({
  args: {
    evalCaseId: v.id("companyEvalCases"),
  },
  handler: async (ctx, args) => {
    const evalCase = await ctx.db.get(args.evalCaseId);
    if (!evalCase) throw new Error("Eval case not found");
    await requireCompanyAccess(ctx, evalCase.companyId);
    return evalCase;
  },
});

export const getRunsForCase = query({
  args: {
    evalCaseId: v.id("companyEvalCases"),
  },
  handler: async (ctx, args) => {
    const evalCase = await ctx.db.get(args.evalCaseId);
    if (!evalCase) throw new Error("Eval case not found");
    await requireCompanyAccess(ctx, evalCase.companyId);

    return await ctx.db
      .query("companyEvalRuns")
      .withIndex("by_case_completed", (q) => q.eq("evalCaseId", args.evalCaseId))
      .order("desc")
      .take(15);
  },
});

export const createCase = mutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
    category: evalCategoryValidator,
    severity: evalSeverityValidator,
    targetSurface: evalTargetSurfaceValidator,
    targetId: v.optional(v.string()),
    prompt: v.string(),
    fixtureContextJson: v.optional(v.string()),
    expectedBehavior: v.string(),
    requiredSourcesJson: v.optional(v.string()),
    requiredMemoriesJson: v.optional(v.string()),
    requiredSkillsJson: v.optional(v.string()),
    forbiddenClaimsJson: v.optional(v.string()),
    expectedModelUseCase: v.optional(v.string()),
    expectedOutputFormat: v.optional(v.string()),
    judgeRubric: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    const now = Date.now();
    const jsonFields = {
      fixtureContextJson: normalizeOptionalText(args.fixtureContextJson, JSON_FIELD_MAX_CHARS),
      requiredSourcesJson: normalizeOptionalText(args.requiredSourcesJson, JSON_FIELD_MAX_CHARS),
      requiredMemoriesJson: normalizeOptionalText(args.requiredMemoriesJson, JSON_FIELD_MAX_CHARS),
      requiredSkillsJson: normalizeOptionalText(args.requiredSkillsJson, JSON_FIELD_MAX_CHARS),
      forbiddenClaimsJson: normalizeOptionalText(args.forbiddenClaimsJson, JSON_FIELD_MAX_CHARS),
    };

    parseJsonArray(jsonFields.requiredSourcesJson, "Required sources");
    parseJsonArray(jsonFields.requiredMemoriesJson, "Required memories");
    parseJsonArray(jsonFields.requiredSkillsJson, "Required skills");
    parseJsonArray(jsonFields.forbiddenClaimsJson, "Forbidden claims");
    parseOptionalJson(jsonFields.fixtureContextJson, "Fixture context");

    const evalCaseId = await ctx.db.insert("companyEvalCases", {
      companyId: args.companyId,
      name: normalizeText(args.name, "Eval name", CASE_NAME_MAX_CHARS),
      category: args.category,
      severity: args.severity,
      targetSurface: args.targetSurface,
      targetId: normalizeOptionalText(args.targetId, CASE_NAME_MAX_CHARS),
      prompt: normalizeText(args.prompt, "Prompt", PROMPT_MAX_CHARS),
      ...jsonFields,
      expectedBehavior: normalizeText(args.expectedBehavior, "Expected behavior", EXPECTED_BEHAVIOR_MAX_CHARS),
      expectedModelUseCase: normalizeOptionalText(args.expectedModelUseCase, CASE_NAME_MAX_CHARS),
      expectedOutputFormat: normalizeOptionalText(args.expectedOutputFormat, CASE_NAME_MAX_CHARS),
      judgeRubric: normalizeOptionalText(args.judgeRubric, EXPECTED_BEHAVIOR_MAX_CHARS),
      status: "ACTIVE",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_COMPANY_EVAL_CASE",
      entityId: evalCaseId,
      entityType: "companyEvalCases",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({ category: args.category, severity: args.severity, targetSurface: args.targetSurface }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: args.companyId,
      sourceType: "EVAL",
      sourceId: evalCaseId,
      reason: "Company eval case was created and needs evidence.",
      affectedEvalCategories: [args.category],
      createdBy: userId,
      createdAt: now,
    });

    return evalCaseId;
  },
});

export const archiveCase = mutation({
  args: {
    evalCaseId: v.id("companyEvalCases"),
  },
  handler: async (ctx, args) => {
    const evalCase = await ctx.db.get(args.evalCaseId);
    if (!evalCase || evalCase.status === "ARCHIVED") throw new Error("Eval case not found");
    const { userId } = await requireCompanyAccess(ctx, evalCase.companyId);
    const now = Date.now();

    await ctx.db.patch(args.evalCaseId, {
      status: "ARCHIVED",
      archivedBy: userId,
      archivedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "ARCHIVE_COMPANY_EVAL_CASE",
      entityId: args.evalCaseId,
      entityType: "companyEvalCases",
      companyId: evalCase.companyId,
      timestamp: now,
      metadata: JSON.stringify({ category: evalCase.category, severity: evalCase.severity }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: evalCase.companyId,
      sourceType: "EVAL",
      sourceId: args.evalCaseId,
      reason: "Company eval case was archived.",
      affectedEvalCategories: [evalCase.category],
      createdBy: userId,
      createdAt: now,
    });

    return true;
  },
});

export const runCase = mutation({
  args: {
    evalCaseId: v.id("companyEvalCases"),
    answer: v.string(),
    evidenceJson: v.optional(v.string()),
    resolvedModelId: v.optional(v.string()),
    resolvedUseCase: v.optional(v.string()),
    tokenUsageJson: v.optional(v.string()),
    costJson: v.optional(v.string()),
    judgeNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const evalCase = await ctx.db.get(args.evalCaseId);
    if (!evalCase || evalCase.status !== "ACTIVE") throw new Error("Eval case not found");
    const { userId } = await requireCompanyAccess(ctx, evalCase.companyId);
    const now = Date.now();
    const answer = normalizeText(args.answer, "Answer", ANSWER_MAX_CHARS);
    const evidenceJson = normalizeOptionalText(args.evidenceJson, JSON_FIELD_MAX_CHARS);
    const deterministicResults = buildDeterministicResults({
      evalCase,
      answer,
      evidenceJson,
      resolvedUseCase: normalizeOptionalText(args.resolvedUseCase, CASE_NAME_MAX_CHARS),
    });
    const status = getRunStatus(deterministicResults);
    const score = getRunScore(deterministicResults);

    const runId = await ctx.db.insert("companyEvalRuns", {
      companyId: evalCase.companyId,
      evalCaseId: args.evalCaseId,
      status,
      score,
      answer,
      evidenceJson,
      deterministicResultsJson: JSON.stringify(deterministicResults),
      resolvedModelId: normalizeOptionalText(args.resolvedModelId, CASE_NAME_MAX_CHARS),
      resolvedUseCase: normalizeOptionalText(args.resolvedUseCase, CASE_NAME_MAX_CHARS),
      tokenUsageJson: normalizeOptionalText(args.tokenUsageJson, JSON_FIELD_MAX_CHARS),
      costJson: normalizeOptionalText(args.costJson, JSON_FIELD_MAX_CHARS),
      judgeNotes: normalizeOptionalText(args.judgeNotes, EXPECTED_BEHAVIOR_MAX_CHARS),
      startedAt: now,
      completedAt: now,
      createdBy: userId,
    });

    await ctx.db.patch(args.evalCaseId, {
      lastRunId: runId,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "RUN_COMPANY_EVAL_CASE",
      entityId: runId,
      entityType: "companyEvalRuns",
      companyId: evalCase.companyId,
      timestamp: now,
      metadata: JSON.stringify({ evalCaseId: args.evalCaseId, status, score }),
    });
    const resolvedDriftCount = status === "PASSED"
      ? await resolveCompanyAiDriftEvents(ctx, {
        companyId: evalCase.companyId,
        resolvedBy: userId,
        resolvedRunId: runId,
        resolvedAt: now,
      })
      : 0;

    return { runId, status, score, deterministicResults, resolvedDriftCount };
  },
});
