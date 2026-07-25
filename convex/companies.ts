import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import {
  buildCompanyProfilePatch,
  buildCompanyRecord,
  buildCompanyPromptAuditMetadata,
  buildCreateCompanyAuditMetadata,
  buildDeleteCompanyAuditMetadata,
  buildUpdateCompanyAuditMetadata,
  shouldContinueCompanyPurge,
  withCompanyUserCount,
} from "./companyService";
import {
  adjustGlobalInventoryCompanyPlan,
  incrementGlobalInventoryTotals,
} from "./utils/inventoryRollupService";

const COMPANY_INVENTORY_USER_COUNT_LIMIT = 100;
const COMPANY_OPTIONS_DEFAULT_LIMIT = 100;
const COMPANY_OPTIONS_MAX_LIMIT = 200;

export const getCompanies = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query("companies").order("desc").take(10000);
    
    // Attach basic stats dynamically
    const enrichedCompanies = await Promise.all(
      companies.map(async (company) => {
        const users = await ctx.db
          .query("users")
          .withIndex("by_company", (q) => q.eq("companyId", company._id))
          .take(10000);
          
        return withCompanyUserCount(company, users.length);
      })
    );

    return enrichedCompanies;
  },
});

export const getPaginatedCompanies = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();
    const companiesPage = searchTerm
      ? await ctx.db
        .query("companies")
        .withSearchIndex("search_name", (q) => q.search("name", searchTerm))
        .paginate(args.paginationOpts)
      : await ctx.db.query("companies").order("desc").paginate(args.paginationOpts);

    const page = await Promise.all(
      companiesPage.page.map(async (company) => {
        const users = await ctx.db
          .query("users")
          .withIndex("by_company", (q) => q.eq("companyId", company._id))
          .take(COMPANY_INVENTORY_USER_COUNT_LIMIT + 1);

        return {
          ...withCompanyUserCount(company, Math.min(users.length, COMPANY_INVENTORY_USER_COUNT_LIMIT)),
          userCountIsCapped: users.length > COMPANY_INVENTORY_USER_COUNT_LIMIT,
        };
      })
    );

    return {
      ...companiesPage,
      page,
    };
  },
});

export const getCompanyOptions = superAdminQuery({
  args: {
    searchTerm: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? COMPANY_OPTIONS_DEFAULT_LIMIT), 1), COMPANY_OPTIONS_MAX_LIMIT);
    const searchTerm = args.searchTerm?.trim();

    const companies = searchTerm
      ? await ctx.db
        .query("companies")
        .withSearchIndex("search_name", (q) => q.search("name", searchTerm))
        .take(limit)
      : await ctx.db
        .query("companies")
        .withIndex("by_name")
        .take(limit);

    return companies.map((company) => ({
      _id: company._id,
      name: company.name,
    }));
  },
});

export const getCompanyById = superAdminQuery({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getCompanyByIdInternal = internalQuery({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createCompany = superAdminMutation({
  args: { name: v.string(), systemPrompt: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId: adminId } = ctx;

    const now = Date.now();
    const newCompanyId = await ctx.db.insert("companies", buildCompanyRecord({
      name: args.name,
      systemPrompt: args.systemPrompt,
    }, now));
    await incrementGlobalInventoryTotals(ctx, { companiesDelta: 1 });

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      actionType: "CREATE_COMPANY",
      entityId: newCompanyId,
      entityType: "companies",
      metadata: buildCreateCompanyAuditMetadata(args.name),
      timestamp: now
    });

    return newCompanyId;
  },
});

export const updateCompany = superAdminMutation({
  args: { id: v.id("companies"), name: v.string(), systemPrompt: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId: adminId } = ctx;

    const previous = await ctx.db.get(args.id);
    const now = Date.now();
    await ctx.db.patch(args.id, { name: args.name, systemPrompt: args.systemPrompt });

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      actionType: "UPDATE_COMPANY",
      entityId: args.id,
      entityType: "companies",
      metadata: buildUpdateCompanyAuditMetadata({ previousName: previous?.name, newName: args.name }),
      timestamp: now
    });

    return args.id;
  },
});

export const deleteCompany = superAdminMutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const { userId: adminId } = ctx;

    const company = await ctx.db.get(args.id);
    const now = Date.now();
    const previousPlan = company?.planId ? await ctx.db.get(company.planId) : null;

    await ctx.scheduler.runAfter(0, internal.companies.purgeCompanyEntitiesInternal, { companyId: args.id });

    // Erase the company entity representation globally
    await ctx.db.delete(args.id);
    if (company) {
      await adjustGlobalInventoryCompanyPlan(ctx, { previousPlan, companiesDelta: -1 });
    }

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      actionType: "DELETE_COMPANY",
      entityId: args.id,
      entityType: "companies",
      metadata: buildDeleteCompanyAuditMetadata(company?.name),
      timestamp: now
    });

    return true;
  },
});

export const updateCompanyPrompt = superAdminMutation({
  args: { id: v.id("companies"), systemPrompt: v.string() },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const now = Date.now();
    await ctx.db.patch(args.id, { systemPrompt: args.systemPrompt });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_COMPANY_PROMPT",
      companyId: args.id,
      entityId: args.id,
      entityType: "companies",
      metadata: buildCompanyPromptAuditMetadata(args.systemPrompt),
      timestamp: now,
    });

    return args.id;
  },
});

export const updateCompanyDescription = superAdminMutation({
  args: { id: v.id("companies"), description: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { description: args.description });
    return args.id;
  },
});

export const updateCompanyProfile = superAdminMutation({
  args: { 
    id: v.id("companies"), 
    name: v.string(), 
    description: v.optional(v.string()), 
    overview: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = ctx;

    const previous = await ctx.db.get(args.id);
    const now = Date.now();
    await ctx.db.patch(args.id, buildCompanyProfilePatch({
      name: args.name, 
      description: args.description,
      overview: args.overview,
    }));

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      actionType: "UPDATE_COMPANY_PROFILE",
      entityId: args.id,
      entityType: "companies",
      metadata: buildUpdateCompanyAuditMetadata({ previousName: previous?.name, newName: args.name }),
      timestamp: now
    });

    return args.id;
  },
});

export const assignPlanToCompany = superAdminMutation({
  args: { id: v.id("companies"), planId: v.optional(v.id("plans")) },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) throw new Error("Company not found");

    const previousPlan = company.planId ? await ctx.db.get(company.planId) : null;
    const nextPlan = args.planId ? await ctx.db.get(args.planId) : null;
    if (args.planId && !nextPlan) throw new Error("Plan not found");

    await ctx.db.patch(args.id, { planId: args.planId });
    await adjustGlobalInventoryCompanyPlan(ctx, { previousPlan, nextPlan });
    return args.id;
  },
});

export const purgeCompanyEntitiesInternal = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(100);
      
    for (const user of users) {
       await ctx.scheduler.runAfter(0, internal.users.purgeUserEntitiesInternal, { userId: user._id });
       await ctx.db.delete(user._id);
       await incrementGlobalInventoryTotals(ctx, { usersDelta: -1 });
    }

    const invites = await ctx.db
      .query("invitations")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId))
      .take(100);
      
    for (const invite of invites) {
      await ctx.db.delete(invite._id);
    }

    if (shouldContinueCompanyPurge({ userBatchSize: users.length, inviteBatchSize: invites.length })) {
       await ctx.scheduler.runAfter(0, internal.companies.purgeCompanyEntitiesInternal, { companyId: args.companyId });
    }
  }
});
