import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireAdmin, requireSuperAdmin } from "./authz";
import {
  canReadCompanyThreads,
  getThreadUserSummary,
  normalizeSearchTerm,
  paginateItems,
  threadMatchesSearch,
} from "./chatAdminService";

const CHAT_LOG_SEARCH_CANDIDATE_LIMIT = 500;
const ADMIN_THREAD_MESSAGE_LIMIT = 500;

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
      .withIndex("by_updatedAt")
      .order("desc")
      .take(CHAT_LOG_SEARCH_CANDIDATE_LIMIT);

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
      .take(CHAT_LOG_SEARCH_CANDIDATE_LIMIT);

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

export const getPaginatedThreads = query({
  args: {
    searchTerm: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized: Top level clearance required.", "Unauthenticated Admin Request");

    const term = normalizeSearchTerm(args.searchTerm);
    if (term) {
      const recentThreads = await ctx.db
        .query("threads")
        .withIndex("by_updatedAt")
        .order("desc")
        .take(CHAT_LOG_SEARCH_CANDIDATE_LIMIT);
      const page = [];

      for (const thread of recentThreads) {
        const user = thread.userId ? await ctx.db.get(thread.userId) : null;
        if (threadMatchesSearch({ thread, user, term })) {
          page.push({
            ...thread,
            user: getThreadUserSummary(user, "Unknown User"),
          });
        }
        if (page.length >= args.paginationOpts.numItems) break;
      }

      return { page, isDone: true, continueCursor: "" };
    }

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_updatedAt")
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      threads.page.map(async (thread) => {
        const user = thread.userId ? await ctx.db.get(thread.userId) : null;
        return {
          ...thread,
          user: getThreadUserSummary(user, "Unknown User"),
        };
      })
    );

    return { ...threads, page };
  },
});

export const getPaginatedCompanyThreads = query({
  args: {
    companyId: v.id("companies"),
    searchTerm: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated Request");
    if (!canReadCompanyThreads(admin, args.companyId)) {
      throw new Error("Unauthorized");
    }

    const term = normalizeSearchTerm(args.searchTerm);
    if (term) {
      const recentThreads = await ctx.db
        .query("threads")
        .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
        .order("desc")
        .take(CHAT_LOG_SEARCH_CANDIDATE_LIMIT);
      const page = [];

      for (const thread of recentThreads) {
        const user = thread.userId ? await ctx.db.get(thread.userId) : null;
        if (threadMatchesSearch({ thread, user, term, includeSourceUrl: true })) {
          page.push({
            ...thread,
            user: getThreadUserSummary(user, "Widget Visitor"),
          });
        }
        if (page.length >= args.paginationOpts.numItems) break;
      }

      return { page, isDone: true, continueCursor: "" };
    }

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      threads.page.map(async (thread) => {
        const user = thread.userId ? await ctx.db.get(thread.userId) : null;
        return {
          ...thread,
          user: getThreadUserSummary(user, "Widget Visitor"),
        };
      })
    );

    return { ...threads, page };
  },
});

export const getCompanyThreadById = query({
  args: {
    companyId: v.id("companies"),
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const { user: admin } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated Request");
    if (!canReadCompanyThreads(admin, args.companyId)) {
      throw new Error("Unauthorized");
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.companyId !== args.companyId) {
      throw new Error("Thread not found");
    }

    const user = thread.userId ? await ctx.db.get(thread.userId) : null;
    return {
      ...thread,
      user: getThreadUserSummary(user, "Widget Visitor"),
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
      .take(ADMIN_THREAD_MESSAGE_LIMIT);
  },
});
