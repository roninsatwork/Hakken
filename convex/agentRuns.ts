import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { buildAgentRunAuditMetadata } from "./auditLogService";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";
import {
  getNextStepIndex,
  recordAgentAction,
  updateMemoryUsageOutcomeForRun,
} from "./agentRunStateService";
import {
  getRunLatencyMs,
  readAgentAnalytics,
  readRunObservatory,
} from "./agentObservabilityService";

/** Shared with `agentRunApprovals.ts`, which reads run-scoped rows to the same cap. */
export const AGENT_RUN_DETAIL_LIMIT = 500;

/** A row shows at most a handful of markers, so it never needs more than a few. */
const ROW_MARKER_LIMIT = 5;
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
  v.literal("CANCELLED"),
  // A rehearsal run recorded this write instead of performing it. Distinct
  // from SUCCESS because nothing happened, and from DENIED because nothing
  // was refused — the fixture is graded on what the agent *would* have done.
  v.literal("REHEARSED")
);

const sideEffectLevelValidator = v.union(
  v.literal("READ"),
  v.literal("WRITE"),
  v.literal("DESTRUCTIVE"),
  v.literal("EXTERNAL")
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

/**
 * @param toolName The tool's name as a person installed it — "Apify", not
 * `apify_actor_run`. Absent when the tool has since been uninstalled, which is
 * why every reader of this has to cope without it.
 */
function buildToolCallDetail(
  toolCall: Doc<"agentToolCalls">,
  viewerRole: string | undefined,
  toolName?: string
) {
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
    toolName,
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

/**
 * One page of an agent's jobs, already carrying everything the Activity table
 * shows.
 *
 * The screen used to build those markers in the browser: it fetched up to two
 * hundred reflections, two hundred memory candidates, two hundred checks, two
 * hundred suggestions and five hundred pieces of feedback on every visit, then
 * threw nearly all of it away to put small labels on twenty rows. Roughly
 * thirteen hundred documents read to decorate twenty.
 *
 * Here the page is fetched first and only its own rows are looked up, each
 * through that table's own by-run index. The cost is a page, not a history, so
 * it stays flat as an agent accumulates work.
 */
export const getPageForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(agentRunStatusValidator),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    const baseQuery = args.status
      ? ctx.db
          .query("agentRuns")
          .withIndex("by_status_started", (q) => q.eq("status", args.status!))
          .filter((q) => q.eq(q.field("agentId"), args.agentId))
      : ctx.db.query("agentRuns").withIndex("by_agent_started", (q) => q.eq("agentId", args.agentId));

    if (user.role === "ADMIN" && !user.companyId) throw new Error("Unauthorized");

    const scoped = user.role === "ADMIN"
      ? baseQuery.filter((q) => q.eq(q.field("companyId"), user.companyId))
      : baseQuery;

    const result = await scoped.order("desc").paginate(args.paginationOpts);

    const rows = await Promise.all(
      result.page.map(async (run) => {
        const [feedback, reflection, candidates, fixture, suggestions] = await Promise.all([
          ctx.db
            .query("agentRunFeedback")
            .withIndex("by_run_created", (q) => q.eq("runId", run._id))
            .filter((q) => q.eq(q.field("userId"), userId))
            .first(),
          ctx.db
            .query("agentRunReflections")
            .withIndex("by_run_created", (q) => q.eq("runId", run._id))
            .first(),
          ctx.db
            .query("agentMemoryCandidates")
            .withIndex("by_run_created", (q) => q.eq("sourceRunId", run._id))
            .filter((q) => q.eq(q.field("status"), "PROPOSED"))
            .take(ROW_MARKER_LIMIT),
          ctx.db
            .query("agentEvalFixtures")
            .withIndex("by_run_created", (q) => q.eq("sourceRunId", run._id))
            .filter((q) => q.eq(q.field("status"), "ACTIVE"))
            .first(),
          ctx.db
            .query("agentImprovementSuggestions")
            .withIndex("by_run_created", (q) => q.eq("sourceRunId", run._id))
            .filter((q) => q.eq(q.field("status"), "PROPOSED"))
            .take(ROW_MARKER_LIMIT),
        ]);

        return {
          _id: run._id,
          objective: run.objective,
          status: run.status,
          triggerType: run.triggerType,
          // A drill, not traffic — the list marks it so nobody reads a
          // rehearsal as a customer interaction.
          isRehearsal: run.isRehearsal === true,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          costGBP: run.costGBP,
          error: run.error,
          finalOutput: run.finalOutput,
          agentVersionId: run.agentVersionId,
          // So a planned handover is not dressed as a failure on the list.
          continuedByRunId: run.continuedByRunId,
          markers: {
            // The whole record, not just the rating: the rate-this-job form
            // prefills from it, and this document has already been read.
            feedback: feedback
              ? { rating: feedback.rating, labels: feedback.labels, comment: feedback.comment }
              : null,
            reflected: reflection !== null,
            // Ids rather than counts: the row's accept and dismiss buttons act
            // on one, and sending the id saves a second lookup to find it.
            memoryCandidateIds: candidates.map((candidate) => candidate._id),
            usedAsCheck: fixture !== null,
            suggestionIds: suggestions.map((suggestion) => suggestion._id),
          },
        };
      })
    );

    return { ...result, page: rows };
  },
});

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

