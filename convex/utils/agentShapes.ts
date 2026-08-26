import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { evalFixtureTypeValidator, skillRiskLevelValidator, skillStatusValidator } from "./skillContracts";
import { rowShape } from "./rowShape";

/**
 * What the agent surfaces hand back.
 *
 * `agents.ts` sits at the top of its frozen size band, so the shapes live here.
 * The readiness shape is the long one, and it is long because the screen it
 * feeds is: every check, every skill, every release-gate fixture and what each
 * one is waiting on.
 */

const agentFields = schema.tables.agents.validator.fields;
const fixtureFields = schema.tables.agentEvalFixtures.validator.fields;
const runFields = schema.tables.agentRuns.validator.fields;

const agentRowShape = v.object({
  ...agentFields,
  _id: v.id("agents"),
  _creationTime: v.number(),
});

export const agentListShape = v.array(agentRowShape);

export const agentPageShape = paginationResultValidator(agentRowShape);

export const agentDetailShape = v.object({
  ...agentRowShape.fields,
  populatedRules: v.array(rowShape.aiRules),
  populatedKnowledge: v.array(rowShape.knowledgeDocuments),
});

const inheritedModelShape = v.union(v.null(), v.object({
  modelId: v.string(),
  providerKey: v.optional(v.string()),
  displayName: v.string(),
}));

export const inheritedAgentModelsShape = v.object({
  agent: inheritedModelShape,
  workflow: inheritedModelShape,
});

const readinessStatusShape = v.union(v.literal("PASS"), v.literal("WARN"));

export const agentReadinessShape = v.object({
  agentId: v.id("agents"),
  isActive: agentFields.isActive,
  toolBindingCount: v.number(),
  knowledgeDocumentCount: v.number(),
  modelReadiness: v.object({
    status: readinessStatusShape,
    source: v.union(
      v.literal("override"),
      v.literal("useCaseDefault"),
      v.literal("fallbackDefault"),
      v.literal("legacyDefault"),
      v.literal("missing"),
    ),
    useCase: v.union(v.literal("agent"), v.literal("workflow")),
    modelId: v.string(),
    providerKey: v.optional(v.string()),
    inheritedModelId: v.optional(v.string()),
  }),
  activeEvalFixtureCount: v.number(),
  skillReadiness: v.object({
    enabledCount: v.number(),
    missingRequiredToolCount: v.number(),
    missingHighRiskEvalCount: v.number(),
    skills: v.array(v.object({
      bindingId: v.id("agentSkillBindings"),
      skillId: v.id("agentSkills"),
      skillVersionId: v.id("agentSkillVersions"),
      name: v.string(),
      status: skillStatusValidator,
      riskLevel: v.optional(skillRiskLevelValidator),
      versionNumber: v.optional(v.number()),
      requiredToolMappings: v.array(v.string()),
      missingRequiredToolMappings: v.array(v.string()),
      activeEvalFixtureCount: v.number(),
      latestSkillSmokeEval: v.union(v.null(), v.object({
        runId: v.id("agentRuns"),
        status: v.string(),
        completedAt: v.optional(v.number()),
        isCurrent: v.boolean(),
      })),
      skillSmokePassed: v.boolean(),
    })),
  }),
  fixtureCoverage: v.array(v.object({
    type: evalFixtureTypeValidator,
    activeCount: v.number(),
    latestAt: v.optional(v.number()),
    smokePassed: v.boolean(),
  })),
  successfulSmokeEvalRunCount: v.number(),
  successfulModelGradedEvalCount: v.number(),
  latestSmokeEvalAt: v.optional(v.number()),
  latestSmokeEvalRun: v.union(v.null(), v.object({
    runId: v.id("agentRuns"),
    objective: runFields.objective,
    status: runFields.status,
    completedAt: v.number(),
    agentVersionId: runFields.agentVersionId,
    finalOutput: runFields.finalOutput,
    error: runFields.error,
  })),
  releaseGatePolicy: v.object({
    mode: v.union(v.literal("TAG"), v.literal("PRESET"), v.literal("NONE")),
    requiredTags: v.array(v.string()),
    suitePresetId: agentFields.releaseGateSuitePresetId,
    suitePresetName: v.optional(v.string()),
    requiresModelGrading: v.boolean(),
    warning: v.optional(v.string()),
    criticalFixtureCount: v.number(),
    passedCriticalFixtureCount: v.number(),
    blockedCriticalFixtureCount: v.number(),
    fixtures: v.array(v.object({
      fixtureId: v.id("agentEvalFixtures"),
      type: fixtureFields.type,
      objective: fixtureFields.objective,
      tags: fixtureFields.tags,
      updatedAt: fixtureFields.updatedAt,
      latestRun: v.union(v.null(), v.object({
        runId: v.id("agentRuns"),
        status: v.string(),
        gradingMode: v.union(v.literal("CONTRACT_ONLY"), v.literal("MODEL_GRADED")),
        completedAt: v.number(),
        isCurrent: v.boolean(),
        modelGradingSatisfied: v.boolean(),
      })),
      passed: v.boolean(),
    })),
  }),
  activationRisk: v.boolean(),
  activationWarnings: v.array(v.string()),
  checks: v.array(v.object({
    key: v.union(
      v.literal("draftStatus"),
      v.literal("modelDefault"),
      v.literal("tools"),
      v.literal("skills"),
      v.literal("knowledge"),
      v.literal("evalFixtures"),
      v.literal("smokeEval"),
      v.literal("releaseGate"),
    ),
    status: readinessStatusShape,
    count: v.optional(v.number()),
    latestAt: v.optional(v.number()),
  })),
});

export const agentTemplateListShape = v.array(v.object({
  id: v.string(),
  name: v.string(),
  agentName: v.string(),
  description: v.string(),
  systemPrompt: v.string(),
  temperature: v.number(),
  humanApprovalRequired: v.boolean(),
  reasoningEffort: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH")),
  triggerType: v.union(v.literal("MANUAL"), v.literal("WEBHOOK"), v.literal("SCHEDULE")),
  recommendedToolMappings: v.array(v.string()),
  suggestedEvalFixtures: v.array(v.object({
    type: v.union(
      v.literal("HAPPY_PATH"),
      v.literal("APPROVAL_PAUSE"),
      v.literal("PROMPT_INJECTION"),
      v.literal("TOOL_PLAN"),
    ),
    objective: v.string(),
    expectedFinalOutputRubric: v.string(),
    expectedToolPlanJson: v.optional(v.string()),
    expectedBlockedActionsJson: v.optional(v.string()),
    tags: v.array(v.string()),
  })),
}));
