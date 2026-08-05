import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { ObjectType, PropertyValidators } from "convex/values";
import {
  action,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { CurrentUser, RoleCheckedUser } from "./authz";
import {
  ADMIN_READ_ROLES,
  ADMIN_WRITE_ROLES,
  GOVERNANCE_READ_ROLES,
  SUPER_ADMIN_READ_ROLES,
  getActiveCompanyId,
  requireAdmin,
  requireAdminReader,
  requireCurrentUser,
  requireGovernanceReader,
  requireSuperAdmin,
  requireSuperAdminReader,
} from "./authz";
import { requireActionRole, requireActionUser } from "./actionAuth";

/**
 * Tenant-aware function builders.
 *
 * Tenancy used to be enforced purely by convention: every one of ~360
 * client-callable functions had to remember to resolve the caller and scope its
 * reads. The discipline was high, but nothing made a mistake impossible, and a
 * text-matching lint cannot tell the difference between a function with no
 * guard and one whose guard lives inside a domain helper.
 *
 * These builders make it structural instead. A function declared with
 * `tenantQuery` cannot run for an anonymous caller, because authentication
 * happens before the handler is entered, and the handler receives the resolved
 * user and active company on `ctx`. Which builder a function used is a
 * syntactic fact, so `authzEnforcement.test.ts` can check it without guessing.
 *
 * What these guarantee:
 *   - the caller is authenticated
 *   - the caller holds the required role
 *   - `ctx.companyId` is the caller's active company, honouring super-admin
 *     impersonation
 *
 * What they do NOT do: automatically filter every database read. Tables differ
 * too much for that to be safe generically. Handlers must still scope their own
 * queries, and `assertTenantAccess` is provided for checking a fetched document.
 *
 * `publicQuery` / `publicMutation` / `publicAction` exist for surfaces that are
 * deliberately unauthenticated (widget config, branding, pre-login events).
 * They require a written reason, so an unauthenticated surface is always a
 * decision someone made on purpose rather than an omission.
 */

export type TenantIdentity = {
  user: Doc<"users">;
  userId: Id<"users">;
  /** The caller's active company, honouring super-admin impersonation. */
  companyId: Id<"companies"> | undefined;
};

export type TenantQueryCtx = QueryCtx & TenantIdentity;
export type TenantMutationCtx = MutationCtx & TenantIdentity;

/**
 * `admin` guards writes; `adminRead` guards reads and additionally admits
 * read-only accounts; `governance` admits auditors as well, and only the
 * governance surfaces use it. Splitting read from write is what makes an
 * oversight role possible at all — while one guard served both, "can see the
 * register" and "can change the platform" were the same permission.
 */
type Guard = "authenticated" | "admin" | "adminRead" | "governance" | "superAdmin" | "superAdminRead";

/**
 * One resolver per guard, as a record rather than a chain of ternaries.
 *
 * `Record<Guard, ...>` makes this exhaustive: adding a guard to the union
 * without adding it here fails to compile. The chain this replaces ended in a
 * catch-all `requireCurrentUser`, so a guard nobody had wired up did not fail —
 * it silently admitted any signed-in caller. That is precisely what happened
 * when `superAdminRead` was first added, and the access-control tests caught a
 * platform console briefly open to every logged-in user. A permission model
 * whose default branch is "let them in" is one edit away from that every time.
 */
const GUARD_RESOLVERS: Record<Guard, (ctx: QueryCtx | MutationCtx) => Promise<RoleCheckedUser | CurrentUser>> = {
  authenticated: requireCurrentUser,
  admin: requireAdmin,
  adminRead: requireAdminReader,
  governance: requireGovernanceReader,
  superAdmin: requireSuperAdmin,
  superAdminRead: requireSuperAdminReader,
};

async function resolveTenantIdentity(
  ctx: QueryCtx | MutationCtx,
  guard: Guard,
): Promise<TenantIdentity> {
  const current = await GUARD_RESOLVERS[guard](ctx);

  return {
    user: current.user,
    userId: current.userId,
    companyId: getActiveCompanyId(current.user),
  };
}

/**
 * Assert that a document belongs to the caller's tenant.
 *
 * Super admins pass. A document with no `companyId` is treated as global and
 * only reachable by a super admin, rather than being visible to everyone whose
 * own company is also unset.
 */
export function assertTenantAccess(
  ctx: TenantIdentity,
  document: { companyId?: Id<"companies"> } | null | undefined,
  message = "Unauthorized",
): void {
  if (!document) throw new Error(message);
  if (ctx.user.role === "SUPER_ADMIN") return;
  if (!document.companyId || document.companyId !== ctx.companyId) {
    throw new Error(message);
  }
}

/** The caller's company, when the operation cannot proceed without one. */
export function requireTenant(ctx: TenantIdentity, message = "No active company"): Id<"companies"> {
  if (!ctx.companyId) throw new Error(message);
  return ctx.companyId;
}

/**
 * Built on `convex-helpers/server/customFunctions`, Convex's own mechanism for
 * this. Hand-rolling the wrapper meant re-deriving the argument and data-model
 * generics, which TypeScript could not reconcile; `customCtx` merges extra
 * fields into `ctx` while leaving argument inference to Convex.
 */
const guardedCtx = (guard: Guard) =>
  customCtx(async (ctx: QueryCtx | MutationCtx) => await resolveTenantIdentity(ctx, guard));

/** Authenticated caller of any role. */
export const tenantQuery = customQuery(query, guardedCtx("authenticated"));
export const tenantMutation = customMutation(mutation, guardedCtx("authenticated"));

/**
 * Admin surfaces.
 *
 * `adminQuery` reads, so it also admits `READ_ONLY`. `adminMutation` writes, so
 * it does not — and neither oversight role satisfies it anywhere on the
 * platform. Nothing loosened when the oversight roles were added: no existing
 * account holds one, so every pre-existing caller behaves exactly as before.
 */
export const adminQuery = customQuery(query, guardedCtx("adminRead"));
export const adminMutation = customMutation(mutation, guardedCtx("admin"));

/**
 * Governance surfaces: the register, approvals, the audit trail, policies in
 * force, and the evidence pack.
 *
 * Read-only by construction. There is no `governanceMutation`, and there should
 * never be one — an auditor who can change what they are auditing is the
 * problem this role exists to solve. Governance screens that need an edit send
 * the reader to the screen that owns the thing, guarded by `adminMutation`.
 */
export const governanceQuery = customQuery(query, guardedCtx("governance"));

/**
 * Platform-wide surfaces.
 *
 * `superAdminQuery` reads, so it also admits `READ_ONLY` — the admin section is
 * the super-admin console, and a read-only account that could not reach these
 * would find half of it blank. `superAdminMutation` writes and still admits
 * `SUPER_ADMIN` alone.
 */
export const superAdminQuery = customQuery(query, guardedCtx("superAdminRead"));
export const superAdminMutation = customMutation(mutation, guardedCtx("superAdmin"));

/**
 * Action equivalents.
 *
 * Actions have no direct database access, so the caller is resolved through
 * `actionAuth`, which fetches the user via an internal query. They therefore
 * expose `user` and `userId` but not `companyId` — an action that needs the
 * tenant should read it from the record it is operating on, or call
 * `getActiveCompanyId(ctx.user)`.
 */
const guardedActionCtx = (guard: Guard) =>
  customCtx(async (ctx: ActionCtx) => {
    const current =
      guard === "superAdmin"
        ? await requireActionRole(ctx, ["SUPER_ADMIN"])
        : guard === "superAdminRead"
          ? await requireActionRole(ctx, SUPER_ADMIN_READ_ROLES)
        : guard === "admin"
          ? await requireActionRole(ctx, ADMIN_WRITE_ROLES)
          : guard === "adminRead"
            ? await requireActionRole(ctx, ADMIN_READ_ROLES)
            : guard === "governance"
              ? await requireActionRole(ctx, GOVERNANCE_READ_ROLES)
              : await requireActionUser(ctx);

    return { user: current.user, userId: current.userId };
  });

export const tenantAction = customAction(action, guardedActionCtx("authenticated"));
export const adminAction = customAction(action, guardedActionCtx("admin"));
export const superAdminAction = customAction(action, guardedActionCtx("superAdmin"));

/**
 * Producing the evidence pack is an action rather than a query, and an auditor
 * has to be able to run it — an export they cannot take is not evidence.
 *
 * It reads and returns; it must not write. The guard cannot enforce that on its
 * own, so any function declared with this builder is expected to be free of
 * side effects beyond the audit record of the export itself.
 */
export const governanceAction = customAction(action, guardedActionCtx("governance"));

/**
 * Deliberately unauthenticated surface.
 *
 * `reason` is required and unused at runtime: it exists so the decision is
 * recorded next to the code and shows up in review, rather than being inferred
 * from the absence of a guard.
 */
export function publicQuery<ArgsValidator extends PropertyValidators, Output>(config: {
  reason: string;
  args: ArgsValidator;
  handler: (ctx: QueryCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return query({ args: config.args, handler: config.handler });
}

export function publicMutation<ArgsValidator extends PropertyValidators, Output>(config: {
  reason: string;
  args: ArgsValidator;
  handler: (ctx: MutationCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return mutation({ args: config.args, handler: config.handler });
}

export function publicAction<ArgsValidator extends PropertyValidators, Output>(config: {
  reason: string;
  args: ArgsValidator;
  handler: (ctx: ActionCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return action({ args: config.args, handler: config.handler });
}
