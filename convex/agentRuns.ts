import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery, superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";
import { getNextStepIndex, updateMemoryUsageOutcomeForRun } from "./agentRunStateService";
import {
  appendRefusedToolCall,
  buildRefusedToolCallKey,
  getRefusedToolCallMessage,
} from "./agentRuntimeService";
import {
  APPROVAL_EXPIRY_CONFIG_KEY,
  DEFAULT_APPROVAL_EXPIRY_HOURS,
  MAX_APPROVAL_EXPIRY_HOURS,
  MIN_APPROVAL_EXPIRY_HOURS,
  getApprovalExpiredMessage,
  isApprovalExpired,
  normalizeApprovalExpiryHoursForUpdate,
  parseApprovalExpiryConfig,
  resolveApprovalExpiryHours,
} from "./approvalExpiryService";

const AGENT_RUN_DETAIL_LIMIT = 500;
const AGENT_RUN_ANALYTICS_LIMIT = 500;
const RUN_OBSERVATORY_LIMIT = 120;
const RUN_OBSERVATORY_TOOL_LIMIT = 300;
/** Counting cannot be indexed away, so the badge stops here and says it did. */
const PENDING_APPROVAL_COUNT_LIMIT = 99;
/** One sweep's worth. The cron runs every 15 minutes, so a backlog drains quickly. */
const APPROVAL_EXPIRY_SWEEP_LIMIT = 100;
const PUBLIC_AGENT_RUN_OBJECTIVE_MAX_LENGTH = 4000;

const agentRunStatusValidator = v.union(
  v.literal("QUEUED"),
  v.literal("RUNNING"),
  v.literal("PENDING_APPROVAL"),
  v.literal("SUCCESS"),
  v.literal("FAILED"),
  v.literal("CANCELLED")
);

const agentRunTriggerValidator = v.union(
  v.literal("CHAT"),
  v.literal("MANUAL"),
  v.literal("SCHEDULE"),
  v.literal("WEBHOOK"),
  v.literal("WORKFLOW"),
  v.literal("EVENT")
);

const agentRunStepKindValidator = v.union(
  v.literal("OBSERVE"),
  v.literal("PLAN"),
  v.literal("MODEL"),
  v.literal("TOOL_CALL"),
  v.literal("TOOL_RESULT"),
  v.literal("APPROVAL_REQUEST"),
  v.literal("REPLAN"),
  v.literal("FINAL")
);

const agentRunStepStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("SUCCESS"),
  v.literal("FAILED"),
  v.literal("SKIPPED")
);

const toolCallStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("APPROVAL_REQUIRED"),
  v.literal("SUCCESS"),
  // A connector the catalogue advertises with no implementation behind it.
  // Distinct from SUCCESS because it did nothing, and from FAILED because
  // nothing was attempted — recording it as either hides a capability gap.
  v.literal("NOT_IMPLEMENTED"),
  v.literal("FAILED"),
  v.literal("DENIED"),
  v.literal("CANCELLED")
);

const sideEffectLevelValidator = v.union(
  v.literal("READ"),
  v.literal("WRITE"),
  v.literal("DESTRUCTIVE"),
  v.literal("EXTERNAL")
);

const approvalStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("CANCELLED")
);

const replayModeValidator = v.union(
  v.literal("CURRENT_ACTIVE"),
  v.literal("SAME_VERSION")
);

type TerminalRunStatus = "SUCCESS" | "FAILED" | "CANCELLED";

function isTerminalRunStatus(status: string): status is TerminalRunStatus {
  return status === "SUCCESS" || status === "FAILED" || status === "CANCELLED";
}

function isReplayableRunStatus(status: string) {
  return status === "FAILED" || status === "CANCELLED";
}

function isCancelableRunStatus(status: string) {
  return status === "QUEUED" || status === "RUNNING" || status === "PENDING_APPROVAL";
}

function getApprovalFinalOutput(status: "REJECTED" | "CANCELLED", reason?: string) {
  if (status === "REJECTED") {
    return reason ? `Agent approval rejected: ${reason}` : "Agent approval rejected.";
  }

  return reason ? `Agent approval cancelled: ${reason}` : "Agent approval cancelled.";
}

function getRunLatencyMs(run: { startedAt: number; completedAt?: number }) {
  return run.completedAt !== undefined ? Math.max(0, run.completedAt - run.startedAt) : undefined;
}

function buildPreview(value: string | undefined, fallback = "") {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const normalized = JSON.stringify(parsed, null, 2);
    return normalized.length > 600 ? `${normalized.slice(0, 600)}...` : normalized;
  } catch {
    const normalized = trimmed.replace(/\s+/g, " ");
    return normalized.length > 600 ? `${normalized.slice(0, 600)}...` : normalized;
  }
}

function buildStepSummary(step: Doc<"agentRunSteps">) {
  if (step.kind === "TOOL_CALL" && step.status === "SKIPPED" && step.output) {
    try {
      const parsed = JSON.parse(step.output) as {
        executed?: boolean;
        reason?: string;
        testModeCandidates?: unknown[];
        blockedTools?: unknown[];
      };
      if (parsed.executed === false && parsed.reason) {
        const candidateCount = Array.isArray(parsed.testModeCandidates) ? parsed.testModeCandidates.length : 0;
        const blockedCount = Array.isArray(parsed.blockedTools) ? parsed.blockedTools.length : 0;
        return `${parsed.reason} Test-mode candidates: ${candidateCount}. Blocked tools: ${blockedCount}.`;
      }
    } catch {
      // Fall through to regular preview handling.
    }
  }
  if (step.error) return buildPreview(step.error, "Step failed.");
  if (step.output) return buildPreview(step.output, "Step produced output.");
  if (step.input) return buildPreview(step.input, "Step received input.");
  return `${step.kind.toLowerCase().replace("_", " ")} step recorded.`;
}

function buildRunTimeline(args: {
  steps: Doc<"agentRunSteps">[];
  toolCalls: Doc<"agentToolCalls">[];
  approvals: Doc<"agentRunApprovals">[];
}) {
  return args.steps.map((step) => {
    const linkedToolCalls = args.toolCalls.filter((toolCall) => toolCall.stepId === step._id);
    const linkedApprovals = args.approvals.filter((approval) => approval.stepId === step._id);
    const durationMs = step.completedAt !== undefined ? Math.max(0, step.completedAt - step.startedAt) : undefined;
    return {
      stepId: step._id,
      stepIndex: step.stepIndex,
      kind: step.kind,
      status: step.status,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      durationMs,
      summary: buildStepSummary(step),
      inputPreview: buildPreview(step.input),
      outputPreview: buildPreview(step.output),
      errorPreview: buildPreview(step.error),
      modelId: step.modelId,
      providerKey: step.providerKey,
      providerModelId: step.providerModelId,
      inputTokens: step.inputTokens,
      outputTokens: step.outputTokens,
      costGBP: step.costGBP,
      linkedToolCalls: linkedToolCalls.map((toolCall) => ({
        toolCallId: toolCall._id,
        normalizedToolName: toolCall.normalizedToolName,
        handlerMapping: toolCall.handlerMapping,
        status: toolCall.status,
        sideEffectLevel: toolCall.sideEffectLevel,
        confirmationRequired: toolCall.confirmationRequired,
      })),
      linkedApprovals: linkedApprovals.map((approval) => ({
        approvalId: approval._id,
        status: approval.status,
        requestedAt: approval.requestedAt,
        reviewedAt: approval.reviewedAt,
      })),
    };
  });
}

function buildToolCallDetail(toolCall: Doc<"agentToolCalls">, viewerRole: string | undefined) {
  const canViewRawArguments = viewerRole === "SUPER_ADMIN";
  const argumentsPreview = canViewRawArguments
    ? buildPreview(toolCall.argumentsJson)
    : buildPreview(
        toolCall.redactedArgumentsJson,
        "Arguments redacted. Super admins can inspect raw arguments."
      );

  return {
    _id: toolCall._id,
    _creationTime: toolCall._creationTime,
    runId: toolCall.runId,
    stepId: toolCall.stepId,
    agentId: toolCall.agentId,
    toolId: toolCall.toolId,
    normalizedToolName: toolCall.normalizedToolName,
    handlerMapping: toolCall.handlerMapping,
    argumentsPreview,
    rawArgumentsPreview: canViewRawArguments ? buildPreview(toolCall.argumentsJson) : undefined,
    redactedArgumentsPreview: buildPreview(toolCall.redactedArgumentsJson),
    argumentViewMode: canViewRawArguments ? "RAW" : "REDACTED",
    rawArgumentsAvailable: Boolean(toolCall.argumentsJson),
    status: toolCall.status,
    requiredRole: toolCall.requiredRole,
    sideEffectLevel: toolCall.sideEffectLevel,
    confirmationRequired: toolCall.confirmationRequired,
    confirmationGrantedAt: toolCall.confirmationGrantedAt,
    companyId: toolCall.companyId,
    userId: toolCall.userId,
    startedAt: toolCall.startedAt,
    completedAt: toolCall.completedAt,
    resultJson: toolCall.resultJson,
    error: toolCall.error,
  };
}

function buildEvalFixtureSummary(fixture: Doc<"agentEvalFixtures">) {
  return {
    fixtureId: fixture._id,
    type: fixture.type,
    status: fixture.status,
    tags: fixture.tags,
    updatedAt: fixture.updatedAt,
  };
}

