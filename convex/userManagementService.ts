import type { Doc, Id } from "./_generated/dataModel";

export type ManagedUserRole = "USER" | "ADMIN" | "SUPER_ADMIN";
type UserPolicySubject = Pick<Doc<"users">, "role" | "companyId" | "impersonatingCompanyId">;
type UserPolicyTarget = Pick<Doc<"users">, "role" | "companyId">;

function isScopedAdmin(caller: UserPolicySubject) {
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