/**
 * Which agents have a run in flight right now.
 *
 * The agents list said "Active" whether an agent was flat out or idle —
 * active is a setting, not a state, and nothing on that screen changed while
 * an agent worked. Anthony, 2026-08-03: *"nothing changed on the agent screen
 * when it's running."* One bounded read serves the whole list.
 */
export const getWorkingAgentIds = adminQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    const live = (
      await Promise.all(
        (["RUNNING", "QUEUED", "PENDING_APPROVAL"] as const).map((status) =>
          ctx.db
            .query("agentRuns")
            .withIndex("by_status_started", (q) => q.eq("status", status))
            .order("desc")
            .take(100)
        )
      )
    ).flat();

    const visible = user.role === "ADMIN"
      ? live.filter((run) => run.companyId === user.companyId)
      : live;

    return [...new Set(visible.map((run) => run.agentId))];
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

    // The newest rows, not the oldest. Reading ascending filled the cap with
    // the start of a long run, and a live page then froze mid-run while the
    // run kept working — the reader was told "not moving" by a screen whose
    // window had simply stopped following. Read the tail and put it back in
    // order.
    const [steps, toolCalls, approvals, replayRuns, evalFixtures] = await Promise.all([
      ctx.db
        .query("agentRunSteps")
        .withIndex("by_run_step", (q) => q.eq("runId", args.runId))
        .order("desc")
        .take(AGENT_RUN_DETAIL_LIMIT)
        .then((rows) => rows.reverse()),
      ctx.db
        .query("agentToolCalls")
        .withIndex("by_run_started", (q) => q.eq("runId", args.runId))
        .order("desc")
        .take(AGENT_RUN_DETAIL_LIMIT)
        .then((rows) => rows.reverse()),
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
    // The installed tools behind this run's calls, looked up once each however
    // many times they were called. Without this the screens can only show the
    // runtime's own name for a tool — `apify_actor_run` — which is no use to
    // the person the observability screens are for.
    const uniqueToolIds = [...new Set(
      toolCalls.map((toolCall) => toolCall.toolId).filter((toolId): toolId is Id<"aiTools"> => Boolean(toolId))
    )];
    const toolNameById = new Map(
      (await Promise.all(uniqueToolIds.map(async (toolId) => [toolId, await ctx.db.get(toolId)] as const)))
        .flatMap(([toolId, tool]) => (tool ? [[toolId, tool.name] as const] : []))
    );

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
      toolCalls: toolCalls.map((toolCall) => buildToolCallDetail(
        toolCall,
        user.role,
        toolCall.toolId ? toolNameById.get(toolCall.toolId) : undefined
      )),
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

/**
 * The recorded behaviour of one run, in the shape the rehearsal grader reads.
 * Ids and arguments stay out: grading compares which handlers were invoked,
 * and the run detail screen already shows the rest.
 */
export const getToolCallRecordsForRunInternal = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("agentToolCalls")
      .withIndex("by_run_started", (q) => q.eq("runId", args.runId))
      .take(200);
    return calls.map((call) => ({ handlerMapping: call.handlerMapping, status: call.status }));
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
      isRehearsal: run.isRehearsal === true,
    };
  },
});