function parseAgentVersionSnapshot(snapshotJson: string) {
  try {
    const parsed = JSON.parse(snapshotJson) as {
      prompt?: { systemPrompt?: string };
      model?: {
        modelId?: string;
        modelSelectionMode?: string;
        temperature?: number;
      };
      tools?: Array<{
        id?: string;
        name?: string;
        description?: string;
        handlerMapping?: string;
        requiredRole?: string;
        sideEffectLevel?: string;
        confirmationRequired?: boolean;
        inputSchema?: string;
        isActive?: boolean;
        version?: string;
        updatedAt?: number;
      }>;
      memory?: {
        activeCount?: number;
        latestUpdatedAt?: number;
        items?: Array<{ kind?: string; content?: string; importance?: number; updatedAt?: number }>;
      };
      rules?: Array<{ name?: string; trigger?: string; instruction?: string; priority?: number }>;
      skills?: Array<{
        id?: string;
        versionId?: string;
        name?: string;
        category?: string;
        riskLevel?: string;
        instruction?: string;
        requiredToolMappings?: string[];
        recommendedToolMappings?: string[];
        snapshotHash?: string;
      }>;
    };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildRunSummary(run: Doc<"agentRuns">) {
  return {
    runId: run._id,
    agentVersionId: run.agentVersionId,
    status: run.status,
    triggerType: run.triggerType,
    objective: run.objective,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    latencyMs: getRunLatencyMs(run),
    costGBP: run.costGBP,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    finalOutputPreview: buildPreview(run.finalOutput),
    errorPreview: buildPreview(run.error),
    replayMode: run.replayMode,
  };
}

function buildEmptyRunObservatoryStatusCounts() {
  return {
    QUEUED: 0,
    RUNNING: 0,
    PENDING_APPROVAL: 0,
    SUCCESS: 0,
    FAILED: 0,
    CANCELLED: 0,
  };
}

function getRunObservabilityAction(run: Doc<"agentRuns">) {
  if (run.status === "FAILED" || run.status === "CANCELLED") {
    return "Open the run timeline, inspect failed steps, and convert the failure into an eval fixture if it should never repeat.";
  }
  if (run.status === "PENDING_APPROVAL") {
    return "Review the pending approval before the agent continues.";
  }
  if (run.status === "RUNNING" || run.status === "QUEUED") {
    return "Check whether the run is still progressing or should be cancelled.";
  }
  return "Monitor for drift and compare with future replays if behavior changes.";
}

function normalizeComparableText(value: string | undefined) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function buildReplayComparison(args: {
  sourceRun: Doc<"agentRuns">;
  replayRun: Doc<"agentRuns">;
  sourceSteps: Doc<"agentRunSteps">[];
  replaySteps: Doc<"agentRunSteps">[];
}) {
  const sourceLatencyMs = getRunLatencyMs(args.sourceRun);
  const replayLatencyMs = getRunLatencyMs(args.replayRun);
  const sourceTokens = (args.sourceRun.inputTokens ?? 0) + (args.sourceRun.outputTokens ?? 0);
  const replayTokens = (args.replayRun.inputTokens ?? 0) + (args.replayRun.outputTokens ?? 0);

  return {
    statusChanged: args.sourceRun.status !== args.replayRun.status,
    sourceStatus: args.sourceRun.status,
    replayStatus: args.replayRun.status,
    latencyDeltaMs: sourceLatencyMs !== undefined && replayLatencyMs !== undefined
      ? replayLatencyMs - sourceLatencyMs
      : undefined,
    costDeltaGBP: args.sourceRun.costGBP !== undefined || args.replayRun.costGBP !== undefined
      ? (args.replayRun.costGBP ?? 0) - (args.sourceRun.costGBP ?? 0)
      : undefined,
    tokenDelta: sourceTokens !== 0 || replayTokens !== 0 ? replayTokens - sourceTokens : undefined,
    stepCountDelta: args.replaySteps.length - args.sourceSteps.length,
    outputChanged: normalizeComparableText(args.sourceRun.finalOutput) !== normalizeComparableText(args.replayRun.finalOutput),
    errorChanged: normalizeComparableText(args.sourceRun.error) !== normalizeComparableText(args.replayRun.error),
  };
}

function buildStepDiffSummary(step: Doc<"agentRunSteps"> | undefined) {
  if (!step) return undefined;
  return {
    kind: step.kind,
    status: step.status,
    summary: buildStepSummary(step),
    outputPreview: buildPreview(step.output),
    errorPreview: buildPreview(step.error),
    durationMs: step.completedAt !== undefined ? Math.max(0, step.completedAt - step.startedAt) : undefined,
  };
}

function buildReplayTimelineDiff(args: {
  sourceSteps: Doc<"agentRunSteps">[];
  replaySteps: Doc<"agentRunSteps">[];
}) {
  const sourceByIndex = new Map(args.sourceSteps.map((step) => [step.stepIndex, step]));
  const replayByIndex = new Map(args.replaySteps.map((step) => [step.stepIndex, step]));
  const stepIndexes = Array.from(new Set([
    ...args.sourceSteps.map((step) => step.stepIndex),
    ...args.replaySteps.map((step) => step.stepIndex),
  ])).sort((a, b) => a - b);

  return stepIndexes.slice(0, 50).map((stepIndex) => {
    const sourceStep = sourceByIndex.get(stepIndex);
    const replayStep = replayByIndex.get(stepIndex);
    const sourceOutput = normalizeComparableText(sourceStep?.output);
    const replayOutput = normalizeComparableText(replayStep?.output);
    const sourceError = normalizeComparableText(sourceStep?.error);
    const replayError = normalizeComparableText(replayStep?.error);
    const sourceDurationMs = sourceStep?.completedAt !== undefined
      ? Math.max(0, sourceStep.completedAt - sourceStep.startedAt)
      : undefined;
    const replayDurationMs = replayStep?.completedAt !== undefined
      ? Math.max(0, replayStep.completedAt - replayStep.startedAt)
      : undefined;

    const kindChanged = sourceStep?.kind !== replayStep?.kind;
    const statusChanged = sourceStep?.status !== replayStep?.status;
    const outputChanged = sourceOutput !== replayOutput;
    const errorChanged = sourceError !== replayError;
    const changeType = !sourceStep
      ? "ADDED"
      : !replayStep
        ? "REMOVED"
        : kindChanged || statusChanged || outputChanged || errorChanged
          ? "CHANGED"
          : "UNCHANGED";

    return {
      stepIndex,
      changeType,
      kindChanged,
      statusChanged,
      outputChanged,
      errorChanged,
      durationDeltaMs: sourceDurationMs !== undefined && replayDurationMs !== undefined
        ? replayDurationMs - sourceDurationMs
        : undefined,
      source: buildStepDiffSummary(sourceStep),
      replay: buildStepDiffSummary(replayStep),
    };
  });
}

function incrementCount(target: Record<string, number>, key: string, increment = 1) {
  target[key] = (target[key] ?? 0) + increment;
}

export const getForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(agentRunStatusValidator),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const baseQuery = args.status
      ? ctx.db
          .query("agentRuns")
          .withIndex("by_status_started", (q) => q.eq("status", args.status!))
          .filter((q) => q.eq(q.field("agentId"), args.agentId))
      : ctx.db.query("agentRuns").withIndex("by_agent_started", (q) => q.eq("agentId", args.agentId));

    if (user.role === "ADMIN") {
      if (!user.companyId) throw new Error("Unauthorized");
      return await baseQuery
        .filter((q) => q.eq(q.field("companyId"), user.companyId))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await baseQuery.order("desc").paginate(args.paginationOpts);
  },
});

export const getRunDetail = adminQuery({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) return null;

    assertAdminCanAccessCompany(user, run.companyId);

    const [steps, toolCalls, approvals, replayRuns, evalFixtures] = await Promise.all([
      ctx.db
        .query("agentRunSteps")
        .withIndex("by_run_step", (q) => q.eq("runId", args.runId))
        .order("asc")
        .take(AGENT_RUN_DETAIL_LIMIT),
      ctx.db
        .query("agentToolCalls")
        .withIndex("by_run_started", (q) => q.eq("runId", args.runId))
        .order("asc")
        .take(AGENT_RUN_DETAIL_LIMIT),
      ctx.db
        .query("agentRunApprovals")
        .withIndex("by_run_requested", (q) => q.eq("runId", args.runId))
        .order("asc")
        .take(AGENT_RUN_DETAIL_LIMIT),
      ctx.db
        .query("agentRuns")
        .withIndex("by_replay_source_started", (q) => q.eq("replayOfRunId", args.runId))
        .order("desc")
        .take(10),
      ctx.db
        .query("agentEvalFixtures")
        .withIndex("by_run_created", (q) => q.eq("sourceRunId", args.runId))
        .order("desc")
        .take(10),
    ]);
    const sourceRun = run.replayOfRunId ? await ctx.db.get(run.replayOfRunId) : null;
    const accessibleSourceRun = sourceRun && sourceRun.companyId === run.companyId ? sourceRun : null;
    const sourceSteps = accessibleSourceRun
      ? await ctx.db
          .query("agentRunSteps")
          .withIndex("by_run_step", (q) => q.eq("runId", accessibleSourceRun._id))
          .order("asc")
          .take(AGENT_RUN_DETAIL_LIMIT)
      : [];

    return {
      run,
      steps,
      toolCalls: toolCalls.map((toolCall) => buildToolCallDetail(toolCall, user.role)),
      approvals,
      timeline: buildRunTimeline({ steps, toolCalls, approvals }),
      evalFixtureContext: {
        canCreateFromRun: isTerminalRunStatus(run.status),
        activeCount: evalFixtures.filter((fixture) => fixture.status === "ACTIVE").length,
        archivedCount: evalFixtures.filter((fixture) => fixture.status === "ARCHIVED").length,
        fixtures: evalFixtures.map(buildEvalFixtureSummary),
      },
      replayContext: {
        sourceRun: accessibleSourceRun ? buildRunSummary(accessibleSourceRun) : null,
        replayRuns: replayRuns.map(buildRunSummary),
        comparison: accessibleSourceRun
          ? buildReplayComparison({
              sourceRun: accessibleSourceRun,
              replayRun: run,
              sourceSteps,
              replaySteps: steps,
            })
          : null,
        timelineDiff: accessibleSourceRun
          ? buildReplayTimelineDiff({
              sourceSteps,
              replaySteps: steps,
            })
          : [],
      },
    };
  },
});

