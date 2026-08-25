import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { publicMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";

export const localTestRoleValidator = v.union(
  v.literal("super-admin"),
  v.literal("company-admin"),
  v.literal("user")
);

type LocalTestRole = "super-admin" | "company-admin" | "user";
type UserRole = NonNullable<Doc<"users">["role"]>;

const LOCAL_TEST_COMPANY_NAME = "Local Test Company";

const LOCAL_TEST_USERS: Record<
  LocalTestRole,
  {
    email: string;
    name: string;
    role: UserRole;
    needsCompany: boolean;
  }
> = {
  "super-admin": {
    email: "local-super-admin@sonae.test",
    name: "Local Super Admin",
    role: "SUPER_ADMIN",
    needsCompany: false,
  },
  "company-admin": {
    email: "local-company-admin@sonae.test",
    name: "Local Company Admin",
    role: "ADMIN",
    needsCompany: true,
  },
  user: {
    email: "local-user@sonae.test",
    name: "Local User",
    role: "USER",
    needsCompany: true,
  },
};

function assertLocalTestAuthEnabled(secret: string) {
  if (process.env.LOCAL_TEST_AUTH_ENVIRONMENT === "production") {
    throw appError("UNAUTHORIZED", "Local test auth is not available in production.");
  }

  if (process.env.LOCAL_TEST_AUTH_ENABLED !== "1") {
    throw appError("MODULE_DISABLED", "Local test auth is disabled.");
  }

  const expectedSecret = process.env.LOCAL_TEST_AUTH_SECRET;
  if (!expectedSecret) {
    throw appError("NOT_CONFIGURED", "Local test auth secret is not configured.");
  }

  if (secret !== expectedSecret) {
    throw appError("INVALID_INPUT", "Invalid local test auth secret.");
  }
}

async function getOrCreateLocalTestCompany(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("companies")
    .withIndex("by_name", (q) => q.eq("name", LOCAL_TEST_COMPANY_NAME))
    .first();

  if (existing) return existing._id;

  return await ctx.db.insert("companies", {
    name: LOCAL_TEST_COMPANY_NAME,
    description: "Deterministic company for local real-auth browser tests.",
    createdAt: Date.now(),
  });
}

async function upsertLocalTestUser(
  ctx: MutationCtx,
  role: LocalTestRole,
  companyId: Id<"companies">
) {
  const userConfig = LOCAL_TEST_USERS[role];
  const existing = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", userConfig.email))
    .first();

  const userFields = {
    email: userConfig.email,
    name: userConfig.name,
    role: userConfig.role,
    companyId: userConfig.needsCompany ? companyId : undefined,
    image: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(userConfig.email)}`,
  };

  if (existing) {
    await ctx.db.patch(existing._id, userFields);
    return { userId: existing._id, action: "updated" as const, email: userConfig.email };
  }

  const userId = await ctx.db.insert("users", {
    ...userFields,
    createdAt: Date.now(),
  });
  return { userId, action: "created" as const, email: userConfig.email };
}

export const seedInternal = internalMutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    return await seedLocalTestAuth(ctx, args.secret);
  },
});

export const seed = publicMutation({
  reason: "Local sign-in helper for development. Gated on LOCAL_TEST_AUTH_ENABLED, refuses to run in production, and requires a shared secret.",
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    return await seedLocalTestAuth(ctx, args.secret);
  },
});

async function seedLocalTestAuth(ctx: MutationCtx, secret: string) {
  assertLocalTestAuthEnabled(secret);
  const companyId = await getOrCreateLocalTestCompany(ctx);

  const users = await Promise.all(
    (Object.keys(LOCAL_TEST_USERS) as LocalTestRole[]).map((role) =>
      upsertLocalTestUser(ctx, role, companyId)
    )
  );

  return {
    companyId,
    companyName: LOCAL_TEST_COMPANY_NAME,
    users,
  };
}

export const cleanup = publicMutation({
  reason: "Local sign-in helper for development. Gated on LOCAL_TEST_AUTH_ENABLED, refuses to run in production, and requires a shared secret.",
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertLocalTestAuthEnabled(args.secret);

    const emails = (Object.keys(LOCAL_TEST_USERS) as LocalTestRole[]).map(
      (role) => LOCAL_TEST_USERS[role].email
    );

    const cleared: string[] = [];
    for (const email of emails) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();
      if (!user) continue;

      await ctx.scheduler.runAfter(0, internal.users.purgeUserEntitiesInternal, {
        userId: user._id,
      });
      cleared.push(email);
    }

    return { companyName: LOCAL_TEST_COMPANY_NAME, cleared };
  },
});

export const authorize = internalQuery({
  args: {
    role: localTestRoleValidator,
    secret: v.string(),
  },
  handler: async (ctx, args): Promise<{ userId: Id<"users"> } | null> => {
    assertLocalTestAuthEnabled(args.secret);

    const userConfig = LOCAL_TEST_USERS[args.role];
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", userConfig.email))
      .first();

    if (!user || user.role !== userConfig.role) {
      throw appError("NOT_FOUND", "Local test user has not been seeded.");
    }

    if (userConfig.needsCompany && !user.companyId) {
      throw appError("INVALID_INPUT", "Local test tenant user is missing a company.");
    }

    return { userId: user._id };
  },
});
