import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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
    expect(scriptsBeforeRun).toHaveLength(1);
    expect(scriptsBeforeRun[0]).toMatchObject({
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
});
