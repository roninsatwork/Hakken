import { internalMutation, internalAction, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { buildModelCostContext, computeCostFromMap } from "./analyticsService";
import {
  buildSystemHealthPlatformAlertDecision,
  buildSystemHealthAlertEmail,
  parsePlatformAlertRecipients,
  type AlertRuleStatus,
  type AnalyticsHealthReport,
  type BudgetHealthExample,
  type BudgetHealthReport,
  type OperationalFailureExample,
  type OperationalHealthReport,
  type SystemHealthReport,
} from "./platformAlertService";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getActiveCompanyId, requireAdmin, requireSuperAdmin } from "./authz";
import { buildEmailFromAddress, resolveEnvFromAddress } from "./emailBrandingService";
import { sendResendEmail } from "./resendEmailService";
import { adminQuery, superAdminQuery } from "./tenantFunctions";

type SystemAgentId = "system_assistant";
type SnapshotInteraction = {
  userId?: Id<"users">;
  widgetId?: Id<"widgets">;
  companyId?: Id<"companies">;
  agentId?: Id<"agents"> | SystemAgentId;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
};
type AgentLeader = { id: string; name: string; avatar: string; cost: number; interactions: number };
type UserLeader = { id: string; name: string; image: string; email: string; companyName: string; cost: number; messages: number };
type ModelMetric = { model: string; cost: number; calls: number };
type CompanyAggregate = {
  messages: number;
  inTokens: number;
  outTokens: number;
  costGBP: number;
  activeUsers: Set<string>;
  topAgents: Map<string, AgentLeader>;
  topUsers: Map<string, UserLeader>;
  modelMetrics: Map<string, ModelMetric>;
};
type UserAggregate = { messages: number; inTokens: number; outTokens: number; costGBP: number };
type MessageAnalyticsPatch = {
  companyId?: Id<"companies">;
  userId?: Id<"users">;
  agentId?: Id<"agents">;
  widgetId?: Id<"widgets">;
  analyticsDimensionsVersion?: number;
};
type SnapshotDuplicateGroup = {
  count: number;
  date: string;
  scopeId: string;
  type: "global" | "company" | "user";
};
type AnalyticsDataHealthArgs = {
  daysBack?: number;
  scope?: HealthScope;
};
type HealthScope = {
  companyId?: Id<"companies">;
  companyName?: string;
  type: "company" | "platform";
};

const SYSTEM_AGENT_ID: SystemAgentId = "system_assistant";
const DAY_MS = 24 * 60 * 60 * 1000;
const HEALTH_COLLECTION_LIMIT = 10000;
const HEALTH_EXAMPLE_LIMIT = 10;
const OVERDUE_SCHEDULE_THRESHOLD_MINUTES = 15;
const STALE_RUNNING_THRESHOLD_MINUTES = 60;
const PENDING_APPROVAL_THRESHOLD_MINUTES = 30;
const HIGH_COST_AGENT_THRESHOLD_GBP = 5;
const BUDGET_WARNING_PERCENT = 80;
const REPEATED_PROVIDER_FAILURE_THRESHOLD = 3;
const TOOL_FAILURE_THRESHOLD = 3;

function formatUtcDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getUtcDayStart(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getHealthLookbackDays(daysBack?: number) {
  if (!Number.isFinite(daysBack)) return 7;
  return Math.min(Math.max(Math.floor(daysBack ?? 7), 1), 90);
}

function truncateHealthSummary(value: string | undefined) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function formatHealthWindowStart(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function buildOperationalBucket(examples: OperationalFailureExample[], count = examples.length) {
  return {
    count,
    examples: examples.slice(0, HEALTH_EXAMPLE_LIMIT),
  };
}

function buildBudgetBucket(examples: BudgetHealthExample[], count = examples.length) {
  return {
    count,
    examples: examples.slice(0, HEALTH_EXAMPLE_LIMIT),
  };
}

function isPlatformScope(scope: HealthScope | undefined) {
  return !scope || scope.type === "platform";
}

function isInCompanyScope(scope: HealthScope | undefined, companyId: Id<"companies"> | undefined) {
  return isPlatformScope(scope) || (companyId !== undefined && scope?.companyId === companyId);
}

function getUserCompanyScope(user: Doc<"users"> | null) {
  return user ? getActiveCompanyId(user) : undefined;
}

function getMissingMessageAnalyticsPatch(message: Doc<"messages">, thread: Doc<"threads">): MessageAnalyticsPatch {
  const patch: MessageAnalyticsPatch = {};

  if (message.companyId === undefined && thread.companyId !== undefined) patch.companyId = thread.companyId;
  if (message.userId === undefined && thread.userId !== undefined) patch.userId = thread.userId;
  if (message.agentId === undefined && thread.agentId !== undefined) patch.agentId = thread.agentId;
  if (message.widgetId === undefined && thread.widgetId !== undefined) patch.widgetId = thread.widgetId;
  if (message.analyticsDimensionsVersion === undefined) patch.analyticsDimensionsVersion = 1;

  return patch;
}

function hasPatchValues(patch: MessageAnalyticsPatch) {
  return Object.keys(patch).length > 0;
}

function hasMessageAnalyticsMismatch(message: Doc<"messages">, thread: Doc<"threads">) {
  return (
    (message.companyId !== undefined && thread.companyId !== undefined && message.companyId !== thread.companyId) ||
    (message.userId !== undefined && thread.userId !== undefined && message.userId !== thread.userId) ||
    (message.agentId !== undefined && thread.agentId !== undefined && message.agentId !== thread.agentId) ||
    (message.widgetId !== undefined && thread.widgetId !== undefined && message.widgetId !== thread.widgetId)
  );
}

async function getAnalyticsDataHealthReport(ctx: QueryCtx, args: AnalyticsDataHealthArgs): Promise<AnalyticsHealthReport> {
  const daysBack = getHealthLookbackDays(args.daysBack);
  const scope = args.scope;
  const todayStartTs = getUtcDayStart(Date.now());
  const checkedDates = Array.from({ length: daysBack }, (_, index) => {
    const offsetDays = daysBack - index;
    return formatUtcDate(todayStartTs - offsetDays * DAY_MS);
  });
  const firstCheckedDate = checkedDates[0];
  const recentWindowStartTs = todayStartTs - daysBack * DAY_MS;

  const dateRows = [];
  const missingGlobalDates: string[] = [];
  const duplicateSnapshotGroups: SnapshotDuplicateGroup[] = [];
  let totalSnapshots = 0;

  for (const date of checkedDates) {
    const snapshots = scope?.type === "company" && scope.companyId
      ? await ctx.db
        .query("analyticsDailySnapshots")
        .withIndex("by_company_date", (q) => q.eq("companyId", scope.companyId).eq("date", date))
        .take(10000)
      : await ctx.db
        .query("analyticsDailySnapshots")
        .withIndex("by_date", (q) => q.eq("date", date))
        .take(10000);
    totalSnapshots += snapshots.length;

    const counts = {
      global: snapshots.filter((snapshot) => snapshot.type === "global").length,
      company: snapshots.filter((snapshot) => snapshot.type === "company").length,
      user: snapshots.filter((snapshot) => snapshot.type === "user").length,
    };

    if (isPlatformScope(scope) && counts.global === 0) {
      missingGlobalDates.push(date);
    }

    const duplicateMap = new Map<string, SnapshotDuplicateGroup>();
    snapshots.forEach((snapshot) => {
      const scopeId = snapshot.type === "company"
        ? String(snapshot.companyId ?? "missing-company")
        : snapshot.type === "user"
          ? String(snapshot.userId ?? "missing-user")
          : "global";
      const key = `${snapshot.type}:${scopeId}`;
      const existing = duplicateMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        duplicateMap.set(key, {
          count: 1,
          date,
          scopeId,
          type: snapshot.type,
        });
      }
    });
    duplicateSnapshotGroups.push(...Array.from(duplicateMap.values()).filter((group) => group.count > 1));

    dateRows.push({
      companySnapshots: counts.company,
      date,
      globalSnapshots: counts.global,
      hasGlobalSnapshot: counts.global > 0,
      userSnapshots: counts.user,
    });
  }

  const recentMessages = scope?.type === "company" && scope.companyId
    ? [
      ...await ctx.db
        .query("messages")
        .withIndex("by_company_role_created", (q) => q.eq("companyId", scope.companyId).eq("role", "assistant").gte("createdAt", recentWindowStartTs))
        .take(5000),
      ...await ctx.db
        .query("messages")
        .withIndex("by_company_role_created", (q) => q.eq("companyId", scope.companyId).eq("role", "user").gte("createdAt", recentWindowStartTs))
        .take(5000),
    ]
    : await ctx.db
      .query("messages")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", recentWindowStartTs))
      .take(10000);

  let missingDimensions = 0;
  let missingThreads = 0;
  let mismatched = 0;
  const messageExamples: string[] = [];

  for (const message of recentMessages) {
    const thread = await ctx.db.get(message.threadId);
    if (!thread) {
      missingThreads++;
      if (messageExamples.length < 20) messageExamples.push(message._id);
      continue;
    }

    const patch = getMissingMessageAnalyticsPatch(message, thread);
    const hasMissingDimensions = hasPatchValues(patch);
    const hasMismatch = hasMessageAnalyticsMismatch(message, thread);

    if (hasMissingDimensions) missingDimensions++;
    if (hasMismatch) mismatched++;
    if ((hasMissingDimensions || hasMismatch) && messageExamples.length < 20) {
      messageExamples.push(message._id);
    }
  }

  const liveAssistantMessages = scope?.type === "company" && scope.companyId
    ? await ctx.db
      .query("messages")
      .withIndex("by_company_role_created", (q) => q.eq("companyId", scope.companyId).eq("role", "assistant").gte("createdAt", todayStartTs))
      .take(10000)
    : await ctx.db
      .query("messages")
      .withIndex("by_role_created", (q) => q.eq("role", "assistant").gte("createdAt", todayStartTs))
      .take(10000);
  const liveAgentTransactions = scope?.type === "company" && scope.companyId
    ? await ctx.db
      .query("agentTransactions")
      .withIndex("by_company_created", (q) => q.eq("companyId", scope.companyId).gte("createdAt", todayStartTs))
      .take(10000)
    : await ctx.db
      .query("agentTransactions")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", todayStartTs))
      .take(10000);

  return {
    checkedDates,
    daysBack,
    liveToday: {
      agentTransactions: liveAgentTransactions.length,
      assistantMessages: liveAssistantMessages.length,
      date: formatUtcDate(todayStartTs),
    },
    messageDimensions: {
      examples: messageExamples,
      mismatched,
      missingDimensions,
      missingThreads,
      scanned: recentMessages.length,
      windowStartDate: firstCheckedDate,
    },
    snapshotCoverage: {
      dates: dateRows,
      duplicateSnapshotGroups,
      missingGlobalDates,
      totalSnapshots,
    },
  };
}

async function getTargetName(
  ctx: QueryCtx,
  args: { agentId?: Id<"agents">; workflowId?: Id<"workflows"> }
) {
  if (args.workflowId) {
    const workflow = await ctx.db.get(args.workflowId);
    return workflow?.name || "Deleted Workflow";
  }

  if (args.agentId) {
    const agent = await ctx.db.get(args.agentId);
    return agent?.name || "Deleted Agent";
  }

  return "Unknown target";
}

async function getAgentName(ctx: QueryCtx, agentId: Id<"agents">) {
  const agent = await ctx.db.get(agentId);
  return agent?.name || "Deleted Agent";
}

async function getAgentRunsByStatus(
  ctx: QueryCtx,
  args: { cutoffTs: number; scope?: HealthScope; status: Doc<"agentRuns">["status"] }
) {
  if (args.scope?.type === "company" && args.scope.companyId) {
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_company_status_started", (q) =>
        q.eq("companyId", args.scope!.companyId).eq("status", args.status).lte("startedAt", args.cutoffTs)
      )
      .order("asc")
      .take(HEALTH_COLLECTION_LIMIT);
  }

  return await ctx.db
    .query("agentRuns")
    .withIndex("by_status_started", (q) => q.eq("status", args.status).lte("startedAt", args.cutoffTs))
    .order("asc")
    .take(HEALTH_COLLECTION_LIMIT);
}

async function getRecentAgentTransactions(ctx: QueryCtx, args: { scope?: HealthScope; windowStartTs: number }) {
  if (args.scope?.type === "company" && args.scope.companyId) {
    return await ctx.db
      .query("agentTransactions")
      .withIndex("by_company_created", (q) => q.eq("companyId", args.scope!.companyId).gte("createdAt", args.windowStartTs))
      .order("desc")
      .take(HEALTH_COLLECTION_LIMIT);
  }

  return await ctx.db
    .query("agentTransactions")
    .withIndex("by_createdAt", (q) => q.gte("createdAt", args.windowStartTs))
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
}

async function executionMatchesScope(ctx: QueryCtx, execution: Doc<"workflowExecutions">, scope: HealthScope | undefined) {
  if (isPlatformScope(scope)) return true;
  if (!scope?.companyId) return false;
  if (execution.agentRunId) {
    const run = await ctx.db.get(execution.agentRunId);
    if (run?.companyId === scope.companyId) return true;
  }
  if (execution.agentId) {
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_agent_started", (q) => q.eq("agentId", execution.agentId!))
      .order("desc")
      .first();
    if (run?.companyId === scope.companyId) return true;
  }
  const starter = await ctx.db.get(execution.startedBy);
  return getUserCompanyScope(starter) === scope.companyId;
}

async function filterExecutionsForScope(
  ctx: QueryCtx,
  executions: Doc<"workflowExecutions">[],
  scope: HealthScope | undefined
) {
  const filtered: Doc<"workflowExecutions">[] = [];
  for (const execution of executions) {
    if (await executionMatchesScope(ctx, execution, scope)) filtered.push(execution);
  }
  return filtered;
}

async function scheduleMatchesScope(ctx: QueryCtx, schedule: Doc<"schedules">, scope: HealthScope | undefined) {
  if (isPlatformScope(scope)) return true;
  if (!scope?.companyId) return false;
  if (schedule.agentId) {
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_agent_started", (q) => q.eq("agentId", schedule.agentId!))
      .order("desc")
      .first();
    if (run?.companyId === scope.companyId) return true;
  }
  const creator = await ctx.db.get(schedule.createdBy);
  return getUserCompanyScope(creator) === scope.companyId;
}

async function filterSchedulesForScope(ctx: QueryCtx, schedules: Doc<"schedules">[], scope: HealthScope | undefined) {
  const filtered: Doc<"schedules">[] = [];
  for (const schedule of schedules) {
    if (await scheduleMatchesScope(ctx, schedule, scope)) filtered.push(schedule);
  }
  return filtered;
}

