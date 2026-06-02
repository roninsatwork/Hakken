import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { canAccessCompany, getCurrentUser, requireCurrentUser, requireSuperAdmin } from "./authz";
import {
  buildPlanRecord,
  getAssignedPlanDeleteErrorMessage,
  getPlanStatusFromCompany,
  getPlanStatusFromUser,
} from "./planService";

const superAdminPlanMessage = "Unauthorized access. Super Admin role required.";

export const getMyCompanyPlanStatus = query({
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

export const getCompanyPlanStatus = query({
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

export const getPlans = query({
  args: {},
  handler: async (ctx) => {
    // Anyone authenticated can read available plans
    await requireCurrentUser(ctx, "Unauthenticated request");

    return await ctx.db.query("plans").order("asc").take(10000);
  },
});

export const getPaginatedPlans = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, superAdminPlanMessage, "Unauthenticated request");

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

export const getActivePlans = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentUser(ctx, "Unauthenticated request");

    return await ctx.db
      .query("plans")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("asc")
      .take(10000);
  },
});

export const createPlan = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    messageLimit: v.number(),
    priceGBP: v.number(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, superAdminPlanMessage, "Unauthenticated request");

    const planId = await ctx.db.insert("plans", buildPlanRecord({
      name: args.name,
      description: args.description,
      messageLimit: args.messageLimit,
      priceGBP: args.priceGBP,
      isActive: args.isActive,
    }));

    return planId;
  },
});

export const updatePlan = mutation({
  args: {
    id: v.id("plans"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    messageLimit: v.optional(v.number()),
    priceGBP: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, superAdminPlanMessage, "Unauthenticated request");

    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const deletePlan = mutation({
  args: { id: v.id("plans") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, superAdminPlanMessage, "Unauthenticated request");

    // Ensure we don't delete plans strictly assigned to companies
    const companiesAssigned = await ctx.db
      .query("companies")
      .filter((q) => q.eq(q.field("planId"), args.id))
      .take(10000);

    if (companiesAssigned.length > 0) {
      throw new Error(getAssignedPlanDeleteErrorMessage(companiesAssigned.length));
    }

    await ctx.db.delete(args.id);
  },
});

export const resetBillingCycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Reset all pool counters to 0 smoothly without deleting data
    
    // 1. Reset all companies (Shared Pools)
    const companies = await ctx.db.query("companies").take(10000);
    for (const c of companies) {
      if (c.messagesUsedThisPeriod !== 0) {
          await ctx.db.patch(c._id, { messagesUsedThisPeriod: 0 });
      }
    }
    
    // 2. Reset all users (who had individual overrides)
    const usersWithOverrides = await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("planOverrideId"), undefined))
      .take(10000);
      
    for (const u of usersWithOverrides) {
        if (u.messagesUsedThisPeriod !== 0) {
            await ctx.db.patch(u._id, { messagesUsedThisPeriod: 0 });
        }
    }
  }
});
