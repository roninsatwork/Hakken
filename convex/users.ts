import { mutation, query, internalQuery, MutationCtx } from "./_generated/server";
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

export const getUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const generateUploadUrl = mutation(async (ctx) => {
  const userId = await auth.getUserId(ctx);
  if (!userId) throw new Error("Unauthenticated request");
  return await ctx.storage.generateUploadUrl();
});

// === User Management CRUD Operations ===

export const getPaginatedUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(callerId);
    if (!caller || !caller.role) throw new Error("Unauthorized");

    // Dynamic Database Query Object
    const userQuery = ctx.db.query("users");

    if (caller.role === "ADMIN") {
      if (!caller.companyId) throw new Error("Unauthorized");
      // Admins are locked to their specific tenant scope
      if (args.searchTerm && args.searchTerm.trim() !== "") {
        return await ctx.db
          .query("users")
          .withSearchIndex("search_email", (q) => q.search("email", args.searchTerm!))
          .filter(q => q.eq(q.field("companyId"), caller.companyId))
          .paginate(args.paginationOpts);
      } else {
        return await ctx.db
          .query("users")
          .withIndex("by_company", (q) => q.eq("companyId", caller.companyId))
          .order("desc")
          .paginate(args.paginationOpts);
      }
    } else if (caller.role === "SUPER_ADMIN") {
      // Super Admins map globally
      if (args.searchTerm && args.searchTerm.trim() !== "") {
        return await ctx.db
          .query("users")
          .withSearchIndex("search_email", (q) => q.search("email", args.searchTerm!))
          .paginate(args.paginationOpts);
      } else {
        return await ctx.db
          .query("users")
          .order("desc")
          .paginate(args.paginationOpts);
      }
    }

    throw new Error("Unauthorized");
  },
});

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(callerId);
    if (!caller || !caller.role) throw new Error("Unauthorized");

    if (caller.role === "SUPER_ADMIN") {
      return await ctx.db.query("users").order("desc").take(1000);
    } else if (caller.role === "ADMIN") {
      if (!caller.companyId) return [];
      return await ctx.db
        .query("users")
        .withIndex("by_company", (q) => q.eq("companyId", caller.companyId))
        .order("desc")
        .take(1000);
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
       return await ctx.db
         .query("users")
         .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
         .order("desc")
         .take(1000);
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

    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "SUPER_ADMIN"))
      .order("desc")
      .take(1000);
  },
});

export const getUserById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const caller = await ctx.db.get(callerId);
    if (!caller) throw new Error("Unauthorized");
    
    const targetUser = await ctx.db.get(args.id);
    if (!targetUser) return null;

    if (caller.role === "SUPER_ADMIN" || caller._id === args.id) {
       return targetUser;
    }
    
    if (caller.companyId === targetUser.companyId) {
       return targetUser;
    }

    throw new Error("Unauthorized");
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
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const caller = await ctx.db.get(callerId);
    if (!caller || !caller.role) throw new Error("Unauthorized");

    if (caller.role !== "SUPER_ADMIN") {
      if (caller.role !== "ADMIN" || caller.companyId !== args.companyId) {
        throw new Error("Unauthorized");
      }
      if (args.role === "SUPER_ADMIN") {
        throw new Error("Unauthorized: Insufficient privileges");
      }
    }

    // Basic implementation: manually created users get a distinct token pattern
    const fakeTokenId = `manual|${Date.now()}|${Math.random().toString(36).substring(7)}`;
    const newUserId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      role: args.role as "USER" | "ADMIN" | "SUPER_ADMIN",
      image: args.image,
      companyId: args.companyId,
      tokenIdentifier: fakeTokenId,
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_USER",
      actorId: callerId as any,
      entityType: "users",
      entityId: newUserId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ email: args.email, role: args.role, companyId: args.companyId })
    });

    return newUserId;
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
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const caller = await ctx.db.get(callerId);
    if (!caller || !caller.role) throw new Error("Unauthorized");

    const targetUser = await ctx.db.get(args.id);
    if (!targetUser) throw new Error("User not found");

    if (caller.role !== "SUPER_ADMIN") {
      if (caller.role !== "ADMIN" || caller.companyId !== targetUser.companyId) {
        throw new Error("Unauthorized");
      }
      if (targetUser.role === "SUPER_ADMIN") {
        throw new Error("Unauthorized: Cannot modify a Super Administrator");
      }
      if (args.role === "SUPER_ADMIN" || (args.companyId && args.companyId !== caller.companyId)) {
        throw new Error("Unauthorized: Insufficient privileges");
      }
    }

    const { id, role, companyId, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      ...(role !== undefined && { role: role as "USER" | "ADMIN" | "SUPER_ADMIN" }),
      ...(companyId !== undefined && { companyId })
    });

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_USER",
      actorId: callerId as any,
      entityType: "users",
      entityId: id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ updatedRole: role, updatedCompanyId: companyId })
    });

    return id;
  },
});

