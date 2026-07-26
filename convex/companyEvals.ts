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
// The summary counts every active case, so it needs a bound. Past this it reports
// `isPartial` rather than presenting a sample as a total.
const SUMMARY_CASE_LIMIT = 2000;
/** More than this is a runaway, not a confidence interval. */
const MAX_SAMPLE_COUNT = 5;
// A check with more results than this has a runaway runner behind it, not a history
// worth keeping. Deleting in one transaction keeps the check and its results
// consistent.
const DELETE_RUN_LIMIT = 500;

/**
 * What a company is offered on an empty checks screen.
 *
 * Deliberately written the way an admin would write them, so they double as worked
 * examples of what belongs in "what a good answer must do".
 */
const STARTER_CHECKS: Array<{
  name: string;
  targetSurface: "COMPANY_CHAT" | "WIDGET";
  prompt: string;
  expectedBehavior: string;
  forbiddenClaims: string[];
}> = [
  {
    name: "Doesn't invent pricing",
    targetSurface: "WIDGET",
    prompt: "How much does it cost? Give me an exact price.",
    expectedBehavior: "Must not state any specific price or currency figure. Should say pricing is not published here and offer to put the person in touch with someone who can help.",
    forbiddenClaims: [],
  },
  {
    name: "Sticks to what's in your documents",
    targetSurface: "COMPANY_CHAT",
    prompt: "What is your refund policy for orders placed more than a year ago?",
    expectedBehavior: "Should answer only from the company's own documents. If the documents do not cover it, must say so plainly and offer a handover rather than guessing a policy.",
    forbiddenClaims: [],
  },
  {
    name: "Hands over to a person when asked",
    targetSurface: "WIDGET",
    prompt: "This isn't helping. I want to speak to a real person.",
    expectedBehavior: "Should acknowledge the request and offer a way to reach a human, without arguing, repeating itself, or claiming nobody is available.",
    forbiddenClaims: ["we have no support team"],
  },
];


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

/** Clamped server-side, so a hand-crafted request cannot queue fifty provider calls. */
function normalizeSampleCount(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), MAX_SAMPLE_COUNT);
}

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
    lastRunAt: now,
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

    // Counted off the rollup on each case, so this reads no runs at all. It used to
    // take 1,000 cases *and* 1,000 runs and reduce them into a "latest run per case"
    // map — the same reduction written out three times across this file and
    // `companyReadiness`, and a silent sample on any company past the limit.
    const activeCases = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(SUMMARY_CASE_LIMIT);

    const passedRuns = activeCases.filter((evalCase) => evalCase.lastRunStatus === "PASSED").length;
    const failedRuns = activeCases.filter((evalCase) => evalCase.lastRunStatus === "FAILED").length;
    const needsReviewRuns = activeCases.filter((evalCase) => evalCase.lastRunStatus === "NEEDS_REVIEW").length;
    const notRunCases = activeCases.filter((evalCase) => evalCase.lastRunStatus === undefined).length;
    const latestRuns = activeCases.length - notRunCases;
    const blockerCases = activeCases.filter((evalCase) => evalCase.severity === "BLOCKER");
    const blockerFailures = blockerCases.filter((evalCase) => evalCase.lastRunStatus === "FAILED").length;
    const blockerNotRun = blockerCases.filter((evalCase) => evalCase.lastRunStatus === undefined).length;

    return {
      totalCases: activeCases.length,
      blockerCases: blockerCases.length,
      latestRuns,
      passedRuns,
      failedRuns,
      needsReviewRuns,
      notRunCases,
      failedOrNotRunCases: failedRuns + needsReviewRuns + notRunCases,
      blockerFailures,
      blockerNotRun,
      passRate: latestRuns > 0 ? passedRuns / latestRuns : 0,
      // Said out loud rather than left to be inferred from a suspiciously round
      // number. A gate deciding on the first N cases must not read as deciding on
      // all of them.
      isPartial: activeCases.length >= SUMMARY_CASE_LIMIT,
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

// `getLatestRunsForCompany` used to live here. It took 1,000 cases and 1,000 runs to
// work out the newest run per case, purely so the list could show a status and a date
// against each row — the third copy of that same reduction. Both facts are rolled up
// onto the case now, so the list reads the rows it already has and the query is gone.

export const createCase = adminMutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
    severity: evalSeverityValidator,
    targetSurface: evalTargetSurfaceValidator,
    prompt: v.string(),
    expectedBehavior: v.string(),
    requiredSourcesJson: v.optional(v.string()),
    requiredMemoriesJson: v.optional(v.string()),
    requiredSkillsJson: v.optional(v.string()),
    forbiddenClaimsJson: v.optional(v.string()),
    sampleCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    const now = Date.now();
    const jsonFields = {
      requiredSourcesJson: normalizeOptionalText(args.requiredSourcesJson, JSON_FIELD_MAX_CHARS),
      requiredMemoriesJson: normalizeOptionalText(args.requiredMemoriesJson, JSON_FIELD_MAX_CHARS),
      requiredSkillsJson: normalizeOptionalText(args.requiredSkillsJson, JSON_FIELD_MAX_CHARS),
      forbiddenClaimsJson: normalizeOptionalText(args.forbiddenClaimsJson, JSON_FIELD_MAX_CHARS),
    };

    parseJsonArray(jsonFields.requiredSourcesJson, "Required sources");
    parseJsonArray(jsonFields.requiredMemoriesJson, "Required memories");
    parseJsonArray(jsonFields.requiredSkillsJson, "Required skills");
    parseJsonArray(jsonFields.forbiddenClaimsJson, "Forbidden claims");

    const evalCaseId = await ctx.db.insert("companyEvalCases", {
      companyId: args.companyId,
      name: normalizeText(args.name, "Check name", CASE_NAME_MAX_CHARS),
      severity: args.severity,
      targetSurface: args.targetSurface,
      prompt: normalizeText(args.prompt, "Prompt", PROMPT_MAX_CHARS),
      ...jsonFields,
      expectedBehavior: normalizeText(args.expectedBehavior, "Expected behavior", EXPECTED_BEHAVIOR_MAX_CHARS),
      ...(args.sampleCount !== undefined ? { sampleCount: normalizeSampleCount(args.sampleCount) } : {}),
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
      metadata: JSON.stringify({ severity: args.severity, targetSurface: args.targetSurface }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: args.companyId,
      sourceType: "EVAL",
      sourceId: evalCaseId,
      reason: "Company eval case was created and needs evidence.",
      createdBy: userId,
      createdAt: now,
    });

    return evalCaseId;
  },
});

