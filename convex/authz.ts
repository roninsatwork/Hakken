import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { appError } from "./utils/appError";

/**
 * Uses the standalone `getAuthUserId` rather than the local `auth` object,
 * which is equivalent but avoids importing `./auth`.
 *
 * That import created a cycle: any module using these helpers pulled in
 * `authz` -> `auth` -> `authUserProvisioning` -> back to the module. Convex
 * loads modules at startup, so a participant in the cycle saw its imports as
 * `undefined` and failed at load time rather than with a useful error.
 * `actionAuth.ts` already took this approach.
 */

type AuthCtx = QueryCtx | MutationCtx;
type UserRole = NonNullable<Doc<"users">["role"]>;

/**
 * The role union, for function arguments.
 *
 * Four mutations across `users.ts` and `invites.ts` each spelled this out
 * inline, so adding the oversight roles meant editing the same list four times
 * and hoping none was missed. Declared once, a role added here reaches every
 * caller at the same moment.
 */
export const userRoleValidator = v.union(
  v.literal("USER"),
  v.literal("ADMIN"),
  v.literal("SUPER_ADMIN"),
  v.literal("READ_ONLY"),
  v.literal("AUDITOR")
);

/**
 * A user row as a browser is allowed to see it: everything except the token.
 *
 * `tokenIdentifier` is the auth identity string, and two `tenantQuery`
 * surfaces were handing whole user rows out with it still attached —
 * `getAllUsers` to any admin, and `getUserById` to any colleague in the same
 * company. It is not a password and holding it is not a login, but it is a
 * server-side identity that had no business on the wire, and nothing declared
 * a shape that would have stopped it.
 *
 * Declaring the shape alone would not have: a Convex return validator refuses
 * an unexpected field rather than quietly dropping it, so the row has to be
 * narrowed on the way out. `toClientUser` is that narrowing, and the validator
 * is what makes forgetting it a failure rather than a leak.
 */
export const clientUserValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  companyId: v.optional(v.id("companies")),
  impersonatingCompanyId: v.optional(v.id("companies")),
  role: v.optional(userRoleValidator),
  planOverrideId: v.optional(v.id("plans")),
  messagesUsedThisPeriod: v.optional(v.number()),
  createdAt: v.optional(v.number()),
  lastLoginAt: v.optional(v.number()),
  loginCount30d: v.optional(v.number()),
});

export function toClientUser(user: Doc<"users">) {
  const { tokenIdentifier: _tokenIdentifier, ...rest } = user;
  return rest;
}

export type CurrentUser = {
  userId: Id<"users">;
  user: Doc<"users">;
};

export type RoleCheckedUser = CurrentUser & {
  user: Doc<"users"> & { role: UserRole };
};

export async function getCurrentUser(ctx: AuthCtx): Promise<CurrentUser | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user) return null;

  return { userId, user };
}

export async function requireCurrentUser(ctx: AuthCtx, message = "Unauthenticated"): Promise<CurrentUser> {
  const current = await getCurrentUser(ctx);
  if (!current) throw appError("UNAUTHENTICATED", message);
  return current;
}

export async function requireRole(
  ctx: AuthCtx,
  roles: readonly UserRole[],
  message = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated"
): Promise<RoleCheckedUser> {
  const current = await requireCurrentUser(ctx, unauthenticatedMessage);
  const role = current.user.role;

  if (!role || !roles.includes(role)) {
    throw appError("UNAUTHORIZED", message);
  }

  return current as RoleCheckedUser;
}

/**
 * Roles that may change things at admin level.
 *
 * The oversight roles are deliberately absent. `requireAdmin` guards writes, so
 * anything added here gains the ability to alter the platform.
 */
export const ADMIN_WRITE_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

/**
 * Roles that may read admin surfaces.
 *
 * `READ_ONLY` sees what an admin sees and can change nothing — the split
 * between this list and `ADMIN_WRITE_ROLES` is the whole mechanism, so a
 * read-only account cannot be created that quietly holds write access.
 *
 * `AUDITOR` is not here on purpose. An auditor sees the governance surfaces
 * only, which is a narrower set than "everything an admin can read", so it is
 * granted by `GOVERNANCE_READ_ROLES` rather than by admin membership.
 */
export const ADMIN_READ_ROLES = ["ADMIN", "SUPER_ADMIN", "READ_ONLY"] as const;

/**
 * Roles that may read the governance surfaces — register, approvals, audit
 * trail, policies in force, evidence pack.
 *
 * This is the only list containing `AUDITOR`. Reading here is all it can do:
 * there is no governance write guard, because no governance surface is
 * editable from within the governance section by design.
 */
export const GOVERNANCE_READ_ROLES = ["ADMIN", "SUPER_ADMIN", "READ_ONLY", "AUDITOR"] as const;

