import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getActiveCompanyId, getCurrentUser, requireCurrentUser, requireSuperAdmin, userRoleValidator } from "./authz";
import {
  assertCanCreateManagedUser,
  assertCanDeleteManagedUser,
  assertCanUpdateManagedUser,
} from "./userManagementService";
import { incrementGlobalInventoryTotals } from "./utils/inventoryRollupService";
import { validateAdminImageMetadata, validateStoredUpload } from "./utils/uploadPolicy";
import { publicMutation, publicQuery, superAdminMutation, superAdminQuery, tenantMutation, tenantQuery } from "./tenantFunctions";
import {
  type DirectoryActivity,
  activityBound,
  LOGIN_SCAN_LIMIT,
  USER_SCAN_LIMIT,
  loginWindowStart,
  planLoginCountUpdates,
  tallyLoginsByUser,
} from "./userActivityService";

/**
 * How long one recorded login stands in for continued activity on a device.
 *
 * Governed by docs/plans/active/user-directory-plan.md. Long enough to collapse
 * a burst of tabs into one session, short enough that returning later in the
 * day counts separately.
 */
const RECENT_LOGIN_WINDOW_MS = 60 * 60 * 1000;

/**
 * How many rows one read of an identity table takes at a time.
 *
 * Comfortably above what any real user has — the point is not to be tight, it
 * is to have a ceiling at all, so no single read can grow without limit.
 */
const IDENTITY_BATCH = 200;

/**
 * Delete every row a lookup matches, a batch at a time.
 *
 * The obvious way to write this is `.collect()` and a loop, and that is what
 * these purges used to do: read every matching row into memory at once, with
 * no ceiling on how many that is.
 *
 * The obvious repair — `.take(200)` and delete those — is worse than it looks
 * *here specifically*. This runs on the deletion path, and the bug it exists
 * to prevent is an auth row left behind making a deleted address unusable. A
 * bare cap reintroduces exactly that for anyone over the limit: rarer than
 * before, and much harder to find.
 *
 * So it drains instead. Each pass deletes what it read, so the next pass sees
 * what the last one could not reach, and the loop ends when nothing matches.
 * Bounded per read, complete in total.
 *
 * `deleteRow` must delete the row it is handed, or this will not terminate.
 */
async function drainRows<T>(
  readBatch: (limit: number) => Promise<T[]>,
  deleteRow: (row: T) => Promise<void>
): Promise<number> {
  let removed = 0;

  for (;;) {
    const batch = await readBatch(IDENTITY_BATCH);
    if (batch.length === 0) return removed;
    for (const row of batch) await deleteRow(row);
    removed += batch.length;
  }
}

/**
 * Remove everything that would let a deleted account come back to life.
 *
 * Anthony, 2026-07-31: *"deleting users and re adding them is a genuine user
 * case, when they are deleted and we want to add them they need to be treated
 * as a brand new user."*
 *
 * That only holds if deletion clears the identity rows as well as the user
 * document. Two survived it before, and between them they made a deleted
 * address unusable:
 *
 * - The Convex Auth `authAccounts` row kept pointing at a user document that no
 *   longer existed, so the next sign-in resolved to a dangling id.
 * - The invitation stayed `ACCEPTED`, and `createInviteRecord` treats an
 *   accepted invitation as nothing left to do — so the address could never be
 *   re-invited, however many times the email went out.
 *
 * Deliberately deletes the invitation rather than resetting it to `PENDING`: a
 * re-add should mint a fresh invite with a fresh token, not inherit the old
 * workspace and role.
 */
