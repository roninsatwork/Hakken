import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { evalFixtureTypeValidator } from "./skillContracts";
import { rowShape } from "./rowShape";

/** What the agent run screens hand back. */

const runFields = schema.tables.agentRuns.validator.fields;
const stepFields = schema.tables.agentRunSteps.validator.fields;
const toolCallFields = schema.tables.agentToolCalls.validator.fields;
const approvalFields = schema.tables.agentRunApprovals.validator.fields;
const fixtureFields = schema.tables.agentEvalFixtures.validator.fields;
const feedbackFields = schema.tables.agentRunFeedback.validator.fields;

export const runPageShape = paginationResultValidator(rowShape.agentRuns);

export const workingAgentIdsShape = v.array(v.id("agents"));

export const agentRunListPageShape = paginationResultValidator(v.object({
  _id: v.id("agentRuns"),
  objective: runFields.objective,
  status: runFields.status,
  triggerType: runFields.triggerType,
  isRehearsal: v.boolean(),
  startedAt: runFields.startedAt,
  completedAt: runFields.completedAt,
  costUsd: runFields.costUsd,
  error: runFields.error,
  finalOutput: runFields.finalOutput,
  agentVersionId: runFields.agentVersionId,
  continuedByRunId: runFields.continuedByRunId,
  markers: v.object({
    feedback: v.union(v.null(), v.object({
      rating: feedbackFields.rating,
      labels: feedbackFields.labels,
      comment: feedbackFields.comment,
    })),
    reflected: v.boolean(),
    memoryCandidateIds: v.array(v.id("agentMemoryCandidates")),
    usedAsCheck: v.boolean(),
    suggestionIds: v.array(v.id("agentImprovementSuggestions")),
  }),
}));

export const replayChangeTypeShape = v.union(
  v.literal("ADDED"),
  v.literal("REMOVED"),
  v.literal("CHANGED"),
  v.literal("UNCHANGED"),
);

const stepDiffSummaryShape = v.optional(v.object({
  kind: stepFields.kind,
  status: stepFields.status,
  summary: v.string(),
  outputPreview: v.string(),
  errorPreview: v.string(),
  durationMs: v.optional(v.number()),
}));

const runSummaryShape = v.object({
  runId: v.id("agentRuns"),
  agentVersionId: runFields.agentVersionId,
  status: runFields.status,
  triggerType: runFields.triggerType,
  objective: runFields.objective,
  startedAt: runFields.startedAt,
  completedAt: runFields.completedAt,
  latencyMs: v.optional(v.number()),
  costUsd: runFields.costUsd,
  inputTokens: runFields.inputTokens,
  outputTokens: runFields.outputTokens,
  finalOutputPreview: v.string(),
  errorPreview: v.string(),
  replayMode: runFields.replayMode,
});