async function getOperationalHealthReport(ctx: QueryCtx, args: { daysBack?: number; scope?: HealthScope }): Promise<OperationalHealthReport> {
  const daysBack = getHealthLookbackDays(args.daysBack);
  const scope = args.scope;
  const now = Date.now();
  const windowStartTs = now - daysBack * DAY_MS;
  const staleRunningCutoffTs = now - STALE_RUNNING_THRESHOLD_MINUTES * 60 * 1000;
  const overdueScheduleCutoffTs = now - OVERDUE_SCHEDULE_THRESHOLD_MINUTES * 60 * 1000;

  const recentAgentLogs = await ctx.db
    .query("agentLogs")
    .withIndex("by_createdAt", (q) => q.gte("createdAt", windowStartTs))
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
  const agentFailureLogs = recentAgentLogs.filter((log) =>
    log.interactionType === "ERROR" && isInCompanyScope(scope, log.companyId)
  );
  const agentFailures = await Promise.all(
    agentFailureLogs.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (log): Promise<OperationalFailureExample> => {
      const agent = await ctx.db.get(log.agentId);
      return {
        id: log._id,
        targetId: log.agentId,
        label: log.interactionType,
        occurredAt: log.createdAt,
        summary: truncateHealthSummary(log.responseContent),
        targetName: agent?.name || "Deleted Agent",
        targetType: "agent",
      };
    })
  );

  const recentAgentTransactions = await getRecentAgentTransactions(ctx, { scope, windowStartTs });
  const failedTransactions = recentAgentTransactions.filter((transaction) => transaction.status === "FAILED");
  const failedAgentTransactions = await Promise.all(
    failedTransactions.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (transaction): Promise<OperationalFailureExample> => {
      const agent = await ctx.db.get(transaction.agentId);
      return {
        id: transaction._id,
        targetId: transaction.agentId,
        label: transaction.actionContext,
        occurredAt: transaction.createdAt,
        summary: truncateHealthSummary([
          transaction.providerKey,
          transaction.providerModelId || transaction.modelUsed,
        ].filter(Boolean).join(" / ")),
        targetName: agent?.name || "Deleted Agent",
        targetType: "agent",
      };
    })
  );

  const staleAgentRunCutoffTs = now - STALE_RUNNING_THRESHOLD_MINUTES * 60 * 1000;
  const staleAgentRunRows = await getAgentRunsByStatus(ctx, {
    cutoffTs: staleAgentRunCutoffTs,
    scope,
    status: "RUNNING",
  });
  const staleQueuedAgentRunRows = await getAgentRunsByStatus(ctx, {
    cutoffTs: staleAgentRunCutoffTs,
    scope,
    status: "QUEUED",
  });
  const staleAgentRunCandidates = [...staleAgentRunRows, ...staleQueuedAgentRunRows];
  const staleAgentRuns = await Promise.all(
    staleAgentRunCandidates.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (run): Promise<OperationalFailureExample> => ({
      id: run._id,
      label: run.status,
      targetId: run.agentId,
      occurredAt: run.startedAt,
      summary: `${Math.max(1, Math.floor((now - run.startedAt) / 60000))} minutes old | ${truncateHealthSummary(run.objective)}`,
      targetName: await getAgentName(ctx, run.agentId),
      targetType: "agent",
    }))
  );

  const pendingApprovalCutoffTs = now - PENDING_APPROVAL_THRESHOLD_MINUTES * 60 * 1000;
  const pendingApprovalRows = scope?.type === "company" && scope.companyId
    ? await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_company_status_requested", (q) =>
        q.eq("companyId", scope.companyId).eq("status", "PENDING").lte("requestedAt", pendingApprovalCutoffTs)
      )
      .order("asc")
      .take(HEALTH_COLLECTION_LIMIT)
    : await ctx.db
      .query("agentRunApprovals")
      .withIndex("by_status_requested", (q) => q.eq("status", "PENDING").lte("requestedAt", pendingApprovalCutoffTs))
      .order("asc")
      .take(HEALTH_COLLECTION_LIMIT);
  // Workflow approvals count here too.
  //
  // They are a separate mechanism with their own table, and this signal only ever
  // looked at agent runs — so a workflow halted on a Human Approval node was
  // invisible to the one place on the platform that reports things waiting on a
  // person. Company-scoped reads rely on `workflowExecutionSteps.companyId`, which
  // is copied from the parent execution precisely because a cross-execution query
  // cannot reach through to it.
  const haltedWorkflowRows = (await ctx.db
    .query("workflowExecutionSteps")
    .withIndex("by_status_started", (q) =>
      q.eq("status", "PENDING_APPROVAL").lte("startedAt", pendingApprovalCutoffTs))
    .order("asc")
    .take(HEALTH_COLLECTION_LIMIT))
    .filter((step) => scope?.type === "company" && scope.companyId
      ? step.companyId === scope.companyId
      : true);

  const pendingApprovals = await Promise.all([
    ...pendingApprovalRows.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (approval): Promise<OperationalFailureExample> => ({
      id: approval._id,
      targetId: approval.agentId,
      label: approval.status,
      occurredAt: approval.requestedAt,
      summary: truncateHealthSummary(approval.message),
      targetName: await getAgentName(ctx, approval.agentId),
      targetType: "agent" as const,
    })),
    ...haltedWorkflowRows.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (step): Promise<OperationalFailureExample> => ({
      id: step._id,
      label: "PENDING_APPROVAL",
      occurredAt: step.startedAt,
      summary: truncateHealthSummary(`Workflow step '${step.nodeId}' is waiting for a decision.`),
      targetName: step.nodeId,
      targetType: "workflow" as const,
    })),
  ]);

  const recentFailedToolCalls = await ctx.db
    .query("agentToolCalls")
    .withIndex("by_status_started", (q) => q.eq("status", "FAILED").gte("startedAt", windowStartTs))
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
  const scopedFailedToolCalls = recentFailedToolCalls.filter((toolCall) => isInCompanyScope(scope, toolCall.companyId));
  const failedToolCalls = await Promise.all(
    scopedFailedToolCalls.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (toolCall): Promise<OperationalFailureExample> => ({
      id: toolCall._id,
      targetId: toolCall.agentId,
      label: toolCall.normalizedToolName,
      occurredAt: toolCall.completedAt ?? toolCall.startedAt,
      summary: truncateHealthSummary(toolCall.error ?? toolCall.handlerMapping),
      targetName: await getAgentName(ctx, toolCall.agentId),
      targetType: "agent",
    }))
  );

  const providerFailureMap = new Map<string, { count: number; lastSeenAt: number; models: Set<string> }>();
  for (const transaction of failedTransactions) {
    const providerKey = transaction.providerKey || "unknown-provider";
    const existing = providerFailureMap.get(providerKey) ?? {
      count: 0,
      lastSeenAt: transaction.createdAt,
      models: new Set<string>(),
    };
    existing.count += 1;
    existing.lastSeenAt = Math.max(existing.lastSeenAt, transaction.createdAt);
    existing.models.add(transaction.providerModelId || transaction.modelUsed);
    providerFailureMap.set(providerKey, existing);
  }
  const providerFailureRows = Array.from(providerFailureMap.entries())
    .sort((a, b) => b[1].count - a[1].count);
  const providerFailures = providerFailureRows.slice(0, HEALTH_EXAMPLE_LIMIT).map(([providerKey, row]): OperationalFailureExample => ({
    id: providerKey,
    label: providerKey,
    occurredAt: row.lastSeenAt,
    summary: `${row.count} failed transaction${row.count === 1 ? "" : "s"} | ${Array.from(row.models).slice(0, 3).join(", ")}`,
    targetName: providerKey,
  }));

  const costByAgent = new Map<Id<"agents">, { costGBP: number; transactions: number; lastSeenAt: number }>();
  for (const transaction of recentAgentTransactions) {
    const existing = costByAgent.get(transaction.agentId) ?? {
      costGBP: 0,
      transactions: 0,
      lastSeenAt: transaction.createdAt,
    };
    existing.costGBP += transaction.costGBP || 0;
    existing.transactions += 1;
    existing.lastSeenAt = Math.max(existing.lastSeenAt, transaction.createdAt);
    costByAgent.set(transaction.agentId, existing);
  }
  const highCostRows = Array.from(costByAgent.entries())
    .filter(([, row]) => row.costGBP >= HIGH_COST_AGENT_THRESHOLD_GBP)
    .sort((a, b) => b[1].costGBP - a[1].costGBP);
  const highCostAgents = await Promise.all(
    highCostRows.slice(0, HEALTH_EXAMPLE_LIMIT).map(async ([agentId, row]): Promise<OperationalFailureExample> => ({
      id: agentId,
      label: "Cost threshold",
      occurredAt: row.lastSeenAt,
      summary: `$${row.costGBP.toFixed(2)} across ${row.transactions} transaction${row.transactions === 1 ? "" : "s"}`,
      targetName: await getAgentName(ctx, agentId),
      targetType: "agent",
    }))
  );

  const recentScheduledExecutions = await ctx.db
    .query("workflowExecutions")
    .withIndex("by_startedAt", (q) => q.gte("startedAt", windowStartTs))
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
  const scopedRecentScheduledExecutions = isPlatformScope(scope)
    ? recentScheduledExecutions
    : await filterExecutionsForScope(ctx, recentScheduledExecutions, scope);
  const failedScheduleRuns = scopedRecentScheduledExecutions.filter((execution) =>
    execution.triggerType === "SCHEDULE" && execution.status === "FAILED"
  );
  const failedScheduledExecutions = await Promise.all(
    failedScheduleRuns.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (execution): Promise<OperationalFailureExample> => ({
      id: execution._id,
      label: execution.triggerType,
      occurredAt: execution.completedAt ?? execution.startedAt,
      summary: truncateHealthSummary(execution.state),
      targetName: await getTargetName(ctx, { agentId: execution.agentId, workflowId: execution.workflowId }),
      targetType: execution.workflowId ? "workflow" : "agent",
    }))
  );

  const latestExecutions = await ctx.db
    .query("workflowExecutions")
    .withIndex("by_startedAt")
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
  const scopedLatestExecutions = isPlatformScope(scope)
    ? latestExecutions
    : await filterExecutionsForScope(ctx, latestExecutions, scope);
  const staleScheduleRuns = scopedLatestExecutions.filter((execution) =>
    execution.triggerType === "SCHEDULE" &&
    execution.status === "RUNNING" &&
    execution.startedAt <= staleRunningCutoffTs
  );
  const staleRunningScheduledExecutions = await Promise.all(
    staleScheduleRuns.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (execution): Promise<OperationalFailureExample> => ({
      id: execution._id,
      label: execution.triggerType,
      occurredAt: execution.startedAt,
      summary: `${Math.max(1, Math.floor((now - execution.startedAt) / 60000))} minutes old`,
      targetName: await getTargetName(ctx, { agentId: execution.agentId, workflowId: execution.workflowId }),
      targetType: execution.workflowId ? "workflow" : "agent",
    }))
  );

  const overdueScheduleCandidates = await ctx.db
    .query("schedules")
    .withIndex("by_active_next_run", (q) => q.eq("isActive", true).lte("nextRunAt", overdueScheduleCutoffTs))
    .order("asc")
    .take(HEALTH_COLLECTION_LIMIT);
  const scopedOverdueScheduleCandidates = isPlatformScope(scope)
    ? overdueScheduleCandidates
    : await filterSchedulesForScope(ctx, overdueScheduleCandidates, scope);
  const overdueScheduleRows = scopedOverdueScheduleCandidates.filter((schedule) => schedule.nextRunAt !== undefined);
  const overdueSchedules = await Promise.all(
    overdueScheduleRows.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (schedule): Promise<OperationalFailureExample> => ({
      id: schedule._id,
      label: schedule.name,
      occurredAt: schedule.nextRunAt,
      summary: schedule.lastRunTs ? `Last run ${new Date(schedule.lastRunTs).toISOString()}` : "Never run",
      targetName: await getTargetName(ctx, { agentId: schedule.agentId, workflowId: schedule.workflowId }),
      targetType: "schedule",
    }))
  );

  const activeScheduleRows = await ctx.db
    .query("schedules")
    .withIndex("by_createdAt")
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
  const scopedActiveScheduleRows = isPlatformScope(scope)
    ? activeScheduleRows
    : await filterSchedulesForScope(ctx, activeScheduleRows, scope);
  const missingNextRunRows = scopedActiveScheduleRows.filter((schedule) => schedule.isActive && schedule.nextRunAt === undefined);
  const schedulesMissingNextRun = await Promise.all(
    missingNextRunRows.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (schedule): Promise<OperationalFailureExample> => ({
      id: schedule._id,
      label: schedule.name,
      occurredAt: schedule.createdAt,
      summary: schedule.intervalStr,
      targetName: await getTargetName(ctx, { agentId: schedule.agentId, workflowId: schedule.workflowId }),
      targetType: "schedule",
    }))
  );

  return {
    agentFailures: buildOperationalBucket(agentFailures, agentFailureLogs.length),
    failedAgentTransactions: buildOperationalBucket(failedAgentTransactions, failedTransactions.length),
    failedToolCalls: buildOperationalBucket(failedToolCalls, scopedFailedToolCalls.length),
    failedScheduledExecutions: buildOperationalBucket(failedScheduledExecutions, failedScheduleRuns.length),
    highCostAgents: buildOperationalBucket(highCostAgents, highCostRows.length),
    overdueSchedules: buildOperationalBucket(overdueSchedules, overdueScheduleRows.length),
    pendingApprovals: buildOperationalBucket(
      pendingApprovals,
      pendingApprovalRows.length + haltedWorkflowRows.length,
    ),
    providerFailures: buildOperationalBucket(providerFailures, failedTransactions.length),
    schedulesMissingNextRun: buildOperationalBucket(schedulesMissingNextRun, missingNextRunRows.length),
    staleAgentRuns: buildOperationalBucket(staleAgentRuns, staleAgentRunCandidates.length),
    staleRunningScheduledExecutions: buildOperationalBucket(staleRunningScheduledExecutions, staleScheduleRuns.length),
  };
}