export const getPublicRunStatusInternal = internalQuery({
  args: {
    runId: v.id("agentRuns"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.companyId !== args.companyId) return null;

    const [stepCount, approvalCount, toolCallCount] = await Promise.all([
      ctx.db
        .query("agentRunSteps")
        .withIndex("by_run_step", (q) => q.eq("runId", args.runId))
        .take(AGENT_RUN_DETAIL_LIMIT),
      ctx.db
        .query("agentRunApprovals")
        .withIndex("by_run_requested", (q) => q.eq("runId", args.runId))
        .take(AGENT_RUN_DETAIL_LIMIT),
      ctx.db
        .query("agentToolCalls")
        .withIndex("by_run_started", (q) => q.eq("runId", args.runId))
        .take(AGENT_RUN_DETAIL_LIMIT),
    ]);

    return {
      ...buildRunSummary(run),
      companyId: run.companyId,
      agentId: run.agentId,
      workflowId: run.workflowId,
      scheduleId: run.scheduleId,
      threadId: run.threadId,
      cancelledAt: run.cancelledAt,
      updatedAt: run.updatedAt,
      counts: {
        steps: stepCount.length,
        approvals: approvalCount.length,
        toolCalls: toolCallCount.length,
      },
    };
  },
});

export const getReplayExecutionContextInternal = internalQuery({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.replayMode !== "SAME_VERSION" || !run.agentVersionId) return null;

    const version = await ctx.db.get(run.agentVersionId);
    if (!version) return null;
    const snapshot = parseAgentVersionSnapshot(version.snapshotJson);
    if (!snapshot) return null;

    return {
      replayMode: run.replayMode,
      replayOfRunId: run.replayOfRunId,
      agentVersionId: run.agentVersionId,
      versionNumber: version.versionNumber,
      snapshotHash: version.snapshotHash,
      promptHash: version.promptHash,
      toolSetHash: version.toolSetHash,
      memoryRevisionHash: version.memoryRevisionHash,
      ruleSetHash: version.ruleSetHash,
      modelConfigHash: version.modelConfigHash,
      policyHash: version.policyHash,
      systemPrompt: snapshot.prompt?.systemPrompt,
      modelId: snapshot.model?.modelSelectionMode === "inherit" ? undefined : snapshot.model?.modelId,
      temperature: snapshot.model?.temperature,
      toolCount: Array.isArray(snapshot.tools) ? snapshot.tools.length : undefined,
      tools: Array.isArray(snapshot.tools)
        ? snapshot.tools
            .filter((tool) => typeof tool.name === "string" && typeof tool.handlerMapping === "string")
            .slice(0, 50)
            .map((tool) => ({
              id: tool.id,
              name: tool.name!,
              description: tool.description,
              handlerMapping: tool.handlerMapping!,
              requiredRole: tool.requiredRole,
              sideEffectLevel: tool.sideEffectLevel,
              confirmationRequired: tool.confirmationRequired,
              inputSchema: tool.inputSchema,
              isActive: tool.isActive,
              version: tool.version,
              updatedAt: tool.updatedAt,
              replayExecutable: tool.sideEffectLevel === "READ" && tool.isActive !== false,
              replayPolicy: tool.sideEffectLevel === "READ" && tool.isActive !== false
                ? "TEST_MODE_CANDIDATE"
                : "BLOCKED",
              replayBlockedReason: tool.isActive === false
                ? "Tool was inactive in the historical snapshot."
                : tool.sideEffectLevel && tool.sideEffectLevel !== "READ"
                  ? "Historical replay does not execute write, destructive, or external tools."
                  : undefined,
            }))
        : [],
      memoryActiveCount: snapshot.memory?.activeCount,
      memoryContents: Array.isArray(snapshot.memory?.items)
        ? snapshot.memory.items
            .filter((memory) => typeof memory.content === "string" && memory.content.trim().length > 0)
            .slice(0, 10)
            .map((memory) => ({
              kind: memory.kind,
              content: memory.content!,
              importance: memory.importance,
              updatedAt: memory.updatedAt,
            }))
        : [],
      ruleCount: Array.isArray(snapshot.rules) ? snapshot.rules.length : undefined,
      rules: Array.isArray(snapshot.rules)
        ? snapshot.rules
            .filter((rule) => typeof rule.instruction === "string" && rule.instruction.trim().length > 0)
            .slice(0, 25)
            .map((rule) => ({
              name: rule.name,
              trigger: rule.trigger,
              instruction: rule.instruction!,
              priority: rule.priority,
            }))
        : [],
      skillCount: Array.isArray(snapshot.skills) ? snapshot.skills.length : undefined,
      skills: Array.isArray(snapshot.skills)
        ? snapshot.skills
            .filter((skill) => typeof skill.name === "string" && typeof skill.instruction === "string" && skill.instruction.trim().length > 0)
            .slice(0, 25)
            .map((skill) => ({
              id: skill.id,
              versionId: skill.versionId,
              name: skill.name!,
              category: skill.category,
              riskLevel: skill.riskLevel,
              instruction: skill.instruction!,
              requiredToolMappings: Array.isArray(skill.requiredToolMappings) ? skill.requiredToolMappings : [],
              recommendedToolMappings: Array.isArray(skill.recommendedToolMappings) ? skill.recommendedToolMappings : [],
              snapshotHash: skill.snapshotHash,
            }))
        : [],
    };
  },
});

export const getLatestStepIndexInternal = internalQuery({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const latestStep = await ctx.db
      .query("agentRunSteps")
      .withIndex("by_run_step", (q) => q.eq("runId", args.runId))
      .order("desc")
      .first();
    return latestStep?.stepIndex ?? 0;
  },
});

/**
 * What a running action needs to know about its own run.
 *
 * Cancellation is a row in the database: `cancelRun` marks the run and returns,
 * with no way to interrupt an action already in flight. The objective loop
 * therefore has to come and look between steps. Kept deliberately small — this
 * is read once per model turn and once before each tool call.
 */
export const getRunExecutionStateInternal = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;

    return {
      status: run.status,
      finalOutput: run.finalOutput,
      startedAt: run.startedAt,
      objective: run.objective,
      agentId: run.agentId,
      threadId: run.threadId,
      companyId: run.companyId,
      userId: run.userId,
      refusedToolCallsJson: run.refusedToolCallsJson,
    };
  },
});

