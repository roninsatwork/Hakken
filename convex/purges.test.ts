import { convexTest } from "convex-test";
import { expect, test, describe, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { AUDIT_PURGE_ACTION } from "./auditLogService";
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
          agentLogs: { enabled: true, retentionDays: 45, interval: "Daily", hourUtc: 2 }
        })
      })
    ).rejects.toThrow("Unauthorized");

    // 2. Reject policy < 30 days
    await expect(
      superAdminClient.mutation(api.purges.updatePipelineConfig, {
        configStr: JSON.stringify({
          agentLogs: { enabled: true, retentionDays: 14, interval: "Daily", hourUtc: 2 }
        })
      })
    ).rejects.toThrow("Retention policy for category 'agentLogs' must be at least 30 days.");

    // 2b. Reject an interval the scheduler does not recognise. The old code
    // accepted any string and then fell through the schedule calculator into
    // an always-past timestamp — a full purge every hour, forever.
    await expect(
      superAdminClient.mutation(api.purges.updatePipelineConfig, {
        configStr: JSON.stringify({
          agentLogs: { enabled: true, retentionDays: 45, interval: "DAILY", hourUtc: 2 }
        })
      })
    ).rejects.toThrow("Execution interval for category 'agentLogs'");

    // 3. Accept policy >= 30 days
    await superAdminClient.mutation(api.purges.updatePipelineConfig, {
      configStr: JSON.stringify({
        agentLogs: { enabled: true, retentionDays: 30, interval: "Daily", hourUtc: 2 }
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

  /*
   * The audit pipeline deletes the trail itself, so it carries two rules the
   * others do not. These moved here when the second, older retention engine on
   * the Security tab was removed and this pipeline became the only one that
   * clears audit records. See docs/plans/active/audit-trail-plan.md.
   */
  test("a clear-out of the trail records itself, and its own records survive the next one", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const cutoffTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;

    const { historyId, oldSummaryId, oldRecordId } = await t.run(async (ctx) => {
      const historyId = await ctx.db.insert("purgeHistory", {
        pipelineKey: "auditLogs",
        triggerType: "SCHEDULED",
        status: "RUNNING",
        recordsPurged: 0,
        startedAt: Date.now(),
      });
      // A summary from a previous clear-out, well past retention.
      const oldSummaryId = await ctx.db.insert("auditLogs", {
        actionType: AUDIT_PURGE_ACTION,
        entityType: "purgeHistory",
        timestamp: cutoffTimestamp - 1000,
      });
      const oldRecordId = await ctx.db.insert("auditLogs", {
        actionType: "OLD",
        entityType: "system",
        timestamp: cutoffTimestamp - 1,
      });
      return { historyId, oldSummaryId, oldRecordId };
    });

    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey: "auditLogs",
      cutoffTimestamp,
      historyId,
      deletedCount: 0,
    });

    const remaining = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());

    // The ordinary record went; the earlier summary did not. A trail that can
    // be quietly shortened, with the record of the shortening shortened away
    // one run later, fails a review on its own.
    expect(remaining.some((log) => log._id === oldRecordId)).toBe(false);
    expect(remaining.some((log) => log._id === oldSummaryId)).toBe(true);

    // And this run left its own record, saying how much went and from when.
    const summary = remaining.find((log) => log._id !== oldSummaryId);
    expect(summary?.actionType).toBe(AUDIT_PURGE_ACTION);
    expect(JSON.parse(summary?.metadata ?? "{}")).toMatchObject({
      pipelineKey: "auditLogs",
      recordsRemoved: 1,
      removedBeforeAt: cutoffTimestamp,
    });
    // Nobody did this. Naming whoever last edited the retention setting as the
    // person who deleted the records would be a fiction.
    expect(summary?.actorId).toBeUndefined();
  });

  test("a run that removed nothing writes nothing to the trail", async () => {
    // Otherwise a daily schedule buries the runs that did remove something.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const cutoffTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;

    const historyId = await t.run(async (ctx) => await ctx.db.insert("purgeHistory", {
      pipelineKey: "auditLogs",
      triggerType: "SCHEDULED",
      status: "RUNNING",
      recordsPurged: 0,
      startedAt: Date.now(),
    }));

    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey: "auditLogs",
      cutoffTimestamp,
      historyId,
      deletedCount: 0,
    });

    const remaining = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(remaining).toEqual([]);
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

  test.each([
    "publicApiRequests",
    "authEvents",
    "aiActionRequests",
    "analyticsSnapshots",
    "webhookDeliveries",
    "agentTransactions",
  ] as const)("new pipeline %s deletes past-retention rows and keeps recent ones", async (pipelineKey) => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const cutoffTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;

    const { historyId, oldId, retainedId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const agentId = await ctx.db.insert("agents", {
        name: "Purge Agent", modelId: "model-test", thinkingMode: false, isActive: true,
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      const historyId = await ctx.db.insert("purgeHistory", {
        pipelineKey, triggerType: "MANUAL", status: "RUNNING", recordsPurged: 0, startedAt: Date.now(),
      });

      const seed = async (at: number) => {
        if (pipelineKey === "publicApiRequests") {
          return await ctx.db.insert("publicApiRequests", {
            method: "POST", path: "/api/v1/run", status: "UNAUTHORIZED", statusCode: 401, requestedAt: at,
          });
        }
        if (pipelineKey === "authEvents") {
          return await ctx.db.insert("authEvents", {
            email: "person@test.com", eventType: "MAGIC_LINK_REQUESTED", timestamp: at,
          });
        }
        if (pipelineKey === "aiActionRequests") {
          return await ctx.db.insert("aiActionRequests", {
            actorId: userId, actionName: "transcribeAudio", requestedAt: at,
          });
        }
        if (pipelineKey === "analyticsSnapshots") {
          // Day-granular: nudge past the cutoff DATE, not just the instant.
          const dayOffset = at < cutoffTimestamp ? -2 : 2;
          return await ctx.db.insert("analyticsDailySnapshots", {
            date: new Date(at + dayOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            type: "global",
            metrics: { totalMessages: 1, totalInputTokens: 1, totalOutputTokens: 1, costGBP: 0 },
          });
        }
        if (pipelineKey === "webhookDeliveries") {
          return await ctx.db.insert("webhookDeliveries", {
            companyId, eventType: "run.finished", destinationUrl: "https://example.test/hook",
            status: "PENDING", attemptCount: 1, maxAttempts: 3, createdAt: at, updatedAt: at,
          });
        }
        return await ctx.db.insert("agentTransactions", {
          agentId, actionContext: "chat", inputTokens: 10, outputTokens: 5,
          modelUsed: "model-test", costGBP: 0.01, status: "SUCCESS", createdAt: at,
        });
      };

      const oldId = await seed(cutoffTimestamp - 1000);
      const retainedId = await seed(cutoffTimestamp + 1000);
      return { historyId, oldId, retainedId };
    });

    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey, cutoffTimestamp, historyId, deletedCount: 0,
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(oldId)).toBeNull();
      expect(await ctx.db.get(retainedId)).not.toBeNull();
      expect((await ctx.db.get(historyId))?.status).toBe("SUCCESS");
    });
  });

  test("agentRunHistory cascades a finished run and keeps what must survive", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const cutoffTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const oldAt = cutoffTimestamp - 1000;

    const seeded = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "admin@test.com", role: "SUPER_ADMIN" });
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const agentId = await ctx.db.insert("agents", {
        name: "Purge Agent", modelId: "model-test", thinkingMode: false, isActive: true,
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        agentId, companyId, triggerType: "CHAT", objective: "Old finished run",
        status: "SUCCESS", startedAt: oldAt - 100, completedAt: oldAt, updatedAt: oldAt,
      });
      const stepId = await ctx.db.insert("agentRunSteps", {
        runId, agentId, companyId, stepIndex: 1, kind: "MODEL", status: "SUCCESS",
        output: "big payload", startedAt: oldAt,
      });
      const toolCallId = await ctx.db.insert("agentToolCalls", {
        runId, agentId, companyId,
        normalizedToolName: "knowledge_search", handlerMapping: "knowledge.search",
        argumentsJson: "{}", status: "SUCCESS", requiredRole: "ADMIN",
        sideEffectLevel: "READ", confirmationRequired: false, startedAt: oldAt,
      });
      const memoryId = await ctx.db.insert("agentMemories", {
        agentId, kind: "FACT", applyMode: "WHEN_RELEVANT", content: "kept",
        normalizedContent: "kept", importance: 0.5, isActive: true,
        createdAt: oldAt, updatedAt: oldAt,
      });
      const usageId = await ctx.db.insert("agentMemoryUsage", {
        memoryId, agentId, runId, score: 1, queryText: "q", outcome: "SUCCESS",
        usedAt: oldAt, updatedAt: oldAt,
      });
      const feedbackId = await ctx.db.insert("agentRunFeedback", {
        runId, agentId, companyId, userId, rating: "POSITIVE", labels: [],
        createdAt: oldAt, updatedAt: oldAt,
      });
      const approvalId = await ctx.db.insert("agentRunApprovals", {
        runId, agentId, companyId, status: "APPROVED", requestedAt: oldAt,
      });
      const transactionId = await ctx.db.insert("agentTransactions", {
        agentId, actionContext: "run", inputTokens: 1, outputTokens: 1,
        modelUsed: "model-test", costGBP: 0.01, status: "SUCCESS", createdAt: oldAt,
      });
      // Old but still running: retention must never touch it.
      const liveRunId = await ctx.db.insert("agentRuns", {
        agentId, companyId, triggerType: "CHAT", objective: "Still running",
        status: "RUNNING", startedAt: oldAt, updatedAt: oldAt,
      });
      const historyId = await ctx.db.insert("purgeHistory", {
        pipelineKey: "agentRunHistory", triggerType: "MANUAL", status: "RUNNING",
        recordsPurged: 0, startedAt: Date.now(),
      });
      return { runId, stepId, toolCallId, memoryId, usageId, feedbackId, approvalId, transactionId, liveRunId, historyId };
    });

    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey: "agentRunHistory", cutoffTimestamp, historyId: seeded.historyId, deletedCount: 0,
    });

    await t.run(async (ctx) => {
      // The run and its payload children are gone…
      expect(await ctx.db.get(seeded.runId)).toBeNull();
      expect(await ctx.db.get(seeded.stepId)).toBeNull();
      expect(await ctx.db.get(seeded.toolCallId)).toBeNull();
      expect(await ctx.db.get(seeded.usageId)).toBeNull();
      expect(await ctx.db.get(seeded.feedbackId)).toBeNull();
      // …what must survive, survives: approvals are oversight evidence, cost
      // records are finance history, memories are what the AI learned, and a
      // run that has not finished is never retention's business.
      expect(await ctx.db.get(seeded.approvalId)).not.toBeNull();
      expect(await ctx.db.get(seeded.transactionId)).not.toBeNull();
      expect(await ctx.db.get(seeded.memoryId)).not.toBeNull();
      expect(await ctx.db.get(seeded.liveRunId)).not.toBeNull();
    });
  });

  test("chat purge takes the ratings with the conversation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const cutoffTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const oldAt = cutoffTimestamp - 1000;

    const { historyId, feedbackId, usageId, threadId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { email: "user@test.com", role: "USER", companyId });
      const threadId = await ctx.db.insert("threads", {
        userId, companyId, title: "Old chat", createdAt: oldAt, updatedAt: oldAt,
      });
      const messageId = await ctx.db.insert("messages", {
        threadId, role: "assistant", content: "old answer", createdAt: oldAt,
      });
      // The privacy hole this pins down: a rating with a written comment must
      // not outlive the conversation it rated.
      const feedbackId = await ctx.db.insert("messageFeedback", {
        messageId, threadId, companyId, userId, rating: "NEGATIVE",
        labels: ["INCORRECT"], comment: "personal text", countsTowardLearning: true,
        createdAt: oldAt, updatedAt: oldAt,
      });
      const memoryId = await ctx.db.insert("companyMemories", {
        companyId, title: "kept", content: "kept", normalizedContent: "kept",
        category: "OTHER", applyMode: "WHEN_RELEVANT", status: "APPROVED",
        confidence: 0.5, sourceType: "MANUAL", createdAt: oldAt, updatedAt: oldAt, usageCount: 1,
      });
      const usageId = await ctx.db.insert("companyMemoryUsage", {
        memoryId, companyId, threadId, messageId, score: 1, queryText: "q",
        usedAt: oldAt,
      });
      const historyId = await ctx.db.insert("purgeHistory", {
        pipelineKey: "chatHistory", triggerType: "MANUAL", status: "RUNNING",
        recordsPurged: 0, startedAt: Date.now(),
      });
      return { historyId, feedbackId, usageId, threadId };
    });

    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey: "chatHistory", cutoffTimestamp, historyId, deletedCount: 0,
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(threadId)).toBeNull();
      expect(await ctx.db.get(feedbackId)).toBeNull();
      expect(await ctx.db.get(usageId)).toBeNull();
      expect((await ctx.db.get(historyId))?.status).toBe("SUCCESS");
    });
  });

  test("a batch past the cap chains a follow-up and finishes the job", async () => {
    // Fake timers from the start: the follow-up batch is scheduled with
    // runAfter(1000) and only fires under the flushed fake clock.
    vi.useFakeTimers();
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const cutoffTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;

    const historyId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "bulk@test.com", role: "USER" });
      for (let index = 0; index < 620; index++) {
        await ctx.db.insert("logins", {
          userId, ip: "127.0.0.1", device: "d", location: "l",
          status: "SUCCESS", timestamp: cutoffTimestamp - 1000 - index,
        });
      }
      return await ctx.db.insert("purgeHistory", {
        pipelineKey: "userLogins", triggerType: "MANUAL", status: "RUNNING",
        recordsPurged: 0, startedAt: Date.now(),
      });
    });

    await t.mutation(internal.purges.executePurgeRecursive, {
      pipelineKey: "userLogins", cutoffTimestamp, historyId, deletedCount: 0,
    });
    // First batch stops at 500 and heartbeats; the chained batch finishes.
    await t.run(async (ctx) => {
      const history = await ctx.db.get(historyId);
      expect(history?.status).toBe("RUNNING");
      expect(history?.recordsPurged).toBe(500);
      expect(history?.lastProgressAt).toBeDefined();
    });

    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    await t.run(async (ctx) => {
      const history = await ctx.db.get(historyId);
      expect(history?.status).toBe("SUCCESS");
      expect(history?.recordsPurged).toBe(620);
      expect((await ctx.db.query("logins").collect()).length).toBe(0);
    });
  });

  test("the stall reaper fails a dead run and leaves live ones alone", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { deadId, liveId } = await t.run(async (ctx) => {
      const deadId = await ctx.db.insert("purgeHistory", {
        pipelineKey: "agentLogs", triggerType: "SCHEDULED", status: "RUNNING",
        recordsPurged: 40, startedAt: now - 2 * 60 * 60 * 1000,
        lastProgressAt: now - 45 * 60 * 1000,
      });
      const liveId = await ctx.db.insert("purgeHistory", {
        pipelineKey: "chatHistory", triggerType: "SCHEDULED", status: "RUNNING",
        recordsPurged: 10, startedAt: now - 60 * 60 * 1000,
        lastProgressAt: now - 60 * 1000,
      });
      return { deadId, liveId };
    });

    await t.mutation(internal.purges.reapStalePurges, {});

    await t.run(async (ctx) => {
      expect((await ctx.db.get(deadId))?.status).toBe("FAILED");
      expect((await ctx.db.get(deadId))?.error).toContain("stall reaper");
      expect((await ctx.db.get(liveId))?.status).toBe("RUNNING");
    });
  });

  test("the dispatcher never starts a second chain over a running pipeline", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        key: "PURGE_PIPELINES_CONFIG",
        value: JSON.stringify({
          agentLogs: {
            enabled: true, retentionDays: 90, interval: "Daily", hourUtc: 2,
            nextRunTimestamp: now - 1000,
          },
        }),
        updatedAt: now,
      });
      await ctx.db.insert("purgeHistory", {
        pipelineKey: "agentLogs", triggerType: "SCHEDULED", status: "RUNNING",
        recordsPurged: 0, startedAt: now - 60 * 1000, lastProgressAt: now - 1000,
      });
    });

    await t.mutation(internal.purges.dispatcher, {});

    await t.run(async (ctx) => {
      const rows = await ctx.db.query("purgeHistory").collect();
      // Still exactly one RUNNING row for the pipeline — no second chain.
      expect(rows.filter((row) => row.pipelineKey === "agentLogs").length).toBe(1);
    });
  });

});
