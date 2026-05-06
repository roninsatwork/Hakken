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

    if (args.searchTerm && args.searchTerm.trim() !== "") {
      return await ctx.db
        .query("properties")
        .withSearchIndex("search_address", (q) => 
          q.search("address", args.searchTerm!).eq("companyId", user.companyId)
        )
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("properties")
      .withIndex("by_company", q => q.eq("companyId", user.companyId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getPropertiesCount = query({
  args: { searchTerm: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;
    
    if (args.searchTerm && args.searchTerm.trim() !== "") {
       const properties = await ctx.db
        .query("properties")
        .withSearchIndex("search_address", (q) => 
           q.search("address", args.searchTerm!).eq("companyId", user.companyId)
        )
        .take(10000);
       return properties.length;
    }
    
    const properties = await ctx.db
      .query("properties")
      .withIndex("by_company", (q) => q.eq("companyId", user.companyId))
      .take(10000);
    return properties.length;
  }
});

export const getProperty = query({
  args: { id: v.id("properties") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    const property = await ctx.db.get(args.id);
    if (!property) return null;

    if (user.role !== "SUPER_ADMIN" && property.companyId !== user.companyId) {
      throw new Error("Unauthorized");
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

    if (user.role !== "SUPER_ADMIN" && property.companyId !== user.companyId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.id);
  },
});

export const getLatestRuns = query(async (ctx) => {
  const user = await getCurrentUser(ctx);
  if (!user) return [];
  return await ctx.db.query("apifyRuns")
    .withIndex("by_company", q => q.eq("companyId", user.companyId))
    .order("desc")
    .take(5);
});

export const getAllRunsAdmin = query(async (ctx) => {
  return await ctx.db.query("apifyRuns").order("desc").take(5);
});


