import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Log Purge safeguards and interactive cancellation", () => {
  test("Only SUPER_ADMIN can update pipeline config, and must enforce >= 30 days retention floor", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Create user roles
    const standardUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
      });
    });

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });
    });

    const userClient = t.withIdentity({ subject: standardUserId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    // 1. Non-super-admin is rejected
    await expect(
      userClient.mutation(api.purges.updatePipelineConfig, {
        configStr: JSON.stringify({
          agentLogs: { enabled: true, retentionDays: 45, interval: "DAILY", hourUtc: 2 }
        })
      })
    ).rejects.toThrow("Unauthorized");

    // 2. Reject policy < 30 days
    await expect(
      superAdminClient.mutation(api.purges.updatePipelineConfig, {
        configStr: JSON.stringify({
          agentLogs: { enabled: true, retentionDays: 14, interval: "DAILY", hourUtc: 2 }
        })
      })
    ).rejects.toThrow("Retention policy for category 'agentLogs' must be at least 30 days.");

    // 3. Accept policy >= 30 days
    await superAdminClient.mutation(api.purges.updatePipelineConfig, {
      configStr: JSON.stringify({
        agentLogs: { enabled: true, retentionDays: 30, interval: "DAILY", hourUtc: 2 }
      })
    });

    const currentConfig = await superAdminClient.query(api.purges.getPipelineConfig);
    expect(currentConfig.agentLogs.retentionDays).toBe(30);
  });

  test("Only SUPER_ADMIN can cancel active purge executions and audit logs are recorded", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const standardUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
      });
    });

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });
    });

    const userClient = t.withIdentity({ subject: standardUserId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    // Seed running purge history
    const historyId = await t.run(async (ctx) => {
      return await ctx.db.insert("purgeHistory", {
        pipelineKey: "agentLogs",
        triggerType: "MANUAL",
        status: "RUNNING",
        recordsPurged: 15,
        startedAt: Date.now(),
      });
    });

    // 1. Non-super-admin is rejected
    await expect(
      userClient.mutation(api.purges.cancelPurge, { historyId })
    ).rejects.toThrow("Unauthorized");

    // 2. Super admin cancels successfully
    const success = await superAdminClient.mutation(api.purges.cancelPurge, { historyId });
    expect(success).toBe(true);

    // Verify record state
    const historyRec = await t.run(async (ctx) => {
      return await ctx.db.get(historyId);
    });
    expect(historyRec?.status).toBe("CANCELLED");
    expect(historyRec?.completedAt).toBeDefined();

    // Verify audit logs
    const auditLogs = await t.run(async (ctx) => {
      return await ctx.db.query("auditLogs").collect();
    });
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].actionType).toBe("MANUAL_PURGE_CANCEL");
    expect(auditLogs[0].entityId).toBe(historyId);
  });
});