export const runDetailShape = v.union(v.null(), v.object({
  run: rowShape.agentRuns,
  steps: v.array(rowShape.agentRunSteps),
  toolCalls: v.array(v.object({
    _id: v.id("agentToolCalls"),
    _creationTime: v.number(),
    runId: toolCallFields.runId,
    stepId: toolCallFields.stepId,
    agentId: toolCallFields.agentId,
    toolId: toolCallFields.toolId,
    normalizedToolName: toolCallFields.normalizedToolName,
    toolName: v.optional(v.string()),
    handlerMapping: toolCallFields.handlerMapping,
    argumentsPreview: v.string(),
    rawArgumentsPreview: v.optional(v.string()),
    redactedArgumentsPreview: v.string(),
    argumentViewMode: v.union(v.literal("RAW"), v.literal("REDACTED")),
    rawArgumentsAvailable: v.boolean(),
    status: toolCallFields.status,
    requiredRole: toolCallFields.requiredRole,
    sideEffectLevel: toolCallFields.sideEffectLevel,
    confirmationRequired: toolCallFields.confirmationRequired,
    confirmationGrantedAt: toolCallFields.confirmationGrantedAt,
    companyId: toolCallFields.companyId,
    userId: toolCallFields.userId,
    startedAt: toolCallFields.startedAt,
    completedAt: toolCallFields.completedAt,
    resultJson: toolCallFields.resultJson,
    error: toolCallFields.error,
  })),
  approvals: v.array(rowShape.agentRunApprovals),
  timeline: v.array(v.object({
    stepId: v.id("agentRunSteps"),
    stepIndex: stepFields.stepIndex,
    kind: stepFields.kind,
    status: stepFields.status,
    startedAt: stepFields.startedAt,
    completedAt: stepFields.completedAt,
    durationMs: v.optional(v.number()),
    summary: v.string(),
    inputPreview: v.string(),
    outputPreview: v.string(),
    errorPreview: v.string(),
    modelId: stepFields.modelId,
    providerKey: stepFields.providerKey,
    providerModelId: stepFields.providerModelId,
    inputTokens: stepFields.inputTokens,
    outputTokens: stepFields.outputTokens,
    costUsd: stepFields.costUsd,
    linkedToolCalls: v.array(v.object({
      toolCallId: v.id("agentToolCalls"),
      normalizedToolName: toolCallFields.normalizedToolName,
      handlerMapping: toolCallFields.handlerMapping,
      status: toolCallFields.status,
      sideEffectLevel: toolCallFields.sideEffectLevel,
      confirmationRequired: toolCallFields.confirmationRequired,
    })),
    linkedApprovals: v.array(v.object({
      approvalId: v.id("agentRunApprovals"),
      status: approvalFields.status,
      requestedAt: approvalFields.requestedAt,
      reviewedAt: approvalFields.reviewedAt,
    })),
  })),
  evalFixtureContext: v.object({
    canCreateFromRun: v.boolean(),
    activeCount: v.number(),
    archivedCount: v.number(),
    fixtures: v.array(v.object({
      fixtureId: v.id("agentEvalFixtures"),
      type: evalFixtureTypeValidator,
      status: fixtureFields.status,
      tags: fixtureFields.tags,
      updatedAt: fixtureFields.updatedAt,
    })),
  }),
  replayContext: v.object({
    sourceRun: v.union(runSummaryShape, v.null()),
    replayRuns: v.array(runSummaryShape),
    comparison: v.union(v.null(), v.object({
      statusChanged: v.boolean(),
      sourceStatus: runFields.status,
      replayStatus: runFields.status,
      latencyDeltaMs: v.optional(v.number()),
      costDeltaUsd: v.optional(v.number()),
      tokenDelta: v.optional(v.number()),
      stepCountDelta: v.number(),
      outputChanged: v.boolean(),
      errorChanged: v.boolean(),
    })),
    timelineDiff: v.array(v.object({
      stepIndex: stepFields.stepIndex,
      changeType: replayChangeTypeShape,
      kindChanged: v.boolean(),
      statusChanged: v.boolean(),
      outputChanged: v.boolean(),
      errorChanged: v.boolean(),
      durationDeltaMs: v.optional(v.number()),
      source: stepDiffSummaryShape,
      replay: stepDiffSummaryShape,
    })),
  }),
}));

export const runReplayShape = v.object({
  runId: v.id("agentRuns"),
  replayOfRunId: v.id("agentRuns"),
  replayMode: runFields.replayMode,
});

/**
 * The two observability reads.
 *
 * Their count blocks are declared as objects naming every status and every
 * trigger, not as records: `convex-test` never validates a record, so a
 * record-shaped declaration here would check nothing. Each entry is optional
 * because a window with no runs of a kind simply has no key for it.
 */

const runStatusCountsShape = v.object({
  QUEUED: v.optional(v.number()),
  RUNNING: v.optional(v.number()),
  PENDING_APPROVAL: v.optional(v.number()),
  SUCCESS: v.optional(v.number()),
  FAILED: v.optional(v.number()),
  CANCELLED: v.optional(v.number()),
});

const triggerCountsShape = v.object({
  CHAT: v.optional(v.number()),
  MANUAL: v.optional(v.number()),
  SCHEDULE: v.optional(v.number()),
  WEBHOOK: v.optional(v.number()),
  WORKFLOW: v.optional(v.number()),
  EVENT: v.optional(v.number()),
});

const failureGroupShape = v.object({
  failureKey: v.string(),
  label: v.string(),
  count: v.number(),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  runIds: v.array(v.string()),
});

const periodTotalsShape = v.object({
  runs: v.number(),
  succeeded: v.number(),
  failed: v.number(),
  costUsd: v.number(),
  successRate: v.number(),
  costPerRunUsd: v.number(),
});

