import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { canAccessCompany, getCurrentUser } from "./authz";
import {
  buildPlanRecord,
  getAssignedPlanDeleteErrorMessage,
  getPlanStatusFromCompany,
  getPlanStatusFromUser,
} from "./planService";
import { normalizeEnabledModules } from "./utils/companyModules";
import { removeGlobalInventoryPlan, upsertGlobalInventoryPlan } from "./utils/inventoryRollupService";
import { publicQuery, superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";

const PLAN_CATALOG_LIMIT = 100;
const BILLING_RESET_BATCH_SIZE = 500;

export const getMyCompanyPlanStatus = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {},
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;
    const { user } = current;

    // Check Override first
    if (user.planOverrideId) {
       const userPlan = await ctx.db.get(user.planOverrideId);
       return getPlanStatusFromUser({ user, userPlan });
    }
    // Fallback to Company
    if (user.companyId) {
       const company = await ctx.db.get(user.companyId);
       const plan = company?.planId ? await ctx.db.get(company.planId) : null;
       return getPlanStatusFromUser({ user, company, companyPlan: plan });
    }

    return getPlanStatusFromUser({ user });
  }
});

export const getCompanyPlanStatus = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;
    const { user: admin } = current;

    if (!canAccessCompany(admin, args.companyId)) {
      return null; // Unauthorized
    }

    const company = await ctx.db.get(args.companyId);
    const plan = company?.planId ? await ctx.db.get(company.planId) : null;

    return getPlanStatusFromCompany(company, plan);
  }
});

export const getPlans = tenantQuery({
  args: {},
  handler: async (ctx) => {
    // Anyone authenticated can read available plans
    return await ctx.db.query("plans").order("asc").take(PLAN_CATALOG_LIMIT);
  },
});

export const getPaginatedPlans = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();

    return searchTerm
      ? await ctx.db
        .query("plans")
        .withSearchIndex("search_name", (q) => q.search("name", searchTerm))
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("plans")
        .withIndex("by_createdAt")
        .order("desc")
        .paginate(args.paginationOpts);
  },
});

export const getActivePlans = tenantQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("asc")
      .take(PLAN_CATALOG_LIMIT);
  },
});

export const createPlan = superAdminMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    messageLimit: v.number(),
    priceGBP: v.number(),
    grantedModules: v.optional(v.array(v.string())),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const planId = await ctx.db.insert("plans", buildPlanRecord({
      name: args.name,
      description: args.description,
      messageLimit: args.messageLimit,
      priceGBP: args.priceGBP,
      grantedModules: args.grantedModules,
      isActive: args.isActive,
    }));
    const plan = await ctx.db.get(planId);
    if (plan) {
      await upsertGlobalInventoryPlan(ctx, plan);
    }

    return planId;
  },
});

export const updatePlan = superAdminMutation({
  args: {
    id: v.id("plans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    messageLimit: v.optional(v.number()),
    priceGBP: v.optional(v.number()),
    grantedModules: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      ...(updates.grantedModules === undefined
        ? {}
        : { grantedModules: normalizeEnabledModules(updates.grantedModules) }),
    });
    const plan = await ctx.db.get(id);
    if (plan) {
      await upsertGlobalInventoryPlan(ctx, plan);
    }
  },
});

export const deletePlan = superAdminMutation({
  args: { id: v.id("plans") },
  handler: async (ctx, args) => {
    // Ensure we don't delete plans strictly assigned to companies
    const companiesAssigned = await ctx.db
      .query("companies")
      .withIndex("by_plan", (q) => q.eq("planId", args.id))
      .take(101);

    if (companiesAssigned.length > 0) {
      throw appError("CONFLICT", getAssignedPlanDeleteErrorMessage(Math.min(companiesAssigned.length, 100)));
    }

    await ctx.db.delete(args.id);
    await removeGlobalInventoryPlan(ctx, args.id);
  },
});

async function resetCompanyBillingBatch(ctx: MutationCtx, cursor: string | null) {
  const companies = await ctx.db
    .query("companies")
    .paginate({ numItems: BILLING_RESET_BATCH_SIZE, cursor });

  for (const company of companies.page) {
    if (company.messagesUsedThisPeriod !== 0) {
      await ctx.db.patch(company._id, { messagesUsedThisPeriod: 0 });
    }
  }

  return companies.isDone ? null : companies.continueCursor;
}

async function resetUserBillingBatch(ctx: MutationCtx, cursor: string | null) {
  const users = await ctx.db
    .query("users")
    .paginate({ numItems: BILLING_RESET_BATCH_SIZE, cursor });

  for (const user of users.page) {
    if (user.planOverrideId && user.messagesUsedThisPeriod !== 0) {
      await ctx.db.patch(user._id, { messagesUsedThisPeriod: 0 });
    }
  }

  return users.isDone ? null : users.continueCursor;
}

/**
 * Starts the monthly reset. Companies and users are two separate paginated
 * walks, and Convex allows one paginated query per function call, so this
 * schedules each chain rather than taking the first page of both itself.
 *
 * Taking the first page inline threw on the second `.paginate()` and rolled the
 * whole mutation back, so no counter was ever reset. The suite could not see it
 * because `convex-test` does not enforce the rule — `npm run check:pagination`
 * does.
 */
export const resetBillingCycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.plans.resetCompanyBillingCycleBatch, { cursor: null });
    await ctx.scheduler.runAfter(0, internal.plans.resetUserBillingCycleBatch, { cursor: null });
  }
});

export const resetCompanyBillingCycleBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const nextCursor = await resetCompanyBillingBatch(ctx, args.cursor);
    if (nextCursor) {
      await ctx.scheduler.runAfter(0, internal.plans.resetCompanyBillingCycleBatch, { cursor: nextCursor });
    }
  },
});

export const resetUserBillingCycleBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const nextCursor = await resetUserBillingBatch(ctx, args.cursor);
    if (nextCursor) {
      await ctx.scheduler.runAfter(0, internal.plans.resetUserBillingCycleBatch, { cursor: nextCursor });
    }
  },
});