export const cascadeDeleteUserAction = async (ctx: MutationCtx, userId: Id<"users">) => {
  const logins = await ctx.db.query("logins").withIndex("by_user", q => q.eq("userId", userId)).take(1000);
  for (const login of logins) await ctx.db.delete(login._id);

  const threads = await ctx.db.query("threads").withIndex("by_user", q => q.eq("userId", userId)).take(1000);
  for (const thread of threads) {
    const messages = await ctx.db.query("messages").withIndex("by_thread", q => q.eq("threadId", thread._id)).take(1000);
    for (const msg of messages) await ctx.db.delete(msg._id);
    await ctx.db.delete(thread._id);
  }

  const rules = await ctx.db.query("aiRules").filter(q => q.eq(q.field("createdBy"), userId)).take(1000);
  for (const rule of rules) await ctx.db.delete(rule._id);

  await ctx.db.delete(userId);
};

export const deleteUser = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const callerId = await auth.getUserId(ctx);
    if (!callerId) throw new Error("Unauthenticated");
    const caller = await ctx.db.get(callerId);
    if (!caller || !caller.role) throw new Error("Unauthorized");

    const targetUser = await ctx.db.get(args.id);
    if (!targetUser) return false;

    if (caller.role !== "SUPER_ADMIN") {
      if (caller.role !== "ADMIN" || caller.companyId !== targetUser.companyId) {
        throw new Error("Unauthorized");
      }
      if (targetUser.role === "SUPER_ADMIN") {
        throw new Error("Unauthorized: Cannot delete a Super Administrator");
      }
    }

    await cascadeDeleteUserAction(ctx, args.id);

    await ctx.db.insert("auditLogs", {
      actionType: "DELETE_USER",
      actorId: callerId as any,
      entityType: "users",
      entityId: args.id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ email: targetUser.email, name: targetUser.name })
    });

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

    if (callerId !== args.userId) {
      const caller = await ctx.db.get(callerId);
      if (!caller || !caller.role) throw new Error("Unauthorized");
      
      const targetUser = await ctx.db.get(args.userId);
      if (!targetUser || (caller.role !== "SUPER_ADMIN" && (caller.role !== "ADMIN" || caller.companyId !== targetUser.companyId))) {
        throw new Error("Unauthorized");
      }
    }

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

export const getMyLoginsCount = query({
  args: { searchTerm: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return 0;
    
    if (args.searchTerm && args.searchTerm.trim() !== "") {
       const logins = await ctx.db
        .query("logins")
        .withSearchIndex("search_device", (q) => 
           q.search("device", args.searchTerm!).eq("userId", userId)
        )
        .take(10000);
       return logins.length;
    }
    
    const logins = await ctx.db
      .query("logins")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10000);
    return logins.length;
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
    
    const user = await ctx.db.get(userId);
    if (!user) return null;

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

    const loginId = await ctx.db.insert("logins", {
      userId,
      device: args.device,
      ip: args.ip,
      location: args.location,
      status: "SUCCESS",
      timestamp: Date.now(),
    });

    if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
       await ctx.db.insert("auditLogs", {
          actionType: "SYSTEM_AUTHENTICATION",
          actorId: userId,
          entityType: "users",
          entityId: "USER_SESSION",
          timestamp: Date.now(),
          metadata: JSON.stringify({ ip: args.ip, location: args.location })
       });
    }

    return loginId;
  }
});

export const recordLogout = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return;

    const user = await ctx.db.get(userId);
    if (!user) return;

    if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
      await ctx.db.insert("auditLogs", {
        actionType: "SYSTEM_DISCONNECTION",
        actorId: userId,
        entityType: "users",
        entityId: "USER_SESSION",
        timestamp: Date.now(),
        metadata: JSON.stringify({ action: "explicit_logout" })
      });
    }
  }
});

export const impersonateCompany = mutation({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    
    const caller = await ctx.db.get(userId);
    if (!caller || caller.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized: Only super admins can impersonate tenants");
    }

    await ctx.db.patch(userId, { companyId: args.companyId });

    await ctx.db.insert("auditLogs", {
      actionType: "IMPERSONATE_COMPANY",
      actorId: userId as any,
      entityType: "users",
      entityId: userId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ targetCompanyId: args.companyId || "None (Reverted)" })
    });

    return true;
  }
});