async function getRecentAgentRunsForBudget(ctx: QueryCtx, args: { scope?: HealthScope; windowStartTs: number }) {
  if (args.scope?.type === "company" && args.scope.companyId) {
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_company_started", (q) => q.eq("companyId", args.scope!.companyId).gte("startedAt", args.windowStartTs))
      .order("desc")
      .take(HEALTH_COLLECTION_LIMIT);
  }

  const statuses: Doc<"agentRuns">["status"][] = ["QUEUED", "RUNNING", "PENDING_APPROVAL", "SUCCESS", "FAILED", "CANCELLED"];
  const rows = await Promise.all(statuses.map((status) =>
    ctx.db
      .query("agentRuns")
      .withIndex("by_status_started", (q) => q.eq("status", status).gte("startedAt", args.windowStartTs))
      .order("desc")
      .take(Math.ceil(HEALTH_COLLECTION_LIMIT / statuses.length))
  ));

  return rows.flat().sort((a, b) => b.startedAt - a.startedAt).slice(0, HEALTH_COLLECTION_LIMIT);
}

function getBudgetPercent(used: number, limit: number) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return (used / limit) * 100;
}

async function getBudgetHealthReport(ctx: QueryCtx, args: { daysBack?: number; scope?: HealthScope }): Promise<BudgetHealthReport> {
  const daysBack = getHealthLookbackDays(args.daysBack);
  const windowStartTs = Date.now() - daysBack * DAY_MS;
  const recentRuns = await getRecentAgentRunsForBudget(ctx, { scope: args.scope, windowStartTs });
  const agentBudgetRows = recentRuns
    .filter((run) => run.maxCostGBP !== undefined && run.maxCostGBP > 0 && getBudgetPercent(run.costGBP ?? 0, run.maxCostGBP) >= BUDGET_WARNING_PERCENT)
    .sort((a, b) => getBudgetPercent(b.costGBP ?? 0, b.maxCostGBP ?? 0) - getBudgetPercent(a.costGBP ?? 0, a.maxCostGBP ?? 0));
  const agentCostBudgets = await Promise.all(
    agentBudgetRows.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (run): Promise<BudgetHealthExample> => {
      const used = run.costGBP ?? 0;
      const limit = run.maxCostGBP ?? 0;
      return {
        id: run._id,
        limit,
        occurredAt: run.completedAt ?? run.updatedAt,
        percentUsed: getBudgetPercent(used, limit),
        summary: `$${used.toFixed(2)} of $${limit.toFixed(2)} run budget`,
        targetName: await getAgentName(ctx, run.agentId),
        targetType: "agent",
        used,
      };
    })
  );

  const companies = args.scope?.type === "company" && args.scope.companyId
    ? [await ctx.db.get(args.scope.companyId)].filter((company): company is Doc<"companies"> => Boolean(company))
    : await ctx.db.query("companies").take(HEALTH_COLLECTION_LIMIT);
  const tenantBudgetCandidates: Array<{ company: Doc<"companies">; limit: number; percentUsed: number; plan: Doc<"plans">; used: number }> = [];
  for (const company of companies) {
    if (!company.planId) continue;
    const plan = await ctx.db.get(company.planId);
    if (!plan || plan.messageLimit <= 0) continue;
    const used = company.messagesUsedThisPeriod ?? 0;
    const percentUsed = getBudgetPercent(used, plan.messageLimit);
    if (percentUsed >= BUDGET_WARNING_PERCENT) {
      tenantBudgetCandidates.push({ company, limit: plan.messageLimit, percentUsed, plan, used });
    }
  }
  tenantBudgetCandidates.sort((a, b) => b.percentUsed - a.percentUsed);
  const tenantMessageBudgets = tenantBudgetCandidates.slice(0, HEALTH_EXAMPLE_LIMIT).map(({ company, limit, percentUsed, plan, used }): BudgetHealthExample => ({
    id: company._id,
    limit,
    occurredAt: company.createdAt,
    percentUsed,
    summary: `${used.toLocaleString("en-GB")} of ${limit.toLocaleString("en-GB")} messages on ${plan.name}`,
    targetName: company.name,
    targetType: "company",
    used,
  }));

  return {
    agentCostBudgets: buildBudgetBucket(agentCostBudgets, agentBudgetRows.length),
    tenantMessageBudgets: buildBudgetBucket(tenantMessageBudgets, tenantBudgetCandidates.length),
  };
}

