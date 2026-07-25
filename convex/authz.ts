import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

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
  if (!current) throw new Error(message);
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
    throw new Error(message);
  }

  return current as RoleCheckedUser;
}

export async function requireAdmin(
  ctx: AuthCtx,
  message = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated"
): Promise<RoleCheckedUser> {
  return await requireRole(ctx, ["ADMIN", "SUPER_ADMIN"], message, unauthenticatedMessage);
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

export function assertAdminCanAccessCompany(
  user: Doc<"users">,
  companyId: Id<"companies"> | undefined,
  message = "Unauthorized"
) {
  if (user.role === "SUPER_ADMIN") return;

  if (user.role === "ADMIN" && companyId && getActiveCompanyId(user) === companyId) {
    return;
  }

  throw new Error(message);
}