/**
 * Roles that may read platform-wide surfaces.
 *
 * The admin section *is* the super-admin console — around sixty of its queries
 * are declared super-admin only — so "read-only sees what an admin sees" is
 * only true if read-only reaches them. Without this, half the admin screens
 * would refuse a read-only account and the role would be advertised as seeing
 * everything while showing blanks.
 *
 * `superAdminMutation` is untouched and still admits `SUPER_ADMIN` alone. The
 * rule across this whole file is the same one: reads widen to include the
 * oversight roles, writes never do.
 *
 * `AUDITOR` is absent — an auditor's reach is the governance surfaces, which is
 * narrower than the platform console.
 */
export const SUPER_ADMIN_READ_ROLES = ["SUPER_ADMIN", "READ_ONLY"] as const;

/** Cannot write anywhere, whatever else they can see. */
export const OVERSIGHT_ROLES = ["READ_ONLY", "AUDITOR"] as const;

export function isOversightRole(role: Doc<"users">["role"]): boolean {
  return role === "READ_ONLY" || role === "AUDITOR";
}

/**
 * A caller who may change things at admin level.
 *
 * Named for what it protects rather than for who passes it: every existing
 * caller of this guards a write, and the oversight roles must never satisfy it.
 */
export async function requireAdmin(
  ctx: AuthCtx,
  message = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated"
): Promise<RoleCheckedUser> {
  return await requireRole(ctx, ADMIN_WRITE_ROLES, message, unauthenticatedMessage);
}

/** A caller who may read admin surfaces, including read-only accounts. */
export async function requireAdminReader(
  ctx: AuthCtx,
  message = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated"
): Promise<RoleCheckedUser> {
  return await requireRole(ctx, ADMIN_READ_ROLES, message, unauthenticatedMessage);
}

/** A caller who may read platform-wide surfaces, including read-only accounts. */
export async function requireSuperAdminReader(
  ctx: AuthCtx,
  message = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated"
): Promise<RoleCheckedUser> {
  return await requireRole(ctx, SUPER_ADMIN_READ_ROLES, message, unauthenticatedMessage);
}

/** A caller who may read the governance surfaces. */
export async function requireGovernanceReader(
  ctx: AuthCtx,
  message = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated"
): Promise<RoleCheckedUser> {
  return await requireRole(ctx, GOVERNANCE_READ_ROLES, message, unauthenticatedMessage);
}

export async function requireSuperAdmin(
  ctx: AuthCtx,
  message = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated"
): Promise<RoleCheckedUser> {
  return await requireRole(ctx, ["SUPER_ADMIN"], message, unauthenticatedMessage);
}

export function getActiveCompanyId(user: Doc<"users">): Id<"companies"> | undefined {
  return user.impersonatingCompanyId || user.companyId;
}

export function canAccessCompany(user: Doc<"users">, companyId: Id<"companies">): boolean {
  return user.role === "SUPER_ADMIN" || getActiveCompanyId(user) === companyId;
}

/**
 * Admin access to one company's records: role check, existence check, and
 * scope check in one call.
 *
 * This lived as five near-identical private copies (companyLearningLoop,
 * companyMemories, companyReadiness, companySkills, companyEvals) until
 * 2026-08-19 — an authorization helper forked five ways is how one copy
 * quietly falls behind a fix. This is the only copy now; import it.
 *
 * An `undefined` companyId is the platform scope: it belongs to no company
 * (Anthony's SaaS ruling, 2026-08-17) and is the super admin's alone — the
 * overloads keep `company` non-null for callers that always pass an id.
 */
export async function requireCompanyAccess(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">
): Promise<{ user: RoleCheckedUser["user"]; userId: Id<"users">; company: Doc<"companies"> }>;
export async function requireCompanyAccess(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies"> | undefined
): Promise<{ user: RoleCheckedUser["user"]; userId: Id<"users">; company: Doc<"companies"> | null }>;
export async function requireCompanyAccess(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies"> | undefined
) {
  const { user, userId } = await requireAdmin(ctx);
  if (!companyId) {
    if (user.role !== "SUPER_ADMIN") throw appError("UNAUTHORIZED", "Unauthorized access to platform checks");
    return { user, userId, company: null };
  }
  const company = await ctx.db.get(companyId);
  if (!company) throw appError("NOT_FOUND", "Company not found");
  assertAdminCanAccessCompany(user, companyId);
  return { user, userId, company };
}

/**
 * Scoped company access for anyone reading or writing admin surfaces.
 *
 * The oversight roles are company-scoped exactly as `ADMIN` is: a read-only or
 * auditor account attached to one company cannot read another's records. What
 * they may do once inside is decided by the guard the function declared, not
 * here — this answers "whose data", not "may they change it".
 */
export function assertAdminCanAccessCompany(
  user: Doc<"users">,
  companyId: Id<"companies"> | undefined,
  message = "Unauthorized"
) {
  if (user.role === "SUPER_ADMIN") return;

  const scopedRole = user.role === "ADMIN" || isOversightRole(user.role);
  if (scopedRole && companyId && getActiveCompanyId(user) === companyId) {
    return;
  }

  throw appError("UNAUTHORIZED", message);
}
