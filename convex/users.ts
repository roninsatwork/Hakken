import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getActiveCompanyId, getCurrentUser, requireCurrentUser, requireSuperAdmin } from "./authz";
import {
  assertCanCreateManagedUser,
  assertCanDeleteManagedUser,
  assertCanUpdateManagedUser,
} from "./userManagementService";
import { incrementGlobalInventoryTotals } from "./utils/inventoryRollupService";
import { validateAdminImageMetadata, validateStoredUpload } from "./utils/uploadPolicy";

type UserPaginationResult = {
  page: Doc<"users">[];
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
};

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    return current?.user ?? null;
  },
});

export const getUserInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const generateUploadUrl = mutation(async (ctx) => {
  await requireCurrentUser(ctx, "Unauthenticated request");
  return await ctx.storage.generateUploadUrl();
});

// === User Management CRUD Operations ===

export const getPaginatedUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { user: caller } = await requireCurrentUser(ctx, "Unauthenticated");
    if (!caller || !caller.role) throw new Error("Unauthorized");
    
    const activeCompanyId = getActiveCompanyId(caller);

    const enrichUsers = async (users: Doc<"users">[]) => {
      const companyNames = new Map<string, string>();

      return await Promise.all(users.map(async (user) => {
        if (!user.companyId) {
          return { ...user, companyName: null };
        }

        const cachedName = companyNames.get(user.companyId);
        if (cachedName) {
          return { ...user, companyName: cachedName };
        }

        const company = await ctx.db.get(user.companyId);
        if (company) {
          companyNames.set(user.companyId, company.name);
        }

        return { ...user, companyName: company?.name ?? null };
      }));
    };
    const withCompanyNames = async (pageResult: UserPaginationResult) => ({
      ...pageResult,
      page: await enrichUsers(pageResult.page),
    });

    if (caller.role === "ADMIN" || (caller.role === "SUPER_ADMIN" && caller.impersonatingCompanyId)) {
      if (!activeCompanyId) throw new Error("Unauthorized");
      // Admins are locked to their specific tenant scope
      if (args.searchTerm && args.searchTerm.trim() !== "") {
        return await withCompanyNames(await ctx.db
          .query("users")
          .withSearchIndex("search_email", (q) => q.search("email", args.searchTerm!))
          .filter(q => q.eq(q.field("companyId"), activeCompanyId))
          .paginate(args.paginationOpts));
      } else {
        return await withCompanyNames(await ctx.db
          .query("users")
          .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
          .order("desc")
          .paginate(args.paginationOpts));
      }
    } else if (caller.role === "SUPER_ADMIN") {
      // Super Admins map globally
      if (args.searchTerm && args.searchTerm.trim() !== "") {
        return await withCompanyNames(await ctx.db
          .query("users")
          .withSearchIndex("search_email", (q) => q.search("email", args.searchTerm!))
          .paginate(args.paginationOpts));
      } else {
        return await withCompanyNames(await ctx.db
          .query("users")
          .order("desc")
          .paginate(args.paginationOpts));
      }
    }

    throw new Error("Unauthorized");
  },
});

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const { user: caller } = await requireCurrentUser(ctx, "Unauthenticated");
    if (!caller || !caller.role) throw new Error("Unauthorized");
    
    const activeCompanyId = getActiveCompanyId(caller);

    if (caller.role === "SUPER_ADMIN" && !caller.impersonatingCompanyId) {
      return await ctx.db.query("users").order("desc").take(1000);
    } else if (caller.role === "ADMIN" || caller.impersonatingCompanyId) {
      if (!activeCompanyId) return [];
      return await ctx.db
        .query("users")
        .withIndex("by_company", (q) => q.eq("companyId", activeCompanyId))
        .order("desc")
        .take(1000);
    }
    
    throw new Error("Unauthorized");
  },
});

export const getUsersByCompany = query({
  args: { 
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const { user: caller } = await requireCurrentUser(ctx, "Unauthenticated");
    if (!caller || !caller.role) throw new Error("Unauthorized");
    
    const activeCompanyId = getActiveCompanyId(caller);

    if (caller.role === "SUPER_ADMIN" || (caller.role === "ADMIN" && activeCompanyId === args.companyId)) {
       return await ctx.db
         .query("users")
         .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
         .order("desc")
         .paginate(args.paginationOpts);
    }
    
    throw new Error("Unauthorized");
  },
});

