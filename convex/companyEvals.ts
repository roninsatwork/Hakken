import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { recordCompanyAiDriftEvent, resolveCompanyAiDriftEvents } from "./companyReadiness";

const CASE_NAME_MAX_CHARS = 140;
const PROMPT_MAX_CHARS = 4000;
const EXPECTED_BEHAVIOR_MAX_CHARS = 4000;
const ANSWER_MAX_CHARS = 12000;
const JSON_FIELD_MAX_CHARS = 8000;
// Gate decisions must not silently truncate. A company past this many must-pass
// cases needs a rollup counter, not a bigger number here.
const MUST_PASS_CASE_LIMIT = 200;
// A batch is two provider calls per check, so the cap is what a company can afford
// to run in one press rather than what the database can return. When it bites, the
// estimate says so instead of quietly running a subset.
const BATCH_CASE_LIMIT = 100;

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

// The chat path records memory evidence as `{version, memories: [{memoryId,...}]}`
// rather than a flat id list, so it is flattened here into the shape the rules
// compare against.
function parseMemoryEvidenceIds(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { memories?: unknown };
    if (!Array.isArray(parsed?.memories)) return [];
    return parsed.memories
      .map((memory) => (memory as { memoryId?: unknown })?.memoryId)
      .filter((memoryId): memoryId is string => typeof memoryId === "string");
  } catch {
    return [];
  }
}

function stringSet(value: unknown) {
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
}

// Checks the answer and the recorded evidence, and nothing else. An earlier
// version also compared the run's resolved use case against the case's expected
// one, but the only caller that filled the resolved value in passed the expected
// value straight back — the check compared a field to itself and could not fail,
// while still counting towards the score. Model routing is worth testing; it
// needs a real routing decision to test against, which is Phase 3.
function buildDeterministicResults(args: {
  evalCase: Doc<"companyEvalCases">;
  answer: string;
  evidenceJson?: string;
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

async function insertCompanyEvalRun(ctx: MutationCtx, args: {
  answer: string;
  costJson?: string;
  evalCase: Doc<"companyEvalCases">;
  evidenceJson?: string;
  judgeNotes?: string;
  // The second model's verdict on whether the answer meets the case's expected
  // behavior. It joins the rule results rather than sitting beside them, so it
  // counts towards the score and shows up in the evidence list like any other
  // check — an admin should not have to look in two places to see why a run
  // failed.
  judgeResult?: { passed: boolean; detail: string };
  // Set when `answer` is an error message rather than something the assistant
  // said. The rules are then not evaluated at all, because a "must never say X"
  // rule trivially passes against an error and would score a run that produced no
  // answer at 50% — a total failure reading as half marks.
  answerFailed?: boolean;
  resolvedModelId?: string;
  resolvedUseCase?: string;
  tokenUsageJson?: string;
  userId: Id<"users">;
}) {
  const now = Date.now();
  const answer = normalizeText(args.answer, "Answer", ANSWER_MAX_CHARS);
  const evidenceJson = normalizeOptionalText(args.evidenceJson, JSON_FIELD_MAX_CHARS);
  const resolvedUseCase = normalizeOptionalText(args.resolvedUseCase, CASE_NAME_MAX_CHARS);
  const deterministicResults = [
    ...(args.judgeResult
      ? [{
        key: "answer-quality",
        label: "Answer quality",
        passed: args.judgeResult.passed,
        detail: args.judgeResult.detail,
      }]
      : []),
    ...(args.answerFailed
      ? []
      : buildDeterministicResults({
        evalCase: args.evalCase,
        answer,
        evidenceJson,
      })),
  ];
  const status = getRunStatus(deterministicResults);
  const score = getRunScore(deterministicResults);

  const runId = await ctx.db.insert("companyEvalRuns", {
    companyId: args.evalCase.companyId,
    evalCaseId: args.evalCase._id,
    status,
    score,
    answer,
    evidenceJson,
    deterministicResultsJson: JSON.stringify(deterministicResults),
    resolvedModelId: normalizeOptionalText(args.resolvedModelId, CASE_NAME_MAX_CHARS),
    resolvedUseCase,
    tokenUsageJson: normalizeOptionalText(args.tokenUsageJson, JSON_FIELD_MAX_CHARS),
    costJson: normalizeOptionalText(args.costJson, JSON_FIELD_MAX_CHARS),
    judgeNotes: normalizeOptionalText(args.judgeNotes, EXPECTED_BEHAVIOR_MAX_CHARS),
    startedAt: now,
    completedAt: now,
    createdBy: args.userId,
  });

  await ctx.db.patch(args.evalCase._id, {
    lastRunId: runId,
    lastRunStatus: status,
    updatedAt: now,
  });

  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "RUN_COMPANY_EVAL_CASE",
    entityId: runId,
    entityType: "companyEvalRuns",
    companyId: args.evalCase.companyId,
    timestamp: now,
    metadata: JSON.stringify({ evalCaseId: args.evalCase._id, status, score }),
  });
  // Drift is the backlog of "things changed since anyone last checked", and it
  // covers the whole company. Clearing it needs company-wide evidence, so it
  // waits until every must-pass check has a passing result. One check going
  // green used to wipe the entire backlog, which is how a company could read as
  // fully checked on the strength of a single answer.
  const resolvedDriftCount = status === "PASSED" && await hasCompleteBlockerEvidence(ctx, args.evalCase.companyId)
    ? await resolveCompanyAiDriftEvents(ctx, {
      companyId: args.evalCase.companyId,
      resolvedBy: args.userId,
      resolvedRunId: runId,
      resolvedAt: now,
    })
    : 0;

  return { runId, status, score, deterministicResults, resolvedDriftCount };
}

