import { internalMutation, internalAction, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { buildModelCostContext, computeCostFromMap } from "./analyticsService";
import {
  buildSystemHealthPlatformAlertDecision,
  buildSystemHealthPlatformAlertEmailHtml,
  parsePlatformAlertRecipients,
  type AnalyticsHealthReport,
  type OperationalFailureExample,
  type OperationalHealthReport,
  type SystemHealthReport,
} from "./platformAlertService";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireSuperAdmin } from "./authz";
import { sendResendEmail } from "./resendEmailService";

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
};

const SYSTEM_AGENT_ID: SystemAgentId = "system_assistant";
const DAY_MS = 24 * 60 * 60 * 1000;
const HEALTH_COLLECTION_LIMIT = 10000;
const HEALTH_EXAMPLE_LIMIT = 10;
const OVERDUE_SCHEDULE_THRESHOLD_MINUTES = 15;
const STALE_RUNNING_THRESHOLD_MINUTES = 60;

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
    const snapshots = await ctx.db
      .query("analyticsDailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", date))
      .take(10000);
    totalSnapshots += snapshots.length;

    const counts = {
      global: snapshots.filter((snapshot) => snapshot.type === "global").length,
      company: snapshots.filter((snapshot) => snapshot.type === "company").length,
      user: snapshots.filter((snapshot) => snapshot.type === "user").length,
    };

    if (counts.global === 0) {
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

  const recentMessages = await ctx.db
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

  const liveAssistantMessages = await ctx.db
    .query("messages")
    .withIndex("by_role_created", (q) => q.eq("role", "assistant").gte("createdAt", todayStartTs))
    .take(10000);
  const liveAgentTransactions = await ctx.db
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

async function getOperationalHealthReport(ctx: QueryCtx, args: { daysBack?: number }): Promise<OperationalHealthReport> {
  const daysBack = getHealthLookbackDays(args.daysBack);
  const now = Date.now();
  const windowStartTs = now - daysBack * DAY_MS;
  const staleRunningCutoffTs = now - STALE_RUNNING_THRESHOLD_MINUTES * 60 * 1000;
  const overdueScheduleCutoffTs = now - OVERDUE_SCHEDULE_THRESHOLD_MINUTES * 60 * 1000;

  const recentAgentLogs = await ctx.db
    .query("agentLogs")
    .withIndex("by_createdAt", (q) => q.gte("createdAt", windowStartTs))
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
  const agentFailureLogs = recentAgentLogs.filter((log) => log.interactionType === "ERROR");
  const agentFailures = await Promise.all(
    agentFailureLogs.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (log): Promise<OperationalFailureExample> => {
      const agent = await ctx.db.get(log.agentId);
      return {
        id: log._id,
        label: log.interactionType,
        occurredAt: log.createdAt,
        summary: truncateHealthSummary(log.responseContent),
        targetName: agent?.name || "Deleted Agent",
        targetType: "agent",
      };
    })
  );

  const recentAgentTransactions = await ctx.db
    .query("agentTransactions")
    .withIndex("by_createdAt", (q) => q.gte("createdAt", windowStartTs))
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
  const failedTransactions = recentAgentTransactions.filter((transaction) => transaction.status === "FAILED");
  const failedAgentTransactions = await Promise.all(
    failedTransactions.slice(0, HEALTH_EXAMPLE_LIMIT).map(async (transaction): Promise<OperationalFailureExample> => {
      const agent = await ctx.db.get(transaction.agentId);
      return {
        id: transaction._id,
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

  const recentScheduledExecutions = await ctx.db
    .query("workflowExecutions")
    .withIndex("by_startedAt", (q) => q.gte("startedAt", windowStartTs))
    .order("desc")
    .take(HEALTH_COLLECTION_LIMIT);
  const failedScheduleRuns = recentScheduledExecutions.filter((execution) =>
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
  const staleScheduleRuns = latestExecutions.filter((execution) =>
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
  const overdueScheduleRows = overdueScheduleCandidates.filter((schedule) => schedule.nextRunAt !== undefined);
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
  const missingNextRunRows = activeScheduleRows.filter((schedule) => schedule.isActive && schedule.nextRunAt === undefined);
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
    failedScheduledExecutions: buildOperationalBucket(failedScheduledExecutions, failedScheduleRuns.length),
    overdueSchedules: buildOperationalBucket(overdueSchedules, overdueScheduleRows.length),
    schedulesMissingNextRun: buildOperationalBucket(schedulesMissingNextRun, missingNextRunRows.length),
    staleRunningScheduledExecutions: buildOperationalBucket(staleRunningScheduledExecutions, staleScheduleRuns.length),
  };
}

async function getSystemHealthReport(ctx: QueryCtx, args: AnalyticsDataHealthArgs): Promise<SystemHealthReport> {
  const daysBack = getHealthLookbackDays(args.daysBack);
  const checkedAt = Date.now();
  const windowStartTs = checkedAt - daysBack * DAY_MS;
  const analytics = await getAnalyticsDataHealthReport(ctx, { daysBack });
  const operations = await getOperationalHealthReport(ctx, { daysBack });

  return {
    analytics,
    checkedAt,
    checkedDate: formatHealthWindowStart(checkedAt),
    daysBack,
    operations,
    overdueScheduleThresholdMinutes: OVERDUE_SCHEDULE_THRESHOLD_MINUTES,
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

export const getAnalyticsDataHealthForAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");
    return await getAnalyticsDataHealthReport(ctx, args);
  },
});

export const getSystemHealthForAdmin = query({
  args: {
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");
    return await getSystemHealthReport(ctx, args);
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
       const costGBP = computeCostFromMap(msg.modelUsed, inputs, outputs, modelMap) * 0.78;

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

    const recipients = parsePlatformAlertRecipients(
      process.env.PLATFORM_ALERT_EMAILS ||
        process.env.PLATFORM_ALERT_EMAIL ||
        process.env.ANALYTICS_ALERT_EMAILS ||
        process.env.ANALYTICS_ALERT_EMAIL ||
        process.env.INITIAL_SUPER_ADMIN_EMAIL
    );

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

    const html = buildSystemHealthPlatformAlertEmailHtml(report, decision);

    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not found. Simulating platform alert dispatch.", {
        recipients,
        subject: decision.subject,
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

    const fromAddress = process.env.RESEND_FROM_EMAIL || "Sonae Operations <noreply@ronins.co.uk>";
    const data = await sendResendEmail({
      apiKey: process.env.RESEND_API_KEY,
      operation: "platformSystemHealthAlert",
      idempotencyKey: `platform-alert:${decision.alertType}:${report.windowStartDate}:${report.checkedDate}`,
      payload: {
        from: fromAddress,
        to: recipients,
        subject: decision.subject,
        html,
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
