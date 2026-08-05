/**
 * The roles a person can hold, in one place.
 *
 * Two screens each declared their own `UserRole` union locally, so adding the
 * oversight roles for the governance layer would have meant editing the same
 * list twice and hoping nobody added a third copy. The backend union in
 * `convex/schema.ts` remains the source of truth; this mirrors it for the
 * screens and carries the ordering and copy that go with it.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

export const USER_ROLES = ["USER", "ADMIN", "SUPER_ADMIN", "READ_ONLY", "AUDITOR"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles that can change things. Everything else is oversight or ordinary use. */
export const WRITING_ROLES: readonly UserRole[] = ["ADMIN", "SUPER_ADMIN"];

/**
 * Roles that exist to watch rather than to act.
 *
 * A person holding one of these can never write, anywhere. The screens use this
 * to hide controls that would fail if pressed — a button that always errors is
 * worse than no button.
 */
export const OVERSIGHT_ROLES: readonly UserRole[] = ["READ_ONLY", "AUDITOR"];

export function isOversightRole(role: string | undefined | null): boolean {
  return role === "READ_ONLY" || role === "AUDITOR";
}

/** Whether this person may change anything at all. */
export function canWrite(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * The order roles are offered in, weakest first.
 *
 * `SUPER_ADMIN` is filtered out for anyone who is not one themselves, which is
 * why it sits at the end rather than in strength order.
 */
export const ASSIGNABLE_ROLES: readonly UserRole[] = [
  "USER",
  "READ_ONLY",
  "AUDITOR",
  "ADMIN",
  "SUPER_ADMIN",
];

/** Translation key for a role's name, under an `admin.users.roles` namespace. */
export const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "superAdmin",
  READ_ONLY: "readOnly",
  AUDITOR: "auditor",
};

/** Translation key for the one-line explanation shown beside a role. */
export const ROLE_DESCRIPTION_KEYS: Record<UserRole, string> = {
  USER: "userDescription",
  ADMIN: "adminDescription",
  SUPER_ADMIN: "superAdminDescription",
  READ_ONLY: "readOnlyDescription",
  AUDITOR: "auditorDescription",
};