// True only when every active must-pass case has a latest run that passed. A
// company with no must-pass cases has proved nothing, so it does not qualify.
//
// Selected by index and read from the rolled-up `lastRunStatus`, so this costs
// one indexed range read rather than a scan of every active case plus a run
// query for each of them.
async function hasCompleteBlockerEvidence(ctx: MutationCtx, companyId: Id<"companies">) {
  const mustPassCases = await ctx.db
    .query("companyEvalCases")
    .withIndex("by_company_status_severity", (q) =>
      q.eq("companyId", companyId).eq("status", "ACTIVE").eq("severity", "BLOCKER"))
    .take(MUST_PASS_CASE_LIMIT);
  if (mustPassCases.length === 0) return false;

  return mustPassCases.every((evalCase) => evalCase.lastRunStatus === "PASSED");
}

async function requireCompanyAccess(ctx: QueryCtx | MutationCtx, companyId: Id<"companies">) {
  const { user, userId } = await requireAdmin(ctx);
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");
  assertAdminCanAccessCompany(user, companyId);
  return { userId, company };
}

export const getSummary = adminQuery({
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
    const needsReviewRuns = latestRuns.filter((run) => run.status === "NEEDS_REVIEW").length;
    const notRunCases = activeCases.length - latestRuns.length;
    const blockerCases = activeCases.filter((evalCase) => evalCase.severity === "BLOCKER");
    const blockerFailures = blockerCases.filter((evalCase) => latestRunByCase.get(evalCase._id)?.status === "FAILED").length;
    const blockerNotRun = blockerCases.filter((evalCase) => !latestRunByCase.has(evalCase._id)).length;

    return {
      totalCases: activeCases.length,
      blockerCases: blockerCases.length,
      latestRuns: latestRuns.length,
      passedRuns,
      failedRuns,
      needsReviewRuns,
      notRunCases,
      failedOrNotRunCases: failedRuns + needsReviewRuns + notRunCases,
      blockerFailures,
      blockerNotRun,
      passRate: latestRuns.length > 0 ? passedRuns / latestRuns.length : 0,
    };
  },
});

