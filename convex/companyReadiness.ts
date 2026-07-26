import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";

const RECENT_DRIFT_LIMIT = 10;
const SNAPSHOT_LIMIT = 15;
const READINESS_EVAL_LIMIT = 1000;

const driftSourceValidator = v.union(
  v.literal("KNOWLEDGE"),
  v.literal("MEMORY"),
  v.literal("SKILL"),
  v.literal("EVAL"),
  v.literal("RULE"),
  v.literal("MODEL"),
  v.literal("WIDGET"),
  v.literal("PROMPT")
);

type ReadinessState = "READY" | "NEEDS_REVIEW" | "NOT_READY" | "DRIFTED";
type ReadinessAreaStatus = "PASS" | "WARN" | "BLOCK";

type ReadinessArea = {
  key: string;
  label: string;
  status: ReadinessAreaStatus;
  detail: string;
};

type DriftSource = Doc<"companyAiDriftEvents">["sourceType"];

async function requireCompanyAccess(ctx: QueryCtx | MutationCtx, companyId: Id<"companies">) {
  const { user, userId } = await requireAdmin(ctx);
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

function scoreAreas(areas: ReadinessArea[]) {
  if (areas.length === 0) return 0;
  const score = areas.reduce((total, area) => {
    if (area.status === "PASS") return total + 1;
    if (area.status === "WARN") return total + 0.5;
    return total;
  }, 0);
  return Math.round((score / areas.length) * 100);
}

async function getLatestRunsByCase(ctx: QueryCtx, companyId: Id<"companies">) {
  const recentRuns = await ctx.db
    .query("companyEvalRuns")
    .withIndex("by_company_completed", (q) => q.eq("companyId", companyId))
    .order("desc")
    .take(READINESS_EVAL_LIMIT);
  const latestRunByCase = new Map<Id<"companyEvalCases">, Doc<"companyEvalRuns">>();
  for (const run of recentRuns) {
    if (!latestRunByCase.has(run.evalCaseId)) latestRunByCase.set(run.evalCaseId, run);
  }
  return latestRunByCase;
}

async function buildReadinessSummary(ctx: QueryCtx, companyId: Id<"companies">) {
  const [evalCases, unresolvedDriftEvents, activeSkills, enabledBindings, approvedMemories] = await Promise.all([
    ctx.db
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", companyId).eq("status", "ACTIVE"))
      .take(READINESS_EVAL_LIMIT),
    ctx.db
      .query("companyAiDriftEvents")
      .withIndex("by_company_resolved_created", (q) => q.eq("companyId", companyId).eq("resolvedAt", undefined))
      .order("desc")
      .take(100),
    ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", companyId).eq("status", "ACTIVE"))
      .take(1000),
    Promise.all((["COMPANY_CHAT", "WIDGET", "AGENT", "WORKFLOW", "APP_KIT"] as const).map((surfaceType) =>
      ctx.db
        .query("companySkillBindings")
        .withIndex("by_company_surface_enabled", (q) => q.eq("companyId", companyId).eq("surfaceType", surfaceType).eq("isEnabled", true))
        .take(1000)
    )),
    ctx.db
      .query("companyMemories")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", companyId).eq("status", "APPROVED"))
      .take(1000),
  ]);
  const latestRunByCase = await getLatestRunsByCase(ctx, companyId);
  const latestRuns = evalCases
    .map((evalCase) => latestRunByCase.get(evalCase._id))
    .filter((run): run is Doc<"companyEvalRuns"> => Boolean(run));
  const passedRuns = latestRuns.filter((run) => run.status === "PASSED").length;
  const failedRuns = latestRuns.filter((run) => run.status === "FAILED").length;
  const needsReviewRuns = latestRuns.filter((run) => run.status === "NEEDS_REVIEW").length;
  const blockerCases = evalCases.filter((evalCase) => evalCase.severity === "BLOCKER");
  const blockerFailures = blockerCases.filter((evalCase) => latestRunByCase.get(evalCase._id)?.status === "FAILED").length;
  const blockerNotRun = blockerCases.filter((evalCase) => !latestRunByCase.has(evalCase._id)).length;
  const widgetBlockerCases = evalCases.filter((evalCase) => evalCase.severity === "BLOCKER" && evalCase.targetSurface === "WIDGET");
  const widgetBlockerFailures = widgetBlockerCases.filter((evalCase) => latestRunByCase.get(evalCase._id)?.status === "FAILED").length;
  const widgetBlockerNotRun = widgetBlockerCases.filter((evalCase) => !latestRunByCase.has(evalCase._id)).length;
  const activeSkillIds = new Set(activeSkills.map((skill) => skill._id));
  const flattenedBindings = enabledBindings.flat();
  const boundActiveSkillIds = new Set(flattenedBindings.filter((binding) => activeSkillIds.has(binding.skillId)).map((binding) => binding.skillId));
  const missingToolRequirementSkills = activeSkills.filter((skill) =>
    boundActiveSkillIds.has(skill._id)
    && skill.riskLevel !== "LOW"
    && parseStoredStringArray(skill.requiredToolsJson).length === 0
  );
  const highRiskMissingApproval = activeSkills.filter((skill) =>
    boundActiveSkillIds.has(skill._id)
    && skill.riskLevel === "HIGH"
    && !hasStoredJson(skill.approvalPolicyJson)
  );
  const readySkills = activeSkills.filter((skill) =>
    boundActiveSkillIds.has(skill._id)
    && (skill.riskLevel === "LOW" || parseStoredStringArray(skill.requiredToolsJson).length > 0)
    && (skill.riskLevel !== "HIGH" || hasStoredJson(skill.approvalPolicyJson))
  );

  const areas: ReadinessArea[] = [
    {
      key: "evals",
      label: "Company evals",
      status: blockerFailures > 0 ? "BLOCK" : evalCases.length === 0 || blockerNotRun > 0 || failedRuns > 0 || needsReviewRuns > 0 ? "WARN" : "PASS",
      detail: `${passedRuns}/${evalCases.length} active evals have a passing latest run.`,
    },
    {
      key: "drift",
      label: "Drift",
      status: unresolvedDriftEvents.length > 0 ? "WARN" : "PASS",
      detail: `${unresolvedDriftEvents.length} unresolved drift event${unresolvedDriftEvents.length === 1 ? "" : "s"}.`,
    },
    {
      key: "skills",
      label: "Company skills",
      status: missingToolRequirementSkills.length > 0 || highRiskMissingApproval.length > 0
        ? "BLOCK"
        : activeSkills.length === 0 || boundActiveSkillIds.size === 0 || readySkills.length < boundActiveSkillIds.size
          ? "WARN"
          : "PASS",
      detail: `${readySkills.length}/${boundActiveSkillIds.size} bound active skills are ready.`,
    },
    {
      key: "memory",
      label: "Company memory",
      status: approvedMemories.length > 0 ? "PASS" : "WARN",
      detail: `${approvedMemories.length} approved memor${approvedMemories.length === 1 ? "y" : "ies"} available.`,
    },
    {
      key: "widgetGate",
      // No widget must-pass evals used to read PASS, so the gate guarding the
      // public widget reported passing precisely when nothing had been checked.
      // An empty gate is an unproven gate.
      label: "Widget gate",
      status: widgetBlockerFailures > 0
        ? "BLOCK"
        : widgetBlockerCases.length === 0 || widgetBlockerNotRun > 0 ? "WARN" : "PASS",
      detail: widgetBlockerCases.length > 0
        ? `${widgetBlockerCases.length - widgetBlockerNotRun - widgetBlockerFailures}/${widgetBlockerCases.length} widget blocker evals are passing.`
        : "No widget blocker evals defined yet, so nothing has been proven.",
    },
  ];

  const blockers = areas.filter((area) => area.status === "BLOCK").length;
  const warnings = areas.filter((area) => area.status === "WARN").length;
  const state: ReadinessState = blockers > 0
    ? "NOT_READY"
    : unresolvedDriftEvents.length > 0
      ? "DRIFTED"
      : warnings > 0
        ? "NEEDS_REVIEW"
        : "READY";

  return {
    state,
    score: scoreAreas(areas),
    blockers,
    warnings,
    areas,
    drift: {
      unresolvedCount: unresolvedDriftEvents.length,
      recentEvents: unresolvedDriftEvents.slice(0, RECENT_DRIFT_LIMIT),
    },
    evals: {
      totalCases: evalCases.length,
      latestRuns: latestRuns.length,
      passedRuns,
      failedRuns,
      needsReviewRuns,
      blockerFailures,
      blockerNotRun,
      passRate: latestRuns.length > 0 ? passedRuns / latestRuns.length : 0,
    },
    skills: {
      activeSkills: activeSkills.length,
      enabledBindings: flattenedBindings.length,
      boundActiveSkills: boundActiveSkillIds.size,
      readySkills: readySkills.length,
      missingToolRequirementSkills: missingToolRequirementSkills.length,
      highRiskMissingApproval: highRiskMissingApproval.length,
    },
    widgetGate: {
      status: widgetBlockerFailures > 0 ? "BLOCKED" as const : widgetBlockerNotRun > 0 ? "NEEDS_REVIEW" as const : "PASSING" as const,
      blockerCases: widgetBlockerCases.length,
      blockerFailures: widgetBlockerFailures,
      blockerNotRun: widgetBlockerNotRun,
    },
  };
}

export async function recordCompanyAiDriftEvent(ctx: Pick<MutationCtx, "db">, args: {
  companyId: Id<"companies">;
  sourceType: DriftSource;
  sourceId?: string;
  reason: string;
  affectedEvalCategories?: string[];
  createdBy?: Id<"users">;
  createdAt?: number;
}) {
  const now = args.createdAt ?? Date.now();
  return await ctx.db.insert("companyAiDriftEvents", {
    companyId: args.companyId,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    reason: args.reason,
    affectedEvalCategoriesJson: args.affectedEvalCategories && args.affectedEvalCategories.length > 0
      ? JSON.stringify(Array.from(new Set(args.affectedEvalCategories)))
      : undefined,
    createdBy: args.createdBy,
    createdAt: now,
  });
}

export async function resolveCompanyAiDriftEvents(ctx: Pick<MutationCtx, "db">, args: {
  companyId: Id<"companies">;
  resolvedBy: Id<"users">;
  resolvedRunId?: Id<"companyEvalRuns">;
  resolvedAt?: number;
}) {
  const now = args.resolvedAt ?? Date.now();
  const unresolvedEvents = await ctx.db
    .query("companyAiDriftEvents")
    .withIndex("by_company_resolved_created", (q) => q.eq("companyId", args.companyId).eq("resolvedAt", undefined))
    .take(1000);

  await Promise.all(unresolvedEvents.map((event) => ctx.db.patch(event._id, {
    resolvedBy: args.resolvedBy,
    resolvedAt: now,
    resolvedRunId: args.resolvedRunId,
  })));

  return unresolvedEvents.length;
}

export const getReadinessSummary = adminQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);
    return await buildReadinessSummary(ctx, args.companyId);
  },
});

