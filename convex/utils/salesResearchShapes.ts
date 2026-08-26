import { v } from "convex/values";

import schema from "../schema";
import { prospectOriginShape } from "./salesCustomerShapes";

/** What the customer-research and prospecting screens hand back. */

const researchFields = schema.tables.salesDataCustomerResearch.validator.fields;
const prospectFields = schema.tables.salesDataProspects.validator.fields;

const researchFindingShape = v.object({
  id: v.id("salesDataCustomerResearch"),
  field: researchFields.field,
  value: researchFields.value,
  confidence: researchFields.confidence,
  sourceUrl: v.union(v.string(), v.null()),
  sourceName: v.union(v.string(), v.null()),
  reasoning: v.union(v.string(), v.null()),
  foundAt: researchFields.foundAt,
});

export const customerResearchShape = v.object({
  applied: v.array(researchFindingShape),
  needsCheck: v.array(researchFindingShape),
});

export const prospectProfileShape = v.union(v.null(), v.object({
  prospectKey: prospectFields.prospectKey,
  siteName: prospectFields.siteName,
  groupName: prospectFields.groupName,
  customerType: prospectFields.customerType,
  town: v.union(v.string(), v.null()),
  postcode: v.union(v.string(), v.null()),
  status: prospectFields.status,
  conflictNote: v.union(v.string(), v.null()),
  sourceUrl: v.union(v.string(), v.null()),
  sourceName: v.union(v.string(), v.null()),
  reasoning: v.union(v.string(), v.null()),
  origin: prospectOriginShape,
  foundAt: prospectFields.foundAt,
}));

export const groupProspectListShape = v.array(v.object({
  prospectKey: prospectFields.prospectKey,
  siteName: prospectFields.siteName,
  town: v.union(v.string(), v.null()),
}));

export const prospectDismissalShape = v.object({ status: v.literal("DISMISSED") });

export const researchStartShape = v.object({
  agentRunId: v.id("agentRuns"),
  queued: v.number(),
});

export const sweepStartShape = v.object({
  queued: v.number(),
  skipped: v.number(),
});

export const researchDecisionShape = v.object({
  status: v.union(v.literal("APPLIED"), v.literal("REJECTED")),
});
