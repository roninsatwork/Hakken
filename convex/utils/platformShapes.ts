import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import schema from "../schema";
import { rowShape } from "./rowShape";

/**
 * What the API key, notification, plan and maintenance screens hand back.
 *
 * `keyDigest` is deliberately absent from the API key shape. It is what the
 * server compares an incoming key against — the only code that reads it is the
 * comparison itself — and the keys screen was receiving it for every key it
 * listed. `toClientApiKey` is the narrowing; this shape is what keeps it.
 */

const apiKeyFields = schema.tables.apiKeys.validator.fields;

export const clientApiKeyShape = v.object({
  _id: v.id("apiKeys"),
  _creationTime: v.number(),
  companyId: apiKeyFields.companyId,
  name: apiKeyFields.name,
  keyPrefix: apiKeyFields.keyPrefix,
  scopes: apiKeyFields.scopes,
  status: apiKeyFields.status,
  rateLimitPerMinute: apiKeyFields.rateLimitPerMinute,
  createdBy: apiKeyFields.createdBy,
  createdAt: apiKeyFields.createdAt,
  expiresAt: apiKeyFields.expiresAt,
  lastUsedAt: apiKeyFields.lastUsedAt,
  revokedBy: apiKeyFields.revokedBy,
  revokedAt: apiKeyFields.revokedAt,
  revocationReason: apiKeyFields.revocationReason,
  companyName: v.string(),
  createdByEmail: v.optional(v.string()),
  revokedByEmail: v.optional(v.string()),
});

/** The narrowing the shape above describes. Kept beside it so neither drifts. */
export const toClientApiKey = (apiKey: Doc<"apiKeys">) => {
  const { keyDigest: _keyDigest, ...rest } = apiKey;
  return rest;
};

export const apiKeyPageShape = paginationResultValidator(clientApiKeyShape);

/** The one moment the key itself travels: the screen shows it once and never again. */
export const apiKeyCreationShape = v.object({
  apiKey: v.string(),
  record: clientApiKeyShape,
});

export const notificationPageShape = paginationResultValidator(rowShape.notifications);

export const unreadCountShape = v.object({
  count: v.number(),
  atLimit: v.boolean(),
});

export const planPageShape = paginationResultValidator(rowShape.plans);

export const planListShape = v.array(rowShape.plans);

const scriptDefinitionFields = {
  id: v.union(
    v.literal("inventory-rollup-rebuild"),
    v.literal("data-migrations-apply"),
    v.literal("comax-agents-provision"),
  ),
  name: v.string(),
  category: v.union(
    v.literal("Inventory"),
    v.literal("Analytics"),
    v.literal("Workflow"),
    v.literal("Retention"),
    v.literal("Models"),
    v.literal("Agents"),
    v.literal("Migrations"),
  ),
  riskLevel: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH")),
  shortDescription: v.string(),
  description: v.string(),
  whenToRun: v.string(),
  changes: v.array(v.string()),
  repeatability: v.string(),
  expectedDuration: v.string(),
};

export const maintenanceScriptListShape = v.array(v.object({
  ...scriptDefinitionFields,
  lastRun: v.union(rowShape.maintenanceScriptRuns, v.null()),
}));

export const maintenanceScriptDetailShape = v.union(v.null(), v.object({
  ...scriptDefinitionFields,
  lastRun: v.union(rowShape.maintenanceScriptRuns, v.null()),
  history: v.array(rowShape.maintenanceScriptRuns),
}));

export const maintenanceScriptRunShape = v.union(
  v.object({
    success: v.literal(true),
    runId: v.id("maintenanceScriptRuns"),
    summary: v.string(),
  }),
  v.object({
    success: v.literal(false),
    runId: v.id("maintenanceScriptRuns"),
    error: v.string(),
  }),
);

export const learningSuggestionListShape = v.array(v.object({
  key: v.string(),
  type: v.string(),
  priority: v.union(v.literal("BLOCKER"), v.literal("WARNING"), v.literal("ADVISORY")),
  title: v.string(),
  detail: v.string(),
  target: v.union(
    v.literal("EVALS"),
    v.literal("MEMORY"),
    v.literal("SKILLS"),
    v.literal("CHAT_LOGS"),
  ),
}));

const unansweredRowFields = {
  unansweredId: v.id("wikiUnansweredQuestions"),
  question: v.string(),
  askCount: v.number(),
  lastAskedAt: v.number(),
  companyCount: v.number(),
};

export const unansweredPageShape = paginationResultValidator(v.object({
  ...unansweredRowFields,
  companyId: v.union(v.id("companies"), v.null()),
  companyName: v.union(v.string(), v.null()),
}));

export const unansweredListShape = v.array(v.object(unansweredRowFields));
