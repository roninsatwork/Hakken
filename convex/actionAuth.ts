import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { appError } from "./utils/appError";

/**
 * The auth primitives the action builders stand on.
 *
 * `tenantAction`/`adminAction`/`superAdminAction` in `tenantFunctions.ts`
 * resolve their caller through these two functions — actions have no
 * `ctx.db`, so the user comes via an internal query. Write new actions with
 * the builders, not these; `invites.ts` is the one direct caller left.
 * The admin/super-admin convenience wrappers were removed 2026-08-21
 * (foundation-quality plan) — nothing called them; the builders own role
 * checks now.
 */

type UserRole = NonNullable<Doc<"users">["role"]>;

export type ActionCurrentUser = {
  userId: Id<"users">;
  user: Doc<"users">;
};

export async function requireActionUser(
  ctx: ActionCtx,
  unauthenticatedMessage = "Unauthenticated request",
  missingUserMessage = "Unauthorized"
): Promise<ActionCurrentUser> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw appError("UNAUTHENTICATED", unauthenticatedMessage);

  const user = await ctx.runQuery(internal.users.getUserInternal, { userId });
  if (!user) throw appError("UNAUTHORIZED", missingUserMessage);

  return { userId, user };
}

export async function requireActionRole(
  ctx: ActionCtx,
  roles: readonly UserRole[],
  unauthorizedMessage = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated request"
): Promise<ActionCurrentUser> {
  const current = await requireActionUser(ctx, unauthenticatedMessage, unauthorizedMessage);
  if (!current.user.role || !roles.includes(current.user.role)) {
    throw appError("UNAUTHORIZED", unauthorizedMessage);
  }
  return current;
}