export const getSuperAdmins = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated");

    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "SUPER_ADMIN"))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getUserById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const { user: caller } = await requireCurrentUser(ctx, "Unauthenticated");
    
    const activeCompanyId = getActiveCompanyId(caller);
    
    const targetUser = await ctx.db.get(args.id);
    if (!targetUser) return null;

    if (caller.role === "SUPER_ADMIN" || caller._id === args.id) {
       return targetUser;
    }
    
    if (activeCompanyId === targetUser.companyId) {
       return targetUser;
    }

    throw new Error("Unauthorized");
  },
});

export const addUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("USER"), v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    image: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { userId: callerId, user: caller } = await requireCurrentUser(ctx, "Unauthenticated");
    if (!caller || !caller.role) throw new Error("Unauthorized");
    
    const activeCompanyId = getActiveCompanyId(caller);

    assertCanCreateManagedUser({
      caller,
      activeCompanyId,
      newRole: args.role,
      newCompanyId: args.companyId,
    });

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
    await incrementGlobalInventoryTotals(ctx, { usersDelta: 1 });

    await ctx.db.insert("auditLogs", {
      actionType: "CREATE_USER",
      actorId: callerId,
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
    role: v.optional(v.union(v.literal("USER"), v.literal("ADMIN"), v.literal("SUPER_ADMIN"))),
    image: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { userId: callerId, user: caller } = await requireCurrentUser(ctx, "Unauthenticated");
    if (!caller || !caller.role) throw new Error("Unauthorized");
    
    const activeCompanyId = getActiveCompanyId(caller);

    const targetUser = await ctx.db.get(args.id);
    if (!targetUser) throw new Error("User not found");

    assertCanUpdateManagedUser({
      caller,
      activeCompanyId,
      targetUser,
      nextRole: args.role,
      nextCompanyId: args.companyId,
    });

    const { id, role, companyId, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      ...(role !== undefined && { role: role as "USER" | "ADMIN" | "SUPER_ADMIN" }),
      ...(companyId !== undefined && { companyId })
    });

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_USER",
      actorId: callerId,
      entityType: "users",
      entityId: id,
      timestamp: Date.now(),
      metadata: JSON.stringify({ updatedRole: role, updatedCompanyId: companyId })
    });

    return id;
  },
});

export const purgeUserEntitiesInternal = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    let hasMore = false;
    
    const logins = await ctx.db.query("logins").withIndex("by_user", q => q.eq("userId", args.userId)).take(100);
    for (const login of logins) await ctx.db.delete(login._id);
    if (logins.length === 100) hasMore = true;

    const rules = await ctx.db.query("aiRules").filter(q => q.eq(q.field("createdBy"), args.userId)).take(100);
    for (const rule of rules) await ctx.db.delete(rule._id);
    if (rules.length === 100) hasMore = true;

    const threads = await ctx.db.query("threads").withIndex("by_user", q => q.eq("userId", args.userId)).take(10);
    for (const thread of threads) {
      const messages = await ctx.db.query("messages").withIndex("by_thread", q => q.eq("threadId", thread._id)).take(100);
      for (const msg of messages) await ctx.db.delete(msg._id);
      
      if (messages.length === 100) {
          hasMore = true;
      } else {
          await ctx.db.delete(thread._id);
      }
    }
    if (threads.length === 10) hasMore = true;

    if (hasMore) {
       await ctx.scheduler.runAfter(0, internal.users.purgeUserEntitiesInternal, { userId: args.userId });
    }
  }
});

