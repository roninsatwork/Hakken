import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

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
  if (!userId) throw new Error(unauthenticatedMessage);

  const user = await ctx.runQuery(internal.users.getUserInternal, { userId });
  if (!user) throw new Error(missingUserMessage);

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
    throw new Error(unauthorizedMessage);
  }
  return current;
}

export async function requireActionAdmin(
  ctx: ActionCtx,
  unauthorizedMessage = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated request"
) {
  return await requireActionRole(ctx, ["ADMIN", "SUPER_ADMIN"], unauthorizedMessage, unauthenticatedMessage);
}

export async function requireActionSuperAdmin(
  ctx: ActionCtx,
  unauthorizedMessage = "Unauthorized",
  unauthenticatedMessage = "Unauthenticated request"
) {
  return await requireActionRole(ctx, ["SUPER_ADMIN"], unauthorizedMessage, unauthenticatedMessage);
}