export const getAnalyticsForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    if (user.role === "ADMIN" && !user.companyId) {
      throw new Error("Unauthorized");
    }
    const visibleCompanyId = user.role === "ADMIN" ? user.companyId : undefined;

    const runs = user.role === "SUPER_ADMIN"
      ? await ctx.db
          .query("agentRuns")
          .withIndex("by_agent_started", (q) => q.eq("agentId", args.agentId))
          .order("desc")
          .take(AGENT_RUN_ANALYTICS_LIMIT)
      : await ctx.db
          .query("agentRuns")
          .withIndex("by_company_started", (q) => q.eq("companyId", visibleCompanyId))
          .filter((q) => q.eq(q.field("agentId"), args.agentId))
          .order("desc")
          .take(AGENT_RUN_ANALYTICS_LIMIT);

    const toolCalls = user.role === "SUPER_ADMIN"
      ? await ctx.db
          .query("agentToolCalls")
          .withIndex("by_agent_started", (q) => q.eq("agentId", args.agentId))
          .order("desc")
          .take(AGENT_RUN_ANALYTICS_LIMIT)
      : await ctx.db
          .query("agentToolCalls")
          .withIndex("by_company_started", (q) => q.eq("companyId", visibleCompanyId))
          .filter((q) => q.eq(q.field("agentId"), args.agentId))
          .order("desc")
          .take(AGENT_RUN_ANALYTICS_LIMIT);

    const approvals = user.role === "SUPER_ADMIN"
      ? await ctx.db
          .query("agentRunApprovals")
          .withIndex("by_agent_requested", (q) => q.eq("agentId", args.agentId))
          .order("desc")
          .take(AGENT_RUN_ANALYTICS_LIMIT)
      : (
          await Promise.all(
            (["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).map((status) =>
              ctx.db
                .query("agentRunApprovals")
                .withIndex("by_company_status_requested", (q) => q.eq("companyId", visibleCompanyId).eq("status", status))
                .filter((q) => q.eq(q.field("agentId"), args.agentId))
                .order("desc")
                .take(AGENT_RUN_ANALYTICS_LIMIT)
            )
          )
        ).flat().sort((a, b) => b.requestedAt - a.requestedAt).slice(0, AGENT_RUN_ANALYTICS_LIMIT);
    const feedback = user.role === "SUPER_ADMIN"
      ? await ctx.db
          .query("agentRunFeedback")
          .withIndex("by_agent_created", (q) => q.eq("agentId", args.agentId))
          .order("desc")
          .take(AGENT_RUN_ANALYTICS_LIMIT)
      : await ctx.db
          .query("agentRunFeedback")
          .withIndex("by_company_created", (q) => q.eq("companyId", visibleCompanyId))
          .filter((q) => q.eq(q.field("agentId"), args.agentId))
          .order("desc")
          .take(AGENT_RUN_ANALYTICS_LIMIT);

    const statusCounts: Record<string, number> = {
      QUEUED: 0,
      RUNNING: 0,
      PENDING_APPROVAL: 0,
      SUCCESS: 0,
      FAILED: 0,
      CANCELLED: 0,
    };
    const triggerCounts: Record<string, number> = {};
    const failureReasons: Record<string, number> = {};
    const modelStats: Record<string, {
      modelId: string;
      providerKey?: string;
      providerModelId?: string;
      runs: number;
      failures: number;
      costGBP: number;
    }> = {};
    const versionStats: Record<string, {
      agentVersionId: Id<"agentVersions"> | "unversioned";
      runs: number;
      successes: number;
      failures: number;
      costGBP: number;
    }> = {};
    let totalCostGBP = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let completedLatencyTotalMs = 0;
    let completedLatencyCount = 0;

    for (const run of runs) {
      incrementCount(statusCounts, run.status);
      incrementCount(triggerCounts, run.triggerType);
      totalCostGBP += run.costGBP ?? 0;
      totalInputTokens += run.inputTokens ?? 0;
      totalOutputTokens += run.outputTokens ?? 0;

      const latencyMs = getRunLatencyMs(run);
      if (latencyMs !== undefined) {
        completedLatencyTotalMs += latencyMs;
        completedLatencyCount += 1;
      }

      if (run.status === "FAILED" || run.status === "CANCELLED") {
        incrementCount(failureReasons, run.error || run.finalOutput || run.status);
      }

      const modelKey = run.modelId || run.providerModelId || "unresolved";
      if (!modelStats[modelKey]) {
        modelStats[modelKey] = {
          modelId: run.modelId || "unresolved",
          providerKey: run.providerKey,
          providerModelId: run.providerModelId,
          runs: 0,
          failures: 0,
          costGBP: 0,
        };
      }
      modelStats[modelKey].runs += 1;
      modelStats[modelKey].costGBP += run.costGBP ?? 0;
      if (run.status === "FAILED" || run.status === "CANCELLED") {
        modelStats[modelKey].failures += 1;
      }

      const versionKey = run.agentVersionId || "unversioned";
      if (!versionStats[versionKey]) {
        versionStats[versionKey] = {
          agentVersionId: versionKey,
          runs: 0,
          successes: 0,
          failures: 0,
          costGBP: 0,
        };
      }
      versionStats[versionKey].runs += 1;
      versionStats[versionKey].costGBP += run.costGBP ?? 0;
      if (run.status === "SUCCESS") versionStats[versionKey].successes += 1;
      if (run.status === "FAILED" || run.status === "CANCELLED") versionStats[versionKey].failures += 1;
    }

    const toolStats: Record<string, {
      handlerMapping: string;
      calls: number;
      successes: number;
      failures: number;
      approvalsRequired: number;
      denied: number;
      cancelled: number;
      notImplemented: number;
    }> = {};
    for (const toolCall of toolCalls) {
      const key = toolCall.handlerMapping;
      if (!toolStats[key]) {
        toolStats[key] = {
          handlerMapping: key,
          calls: 0,
          successes: 0,
          failures: 0,
          approvalsRequired: 0,
          denied: 0,
          cancelled: 0,
          notImplemented: 0,
        };
      }
      toolStats[key].calls += 1;
      if (toolCall.status === "SUCCESS") toolStats[key].successes += 1;
      if (toolCall.status === "FAILED") toolStats[key].failures += 1;
      // Counted on its own line. Folding it into failures would say the
      // connector is broken; folding it into successes is what the runtime used
      // to do. It is neither — the capability does not exist.
      if (toolCall.status === "NOT_IMPLEMENTED") toolStats[key].notImplemented += 1;
      if (toolCall.status === "APPROVAL_REQUIRED") toolStats[key].approvalsRequired += 1;
      if (toolCall.status === "DENIED") toolStats[key].denied += 1;
      if (toolCall.status === "CANCELLED") toolStats[key].cancelled += 1;
    }

    const approvalCounts: Record<string, number> = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      CANCELLED: 0,
    };
    for (const approval of approvals) {
      incrementCount(approvalCounts, approval.status);
    }

    const feedbackCounts: Record<string, number> = {
      POSITIVE: 0,
      NEGATIVE: 0,
      NEUTRAL: 0,
    };
    const feedbackLabelCounts: Record<string, number> = {};
    for (const entry of feedback) {
      incrementCount(feedbackCounts, entry.rating);
      for (const label of entry.labels) {
        incrementCount(feedbackLabelCounts, label);
      }
    }

    const successfulRuns = statusCounts.SUCCESS ?? 0;
    const failedRuns = (statusCounts.FAILED ?? 0) + (statusCounts.CANCELLED ?? 0);
    const completedRuns = successfulRuns + failedRuns;
    const feedbackTotal = feedback.length;
    const positiveFeedback = feedbackCounts.POSITIVE ?? 0;

    return {
      sampledRuns: runs.length,
      sampledToolCalls: toolCalls.length,
      sampledApprovals: approvals.length,
      sampledFeedback: feedback.length,
      totals: {
        runs: runs.length,
        successfulRuns,
        failedRuns,
        activeRuns: (statusCounts.QUEUED ?? 0) + (statusCounts.RUNNING ?? 0) + (statusCounts.PENDING_APPROVAL ?? 0),
        toolCalls: toolCalls.length,
        approvals: approvals.length,
        feedback: feedback.length,
        costGBP: totalCostGBP,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        successRate: completedRuns > 0 ? successfulRuns / completedRuns : 0,
        positiveFeedbackRate: feedbackTotal > 0 ? positiveFeedback / feedbackTotal : 0,
        averageLatencyMs: completedLatencyCount > 0 ? completedLatencyTotalMs / completedLatencyCount : 0,
      },
      statusCounts,
      triggerCounts,
      approvalCounts,
      feedbackCounts,
      feedbackLabelCounts: Object.entries(feedbackLabelCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
      modelStats: Object.values(modelStats).sort((a, b) => b.runs - a.runs),
      versionStats: Object.values(versionStats).sort((a, b) => b.runs - a.runs),
      toolStats: Object.values(toolStats).sort((a, b) => b.calls - a.calls),
      failureReasons: Object.entries(failureReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      recentFailures: runs
        .filter((run) => run.status === "FAILED" || run.status === "CANCELLED")
        .slice(0, 5)
        .map((run) => ({
          runId: run._id,
          status: run.status,
          objective: run.objective,
          error: run.error || run.finalOutput,
          startedAt: run.startedAt,
        })),
    };
  },
});

