import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

async function getCurrentUser(ctx: any) {
  const userId = await auth.getUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

export const listProperties = query({
  args: {
    paginationOpts: v.any(),
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    const activeCompanyId = user.impersonatingCompanyId || user.companyId;

    if (args.searchTerm && args.searchTerm.trim() !== "") {
      if (user.role !== "SUPER_ADMIN" || activeCompanyId) {
        if (!activeCompanyId) throw new Error("Unauthorized");
        return await ctx.db
          .query("properties")
          .withSearchIndex("search_address", (q) => 
            q.search("address", args.searchTerm!).eq("companyId", activeCompanyId)
          )
          .paginate(args.paginationOpts);
      } else {
        return await ctx.db
          .query("properties")
          .withSearchIndex("search_address", (q) => 
            q.search("address", args.searchTerm!)
          )
          .paginate(args.paginationOpts);
      }
    }

    if (user.role !== "SUPER_ADMIN" || activeCompanyId) {
      if (!activeCompanyId) throw new Error("Unauthorized");
      return await ctx.db
        .query("properties")
        .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      return await ctx.db
        .query("properties")
        .order("desc")
        .paginate(args.paginationOpts);
    }
  },
});

export const getPropertiesCount = query({
  args: { searchTerm: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;

    const activeCompanyId = user.impersonatingCompanyId || user.companyId;
    
    if (args.searchTerm && args.searchTerm.trim() !== "") {
      if (user.role !== "SUPER_ADMIN" || activeCompanyId) {
        if (!activeCompanyId) return 0;
        const properties = await ctx.db
          .query("properties")
          .withSearchIndex("search_address", (q) => 
            q.search("address", args.searchTerm!).eq("companyId", activeCompanyId)
          )
          .take(10000);
        return properties.length;
      } else {
        const properties = await ctx.db
          .query("properties")
          .withSearchIndex("search_address", (q) => 
            q.search("address", args.searchTerm!)
          )
          .take(10000);
        return properties.length;
      }
    }
    
    if (user.role !== "SUPER_ADMIN" || activeCompanyId) {
      if (!activeCompanyId) return 0;
      const properties = await ctx.db
        .query("properties")
        .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
        .take(10000);
      return properties.length;
    } else {
      const properties = await ctx.db
        .query("properties")
        .take(10000);
      return properties.length;
    }
  }
});

export const getProperty = query({
  args: { id: v.id("properties") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    const property = await ctx.db.get(args.id);
    if (!property) return null;

    const activeCompanyId = user.impersonatingCompanyId || user.companyId;

    if (user.role !== "SUPER_ADMIN" || activeCompanyId) {
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
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    const property = await ctx.db.get(args.id);
    if (!property) throw new Error("Property not found");

    const activeCompanyId = user.impersonatingCompanyId || user.companyId;

    if (user.role !== "SUPER_ADMIN" || activeCompanyId) {
      if (property.companyId !== activeCompanyId) {
        throw new Error("Unauthorized");
      }
    }

    await ctx.db.delete(args.id);
  },
});

export const getLatestRuns = query(async (ctx) => {
  const user = await getCurrentUser(ctx);
  if (!user) return [];

  const activeCompanyId = user.impersonatingCompanyId || user.companyId;

  if (user.role !== "SUPER_ADMIN" || activeCompanyId) {
    if (!activeCompanyId) return [];
    return await ctx.db.query("apifyRuns")
      .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
      .order("desc")
      .take(5);
  } else {
    return await ctx.db.query("apifyRuns")
      .order("desc")
      .take(5);
  }
});

export const getAllRunsAdmin = query(async (ctx) => {
  const user = await getCurrentUser(ctx);
  if (!user || user.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized");
  }
  return await ctx.db.query("apifyRuns").order("desc").take(5);
});