export const agentAnalyticsShape = v.object({
  sampledRuns: v.number(),
  sampledToolCalls: v.number(),
  sampledApprovals: v.number(),
  sampledFeedback: v.number(),
  totals: v.object({
    runs: v.number(),
    successfulRuns: v.number(),
    failedRuns: v.number(),
    activeRuns: v.number(),
    toolCalls: v.number(),
    approvals: v.number(),
    feedback: v.number(),
    costUsd: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    successRate: v.number(),
    positiveFeedbackRate: v.number(),
    averageLatencyMs: v.number(),
  }),
  lookbackDays: v.number(),
  latency: v.object({
    medianMs: v.number(),
    p95Ms: v.number(),
    averageMs: v.number(),
    sampleSize: v.number(),
  }),
  dailySeries: v.array(v.object({
    dayStartMs: v.number(),
    total: v.number(),
    succeeded: v.number(),
    failed: v.number(),
    costUsd: v.number(),
  })),
  versionChangeDays: v.array(v.number()),
  comparison: v.object({ current: periodTotalsShape, previous: periodTotalsShape }),
  sampleTruncated: v.boolean(),
  failureGroups: v.array(failureGroupShape),
  failureGroupsOmitted: v.number(),
  statusCounts: runStatusCountsShape,
  triggerCounts: triggerCountsShape,
  approvalCounts: v.object({
    PENDING: v.optional(v.number()),
    APPROVED: v.optional(v.number()),
    REJECTED: v.optional(v.number()),
    CANCELLED: v.optional(v.number()),
  }),
  feedbackCounts: v.object({
    POSITIVE: v.optional(v.number()),
    NEGATIVE: v.optional(v.number()),
    NEUTRAL: v.optional(v.number()),
  }),
  feedbackLabelCounts: v.array(v.object({ label: v.string(), count: v.number() })),
  modelStats: v.array(v.object({
    modelId: v.string(),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    runs: v.number(),
    failures: v.number(),
    costUsd: v.number(),
  })),
  versionStats: v.array(v.object({
    agentVersionId: v.string(),
    runs: v.number(),
    successes: v.number(),
    failures: v.number(),
    costUsd: v.number(),
  })),
  toolStats: v.array(v.object({
    handlerMapping: v.string(),
    calls: v.number(),
    successes: v.number(),
    failures: v.number(),
    approvalsRequired: v.number(),
    denied: v.number(),
    cancelled: v.number(),
    notImplemented: v.number(),
    typicalMs: v.number(),
  })),
  failureReasons: v.array(v.object({ reason: v.string(), count: v.number() })),
  recentFailures: v.array(v.object({
    runId: v.id("agentRuns"),
    status: runFields.status,
    objective: runFields.objective,
    error: runFields.error,
    startedAt: runFields.startedAt,
  })),
});

export const runObservatoryShape = v.object({
  scope: v.union(v.literal("platform"), v.literal("company")),
  lookbackDays: v.number(),
  sampledRuns: v.number(),
  sampledToolCalls: v.number(),
  totals: v.object({
    runs: v.number(),
    successfulRuns: v.number(),
    failedRuns: v.number(),
    activeRuns: v.number(),
    costUsd: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    successRate: v.number(),
    averageLatencyMs: v.number(),
  }),
  statusCounts: runStatusCountsShape,
  triggerCounts: triggerCountsShape,
  modelStats: v.array(v.object({
    modelId: v.string(),
    providerKey: v.optional(v.string()),
    runs: v.number(),
    failures: v.number(),
    costUsd: v.number(),
  })),
  agentStats: v.array(v.object({
    agentId: v.id("agents"),
    agentName: v.string(),
    runs: v.number(),
    failures: v.number(),
    costUsd: v.number(),
    lastRunAt: v.number(),
  })),
  toolStats: v.array(v.object({
    handlerMapping: v.string(),
    calls: v.number(),
    failures: v.number(),
    approvalsRequired: v.number(),
    denied: v.number(),
    notImplemented: v.number(),
    writeOrExternal: v.number(),
  })),
  failureReasons: v.array(v.object({ reason: v.string(), count: v.number() })),
  recentRuns: v.array(v.object({
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    agentName: v.string(),
    status: runFields.status,
    triggerType: runFields.triggerType,
    objective: runFields.objective,
    startedAt: runFields.startedAt,
    completedAt: runFields.completedAt,
    latencyMs: v.optional(v.number()),
    costUsd: runFields.costUsd,
    modelId: v.optional(v.string()),
    error: v.optional(v.string()),
    nextAction: v.string(),
  })),
});
