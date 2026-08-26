import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Infer, ObjectType, PropertyValidators, Validator } from "convex/values";
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
  getCurrentUser,
  requireAdmin,
  requireAdminReader,
  requireCurrentUser,
  requireGovernanceReader,
  requireSuperAdmin,
  requireSuperAdminReader,
} from "./authz";
import { requireActionRole, requireActionUser } from "./actionAuth";
import { appError } from "./utils/appError";
import { normalizeEnabledModules } from "./utils/companyModules";

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
  if (!document) throw appError("UNAUTHORIZED", message);
  if (ctx.user.role === "SUPER_ADMIN") return;
  if (!document.companyId || document.companyId !== ctx.companyId) {
    throw appError("UNAUTHORIZED", message);
  }
}

/** The caller's company, when the operation cannot proceed without one. */
export function requireTenant(ctx: TenantIdentity, message = "No active company"): Id<"companies"> {
  if (!ctx.companyId) throw appError("NO_ACTIVE_COMPANY", message);
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
 * A capability that can be withheld from a company.
 *
 * `moduleQuery` and `moduleMutation` are `tenantQuery`/`tenantMutation` with
 * one more structural fact: the function belongs to a switchable capability,
 * named in the declaration the way `publicQuery` names its reason. The check
 * runs before the handler, so a company with the module withheld cannot reach
 * the data by URL, by API call, or by any screen the navigation forgot to hide
 * — the menu is not the gate, this is.
 *
 * Who passes without the flag:
 *
 * - **Super admins.** The admin console is where a withheld capability is
 *   administered; a switch that locked out the person holding it would be a
 *   door that closes from the outside. This holds while impersonating too —
 *   impersonation exists so a super admin can see a company's workspace, and
 *   the sidebar still hides what the company cannot reach, so the view stays
 *   honest while the console keeps working.
 * - **Platform-scoped readers** — an auditor or oversight role with no active
 *   company. The role guard has already admitted them; there is no company
 *   whose switch could apply.
 *
 * `guard` defaults to `authenticated` and accepts the read/write admin guards
 * and `governance`, so a function keeps exactly the role check it had before
 * it named its module. Loosening a guard to gain a module check would be a
 * trade nobody asked for.
 */
export type ModuleGuard = "authenticated" | "admin" | "adminRead" | "governance";

/**
 * Every capability this company holds: its own list plus its plan's grants.
 *
 * The one place the two sources meet. The company's own `enabledModules` is
 * the override and only ever adds — a company can be given something its tier
 * does not include, but not have its tier quietly sold out from under it; to
 * withhold what a plan grants, move the company to a plan without it. Every
 * reader — the builders below, the workspace query the sidebar and section
 * gates share, and the soft public surfaces — goes through here, so no two of
 * them can answer differently.
 */
export async function effectiveModulesFor(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  company: Doc<"companies"> | null | undefined,
): Promise<string[]> {
  if (!company) return [];

  const own = normalizeEnabledModules(company.enabledModules);
  if (!company.planId) return own;

  const plan = await ctx.db.get(company.planId);
  const granted = normalizeEnabledModules(plan?.grantedModules);
  return [...new Set([...own, ...granted])];
}

async function requireModuleOn(
  ctx: QueryCtx | MutationCtx,
  identity: TenantIdentity,
  moduleKey: string,
): Promise<void> {
  if (identity.user.role === "SUPER_ADMIN") return;
  if (!identity.companyId) return;

  const company = await ctx.db.get(identity.companyId);
  const held = await effectiveModulesFor(ctx, company);
  if (!held.includes(moduleKey)) {
    throw appError("MODULE_DISABLED", "This section is switched off for your workspace");
  }
}

/*
 * Convex's own builder constraint, named once.
 *
 * `Validator<any, "required", any>` is the shape Convex uses for "a validator,
 * whatever it validates", and `any` as the output default is what lets the
 * handler's own return type be inferred rather than pinned. Both are genuinely
 * unavoidable here — this is the seam where our wrappers meet Convex's
 * generics — so the exception is taken once, on two named aliases, rather than
 * twenty-eight times across seven signatures.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyReturnsValidator = Validator<any, "required", any>;
type InferredOutput = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * What a handler must return, given the validator its declaration names.
 *
 * Convex's own builders constrain the handler against `returns`, which is what
 * makes a mismatch a compile error rather than a runtime one. Wrapping them
 * lost that: every builder here declared `returns?: GenericValidator`, and a
 * `GenericValidator` tells the compiler nothing about the shape, so the
 * handler was unconstrained on all forty-one guarded surfaces. Enforcement was
 * runtime-only, which means a branch nobody exercised in a test failed in
 * production rather than in the editor.
 *
 * Deliberately the *unwrapped* value, not Convex's `ReturnValueForOptionalValidator`:
 * that permits `T | Promise<T>`, and these builders already say
 * `Output | Promise<Output>` in the handler signature, so reusing it would
 * allow a promise of a promise and reconcile with nothing.
 */
type HandlerOutputFor<ReturnsValidator> = [ReturnsValidator] extends [AnyReturnsValidator]
  ? Infer<ReturnsValidator>
  : InferredOutput;

export function moduleQuery<
  ArgsValidator extends PropertyValidators,
  ReturnsValidator extends AnyReturnsValidator | void = void,
  Output extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
>(config: {
  module: string;
  guard?: ModuleGuard;
  args: ArgsValidator;
  /** Passed straight to Convex, exactly as on a plain declaration. */
  returns?: ReturnsValidator;
  handler: (ctx: TenantQueryCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return query({
    args: config.args,
    ...(config.returns ? { returns: config.returns } : {}),
    handler: async (ctx: QueryCtx, args: ObjectType<ArgsValidator>) => {
      const identity = await resolveTenantIdentity(ctx, config.guard ?? "authenticated");
      await requireModuleOn(ctx, identity, config.module);
      return config.handler({ ...ctx, ...identity }, args);
    },
  });
}

export function moduleMutation<
  ArgsValidator extends PropertyValidators,
  ReturnsValidator extends AnyReturnsValidator | void = void,
  Output extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
>(config: {
  module: string;
  guard?: ModuleGuard;
  args: ArgsValidator;
  /** Passed straight to Convex, exactly as on a plain declaration. */
  returns?: ReturnsValidator;
  handler: (ctx: TenantMutationCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return mutation({
    args: config.args,
    ...(config.returns ? { returns: config.returns } : {}),
    handler: async (ctx: MutationCtx, args: ObjectType<ArgsValidator>) => {
      const identity = await resolveTenantIdentity(ctx, config.guard ?? "authenticated");
      await requireModuleOn(ctx, identity, config.module);
      return config.handler({ ...ctx, ...identity }, args);
    },
  });
}

/**
 * Authenticated-or-empty surface.
 *
 * Twelve queries wore the `public*` label with the same pasted reason: they
 * are really for signed-in callers, and merely prefer showing an empty screen
 * to showing an error when there is no session. Keeping them in the public
 * register made the most security-sensitive list in the system a quarter
 * noise — a reviewer asking "what can a stranger reach?" had to read every
 * reason to find out. This builder is that behaviour as a mechanism instead
 * of a promise: no qualifying caller, `empty` comes back and the handler
 * never runs; a qualifying caller, and the handler gets the same resolved
 * identity every guarded builder provides. `reason` records why soft-failing
 * is the right shape for this surface. Anything the handler must still decide
 * per record — company membership, document ownership — stays in the handler,
 * exactly as it does under the guarded builders.
 */
export function softQuery<
  ArgsValidator extends PropertyValidators,
  ReturnsValidator extends AnyReturnsValidator | void = void,
  Output extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
  /**
   * What a caller with no session receives. Held to the same declaration
   * as the handler: it is a real answer from this surface, and a screen
   * must not be handed a shape the surface says it never returns.
   */
  Empty extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
>(config: {
  reason: string;
  args: ArgsValidator;
  /** Passed straight to Convex, exactly as on a plain declaration. */
  returns?: ReturnsValidator;
  /** What a caller with no session (or the wrong role) receives. */
  empty: Empty;
  /** Roles admitted beyond "any signed-in user". Omit to admit all roles. */
  allowRoles?: readonly NonNullable<Doc<"users">["role"]>[];
  handler: (ctx: TenantQueryCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return query({
    args: config.args,
    ...(config.returns ? { returns: config.returns } : {}),
    handler: async (ctx: QueryCtx, args: ObjectType<ArgsValidator>): Promise<Output | Empty> => {
      const current = await getCurrentUser(ctx);
      if (!current) return config.empty;
      if (config.allowRoles && (!current.user.role || !config.allowRoles.includes(current.user.role))) {
        return config.empty;
      }
      return config.handler(
        { ...ctx, user: current.user, userId: current.userId, companyId: getActiveCompanyId(current.user) },
        args,
      );
    },
  });
}

/** `softQuery` for writes that are no-ops without a session — see above. */
export function softMutation<
  ArgsValidator extends PropertyValidators,
  ReturnsValidator extends AnyReturnsValidator | void = void,
  Output extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
  /**
   * What a caller with no session receives. Held to the same declaration
   * as the handler: it is a real answer from this surface, and a screen
   * must not be handed a shape the surface says it never returns.
   */
  Empty extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
>(config: {
  reason: string;
  args: ArgsValidator;
  /** Passed straight to Convex, exactly as on a plain declaration. */
  returns?: ReturnsValidator;
  empty: Empty;
  allowRoles?: readonly NonNullable<Doc<"users">["role"]>[];
  handler: (ctx: TenantMutationCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return mutation({
    args: config.args,
    ...(config.returns ? { returns: config.returns } : {}),
    handler: async (ctx: MutationCtx, args: ObjectType<ArgsValidator>): Promise<Output | Empty> => {
      const current = await getCurrentUser(ctx);
      if (!current) return config.empty;
      if (config.allowRoles && (!current.user.role || !config.allowRoles.includes(current.user.role))) {
        return config.empty;
      }
      return config.handler(
        { ...ctx, user: current.user, userId: current.userId, companyId: getActiveCompanyId(current.user) },
        args,
      );
    },
  });
}

/**
 * Deliberately unauthenticated surface.
 *
 * `reason` is required and unused at runtime: it exists so the decision is
 * recorded next to the code and shows up in review, rather than being inferred
 * from the absence of a guard.
 */
export function publicQuery<
  ArgsValidator extends PropertyValidators,
  ReturnsValidator extends AnyReturnsValidator | void = void,
  Output extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
>(config: {
  reason: string;
  args: ArgsValidator;
  /** Passed straight to Convex, exactly as on a plain declaration. */
  returns?: ReturnsValidator;
  handler: (ctx: QueryCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return query({
    args: config.args,
    ...(config.returns ? { returns: config.returns } : {}),
    handler: config.handler,
  });
}

export function publicMutation<
  ArgsValidator extends PropertyValidators,
  ReturnsValidator extends AnyReturnsValidator | void = void,
  Output extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
>(config: {
  reason: string;
  args: ArgsValidator;
  /** Passed straight to Convex, exactly as on a plain declaration. */
  returns?: ReturnsValidator;
  handler: (ctx: MutationCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return mutation({
    args: config.args,
    ...(config.returns ? { returns: config.returns } : {}),
    handler: config.handler,
  });
}

export function publicAction<
  ArgsValidator extends PropertyValidators,
  ReturnsValidator extends AnyReturnsValidator | void = void,
  Output extends HandlerOutputFor<ReturnsValidator> = InferredOutput,
>(config: {
  reason: string;
  args: ArgsValidator;
  /** Passed straight to Convex, exactly as on a plain declaration. */
  returns?: ReturnsValidator;
  handler: (ctx: ActionCtx, args: ObjectType<ArgsValidator>) => Output | Promise<Output>;
}) {
  return action({
    args: config.args,
    ...(config.returns ? { returns: config.returns } : {}),
    handler: config.handler,
  });
}
