import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { rowShape } from "./rowShape";

/**
 * What the agent-testing surfaces hand back.
 *
 * `agentEvalFixtures.ts` sits at the top of its frozen size band, so the shapes
 * live here rather than inline. Every field type is read off `convex/schema.ts`
 * where the value comes from a table, so a column that changes type fails to
 * compile here instead of refusing a real row in front of an admin.
 */

const agentFields = schema.tables.agents.validator.fields;
const fixtureFields = schema.tables.agentEvalFixtures.validator.fields;
const runFields = schema.tables.agentRuns.validator.fields;

export const smokeEvalGradingModeShape = v.union(
  v.literal("CONTRACT_ONLY"),
  v.literal("MODEL_GRADED"),
);

export const smokeEvalRunShape = v.object({
  runId: v.id("agentRuns"),
  fixtureId: v.id("agentEvalFixtures"),
  status: runFields.status,
  gradingMode: smokeEvalGradingModeShape,
  objective: v.string(),
  completedAt: v.number(),
  rubricSummary: v.string(),
  missingToolMappings: v.array(v.string()),
  expectedBlockedActionSummaries: v.array(v.string()),
});

export const evalFixturePageShape = paginationResultValidator(rowShape.agentEvalFixtures);

export const evalFixtureListShape = v.array(rowShape.agentEvalFixtures);

export const suitePresetListShape = v.array(rowShape.agentEvalSuitePresets);

export const evalSuiteRunShape = v.object({
  total: v.number(),
  passed: v.number(),
  failed: v.number(),
  active: v.number(),
  suitePresetId: v.optional(v.id("agentEvalSuitePresets")),
  suitePresetName: v.optional(v.string()),
  suiteTag: v.optional(v.string()),
  gradingMode: smokeEvalGradingModeShape,
  runs: v.array(smokeEvalRunShape),
});

export const releaseGateEntryStatusShape = v.union(
  v.literal("NOT_RUN"),
  v.literal("STALE"),
  v.literal("MODEL_REQUIRED"),
  v.literal("PASSED"),
  v.literal("FAILED"),
  v.literal("ACTIVE"),
);

export const releaseCandidateComparisonShape = v.object({
  policy: v.object({
    mode: v.union(v.literal("TAG"), v.literal("PRESET"), v.literal("NONE")),
    requiredTags: v.array(v.string()),
    suitePresetId: agentFields.releaseGateSuitePresetId,
    suitePresetName: v.optional(v.string()),
    modelGradingRequired: v.boolean(),
    warning: v.optional(v.string()),
  }),
  totals: v.object({
    total: v.number(),
    passed: v.number(),
    failed: v.number(),
    stale: v.number(),
    notRun: v.number(),
    active: v.number(),
    modelRequired: v.number(),
    changed: v.number(),
  }),
  entries: v.array(v.object({
    fixtureId: v.id("agentEvalFixtures"),
    type: fixtureFields.type,
    objective: fixtureFields.objective,
    tags: fixtureFields.tags,
    updatedAt: fixtureFields.updatedAt,
    status: releaseGateEntryStatusShape,
    latestRun: v.union(v.null(), v.object({
      runId: v.id("agentRuns"),
      status: runFields.status,
      gradingMode: smokeEvalGradingModeShape,
      startedAt: runFields.startedAt,
      completedAt: runFields.completedAt,
      finalOutput: runFields.finalOutput,
      error: runFields.error,
      isCurrent: v.boolean(),
    })),
    previousRun: v.union(v.null(), v.object({
      runId: v.id("agentRuns"),
      status: runFields.status,
      gradingMode: smokeEvalGradingModeShape,
      startedAt: runFields.startedAt,
      completedAt: runFields.completedAt,
      finalOutput: runFields.finalOutput,
      error: runFields.error,
    })),
    changedSincePrevious: v.boolean(),
  })),
});

export const checkDetailShape = v.object({
  check: v.object({
    fixtureId: v.id("agentEvalFixtures"),
    agentId: fixtureFields.agentId,
    objective: fixtureFields.objective,
    expectedFinalOutputRubric: fixtureFields.expectedFinalOutputRubric,
    tags: fixtureFields.tags,
    sampleCount: v.number(),
    updatedAt: fixtureFields.updatedAt,
    status: fixtureFields.status,
  }),
  history: v.array(v.object({
    runId: v.id("agentRuns"),
    status: runFields.status,
    gradingMode: smokeEvalGradingModeShape,
    startedAt: runFields.startedAt,
    completedAt: v.number(),
    modelId: runFields.modelId,
    inputTokens: runFields.inputTokens,
    outputTokens: runFields.outputTokens,
    costUsd: runFields.costUsd,
    finalOutput: runFields.finalOutput,
    error: runFields.error,
    failures: v.array(v.string()),
    missingToolMappings: v.array(v.string()),
  })),
});

export const smokeEvalHistoryShape = v.object({
  entries: v.array(v.object({
    runId: v.id("agentRuns"),
    status: runFields.status,
    objective: runFields.objective,
    finalOutput: runFields.finalOutput,
    error: runFields.error,
    startedAt: runFields.startedAt,
    completedAt: runFields.completedAt,
    agentVersionId: runFields.agentVersionId,
    modelId: runFields.modelId,
    providerKey: runFields.providerKey,
    providerModelId: runFields.providerModelId,
    fixture: v.union(v.null(), v.object({
      fixtureId: v.id("agentEvalFixtures"),
      type: fixtureFields.type,
      objective: fixtureFields.objective,
      expectedFinalOutputRubric: fixtureFields.expectedFinalOutputRubric,
      tags: fixtureFields.tags,
    })),
    gradingMode: smokeEvalGradingModeShape,
    evalStatus: v.string(),
    expectedToolMappings: v.array(v.string()),
    availableToolMappings: v.array(v.string()),
    missingToolMappings: v.array(v.string()),
    expectedBlockedActionSummaries: v.array(v.string()),
    failures: v.array(v.string()),
  })),
  totals: v.object({
    total: v.number(),
    passed: v.number(),
    setupPassed: v.number(),
    failed: v.number(),
    active: v.number(),
    modelGraded: v.number(),
  }),
});
