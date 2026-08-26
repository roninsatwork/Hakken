import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { rowShape } from "./rowShape";

/**
 * What the approval, log, memory and version screens hand back.
 *
 * `failureCounts` below is one of the few genuinely open dictionaries here —
 * its keys are failure signatures, made from whatever went wrong — so it is a
 * record. Nothing checks a record at run time, which is stated rather than
 * assumed: the fields around it still are.
 */

const runFields = schema.tables.agentRuns.validator.fields;

const agentRowShape = v.object({
  ...schema.tables.agents.validator.fields,
  _id: v.id("agents"),
  _creationTime: v.number(),
});

export const pendingApprovalPageShape = paginationResultValidator(v.object({
  approval: rowShape.agentRunApprovals,
  run: v.union(rowShape.agentRuns, v.null()),
  toolCall: v.union(rowShape.agentToolCalls, v.null()),
  agent: v.union(agentRowShape, v.null()),
}));

export const pendingApprovalCountShape = v.object({
  count: v.number(),
  atLimit: v.boolean(),
});

export const approvalExpiryConfigShape = v.object({
  expiryHours: v.number(),
  defaultHours: v.number(),
  minHours: v.number(),
  maxHours: v.number(),
});

export const jobGroupsShape = v.object({
  groups: v.array(v.object({
    runId: v.optional(v.string()),
    startedAt: v.number(),
    lastAt: v.number(),
    job: v.union(v.null(), v.object({
      objective: runFields.objective,
      status: runFields.status,
      startedAt: runFields.startedAt,
      completedAt: runFields.completedAt,
      costGBP: runFields.costGBP,
      triggerType: runFields.triggerType,
    })),
    entries: v.array(rowShape.agentLogs),
  })),
  totalGroups: v.number(),
  totalPages: v.number(),
  failureCounts: v.record(v.string(), v.number()),
  windowTruncated: v.boolean(),
});

export const runLogListShape = v.array(rowShape.agentLogs);

export const memoryPageShape = paginationResultValidator(rowShape.agentMemories);

export const memoryQualityShape = v.array(v.object({
  memory: rowShape.agentMemories,
  usageCount: v.number(),
  successCount: v.number(),
  failureCount: v.number(),
  cancelledCount: v.number(),
  lastUsedAt: v.optional(v.number()),
  qualityScore: v.number(),
  rankingQuality: v.number(),
  flags: v.array(v.string()),
}));

export const versionPageShape = paginationResultValidator(rowShape.agentVersions);

export const versionDetailShape = v.union(v.null(), v.object({
  version: rowShape.agentVersions,
  stats: v.object({
    runs: v.number(),
    fixtures: v.number(),
    successRate: v.number(),
    costGBP: v.number(),
  }),
  runs: v.array(rowShape.agentRuns),
  fixtures: v.array(rowShape.agentEvalFixtures),
}));
