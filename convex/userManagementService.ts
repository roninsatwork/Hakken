import type { Doc, Id } from "./_generated/dataModel";

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

export function assertCanCreateManagedUser(args: {
  caller: UserPolicySubject;
  activeCompanyId: Id<"companies"> | undefined;
  newRole: ManagedUserRole;
  newCompanyId: Id<"companies"> | undefined;
}) {
  if (isUnimpersonatedSuperAdmin(args.caller)) return;

  if (!isScopedAdmin(args.caller) || args.activeCompanyId !== args.newCompanyId) {
    throw new Error("Unauthorized");
  }

  if (args.newRole === "SUPER_ADMIN") {
    throw new Error("Unauthorized: Insufficient privileges");
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
    throw new Error("Unauthorized");
  }

  if (args.targetUser.role === "SUPER_ADMIN") {
    throw new Error("Unauthorized: Cannot modify a Super Administrator");
  }

  if (args.nextRole === "SUPER_ADMIN" || (args.nextCompanyId && args.nextCompanyId !== args.activeCompanyId)) {
    throw new Error("Unauthorized: Insufficient privileges");
  }
}

export function assertCanDeleteManagedUser(args: {
  caller: UserPolicySubject;
  activeCompanyId: Id<"companies"> | undefined;
  targetUser: UserPolicyTarget;
}) {
  if (isUnimpersonatedSuperAdmin(args.caller)) return;

  if (!isScopedAdmin(args.caller) || args.activeCompanyId !== args.targetUser.companyId) {
    throw new Error("Unauthorized");
  }

  if (args.targetUser.role === "SUPER_ADMIN") {
    throw new Error("Unauthorized: Cannot delete a Super Administrator");
  }
}