function getRuleStatus(count: number, warningThreshold: number): AlertRuleStatus["status"] {
  if (count <= 0) return "ok";
  return count >= warningThreshold ? "critical" : "warning";
}

function getExampleDetails(examples: Array<{ summary?: string; targetName?: string; id: string }>) {
  return examples.slice(0, 5).map((example) =>
    [example.targetName, example.summary, example.id].filter(Boolean).join(" | ")
  );
}

function buildAlertRules(args: { budgetHealth: BudgetHealthReport; operations: OperationalHealthReport }): AlertRuleStatus[] {
  const { budgetHealth, operations } = args;
  const costPressureCount = operations.highCostAgents.count + budgetHealth.agentCostBudgets.count + budgetHealth.tenantMessageBudgets.count;

  return [
    {
      count: operations.staleAgentRuns.count,
      details: getExampleDetails(operations.staleAgentRuns.examples),
      key: "stuckRuns",
      label: "Stuck runs",
      nextAction: "Open the run timeline, then cancel, replay, or repair the provider/tool path.",
      status: getRuleStatus(operations.staleAgentRuns.count, 1),
      threshold: `Queued or running longer than ${STALE_RUNNING_THRESHOLD_MINUTES} minutes`,
    },
    {
      count: operations.pendingApprovals.count,
      details: getExampleDetails(operations.pendingApprovals.examples),
      key: "staleApprovals",
      label: "Stale approvals",
      nextAction: "Review pending approvals and tune approval policy if they are repeatedly stranded.",
      status: getRuleStatus(operations.pendingApprovals.count, 1),
      threshold: `Pending longer than ${PENDING_APPROVAL_THRESHOLD_MINUTES} minutes`,
    },
    {
      count: operations.providerFailures.count,
      details: getExampleDetails(operations.providerFailures.examples),
      key: "repeatedProviderFailures",
      label: "Repeated provider failures",
      nextAction: "Check provider health, credentials, model defaults, and recent deploys.",
      status: getRuleStatus(operations.providerFailures.count, REPEATED_PROVIDER_FAILURE_THRESHOLD),
      threshold: `${REPEATED_PROVIDER_FAILURE_THRESHOLD}+ failed provider-backed transactions in ${HEALTH_COLLECTION_LIMIT.toLocaleString("en-GB")} checked rows`,
    },
    {
      count: costPressureCount,
      details: [
        ...getExampleDetails(operations.highCostAgents.examples),
        ...budgetHealth.agentCostBudgets.examples.slice(0, 3).map((example) => `${example.targetName} | ${example.percentUsed.toFixed(0)}% run budget | ${example.id}`),
        ...budgetHealth.tenantMessageBudgets.examples.slice(0, 3).map((example) => `${example.targetName} | ${example.percentUsed.toFixed(0)}% message budget | ${example.id}`),
      ].slice(0, 5),
      key: "costSpikes",
      label: "Cost and budget pressure",
      nextAction: "Review model choice, run budget, tenant plan usage, and retrieval/tool breadth.",
      status: getRuleStatus(costPressureCount, 1),
      threshold: `Agent spend above $${HIGH_COST_AGENT_THRESHOLD_GBP.toFixed(2)} or any budget above ${BUDGET_WARNING_PERCENT}%`,
    },
    {
      count: operations.failedToolCalls.count,
      details: getExampleDetails(operations.failedToolCalls.examples),
      key: "toolFailures",
      label: "Tool failure rate",
      nextAction: "Inspect connector diagnostics, policy denials, arguments, and tenant credentials.",
      status: getRuleStatus(operations.failedToolCalls.count, TOOL_FAILURE_THRESHOLD),
      threshold: `${TOOL_FAILURE_THRESHOLD}+ failed tool calls in the health window`,
    },
  ];
}

