import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getRegisteredMigrationNames } from "./dataMigrations";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

const SWARM_LOG_MIGRATION = "2026-07-25-swarm-logs-company-id";

// The runner reschedules itself per batch, so tests must drive the scheduler.
// convex-test requires fake timers for this; `finishAllScheduledFunctions`
// loops advanceTimers until nothing further is queued.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Derived from an actual call so the schema's data model flows into the type.
// Annotating helpers as `ReturnType<typeof convexTest>` instead loses it, and
// `withIndex` then only sees system indexes.
const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type TestConvex = ReturnType<typeof makeTest>;

async function drainScheduler(t: TestConvex) {
  await finishScheduled(t);
}

async function seedSwarmLogs(
  t: TestConvex,
  args: { logsWithCompany: number; logsWithoutCompany: number },
) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { email: "u@test.com", role: "USER", companyId });

    const tenantThreadId = await ctx.db.insert("threads", {
      userId,
      companyId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // A thread with no company: its logs must stay unstamped rather than being
    // assigned an arbitrary tenant.
    const orphanThreadId = await ctx.db.insert("threads", {
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    let order = 0;
    for (let i = 0; i < args.logsWithCompany; i += 1) {
      await ctx.db.insert("swarmLogs", {
        threadId: tenantThreadId,
        message: `stamped-${i}`,
        status: "success",
        order: (order += 1),
        createdAt: Date.now(),
        companyId,
      });
    }
    for (let i = 0; i < args.logsWithoutCompany; i += 1) {
      await ctx.db.insert("swarmLogs", {
        threadId: tenantThreadId,
        message: `legacy-${i}`,
        status: "success",
        order: (order += 1),
        createdAt: Date.now(),
      });
    }
    await ctx.db.insert("swarmLogs", {
      threadId: orphanThreadId,
      message: "orphan",
      status: "success",
      order: (order += 1),
      createdAt: Date.now(),
    });

    return { companyId, orphanThreadId };
  });
}

async function getMigration(t: TestConvex, name: string) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("dataMigrations")
        .withIndex("by_name", (q) => q.eq("name", name))
        .unique(),
  );
}

describe("migration runner", () => {
  test("backfills missing values and leaves correct rows alone", async () => {
    const t = makeTest();
    const { companyId } = await seedSwarmLogs(t, { logsWithCompany: 3, logsWithoutCompany: 5 });

    await t.mutation(internal.dataMigrations.run, { name: SWARM_LOG_MIGRATION });
    await drainScheduler(t);

    const record = await getMigration(t, SWARM_LOG_MIGRATION);
    expect(record?.status).toBe("COMPLETED");
    // 5 legacy rows patched; the 3 already-stamped and the orphan are untouched.
    expect(record?.updated).toBe(5);
    expect(record?.processed).toBe(9);

    const logs = await t.run(async (ctx) => await ctx.db.query("swarmLogs").collect());
    expect(logs.filter((log) => log.companyId === companyId)).toHaveLength(8);
    expect(logs.filter((log) => log.companyId === undefined)).toHaveLength(1);
    expect(logs.find((log) => log.companyId === undefined)?.message).toBe("orphan");
  });

  test("resumes across batches rather than doing everything in one transaction", async () => {
    const t = makeTest();
    await seedSwarmLogs(t, { logsWithCompany: 0, logsWithoutCompany: 25 });

    await t.mutation(internal.dataMigrations.run, { name: SWARM_LOG_MIGRATION, batchSize: 10 });
    await drainScheduler(t);

    const record = await getMigration(t, SWARM_LOG_MIGRATION);
    expect(record?.status).toBe("COMPLETED");
    expect(record?.updated).toBe(25);
    // 26 rows at 10 per batch: it genuinely paginated instead of one big pass.
    expect(record?.batches).toBeGreaterThan(1);
  });

  test("is idempotent: a forced re-run changes nothing further", async () => {
    const t = makeTest();
    await seedSwarmLogs(t, { logsWithCompany: 0, logsWithoutCompany: 4 });

    await t.mutation(internal.dataMigrations.run, { name: SWARM_LOG_MIGRATION });
    await drainScheduler(t);
    expect((await getMigration(t, SWARM_LOG_MIGRATION))?.updated).toBe(4);

    await t.mutation(internal.dataMigrations.run, { name: SWARM_LOG_MIGRATION, force: true });
    await drainScheduler(t);

    const record = await getMigration(t, SWARM_LOG_MIGRATION);
    expect(record?.status).toBe("COMPLETED");
    // Everything was already stamped, so nothing needed changing.
    expect(record?.updated).toBe(0);
  });

  test("will not silently re-run a completed migration", async () => {
    const t = makeTest();
    await seedSwarmLogs(t, { logsWithCompany: 0, logsWithoutCompany: 2 });

    await t.mutation(internal.dataMigrations.run, { name: SWARM_LOG_MIGRATION });
    await drainScheduler(t);

    const second = await t.mutation(internal.dataMigrations.run, { name: SWARM_LOG_MIGRATION });
    expect(second).toMatchObject({ status: "COMPLETED", alreadyComplete: true });
  });

  test("rejects an unknown migration name instead of doing nothing quietly", async () => {
    const t = makeTest();

    await expect(
      t.mutation(internal.dataMigrations.run, { name: "does-not-exist" }),
    ).rejects.toThrow(/Unknown migration/);
  });

  test("status queries are super-admin only", async () => {
    const t = makeTest();
    const { adminId, superAdminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "C", createdAt: Date.now() });
      return {
        adminId: await ctx.db.insert("users", { email: "a@test.com", role: "ADMIN", companyId }),
        superAdminId: await ctx.db.insert("users", { email: "s@test.com", role: "SUPER_ADMIN" }),
      };
    });

    await expect(
      t.withIdentity({ subject: adminId as Id<"users"> }).query(api.dataMigrations.listStatus, {}),
    ).rejects.toThrow();

    await expect(
      t.withIdentity({ subject: superAdminId as Id<"users"> }).query(api.dataMigrations.listStatus, {}),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: SWARM_LOG_MIGRATION })]),
    );
  });

  test("reports registered migrations that have never been run", async () => {
    const t = makeTest();
    const superAdminId = await t.run(
      async (ctx) => await ctx.db.insert("users", { email: "s@test.com", role: "SUPER_ADMIN" }),
    );

    const statuses = await t
      .withIdentity({ subject: superAdminId as Id<"users"> })
      .query(api.dataMigrations.listStatus, {});

    expect(statuses.find((entry) => entry.name === SWARM_LOG_MIGRATION)?.status).toBe("NOT_RUN");
  });

  test("every registered migration has a stable dated name", () => {
    const names = getRegisteredMigrationNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
    }
  });
});

