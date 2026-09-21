import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { adminQuery, superAdminQuery } from "./tenantFunctions";
import {
  canReadCompanyThreads,
  getThreadUserSummary,
  normalizeSearchTerm,
  paginateItems,
  threadMatchesSearch,
} from "./chatAdminService";
import { appError } from "./utils/appError";
import { toClientAdminThread } from "./utils/chatAdminShapes";
import * as chatAdminShapes from "./utils/chatAdminShapes";
import { getDecision } from "./decisionRegistry";

const CHAT_LOG_SEARCH_CANDIDATE_LIMIT = 500;
const ADMIN_THREAD_MESSAGE_LIMIT = 500;

// Secure API endpoint to fetch all threads across the platform with user data joined
export const getOffsetPaginatedThreads = superAdminQuery({
  args: { 
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number()
  },
  returns: chatAdminShapes.offsetThreadPageShape,
  handler: async (ctx, args) => {
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
          ...toClientAdminThread(thread),
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

export const getOffsetPaginatedCompanyThreads = adminQuery({
  args: { 
    companyId: v.id("companies"), 
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number()
  },
  returns: chatAdminShapes.offsetThreadPageShape,
  handler: async (ctx, args) => {
    const { user: admin } = ctx;
    if (!canReadCompanyThreads(admin, args.companyId)) {
      throw appError("UNAUTHORIZED", "Unauthorized");
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
          ...toClientAdminThread(thread),
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

export const getPaginatedThreads = superAdminQuery({
  args: {
    searchTerm: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: chatAdminShapes.adminThreadPageShape,
  handler: async (ctx, args) => {
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
            ...toClientAdminThread(thread),
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
          ...toClientAdminThread(thread),
          user: getThreadUserSummary(user, "Unknown User"),
        };
      })
    );

    return { ...threads, page };
  },
});

export const getPaginatedCompanyThreads = adminQuery({
  args: {
    companyId: v.id("companies"),
    searchTerm: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: chatAdminShapes.adminThreadPageShape,
  handler: async (ctx, args) => {
    const { user: admin } = ctx;
    if (!canReadCompanyThreads(admin, args.companyId)) {
      throw appError("UNAUTHORIZED", "Unauthorized");
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
            ...toClientAdminThread(thread),
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
          ...toClientAdminThread(thread),
          user: getThreadUserSummary(user, "Widget Visitor"),
        };
      })
    );

    return { ...threads, page };
  },
});

export const getCompanyThreadById = adminQuery({
  args: {
    companyId: v.id("companies"),
    threadId: v.id("threads"),
  },
  returns: chatAdminShapes.clientAdminThreadShape,
  handler: async (ctx, args) => {
    const { user: admin } = ctx;
    if (!canReadCompanyThreads(admin, args.companyId)) {
      throw appError("UNAUTHORIZED", "Unauthorized");
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.companyId !== args.companyId) {
      throw appError("NOT_FOUND", "Thread not found");
    }

    const user = thread.userId ? await ctx.db.get(thread.userId) : null;
    return {
      ...toClientAdminThread(thread),
      user: getThreadUserSummary(user, "Widget Visitor"),
    };
  },
});

// Secure API endpoint to fetch the raw timeline for any specific thread ID
/**
 * The Decision runs filed against a thread, oldest first, so the chat logs
 * can pin each to the user message it judged (decisions-typesafe-plan.md,
 * Phase E). Same access rule as the messages themselves.
 */
export const getAdminThreadDecisions = adminQuery({
  args: { threadId: v.id("threads") },
  returns: chatAdminShapes.adminThreadDecisionsShape,
  handler: async (ctx, args) => {
    const { user: admin } = ctx;
    const thread = await ctx.db.get(args.threadId);
    if (admin.role !== "SUPER_ADMIN" && (!thread?.companyId || !canReadCompanyThreads(admin, thread.companyId))) {
      throw appError("UNAUTHORIZED", "Unauthorized: Cross-boundary access denied.");
    }
    const runs = await ctx.db
      .query("decisionRuns")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(ADMIN_THREAD_MESSAGE_LIMIT * 3);
    return runs.map((run) => ({
      key: run.decisionKey,
      copyKey: getDecision(run.decisionKey)?.copyKey ?? run.decisionKey,
      answer: run.answer,
      ...(run.certainty ? { certainty: run.certainty } : {}),
      source: run.source,
      ...(run.probabilities ? { probabilities: run.probabilities } : {}),
      createdAt: run.createdAt,
    }));
  },
});

export const getAdminThreadMessages = adminQuery({
  args: { threadId: v.id("threads") },
  returns: chatAdminShapes.adminThreadMessagesShape,
  handler: async (ctx, args) => {
    const { user: admin } = ctx;
    const thread = await ctx.db.get(args.threadId);
    
    if (admin.role !== "SUPER_ADMIN" && (!thread?.companyId || !canReadCompanyThreads(admin, thread.companyId))) {
      throw appError("UNAUTHORIZED", "Unauthorized: Cross-boundary access denied.");
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(ADMIN_THREAD_MESSAGE_LIMIT);
  },
});