export const getAnalyticsForAgent = adminQuery({
  args: {
    agentId: v.id("agents"),
    /** The window the headline numbers report on, compared against the one before it. */
    lookbackDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => await readAgentAnalytics(ctx, args),
});

export const getRunObservatory = adminQuery({
  args: {
    lookbackDays: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => await readRunObservatory(ctx, args),
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
    isRehearsal: v.optional(v.boolean()),
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
      /*
       * One entry per run, where it ends.
       *
       * Not one per step. Step-level detail already lives in the agent
       * observability screens and belongs there; repeating it on the trail
       * would make the trail unreadable inside a week, which is the failure
       * mode this whole plan is trying to avoid.
       */
      const agent = await ctx.db.get(existingRun.agentId);
      await ctx.db.insert("auditLogs", {
        actionType: "AGENT_RUN_FINISHED",
        entityType: "agentRuns",
        entityId: args.runId,
        ...(existingRun.companyId ? { companyId: existingRun.companyId } : {}),
        timestamp: now,
        metadata: buildAgentRunAuditMetadata({
          agentName: agent?.name,
          objective: existingRun.objective,
          status: args.status,
          durationMs: now - existingRun.startedAt,
          error: args.error,
        }),
      });

      await updateMemoryUsageOutcomeForRun(ctx, args.runId, args.status);
      // Offer what this run taught, without waiting for someone to press a
      // button on the run list — which is why the queue was always empty.
      // Scheduled rather than awaited: a suggestion is worth having, but never
      // at the cost of the run failing to record that it finished.
      //
      // Failures go through reflection first, which schedules the candidate
      // pass itself once the reflection row exists. Chained rather than two
      // runAfter(0) siblings, because the candidate pass reads reflections and
      // racing them would make it blind to the one thing a failed run has to
      // teach (self-improvement plan, Phase 1).
      // Rehearsals end without teaching: their tool results were fabricated,
      // so neither reflection nor the candidate pass should run. The grading
      // half of a drill is scheduled by the eval flow, not from here.
      if (existingRun.isRehearsal) {
        return;
      }
      if (args.status === "FAILED" || args.status === "CANCELLED") {
        await ctx.scheduler.runAfter(0, internal.agentRunReflections.createForRunInternal, {
          runId: args.runId,
        });
      } else {
        await ctx.scheduler.runAfter(0, internal.agentMemoryCandidates.generateForRunInternal, {
          runId: args.runId,
        });
      }
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
    /** Returned to the model with the call when the run resumes. */
    thoughtSignature: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const settled = args.status !== "PENDING" && args.status !== "APPROVAL_REQUIRED";

    const toolCallId = await ctx.db.insert("agentToolCalls", {
      ...args,
      startedAt: now,
      ...(settled ? { completedAt: now } : {}),
    });

    // A call still waiting on a person is not something the agent has done yet.
    // It reaches the trail when it settles — through the approval decision if a
    // person refuses it, or through `recordApprovedToolResultInternal` if it
    // runs.
    if (settled) {
      await recordAgentAction(ctx, {
        agentId: args.agentId,
        companyId: args.companyId,
        runId: args.runId,
        tool: args.normalizedToolName,
        sideEffectLevel: args.sideEffectLevel,
        status: args.status,
        error: args.error,
        timestamp: now,
      });
    }

    return toolCallId;
  },
});
