import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { clientUserValidator, userRoleValidator } from "../authz";
import { rowShape } from "./rowShape";

/**
 * What the people screens hand back.
 *
 * Every shape here builds on `clientUserValidator` rather than on the whole
 * `users` row, and that is the point rather than a detail. `toClientUser`
 * drops `tokenIdentifier` on the way out; the validator is what turns
 * forgetting to call it into a failure instead of a leak, because a Convex
 * return validator refuses an unexpected field rather than quietly dropping
 * it.
 */

export const clientUserPageShape = paginationResultValidator(clientUserValidator);

export const clientUserListShape = v.array(clientUserValidator);

export const clientUserWithCompanyPageShape = paginationResultValidator(v.object({
  ...clientUserValidator.fields,
  companyName: v.union(v.string(), v.null()),
}));

export const loginPageShape = paginationResultValidator(rowShape.logins);

const directoryUserPage = paginationResultValidator(v.object({
  _id: v.id("users"),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  image: v.union(v.string(), v.null()),
  role: v.union(userRoleValidator, v.null()),
  companyId: v.union(v.id("companies"), v.null()),
  companyName: v.union(v.string(), v.null()),
  createdAt: v.union(v.number(), v.null()),
  lastLoginAt: v.union(v.number(), v.null()),
  loginCount30d: v.number(),
}));

export const directoryUserPageShape = v.object({
  ...directoryUserPage.fields,
  sortingAvailable: v.boolean(),
});

export const accountablePeopleShape = v.array(v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.string(),
}));
