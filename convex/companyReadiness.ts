import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./tenantFunctions";
import * as tailShapes from "./utils/tailShapes";
import { requireCompanyAccess } from "./authz";
import { summariseCompanyModelRouting } from "./aiModels";
import { summariseCompanyDecisionModes } from "./decisionRuns";
import { parseStoredStringArray } from "./utils/lang";

const READINESS_EVAL_LIMIT = 1000;
const DRIFT_SCAN_LIMIT = 100;

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

type DriftSource = Doc<"companyAiDriftEvents">["sourceType"];


function hasStoredJson(value: string | undefined) {
  if (!value) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * What this company has set up of its own, and whether any of it needs attention.
 *
 * The screen this replaces showed nine tiles and a percentage computed from five
 * of them, so a company with no knowledge, no instructions, no widget and broken
 * model routing could read 100%. Everything shown here is counted and everything
 * counted is shown.
 *
 * The states are deliberately three, and only one of them is a problem. A
 * company does not have to configure any of this — it inherits the platform's
 * setup, and for most companies that is the right answer forever. So absence is
 * `NOT_CONFIGURED`: informational, never a warning, never a blocker to launch.
 * `NEEDS_ATTENTION` is reserved for something set *here* that does not work.
 * The old screen counted absence as a gap, which is why a healthy workspace read
 * 60%.
 */
type CompanyAiAreaState = "NEEDS_ATTENTION" | "SET_HERE" | "NOT_CONFIGURED";

type CompanyAiArea = {
  key: string;
  label: string;
  state: CompanyAiAreaState;
  /** One plain sentence, written for a reader rather than assembled on the page. */
  summary: string;
  /** Only on NEEDS_ATTENTION: what to do about it. */
  action?: string;
  /** Path under the company, so the page composes the link. */
  href: string;
};

const KNOWLEDGE_SCAN_LIMIT = 500;
const RULE_SCAN_LIMIT = 200;
const MEMORY_SCAN_LIMIT = 1000;

/** A count that stopped early says so, rather than presenting a sample as a total. */
function formatCount(value: number, limit: number) {
  return value >= limit ? `${limit}+` : `${value}`;
}

function pluralise(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

async function buildCompanyAiAreas(ctx: QueryCtx, companyId: Id<"companies">, company: Doc<"companies">) {
  const [
    activeRules,
    knowledgeDocuments,
    routing,
    widget,
    approvedMemories,
    proposedMemories,
    activeSkills,
    enabledBindings,
    evalCases,
    unresolvedDriftEvents,
    decisions,
  ] = await Promise.all([
    ctx.db
      .query("aiRules")
      .withIndex("by_company_active", (q) => q.eq("companyId", companyId).eq("isActive", true))
      .take(RULE_SCAN_LIMIT),
    ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .take(KNOWLEDGE_SCAN_LIMIT),
    summariseCompanyModelRouting(ctx, companyId),
    ctx.db
      .query("widgets")
      .withIndex("by_company_created", (q) => q.eq("companyId", companyId))
      .order("desc")
      .first(),
    ctx.db
      .query("companyMemories")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", companyId).eq("status", "APPROVED"))
      .take(MEMORY_SCAN_LIMIT),
    ctx.db
      .query("companyMemoryCandidates")
      .withIndex("by_company_status_created", (q) => q.eq("companyId", companyId).eq("status", "PROPOSED"))
      .take(MEMORY_SCAN_LIMIT),
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
      .query("companyEvalCases")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", companyId).eq("status", "ACTIVE"))
      .take(READINESS_EVAL_LIMIT),
    ctx.db
      .query("companyAiDriftEvents")
      .withIndex("by_company_resolved_created", (q) => q.eq("companyId", companyId).eq("resolvedAt", undefined))
      .order("desc")
      .take(DRIFT_SCAN_LIMIT),
    summariseCompanyDecisionModes(ctx, companyId),
  ]);

  const promptLength = company.systemPrompt?.trim().length ?? 0;
  const failedDocuments = knowledgeDocuments.filter((document) => document.status === "failed").length;

  const activeSkillIds = new Set(activeSkills.map((skill) => skill._id));
  const flattenedBindings = enabledBindings.flat();
  const boundActiveSkillIds = new Set(
    flattenedBindings.filter((binding) => activeSkillIds.has(binding.skillId)).map((binding) => binding.skillId)
  );
  const unsafeSkills = activeSkills.filter((skill) =>
    boundActiveSkillIds.has(skill._id)
    && ((skill.riskLevel !== "LOW" && parseStoredStringArray(skill.requiredToolsJson).length === 0)
      || (skill.riskLevel === "HIGH" && !hasStoredJson(skill.approvalPolicyJson)))
  );

  const blockerCases = evalCases.filter((evalCase) => evalCase.severity === "BLOCKER");
  const blockerFailures = blockerCases.filter((evalCase) => evalCase.lastRunStatus === "FAILED").length;
  // Never run is not passed. The old pass rate divided by the cases that had a
  // result, so one case run out of fifty displayed as 100%.
  const neverRun = evalCases.filter((evalCase) => evalCase.lastRunStatus === undefined).length;
  const passedRuns = evalCases.filter((evalCase) => evalCase.lastRunStatus === "PASSED").length;

  const areas: CompanyAiArea[] = [
    {
      key: "knowledge",
      label: "Knowledge",
      href: "/ai/knowledge",
      ...(failedDocuments > 0
        ? {
          state: "NEEDS_ATTENTION" as const,
          summary: `${failedDocuments} ${pluralise(failedDocuments, "document", "documents")} failed to process, so ${pluralise(failedDocuments, "it is", "they are")} not searchable.`,
          action: "Review the failed documents",
        }
        : knowledgeDocuments.length > 0
          ? {
            state: "SET_HERE" as const,
            summary: `${formatCount(knowledgeDocuments.length, KNOWLEDGE_SCAN_LIMIT)} ${pluralise(knowledgeDocuments.length, "document", "documents")}, none failed.`,
          }
          : { state: "NOT_CONFIGURED" as const, summary: "No documents added." }),
    },
    {
      key: "widget",
      label: "Widget",
      href: "/widget",
      ...(widget
        ? {
          state: "SET_HERE" as const,
          summary: widget.isActive
            ? `Live${widget.allowedDomains?.length ? ` on ${widget.allowedDomains.join(", ")}` : ""}.`
            : "Set up but switched off.",
        }
        : { state: "NOT_CONFIGURED" as const, summary: "No widget for this company." }),
    },
    {
      key: "instructions",
      label: "Instructions",
      href: "/ai/prompt",
      ...(promptLength > 0 || activeRules.length > 0
        ? {
          state: "SET_HERE" as const,
          summary: promptLength > 0 && activeRules.length > 0
            ? `Own instructions, and ${activeRules.length} active ${pluralise(activeRules.length, "rule", "rules")}.`
            : promptLength > 0
              ? "Own instructions, no extra rules."
              : `${activeRules.length} active ${pluralise(activeRules.length, "rule", "rules")}, no extra instructions.`,
        }
        : { state: "NOT_CONFIGURED" as const, summary: "Uses the platform instructions." }),
    },
    {
      key: "modelRouting",
      label: "Model routing",
      href: "/ai/models",
      ...(routing.brokenUseCases.length > 0
        ? {
          state: "NEEDS_ATTENTION" as const,
          summary: `${routing.brokenUseCases.length} ${pluralise(routing.brokenUseCases.length, "job points", "jobs point")} at a model that cannot run, so the platform's model is used instead.`,
          action: "Choose a model that works",
        }
        : routing.configuredHere > 0
          ? {
            state: "SET_HERE" as const,
            summary: `${routing.configuredHere} of ${routing.totalUseCases} jobs use a model chosen here.`,
          }
          : {
            state: "NOT_CONFIGURED" as const,
            summary: `All ${routing.totalUseCases} jobs use the platform's model.`,
          }),
    },
    {
      key: "decisions",
      label: "Decisions",
      href: "/ai/decisions",
      ...(decisions.setHere > 0
        ? {
          state: "SET_HERE" as const,
          summary: `${decisions.setHere} of ${decisions.total} ${pluralise(decisions.setHere, "decision has", "decisions have")} a mode chosen here.`,
        }
        : { state: "NOT_CONFIGURED" as const, summary: "Follows the platform's modes." }),
    },
    {
      key: "memory",
      label: "Memory",
      href: "/ai/memory",
      ...(approvedMemories.length > 0
        ? {
          state: "SET_HERE" as const,
          summary: `${approvedMemories.length} ${pluralise(approvedMemories.length, "memory", "memories")} in use${proposedMemories.length > 0 ? `, ${proposedMemories.length} waiting for review` : ""}.`,
        }
        : {
          state: "NOT_CONFIGURED" as const,
          summary: proposedMemories.length > 0
            ? `Nothing remembered yet, ${proposedMemories.length} waiting for review.`
            : "Nothing remembered yet.",
        }),
    },
    {
      key: "skills",
      label: "Skills",
      href: "/ai/skills",
      ...(unsafeSkills.length > 0
        ? {
          state: "NEEDS_ATTENTION" as const,
          summary: `${unsafeSkills.length} switched-on ${pluralise(unsafeSkills.length, "skill is", "skills are")} missing the tools or approval ${pluralise(unsafeSkills.length, "it needs", "they need")}.`,
          action: "Finish setting them up",
        }
        : boundActiveSkillIds.size > 0
          ? {
            state: "SET_HERE" as const,
            summary: `${boundActiveSkillIds.size} ${pluralise(boundActiveSkillIds.size, "skill", "skills")} switched on.`,
          }
          : { state: "NOT_CONFIGURED" as const, summary: "None switched on." }),
    },
    {
      key: "checks",
      label: "Checks",
      href: "/ai/evals",
      ...(blockerFailures > 0
        ? {
          state: "NEEDS_ATTENTION" as const,
          summary: `${blockerFailures} must-pass ${pluralise(blockerFailures, "check is", "checks are")} failing.`,
          action: "Fix the failing checks",
        }
        : evalCases.length > 0
          ? {
            state: "SET_HERE" as const,
            summary: neverRun > 0
              ? `${evalCases.length} ${pluralise(evalCases.length, "check", "checks")}, ${passedRuns} passing, ${neverRun} never run.`
              : `${evalCases.length} ${pluralise(evalCases.length, "check", "checks")}, ${passedRuns} passing.`,
          }
          : { state: "NOT_CONFIGURED" as const, summary: "No checks written for this company." }),
    },
    {
      key: "drift",
      label: "Drift",
      href: "/ai/evals",
      ...(unresolvedDriftEvents.length > 0
        ? {
          state: "NEEDS_ATTENTION" as const,
          summary: `${formatCount(unresolvedDriftEvents.length, DRIFT_SCAN_LIMIT)} ${pluralise(unresolvedDriftEvents.length, "change has", "changes have")} been made since the checks last ran.`,
          action: "Run the checks again",
        }
        : evalCases.length > 0
          ? { state: "SET_HERE" as const, summary: "No changes since the checks last ran." }
          : { state: "NOT_CONFIGURED" as const, summary: "Nothing to track until there are checks." }),
    },
  ];

  return areas;
}

export const getCompanyAiReadiness = adminQuery({
  args: {
    companyId: v.id("companies"),
  },
  returns: tailShapes.companyReadinessShape,
  handler: async (ctx, args) => {
    const { company } = await requireCompanyAccess(ctx, args.companyId);
    const areas = await buildCompanyAiAreas(ctx, args.companyId, company);
    const needsAttention = areas.filter((area) => area.state === "NEEDS_ATTENTION");

    return {
      companyName: company.name,
      // Derived from the list above, so the headline and the table cannot
      // disagree — which is exactly what the old screen did.
      state: needsAttention.length > 0 ? ("NEEDS_ATTENTION" as const) : ("READY" as const),
      needsAttentionCount: needsAttention.length,
      configuredCount: areas.filter((area) => area.state === "SET_HERE").length,
      areas,
    };
  },
});

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

export const resolveDriftEvents = adminMutation({
  args: {
    companyId: v.id("companies"),
    sourceType: v.optional(driftSourceValidator),
  },
  returns: tailShapes.driftResolutionShape,
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
