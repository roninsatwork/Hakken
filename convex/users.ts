import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { auth } from "./auth";

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    
    return await ctx.db.get(userId);
  },
});

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

// === User Management CRUD Operations ===

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(callerId);
    if (!caller || !caller.role) throw new Error("Unauthorized");

    if (caller.role === "SUPER_ADMIN") {
      return await ctx.db.query("users").order("desc").collect();
    } else if (caller.role === "ADMIN") {
      if (!caller.companyId) return [];
      const allUsers = await ctx.db.query("users").order("desc").collect();
      return allUsers.filter(u => u.companyId === caller.companyId);
    }
    
    throw new Error("Unauthorized");
  },
});

export const getUsersByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(callerId);
    if (!caller || !caller.role) throw new Error("Unauthorized");

    if (caller.role === "SUPER_ADMIN" || (caller.role === "ADMIN" && caller.companyId === args.companyId)) {
       const allUsers = await ctx.db.query("users").order("desc").collect();
       return allUsers.filter(u => u.companyId === args.companyId);
    }
    
    throw new Error("Unauthorized");
  },
});

export const getSuperAdmins = query({
  args: {},
  handler: async (ctx) => {
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(callerId);
    if (!caller || caller.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const allUsers = await ctx.db.query("users").order("desc").collect();
    return allUsers.filter(u => u.role === "SUPER_ADMIN");
  },
});

export const getUserById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const addUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.string(),
    image: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    // Basic implementation: manually created users get a distinct token pattern
    const fakeTokenId = `manual|${Date.now()}|${Math.random().toString(36).substring(7)}`;
    return await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      role: args.role as "USER" | "ADMIN" | "SUPER_ADMIN",
      image: args.image,
      companyId: args.companyId,
      tokenIdentifier: fakeTokenId,
      createdAt: Date.now(),
    });
  },
});

export const updateUser = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
    image: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { id, role, companyId, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      ...(role !== undefined && { role: role as "USER" | "ADMIN" | "SUPER_ADMIN" }),
      ...(companyId !== undefined && { companyId })
    });
    return id;
  },
});

export const cascadeDeleteUserAction = async (ctx: MutationCtx, userId: Id<"users">) => {
  const logins = await ctx.db.query("logins").withIndex("by_user", q => q.eq("userId", userId)).collect();
  for (const login of logins) await ctx.db.delete(login._id);

  const threads = await ctx.db.query("threads").withIndex("by_user", q => q.eq("userId", userId)).collect();
  for (const thread of threads) {
    const messages = await ctx.db.query("messages").withIndex("by_thread", q => q.eq("threadId", thread._id)).collect();
    for (const msg of messages) await ctx.db.delete(msg._id);
    await ctx.db.delete(thread._id);
  }

  const rules = await ctx.db.query("aiRules").filter(q => q.eq(q.field("createdBy"), userId)).collect();
  for (const rule of rules) await ctx.db.delete(rule._id);

  await ctx.db.delete(userId);
};

export const deleteUser = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await cascadeDeleteUserAction(ctx, args.id);
    return true;
  },
});

export const updateMyProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    image: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    
    if (!userId) {
      throw new Error("Target identity unauthenticated or session expired");
    }

    let resolvedImageUrl = args.image;
    if (args.storageId) {
      resolvedImageUrl = (await ctx.storage.getUrl(args.storageId)) ?? args.image;
    }

    // Only patch the explicitly allowed editable fields
    await ctx.db.patch(userId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.phone !== undefined && { phone: args.phone }),
      ...(resolvedImageUrl !== undefined && { image: resolvedImageUrl }),
    });

    return userId;
  },
});

// === Login Tracking ===

export const getLogins = query({
  args: { 
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Unauthenticated request");
    }
    
    // If tracking terminal inputs
    if (args.searchTerm && args.searchTerm.trim() !== "") {
       return await ctx.db
        .query("logins")
        .withSearchIndex("search_device", (q) => 
           q.search("device", args.searchTerm!).eq("userId", userId)
        )
        .paginate(args.paginationOpts);
    }
    
    return await ctx.db
      .query("logins")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
  }
});

export const getUserLogins = query({
  args: { 
    userId: v.id("users"),
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Basic verification
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");

    if (args.searchTerm && args.searchTerm.trim() !== "") {
       return await ctx.db
        .query("logins")
        .withSearchIndex("search_device", (q) => 
           q.search("device", args.searchTerm!).eq("userId", args.userId)
        )
        .paginate(args.paginationOpts);
    }
    
    return await ctx.db
      .query("logins")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);
  }
});

export const recordLogin = mutation({
  args: {
    device: v.string(),
    ip: v.string(),
    location: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    
    // Prevent duplicated spam tracks logically
    const lastLogin = await ctx.db
      .query("logins")
      .withIndex("by_user", q => q.eq("userId", userId))
      .order("desc")
      .first();
      
    // 60-minute identical device throttling limit to prevent spam when refreshing
    if (lastLogin && (Date.now() - lastLogin.timestamp < 60 * 60 * 1000) && lastLogin.device === args.device && lastLogin.ip === args.ip) {
      return lastLogin._id;
    }

    return await ctx.db.insert("logins", {
      userId,
      device: args.device,
      ip: args.ip,
      location: args.location,
      status: "SUCCESS",
      timestamp: Date.now()
    });
  }
});