export const getRunObservatory = adminQuery({
  args: {
    lookbackDays: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    if (user.role === "ADMIN" && !user.companyId) {
      throw new Error("Unauthorized");
    }

    const limit = Math.min(Math.max(args.limit ?? RUN_OBSERVATORY_LIMIT, 1), RUN_OBSERVATORY_LIMIT);
    const lookbackDays = Math.min(Math.max(args.lookbackDays ?? 7, 1), 90);
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

    const recentRuns = user.role === "SUPER_ADMIN"
      ? (await Promise.all(
          (["QUEUED", "RUNNING", "PENDING_APPROVAL", "SUCCESS", "FAILED", "CANCELLED"] as const).map((status) =>
            ctx.db
              .query("agentRuns")
              .withIndex("by_status_started", (q) => q.eq("status", status))
              .order("desc")
              .take(limit)
          )
        ))
          .flat()
          .filter((run) => run.startedAt >= cutoff)
          .toSorted((left, right) => right.startedAt - left.startedAt)
          .slice(0, limit)
      : await ctx.db
          .query("agentRuns")
          .withIndex("by_company_started", (q) => q.eq("companyId", user.companyId))
          .order("desc")
          .filter((q) => q.gte(q.field("startedAt"), cutoff))
          .take(limit);

    const statusCounts = buildEmptyRunObservatoryStatusCounts();
    const triggerCounts: Record<string, number> = {};
    const modelCounts: Record<string, { modelId: string; providerKey?: string; runs: number; failures: number; costGBP: number }> = {};
    const agentCounts: Record<string, { agentId: Id<"agents">; agentName: string; runs: number; failures: number; costGBP: number; lastRunAt: number }> = {};
    const failureReasons: Record<string, number> = {};
    let totalCostGBP = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let completedLatencyTotalMs = 0;
    let completedLatencyCount = 0;

    const agentIds = Array.from(new Set(recentRuns.map((run) => run.agentId)));
    const agents = await Promise.all(agentIds.map(async (agentId) => await ctx.db.get(agentId)));
    const agentNameById = new Map(agentIds.map((agentId, index) => [
      agentId,
      agents[index]?.name ?? "Unknown agent",
    ]));

    for (const run of recentRuns) {
      statusCounts[run.status] += 1;
      incrementCount(triggerCounts, run.triggerType);
      totalCostGBP += run.costGBP ?? 0;
      totalInputTokens += run.inputTokens ?? 0;
      totalOutputTokens += run.outputTokens ?? 0;

      const latencyMs = getRunLatencyMs(run);
      if (latencyMs !== undefined) {
        completedLatencyTotalMs += latencyMs;
        completedLatencyCount += 1;
      }

      if (run.status === "FAILED" || run.status === "CANCELLED") {
        incrementCount(failureReasons, run.error || run.finalOutput || run.status);
      }

      const modelKey = run.modelId || run.providerModelId || "unresolved";
      if (!modelCounts[modelKey]) {
        modelCounts[modelKey] = {
          modelId: modelKey,
          providerKey: run.providerKey,
          runs: 0,
          failures: 0,
          costGBP: 0,
        };
      }
      modelCounts[modelKey].runs += 1;
      modelCounts[modelKey].costGBP += run.costGBP ?? 0;
      if (run.status === "FAILED" || run.status === "CANCELLED") modelCounts[modelKey].failures += 1;

      const agentKey = run.agentId;
      if (!agentCounts[agentKey]) {
        agentCounts[agentKey] = {
          agentId: run.agentId,
          agentName: agentNameById.get(run.agentId) ?? "Unknown agent",
          runs: 0,
          failures: 0,
          costGBP: 0,
          lastRunAt: run.startedAt,
        };
      }
      agentCounts[agentKey].runs += 1;
      agentCounts[agentKey].costGBP += run.costGBP ?? 0;
      agentCounts[agentKey].lastRunAt = Math.max(agentCounts[agentKey].lastRunAt, run.startedAt);
      if (run.status === "FAILED" || run.status === "CANCELLED") agentCounts[agentKey].failures += 1;
    }

    const sampledToolCalls = (await Promise.all(recentRuns.slice(0, 60).map(async (run) =>
      await ctx.db
        .query("agentToolCalls")
        .withIndex("by_run_started", (q) => q.eq("runId", run._id))
        .order("desc")
        .take(20)
    ))).flat().slice(0, RUN_OBSERVATORY_TOOL_LIMIT);
    const toolStats: Record<string, {
      handlerMapping: string;
      calls: number;
      failures: number;
      approvalsRequired: number;
      denied: number;
      notImplemented: number;
      writeOrExternal: number;
    }> = {};
    for (const toolCall of sampledToolCalls) {
      if (user.role === "ADMIN" && toolCall.companyId !== user.companyId) continue;
      const key = toolCall.handlerMapping;
      if (!toolStats[key]) {
        toolStats[key] = {
          handlerMapping: key,
          calls: 0,
          failures: 0,
          approvalsRequired: 0,
          denied: 0,
          notImplemented: 0,
          writeOrExternal: 0,
        };
      }
      toolStats[key].calls += 1;
      if (toolCall.status === "FAILED" || toolCall.status === "CANCELLED") toolStats[key].failures += 1;
      if (toolCall.status === "NOT_IMPLEMENTED") toolStats[key].notImplemented += 1;
      if (toolCall.status === "APPROVAL_REQUIRED") toolStats[key].approvalsRequired += 1;
      if (toolCall.status === "DENIED") toolStats[key].denied += 1;
      if (toolCall.sideEffectLevel === "WRITE" || toolCall.sideEffectLevel === "DESTRUCTIVE" || toolCall.sideEffectLevel === "EXTERNAL") {
        toolStats[key].writeOrExternal += 1;
      }
    }

    const successfulRuns = statusCounts.SUCCESS;
    const failedRuns = statusCounts.FAILED + statusCounts.CANCELLED;
    const activeRuns = statusCounts.QUEUED + statusCounts.RUNNING + statusCounts.PENDING_APPROVAL;
    const completedRuns = successfulRuns + failedRuns;

    return {
      scope: user.role === "SUPER_ADMIN" ? "platform" : "company",
      lookbackDays,
      sampledRuns: recentRuns.length,
      sampledToolCalls: sampledToolCalls.length,
      totals: {
        runs: recentRuns.length,
        successfulRuns,
        failedRuns,
        activeRuns,
        costGBP: totalCostGBP,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        successRate: completedRuns > 0 ? successfulRuns / completedRuns : 0,
        averageLatencyMs: completedLatencyCount > 0 ? completedLatencyTotalMs / completedLatencyCount : 0,
      },
      statusCounts,
      triggerCounts,
      modelStats: Object.values(modelCounts).sort((a, b) => b.runs - a.runs).slice(0, 8),
      agentStats: Object.values(agentCounts).sort((a, b) => b.failures - a.failures || b.runs - a.runs).slice(0, 8),
      toolStats: Object.values(toolStats).sort((a, b) => b.failures - a.failures || b.calls - a.calls).slice(0, 8),
      failureReasons: Object.entries(failureReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      recentRuns: recentRuns.slice(0, 12).map((run) => ({
        runId: run._id,
        agentId: run.agentId,
        agentName: agentNameById.get(run.agentId) ?? "Unknown agent",
        status: run.status,
        triggerType: run.triggerType,
        objective: run.objective,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        latencyMs: getRunLatencyMs(run),
        costGBP: run.costGBP,
        modelId: run.modelId || run.providerModelId,
        error: run.error || (run.status === "FAILED" || run.status === "CANCELLED" ? run.finalOutput : undefined),
        nextAction: getRunObservabilityAction(run),
      })),
    };
  },
});

/**
 * The approval queue, super-admin only.
 *
 * This used to be an `adminQuery` with a company-scoped branch, so a company
 * ADMIN was authorised over the public API. The nav has always hidden the page
 * from them, which made it a live permission with no screen behind it — the same
 * shape of fault as the workflow resume hole. Approvals are an operation run on a
 * client's behalf, so the API now says that.
 *
 * The consequence is deliberate and worth knowing: a client's own admin cannot
 * unstick their own agent. That is why the count badge and the expiry sweep are
 * not optional extras.
 */
export const getPendingApprovals = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();
    // Two indexes, one for each mode. Filtering the loaded page in the browser
    // instead would search 15 rows of an unknown number and report "no matches"
    // with matches still unpaged.
    const approvalsPage = searchTerm
      ? await ctx.db
          .query("agentRunApprovals")
          .withSearchIndex("search_approval", (q) =>
            q.search("searchText", searchTerm).eq("status", "PENDING"))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("agentRunApprovals")
          .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
          .order("desc")
          .paginate(args.paginationOpts);

    const page = await Promise.all(approvalsPage.page.map(async (approval) => {
      const [run, toolCall, agent] = await Promise.all([
        ctx.db.get(approval.runId),
        approval.toolCallId ? ctx.db.get(approval.toolCallId) : null,
        ctx.db.get(approval.agentId),
      ]);

      return {
        approval,
        run,
        toolCall,
        agent,
      };
    }));

    return {
      ...approvalsPage,
      page,
    };
  },
});

/**
 * How many runs are waiting on a person, for the nav badge.
 *
 * Counts every pending approval rather than only the stale ones. The 30-minute
 * `PENDING_APPROVAL_THRESHOLD_MINUTES` in `analyticsCron` is right for an alert
 * digest and wrong for the thing telling you a run is waiting: for the first half
 * hour that signal reads zero, which is exactly when someone could still act on it.
 */
export const getPendingApprovalCount = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
      .take(PENDING_APPROVAL_COUNT_LIMIT);

    return {
      count: pending.length,
      // So the badge can read "99+" rather than claiming a precise number it did
      // not finish counting.
      atLimit: pending.length === PENDING_APPROVAL_COUNT_LIMIT,
    };
  },
});