export const getReadinessHistory = adminQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);
    return await ctx.db
      .query("companyReadinessSnapshots")
      .withIndex("by_company_created", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(SNAPSHOT_LIMIT);
  },
});

export const recordReadinessSnapshot = adminMutation({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    const summary = await buildReadinessSummary(ctx, args.companyId);
    const snapshotId = await ctx.db.insert("companyReadinessSnapshots", {
      companyId: args.companyId,
      state: summary.state,
      score: summary.score,
      blockers: summary.blockers,
      warnings: summary.warnings,
      driftEventCount: summary.drift.unresolvedCount,
      evalPassRate: summary.evals.passRate,
      summaryJson: JSON.stringify({
        areas: summary.areas,
        evals: summary.evals,
        skills: summary.skills,
        widgetGate: summary.widgetGate,
      }),
      createdBy: userId,
      createdAt: Date.now(),
    });

    return { snapshotId, state: summary.state, score: summary.score };
  },
});

export const resolveDriftEvents = adminMutation({
  args: {
    companyId: v.id("companies"),
    sourceType: v.optional(driftSourceValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    const unresolvedEvents = await ctx.db
      .query("companyAiDriftEvents")
      .withIndex("by_company_resolved_created", (q) => q.eq("companyId", args.companyId).eq("resolvedAt", undefined))
      .take(1000);
    const scopedEvents = args.sourceType
      ? unresolvedEvents.filter((event) => event.sourceType === args.sourceType)
      : unresolvedEvents;
    const now = Date.now();

    await Promise.all(scopedEvents.map((event) => ctx.db.patch(event._id, {
      resolvedBy: userId,
      resolvedAt: now,
    })));

    return { resolvedCount: scopedEvents.length };
  },
});
