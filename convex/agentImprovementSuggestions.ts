import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";
import { ensureAgentSkillVersionSnapshot } from "./agentSkillsService";
import { appError } from "./utils/appError";

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
  | "APPROVAL_POLICY_CHANGE"
  | "SKILL_INSTRUCTION_CHANGE";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type SuggestionDraft = {
  type: SuggestionType;
  title: string;
  description: string;
  proposedPatch: Record<string, unknown>;
  riskLevel: RiskLevel;
  sourceReflectionId?: Id<"agentRunReflections">;
  sourceEvalFixtureId?: Id<"agentEvalFixtures">;
  sourceSkillId?: Id<"agentSkills">;
  sourceSkillVersionId?: Id<"agentSkillVersions">;
};

type SkillSuggestionEvidence = {
  skill: Doc<"agentSkills">;
  skillVersionId?: Id<"agentSkillVersions">;
  fixture?: Doc<"agentEvalFixtures">;
  missingToolMappings: string[];
  evidenceSource: "smoke_eval" | "runtime_trace";
  attributionReason: string;
  attributionScore: number;
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

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getSkillId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value as Id<"agentSkills"> : undefined;
}

function getSkillVersionId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value as Id<"agentSkillVersions"> : undefined;
}

function parseStoredStringArray(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return getStringArray(parsed);
  } catch {
    return [];
  }
}

function tokenize(value: string | undefined) {
  return new Set((value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4));
}

function countTokenOverlap(left: Set<string>, right: Set<string>, limit = 4) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
    if (count >= limit) break;
  }
  return count;
}

function hasNegativeFeedback(feedback: Doc<"agentRunFeedback">[]) {
  return feedback.some((entry) =>
    entry.rating === "NEGATIVE"
    || entry.labels.some((label) => label !== "GOOD_ANSWER" && label !== "SHOULD_BECOME_EVAL")
  );
}

function getRuntimeSkillRecordsFromSteps(steps: Doc<"agentRunSteps">[]) {
  const records = new Map<Id<"agentSkills">, {
    skillId: Id<"agentSkills">;
    skillVersionId?: Id<"agentSkillVersions">;
    name?: string;
    category?: string;
    riskLevel?: string;
    requiredToolMappings: string[];
  }>();

  for (const step of steps) {
    if (step.kind !== "OBSERVE") continue;
    const metadata = parseJsonObject(step.output);
    const skills = Array.isArray(metadata.skills) ? metadata.skills : [];
    for (const entry of skills) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const skillId = getSkillId(record.skillId);
      if (!skillId || records.has(skillId)) continue;
      records.set(skillId, {
        skillId,
        skillVersionId: getSkillVersionId(record.skillVersionId),
        name: getOptionalString(record.name),
        category: getOptionalString(record.category),
        riskLevel: getOptionalString(record.riskLevel),
        requiredToolMappings: getStringArray(record.requiredToolMappings),
      });
    }
  }

  return Array.from(records.values());
}

async function getSmokeEvalSkillEvidenceForRun(ctx: Parameters<typeof ensureAgentVersionSnapshot>[0], args: {
  steps: Doc<"agentRunSteps">[];
}): Promise<SkillSuggestionEvidence | null> {
  const observeStep = args.steps.find((step) => step.kind === "OBSERVE");
  const metadata = parseJsonObject(observeStep?.output);
  const fixtureId = getOptionalString(metadata.fixtureId) as Id<"agentEvalFixtures"> | undefined;
  if (!fixtureId) return null;

  const fixture = await ctx.db.get(fixtureId);
  if (!fixture) return null;
  const fixtureEvidence = parseJsonObject(fixture.sourceEvidenceJson);
  const runEvidence = typeof metadata.sourceEvidenceJson === "string"
    ? parseJsonObject(metadata.sourceEvidenceJson)
    : {};
  const source = typeof fixtureEvidence.source === "string" ? fixtureEvidence.source : runEvidence.source;
  if (source !== "agent_skill") return null;

  const skillId = getSkillId(fixtureEvidence.skillId) || getSkillId(runEvidence.skillId);
  if (!skillId) return null;

  const skill = await ctx.db.get(skillId);
  if (!skill) return null;
  const skillVersionId = getSkillVersionId(runEvidence.skillVersionId) || getSkillVersionId(fixtureEvidence.skillVersionId);

  return {
    skill,
    skillVersionId,
    fixture,
    missingToolMappings: getStringArray(metadata.missingToolMappings),
    evidenceSource: "smoke_eval",
    attributionReason: "The failed smoke eval was seeded from this skill's fixture evidence.",
    attributionScore: 100,
  };
}