async function purgeAuthIdentity(ctx: MutationCtx, userId: Id<"users">, email?: string) {
  await drainRows(
    (limit) =>
      ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .take(limit),
    async (session) => {
      await drainRows(
        (limit) =>
          ctx.db
            .query("authRefreshTokens")
            .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
            .take(limit),
        (refreshToken) => ctx.db.delete(refreshToken._id)
      );
      await ctx.db.delete(session._id);
    }
  );

  await drainRows(
    (limit) =>
      ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
        .take(limit),
    async (account) => {
      // Unredeemed magic links for this account. Left behind, one of them could
      // still be clicked and sign someone in against the deleted identity.
      await drainRows(
        (limit) =>
          ctx.db
            .query("authVerificationCodes")
            .withIndex("accountId", (q) => q.eq("accountId", account._id))
            .take(limit),
        (code) => ctx.db.delete(code._id)
      );
      await ctx.db.delete(account._id);
    }
  );

  if (!email) return;

  await drainRows(
    (limit) =>
      ctx.db
        .query("invitations")
        .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
        .take(limit),
    (invitation) => ctx.db.delete(invitation._id)
  );
}

type UserPaginationResult = {
  page: Doc<"users">[];
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
};

export const getMe = publicQuery({
  reason: "Called on every page to discover whether anyone is signed in; returns null when not.",
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

export const generateUploadUrl = tenantMutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

// === User Management CRUD Operations ===

export const getPaginatedUsers = tenantQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
    /**
     * Which population the caller is asking about.
     *
     * `workspace` (the default) answers "who is in the workspace I am acting
     * as", so a super admin impersonating a company sees that company. That is
     * what the front-end team screen wants.
     *
     * `platform` answers "who exists at all" and ignores impersonation, because
     * impersonation is a front-end device and has no meaning in the admin
     * section. Anthony, 2026-07-31: *"the impersonation is user front end only
     * not admin section."*
     *
     * Only a super admin may ask for `platform`; for anyone else the argument
     * is ignored and the workspace scope still applies.
     */
    scope: v.optional(v.union(v.literal("workspace"), v.literal("platform"))),
  },
  handler: async (ctx, args) => {
    const { user: caller } = ctx;
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

    // A super admin asking for the platform is never narrowed by the workspace
    // they happen to be impersonating.
    const platformScoped = caller.role === "SUPER_ADMIN" && args.scope === "platform";

    if (!platformScoped
      && (caller.role === "ADMIN" || (caller.role === "SUPER_ADMIN" && caller.impersonatingCompanyId))) {
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

export const getAllUsers = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const { user: caller } = ctx;
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

export const getUsersByCompany = tenantQuery({
  args: { 
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const { user: caller } = ctx;
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

export const getSuperAdmins = superAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "SUPER_ADMIN"))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getUserById = tenantQuery({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const { user: caller } = ctx;
    
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

export const addUser = tenantMutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: userRoleValidator,
    image: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { userId: callerId, user: caller } = ctx;
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

export const updateUser = tenantMutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(userRoleValidator),
    image: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { userId: callerId, user: caller } = ctx;
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
    const previousRole = targetUser.role;

    await ctx.db.patch(id, {
      ...updates,
      ...(role !== undefined && { role }),
      ...(companyId !== undefined && { companyId })
    });

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_USER",
      actorId: callerId,
      entityType: "users",
      entityId: id,
      timestamp: Date.now(),
      /**
       * `previousRole` matters as much as the new one. A record saying someone
       * was made an administrator does not say whether that was a promotion
       * from ordinary use or the quiet removal of an oversight restriction, and
       * the second is the one an auditor is looking for.
       */
      metadata: JSON.stringify({
        updatedRole: role,
        previousRole: role !== undefined && role !== previousRole ? previousRole : undefined,
        updatedCompanyId: companyId,
      })
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

export const deleteUser = tenantMutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const { userId: callerId, user: caller } = ctx;
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
    // Inline rather than scheduled, unlike the bulk content purge above. These
    // rows are what a sign-in reads, so leaving them alive for even one tick
    // leaves a window where the deleted account can still authenticate.
    await purgeAuthIdentity(ctx, args.id, targetUser.email);
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

export const updateMyProfile = tenantMutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    image: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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

export const getLogins = tenantQuery({
  args: { 
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const current = ctx;

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

export const getUserLogins = tenantQuery({
  args: { 
    userId: v.id("users"),
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Basic verification
    const { userId: callerId, user: caller } = ctx;

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

export const getMyLoginsCount = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
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

export const recordLogin = publicMutation({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {
    device: v.string(),
    ip: v.string(),
    location: v.string(),
  },
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return null;

    const now = Date.now();
    const lastLogin = await ctx.db
      .query("logins")
      .withIndex("by_user", q => q.eq("userId", current.userId))
      .order("desc")
      .first();

    /*
     * Collapse a burst into one session.
     *
     * The client calls this once per browser tab (a `sessionStorage` guard), so
     * without a throttle a handful of tabs would each write a row.
     *
     * The window is keyed on the device but deliberately NOT on the IP. IP is
     * the volatile half: a mobile connection changes it mid-session, and the
     * geo lookup's own failure path substitutes "Concealed IP", so an
     * IP-sensitive key produced a duplicate row every time either happened —
     * inflating exactly the 30-day count the directory reports.
     *
     * Device stays in the key on purpose. A genuinely different device is a
     * different session and worth seeing on the profile's Logins tab.
     */
    if (lastLogin
      && now - lastLogin.timestamp < RECENT_LOGIN_WINDOW_MS
      && lastLogin.device === args.device) {
      return lastLogin._id;
    }

    const loginId = await ctx.db.insert("logins", {
      userId: current.userId,
      device: args.device,
      ip: args.ip,
      location: args.location,
      status: "SUCCESS",
      timestamp: now,
    });

    /*
     * Denormalised onto the user so the directory can sort by it.
     *
     * Convex indexes only fields on the table being paginated, so a sortable
     * "last login" column cannot be a join. Written only when a row is actually
     * inserted, which keeps the invariant the backfill also relies on:
     * `lastLoginAt` always equals the newest `logins` row for that user.
     */
    await ctx.db.patch(current.userId, { lastLoginAt: now });

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

export const recordLogout = publicMutation({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
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

export const impersonateCompany = superAdminMutation({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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

export const getUnassignedSuperAdmins = superAdminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const superAdmins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "SUPER_ADMIN"))
      .collect();

    // Filter out those already assigned to this specific company
    return superAdmins.filter((user) => user.companyId !== args.companyId);
  },
});

export const assignSuperAdminToCompany = superAdminMutation({
  args: { userId: v.id("users"), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const { userId: callerId } = ctx;

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

export const detachSuperAdminFromCompany = superAdminMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { userId: callerId } = ctx;

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

/**
 * Recompute every user's rolling 30-day login count.
 *
 * Runs nightly. `lastLoginAt` needs no job — it is exact and written inline by
 * `recordLogin` — but a rolling window decays with the calendar, so the count
 * has to be recalculated even on a night when nobody logged in at all.
 *
 * Governed by docs/plans/active/user-directory-plan.md.
 */
export const recomputeLoginCounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const windowStart = loginWindowStart(now);

    const rows = await ctx.db
      .query("logins")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", windowStart))
      .take(LOGIN_SCAN_LIMIT);

    const users = await ctx.db.query("users").take(USER_SCAN_LIMIT);

    const tally = tallyLoginsByUser(
      rows.map((row) => ({ userId: row.userId, status: row.status, timestamp: row.timestamp })),
      windowStart
    );
    const updates = planLoginCountUpdates(
      users.map((user) => ({ _id: user._id, loginCount30d: user.loginCount30d })),
      tally
    );

    for (const update of updates) {
      await ctx.db.patch(update.id as Id<"users">, { loginCount30d: update.loginCount30d });
    }

    // Never truncate quietly. A capped scan under-counts, which reads on screen
    // as "this person stopped using the platform" — a wrong answer that looks
    // like a real one.
    const truncated = rows.length >= LOGIN_SCAN_LIMIT || users.length >= USER_SCAN_LIMIT;
    if (truncated) {
      console.warn("[userActivity] Scan limit reached; 30-day login counts may be incomplete.", {
        logins: rows.length,
        users: users.length,
      });
    }

    return { scannedLogins: rows.length, scannedUsers: users.length, updated: updates.length, truncated };
  },
});

/**
 * The admin user directory — read-only, platform-wide, server-side everything.
 *
 * Governed by docs/plans/active/user-directory-plan.md.
 *
 * Two things shape the implementation:
 *
 * 1. **Super admins are excluded.** They have their own screen at
 *    `/admin/super-admins` in the same nav group; listing them twice makes both
 *    screens ambiguous about what they are for.
 *
 * 2. **Search and sort cannot combine.** Convex search indexes support equality
 *    filters only, never ranges, so a single query cannot both full-text search
 *    and range-sort by `lastLoginAt`. Rather than silently ignoring one, the
 *    query reports which mode it ran in and the screen disables the sort
 *    control, with a reason, while a search term is active.
 */
export const listDirectoryUsers = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    companyId: v.optional(v.id("companies")),
    role: v.optional(v.union(v.literal("USER"), v.literal("ADMIN"))),
    activity: v.optional(v.union(
      v.literal("any"),
      v.literal("active7"),
      v.literal("active30"),
      v.literal("dormant"),
      v.literal("never"),
    )),
    searchTerm: v.optional(v.string()),
    sortBy: v.optional(v.union(v.literal("lastLogin"), v.literal("loginCount"))),
    direction: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  },
  handler: async (ctx, args) => {
    const search = args.searchTerm?.trim() ?? "";
    const activity = (args.activity ?? "any") as DirectoryActivity;
    const bound = activityBound(activity, Date.now());
    const order = args.direction === "asc" ? "asc" : "desc";
    const roleFilter = args.role;
    const companyFilter = args.companyId;

    const page = await (async () => {
      if (search !== "") {
        // Relevance ordering; sorting is unavailable in this branch by design.
        return await ctx.db
          .query("users")
          .withSearchIndex("search_email", (q) => {
            const searched = q.search("email", search);
            if (roleFilter && companyFilter) {
              return searched.eq("role", roleFilter).eq("companyId", companyFilter);
            }
            if (roleFilter) return searched.eq("role", roleFilter);
            if (companyFilter) return searched.eq("companyId", companyFilter);
            return searched;
          })
          .filter((q) => q.neq(q.field("role"), "SUPER_ADMIN"))
          .paginate(args.paginationOpts);
      }

      if (args.sortBy === "loginCount") {
        return await ctx.db
          .query("users")
          .withIndex("by_loginCount")
          .order(order)
          .filter((q) =>
            roleFilter
              ? q.eq(q.field("role"), roleFilter)
              : q.neq(q.field("role"), "SUPER_ADMIN"))
          .paginate(args.paginationOpts);
      }

      /*
       * The activity filter is pushed into the index range rather than applied
       * afterwards — that is the entire reason `lastLoginAt` is denormalised.
       * `never` reads as an equality against `undefined`, which Convex sorts
       * ahead of every real timestamp.
       */
      if (companyFilter) {
        return await ctx.db
          .query("users")
          .withIndex("by_company_lastLogin", (q) => {
            const base = q.eq("companyId", companyFilter);
            if (bound.kind === "since") return base.gte("lastLoginAt", bound.from);
            if (bound.kind === "before") return base.gt("lastLoginAt", undefined).lt("lastLoginAt", bound.before);
            if (bound.kind === "never") return base.eq("lastLoginAt", undefined);
            return base;
          })
          .order(order)
          .filter((q) =>
            roleFilter
              ? q.eq(q.field("role"), roleFilter)
              : q.neq(q.field("role"), "SUPER_ADMIN"))
          .paginate(args.paginationOpts);
      }

      if (roleFilter) {
        return await ctx.db
          .query("users")
          .withIndex("by_role_lastLogin", (q) => {
            const base = q.eq("role", roleFilter);
            if (bound.kind === "since") return base.gte("lastLoginAt", bound.from);
            if (bound.kind === "before") return base.gt("lastLoginAt", undefined).lt("lastLoginAt", bound.before);
            if (bound.kind === "never") return base.eq("lastLoginAt", undefined);
            return base;
          })
          .order(order)
          .paginate(args.paginationOpts);
      }

      return await ctx.db
        .query("users")
        .withIndex("by_lastLogin", (q) => {
          if (bound.kind === "since") return q.gte("lastLoginAt", bound.from);
          if (bound.kind === "before") return q.gt("lastLoginAt", undefined).lt("lastLoginAt", bound.before);
          if (bound.kind === "never") return q.eq("lastLoginAt", undefined);
          return q;
        })
        .order(order)
        .filter((q) => q.neq(q.field("role"), "SUPER_ADMIN"))
        .paginate(args.paginationOpts);
    })();

    // Company names for the page only — fifteen lookups, cached by id.
    const companyNames = new Map<string, string | null>();
    const rows = await Promise.all(page.page.map(async (user) => {
      let companyName: string | null = null;
      if (user.companyId) {
        if (companyNames.has(user.companyId)) {
          companyName = companyNames.get(user.companyId) ?? null;
        } else {
          const company = await ctx.db.get(user.companyId);
          companyName = company?.name ?? null;
          companyNames.set(user.companyId, companyName);
        }
      }

      return {
        _id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        role: user.role ?? null,
        companyId: user.companyId ?? null,
        companyName,
        createdAt: user.createdAt ?? null,
        lastLoginAt: user.lastLoginAt ?? null,
        loginCount30d: user.loginCount30d ?? 0,
      };
    }));

    return {
      ...page,
      page: rows,
      // So the screen can explain why sorting is unavailable rather than
      // appearing to ignore the control.
      sortingAvailable: search === "",
    };
  },
});

/**
 * One-off recovery for identities orphaned before deletion purged them.
 *
 * `deleteUser` now calls `purgeAuthIdentity`, but rows deleted before that
 * existed are still in the database, and they are exactly what makes an address
 * unusable: an `authAccounts` row pointing at a missing user, or an `ACCEPTED`
 * invitation for an account that no longer exists. Both are invisible in the
 * admin UI, so there is no way to clear them by hand.
 *
 * Kept as a maintenance function rather than deleted after one run — the same
 * orphans appear whenever a user document is removed by any route that does not
 * go through `deleteUser`.
 *
 * A `PENDING` invitation with no user is not an orphan. That is the normal
 * state of someone who has been invited and has not signed in yet.
 */
/**
 * The tables the sweep walks, in the order it walks them.
 *
 * Ordered so the rows that make an address unusable go first: a dangling
 * `authAccounts` row is what breaks the next sign-in, and a stale `ACCEPTED`
 * invitation is what blocks the re-invite.
 */
const ORPHAN_SWEEP_TABLES = ["authAccounts", "authSessions", "invitations"] as const;

type OrphanSweepTable = (typeof ORPHAN_SWEEP_TABLES)[number];

/** One page of a sweep. Small: each row costs a `get` to test for an owner. */
const ORPHAN_SWEEP_PAGE = 200;

const orphanSweepTallyValidator = v.object({
  sessions: v.number(),
  accounts: v.number(),
  verificationCodes: v.number(),
  invitations: v.number(),
});

/**
 * One-off recovery for identities orphaned before deletion purged them.
 *
 * `deleteUser` now calls `purgeAuthIdentity`, but rows deleted before that
 * existed are still in the database, and they are exactly what makes an address
 * unusable: an `authAccounts` row pointing at a missing user, or an `ACCEPTED`
 * invitation for an account that no longer exists. Both are invisible in the
 * admin UI, so there is no way to clear them by hand.
 *
 * Kept as a maintenance function rather than deleted after one run — the same
 * orphans appear whenever a user document is removed by any route that does not
 * go through `deleteUser`.
 *
 * A `PENDING` invitation with no user is not an orphan. That is the normal
 * state of someone who has been invited and has not signed in yet.
 *
 * ## Why this is a chain of runs rather than one
 *
 * Finding orphans means looking at every row, so the read is broad by nature.
 * It used to be broad *and* unbounded — three `.collect()` calls over tables
 * that grow with every sign-in, in a single transaction.
 *
 * It now takes one page of one table per run and schedules the next. Two
 * things forced that shape rather than the simpler loop:
 *
 * 1. **Convex allows one paginated query per function** and throws on the
 *    second. Only one branch below runs per call, which is what keeps that
 *    true. Note that `convex-test` does *not* enforce this — a version that
 *    paginated in a loop passed every test here and failed on the deployment —
 *    so a green suite is not evidence. This was exercised against the dev
 *    deployment.
 * 2. **The batch-from-the-start pattern in `convex/purges.ts` cannot be used.**
 *    It works there because it deletes everything it reads. This sweep skips
 *    the healthy rows, so starting from the beginning each time would re-read
 *    them for ever and never reach the end. Hence a real cursor.
 *
 * Returns the tally *so far*, not the final one — the run that finishes a table
 * hands its counts to the next run, and only the last one sees the total, which
 * it logs. Call it with no arguments; the rest is bookkeeping between runs.
 */
export const purgeOrphanedAuthIdentities = internalMutation({
  args: {
    table: v.optional(
      v.union(
        v.literal("authAccounts"),
        v.literal("authSessions"),
        v.literal("invitations")
      )
    ),
    cursor: v.optional(v.string()),
    removed: v.optional(orphanSweepTallyValidator),
  },
  handler: async (ctx, args) => {
    const table: OrphanSweepTable = args.table ?? ORPHAN_SWEEP_TABLES[0];
    const removed = args.removed ?? {
      sessions: 0,
      accounts: 0,
      verificationCodes: 0,
      invitations: 0,
    };
    const cursor = args.cursor ?? null;

    let isDone: boolean;
    let continueCursor: string;

    if (table === "authAccounts") {
      const page = await ctx.db
        .query("authAccounts")
        .paginate({ numItems: ORPHAN_SWEEP_PAGE, cursor });

      for (const account of page.page) {
        if (await ctx.db.get(account.userId)) continue;
        removed.verificationCodes += await drainRows(
          (limit) =>
            ctx.db
              .query("authVerificationCodes")
              .withIndex("accountId", (q) => q.eq("accountId", account._id))
              .take(limit),
          (code) => ctx.db.delete(code._id)
        );
        await ctx.db.delete(account._id);
        removed.accounts += 1;
      }

      isDone = page.isDone;
      continueCursor = page.continueCursor;
    } else if (table === "authSessions") {
      const page = await ctx.db
        .query("authSessions")
        .paginate({ numItems: ORPHAN_SWEEP_PAGE, cursor });

      for (const session of page.page) {
        if (await ctx.db.get(session.userId)) continue;
        await drainRows(
          (limit) =>
            ctx.db
              .query("authRefreshTokens")
              .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
              .take(limit),
          (refreshToken) => ctx.db.delete(refreshToken._id)
        );
        await ctx.db.delete(session._id);
        removed.sessions += 1;
      }

      isDone = page.isDone;
      continueCursor = page.continueCursor;
    } else {
      const page = await ctx.db
        .query("invitations")
        .paginate({ numItems: ORPHAN_SWEEP_PAGE, cursor });

      for (const invitation of page.page) {
        if (invitation.status === "PENDING") continue;
        const user = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", invitation.email))
          .first();
        if (user) continue;
        await ctx.db.delete(invitation._id);
        removed.invitations += 1;
      }

      isDone = page.isDone;
      continueCursor = page.continueCursor;
    }

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.users.purgeOrphanedAuthIdentities, {
        table,
        cursor: continueCursor,
        removed,
      });
      return removed;
    }

    const nextTable = ORPHAN_SWEEP_TABLES[ORPHAN_SWEEP_TABLES.indexOf(table) + 1];
    if (nextTable) {
      await ctx.scheduler.runAfter(0, internal.users.purgeOrphanedAuthIdentities, {
        table: nextTable,
        removed,
      });
      return removed;
    }

    console.log("[Auth purge] Orphaned identity sweep finished.", removed);
    return removed;
  },
});