const LAST_LOGIN_MIGRATION = "2026-07-31-user-last-login-at";

describe("2026-07-31-user-last-login-at", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function seedUsers(t: TestConvex) {
    return await t.run(async (ctx) => {
      const now = Date.now();

      const signedIn = await ctx.db.insert("users", { email: "signed-in@example.com", role: "USER" });
      for (const offset of [5 * DAY, 1 * DAY, 9 * DAY]) {
        await ctx.db.insert("logins", {
          userId: signedIn,
          ip: "1.2.3.4",
          device: "Chrome",
          location: "London",
          status: "SUCCESS",
          timestamp: now - offset,
        });
      }

      // Only ever failed: has genuinely never signed in.
      const lockedOut = await ctx.db.insert("users", { email: "locked@example.com", role: "USER" });
      await ctx.db.insert("logins", {
        userId: lockedOut,
        ip: "1.2.3.4",
        device: "Chrome",
        location: "London",
        status: "FAILED",
        timestamp: now,
      });

      // No login rows at all.
      const brandNew = await ctx.db.insert("users", { email: "new@example.com", role: "USER" });

      return { signedIn, lockedOut, brandNew, newest: now - DAY };
    });
  }

  test("stamps the newest successful login onto each user", async () => {
    const t = makeTest();
    const { signedIn, newest } = await seedUsers(t);

    await t.mutation(internal.dataMigrations.run, { name: LAST_LOGIN_MIGRATION });
    await drainScheduler(t);

    const record = await getMigration(t, LAST_LOGIN_MIGRATION);
    expect(record?.status).toBe("COMPLETED");
    expect(record?.updated).toBe(1);

    const stamped = await t.run(async (ctx) => (await ctx.db.get(signedIn))?.lastLoginAt);
    expect(stamped).toBe(newest);
  });

  test("a user whose only attempts failed still reads as never signed in", async () => {
    const t = makeTest();
    const { lockedOut, brandNew } = await seedUsers(t);

    await t.mutation(internal.dataMigrations.run, { name: LAST_LOGIN_MIGRATION });
    await drainScheduler(t);

    const values = await t.run(async (ctx) => ({
      lockedOut: (await ctx.db.get(lockedOut))?.lastLoginAt ?? null,
      brandNew: (await ctx.db.get(brandNew))?.lastLoginAt ?? null,
    }));

    expect(values.lockedOut).toBeNull();
    expect(values.brandNew).toBeNull();
  });

  test("is idempotent — a second run changes nothing", async () => {
    const t = makeTest();
    await seedUsers(t);

    await t.mutation(internal.dataMigrations.run, { name: LAST_LOGIN_MIGRATION });
    await drainScheduler(t);
    await t.mutation(internal.dataMigrations.run, { name: LAST_LOGIN_MIGRATION, force: true });
    await drainScheduler(t);

    const record = await getMigration(t, LAST_LOGIN_MIGRATION);
    expect(record?.updated).toBe(0);
  });
});
