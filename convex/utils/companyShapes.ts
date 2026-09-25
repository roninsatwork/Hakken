import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { rowShape } from "./rowShape";

/**
 * What the company surfaces hand back.
 *
 * The list screens show a whole company row with a user count attached, so the
 * row comes from `rowShape` and only the count is written here. The two picker
 * doors deliberately return a name and an id and nothing else — the shape is
 * where that stays true.
 */

const companyFields = schema.tables.companies.validator.fields;

const companyWithUserCount = v.object({
  ...rowShape.companies.fields,
  userCount: v.number(),
});

export const companyOptionListShape = v.array(v.object({
  _id: v.id("companies"),
  name: companyFields.name,
}));

export const companyListShape = v.union(companyOptionListShape, v.array(companyWithUserCount));

/**
 * A company's data collection, as the Manage Companies table shows it: whether
 * it collects and how often, its newest collection, and when its work is next
 * sent (`seoScheduleService.nextCollection`) — or why nothing will send it.
 */
export const companyCollectionShape = v.object({
  isActive: v.boolean(),
  intervalStr: v.union(v.string(), v.null()),
  last: v.union(v.null(), v.object({ startedAt: v.number(), status: v.string() })),
  nextAt: v.union(v.number(), v.null()),
  nextWhy: v.union(v.literal("OFF"), v.literal("NOT_SCHEDULED"), v.null()),
});

export const companyPageShape = paginationResultValidator(v.object({
  ...companyWithUserCount.fields,
  userCountIsCapped: v.boolean(),
  collection: companyCollectionShape,
}));

export const workspaceModulesShape = v.object({
  companyName: v.union(v.string(), v.null()),
  enabledModules: v.array(v.string()),
});

export const planGrantsShape = v.union(v.null(), v.object({
  planName: v.string(),
  grantedModules: v.array(v.string()),
}));
