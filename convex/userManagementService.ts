import type { Doc, Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";

export type ManagedUserRole = "USER" | "ADMIN" | "SUPER_ADMIN" | "READ_ONLY" | "AUDITOR";
type UserPolicySubject = Pick<Doc<"users">, "role" | "companyId" | "impersonatingCompanyId">;
type UserPolicyTarget = Pick<Doc<"users">, "role" | "companyId">;

/**
 * Roles that may manage other people. The oversight roles are excluded by name
 * rather than by accident.
 *
 * This check previously read "is an ADMIN, or is impersonating a company", and
 * the oversight roles would have failed it only because nothing sets the
 * impersonation field for them. That is a true fact about the platform today
 * and a fragile one to rest a permission on — anything that started setting
 * that field would silently hand a read-only account the ability to create
 * administrators. The users mutations are declared with `tenantMutation`, which
 * admits any signed-in caller, so this function is the whole guard.
 */
function isScopedAdmin(caller: UserPolicySubject) {
  if (caller.role === "READ_ONLY" || caller.role === "AUDITOR") return false;
  return caller.role === "ADMIN" || Boolean(caller.impersonatingCompanyId);
}

function isUnimpersonatedSuperAdmin(caller: UserPolicySubject) {
  return caller.role === "SUPER_ADMIN" && !caller.impersonatingCompanyId;
}

/**
 * Roles that reach past the company they are attached to.
 *
 * `SUPER_ADMIN` for the obvious reason. The oversight roles for a less obvious
 * one: `READ_ONLY` and `AUDITOR` are platform-wide by design — a read-only
 * account sees every company's audit trail, governance record, wiki and admin
 * console, which is the whole point of the role and is documented as such in
 * `authz.ts`.
 *
 * These checks previously named `SUPER_ADMIN` alone, which left a single
 * company's administrator able to create an account — or relabel their own —
 * that reads every other client on the platform. No screen ever offered the
 * role, so it was never a click; it was one call away for anyone who looked.
 *
 * An impersonating super admin is caught by this too. While impersonating they
 * are acting as that company's administrator, and the rule is that nobody
 * scoped to a company hands out a role that is not. Dropping impersonation
 * restores it.
 */
export function isPlatformRole(role: ManagedUserRole | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "READ_ONLY" || role === "AUDITOR";
}

export function assertCanCreateManagedUser(args: {
  caller: UserPolicySubject;
  activeCompanyId: Id<"companies"> | undefined;
  newRole: ManagedUserRole;
  newCompanyId: Id<"companies"> | undefined;
}) {
  if (isUnimpersonatedSuperAdmin(args.caller)) return;

  if (!isScopedAdmin(args.caller) || args.activeCompanyId !== args.newCompanyId) {
    throw appError("UNAUTHORIZED", "Unauthorized");
  }

  if (isPlatformRole(args.newRole)) {
    throw appError("UNAUTHORIZED", "Unauthorized: Insufficient privileges");
  }
}

export function assertCanUpdateManagedUser(args: {
  caller: UserPolicySubject;
  activeCompanyId: Id<"companies"> | undefined;
  targetUser: UserPolicyTarget;
  nextRole?: ManagedUserRole;
  nextCompanyId?: Id<"companies">;
}) {
  if (isUnimpersonatedSuperAdmin(args.caller)) return;

  if (!isScopedAdmin(args.caller) || args.activeCompanyId !== args.targetUser.companyId) {
    throw appError("UNAUTHORIZED", "Unauthorized");
  }

  if (args.targetUser.role === "SUPER_ADMIN") {
    throw appError("UNAUTHORIZED", "Unauthorized: Cannot modify a Super Administrator");
  }

  // An account that already holds a platform role is not this administrator's
  // to edit either — otherwise the one they could not create, they could still
  // rename, move or quietly take over.
  if (isPlatformRole(args.targetUser.role)) {
    throw appError("UNAUTHORIZED", "Unauthorized: Cannot modify a platform role");
  }

  if (isPlatformRole(args.nextRole) || (args.nextCompanyId && args.nextCompanyId !== args.activeCompanyId)) {
    throw appError("UNAUTHORIZED", "Unauthorized: Insufficient privileges");
  }
}

export function assertCanDeleteManagedUser(args: {
  caller: UserPolicySubject;
  activeCompanyId: Id<"companies"> | undefined;
  targetUser: UserPolicyTarget;
}) {
  if (isUnimpersonatedSuperAdmin(args.caller)) return;

  if (!isScopedAdmin(args.caller) || args.activeCompanyId !== args.targetUser.companyId) {
    throw appError("UNAUTHORIZED", "Unauthorized");
  }

  if (args.targetUser.role === "SUPER_ADMIN") {
    throw appError("UNAUTHORIZED", "Unauthorized: Cannot delete a Super Administrator");
  }

  // Nor removed. An oversight account a company's own administrator can delete
  // is oversight that company controls.
  if (isPlatformRole(args.targetUser.role)) {
    throw appError("UNAUTHORIZED", "Unauthorized: Cannot delete a platform role");
  }
}
