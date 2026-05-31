import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdmin, requireSuperAdmin } from "./authz";
import {
  canReadCompanyThreads,
  getThreadUserSummary,
  normalizeSearchTerm,
  paginateItems,
  threadMatchesSearch,
} from "./chatAdminService";

// Secure API endpoint to fetch all threads across the platform with user data joined
export const getOffsetPaginatedThreads = query({
  args: { 
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number()
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized: Top level clearance required.", "Unauthenticated Admin Request");

    // Fetch the raw threads
    const allThreads = await ctx.db
      .query("threads")
      .order("desc")
      .take(10000);

    const term = normalizeSearchTerm(args.searchTerm);
    const finalPayload = [];
    for (const thread of allThreads) {
      const user = thread.userId ? await ctx.db.get(thread.userId) : null;
      if (!term || threadMatchesSearch({ thread, user, term })) {
        finalPayload.push({ thread, user });
      }
    }

    const page = paginateItems(finalPayload, args.page, args.pageSize);

    // Map over the chunk to manually join the user identity
    const enrichedThreads = page.data.map(({ thread, user }) => {
        return {
          ...thread,
          user: getThreadUserSummary(user, "Unknown User")
        };
      });

    return {
      data: enrichedThreads,
      totalPages: page.totalPages,
      totalCount: page.totalCount
    };
  },
});

export const getOffsetPaginatedCompanyThreads = query({
  args: { 
    companyId: v.id("companies"), 
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number()
  },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated Request");
    if (!canReadCompanyThreads(admin, args.companyId)) {
      throw new Error("Unauthorized");
    }

    const allThreads = await ctx.db
      .query("threads")
      .withIndex("by_company", q => q.eq("companyId", args.companyId))
      .order("desc")
      .take(10000);

    const term = normalizeSearchTerm(args.searchTerm);
    const finalPayload = [];
    for (const thread of allThreads) {
      const user = thread.userId ? await ctx.db.get(thread.userId) : null;
      if (!term || threadMatchesSearch({ thread, user, term, includeSourceUrl: true })) {
        finalPayload.push({ thread, user });
      }
    }

    const page = paginateItems(finalPayload, args.page, args.pageSize);

    const enrichedThreads = page.data.map(({ thread, user }) => {
        return {
          ...thread,
          user: getThreadUserSummary(user, "Widget Visitor")
        };
      });

    return {
      data: enrichedThreads,
      totalPages: page.totalPages,
      totalCount: page.totalCount
    };
  },
});

// Secure API endpoint to fetch the raw timeline for any specific thread ID
export const getAdminThreadMessages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx, "Unauthorized: Cross-boundary access denied.", "Unauthenticated Admin Request");
    const thread = await ctx.db.get(args.threadId);
    
    if (admin.role !== "SUPER_ADMIN" && (!thread?.companyId || !canReadCompanyThreads(admin, thread.companyId))) {
      throw new Error("Unauthorized: Cross-boundary access denied.");
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(10000);
  },
});
