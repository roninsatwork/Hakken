import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Audit log access controls", () => {
  test("non-super-admin users receive empty audit log reads", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
      });
    });

    const userClient = t.withIdentity({ subject: userId });

    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "TEST_ACTION",
        entityType: "systemConfig",
        timestamp: Date.now(),
      });
    });

    await expect(userClient.query(api.auditLogs.getConfig)).resolves.toBeNull();
    await expect(userClient.query(api.auditLogs.getRecentLogs)).resolves.toEqual([]);
  });

  test("super-admin users can update audit config and read recent logs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        name: "Admin User",
        role: "SUPER_ADMIN",
      });
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await superAdminClient.mutation(api.auditLogs.updateConfig, {
      enabled: true,
      retentionDays: 45,
      dayOfMonth: 10,
      hourOfDay: 3,
    });

    const config = await superAdminClient.query(api.auditLogs.getConfig);
    if (!config) {
      throw new Error("Expected audit purge config for super admin");
    }
    expect(config.enabled).toBe(true);
    expect(config.retentionDays).toBe(45);
    expect(config.dayOfMonth).toBe(10);
    expect(config.hourOfDay).toBe(3);
    expect(config.nextRunTimestamp).toBeGreaterThan(0);

    const logs = await superAdminClient.query(api.auditLogs.getRecentLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].actionType).toBe("UPDATE_AUDIT_PURGE_CONFIG");
    expect(logs[0].actorName).toBe("Admin User");
  });
});

/**
 * Widening the audit trail past super admins made scope a live question: the
 * governance read roles include `ADMIN`, and an unscoped trail would have shown
 * a company administrator every other tenant's activity.
 */
describe("audit trail tenancy", () => {
  test("a company admin sees their own workspace and no one else's", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyA, companyB } = await t.run(async (ctx) => {
      const companyA = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const companyB = await ctx.db.insert("companies", { name: "Other", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@acme.test",
        role: "ADMIN",
        companyId: companyA,
      });

      await ctx.db.insert("auditLogs", {
        actorId: adminId,
        actionType: "UPDATE_COMPANY",
        entityType: "companies",
        companyId: companyA,
        timestamp: Date.now(),
      });
      await ctx.db.insert("auditLogs", {
        actorId: adminId,
        actionType: "UPDATE_COMPANY",
        entityType: "companies",
        companyId: companyB,
        timestamp: Date.now(),
      });

      return { adminId, companyA, companyB };
    });

    const logs = await t
      .withIdentity({ subject: adminId })
      .query(api.auditLogs.getRecentLogs, {});

    expect(logs).toHaveLength(1);
    expect(logs[0].companyId).toBe(companyA);
    expect(logs.some((log) => log.companyId === companyB)).toBe(false);
  });

  test("an ordinary user sees nothing at all", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "user@acme.test", role: "USER" })
    );

    expect(await t.withIdentity({ subject: userId }).query(api.auditLogs.getRecentLogs, {})).toEqual([]);
  });
});
