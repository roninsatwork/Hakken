import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";

const SUGGESTION_LIMIT = 200;
const SUGGESTION_TEXT_LIMIT = 1400;

const suggestionDecisionValidator = v.union(
  v.literal("APPROVED"),
  v.literal("REJECTED")
);

type SuggestionType =
  | "PROMPT_CHANGE"
  | "RULE_CHANGE"
  | "TOOL_SCHEMA_CHANGE"
  | "ROUTING_CHANGE"
  | "APPROVAL_POLICY_CHANGE";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type SuggestionDraft = {
  type: SuggestionType;
  title: string;
  description: string;
  proposedPatch: Record<string, unknown>;
  riskLevel: RiskLevel;
  sourceReflectionId?: Id<"agentRunReflections">;
  sourceEvalFixtureId?: Id<"agentEvalFixtures">;
};

function truncateText(value: string | undefined, limit = SUGGESTION_TEXT_LIMIT) {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
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

function buildSuggestionDrafts(args: {
  run: Doc<"agentRuns">;
  reflections: Doc<"agentRunReflections">[];
  fixtures: Doc<"agentEvalFixtures">[];
}): SuggestionDraft[] {
  const drafts: SuggestionDraft[] = [];
  const reflection = args.reflections[0];
  const fixture = args.fixtures[0];

  if (reflection?.proposedPromptChange) {
    drafts.push({
      type: "PROMPT_CHANGE",
      title: "Append approved learning guidance to the agent prompt",
      description: reflection.proposedPromptChange,
      proposedPatch: {
        appendSystemPrompt: reflection.proposedPromptChange,
        sourceRunId: args.run._id,
        sourceReflectionId: reflection._id,
      },
      riskLevel: "HIGH",
      sourceReflectionId: reflection._id,
    });
  }

  if (reflection?.proposedToolChange || fixture?.type === "BAD_TOOL_ARGS") {
    const toolPlan = fixture ? parseJsonObject(`{"tools":${fixture.expectedToolPlanJson || "[]" }}`) : {};
    drafts.push({
      type: "TOOL_SCHEMA_CHANGE",
      title: "Review tool schema or description",
      description: reflection?.proposedToolChange || fixture?.expectedFinalOutputRubric || "Review tool schema and examples for this failure.",
      proposedPatch: {
        note: reflection?.proposedToolChange || fixture?.expectedFinalOutputRubric,
        toolPlan,
        sourceRunId: args.run._id,
      },
      riskLevel: "MEDIUM",
      sourceReflectionId: reflection?._id,
      sourceEvalFixtureId: fixture?._id,
    });
  }

  if (reflection?.category === "PROMPT_INJECTION_BLOCKED" || reflection?.category === "TENANT_SCOPE_BLOCKED" || fixture?.type === "PROMPT_INJECTION" || fixture?.type === "TENANT_BOUNDARY") {
    drafts.push({
      type: "RULE_CHANGE",
      title: "Create safety regression rule",
      description: fixture?.expectedFinalOutputRubric || reflection?.rootCause || "Create a safety rule from this blocked behavior.",
      proposedPatch: {
        name: `Learning guardrail: ${fixture?.type || reflection?.category}`,
        trigger: fixture?.type || reflection?.category || "SAFETY_REGRESSION",
        instruction: fixture?.expectedFinalOutputRubric || reflection?.rootCause,
        priority: "HIGH",
      },
      riskLevel: "HIGH",
      sourceReflectionId: reflection?._id,
      sourceEvalFixtureId: fixture?._id,
    });
  }

  if (reflection?.category === "APPROVAL_REJECTED" || fixture?.type === "APPROVAL_PAUSE" || fixture?.type === "REJECTED_ACTION") {
    drafts.push({
      type: "APPROVAL_POLICY_CHANGE",
      title: "Require human approval for similar agent actions",
      description: "Enable the agent-level approval flag so risky actions continue to require operator review.",
      proposedPatch: {
        humanApprovalRequired: true,
        sourceRunId: args.run._id,
      },
      riskLevel: "HIGH",
      sourceReflectionId: reflection?._id,
      sourceEvalFixtureId: fixture?._id,
    });
  }

  if (reflection?.category === "USER_CANCELLED" || fixture?.type === "CANCELLATION") {
    drafts.push({
      type: "ROUTING_CHANGE",
      title: "Review trigger routing for cancelled runs",
      description: "Review schedule, workflow, or manual trigger wording because this run was cancelled before completion.",
      proposedPatch: {
        note: "Review trigger configuration and objective wording before running this path again.",
        sourceRunId: args.run._id,
      },
      riskLevel: "MEDIUM",
      sourceReflectionId: reflection?._id,
      sourceEvalFixtureId: fixture?._id,
    });
  }

  return drafts;
}

async function applySuggestion(ctx: Parameters<typeof ensureAgentVersionSnapshot>[0], args: {
  suggestion: Doc<"agentImprovementSuggestions">;
  userId: Id<"users">;
  now: number;
}) {
  const agent = await ctx.db.get(args.suggestion.agentId);
  if (!agent) throw new Error("Agent not found");
  const patch = parseJsonObject(args.suggestion.proposedPatchJson);

  if (args.suggestion.type === "PROMPT_CHANGE") {
    const appendSystemPrompt = typeof patch.appendSystemPrompt === "string" ? patch.appendSystemPrompt.trim() : "";
    if (!appendSystemPrompt) throw new Error("Prompt suggestion is missing text");
    const currentPrompt = agent.systemPrompt || "";
    await ctx.db.patch(agent._id, {
      systemPrompt: `${currentPrompt}${currentPrompt ? "\n\n" : ""}Approved learning note ${args.now}: ${appendSystemPrompt}`,
      updatedAt: args.now,
    });
  } else if (args.suggestion.type === "APPROVAL_POLICY_CHANGE") {
    await ctx.db.patch(agent._id, {
      humanApprovalRequired: true,
      updatedAt: args.now,
    });
  } else {
    const priority = patch.priority === "HIGH" || args.suggestion.riskLevel === "HIGH" ? "HIGH" : "NORMAL";
    await ctx.db.insert("aiRules", {
      companyId: args.suggestion.companyId,
      agentId: args.suggestion.agentId,
      name: typeof patch.name === "string" ? patch.name : args.suggestion.title,
      trigger: typeof patch.trigger === "string" ? patch.trigger : args.suggestion.type,
      instruction: typeof patch.instruction === "string" ? patch.instruction : args.suggestion.description,
      priority,
      isActive: true,
      createdBy: args.userId,
      createdAt: args.now,
    });
  }

  return await ensureAgentVersionSnapshot(ctx, {
    agentId: args.suggestion.agentId,
    companyId: args.suggestion.companyId,
  });
}

export const generateForRun = mutation({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    const [reflections, fixtures, existing] = await Promise.all([
      ctx.db
        .query("agentRunReflections")
        .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
        .order("desc")
        .take(SUGGESTION_LIMIT),
      ctx.db
        .query("agentEvalFixtures")
        .withIndex("by_run_created", (q) => q.eq("sourceRunId", args.runId))
        .order("desc")
        .take(SUGGESTION_LIMIT),
      ctx.db
        .query("agentImprovementSuggestions")
        .withIndex("by_run_created", (q) => q.eq("sourceRunId", args.runId))
        .order("desc")
        .take(SUGGESTION_LIMIT),
    ]);
    const existingKeys = new Set(existing.map((suggestion) => `${suggestion.type}:${suggestion.proposedPatchJson}`));
    const drafts = buildSuggestionDrafts({ run, reflections, fixtures });
    const now = Date.now();
    const createdIds: Id<"agentImprovementSuggestions">[] = [];

    for (const draft of drafts) {
      const proposedPatchJson = JSON.stringify(draft.proposedPatch);
      const key = `${draft.type}:${proposedPatchJson}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      const suggestionId = await ctx.db.insert("agentImprovementSuggestions", {
        agentId: run.agentId,
        companyId: run.companyId,
        sourceRunId: args.runId,
        sourceReflectionId: draft.sourceReflectionId,
        sourceEvalFixtureId: draft.sourceEvalFixtureId,
        createdBy: userId,
        type: draft.type,
        title: truncateText(draft.title, 240),
        description: truncateText(draft.description),
        proposedPatchJson,
        riskLevel: draft.riskLevel,
        status: "PROPOSED",
        createdAt: now,
        updatedAt: now,
      });
      createdIds.push(suggestionId);
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "CREATE_AGENT_IMPROVEMENT_SUGGESTION",
        entityId: suggestionId,
        entityType: "agentImprovementSuggestions",
        companyId: run.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          agentId: run.agentId,
          sourceRunId: args.runId,
          type: draft.type,
          riskLevel: draft.riskLevel,
        }),
      });
    }

    return { createdIds };
  },
});

export const decideSuggestion = mutation({
  args: {
    suggestionId: v.id("agentImprovementSuggestions"),
    decision: suggestionDecisionValidator,
    rejectionReason: v.optional(v.string()),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw new Error("Improvement suggestion not found");
    assertAdminCanAccessCompany(user, suggestion.companyId);
    if (suggestion.status !== "PROPOSED" && suggestion.status !== "APPROVED") {
      throw new Error("Improvement suggestion has already been reviewed");
    }

    const now = Date.now();
    if (args.decision === "REJECTED") {
      await ctx.db.patch(args.suggestionId, {
        status: "REJECTED",
        reviewedBy: userId,
        reviewedAt: now,
        rejectionReason: args.rejectionReason,
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "REJECT_AGENT_IMPROVEMENT_SUGGESTION",
        entityId: args.suggestionId,
        entityType: "agentImprovementSuggestions",
        companyId: suggestion.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          agentId: suggestion.agentId,
          type: suggestion.type,
          reason: args.rejectionReason,
        }),
      });
      return { appliedAgentVersionId: null };
    }

    await ctx.db.patch(args.suggestionId, {
      status: "APPROVED",
      reviewedBy: userId,
      reviewedAt: now,
      updatedAt: now,
    });
    if (args.apply !== true) return { appliedAgentVersionId: null };

    const approvedSuggestion = await ctx.db.get(args.suggestionId);
    if (!approvedSuggestion) throw new Error("Improvement suggestion not found");
    const appliedAgentVersionId = await applySuggestion(ctx, {
      suggestion: approvedSuggestion,
      userId,
      now,
    });
    await ctx.db.patch(args.suggestionId, {
      status: "APPLIED",
      appliedAgentVersionId,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "APPLY_AGENT_IMPROVEMENT_SUGGESTION",
      entityId: args.suggestionId,
      entityType: "agentImprovementSuggestions",
      companyId: suggestion.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: suggestion.agentId,
        type: suggestion.type,
        appliedAgentVersionId,
      }),
    });

    return { appliedAgentVersionId };
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
        .query("agentImprovementSuggestions")
        .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", "PROPOSED"))
        .order("desc")
        .take(SUGGESTION_LIMIT);
    }

    return await ctx.db
      .query("agentImprovementSuggestions")
      .withIndex("by_company_status_created", (q) => q.eq("companyId", user.companyId).eq("status", "PROPOSED"))
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .order("desc")
      .take(SUGGESTION_LIMIT);
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
      .query("agentImprovementSuggestions")
      .withIndex("by_run_created", (q) => q.eq("sourceRunId", args.runId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

