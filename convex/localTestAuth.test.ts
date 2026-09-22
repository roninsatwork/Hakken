import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

const originalEnabled = process.env.LOCAL_TEST_AUTH_ENABLED;
const originalSecret = process.env.LOCAL_TEST_AUTH_SECRET;
const originalEnvironment = process.env.LOCAL_TEST_AUTH_ENVIRONMENT;

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

function enableLocalTestAuth() {
  process.env.LOCAL_TEST_AUTH_ENABLED = "1";
  process.env.LOCAL_TEST_AUTH_SECRET = "test-secret";
  delete process.env.LOCAL_TEST_AUTH_ENVIRONMENT;
}

function restoreEnv() {
  process.env.LOCAL_TEST_AUTH_ENABLED = originalEnabled;
  process.env.LOCAL_TEST_AUTH_SECRET = originalSecret;
  process.env.LOCAL_TEST_AUTH_ENVIRONMENT = originalEnvironment;
}

describe("local test auth", () => {
  beforeEach(() => {
    enableLocalTestAuth();
  });

  afterEach(() => {
    restoreEnv();
  });

  test("seeds deterministic users idempotently", async () => {
    const t = setup();

    const firstSeed = await t.mutation(api.localTestAuth.seed, { secret: "test-secret" });
    const secondSeed = await t.mutation(api.localTestAuth.seed, { secret: "test-secret" });

    expect(firstSeed.users.map((user) => user.action)).toEqual(["created", "created", "created"]);
    expect(secondSeed.users.map((user) => user.action)).toEqual(["updated", "updated", "updated"]);

    const snapshot = await t.run(async (ctx) => {
      const company = await ctx.db
        .query("companies")
        .withIndex("by_name", (q) => q.eq("name", "Local Test Company"))
        .first();
      const users = await ctx.db.query("users").collect();
      return { company, users };
    });

    expect(snapshot.company).toMatchObject({ name: "Local Test Company" });
    expect(snapshot.users).toHaveLength(3);
    expect(snapshot.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "local-super-admin@hakken.test", role: "SUPER_ADMIN" }),
        expect.objectContaining({
          email: "local-company-admin@hakken.test",
          role: "ADMIN",
          companyId: snapshot.company?._id,
        }),
        expect.objectContaining({
          email: "local-user@hakken.test",
          role: "USER",
          companyId: snapshot.company?._id,
        }),
      ])
    );
  });

  test("authorizes only seeded known roles with the shared secret", async () => {
    const t = setup();
    const seed = await t.mutation(api.localTestAuth.seed, { secret: "test-secret" });

    const authorized = await t.query(internal.localTestAuth.authorize, {
      role: "user",
      secret: "test-secret",
    });

    const seededUser = seed.users.find((user) => user.email === "local-user@hakken.test");
    expect(authorized?.userId).toBe(seededUser?.userId);

    await expect(
      t.query(internal.localTestAuth.authorize, { role: "user", secret: "wrong-secret" })
    ).rejects.toThrow("Invalid local test auth secret");
  });

  test("cleanup clears the seeded users' threads and keeps the identities", async () => {
    const t = setup();
    const seed = await t.mutation(api.localTestAuth.seed, { secret: "test-secret" });
    const seededUser = seed.users.find((user) => user.email === "local-user@hakken.test");

    await t.run(async (ctx) => {
      const threadId = await ctx.db.insert("threads", {
        userId: seededUser!.userId,
        title: "Real auth smoke",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        threadId,
        role: "user",
        content: "Real auth smoke",
        createdAt: Date.now(),
      });
    });

    vi.useFakeTimers();
    const result = await t.mutation(api.localTestAuth.cleanup, { secret: "test-secret" });
    expect(result.cleared).toEqual(
      expect.arrayContaining([
        "local-super-admin@hakken.test",
        "local-company-admin@hakken.test",
        "local-user@hakken.test",
      ])
    );

    await finishScheduled(t);
    vi.useRealTimers();

    const after = await t.run(async (ctx) => ({
      threads: await ctx.db.query("threads").collect(),
      messages: await ctx.db.query("messages").collect(),
      users: await ctx.db.query("users").collect(),
    }));

    expect(after.threads).toHaveLength(0);
    expect(after.messages).toHaveLength(0);
    expect(after.users).toHaveLength(3);
  });

  test("cleanup fails closed on a wrong secret", async () => {
    const t = setup();
    await t.mutation(api.localTestAuth.seed, { secret: "test-secret" });

    await expect(
      t.mutation(api.localTestAuth.cleanup, { secret: "wrong-secret" })
    ).rejects.toThrow("Invalid local test auth secret");
  });

  test("fails closed when disabled or marked production", async () => {
    const t = setup();

    process.env.LOCAL_TEST_AUTH_ENABLED = "0";
    await expect(t.mutation(api.localTestAuth.seed, { secret: "test-secret" })).rejects.toThrow(
      "Local test auth is disabled"
    );

    process.env.LOCAL_TEST_AUTH_ENABLED = "1";
    process.env.LOCAL_TEST_AUTH_ENVIRONMENT = "production";
    await expect(t.mutation(api.localTestAuth.seed, { secret: "test-secret" })).rejects.toThrow(
      "Local test auth is not available in production"
    );
  });
});