async function getSystemHealthReport(ctx: QueryCtx, args: AnalyticsDataHealthArgs): Promise<SystemHealthReport> {
  const daysBack = getHealthLookbackDays(args.daysBack);
  const scope = args.scope ?? { type: "platform" as const };
  const checkedAt = Date.now();
  const windowStartTs = checkedAt - daysBack * DAY_MS;
  const analytics = await getAnalyticsDataHealthReport(ctx, { daysBack, scope });
  const operations = await getOperationalHealthReport(ctx, { daysBack, scope });
  const budgetHealth = await getBudgetHealthReport(ctx, { daysBack, scope });
  const alertRules = buildAlertRules({ budgetHealth, operations });

  return {
    analytics,
    alertRules,
    budgetHealth,
    checkedAt,
    checkedDate: formatHealthWindowStart(checkedAt),
    daysBack,
    operations,
    highCostAgentThresholdGBP: HIGH_COST_AGENT_THRESHOLD_GBP,
    overdueScheduleThresholdMinutes: OVERDUE_SCHEDULE_THRESHOLD_MINUTES,
    pendingApprovalThresholdMinutes: PENDING_APPROVAL_THRESHOLD_MINUTES,
    scope: {
      companyId: scope.companyId,
      companyName: scope.companyName,
      type: scope.type,
    },
    staleRunningThresholdMinutes: STALE_RUNNING_THRESHOLD_MINUTES,
    windowStartDate: formatHealthWindowStart(windowStartTs),
    windowStartTs,
  };
}

export const backfillMessageAnalyticsDimensions = internalMutation({
  args: {
    paginationOpts: paginationOptsValidator,
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_createdAt")
      .order("asc")
      .paginate(args.paginationOpts);

    let patched = 0;
    let patchCandidates = 0;
    let skippedAlreadyComplete = 0;
    let skippedMissingThread = 0;
    let mismatched = 0;

    for (const message of page.page) {
      const thread = await ctx.db.get(message.threadId);
      if (!thread) {
        skippedMissingThread++;
        continue;
      }

      if (hasMessageAnalyticsMismatch(message, thread)) {
        mismatched++;
      }

      const patch = getMissingMessageAnalyticsPatch(message, thread);
      if (!hasPatchValues(patch)) {
        skippedAlreadyComplete++;
        continue;
      }

      patchCandidates++;
      if (!args.dryRun) {
        await ctx.db.patch(message._id, patch);
        patched++;
      }
    }

    return {
      scanned: page.page.length,
      patchCandidates,
      patched,
      skippedAlreadyComplete,
      skippedMissingThread,
      mismatched,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      dryRun: args.dryRun === true,
    };
  },
});

export const validateMessageAnalyticsDimensions = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_createdAt")
      .order("asc")
      .paginate(args.paginationOpts);

    let missingDimensions = 0;
    let missingThreads = 0;
    let mismatched = 0;
    const examples: string[] = [];

    for (const message of page.page) {
      const thread = await ctx.db.get(message.threadId);
      if (!thread) {
        missingThreads++;
        if (examples.length < 20) examples.push(message._id);
        continue;
      }

      const patch = getMissingMessageAnalyticsPatch(message, thread);
      const hasMissingDimensions = hasPatchValues(patch);
      const hasMismatch = hasMessageAnalyticsMismatch(message, thread);

      if (hasMissingDimensions) missingDimensions++;
      if (hasMismatch) mismatched++;
      if ((hasMissingDimensions || hasMismatch) && examples.length < 20) {
        examples.push(message._id);
      }
    }

    return {
      scanned: page.page.length,
      missingDimensions,
      missingThreads,
      mismatched,
      examples,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const getAnalyticsDataHealth = internalQuery({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await getAnalyticsDataHealthReport(ctx, args);
  },
});

export const getSystemHealth = internalQuery({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await getSystemHealthReport(ctx, args);
  },
});

export const getAnalyticsDataHealthForAdmin = superAdminQuery({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await getAnalyticsDataHealthReport(ctx, args);
  },
});

export const getSystemHealthForAdmin = adminQuery({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const current = ctx;
    if (current.user.role === "SUPER_ADMIN") {
      return await getSystemHealthReport(ctx, { ...args, scope: { type: "platform" } });
    }

    const companyId = getActiveCompanyId(current.user);
    if (!companyId) throw new Error("No active company");
    const company = await ctx.db.get(companyId);
    return await getSystemHealthReport(ctx, {
      ...args,
      scope: {
        companyId,
        companyName: company?.name,
        type: "company",
      },
    });
  },
});