/** Super-admin only, for the same reason as `getPendingApprovals` above. */
export const decideApproval = superAdminMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    decision: v.union(v.literal("APPROVED"), v.literal("REJECTED"), v.literal("CANCELLED")),
    decisionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    // Covers EXPIRED as well, so a stale browser tab cannot approve something the
    // platform has already closed and whose run has been cancelled underneath it.
    if (approval.status === "EXPIRED") {
      throw new Error("This request expired before it was answered, and its run has stopped.");
    }
    if (approval.status !== "PENDING") throw new Error("Approval has already been reviewed");

    const run = await ctx.db.get(approval.runId);
    if (!run) throw new Error("Run not found");

    const now = Date.now();
    await ctx.db.patch(args.approvalId, {
      status: args.decision,
      reviewedBy: userId,
      reviewedAt: now,
      ...(args.decisionReason !== undefined ? { decisionReason: args.decisionReason } : {}),
    });

    // Approving a tool call is exactly the event an audit log exists for, and this
    // wrote none. `cancelRun` next door has always written one. Recorded before the
    // branch below, so an approval, a refusal and a cancellation are all traceable
    // through one path rather than three.
    const decidedToolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: `AGENT_APPROVAL_${args.decision}`,
      entityType: "agentRunApprovals",
      entityId: args.approvalId,
      ...(run.companyId ? { companyId: run.companyId } : {}),
      metadata: JSON.stringify({
        runId: approval.runId,
        agentId: approval.agentId,
        tool: decidedToolCall?.normalizedToolName,
        // The thing a reader of the log most wants to know: was this a lookup or a
        // deletion.
        sideEffectLevel: decidedToolCall?.sideEffectLevel,
        reason: args.decisionReason,
      }),
      timestamp: now,
    });

    if (args.decision === "APPROVED") {
      if (approval.toolCallId) {
        await ctx.db.patch(approval.toolCallId, {
          status: "PENDING",
          confirmationGrantedAt: now,
        });
      }

      // Only back to RUNNING once nothing else in this run is waiting. A model
      // turn can request several tools, so approving one of three leaves the run
      // parked — and a run that reports RUNNING while it sits waiting on a person
      // is exactly the state the stalled-run sweeper is meant to catch. The
      // approved tool still executes now; it is the run's status that waits.
      const stillPending = await ctx.db
        .query("agentRunApprovals")
        .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
        .filter((q) => q.eq(q.field("status"), "PENDING"))
        .take(AGENT_RUN_DETAIL_LIMIT);

      if (stillPending.length === 0) {
        await ctx.db.patch(approval.runId, {
          status: "RUNNING",
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(approval.runId, { updatedAt: now });
      }

      await ctx.scheduler.runAfter(0, internal.agentRuntime.resumeApprovedToolCall, {
        approvalId: args.approvalId,
      });
      return true;
    }

    // A rejection tells the agent; it no longer kills the run.
    //
    // Rejecting used to set the run FAILED with the model told nothing, so from
    // the agent's side the conversation stopped mid-thought and an objective that
    // was often nearly done was thrown away. A reviewer who means "not that way,
    // but do carry on" now has a button for it. Stopping a run outright is
    // `cancelRun`, and CANCELLED here keeps its old meaning, so the three
    // decisions are finally three different things.
    if (args.decision === "REJECTED") {
      const toolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
      const refusalMessage = getRefusedToolCallMessage(
        toolCall?.normalizedToolName ?? "this tool",
        args.decisionReason,
      );
      const refusalResult = JSON.stringify({ status: "error", error: refusalMessage });

      if (approval.toolCallId) {
        await ctx.db.patch(approval.toolCallId, {
          status: "DENIED",
          resultJson: refusalResult,
          completedAt: now,
          error: refusalMessage,
        });
      }

      const refusalStepIndex = await getNextStepIndex(ctx, approval.runId);
      await ctx.db.insert("agentRunSteps", {
        runId: approval.runId,
        agentId: approval.agentId,
        companyId: approval.companyId,
        stepIndex: refusalStepIndex,
        kind: "TOOL_RESULT",
        status: "FAILED",
        output: refusalResult,
        startedAt: now,
        completedAt: now,
        error: refusalMessage,
      });

      // Remember what was refused, so the model cannot ask again for the same
      // thing and put the same decision back in front of the reviewer.
      if (toolCall) {
        await ctx.db.patch(approval.runId, {
          refusedToolCallsJson: appendRefusedToolCall(
            run.refusedToolCallsJson,
            buildRefusedToolCallKey(toolCall.normalizedToolName, toolCall.argumentsJson),
          ),
          updatedAt: now,
        });
      }

      // Same settle-or-wait rule as an approval: the model asked for this turn's
      // calls together and has to be answered together, so the run only moves
      // when every one of them has an answer.
      const stillPending = await ctx.db
        .query("agentRunApprovals")
        .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
        .filter((q) => q.eq(q.field("status"), "PENDING"))
        .take(AGENT_RUN_DETAIL_LIMIT);

      if (stillPending.length === 0) {
        await ctx.db.patch(approval.runId, { status: "RUNNING", updatedAt: now });
      }

      await ctx.scheduler.runAfter(0, internal.agentRuntime.resumeAfterRefusedToolCall, {
        approvalId: args.approvalId,
      });

      return true;
    }

    const finalOutput = getApprovalFinalOutput(args.decision, args.decisionReason);
    const runStatus = "CANCELLED" as const;
    const toolStatus = "CANCELLED" as const;
    const nextStepIndex = await getNextStepIndex(ctx, approval.runId);

    if (approval.toolCallId) {
      await ctx.db.patch(approval.toolCallId, {
        status: toolStatus,
        completedAt: now,
        error: finalOutput,
      });
    }

    await ctx.db.insert("agentRunSteps", {
      runId: approval.runId,
      agentId: approval.agentId,
      companyId: approval.companyId,
      stepIndex: nextStepIndex,
      kind: "FINAL",
      status: "SKIPPED",
      output: finalOutput,
      startedAt: now,
      completedAt: now,
    });

    await ctx.db.patch(approval.runId, {
      status: runStatus,
      updatedAt: now,
      completedAt: now,
      cancelledAt: now,
      finalOutput,
    });
    await updateMemoryUsageOutcomeForRun(ctx, approval.runId, runStatus);

    // The run is over, so its parked position is not something to resume from.
    // A rejected run's checkpoint sits in AWAITING_APPROVAL, which the stalled-
    // run sweeper deliberately ignores, so nothing else would ever remove it.
    const checkpoint = await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_run", (q) => q.eq("runId", approval.runId))
      .first();
    if (checkpoint) await ctx.db.delete(checkpoint._id);

    return true;
  },
});

export const replayRun = adminMutation({
  args: {
    runId: v.id("agentRuns"),
    mode: v.optional(replayModeValidator),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    assertAdminCanAccessCompany(user, run.companyId);
    if (!isReplayableRunStatus(run.status)) {
      throw new Error("Only failed or cancelled runs can be replayed");
    }

    const agent = await ctx.db.get(run.agentId);
    if (!agent) throw new Error("Agent not found");
    if (agent.isActive === false) throw new Error("Agent is inactive");

    const now = Date.now();
    const replayMode = args.mode || "CURRENT_ACTIVE";
    if (replayMode === "SAME_VERSION" && !run.agentVersionId) {
      throw new Error("Same-version replay requires the source run to have an agent version snapshot.");
    }
    const agentVersionId = replayMode === "SAME_VERSION"
      ? run.agentVersionId
      : await ensureAgentVersionSnapshot(ctx, {
          agentId: run.agentId,
          companyId: run.companyId,
        });
    const replayRunId = await ctx.db.insert("agentRuns", {
      agentId: run.agentId,
      agentVersionId,
      workflowId: run.workflowId,
      scheduleId: run.scheduleId,
      triggerType: "MANUAL",
      objective: run.objective,
      status: "QUEUED",
      companyId: run.companyId,
      userId,
      modelId: run.modelId,
      providerKey: run.providerKey,
      providerModelId: run.providerModelId,
      maxSteps: run.maxSteps,
      maxCostGBP: run.maxCostGBP,
      maxRuntimeMs: run.maxRuntimeMs,
      startedAt: now,
      updatedAt: now,
      replayOfRunId: args.runId,
      replayMode,
    });

    await ctx.db.insert("agentRunSteps", {
      runId: replayRunId,
      agentId: run.agentId,
      companyId: run.companyId,
      stepIndex: 1,
      kind: "OBSERVE",
      status: "SUCCESS",
      input: run.objective,
      output: `Replay requested from run ${args.runId}.`,
      startedAt: now,
      completedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "REPLAY_AGENT_RUN",
      entityId: replayRunId,
      entityType: "agentRuns",
      companyId: run.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        sourceRunId: args.runId,
        sourceStatus: run.status,
        replayMode,
      }),
    });

    await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
      agentId: run.agentId,
      objective: run.objective,
      triggerType: "MANUAL",
      runId: replayRunId,
      workflowId: run.workflowId,
      scheduleId: run.scheduleId,
      companyId: run.companyId,
      userId,
    });

    return { runId: replayRunId, replayOfRunId: args.runId, replayMode };
  },
});

export const cancelRun = adminMutation({
  args: {
    runId: v.id("agentRuns"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    assertAdminCanAccessCompany(user, run.companyId);
    if (!isCancelableRunStatus(run.status)) {
      throw new Error("Only queued, running, or pending approval runs can be cancelled");
    }

    const now = Date.now();
    const finalOutput = args.reason ? `Agent run cancelled: ${args.reason}` : "Agent run cancelled.";
    const pendingApprovals = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_run_requested", (q) => q.eq("runId", args.runId))
      .filter((q) => q.eq(q.field("status"), "PENDING"))
      .take(AGENT_RUN_DETAIL_LIMIT);
    const pendingToolCalls = await ctx.db
      .query("agentToolCalls")
      .withIndex("by_run_started", (q) => q.eq("runId", args.runId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "PENDING"),
          q.eq(q.field("status"), "APPROVAL_REQUIRED")
        )
      )
      .take(AGENT_RUN_DETAIL_LIMIT);

    await Promise.all(pendingApprovals.map((approval) =>
      ctx.db.patch(approval._id, {
        status: "CANCELLED",
        reviewedBy: userId,
        reviewedAt: now,
        decisionReason: args.reason,
      })
    ));
    await Promise.all(pendingToolCalls.map((toolCall) =>
      ctx.db.patch(toolCall._id, {
        status: "CANCELLED",
        completedAt: now,
        error: finalOutput,
      })
    ));

    const nextStepIndex = await getNextStepIndex(ctx, args.runId);
    await ctx.db.insert("agentRunSteps", {
      runId: args.runId,
      agentId: run.agentId,
      companyId: run.companyId,
      stepIndex: nextStepIndex,
      kind: "FINAL",
      status: "SKIPPED",
      output: finalOutput,
      startedAt: now,
      completedAt: now,
    });

    await ctx.db.patch(args.runId, {
      status: "CANCELLED",
      updatedAt: now,
      completedAt: now,
      cancelledAt: now,
      finalOutput,
    });
    await updateMemoryUsageOutcomeForRun(ctx, args.runId, "CANCELLED");

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CANCEL_AGENT_RUN",
      entityId: args.runId,
      entityType: "agentRuns",
      companyId: run.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        previousStatus: run.status,
        reason: args.reason,
      }),
    });

    return true;
  },
});

