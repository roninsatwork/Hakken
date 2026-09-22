import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { skillRiskLevelValidator } from "./skillContracts";
import { rowShape } from "./rowShape";

/** What the learning-review screens hand back. */

const candidateFields = schema.tables.agentMemoryCandidates.validator.fields;
const suggestionFields = schema.tables.agentImprovementSuggestions.validator.fields;
const reflectionFields = schema.tables.agentRunReflections.validator.fields;
const runFields = schema.tables.agentRuns.validator.fields;

const runSummaryShape = v.union(v.null(), v.object({
  runId: v.id("agentRuns"),
  status: runFields.status,
  triggerType: runFields.triggerType,
  objective: v.string(),
  error: v.string(),
  startedAt: runFields.startedAt,
  completedAt: runFields.completedAt,
  costUsd: runFields.costUsd,
}));

const reviewerShape = v.union(v.null(), v.object({
  userId: v.id("users"),
  name: v.string(),
  email: v.optional(v.string()),
  role: v.optional(schema.tables.users.validator.fields.role),
}));

const skillSummaryShape = v.union(v.null(), v.object({
  skillId: v.id("agentSkills"),
  name: v.string(),
  category: v.string(),
  riskLevel: skillRiskLevelValidator,
  skillVersionId: v.optional(v.id("agentSkillVersions")),
  versionNumber: v.optional(v.number()),
  attributionReason: v.optional(v.string()),
}));

const patchPreviewShape = v.array(v.object({
  operation: v.union(v.literal("APPEND"), v.literal("SET"), v.literal("CREATE"), v.literal("REVIEW")),
  target: v.string(),
  before: v.optional(v.string()),
  after: v.optional(v.string()),
  note: v.optional(v.string()),
}));

export const candidatePageShape = paginationResultValidator(rowShape.agentMemoryCandidates);

export const candidateListShape = v.array(rowShape.agentMemoryCandidates);

export const candidateGenerationShape = v.object({
  createdIds: v.array(v.id("agentMemoryCandidates")),
  appliedIds: v.array(v.id("agentMemories")),
});

export const candidateDecisionShape = v.object({
  memoryId: v.union(v.id("agentMemories"), v.null()),
});

export const suggestionListShape = v.array(rowShape.agentImprovementSuggestions);

export const suggestionPageShape = paginationResultValidator(rowShape.agentImprovementSuggestions);

export const suggestionGenerationShape = v.object({
  createdIds: v.array(v.id("agentImprovementSuggestions")),
});

export const suggestionDecisionShape = v.object({
  appliedAgentVersionId: v.union(v.id("agentVersions"), v.null()),
  appliedSkillVersionId: v.union(v.id("agentSkillVersions"), v.null()),
});

export const reviewInboxShape = v.object({
  totals: v.object({
    open: v.number(),
    memoryCandidates: v.number(),
    improvementSuggestions: v.number(),
    reflections: v.number(),
    highRisk: v.number(),
  }),
  reviewGuidance: v.object({
    priority: v.union(v.literal("HIGH"), v.literal("MEDIUM"), v.literal("LOW"), v.literal("CLEAR")),
    label: v.string(),
    detail: v.string(),
    nextAction: v.string(),
  }),
  memoryCandidates: v.array(v.object({
    candidateId: v.id("agentMemoryCandidates"),
    sourceRun: runSummaryShape,
    sourceReflectionId: candidateFields.sourceReflectionId,
    kind: candidateFields.kind,
    content: v.string(),
    confidence: candidateFields.confidence,
    riskLevel: candidateFields.riskLevel,
    status: candidateFields.status,
    proposedBy: candidateFields.proposedBy,
    sourceSkill: skillSummaryShape,
    reviewedAt: candidateFields.reviewedAt,
    reviewer: reviewerShape,
    rejectionReason: candidateFields.rejectionReason,
    createdAt: candidateFields.createdAt,
  })),
  improvementSuggestions: v.array(v.object({
    suggestionId: v.id("agentImprovementSuggestions"),
    sourceRun: runSummaryShape,
    sourceReflectionId: suggestionFields.sourceReflectionId,
    sourceEvalFixtureId: suggestionFields.sourceEvalFixtureId,
    type: suggestionFields.type,
    title: suggestionFields.title,
    description: v.string(),
    riskLevel: suggestionFields.riskLevel,
    status: suggestionFields.status,
    proposedPatchJson: suggestionFields.proposedPatchJson,
    patchPreview: patchPreviewShape,
    reviewedAt: suggestionFields.reviewedAt,
    reviewer: reviewerShape,
    rejectionReason: suggestionFields.rejectionReason,
    appliedAgentVersionId: suggestionFields.appliedAgentVersionId,
    appliedSkillVersionId: suggestionFields.appliedSkillVersionId,
    appliedEffect: v.union(v.string(), v.null()),
    createdAt: suggestionFields.createdAt,
  })),
  reflections: v.array(v.object({
    reflectionId: v.id("agentRunReflections"),
    sourceRun: runSummaryShape,
    category: reflectionFields.category,
    riskLevel: skillRiskLevelValidator,
    status: reflectionFields.status,
    rootCause: v.string(),
    confidence: reflectionFields.confidence,
    proposedMemory: v.string(),
    proposedPromptChange: v.string(),
    proposedToolChange: v.string(),
    proposedEvalFixture: v.string(),
    reviewedAt: reflectionFields.reviewedAt,
    reviewer: reviewerShape,
    dismissalReason: reflectionFields.dismissalReason,
    createdAt: reflectionFields.createdAt,
  })),
});