async function getRuntimeTraceSkillEvidenceForRun(ctx: Parameters<typeof ensureAgentVersionSnapshot>[0], args: {
  run: Doc<"agentRuns">;
  steps: Doc<"agentRunSteps">[];
  reflections: Doc<"agentRunReflections">[];
  feedback: Doc<"agentRunFeedback">[];
}): Promise<SkillSuggestionEvidence | null> {
  if (args.run.status !== "FAILED" && args.run.status !== "CANCELLED" && !hasNegativeFeedback(args.feedback) && args.reflections.length === 0) {
    return null;
  }

  const runtimeSkillRecords = getRuntimeSkillRecordsFromSteps(args.steps);
  if (runtimeSkillRecords.length === 0) return null;

  const toolCalls = await ctx.db
    .query("agentToolCalls")
    .withIndex("by_run_started", (q) => q.eq("runId", args.run._id))
    .order("asc")
    .take(SUGGESTION_LIMIT);
  const approvals = await ctx.db
    .query("agentRunApprovals")
    .withIndex("by_run_requested", (q) => q.eq("runId", args.run._id))
    .order("asc")
    .take(SUGGESTION_LIMIT);
  const toolCallById = new Map(toolCalls.map((toolCall) => [toolCall._id, toolCall]));
  const failedOrRelevantToolMappings = new Set(toolCalls
    .filter((toolCall) => toolCall.status !== "SUCCESS")
    .map((toolCall) => toolCall.handlerMapping)
    .filter(Boolean));
  const allToolMappings = new Set(toolCalls.map((toolCall) => toolCall.handlerMapping).filter(Boolean));
  const approvalToolMappings = new Set(approvals
    .filter((approval) => approval.status !== "APPROVED")
    .map((approval) => approval.toolCallId ? toolCallById.get(approval.toolCallId)?.handlerMapping : undefined)
    .filter(Boolean));
  const evidenceText = [
    args.run.objective,
    args.run.error,
    args.run.finalOutput,
    ...approvals.flatMap((approval) => [
      approval.status,
      approval.message,
      approval.previewJson,
      approval.decisionReason,
    ]),
    ...args.reflections.flatMap((reflection) => [
      reflection.category,
      reflection.rootCause,
      reflection.proposedPromptChange,
      reflection.proposedToolChange,
      reflection.proposedEvalFixture,
    ]),
    ...args.feedback.flatMap((entry) => [
      entry.rating,
      entry.comment,
      ...entry.labels,
    ]),
  ].filter(Boolean).join(" ");
  const evidenceTokens = tokenize(evidenceText);

  let best: {
    skill: Doc<"agentSkills">;
    skillVersionId?: Id<"agentSkillVersions">;
    score: number;
    reasons: string[];
    missingToolMappings: string[];
  } | null = null;

  for (const record of runtimeSkillRecords) {
    const skill = await ctx.db.get(record.skillId);
    if (!skill) continue;
    const requiredToolMappings = parseStoredStringArray(skill.requiredToolMappingsJson);
    const recommendedToolMappings = parseStoredStringArray(skill.recommendedToolMappingsJson);
    const allSkillToolMappings = Array.from(new Set([
      ...record.requiredToolMappings,
      ...requiredToolMappings,
      ...recommendedToolMappings,
    ]));
    let score = 0;
    const reasons: string[] = [];
    const failedToolOverlap = allSkillToolMappings.filter((mapping) => failedOrRelevantToolMappings.has(mapping));
    if (failedToolOverlap.length > 0) {
      score += 8 + failedToolOverlap.length;
      reasons.push(`failed tool overlap: ${failedToolOverlap.join(", ")}`);
    }
    const approvalToolOverlap = allSkillToolMappings.filter((mapping) => approvalToolMappings.has(mapping));
    if (approvalToolOverlap.length > 0) {
      score += 10 + approvalToolOverlap.length;
      reasons.push(`approval tool overlap: ${approvalToolOverlap.slice(0, 3).join(", ")}`);
    }
    const usedToolOverlap = allSkillToolMappings.filter((mapping) => allToolMappings.has(mapping));
    if (usedToolOverlap.length > 0) {
      score += 3;
      reasons.push(`tool use overlap: ${usedToolOverlap.slice(0, 3).join(", ")}`);
    }

    const skillTokens = tokenize([
      record.name,
      record.category,
      skill.name,
      skill.category,
      skill.description,
      skill.instruction,
    ].filter(Boolean).join(" "));
    const tokenOverlap = countTokenOverlap(skillTokens, evidenceTokens);
    if (tokenOverlap > 0) {
      score += tokenOverlap;
      reasons.push(`semantic overlap: ${tokenOverlap} matched term${tokenOverlap === 1 ? "" : "s"}`);
    }

    const labels = new Set(args.feedback.flatMap((entry) => entry.labels));
    if (labels.has("BAD_TOOL_ARGS") || labels.has("WRONG_TOOL")) {
      score += allSkillToolMappings.length > 0 ? 2 : 1;
      reasons.push("operator feedback points at tool behavior");
    }
    if (labels.has("NEEDS_APPROVAL_POLICY_CHANGE") && skill.riskLevel === "HIGH") {
      score += 2;
      reasons.push("approval feedback on a high-risk skill");
    }
    if (skill.riskLevel === "HIGH" && args.reflections.some((reflection) =>
      reflection.category === "APPROVAL_REJECTED"
      || reflection.category === "POLICY_BLOCKED"
      || reflection.category === "TENANT_SCOPE_BLOCKED"
      || reflection.category === "PROMPT_INJECTION_BLOCKED"
    )) {
      score += 2;
      reasons.push("high-risk skill active during safety or approval failure");
    }
    if (runtimeSkillRecords.length === 1 && score === 0) {
      score = 1;
      reasons.push("only active skill during a failed or negatively reviewed run");
    }

    if (!best || score > best.score) {
      const missingToolMappings = requiredToolMappings.filter((mapping) => !allToolMappings.has(mapping));
      best = {
        skill,
        skillVersionId: record.skillVersionId,
        score,
        reasons,
        missingToolMappings,
      };
    }
  }

  if (!best || best.score <= 0) return null;

  return {
    skill: best.skill,
    skillVersionId: best.skillVersionId,
    missingToolMappings: best.missingToolMappings,
    evidenceSource: "runtime_trace",
    attributionReason: best.reasons.join("; ") || "The skill was active during a failed or negatively reviewed run.",
    attributionScore: best.score,
  };
}