export const createRunInternal = internalMutation({
  args: {
    agentId: v.id("agents"),
    threadId: v.optional(v.id("threads")),
    workflowId: v.optional(v.id("workflows")),
    scheduleId: v.optional(v.id("schedules")),
    triggerType: agentRunTriggerValidator,
    objective: v.string(),
    status: v.optional(agentRunStatusValidator),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    modelId: v.optional(v.string()),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    maxSteps: v.optional(v.number()),
    maxCostGBP: v.optional(v.number()),
    maxRuntimeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const agentVersionId = await ensureAgentVersionSnapshot(ctx, {
      agentId: args.agentId,
      companyId: args.companyId,
    });
    return await ctx.db.insert("agentRuns", {
      ...args,
      agentVersionId,
      status: args.status ?? "QUEUED",
      startedAt: now,
      updatedAt: now,
    });
  },
});

export const createPublicAgentRunInternal = internalMutation({
  args: {
    agentId: v.id("agents"),
    companyId: v.id("companies"),
    objective: v.string(),
  },
  handler: async (ctx, args) => {
    const objective = args.objective.trim();
    if (!objective) throw new Error("Objective is required.");
    if (objective.length > PUBLIC_AGENT_RUN_OBJECTIVE_MAX_LENGTH) {
      throw new Error(`Objective cannot exceed ${PUBLIC_AGENT_RUN_OBJECTIVE_MAX_LENGTH} characters.`);
    }

    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.isActive === false) throw new Error("Agent not found or inactive.");
    if (agent.companyId !== args.companyId) {
      throw new Error("Agent not found or inactive.");
    }

    const runId = await ctx.db.insert("agentRuns", {
      agentId: args.agentId,
      companyId: args.companyId,
      triggerType: "WEBHOOK",
      objective,
      status: "QUEUED",
      agentVersionId: await ensureAgentVersionSnapshot(ctx, {
        agentId: args.agentId,
        companyId: args.companyId,
      }),
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.agentRuntime.runTriggeredAgentObjective, {
      agentId: args.agentId,
      objective,
      triggerType: "WEBHOOK",
      runId,
      companyId: args.companyId,
    });

    return {
      runId,
      status: "QUEUED" as const,
    };
  },
});

export const updateRunStatusInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    status: agentRunStatusValidator,
    error: v.optional(v.string()),
    finalOutput: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingRun = await ctx.db.get(args.runId);
    if (!existingRun) throw new Error("Run not found");
    if (existingRun.status === "CANCELLED" && args.status !== "CANCELLED") {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: args.status,
      updatedAt: now,
      ...(isTerminalRunStatus(args.status) ? { completedAt: now } : {}),
      ...(args.status === "CANCELLED" ? { cancelledAt: now } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.finalOutput !== undefined ? { finalOutput: args.finalOutput } : {}),
    });
    if (isTerminalRunStatus(args.status)) {
      await updateMemoryUsageOutcomeForRun(ctx, args.runId, args.status);
      // Offer what this run taught, without waiting for someone to press a
      // button on the run list — which is why the queue was always empty.
      // Scheduled rather than awaited: a suggestion is worth having, but never
      // at the cost of the run failing to record that it finished.
      await ctx.scheduler.runAfter(0, internal.agentMemoryCandidates.generateForRunInternal, {
        runId: args.runId,
      });
    }
  },
});

export const recordRunUsageInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costGBP: v.number(),
    modelId: v.optional(v.string()),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costGBP: args.costGBP,
      updatedAt: Date.now(),
      ...(args.modelId !== undefined ? { modelId: args.modelId } : {}),
      ...(args.providerKey !== undefined ? { providerKey: args.providerKey } : {}),
      ...(args.providerModelId !== undefined ? { providerModelId: args.providerModelId } : {}),
    });
  },
});

export const appendStepInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    stepIndex: v.number(),
    kind: agentRunStepKindValidator,
    status: agentRunStepStatusValidator,
    input: v.optional(v.string()),
    output: v.optional(v.string()),
    modelId: v.optional(v.string()),
    providerKey: v.optional(v.string()),
    providerModelId: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costGBP: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agentRunSteps", {
      ...args,
      startedAt: now,
      ...(args.status !== "RUNNING" && args.status !== "PENDING" ? { completedAt: now } : {}),
    });
  },
});

export const insertToolCallInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    stepId: v.optional(v.id("agentRunSteps")),
    agentId: v.id("agents"),
    toolId: v.optional(v.id("aiTools")),
    normalizedToolName: v.string(),
    handlerMapping: v.string(),
    argumentsJson: v.string(),
    redactedArgumentsJson: v.optional(v.string()),
    resultJson: v.optional(v.string()),
    status: toolCallStatusValidator,
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    sideEffectLevel: sideEffectLevelValidator,
    confirmationRequired: v.boolean(),
    confirmationGrantedAt: v.optional(v.number()),
    companyId: v.optional(v.id("companies")),
    userId: v.optional(v.id("users")),
    /** The model turn that requested this call, so the batch can be reassembled. */
    turnIndex: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("agentToolCalls", {
      ...args,
      startedAt: now,
      ...(args.status !== "PENDING" && args.status !== "APPROVAL_REQUIRED" ? { completedAt: now } : {}),
    });
  },
});

export const insertApprovalInternal = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    stepId: v.optional(v.id("agentRunSteps")),
    toolCallId: v.optional(v.id("agentToolCalls")),
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    requestedBy: v.optional(v.id("users")),
    reviewedBy: v.optional(v.id("users")),
    status: approvalStatusValidator,
    message: v.optional(v.string()),
    previewJson: v.optional(v.string()),
    decisionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Resolved here rather than on read: the queue is searched far more often
    // than it is written, and a search index needs the text on the row.
    const [agent, toolCall] = await Promise.all([
      ctx.db.get(args.agentId),
      args.toolCallId ? ctx.db.get(args.toolCallId) : null,
    ]);
    const searchText = [agent?.name, toolCall?.normalizedToolName, toolCall?.handlerMapping]
      .filter((part): part is string => Boolean(part))
      .join(" ");

    return await ctx.db.insert("agentRunApprovals", {
      ...args,
      ...(searchText.length > 0 ? { searchText } : {}),
      requestedAt: now,
      ...(args.status !== "PENDING" ? { reviewedAt: now } : {}),
    });
  },
});

export const getApprovalResumeContextInternal = internalQuery({
  args: {
    approvalId: v.id("agentRunApprovals"),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) return null;

    const [run, toolCall, agent] = await Promise.all([
      ctx.db.get(approval.runId),
      approval.toolCallId ? ctx.db.get(approval.toolCallId) : null,
      ctx.db.get(approval.agentId),
    ]);

    return {
      approval,
      run,
      toolCall,
      agent,
    };
  },
});

/**
 * Hand an approved tool's result back to the model and restart the loop.
 *
 * Human-in-the-loop used to end here: the tool ran, a fixed sentence was posted
 * ("Approved tool call completed"), and the run was marked finished. The model
 * never saw the result, so an agent that asked permission to look something up
 * could not then use what it found — approval was a one-shot side-effect
 * executor rather than a pause in the agent's reasoning.
 *
 * The transcript comes in already extended with the call and its result, so all
 * that remains is to record the outcome, put the run back to RUNNING and hand it
 * to the scheduler. Returns false when there is no checkpoint to resume into, in
 * which case the caller falls back to concluding the run.
 */
/**
 * Record one approved call's outcome, and say whether the batch is settled.
 *
 * A single model turn can request several tools, so a parked run may hold several
 * approvals. They are decided one at a time, but the model must be answered once,
 * with every result of that turn in the order it asked for them. So this records
 * the outcome and then answers the only question the caller needs: is anything in
 * this run still waiting on a person?
 *
 * While something is, the run stays parked and nothing is appended. When nothing
 * is, the whole batch comes back — including the calls that ran without needing
 * approval, whose results have been sitting on their rows since the run parked.
 */
export const recordApprovedToolResultInternal = internalMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    resultJson: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const now = Date.now();
    const resultStepIndex = await getNextStepIndex(ctx, approval.runId);
    await ctx.db.insert("agentRunSteps", {
      runId: approval.runId,
      agentId: approval.agentId,
      companyId: approval.companyId,
      stepIndex: resultStepIndex,
      kind: "TOOL_RESULT",
      status: args.status,
      output: args.resultJson,
      startedAt: now,
      completedAt: now,
      ...(args.error !== undefined ? { error: args.error } : {}),
    });

    if (approval.toolCallId) {
      await ctx.db.patch(approval.toolCallId, {
        status: args.status,
        resultJson: args.resultJson,
        completedAt: now,
        ...(args.error !== undefined ? { error: args.error } : {}),
      });
    }

    const stillPending = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
      .filter((q) => q.eq(q.field("status"), "PENDING"))
      .take(AGENT_RUN_DETAIL_LIMIT);
    if (stillPending.length > 0) {
      return { settled: false as const, batchCalls: [], stepIndex: resultStepIndex };
    }

    const toolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
    // A row written before `turnIndex` existed has none. Answering with just this
    // call is the old behaviour, which is the right fallback for an old row.
    const batch = toolCall?.turnIndex === undefined
      ? (toolCall ? [toolCall] : [])
      : await ctx.db
          .query("agentToolCalls")
          .withIndex("by_run_turn", (q) =>
            q.eq("runId", approval.runId).eq("turnIndex", toolCall.turnIndex))
          .take(AGENT_RUN_DETAIL_LIMIT);

    return {
      settled: true as const,
      stepIndex: resultStepIndex,
      batchCalls: batch.map((call) => ({
        name: call.normalizedToolName,
        argumentsJson: call.argumentsJson,
        resultJson: call.resultJson,
      })),
    };
  },
});

