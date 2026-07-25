import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function seedSuperAdmin(t: ReturnType<typeof makeTest>) {
  const superAdminId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "super@test.com",
      name: "Sonae Operator",
      role: "SUPER_ADMIN",
      createdAt: Date.now(),
    }),
  );
  return t.withIdentity({ subject: superAdminId });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("maintenance scripts", () => {
  test("only super admins can list and run maintenance scripts", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        createdAt: Date.now(),
      })
    );
    const userClient = t.withIdentity({ subject: userId });

    await expect(userClient.query(api.maintenanceScripts.list, {})).rejects.toThrow("Unauthorized");
    await expect(
      userClient.mutation(api.maintenanceScripts.run, { scriptId: "inventory-rollup-rebuild" })
    ).rejects.toThrow("Unauthorized");
  });

  test("inventory rollup rebuild runs through the allowlisted maintenance dispatcher", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, planId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        name: "Sonae Operator",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const planId = await ctx.db.insert("plans", {
        name: "Scale",
        description: "Scale plan",
        messageLimit: -1,
        priceGBP: 150,
        isActive: true,
        createdAt: Date.now(),
      });
      await ctx.db.insert("companies", {
        name: "Scale Corp",
        planId,
        createdAt: Date.now(),
      });

      return { superAdminId, planId };
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const scriptsBeforeRun = await superAdminClient.query(api.maintenanceScripts.list, {});
    // Located by id rather than index so registering another script does not
    // break this test.
    expect(scriptsBeforeRun.find((script) => script.id === "inventory-rollup-rebuild")).toMatchObject({
      id: "inventory-rollup-rebuild",
      name: "Rebuild inventory rollup",
      lastRun: null,
    });

    const result = await superAdminClient.mutation(api.maintenanceScripts.run, {
      scriptId: "inventory-rollup-rebuild",
    });
    expect(result).toMatchObject({
      success: true,
      summary: "Inventory rollup rebuilt for 1 companies and 1 users.",
    });

    const inventory = await superAdminClient.query(api.analytics.getGlobalInventoryMetrics, {});
    expect(inventory).toMatchObject({
      aggregates: { mrr: 150 },
      systemIntegrity: {
        totalProvisionedUsers: 1,
        totalProvisionedCompanies: 1,
      },
      planDistribution: [{ planId, name: "Scale", mrr: 150, companies: 1 }],
    });

    const script = await superAdminClient.query(api.maintenanceScripts.get, {
      scriptId: "inventory-rollup-rebuild",
    });
    expect(script?.lastRun).toMatchObject({
      status: "SUCCESS",
      actorName: "Sonae Operator",
    });
    expect(script?.history).toHaveLength(1);

    const auditLogs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "MAINTENANCE_SCRIPT_STARTED",
      "MAINTENANCE_SCRIPT_SUCCEEDED",
    ]);
    expect(auditLogs[0]).toMatchObject({
      entityType: "maintenanceScripts",
      entityId: "inventory-rollup-rebuild",
    });
  });

  describe("apply pending data migrations", () => {
    test("is listed so migrations can be run from the admin UI, not only the CLI", async () => {
      const t = makeTest();
      const superAdminClient = await seedSuperAdmin(t);

      const scripts = await superAdminClient.query(api.maintenanceScripts.list, {});
      const migrationScript = scripts.find((script) => script.id === "data-migrations-apply");

      expect(migrationScript).toMatchObject({ category: "Migrations", riskLevel: "MEDIUM" });
      // The operator must not be told it finished when it has not.
      expect(migrationScript?.expectedDuration).toMatch(/background/i);
    });

    test("starts pending migrations and actually backfills the records", async () => {
      vi.useFakeTimers();
      const t = makeTest();
      const superAdminClient = await seedSuperAdmin(t);

      const companyId = await t.run(async (ctx) => {
        const companyId = await ctx.db.insert("companies", { name: "C", createdAt: Date.now() });
        const threadId = await ctx.db.insert("threads", {
          companyId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        for (let i = 0; i < 3; i += 1) {
          await ctx.db.insert("swarmLogs", {
            threadId,
            message: `legacy-${i}`,
            status: "success",
            order: i,
            createdAt: Date.now(),
          });
        }
        return companyId;
      });

      const result = await superAdminClient.mutation(api.maintenanceScripts.run, {
        scriptId: "data-migrations-apply",
      });
      expect(result.summary).toMatch(/Started 1 migration/);
      expect(result.summary).toMatch(/background/i);

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const logs = await t.run(async (ctx) => ctx.db.query("swarmLogs").collect());
      expect(logs.every((log) => log.companyId === companyId)).toBe(true);
    });

    test("reports already-complete migrations instead of restarting them", async () => {
      vi.useFakeTimers();
      const t = makeTest();
      const superAdminClient = await seedSuperAdmin(t);

      await superAdminClient.mutation(api.maintenanceScripts.run, {
        scriptId: "data-migrations-apply",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const second = await superAdminClient.mutation(api.maintenanceScripts.run, {
        scriptId: "data-migrations-apply",
      });

      expect(second.summary).toMatch(/already complete/i);
      expect(second.summary).not.toMatch(/Started \d+ migration/);
    });

    test("leaves an in-progress migration alone rather than resetting its progress", async () => {
      const t = makeTest();
      const superAdminClient = await seedSuperAdmin(t);

      // Simulate a migration part-way through its pages.
      await t.run(async (ctx) => {
        await ctx.db.insert("dataMigrations", {
          name: "2026-07-25-swarm-logs-company-id",
          status: "RUNNING",
          cursor: "partway",
          processed: 10,
          updated: 4,
          batches: 1,
          startedAt: Date.now(),
          updatedAt: Date.now(),
        });
      });

      const result = await superAdminClient.mutation(api.maintenanceScripts.run, {
        scriptId: "data-migrations-apply",
      });
      expect(result.summary).toMatch(/already running/i);

      const record = await t.run(async (ctx) =>
        ctx.db
          .query("dataMigrations")
          .withIndex("by_name", (q) => q.eq("name", "2026-07-25-swarm-logs-company-id"))
          .unique(),
      );
      // Cursor and counters untouched: restarting would have reset them to 0.
      expect(record).toMatchObject({ cursor: "partway", processed: 10, updated: 4 });
    });

    test("restarts a previously failed migration", async () => {
      vi.useFakeTimers();
      const t = makeTest();
      const superAdminClient = await seedSuperAdmin(t);

      await t.run(async (ctx) => {
        await ctx.db.insert("dataMigrations", {
          name: "2026-07-25-swarm-logs-company-id",
          status: "FAILED",
          processed: 5,
          updated: 1,
          batches: 1,
          startedAt: Date.now(),
          updatedAt: Date.now(),
          error: "transient failure",
        });
      });

      const result = await superAdminClient.mutation(api.maintenanceScripts.run, {
        scriptId: "data-migrations-apply",
      });
      expect(result.summary).toMatch(/Started 1 migration/);

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const record = await t.run(async (ctx) =>
        ctx.db
          .query("dataMigrations")
          .withIndex("by_name", (q) => q.eq("name", "2026-07-25-swarm-logs-company-id"))
          .unique(),
      );
      expect(record?.status).toBe("COMPLETED");
      // The stale failure message must be cleared, not carried into the new run.
      expect(record?.error).toBeUndefined();
    });
  });
});