export const deleteUser = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const { userId: callerId, user: caller } = await requireCurrentUser(ctx, "Unauthenticated");
    if (!caller || !caller.role) throw new Error("Unauthorized");
    
    const activeCompanyId = getActiveCompanyId(caller);

    const targetUser = await ctx.db.get(args.id);
    if (!targetUser) return false;

    assertCanDeleteManagedUser({
      caller,
      activeCompanyId,
      targetUser,
    });

    await ctx.scheduler.runAfter(0, internal.users.purgeUserEntitiesInternal, { userId: args.id });
    await ctx.db.delete(args.id);
    await incrementGlobalInventoryTotals(ctx, { usersDelta: -1 });

    await ctx.db.insert("auditLogs", {
      actionType: "DELETE_USER",
      actorId: callerId,
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
    const { userId } = await requireCurrentUser(ctx, "Target identity unauthenticated or session expired");

    let resolvedImageUrl = args.image;
    if (args.storageId) {
      await validateStoredUpload(ctx, args.storageId, validateAdminImageMetadata);
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
    const current = await getCurrentUser(ctx);
    if (!current) {
      throw new Error("Unauthenticated request");
    }

    if (current.user.role !== "SUPER_ADMIN") {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }
    
    // If tracking terminal inputs
    if (args.searchTerm && args.searchTerm.trim() !== "") {
       return await ctx.db
        .query("logins")
        .withSearchIndex("search_device", (q) => 
           q.search("device", args.searchTerm!).eq("userId", current.userId)
        )
        .paginate(args.paginationOpts);
    }
    
    return await ctx.db
      .query("logins")
      .withIndex("by_user", (q) => q.eq("userId", current.userId))
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
    const { userId: callerId, user: caller } = await requireCurrentUser(ctx, "Unauthenticated");

    if (callerId !== args.userId) {
      if (!caller || !caller.role) throw new Error("Unauthorized");
      
      const activeCompanyId = getActiveCompanyId(caller);
      
      const targetUser = await ctx.db.get(args.userId);
      if (!targetUser || (caller.role !== "SUPER_ADMIN" && activeCompanyId !== targetUser.companyId)) {
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
    const current = await getCurrentUser(ctx);
    if (!current || current.user.role !== "SUPER_ADMIN") return 0;
    
    if (args.searchTerm && args.searchTerm.trim() !== "") {
       const logins = await ctx.db
        .query("logins")
        .withSearchIndex("search_device", (q) => 
           q.search("device", args.searchTerm!).eq("userId", current.userId)
        )
        .take(10000);
       return logins.length;
    }
    
    const logins = await ctx.db
      .query("logins")
      .withIndex("by_user", (q) => q.eq("userId", current.userId))
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
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    // Prevent duplicated spam tracks logically
    const lastLogin = await ctx.db
      .query("logins")
      .withIndex("by_user", q => q.eq("userId", current.userId))
      .order("desc")
      .first();
      
    // 60-minute identical device throttling limit to prevent spam when refreshing
    if (lastLogin && (Date.now() - lastLogin.timestamp < 60 * 60 * 1000) && lastLogin.device === args.device && lastLogin.ip === args.ip) {
      return lastLogin._id;
    }

    const loginId = await ctx.db.insert("logins", {
      userId: current.userId,
      device: args.device,
      ip: args.ip,
      location: args.location,
      status: "SUCCESS",
      timestamp: Date.now(),
    });

    if (current.user.role === "SUPER_ADMIN" || current.user.role === "ADMIN") {
       await ctx.db.insert("auditLogs", {
          actionType: "SYSTEM_AUTHENTICATION",
          actorId: current.userId,
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
    const current = await getCurrentUser(ctx);
    if (!current) return;

    if (current.user.role === "SUPER_ADMIN" || current.user.role === "ADMIN") {
      await ctx.db.insert("auditLogs", {
        actionType: "SYSTEM_DISCONNECTION",
        actorId: current.userId,
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
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized: Only super admins can impersonate tenants", "Unauthenticated");

    await ctx.db.patch(userId, { impersonatingCompanyId: args.companyId === undefined ? undefined : args.companyId });

    await ctx.db.insert("auditLogs", {
      actionType: "IMPERSONATE_COMPANY",
      actorId: userId,
      entityType: "users",
      entityId: userId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ targetCompanyId: args.companyId || "None (Reverted)" })
    });

    return true;
  }
});

export const getUnassignedSuperAdmins = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated");

    const superAdmins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "SUPER_ADMIN"))
      .collect();

    // Filter out those already assigned to this specific company
    return superAdmins.filter((user) => user.companyId !== args.companyId);
  },
});

export const assignSuperAdminToCompany = mutation({
  args: { userId: v.id("users"), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const { userId: callerId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated");

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.role !== "SUPER_ADMIN") {
      throw new Error("Invalid target user");
    }

    await ctx.db.patch(args.userId, { companyId: args.companyId });

    await ctx.db.insert("auditLogs", {
      actionType: "ASSIGN_SUPER_ADMIN",
      actorId: callerId,
      entityType: "users",
      entityId: args.userId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ companyId: args.companyId })
    });

    return true;
  },
});

export const detachSuperAdminFromCompany = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { userId: callerId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated");

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser || targetUser.role !== "SUPER_ADMIN") {
      throw new Error("Invalid target user");
    }

    await ctx.db.patch(args.userId, { companyId: undefined });

    await ctx.db.insert("auditLogs", {
      actionType: "DETACH_SUPER_ADMIN",
      actorId: callerId,
      entityType: "users",
      entityId: args.userId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ detachedFrom: targetUser.companyId })
    });

    return true;
  },
});