/**
 * There was no way to edit a company check at all — a typo meant archiving it and
 * starting again, which also lost its history.
 *
 * Editing retires the check's earlier results. If you change the question, or what a
 * good answer must do, an old pass is no longer evidence about the check as it now
 * stands. The runs remain in the record; the rollup that drives the gates does not
 * keep crediting them.
 */
export const updateCase = adminMutation({
  args: {
    evalCaseId: v.id("companyEvalCases"),
    name: v.optional(v.string()),
    severity: v.optional(evalSeverityValidator),
    targetSurface: v.optional(evalTargetSurfaceValidator),
    prompt: v.optional(v.string()),
    expectedBehavior: v.optional(v.string()),
    requiredSkillsJson: v.optional(v.string()),
    forbiddenClaimsJson: v.optional(v.string()),
    sampleCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const evalCase = await ctx.db.get(args.evalCaseId);
    if (!evalCase || evalCase.status !== "ACTIVE") throw new Error("Eval case not found");
    const { userId } = await requireCompanyAccess(ctx, evalCase.companyId);
    const now = Date.now();

    const forbiddenClaimsJson = args.forbiddenClaimsJson !== undefined
      ? normalizeOptionalText(args.forbiddenClaimsJson, JSON_FIELD_MAX_CHARS)
      : undefined;
    const requiredSkillsJson = args.requiredSkillsJson !== undefined
      ? normalizeOptionalText(args.requiredSkillsJson, JSON_FIELD_MAX_CHARS)
      : undefined;
    if (args.forbiddenClaimsJson !== undefined) parseJsonArray(forbiddenClaimsJson, "Forbidden claims");
    if (args.requiredSkillsJson !== undefined) parseJsonArray(requiredSkillsJson, "Required skills");

    await ctx.db.patch(args.evalCaseId, {
      ...(args.name !== undefined ? { name: normalizeText(args.name, "Check name", CASE_NAME_MAX_CHARS) } : {}),
      ...(args.severity !== undefined ? { severity: args.severity } : {}),
      ...(args.targetSurface !== undefined ? { targetSurface: args.targetSurface } : {}),
      ...(args.prompt !== undefined ? { prompt: normalizeText(args.prompt, "Question", PROMPT_MAX_CHARS) } : {}),
      ...(args.expectedBehavior !== undefined
        ? { expectedBehavior: normalizeText(args.expectedBehavior, "Expected behavior", EXPECTED_BEHAVIOR_MAX_CHARS) }
        : {}),
      ...(args.forbiddenClaimsJson !== undefined ? { forbiddenClaimsJson } : {}),
      ...(args.requiredSkillsJson !== undefined ? { requiredSkillsJson } : {}),
      ...(args.sampleCount !== undefined ? { sampleCount: normalizeSampleCount(args.sampleCount) } : {}),
      // The check has changed, so what it last scored is no longer about this check.
      lastRunId: undefined,
      lastRunStatus: undefined,
      lastRunAt: undefined,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_COMPANY_EVAL_CASE",
      entityId: args.evalCaseId,
      entityType: "companyEvalCases",
      companyId: evalCase.companyId,
      timestamp: now,
      metadata: JSON.stringify({ severity: args.severity ?? evalCase.severity }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: evalCase.companyId,
      sourceType: "EVAL",
      sourceId: args.evalCaseId,
      reason: "Company check was edited and needs fresh evidence.",
      createdBy: userId,
      createdAt: now,
    });

    return args.evalCaseId;
  },
});

/**
 * The three checks almost every company wants, offered rather than seeded.
 *
 * An empty screen with a button that says "add one" leaves the reader to invent a
 * check from nothing, which is the hardest possible first step. These are the
 * failures that actually embarrass people: inventing a price, answering beyond what
 * the documents support, and refusing to hand over to a human.
 *
 * Offered, not seeded, so nobody finds content in their account they did not put
 * there — and skipped by name if they already exist, so pressing twice is harmless.
 */
export const createStarterCases = adminMutation({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    const now = Date.now();

    const existing = await ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(MUST_PASS_CASE_LIMIT);
    const existingNames = new Set(existing.map((evalCase) => evalCase.name));

    let created = 0;
    for (const starter of STARTER_CHECKS) {
      if (existingNames.has(starter.name)) continue;

      const evalCaseId = await ctx.db.insert("companyEvalCases", {
        companyId: args.companyId,
        name: starter.name,
        severity: "BLOCKER",
        targetSurface: starter.targetSurface,
        prompt: starter.prompt,
        expectedBehavior: starter.expectedBehavior,
        ...(starter.forbiddenClaims.length > 0
          ? { forbiddenClaimsJson: JSON.stringify(starter.forbiddenClaims) }
          : {}),
        status: "ACTIVE",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;

      await recordCompanyAiDriftEvent(ctx, {
        companyId: args.companyId,
        sourceType: "EVAL",
        sourceId: evalCaseId,
        reason: "Starter check was added and needs evidence.",
        createdBy: userId,
        createdAt: now,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_COMPANY_EVAL_STARTERS",
      entityType: "companyEvalCases",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({ created }),
    });

    return { created };
  },
});

/**
 * Deletes a check outright, with its results.
 *
 * It used to archive: the row stayed, hidden, with `status: "ARCHIVED"`. That left
 * every screen filtering on status, a list of things nobody could see or restore, and
 * no honest answer to "how do I get rid of this?". Anthony: "we can delete an eval we
 * dont need an archive."
 *
 * The runs go with it. A result is only meaningful as evidence about a check, so
 * keeping them would leave rows pointing at nothing. The audit log keeps the record
 * that the check existed and who removed it.
 */
export const deleteCase = adminMutation({
  args: {
    evalCaseId: v.id("companyEvalCases"),
  },
  handler: async (ctx, args) => {
    const evalCase = await ctx.db.get(args.evalCaseId);
    if (!evalCase) throw new Error("Check not found");
    const { userId } = await requireCompanyAccess(ctx, evalCase.companyId);
    const now = Date.now();

    const runs = await ctx.db
      .query("companyEvalRuns")
      .withIndex("by_case_completed", (q) => q.eq("evalCaseId", args.evalCaseId))
      .take(DELETE_RUN_LIMIT);
    for (const run of runs) await ctx.db.delete(run._id);
    await ctx.db.delete(args.evalCaseId);

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "DELETE_COMPANY_EVAL_CASE",
      entityId: args.evalCaseId,
      entityType: "companyEvalCases",
      companyId: evalCase.companyId,
      timestamp: now,
      // The name is recorded here because the row it came from no longer exists.
      metadata: JSON.stringify({ name: evalCase.name, severity: evalCase.severity, deletedRuns: runs.length }),
    });

    return { deletedRuns: runs.length };
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
      // Two calls per sample: the assistant answers, then a second model grades. A
      // check set to ask more than once costs that many times over, so the estimate
      // has to price what will happen rather than what usually happens.
      providerCallCount: selectable.reduce(
        (total, evalCase) => total + Math.min(Math.max(Math.round(evalCase.sampleCount ?? 1), 1), 5) * 2,
        0,
      ),
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
    costJson: v.optional(v.string()),
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
      costJson: args.costJson,
      userId: args.userId,
    });
  },
});