export const getApprovalExpiryConfig = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", APPROVAL_EXPIRY_CONFIG_KEY))
      .first();

    return {
      ...parseApprovalExpiryConfig(config?.value),
      defaultHours: DEFAULT_APPROVAL_EXPIRY_HOURS,
      minHours: MIN_APPROVAL_EXPIRY_HOURS,
      maxHours: MAX_APPROVAL_EXPIRY_HOURS,
    };
  },
});

export const updateApprovalExpiryConfig = superAdminMutation({
  args: {
    expiryHours: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const expiryHours = normalizeApprovalExpiryHoursForUpdate(args.expiryHours);
    const now = Date.now();
    const value = JSON.stringify({ expiryHours });

    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", APPROVAL_EXPIRY_CONFIG_KEY))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: now, updatedBy: userId });
    } else {
      await ctx.db.insert("systemConfig", {
        key: APPROVAL_EXPIRY_CONFIG_KEY,
        value,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_SYSTEM_PREFERENCES",
      entityType: "systemConfig",
      entityId: APPROVAL_EXPIRY_CONFIG_KEY,
      metadata: JSON.stringify({ expiryHours }),
      timestamp: now,
    });

    return expiryHours;
  },
});

/**
 * Give up on approvals nobody answered.
 *
 * Only ever cancels. An unattended yes to a deletion is the one outcome worse than
 * a stuck run, and unlike a rejection nobody made a judgement here — so the run is
 * stopped rather than the model being told it was refused, which would put a
 * decision in the transcript that no person took.
 *
 * The whole batch goes together. A model turn's calls were requested together and
 * leaving siblings pending would park the run again with nothing able to settle it.
 */
export const expireStalePendingApprovals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const platformConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", APPROVAL_EXPIRY_CONFIG_KEY))
      .first();
    const platformExpiryHours = parseApprovalExpiryConfig(platformConfig?.value).expiryHours;

    const pending = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
      .take(APPROVAL_EXPIRY_SWEEP_LIMIT);

    let expiredRuns = 0;
    const handledRuns = new Set<string>();

    for (const approval of pending) {
      if (handledRuns.has(approval.runId)) continue;

      const agent = await ctx.db.get(approval.agentId);
      const expiryHours = resolveApprovalExpiryHours({
        agentExpiryHours: agent?.approvalExpiryHours,
        platformExpiryHours,
      });
      if (!isApprovalExpired({ requestedAt: approval.requestedAt, now, expiryHours })) continue;

      const run = await ctx.db.get(approval.runId);
      // A run that has already reached a terminal state has been dealt with by
      // something else — a cancellation, most likely. Leave its rows alone.
      if (!run || run.status !== "PENDING_APPROVAL") continue;

      handledRuns.add(approval.runId);
      expiredRuns += 1;
      const message = getApprovalExpiredMessage(expiryHours);

      const runApprovals = await ctx.db
        .query("agentRunApprovals")
        .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
        .filter((q) => q.eq(q.field("status"), "PENDING"))
        .take(AGENT_RUN_DETAIL_LIMIT);

      for (const stale of runApprovals) {
        await ctx.db.patch(stale._id, {
          status: "EXPIRED",
          reviewedAt: now,
          decisionReason: message,
        });
        if (stale.toolCallId) {
          await ctx.db.patch(stale.toolCallId, {
            status: "CANCELLED",
            completedAt: now,
            error: message,
          });
        }
      }

      const stepIndex = await getNextStepIndex(ctx, approval.runId);
      await ctx.db.insert("agentRunSteps", {
        runId: approval.runId,
        agentId: approval.agentId,
        companyId: approval.companyId,
        stepIndex,
        kind: "FINAL",
        status: "SKIPPED",
        output: message,
        startedAt: now,
        completedAt: now,
      });

      await ctx.db.patch(approval.runId, {
        status: "CANCELLED",
        updatedAt: now,
        completedAt: now,
        cancelledAt: now,
        finalOutput: message,
      });
      await updateMemoryUsageOutcomeForRun(ctx, approval.runId, "CANCELLED");

      // The parked position is not something to resume from, and the sweeper that
      // clears stale checkpoints deliberately ignores AWAITING_APPROVAL ones.
      const checkpoint = await ctx.db
        .query("agentRunCheckpoints")
        .withIndex("by_run", (q) => q.eq("runId", approval.runId))
        .first();
      if (checkpoint) await ctx.db.delete(checkpoint._id);

      // Deliberately no audit row. `auditLogs.actorId` is required and names the
      // admin who did a thing; nobody did this one, and inventing an actor to
      // satisfy the column would put a person's name against a decision they never
      // took. Widening a table every screen reads, for a nicety, is the worse
      // trade. The expiry is already traceable without it: the approval carries
      // EXPIRED and the reason, the run carries a FINAL step and CANCELLED, and the
      // conversation gets the sentence below.

      // Nobody chose this, so the conversation gets a sentence rather than simply
      // going dead.
      if (run.threadId) {
        await ctx.scheduler.runAfter(0, internal.chat.saveAssistantMessage, {
          threadId: run.threadId,
          content: message,
        });
      }
    }

    return { examined: pending.length, expiredRuns };
  },
});

/**
 * The same settle-or-wait answer as `recordApprovedToolResultInternal`, without
 * writing anything.
 *
 * A refusal has already been recorded by `decideApproval`, so the resume only
 * needs to know whether the batch is complete and, if it is, what the whole turn
 * looked like.
 */
export const getSettlementAfterDecisionInternal = internalQuery({
  args: { approvalId: v.id("agentRunApprovals") },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) return null;

    const stillPending = await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_run_requested", (q) => q.eq("runId", approval.runId))
      .filter((q) => q.eq(q.field("status"), "PENDING"))
      .take(AGENT_RUN_DETAIL_LIMIT);
    const stepIndex = await getNextStepIndex(ctx, approval.runId);
    if (stillPending.length > 0) {
      return { settled: false as const, batchCalls: [], stepIndex };
    }

    const toolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
    const batch = toolCall?.turnIndex === undefined
      ? (toolCall ? [toolCall] : [])
      : await ctx.db
          .query("agentToolCalls")
          .withIndex("by_run_turn", (q) =>
            q.eq("runId", approval.runId).eq("turnIndex", toolCall.turnIndex))
          .take(AGENT_RUN_DETAIL_LIMIT);

    return {
      settled: true as const,
      stepIndex,
      batchCalls: batch.map((call) => ({
        name: call.normalizedToolName,
        argumentsJson: call.argumentsJson,
        resultJson: call.resultJson,
      })),
    };
  },
});

export const continueRunAfterApprovalInternal = internalMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    transcriptJson: v.string(),
    stepIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const run = await ctx.db.get(approval.runId);
    if (!run) throw new Error("Run not found");

    const checkpoint = await ctx.db
      .query("agentRunCheckpoints")
      .withIndex("by_run", (q) => q.eq("runId", approval.runId))
      .first();
    if (!checkpoint || checkpoint.status !== "AWAITING_APPROVAL") return false;

    const now = Date.now();
    // Back to RUNNING, not to a terminal status: the objective is not finished,
    // it was waiting.
    await ctx.db.patch(approval.runId, {
      status: "RUNNING",
      updatedAt: now,
    });

    await ctx.db.patch(checkpoint._id, {
      status: "ACTIVE",
      transcriptJson: args.transcriptJson,
      stepIndex: args.stepIndex,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.agentRuntime.continueAgentObjective, {
      runId: approval.runId,
    });

    return true;
  },
});

/**
 * Conclude a run that cannot be resumed into a conversation.
 *
 * A triggered run with no chat thread, or one whose conversation grew too large to
 * checkpoint. The tool ran and its outcome is already recorded by
 * `recordApprovedToolResultInternal`; all that is left is to close the run.
 */
export const completeApprovalResumeInternal = internalMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    finalOutput: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const run = await ctx.db.get(approval.runId);
    if (!run) throw new Error("Run not found");

    const now = Date.now();
    const finalStepIndex = await getNextStepIndex(ctx, approval.runId);
    await ctx.db.insert("agentRunSteps", {
      runId: approval.runId,
      agentId: approval.agentId,
      companyId: approval.companyId,
      stepIndex: finalStepIndex,
      kind: "FINAL",
      status: args.status,
      output: args.finalOutput,
      startedAt: now,
      completedAt: now,
      ...(args.error !== undefined ? { error: args.error } : {}),
    });

    await ctx.db.patch(approval.runId, {
      status: args.status,
      updatedAt: now,
      completedAt: now,
      finalOutput: args.finalOutput,
      ...(args.error !== undefined ? { error: args.error } : {}),
    });
    await updateMemoryUsageOutcomeForRun(ctx, approval.runId, args.status);

    return {
      runId: approval.runId,
      threadId: run.threadId,
      finalOutput: args.finalOutput,
    };
  },
});