export const generateDailySnapshots = internalMutation({
  args: { 
    targetDateStr: v.optional(v.string()), // "YYYY-MM-DD", defaults to yesterday
  },
  handler: async (ctx, args) => {
    const now = new Date();
    
    // Determine the target bounds. Default: Yesterday 00:00:00 to 23:59:59 UTC
    let startTs: number;
    let endTs: number;
    let dateString: string;

    if (args.targetDateStr) {
      const parts = args.targetDateStr.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(year, month, day));
      startTs = d.getTime();
      endTs = startTs + (24 * 60 * 60 * 1000) - 1;
      dateString = args.targetDateStr;
    } else {
      const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      startTs = yesterday.getTime();
      endTs = startTs + (24 * 60 * 60 * 1000) - 1;
      dateString = yesterday.toISOString().split("T")[0];
    }

    // Guard: Prevent duplicate snapshot generation for the same date
    const existing = await ctx.db.query("analyticsDailySnapshots")
        .withIndex("by_date", q => q.eq("date", dateString))
        .first();
    if (existing) {
        console.log(`[Analytics] Snapshots for ${dateString} already exist. Skipping.`);
        return;
    }

    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);

    // Fetch all interaction data for the 24h window
    const rawMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", startTs))
      .filter(q => q.lte(q.field("createdAt"), endTs))
      .take(10000);

    const agentTxs = await ctx.db.query("agentTransactions")
      .withIndex("by_createdAt", q => q.gte("createdAt", startTs))
      .filter(q => q.lte(q.field("createdAt"), endTs))
      .take(10000);

    if (rawMessages.length === 0 && agentTxs.length === 0) {
       console.log(`[Analytics] No activity on ${dateString}. Creating empty global snapshot.`);
       await ctx.db.insert("analyticsDailySnapshots", {
           date: dateString,
           type: "global",
           metrics: { totalMessages: 0, totalInputTokens: 0, totalOutputTokens: 0, costGBP: 0, activeUsersCount: 0 },
           uniqueUserIds: [],
       });
       return;
    }

    const threadMap = new Map<Id<"threads">, Doc<"threads"> | null>();
    for (const threadId of new Set(rawMessages.map((message) => message.threadId))) {
      threadMap.set(threadId, await ctx.db.get(threadId));
    }

    const observedUserIds = new Set<Id<"users">>();
    const observedCompanyIds = new Set<Id<"companies">>();
    const observedAgentIds = new Set<Id<"agents">>();

    rawMessages.forEach((message) => {
      const thread = threadMap.get(message.threadId);
      const userId = message.userId ?? thread?.userId;
      const companyId = message.companyId ?? thread?.companyId;
      const agentId = message.agentId ?? thread?.agentId;

      if (userId) observedUserIds.add(userId);
      if (companyId) observedCompanyIds.add(companyId);
      if (agentId) observedAgentIds.add(agentId);
    });

    agentTxs.forEach((transaction) => {
      if (transaction.userId) observedUserIds.add(transaction.userId);
      if (transaction.companyId) observedCompanyIds.add(transaction.companyId);
      if (transaction.agentId) observedAgentIds.add(transaction.agentId);
    });

    const userMap = new Map<Id<"users">, Doc<"users">>();
    for (const userId of observedUserIds) {
      const user = await ctx.db.get(userId);
      if (user) {
        userMap.set(userId, user);
        if (user.companyId) observedCompanyIds.add(user.companyId);
      }
    }

    const companyMap = new Map<Id<"companies">, Doc<"companies">>();
    for (const companyId of observedCompanyIds) {
      const company = await ctx.db.get(companyId);
      if (company) companyMap.set(companyId, company);
    }

    const agentMap = new Map<Id<"agents">, Doc<"agents">>();
    for (const agentId of observedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (agent) agentMap.set(agentId, agent);
    }

    const unifiedInteractions: SnapshotInteraction[] = [
       ...rawMessages.map(m => {
          const thread = threadMap.get(m.threadId);
          return {
          userId: m.userId ?? thread?.userId,
          widgetId: m.widgetId ?? thread?.widgetId,
          companyId: m.companyId ?? thread?.companyId,
          agentId: m.agentId ?? thread?.agentId ?? SYSTEM_AGENT_ID,
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
       };
       }),
       ...agentTxs.map(t => ({
          userId: t.userId,
          widgetId: undefined,
          companyId: t.companyId,
          agentId: t.agentId,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          modelUsed: t.modelUsed || defaultModelId,
       }))
    ];

    // Data structures for aggregation
    const globalMetrics = { messages: 0, inTokens: 0, outTokens: 0, costGBP: 0, activeUsers: new Set<string>() };
    const globalTopAgents = new Map<string, { id: string, name: string, avatar: string, cost: number, interactions: number }>();
    const globalTopUsers = new Map<string, { id: string, name: string, image: string, email: string, companyName: string, cost: number, messages: number }>();
    const globalModelMetrics = new Map<string, { model: string, cost: number, calls: number }>();

    const companyAggregates = new Map<Id<"companies">, CompanyAggregate>(); // companyId -> metrics
    const userAggregates = new Map<Id<"users">, UserAggregate>(); // userId -> metrics

    // Build the "Widget User" fallback leader profile
    const widgetUserLeader: UserLeader = {
        id: "WIDGET_USER_GROUP",
        name: "Widget User",
        image: "https://api.dicebear.com/7.x/shapes/svg?seed=WidgetUser",
        companyName: "External Web Traffic",
        email: "anonymous@widget",
        cost: 0,
        messages: 0
    };

    // Iterate once through everything
    for (const msg of unifiedInteractions) {
       const inputs = msg.inputTokens;
       const outputs = msg.outputTokens;
       const costGBP = computeCostFromMap(msg.modelUsed, inputs, outputs, modelMap);

       const activeCompanyId = msg.companyId || (msg.userId ? userMap.get(msg.userId)?.companyId : undefined);

       // 1. GLOBAL TALLIES
       globalMetrics.messages++;
       globalMetrics.inTokens += inputs;
       globalMetrics.outTokens += outputs;
       globalMetrics.costGBP += costGBP;
       if (msg.userId) globalMetrics.activeUsers.add(msg.userId);
       
       let gm = globalModelMetrics.get(msg.modelUsed);
       if (!gm) { gm = { model: msg.modelUsed, cost: 0, calls: 0 }; globalModelMetrics.set(msg.modelUsed, gm); }
       gm.cost += costGBP;
       gm.calls++;

       // Global Top Agents
       if (msg.agentId) {
           let ga = globalTopAgents.get(msg.agentId);
           if (!ga) {
               ga = msg.agentId === "system_assistant" 
                  ? { id: "system_assistant", name: "Platform Assistant", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant", cost: 0, interactions: 0 }
                   : { id: msg.agentId, name: agentMap.get(msg.agentId)?.name || "Unknown", avatar: agentMap.get(msg.agentId)?.avatar || "", cost: 0, interactions: 0 };
               globalTopAgents.set(msg.agentId, ga);
           }
           ga.cost += costGBP;
           ga.interactions++;
       }

       // Global Top Users
       if (msg.userId) {
           const isWidget = !!msg.widgetId;
           const targetLeaderId = (!isWidget && userMap.has(msg.userId)) ? msg.userId : "WIDGET_USER_GROUP";
           let gu = globalTopUsers.get(targetLeaderId);
           if (!gu) {
               if (targetLeaderId === "WIDGET_USER_GROUP") {
                   gu = { ...widgetUserLeader };
               } else {
                   const uObj = userMap.get(targetLeaderId);
                   gu = {
                       id: targetLeaderId,
                       name: uObj?.name || "Unknown",
                       image: uObj?.image || "",
                       email: uObj?.email || "",
                       companyName: activeCompanyId ? companyMap.get(activeCompanyId)?.name || "Independent" : "Independent",
                       cost: 0,
                       messages: 0
                   };
               }
               globalTopUsers.set(targetLeaderId, gu);
           }
           gu.cost += costGBP;
           gu.messages++;
       }

       // 2. COMPANY TALLIES
       if (activeCompanyId) {
           let cAgg = companyAggregates.get(activeCompanyId);
           if (!cAgg) {
               cAgg = { messages: 0, inTokens: 0, outTokens: 0, costGBP: 0, activeUsers: new Set<string>(), topAgents: new Map(), topUsers: new Map(), modelMetrics: new Map<string, ModelMetric>() };
               companyAggregates.set(activeCompanyId, cAgg);
           }
           cAgg.messages++;
           cAgg.inTokens += inputs;
           cAgg.outTokens += outputs;
           cAgg.costGBP += costGBP;
           if (msg.userId) cAgg.activeUsers.add(msg.userId);

           let cm = cAgg.modelMetrics.get(msg.modelUsed);
           if (!cm) { cm = { model: msg.modelUsed, cost: 0, calls: 0 }; cAgg.modelMetrics.set(msg.modelUsed, cm); }
           cm.cost += costGBP;
           cm.calls++;

           if (msg.agentId) {
               let ca = cAgg.topAgents.get(msg.agentId);
               if (!ca) {
                  ca = msg.agentId === "system_assistant" 
                     ? { id: "system_assistant", name: "Platform Assistant", avatar: "", cost: 0, interactions: 0 }
                     : {
                         id: msg.agentId,
                         name: agentMap.get(msg.agentId)?.name || "Unknown",
                         avatar: agentMap.get(msg.agentId)?.avatar || "",
                         cost: 0,
                         interactions: 0
                       };
                  cAgg.topAgents.set(msg.agentId, ca);
               }
               ca.cost += costGBP;
               ca.interactions++;
           }

           if (msg.userId) {
               const isWidget = !!msg.widgetId;
               const targetLeaderId = (!isWidget && userMap.has(msg.userId)) ? msg.userId : "WIDGET_USER_GROUP";
               let cu = cAgg.topUsers.get(targetLeaderId);
               if (!cu) {
                   cu = targetLeaderId === "WIDGET_USER_GROUP" ? { ...widgetUserLeader } : {
                       id: targetLeaderId,
                       name: userMap.get(targetLeaderId)?.name || "Unknown",
                       image: userMap.get(targetLeaderId)?.image || "",
                       email: userMap.get(targetLeaderId)?.email || "",
                       companyName: companyMap.get(activeCompanyId)?.name || "",
                       cost: 0,
                       messages: 0
                   };
                   cAgg.topUsers.set(targetLeaderId, cu);
               }
               cu.cost += costGBP;
               cu.messages++;
           }
       }

       // 3. USER TALLIES (For getUserCostOverview)
       if (msg.userId && !msg.widgetId) {
           let uAgg = userAggregates.get(msg.userId);
           if (!uAgg) {
               uAgg = { messages: 0, inTokens: 0, outTokens: 0, costGBP: 0 };
               userAggregates.set(msg.userId, uAgg);
           }
           uAgg.messages++;
           uAgg.inTokens += inputs;
           uAgg.outTokens += outputs;
           uAgg.costGBP += costGBP;
       }
    }

    // --- INSERT GLOBAL SNAPSHOT ---
    await ctx.db.insert("analyticsDailySnapshots", {
        date: dateString,
        type: "global",
        metrics: {
            totalMessages: globalMetrics.messages,
            totalInputTokens: globalMetrics.inTokens,
            totalOutputTokens: globalMetrics.outTokens,
            costGBP: Number(globalMetrics.costGBP.toFixed(6)),
            activeUsersCount: globalMetrics.activeUsers.size
        },
        uniqueUserIds: Array.from(globalMetrics.activeUsers),
        modelMetrics: Array.from(globalModelMetrics.values()),
        leaderboards: {
            topAgents: Array.from(globalTopAgents.values()).sort((a,b) => b.interactions - a.interactions).slice(0,10),
            topUsers: Array.from(globalTopUsers.values()).sort((a,b) => b.cost - a.cost).slice(0,10)
        }
    });

    // --- INSERT COMPANY SNAPSHOTS ---
    for (const [compId, cAgg] of companyAggregates.entries()) {
        await ctx.db.insert("analyticsDailySnapshots", {
            date: dateString,
            type: "company",
            companyId: compId,
            metrics: {
                totalMessages: cAgg.messages,
                totalInputTokens: cAgg.inTokens,
                totalOutputTokens: cAgg.outTokens,
                costGBP: Number(cAgg.costGBP.toFixed(6)),
                activeUsersCount: cAgg.activeUsers.size
            },
            uniqueUserIds: Array.from(cAgg.activeUsers),
            modelMetrics: Array.from(cAgg.modelMetrics.values()),
            leaderboards: {
                topAgents: Array.from(cAgg.topAgents.values()).sort((a,b) => b.interactions - a.interactions).slice(0,10),
                topUsers: Array.from(cAgg.topUsers.values()).sort((a,b) => b.cost - a.cost).slice(0,10)
            }
        });
    }

    // --- INSERT USER SNAPSHOTS ---
    for (const [uId, uAgg] of userAggregates.entries()) {
        await ctx.db.insert("analyticsDailySnapshots", {
            date: dateString,
            type: "user",
            userId: uId,
            metrics: {
                totalMessages: uAgg.messages,
                totalInputTokens: uAgg.inTokens,
                totalOutputTokens: uAgg.outTokens,
                costGBP: Number(uAgg.costGBP.toFixed(6))
            },
            uniqueUserIds: [uId]
        });
    }

    console.log(`[Analytics] Successfully generated snapshots for ${dateString}`);
  }
});