async function getSkillEvidenceForRun(ctx: Parameters<typeof ensureAgentVersionSnapshot>[0], args: {
  run: Doc<"agentRuns">;
  reflections: Doc<"agentRunReflections">[];
  feedback: Doc<"agentRunFeedback">[];
}): Promise<SkillSuggestionEvidence | null> {
  const steps = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", args.run._id))
    .order("asc")
    .take(SUGGESTION_LIMIT);
  const smokeEvalEvidence = await getSmokeEvalSkillEvidenceForRun(ctx, { steps });
  if (smokeEvalEvidence) return smokeEvalEvidence;
  return await getRuntimeTraceSkillEvidenceForRun(ctx, {
    run: args.run,
    steps,
    reflections: args.reflections,
    feedback: args.feedback,
  });
}

function buildSuggestionDrafts(args: {
  run: Doc<"agentRuns">;
  reflections: Doc<"agentRunReflections">[];
  fixtures: Doc<"agentEvalFixtures">[];
  skillEvidence?: SkillSuggestionEvidence | null;
}): SuggestionDraft[] {
  const drafts: SuggestionDraft[] = [];
  const reflection = args.reflections[0];
  const fixture = args.fixtures[0];
  const skillEvidence = args.skillEvidence;

  if (skillEvidence) {
    const failureGuidance = truncateText(
      reflection?.proposedPromptChange
      || reflection?.proposedToolChange
      || reflection?.rootCause
      || skillEvidence.fixture?.expectedFinalOutputRubric
      || args.run.error
      || args.run.finalOutput
      || `Review the ${skillEvidence.skill.name} skill guidance based on this run evidence.`,
      900
    );
    const toolContext = skillEvidence.missingToolMappings.length > 0
      ? ` Missing required tool mappings in the failed run: ${skillEvidence.missingToolMappings.join(", ")}.`
      : "";
    drafts.push({
      type: "SKILL_INSTRUCTION_CHANGE",
      title: `Review shared skill guidance: ${skillEvidence.skill.name}`,
      description: truncateText(`${failureGuidance}${toolContext}`),
      proposedPatch: {
        appendSkillInstruction: failureGuidance,
        sourceRunId: args.run._id,
        sourceSkillId: skillEvidence.skill._id,
        sourceSkillVersionId: skillEvidence.skillVersionId,
        evidenceSource: skillEvidence.evidenceSource,
        attributionReason: skillEvidence.attributionReason,
        attributionScore: skillEvidence.attributionScore,
      },
      riskLevel: skillEvidence.skill.riskLevel,
      sourceReflectionId: reflection?._id,
      sourceEvalFixtureId: skillEvidence.fixture?._id,
      sourceSkillId: skillEvidence.skill._id,
      sourceSkillVersionId: skillEvidence.skillVersionId,
    });
  }

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
  canManageSkills: boolean;
  now: number;
}) {
  const agent = await ctx.db.get(args.suggestion.agentId);
  if (!agent) throw appError("NOT_FOUND", "Agent not found");
  const patch = parseJsonObject(args.suggestion.proposedPatchJson);

  if (args.suggestion.type === "SKILL_INSTRUCTION_CHANGE") {
    if (!args.canManageSkills) throw appError("UNAUTHORIZED", "Only super admins can apply shared skill suggestions.");
    const skillId = args.suggestion.sourceSkillId;
    if (!skillId) throw appError("INVALID_INPUT", "Skill suggestion is missing a source skill.");
    const skill = await ctx.db.get(skillId);
    if (!skill) throw appError("NOT_FOUND", "Skill not found.");
    const appendSkillInstruction = typeof patch.appendSkillInstruction === "string"
      ? patch.appendSkillInstruction.trim()
      : "";
    if (!appendSkillInstruction) throw appError("INVALID_INPUT", "Skill suggestion is missing instruction text.");
    await ctx.db.patch(skillId, {
      instruction: `${skill.instruction}${skill.instruction ? "\n\n" : ""}Approved learning note ${args.now}: ${appendSkillInstruction}`,
      updatedAt: args.now,
    });
    const appliedSkillVersionId = await ensureAgentSkillVersionSnapshot(ctx, skillId);
    return { appliedAgentVersionId: null, appliedSkillVersionId };
  }

  if (args.suggestion.type === "PROMPT_CHANGE") {
    const appendSystemPrompt = typeof patch.appendSystemPrompt === "string" ? patch.appendSystemPrompt.trim() : "";
    if (!appendSystemPrompt) throw appError("INVALID_INPUT", "Prompt suggestion is missing text");
    const currentPrompt = agent.systemPrompt || "";
    await ctx.db.patch(agent._id, {
      systemPrompt: `${currentPrompt}${currentPrompt ? "\n\n" : ""}Approved learning note ${args.now}: ${appendSystemPrompt}`,
      updatedAt: args.now,
    });
  } else if (args.suggestion.type === "APPROVAL_POLICY_CHANGE") {
    // Autonomy outranks the approval flag in the runtime, so setting the flag on
    // an autonomous agent would apply cleanly, report success and change nothing.
    // A suggestion whose whole purpose is to restore human review has to turn
    // autonomy off as well.
    await ctx.db.patch(agent._id, {
      humanApprovalRequired: true,
      autonomousToolExecution: false,
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

  const appliedAgentVersionId = await ensureAgentVersionSnapshot(ctx, {
    agentId: args.suggestion.agentId,
    companyId: args.suggestion.companyId,
  });
  return { appliedAgentVersionId, appliedSkillVersionId: null };
}

export const generateForRun = adminMutation({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND", "Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    const [reflections, fixtures, existing, feedback] = await Promise.all([
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
      ctx.db
        .query("agentRunFeedback")
        .withIndex("by_run_created", (q) => q.eq("runId", args.runId))
        .order("desc")
        .take(SUGGESTION_LIMIT),
    ]);
    const skillEvidence = await getSkillEvidenceForRun(ctx, { run, reflections, feedback });
    const existingKeys = new Set(existing.map((suggestion) => `${suggestion.type}:${suggestion.proposedPatchJson}`));
    const skillFixture = skillEvidence?.fixture;
    const allFixtures = skillFixture && !fixtures.some((fixture) => fixture._id === skillFixture._id)
      ? [skillFixture, ...fixtures]
      : fixtures;
    const drafts = buildSuggestionDrafts({ run, reflections, fixtures: allFixtures, skillEvidence });
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
        sourceSkillId: draft.sourceSkillId,
        sourceSkillVersionId: draft.sourceSkillVersionId,
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
          sourceSkillId: draft.sourceSkillId,
          sourceSkillVersionId: draft.sourceSkillVersionId,
        }),
      });
    }

    return { createdIds };
  },
});

