import { v } from "convex/values";

/**
 * What the health reports hand back.
 *
 * The operational and budget blocks are ten and two repetitions of the same
 * `{ count, examples }` pair, so each is built from one named shape rather than
 * written out eleven times.
 */

const operationalFailureExampleShape = v.object({
  id: v.string(),
  label: v.string(),
  occurredAt: v.optional(v.number()),
  summary: v.optional(v.string()),
  targetId: v.optional(v.string()),
  targetName: v.optional(v.string()),
  targetType: v.optional(v.union(v.literal("agent"), v.literal("schedule"), v.literal("workflow"))),
});

const failureBlock = v.object({
  count: v.number(),
  examples: v.array(operationalFailureExampleShape),
});

const budgetExampleShape = v.object({
  id: v.string(),
  limit: v.number(),
  occurredAt: v.optional(v.number()),
  percentUsed: v.number(),
  summary: v.string(),
  targetName: v.string(),
  targetType: v.union(v.literal("agent"), v.literal("company")),
  used: v.number(),
});

const budgetBlock = v.object({
  count: v.number(),
  examples: v.array(budgetExampleShape),
});

export const analyticsHealthShape = v.object({
  checkedDates: v.array(v.string()),
  daysBack: v.number(),
  liveToday: v.object({
    agentTransactions: v.number(),
    assistantMessages: v.number(),
    date: v.string(),
  }),
  messageDimensions: v.object({
    examples: v.array(v.string()),
    mismatched: v.number(),
    missingDimensions: v.number(),
    missingThreads: v.number(),
    scanned: v.number(),
    windowStartDate: v.string(),
  }),
  snapshotCoverage: v.object({
    dates: v.array(v.object({
      companySnapshots: v.number(),
      date: v.string(),
      globalSnapshots: v.number(),
      hasGlobalSnapshot: v.boolean(),
      userSnapshots: v.number(),
    })),
    duplicateSnapshotGroups: v.array(v.object({
      count: v.number(),
      date: v.string(),
      scopeId: v.string(),
      type: v.union(v.literal("global"), v.literal("company"), v.literal("user")),
    })),
    missingGlobalDates: v.array(v.string()),
    totalSnapshots: v.number(),
  }),
});

export const systemHealthShape = v.object({
  analytics: analyticsHealthShape,
  alertRules: v.array(v.object({
    count: v.number(),
    details: v.array(v.string()),
    key: v.union(
      v.literal("costSpikes"),
      v.literal("repeatedProviderFailures"),
      v.literal("staleApprovals"),
      v.literal("stuckRuns"),
      v.literal("toolFailures"),
    ),
    label: v.string(),
    nextAction: v.string(),
    status: v.union(v.literal("ok"), v.literal("warning"), v.literal("critical")),
    threshold: v.string(),
  })),
  budgetHealth: v.object({
    agentCostBudgets: budgetBlock,
    tenantMessageBudgets: budgetBlock,
  }),
  checkedAt: v.number(),
  checkedDate: v.string(),
  daysBack: v.number(),
  disabledPurgePipelines: v.optional(v.array(v.string())),
  highCostAgentThresholdGBP: v.number(),
  operations: v.object({
    agentFailures: failureBlock,
    failedAgentTransactions: failureBlock,
    failedToolCalls: failureBlock,
    failedScheduledExecutions: failureBlock,
    highCostAgents: failureBlock,
    overdueSchedules: failureBlock,
    pendingApprovals: failureBlock,
    providerFailures: failureBlock,
    schedulesMissingNextRun: failureBlock,
    staleAgentRuns: failureBlock,
    staleRunningScheduledExecutions: failureBlock,
  }),
  pendingApprovalThresholdMinutes: v.number(),
  staleRunningThresholdMinutes: v.number(),
  overdueScheduleThresholdMinutes: v.number(),
  scope: v.object({
    companyId: v.optional(v.string()),
    companyName: v.optional(v.string()),
    type: v.union(v.literal("company"), v.literal("platform")),
  }),
  windowStartDate: v.string(),
  windowStartTs: v.number(),
});
