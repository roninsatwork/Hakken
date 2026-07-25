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
import {
  getActiveCompanyId,
  requireAdmin,
  requireCurrentUser,
  requireSuperAdmin,
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

type Guard = "authenticated" | "admin" | "superAdmin";

async function resolveTenantIdentity(
  ctx: QueryCtx | MutationCtx,
  guard: Guard,
): Promise<TenantIdentity> {
  const current =
    guard === "superAdmin"
      ? await requireSuperAdmin(ctx)
      : guard === "admin"
        ? await requireAdmin(ctx)
        : await requireCurrentUser(ctx);

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

/** ADMIN or SUPER_ADMIN. */
export const adminQuery = customQuery(query, guardedCtx("admin"));
export const adminMutation = customMutation(mutation, guardedCtx("admin"));

/** SUPER_ADMIN only. */
export const superAdminQuery = customQuery(query, guardedCtx("superAdmin"));
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
        : guard === "admin"
          ? await requireActionRole(ctx, ["ADMIN", "SUPER_ADMIN"])
          : await requireActionUser(ctx);

    return { user: current.user, userId: current.userId };
  });

export const tenantAction = customAction(action, guardedActionCtx("authenticated"));
export const adminAction = customAction(action, guardedActionCtx("admin"));
export const superAdminAction = customAction(action, guardedActionCtx("superAdmin"));

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
