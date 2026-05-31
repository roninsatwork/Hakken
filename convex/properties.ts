import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getActiveCompanyId, getCurrentUser, requireCurrentUser, requireSuperAdmin } from "./authz";

function getPropertyScope(user: Doc<"users">) {
  const activeCompanyId = getActiveCompanyId(user);
  return {
    activeCompanyId,
    canReadAllCompanies: user.role === "SUPER_ADMIN" && !activeCompanyId,
  };
}

export const listProperties = query({
  args: {
    paginationOpts: v.any(),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCurrentUser(ctx);
    const { activeCompanyId, canReadAllCompanies } = getPropertyScope(user);

    if (args.searchTerm && args.searchTerm.trim() !== "") {
      if (canReadAllCompanies) {
        return await ctx.db
          .query("properties")
          .withSearchIndex("search_address", (q) =>
            q.search("address", args.searchTerm!)
          )
          .paginate(args.paginationOpts);
      }

      if (!activeCompanyId) throw new Error("Unauthorized");
      return await ctx.db
        .query("properties")
        .withSearchIndex("search_address", (q) =>
          q.search("address", args.searchTerm!).eq("companyId", activeCompanyId)
        )
        .paginate(args.paginationOpts);
    }

    if (canReadAllCompanies) {
      return await ctx.db
        .query("properties")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    if (!activeCompanyId) throw new Error("Unauthorized");
    return await ctx.db
      .query("properties")
      .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getPropertiesCount = query({
  args: { searchTerm: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return 0;

    const { activeCompanyId, canReadAllCompanies } = getPropertyScope(current.user);

    if (args.searchTerm && args.searchTerm.trim() !== "") {
      if (canReadAllCompanies) {
        const properties = await ctx.db
          .query("properties")
          .withSearchIndex("search_address", (q) =>
            q.search("address", args.searchTerm!)
          )
          .take(10000);
        return properties.length;
      }

      if (!activeCompanyId) return 0;
      const properties = await ctx.db
        .query("properties")
        .withSearchIndex("search_address", (q) =>
          q.search("address", args.searchTerm!).eq("companyId", activeCompanyId)
        )
        .take(10000);
      return properties.length;
    }

    if (canReadAllCompanies) {
      const properties = await ctx.db
        .query("properties")
        .take(10000);
      return properties.length;
    }

    if (!activeCompanyId) return 0;
    const properties = await ctx.db
      .query("properties")
      .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
      .take(10000);
    return properties.length;
  }
});

export const getProperty = query({
  args: { id: v.id("properties") },
  handler: async (ctx, args) => {
    const { user } = await requireCurrentUser(ctx);

    const property = await ctx.db.get(args.id);
    if (!property) return null;

    const { activeCompanyId, canReadAllCompanies } = getPropertyScope(user);
    if (!canReadAllCompanies) {
      if (property.companyId !== activeCompanyId) {
        throw new Error("Unauthorized");
      }
    }

    return property;
  },
});

export const deleteProperty = mutation({
  args: { id: v.id("properties") },
  handler: async (ctx, args) => {
    const { user } = await requireCurrentUser(ctx);

    const property = await ctx.db.get(args.id);
    if (!property) throw new Error("Property not found");

    const { activeCompanyId, canReadAllCompanies } = getPropertyScope(user);
    if (!canReadAllCompanies) {
      if (property.companyId !== activeCompanyId) {
        throw new Error("Unauthorized");
      }
    }

    await ctx.db.delete(args.id);
  },
});

export const getLatestRuns = query(async (ctx) => {
  const current = await getCurrentUser(ctx);
  if (!current) return [];

  const { activeCompanyId, canReadAllCompanies } = getPropertyScope(current.user);

  if (canReadAllCompanies) {
    return await ctx.db.query("apifyRuns")
      .order("desc")
      .take(5);
  }

  if (!activeCompanyId) return [];
  return await ctx.db.query("apifyRuns")
    .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
    .order("desc")
    .take(5);
});

export const getAllRunsAdmin = query(async (ctx) => {
  await requireSuperAdmin(ctx, "Unauthorized", "Unauthorized");
  return await ctx.db.query("apifyRuns").order("desc").take(5);
});
