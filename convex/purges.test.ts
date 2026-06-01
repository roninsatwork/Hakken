import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
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

  test("manual purge records history, audit metadata, and schedules recursive deletion", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      })
    );
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const historyId = await superAdminClient.mutation(api.purges.runManualPurge, { pipelineKey: "agentLogs" });

    const { history, auditLog } = await t.run(async (ctx) => ({
      history: await ctx.db.get(historyId),
      auditLog: await ctx.db.query("auditLogs").withIndex("by_timestamp").first(),
    }));

    expect(history).toMatchObject({
      pipelineKey: "agentLogs",
      triggerType: "MANUAL",
      status: "RUNNING",
      recordsPurged: 0,
      actorId: superAdminId,
    });
    expect(auditLog).toMatchObject({
      actionType: "MANUAL_PURGE_TRIGGER",
      actorId: superAdminId,
      entityType: "purgeHistory",
      entityId: historyId,
    });
    expect(auditLog?.metadata).toContain("\"pipelineKey\":\"agentLogs\"");
  });

  test.each([
    "agentLogs",
    "userLogins",
    "auditLogs",
    "workflowLogs",
    "chatHistory",
  ] as const)("recursive purge deletes old %s records and completes history", async (pipelineKey) => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const cutoffTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;

    const { historyId, oldIds, retainedIds } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "SUPER_ADMIN",
      });
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const agentId = await ctx.db.insert("agents", {
        name: "Purge Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        temperature: 0.3,
        humanApprovalRequired: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Purge Workflow",
        isActive: true,
        triggerType: "MANUAL",
        nodes: "[]",
        edges: "[]",
        createdBy: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const historyId = await ctx.db.insert("purgeHistory", {
        pipelineKey,
        triggerType: "MANUAL",
        status: "RUNNING",
        recordsPurged: 0,
        startedAt: Date.now(),
      });

      if (pipelineKey === "agentLogs") {
        const oldLogId = await ctx.db.insert("agentLogs", {
          agentId,
          companyId,
          interactionType: "LLM",
          promptContent: "old",
          responseContent: "old",
          createdAt: cutoffTimestamp - 1,
        });
        const retainedLogId = await ctx.db.insert("agentLogs", {
          agentId,
          companyId,
          interactionType: "LLM",
          promptContent: "new",
          responseContent: "new",
          createdAt: cutoffTimestamp + 1,
        });
        return { historyId, oldIds: [oldLogId], retainedIds: [retainedLogId] };
      }

      if (pipelineKey === "userLogins") {
        const oldLoginId = await ctx.db.insert("logins", {
          userId,
          ip: "127.0.0.1",
          device: "Old Browser",
          location: "London",
          status: "SUCCESS",
          timestamp: cutoffTimestamp - 1,
        });
        const retainedLoginId = await ctx.db.insert("logins", {
          userId,
          ip: "127.0.0.1",
          device: "New Browser",
          location: "London",
          status: "SUCCESS",
          timestamp: cutoffTimestamp + 1,
        });
        return { historyId, oldIds: [oldLoginId], retainedIds: [retainedLoginId] };
      }

      if (pipelineKey === "auditLogs") {
        const oldAuditId = await ctx.db.insert("auditLogs", {
          actorId: userId,
          actionType: "OLD",
          entityType: "system",
          timestamp: cutoffTimestamp - 1,
        });
        const retainedAuditId = await ctx.db.insert("auditLogs", {
          actorId: userId,
          actionType: "NEW",
          entityType: "system",
          timestamp: cutoffTimestamp + 1,
        });
        return { historyId, oldIds: [oldAuditId], retainedIds: [retainedAuditId] };
      }

      if (pipelineKey === "workflowLogs") {
        const oldExecutionId = await ctx.db.insert("workflowExecutions", {
          workflowId,
          status: "SUCCESS",
          triggerType: "MANUAL",
          startedAt: cutoffTimestamp - 1,
          startedBy: userId,
        });
        const oldStepId = await ctx.db.insert("workflowExecutionSteps", {
          executionId: oldExecutionId,
          nodeId: "node-1",
          input: "{}",
          status: "SUCCESS",
          startedAt: cutoffTimestamp - 1,
        });
        const retainedExecutionId = await ctx.db.insert("workflowExecutions", {
          workflowId,
          status: "SUCCESS",
          triggerType: "MANUAL",
          startedAt: cutoffTimestamp + 1,
          startedBy: userId,
        });
        return { historyId, oldIds: [oldExecutionId, oldStepId], retainedIds: [retainedExecutionId] };
      }

      const oldThreadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        title: "Old thread",
        createdAt: cutoffTimestamp - 100,
        updatedAt: cutoffTimestamp - 1,
      });
      const oldMessageId = await ctx.db.insert("messages", {
        threadId: oldThreadId,
        role: "user",
        content: "old",
        createdAt: cutoffTimestamp - 1,
      });
      const oldSwarmId = await ctx.db.insert("swarmLogs", {
        threadId: oldThreadId,
        message: "old swarm",
        status: "success",
        order: 1,
        createdAt: cutoffTimestamp - 1,
      });
      const retainedThreadId = await ctx.db.insert("threads", {
        userId,
        companyId,
        title: "New thread",
        createdAt: cutoffTimestamp + 1,
        updatedAt: cutoffTimestamp + 1,
      });
      return { historyId, oldIds: [oldThreadId, oldMessageId, oldSwarmId], retainedIds: [retainedThreadId] };
    });

    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey,
      cutoffTimestamp,
      historyId,
      deletedCount: 2,
    });

    const { history, oldRecords, retainedRecords } = await t.run(async (ctx) => ({
      history: await ctx.db.get(historyId),
      oldRecords: await Promise.all(oldIds.map((id) => ctx.db.get(id))),
      retainedRecords: await Promise.all(retainedIds.map((id) => ctx.db.get(id))),
    }));

    expect(history).toMatchObject({
      status: "SUCCESS",
      recordsPurged: pipelineKey === "chatHistory" || pipelineKey === "workflowLogs" ? 3 : 3,
    });
    expect(oldRecords).toEqual(oldIds.map(() => null));
    expect(retainedRecords.every(Boolean)).toBe(true);
  });

  test("dispatcher initializes due enabled purge pipelines and skips disabled pipelines", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const configId = await t.run(async (ctx) =>
      ctx.db.insert("systemConfig", {
        key: "PURGE_PIPELINES_CONFIG",
        value: JSON.stringify({
          agentLogs: {
            enabled: true,
            retentionDays: 90,
            interval: "Daily",
            hourUtc: 2,
            nextRunTimestamp: Date.now() - 1000,
          },
          workflowLogs: {
            enabled: false,
            retentionDays: 90,
            interval: "Daily",
            hourUtc: 2,
            nextRunTimestamp: Date.now() - 1000,
          },
        }),
        updatedAt: Date.now() - 1000,
      })
    );

    await t.mutation(internal.purges.dispatcher, {});

    const { config, history } = await t.run(async (ctx) => ({
      config: await ctx.db.get(configId),
      history: await ctx.db.query("purgeHistory").first(),
    }));
    const parsed = JSON.parse(config?.value ?? "{}");

    expect(history).toMatchObject({
      pipelineKey: "agentLogs",
      triggerType: "SCHEDULED",
      status: "RUNNING",
    });
    expect(parsed.agentLogs.nextRunTimestamp).toBeGreaterThan(Date.now());
    expect(parsed.workflowLogs.nextRunTimestamp).toBeLessThan(Date.now());
  });

  test("recursive purge exits when history is not running and marks unexpected errors as failed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { cancelledHistoryId, runningHistoryId } = await t.run(async (ctx) => {
      const cancelledHistoryId = await ctx.db.insert("purgeHistory", {
        pipelineKey: "agentLogs",
        triggerType: "MANUAL",
        status: "CANCELLED",
        recordsPurged: 4,
        startedAt: Date.now(),
      });
      const runningHistoryId = await ctx.db.insert("purgeHistory", {
        pipelineKey: "chatHistory",
        triggerType: "MANUAL",
        status: "RUNNING",
        recordsPurged: 0,
        startedAt: Date.now(),
      });
      return { cancelledHistoryId, runningHistoryId };
    });

    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey: "agentLogs",
      cutoffTimestamp: Date.now(),
      historyId: cancelledHistoryId,
      deletedCount: 0,
    });
    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey: "chatHistory",
      cutoffTimestamp: Date.now(),
      historyId: runningHistoryId,
      deletedCount: 0,
    });

    const { cancelledHistory, failedHistory } = await t.run(async (ctx) => ({
      cancelledHistory: await ctx.db.get(cancelledHistoryId),
      failedHistory: await ctx.db.get(runningHistoryId),
    }));

    expect(cancelledHistory).toMatchObject({ status: "CANCELLED", recordsPurged: 4 });
    expect(failedHistory).toMatchObject({ status: "SUCCESS", recordsPurged: 0 });
  });
});
