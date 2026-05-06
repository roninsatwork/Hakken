import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";

// Secure API endpoint to fetch all threads across the platform with user data joined
export const getOffsetPaginatedThreads = query({
  args: { 
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number()
  },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Admin Request");

    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN") throw new Error("Unauthorized: Top level clearance required.");

    // Fetch the raw threads
    const allThreads = await ctx.db
      .query("threads")
      .order("desc")
      .take(10000);

    // Setup payload
    let finalPayload = allThreads;

    // Filter post-fetch if a search term is provided
    if (args.searchTerm && args.searchTerm.trim() !== "") {
        const term = args.searchTerm.toLowerCase();
        
        // Only enrich the minimal attributes inside filter evaluation
        finalPayload = [];
        for (const t of allThreads) {
            let uName = "";
            let uEmail = "";
            if (t.userId) {
                const u = await ctx.db.get(t.userId);
                if (u) { uName = (u.name || "").toLowerCase(); uEmail = (u.email || "").toLowerCase(); }
            }
            if (
                (t.title && t.title.toLowerCase().includes(term)) ||
                (uName.includes(term)) ||
                (uEmail.includes(term))
            ) {
                finalPayload.push(t);
            }
        }
    }

    const totalCount = finalPayload.length;
    const totalPages = Math.ceil(totalCount / args.pageSize) || 1;
    const startIndex = (args.page - 1) * args.pageSize;
    const pageSlice = finalPayload.slice(startIndex, startIndex + args.pageSize);

    // Map over the chunk to manually join the user identity
    const enrichedThreads = await Promise.all(
      pageSlice.map(async (thread) => {
        const user = thread.userId ? await ctx.db.get(thread.userId) : null;
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

    return {
      data: enrichedThreads,
      totalPages,
      totalCount
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
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthenticated Request");

    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN") {
        if (admin?.role !== "ADMIN" || !admin.companyId || admin.companyId !== args.companyId) {
            throw new Error("Unauthorized");
        }
    }

    const allThreads = await ctx.db
      .query("threads")
      .withIndex("by_company", q => q.eq("companyId", args.companyId))
      .order("desc")
      .take(10000);

    let finalPayload = allThreads;

    if (args.searchTerm && args.searchTerm.trim() !== "") {
        const term = args.searchTerm.toLowerCase();
        
        finalPayload = [];
        for (const t of allThreads) {
            let uName = "";
            let uEmail = "";
            if (t.userId) {
                const u = await ctx.db.get(t.userId);
                if (u) { uName = (u.name || "").toLowerCase(); uEmail = (u.email || "").toLowerCase(); }
            }
            if (
                (t.title && t.title.toLowerCase().includes(term)) ||
                (uName.includes(term)) ||
                (uEmail.includes(term)) ||
                (t.sourceUrl && t.sourceUrl.toLowerCase().includes(term))
            ) {
                finalPayload.push(t);
            }
        }
    }

    const totalCount = finalPayload.length;
    const totalPages = Math.ceil(totalCount / args.pageSize) || 1;
    const startIndex = (args.page - 1) * args.pageSize;
    const pageSlice = finalPayload.slice(startIndex, startIndex + args.pageSize);

    const enrichedThreads = await Promise.all(
      pageSlice.map(async (thread) => {
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

    return {
      data: enrichedThreads,
      totalPages,
      totalCount
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
        if (admin?.role !== "ADMIN" || !admin.companyId || !thread || thread.companyId !== admin.companyId) {
            throw new Error("Unauthorized: Cross-boundary access denied.");
        }
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(10000);
  },
});
