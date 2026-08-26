import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { rowShape } from "./rowShape";

/** What the schedule and workflow-run screens hand back. */

export const scheduleListShape = v.array(v.object({
  ...rowShape.schedules.fields,
  workflowName: v.optional(v.string()),
  agentName: v.optional(v.string()),
  targetName: v.string(),
}));

export const executionPageShape = paginationResultValidator(v.object({
  ...rowShape.workflowExecutions.fields,
  workflowName: v.string(),
  startedByName: v.string(),
  awaitingApprovalNodeId: v.optional(v.string()),
}));

export const pendingApprovalCountShape = v.object({
  count: v.number(),
  atLimit: v.boolean(),
});

export const executionDetailShape = v.union(v.null(), v.object({
  ...rowShape.workflowExecutions.fields,
  workflowName: v.string(),
  startedByName: v.string(),
  steps: v.array(rowShape.workflowExecutionSteps),
}));
