import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";

const AGENT_RUN_DETAIL_LIMIT = 500;
const AGENT_RUN_ANALYTICS_LIMIT = 500;

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

async function getNextStepIndex(ctx: Pick<MutationCtx, "db">, runId: Id<"agentRuns">) {
  const latestStep = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_step", (q) => q.eq("runId", runId))
    .order("desc")
    .first();

  return (latestStep?.stepIndex ?? 0) + 1;
}

async function updateMemoryUsageOutcomeForRun(
  ctx: Pick<MutationCtx, "db">,
  runId: Id<"agentRuns">,
  status: TerminalRunStatus
) {
  const now = Date.now();
  const usageRows = await ctx.db
    .query("agentMemoryUsage")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .take(AGENT_RUN_DETAIL_LIMIT);

  await Promise.all(usageRows.map((usage) =>
    ctx.db.patch(usage._id, {
      outcome: status,
      updatedAt: now,
    })
  ));
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

function incrementCount(target: Record<string, number>, key: string, increment = 1) {
  target[key] = (target[key] ?? 0) + increment;
}

export const getForAgent = query({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(agentRunStatusValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
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

export const getRunDetail = query({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const run = await ctx.db.get(args.runId);
    if (!run) return null;

    assertAdminCanAccessCompany(user, run.companyId);

    const [steps, toolCalls, approvals] = await Promise.all([
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
    ]);

    return {
      run,
      steps,
      toolCalls,
      approvals,
    };
  },
});

export const getAnalyticsForAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
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
        };
      }
      toolStats[key].calls += 1;
      if (toolCall.status === "SUCCESS") toolStats[key].successes += 1;
      if (toolCall.status === "FAILED") toolStats[key].failures += 1;
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

export const getPendingApprovals = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    if (user.role === "ADMIN" && !user.companyId) {
      throw new Error("Unauthorized");
    }

    const baseQuery = user.role === "SUPER_ADMIN"
      ? ctx.db
          .query("agentRunApprovals")
          .withIndex("by_status_requested", (q) => q.eq("status", "PENDING"))
      : ctx.db
          .query("agentRunApprovals")
          .withIndex("by_company_status_requested", (q) => q.eq("companyId", user.companyId).eq("status", "PENDING"));

    const approvalsPage = await baseQuery.order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(approvalsPage.page.map(async (approval) => {
      const [run, toolCall, agent] = await Promise.all([
        ctx.db.get(approval.runId),
        approval.toolCallId ? ctx.db.get(approval.toolCallId) : null,
        ctx.db.get(approval.agentId),
      ]);

      if (run) assertAdminCanAccessCompany(user, run.companyId);

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

export const decideApproval = mutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    decision: v.union(v.literal("APPROVED"), v.literal("REJECTED"), v.literal("CANCELLED")),
    decisionReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "PENDING") throw new Error("Approval has already been reviewed");

    const run = await ctx.db.get(approval.runId);
    if (!run) throw new Error("Run not found");
    assertAdminCanAccessCompany(user, run.companyId);

    const now = Date.now();
    await ctx.db.patch(args.approvalId, {
      status: args.decision,
      reviewedBy: userId,
      reviewedAt: now,
      ...(args.decisionReason !== undefined ? { decisionReason: args.decisionReason } : {}),
    });

    if (args.decision === "APPROVED") {
      if (approval.toolCallId) {
        await ctx.db.patch(approval.toolCallId, {
          status: "PENDING",
          confirmationGrantedAt: now,
        });
      }

      await ctx.db.patch(approval.runId, {
        status: "RUNNING",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.agentRuntime.resumeApprovedToolCall, {
        approvalId: args.approvalId,
      });
      return true;
    }

    const finalOutput = getApprovalFinalOutput(args.decision, args.decisionReason);
    const runStatus = args.decision === "CANCELLED" ? "CANCELLED" : "FAILED";
    const toolStatus = args.decision === "CANCELLED" ? "CANCELLED" : "DENIED";
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
      status: runStatus === "CANCELLED" ? "SKIPPED" : "FAILED",
      output: finalOutput,
      startedAt: now,
      completedAt: now,
      error: runStatus === "FAILED" ? finalOutput : undefined,
    });

    await ctx.db.patch(approval.runId, {
      status: runStatus,
      updatedAt: now,
      completedAt: now,
      ...(runStatus === "CANCELLED" ? { cancelledAt: now } : {}),
      finalOutput,
      ...(runStatus === "FAILED" ? { error: finalOutput } : {}),
    });
    await updateMemoryUsageOutcomeForRun(ctx, approval.runId, runStatus);

    return true;
  },
});

export const replayRun = mutation({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
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
    const agentVersionId = run.agentVersionId || await ensureAgentVersionSnapshot(ctx, {
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

    return { runId: replayRunId };
  },
});

export const cancelRun = mutation({
  args: {
    runId: v.id("agentRuns"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
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
    return await ctx.db.insert("agentRunApprovals", {
      ...args,
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

export const completeApprovalResumeInternal = internalMutation({
  args: {
    approvalId: v.id("agentRunApprovals"),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    resultJson: v.string(),
    finalOutput: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");

    const run = await ctx.db.get(approval.runId);
    if (!run) throw new Error("Run not found");

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

    await ctx.db.insert("agentRunSteps", {
      runId: approval.runId,
      agentId: approval.agentId,
      companyId: approval.companyId,
      stepIndex: resultStepIndex + 1,
      kind: "FINAL",
      status: args.status,
      output: args.finalOutput,
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