// Migration helper to seed past data
export const seedHistoricalSnapshots = internalAction({
    args: { daysBack: v.number() },
    handler: async (ctx, args) => {
        const now = new Date();
        for (let i = args.daysBack; i >= 1; i--) {
            const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const dateStr = target.toISOString().split("T")[0];
            await ctx.runMutation(internal.analyticsCron.generateDailySnapshots, { targetDateStr: dateStr });
            console.log(`Dispatched snapshot job for ${dateStr}`);
        }
    }
});

export const dispatchPlatformAlerts = internalAction({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const report = await ctx.runQuery(internal.analyticsCron.getSystemHealth, { daysBack: args.daysBack ?? 7 });
    const decision = buildSystemHealthPlatformAlertDecision(report);

    if (!decision.shouldAlert) {
      return {
        alerted: false,
        alertType: decision.alertType,
        reason: "healthy",
        summary: decision.summary,
      };
    }

    const configuredRecipients = parsePlatformAlertRecipients(
      process.env.PLATFORM_ALERT_EMAILS ||
        process.env.PLATFORM_ALERT_EMAIL ||
        process.env.ANALYTICS_ALERT_EMAILS ||
        process.env.ANALYTICS_ALERT_EMAIL ||
        process.env.INITIAL_SUPER_ADMIN_EMAIL
    );
    // Falls back to the people who can actually act on it, rather than giving up.
    //
    // Annotated, and awaited on its own line, because an un-annotated
    // `ctx.runQuery` inside this action resolves its type through the generated
    // api and back into this module. That cycle silently widens every
    // `ctx.db.get` in the codebase to a union of every table.
    const fallbackRecipients: string[] = configuredRecipients.length > 0
      ? []
      : await ctx.runQuery(internal.platformAlertRecipients.getPlatformAlertFallbackRecipients, {});
    const recipients = configuredRecipients.length > 0 ? configuredRecipients : fallbackRecipients;

    if (recipients.length === 0) {
      console.warn("Platform alert triggered but no alert recipients are configured.", decision.summary);
      return {
        alerted: false,
        alertType: decision.alertType,
        reason: "missing_recipients",
        signals: decision.signals,
        summary: decision.summary,
      };
    }

    // Branding is resolved before the email is built, because the subject line
    // carries the platform name and must not fall back to a hardcoded one.
    const emailBranding = await ctx.runQuery(internal.settings.getEmailBranding, {});
    const email = buildSystemHealthAlertEmail(report, decision, {
      platformName: emailBranding?.platformName,
      baseUrl: process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL,
    });

    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not found. Simulating platform alert dispatch.", {
        recipients,
        subject: email.subject,
      });
      return {
        alerted: true,
        alertType: decision.alertType,
        recipients,
        simulated: true,
        signals: decision.signals,
        summary: decision.summary,
      };
    }

    const fromAddress = buildEmailFromAddress({
      envFromAddress: resolveEnvFromAddress(process.env),
      fallbackName: "Sonae Operations",
      settings: emailBranding,
    });
    const data = await sendResendEmail({
      apiKey: process.env.RESEND_API_KEY,
      operation: "platformSystemHealthAlert",
      idempotencyKey: `platform-alert:${decision.alertType}:${report.windowStartDate}:${report.checkedDate}`,
      payload: {
        from: fromAddress,
        to: recipients,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
    });

    return {
      alerted: true,
      alertType: decision.alertType,
      id: data?.id,
      recipients,
      simulated: false,
      signals: decision.signals,
      summary: decision.summary,
    };
  },
});

export const wipeSnapshots = internalMutation({
    args: {},
    handler: async (ctx) => {
        const snaps = await ctx.db.query("analyticsDailySnapshots").take(10000);
        for (const s of snaps) {
            await ctx.db.delete(s._id);
        }
        return snaps.length;
    }
});
