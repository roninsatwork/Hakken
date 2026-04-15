import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { cascadeDeleteUserAction } from "./users";

export const getCompanies = query({
  args: {},
  handler: async (ctx) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Admin Request");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized: System level clearance required.");
    }

    const companies = await ctx.db.query("companies").order("desc").collect();
    
    // Attach basic stats dynamically
    const enrichedCompanies = await Promise.all(
      companies.map(async (company) => {
        const users = await ctx.db
          .query("users")
          .filter(q => q.eq(q.field("companyId"), company._id))
          .collect();
          
        return {
          ...company,
          userCount: users.length,
        };
      })
    );

    return enrichedCompanies;
  },
});

export const getCompanyById = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Admin Request");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

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
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const newCompanyId = await ctx.db.insert("companies", {
      name: args.name,
      systemPrompt: args.systemPrompt,
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: adminId as any,
      actionType: "CREATE_COMPANY",
      entityId: newCompanyId,
      entityType: "companies",
      metadata: JSON.stringify({ name: args.name }),
      timestamp: Date.now()
    });

    return newCompanyId;
  },
});

export const updateCompany = mutation({
  args: { id: v.id("companies"), name: v.string(), systemPrompt: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    const previous = await ctx.db.get(args.id);
    await ctx.db.patch(args.id, { name: args.name, systemPrompt: args.systemPrompt });

    await ctx.db.insert("auditLogs", {
      actorId: adminId as any,
      actionType: "UPDATE_COMPANY",
      entityId: args.id,
      entityType: "companies",
      metadata: JSON.stringify({ previousName: previous?.name, newName: args.name }),
      timestamp: Date.now()
    });

    return args.id;
  },
});

export const deleteCompany = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized");
    }

    // HARD CASCADE DELETE: GDPR Compliance Nuke
    // Loop over all bound users and nuke them
    const users = await ctx.db
      .query("users")
      .filter(q => q.eq(q.field("companyId"), args.id))
      .collect();
      
    for (const user of users) {
      await cascadeDeleteUserAction(ctx, user._id);
    }

    // Eliminate all pending system invitations targeting this company
    const invites = await ctx.db
      .query("invitations")
      .filter(q => q.eq(q.field("companyId"), args.id))
      .collect();
      
    for (const invite of invites) {
      await ctx.db.delete(invite._id);
    }

    const company = await ctx.db.get(args.id);
    // Erase the company entity representation globally
    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      actorId: adminId as any,
      actionType: "DELETE_COMPANY",
      entityId: args.id,
      entityType: "companies",
      metadata: JSON.stringify({ name: company?.name }),
      timestamp: Date.now()
    });

    return true;
  },
});

export const updateCompanyPrompt = mutation({
  args: { id: v.id("companies"), systemPrompt: v.string() },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Admin Request");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized: System level clearance required.");
    }

    await ctx.db.patch(args.id, { systemPrompt: args.systemPrompt });
    return args.id;
  },
});

export const updateCompanyDescription = mutation({
  args: { id: v.id("companies"), description: v.string() },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Admin Request");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized: System level clearance required.");
    }

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
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Admin Request");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "SUPER_ADMIN") {
       throw new Error("Unauthorized: System level clearance required.");
    }

    const previous = await ctx.db.get(args.id);
    await ctx.db.patch(args.id, { 
      name: args.name, 
      description: args.description,
      overview: args.overview,
    });

    await ctx.db.insert("auditLogs", {
      actorId: adminId as any,
      actionType: "UPDATE_COMPANY_PROFILE",
      entityId: args.id,
      entityType: "companies",
      metadata: JSON.stringify({ previousName: previous?.name, newName: args.name }),
      timestamp: Date.now()
    });

    return args.id;
  },
});
