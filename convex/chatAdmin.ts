import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";

// Secure API endpoint to fetch all threads across the platform with user data joined
export const getAllThreadsAdmin = query({
  args: { paginationOpts: paginationOptsValidator, searchTerm: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Admin Request");

    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN") throw new Error("Unauthorized: Top level clearance required.");

    // Fetch the raw paginated threads
    const pagedThreads = await ctx.db
      .query("threads")
      .order("desc")
      .paginate(args.paginationOpts);

    // Map over the threads to manually join the user identity
    const enrichedThreads = await Promise.all(
      pagedThreads.page.map(async (thread) => {
        const user = await ctx.db.get(thread.userId);
        return {
          ...thread,
          user: user ? {
             name: user.name || "Unknown User",
             email: user.email || "No Email",
             image: user.image || "https://api.dicebear.com/7.x/notionists/svg",
          } : null
        };
      })
    );

    // Filter post-fetch if a search term is provided
    // Note: In an extreme scaling scenario, search should be handled by Convex full-text search index, but for this volume, array filtering works.
    let finalPayload = enrichedThreads;
    if (args.searchTerm && args.searchTerm.trim() !== "") {
        const term = args.searchTerm.toLowerCase();
        finalPayload = enrichedThreads.filter(t => 
             (t.title && t.title.toLowerCase().includes(term)) ||
             (t.user && t.user.name.toLowerCase().includes(term)) ||
             (t.user && t.user.email.toLowerCase().includes(term))
        );
    }

    return {
      ...pagedThreads,
      page: finalPayload,
    };
  },
});

export const getCompanyThreadsAdmin = query({
  args: { 
    companyId: v.id("companies"), 
    paginationOpts: paginationOptsValidator, 
    searchTerm: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Request");

    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN" && admin?.companyId !== args.companyId) {
        throw new Error("Unauthorized");
    }

    const pagedThreads = await ctx.db
      .query("threads")
      .withIndex("by_company", q => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);

    const enrichedThreads = await Promise.all(
      pagedThreads.page.map(async (thread) => {
        let user = null;
        if (thread.userId) {
            user = await ctx.db.get(thread.userId);
        }
        return {
          ...thread,
          user: user ? {
             name: user.name || "Widget Visitor",
             email: user.email || "No Email",
             image: user.image || "https://api.dicebear.com/7.x/notionists/svg",
          } : null
        };
      })
    );

    let finalPayload = enrichedThreads;
    if (args.searchTerm && args.searchTerm.trim() !== "") {
        const term = args.searchTerm.toLowerCase();
        finalPayload = enrichedThreads.filter(t => 
             (t.title && t.title.toLowerCase().includes(term)) ||
             (t.user && t.user.name.toLowerCase().includes(term)) ||
             (t.user && t.user.email.toLowerCase().includes(term)) ||
             (t.sourceUrl && t.sourceUrl.toLowerCase().includes(term))
        );
    }

    return {
      ...pagedThreads,
      page: finalPayload,
    };
  },
});

// Secure API endpoint to fetch the raw timeline for any specific thread ID
export const getAdminThreadMessages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Admin Request");

    const admin = await ctx.db.get(adminId);
    const thread = await ctx.db.get(args.threadId);
    
    if (admin?.role !== "SUPER_ADMIN") {
        if (!thread || thread.companyId !== admin?.companyId) {
            throw new Error("Unauthorized: Cross-boundary access denied.");
        }
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});