export const getCasesForCompany = adminQuery({
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

export const getCaseById = adminQuery({
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

export const getRunsForCase = adminQuery({
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

export const getLatestRunsForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    const activeCases = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(1000);
    const activeCaseIds = new Set(activeCases.map((evalCase) => evalCase._id));
    const recentRuns = await ctx.db
      .query("companyEvalRuns")
      .withIndex("by_company_completed", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(1000);
    const latestRuns: Doc<"companyEvalRuns">[] = [];
    const seenCaseIds = new Set<Id<"companyEvalCases">>();

    for (const run of recentRuns) {
      if (!activeCaseIds.has(run.evalCaseId) || seenCaseIds.has(run.evalCaseId)) continue;
      seenCaseIds.add(run.evalCaseId);
      latestRuns.push(run);
    }

    return latestRuns;
  },
});

export const createCase = adminMutation({
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

export const archiveCase = adminMutation({
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

// `runCase` used to live here: an admin typed in what the AI had said and
// hand-declared which documents and skills it had used, and that was recorded as
// evidence. It was the admin marking their own homework, and a passing one fed the
// readiness gates exactly as a real run does — so a company could be shown as ready
// on the strength of someone's typing.
//
// With `companyEvalRuns.runCheck` asking the real assistant and a second model
// marking the answer, there is nothing left for it to do.

// `runBatch` used to live here. It walked the active cases and, for each one,
// wrote a run whose "answer" was a template string echoing the case's own name,
// prompt and expected behavior — then scored that string. The company AI was
// never called, so a forbidden-phrase check passed on text the system had just
// written itself, and a passing run cleared the company's entire drift backlog.
// Pressing one button turned the readiness lights green on no evidence.
//
// What replaces it asks the real company AI and has a second model mark the
// answer. The plumbing for that is below; the action that drives it lives in
// `companyEvalRunActions` because it needs the Node runtime to reach a provider.

/**
 * A throwaway thread for one check run.
 *
 * `purpose: "EVAL"` keeps it out of the admin thread lists, the same way agent
 * eval threads are hidden. The triggering admin's user id is kept deliberately:
 * retrieval and tool authorisation resolve from the thread's user, so a run under
 * no user would be graded on an assistant stripped of the context it normally
 * has — which would test something nobody ships.
 */
export const createEvalThreadInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    evalCaseId: v.id("companyEvalCases"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("threads", {
      userId: args.userId,
      companyId: args.companyId,
      title: `Check ${args.evalCaseId}`,
      purpose: "EVAL",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * The assistant's answer from a check thread, and what reached the model.
 *
 * `sourceIds` and `skillIds` come from the runtime evidence the chat path records
 * (Phase 2); `memoryIds` from the memory evidence it already recorded. These are
 * what a "must use this document" rule is graded against, and before they were
 * recorded such a rule could never pass.
 */
export const getEvalThreadOutcomeInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(10);
    const reply = messages.find((message) => message.role === "assistant");

    const runtimeEvidence = parseEvidence(reply?.companyRuntimeEvidenceJson);
    const memoryEvidence = parseMemoryEvidenceIds(reply?.companyMemoryEvidenceJson);

    return {
      answer: reply?.content ?? "",
      modelUsed: reply?.modelUsed,
      inputTokens: reply?.inputTokens ?? 0,
      outputTokens: reply?.outputTokens ?? 0,
      evidenceJson: JSON.stringify({
        sourceIds: Array.isArray(runtimeEvidence.sourceIds) ? runtimeEvidence.sourceIds : [],
        memoryIds: memoryEvidence,
        skillIds: Array.isArray(runtimeEvidence.skillIds) ? runtimeEvidence.skillIds : [],
      }),
    };
  },
});

/**
 * What running every unproven check would cost, before spending it.
 *
 * Each check is two provider calls, so a batch is real money and a real wait. The
 * old batch button spent nothing because it called no provider, which is exactly
 * why it proved nothing.
 */
export const getBatchEstimate = adminQuery({
  args: {
    companyId: v.id("companies"),
    mode: v.union(v.literal("ALL"), v.literal("FAILED_OR_NOT_RUN")),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    const activeCases = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(BATCH_CASE_LIMIT + 1);
    const selectable = activeCases
      .slice(0, BATCH_CASE_LIMIT)
      .filter((evalCase) => args.mode === "ALL" || evalCase.lastRunStatus !== "PASSED");

    return {
      selectedCount: selectable.length,
      // Two calls per check: the assistant answers, then a second model grades.
      providerCallCount: selectable.length * 2,
      isCapped: activeCases.length > BATCH_CASE_LIMIT,
      cap: BATCH_CASE_LIMIT,
    };
  },
});

export const getBatchCaseIdsInternal = internalQuery({
  args: {
    companyId: v.id("companies"),
    mode: v.union(v.literal("ALL"), v.literal("FAILED_OR_NOT_RUN")),
  },
  handler: async (ctx, args) => {
    const activeCases = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(BATCH_CASE_LIMIT);

    return activeCases
      .filter((evalCase) => args.mode === "ALL" || evalCase.lastRunStatus !== "PASSED")
      .map((evalCase) => evalCase._id);
  },
});

export const getCaseForRunInternal = internalQuery({
  args: { evalCaseId: v.id("companyEvalCases") },
  handler: async (ctx, args) => {
    const evalCase = await ctx.db.get(args.evalCaseId);
    if (!evalCase || evalCase.status !== "ACTIVE") return null;
    return evalCase;
  },
});

export const recordGradedRunInternal = internalMutation({
  args: {
    evalCaseId: v.id("companyEvalCases"),
    userId: v.id("users"),
    answer: v.string(),
    evidenceJson: v.optional(v.string()),
    // Absent means nobody graded the answer — the run could not be completed, so
    // it records as "not tested" rather than as a failure. A failure means the
    // grader read the answer and judged it wanting; being unable to reach a
    // provider is not evidence about the assistant, and reporting it as a failure
    // would tell an admin their AI is broken when the truth is that we did not
    // manage to ask.
    judgePassed: v.optional(v.boolean()),
    judgeDetail: v.optional(v.string()),
    judgeNotes: v.optional(v.string()),
    answerFailed: v.optional(v.boolean()),
    resolvedModelId: v.optional(v.string()),
    tokenUsageJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const evalCase = await ctx.db.get(args.evalCaseId);
    if (!evalCase || evalCase.status !== "ACTIVE") throw new Error("Eval case not found");

    return await insertCompanyEvalRun(ctx, {
      evalCase,
      answer: args.answer,
      evidenceJson: args.evidenceJson,
      judgeResult: args.judgePassed === undefined || args.judgeDetail === undefined
        ? undefined
        : { passed: args.judgePassed, detail: args.judgeDetail },
      judgeNotes: args.judgeNotes,
      answerFailed: args.answerFailed,
      resolvedModelId: args.resolvedModelId,
      tokenUsageJson: args.tokenUsageJson,
      userId: args.userId,
    });
  },
});