export const decideSuggestion = adminMutation({
  args: {
    suggestionId: v.id("agentImprovementSuggestions"),
    decision: suggestionDecisionValidator,
    rejectionReason: v.optional(v.string()),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion) throw appError("NOT_FOUND", "Improvement suggestion not found");
    assertAdminCanAccessCompany(user, suggestion.companyId);
    if (suggestion.status !== "PROPOSED" && suggestion.status !== "APPROVED") {
      throw appError("CONFLICT", "Improvement suggestion has already been reviewed");
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
      return { appliedAgentVersionId: null, appliedSkillVersionId: null };
    }

    await ctx.db.patch(args.suggestionId, {
      status: "APPROVED",
      reviewedBy: userId,
      reviewedAt: now,
      updatedAt: now,
    });
    if (args.apply !== true) return { appliedAgentVersionId: null, appliedSkillVersionId: null };

    const approvedSuggestion = await ctx.db.get(args.suggestionId);
    if (!approvedSuggestion) throw appError("NOT_FOUND", "Improvement suggestion not found");
    const appliedResult = await applySuggestion(ctx, {
      suggestion: approvedSuggestion,
      userId,
      canManageSkills: user.role === "SUPER_ADMIN",
      now,
    });
    await ctx.db.patch(args.suggestionId, {
      status: "APPLIED",
      appliedAgentVersionId: appliedResult.appliedAgentVersionId ?? undefined,
      appliedSkillVersionId: appliedResult.appliedSkillVersionId ?? undefined,
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
        appliedAgentVersionId: appliedResult.appliedAgentVersionId,
        appliedSkillVersionId: appliedResult.appliedSkillVersionId,
      }),
    });

    return appliedResult;
  },
});

export const getRecentForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    if (user.role === "ADMIN" && !user.companyId) {
      throw appError("UNAUTHORIZED", "Unauthorized");
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

export const getForRun = adminQuery({
  args: {
    runId: v.id("agentRuns"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) throw appError("NOT_FOUND", "Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    return await ctx.db
      .query("agentImprovementSuggestions")
      .withIndex("by_run_created", (q) => q.eq("sourceRunId", args.runId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
