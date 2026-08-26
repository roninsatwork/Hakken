import { v } from "convex/values";

import schema from "../schema";

/** What the research-job screens hand back. */

const jobFields = schema.tables.salesDataResearchJobs.validator.fields;

export const researchJobShape = v.union(v.null(), v.object({
  status: jobFields.status,
  phase: jobFields.phase,
  progress: v.string(),
  done: v.number(),
  failed: v.number(),
  remaining: v.number(),
  total: v.number(),
  customers: v.number(),
  chains: v.number(),
  prospects: v.number(),
  workingOn: v.union(v.null(), v.object({
    kind: schema.tables.salesDataResearchJobItems.validator.fields.kind,
    label: v.string(),
  })),
  workingSince: v.union(v.number(), v.null()),
  records: v.array(v.object({
    at: v.number(),
    subject: v.string(),
    detail: v.string(),
    saved: v.boolean(),
  })),
  spentGBP: v.number(),
  spendSplit: v.union(v.null(), v.object({
    findingGBP: v.number(),
    fillingGBP: v.number(),
  })),
  maxCostGBP: jobFields.maxCostGBP,
  runsStarted: jobFields.runsStarted,
  startedAt: jobFields.startedAt,
  finishedAt: v.union(v.number(), v.null()),
  endedReason: v.union(v.string(), v.null()),
  exceptions: v.array(v.object({ name: v.string(), reason: v.string() })),
}));

export const researchRunRecordShape = v.union(v.null(), v.object({
  details: v.array(v.object({
    subject: v.string(),
    field: v.string(),
    value: v.union(v.string(), v.null()),
    outcome: v.string(),
    saved: v.boolean(),
    sourceName: v.union(v.string(), v.null()),
    sourceUrl: v.union(v.string(), v.null()),
    foundAt: v.number(),
  })),
  prospects: v.array(v.object({
    siteName: v.string(),
    groupName: v.string(),
    outcome: v.string(),
    conflictNote: v.union(v.string(), v.null()),
    sourceName: v.union(v.string(), v.null()),
    sourceUrl: v.union(v.string(), v.null()),
    foundAt: v.number(),
  })),
}));

export const researchJobStartShape = v.object({
  started: v.boolean(),
  alreadyRunning: v.optional(v.boolean()),
  nothingToDo: v.optional(v.boolean()),
});
