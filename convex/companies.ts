import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireSuperAdmin } from "./authz";
import {
  buildCompanyProfilePatch,
  buildCompanyRecord,
  buildCreateCompanyAuditMetadata,
  buildDeleteCompanyAuditMetadata,
  buildUpdateCompanyAuditMetadata,
  shouldContinueCompanyPurge,
  withCompanyUserCount,
} from "./companyService";

export const getCompanies = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(
      ctx,
      "Unauthorized: System level clearance required.",
      "Unauthenticated Admin Request"
    );

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

export const getCompanyById = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated Admin Request");

    return await ctx.db.get(args.id);
  },
});

export const getCompanyByIdInternal = internalQuery({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createCompany = mutation({
  args: { name: v.string(), systemPrompt: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireSuperAdmin(ctx);

    const now = Date.now();
    const newCompanyId = await ctx.db.insert("companies", buildCompanyRecord({
      name: args.name,
      systemPrompt: args.systemPrompt,
    }, now));

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

export const updateCompany = mutation({
  args: { id: v.id("companies"), name: v.string(), systemPrompt: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireSuperAdmin(ctx);

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

export const deleteCompany = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireSuperAdmin(ctx);

    await ctx.scheduler.runAfter(0, internal.companies.purgeCompanyEntitiesInternal, { companyId: args.id });

    const company = await ctx.db.get(args.id);
    const now = Date.now();
    // Erase the company entity representation globally
    await ctx.db.delete(args.id);

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

export const updateCompanyPrompt = mutation({
  args: { id: v.id("companies"), systemPrompt: v.string() },
  handler: async (ctx, args) => {
    await requireSuperAdmin(
      ctx,
      "Unauthorized: System level clearance required.",
      "Unauthenticated Admin Request"
    );

    await ctx.db.patch(args.id, { systemPrompt: args.systemPrompt });
    return args.id;
  },
});

export const updateCompanyDescription = mutation({
  args: { id: v.id("companies"), description: v.string() },
  handler: async (ctx, args) => {
    await requireSuperAdmin(
      ctx,
      "Unauthorized: System level clearance required.",
      "Unauthenticated Admin Request"
    );

    await ctx.db.patch(args.id, { description: args.description });
    return args.id;
  },
});

export const updateCompanyProfile = mutation({
  args: { 
    id: v.id("companies"), 
    name: v.string(), 
    description: v.optional(v.string()), 
    overview: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireSuperAdmin(
      ctx,
      "Unauthorized: System level clearance required.",
      "Unauthenticated Admin Request"
    );

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

export const assignPlanToCompany = mutation({
  args: { id: v.id("companies"), planId: v.optional(v.id("plans")) },
  handler: async (ctx, args) => {
    await requireSuperAdmin(
      ctx,
      "Unauthorized: System level clearance required.",
      "Unauthenticated Admin Request"
    );

    await ctx.db.patch(args.id, { planId: args.planId });
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
