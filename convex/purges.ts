import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { getCurrentUser, requireSuperAdmin } from "./authz";
import { publicQuery, superAdminMutation, superAdminQuery } from "./tenantFunctions";
import {
  calculateNextPurgeRun,
  calculatePurgeCutoffTimestamp,
  assertMinimumPurgeRetentionDays,
  getPurgeRetentionDays,
  parsePurgePipelineConfig,
  normalizePurgePipelineConfigForUpdate,
  PURGE_PIPELINE_KEYS,
} from "./purgeScheduleService";
import { AUDIT_PURGE_ACTION, isAuditPurgeRecord } from "./auditLogService";

const superAdminPurgeMessage = "Unauthorized: Super Administrator privileges required.";

export const getPipelineConfig = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    return parsePurgePipelineConfig(config?.value);
  },
});

export const updatePipelineConfig = superAdminMutation({
  args: {
    configStr: v.string(), // JSON string representing the config
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    const now = Date.now();
    const parsed = normalizePurgePipelineConfigForUpdate(args.configStr);
    const finalConfigStr = JSON.stringify(parsed);

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        value: finalConfigStr,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("systemConfig", {
        key: "PURGE_PIPELINES_CONFIG",
        value: finalConfigStr,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_PURGE_PIPELINES",
      actorId: user._id,
      entityType: "systemConfig",
      entityId: "PURGE_PIPELINES_CONFIG",
      timestamp: now,
      metadata: finalConfigStr,
    });

    return true;
  },
});

export const getPurgeHistoryPaginated = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("purgeHistory")
      .withIndex("by_started")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getRecentPurges = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {},
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (current?.user.role !== "SUPER_ADMIN") return [];

    const logs = await ctx.db
      .query("purgeHistory")
      .withIndex("by_started")
      .order("desc")
      .take(500);

    return await Promise.all(
      logs.map(async (log) => {
        let actorName = "System Cron";
        if (log.actorId) {
          const actor = await ctx.db.get(log.actorId);
          actorName = actor?.name || actor?.email || "Unknown Admin";
        }
        return {
          ...log,
          actorName,
        };
      })
    );
  },
});

export const runManualPurge = superAdminMutation({
  args: {
    pipelineKey: v.union(
      v.literal("agentLogs"),
      v.literal("workflowLogs"),
      v.literal("userLogins"),
      v.literal("chatHistory"),
      v.literal("auditLogs")
    ),
  },
  handler: async (ctx, args) => {
    const { userId, user } = ctx;

    const configDoc = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    const retentionDays = getPurgeRetentionDays({
      configStr: configDoc?.value,
      pipelineKey: args.pipelineKey,
    });
    assertMinimumPurgeRetentionDays(retentionDays, "manual purge");

    const cutoffTimestamp = calculatePurgeCutoffTimestamp(retentionDays);

    // Create history record
    const historyId = await ctx.db.insert("purgeHistory", {
      pipelineKey: args.pipelineKey,
      triggerType: "MANUAL",
      status: "RUNNING",
      recordsPurged: 0,
      startedAt: Date.now(),
      actorId: userId,
    });

    // Audit log
    await ctx.db.insert("auditLogs", {
      actionType: "MANUAL_PURGE_TRIGGER",
      actorId: user._id,
      entityType: "purgeHistory",
      entityId: historyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        pipelineKey: args.pipelineKey,
        retentionDays,
        cutoffTimestamp,
      }),
    });

    // Schedule background recursive deletion immediately (0ms delay)
    await ctx.scheduler.runAfter(0, internal.purges.executePurgeRecursive, {
      pipelineKey: args.pipelineKey,
      cutoffTimestamp,
      historyId,
      deletedCount: 0,
    });

    return historyId;
  },
});

export const executePurgeRecursive = internalMutation({
  args: {
    pipelineKey: v.union(
      v.literal("agentLogs"),
      v.literal("workflowLogs"),
      v.literal("userLogins"),
      v.literal("chatHistory"),
      v.literal("auditLogs")
    ),
    cutoffTimestamp: v.number(),
    historyId: v.id("purgeHistory"),
    deletedCount: v.number(),
    // Used by the audit trail pipeline alone, which pages by cursor because
    // some of its rows are never deletable.
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { pipelineKey, cutoffTimestamp, historyId, deletedCount } = args;

    // Check if the history record exists and is still in RUNNING state
    const history = await ctx.db.get(historyId);
    if (!history || history.status !== "RUNNING") {
      console.log(
        `Purge run ${historyId} is not in RUNNING state (status: ${history?.status}). Aborting recursion.`
      );
      return;
    }

    try {
      let currentDeleted = 0;
      let hasMore = false;
      let nextCursor: string | undefined;

      if (pipelineKey === "agentLogs") {
        const batch = await ctx.db
          .query("agentLogs")
          .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoffTimestamp))
          .take(500);

        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "userLogins") {
        const batch = await ctx.db
          .query("logins")
          .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffTimestamp))
          .take(500);

        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
      } else if (pipelineKey === "auditLogs") {
        /*
         * Paged by cursor, unlike its neighbours, because this is the one
         * pipeline whose rows are not all deletable. Repeatedly taking the
         * oldest rows works only while everything found can go; the moment some
         * are exempt, the same exempt rows come back every batch and the run
         * never ends.
         */
        const batch = await ctx.db
          .query("auditLogs")
          .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffTimestamp))
          .paginate({ numItems: 500, cursor: args.cursor ?? null });

        for (const record of batch.page) {
          // The records of previous clear-outs outlive every clear-out. A
          // summary a later run could remove would leave the same hole one run
          // further on, which is the hole this record exists to close.
          if (isAuditPurgeRecord(record.actionType)) continue;
          await ctx.db.delete(record._id);
          currentDeleted++;
        }

        nextCursor = batch.continueCursor;
        hasMore = !batch.isDone;
      } else if (pipelineKey === "workflowLogs") {
        // Deleting executions and cascaded steps, cap at 200 executions
        const batch = await ctx.db
          .query("workflowExecutions")
          .withIndex("by_startedAt", (q) => q.lt("startedAt", cutoffTimestamp))
          .take(200);

        for (const execution of batch) {
          const steps = await ctx.db
            .query("workflowExecutionSteps")
            .withIndex("by_execution", (q) =>
              q.eq("executionId", execution._id)
            )
            .collect();

          for (const step of steps) {
            await ctx.db.delete(step._id);
          }
          await ctx.db.delete(execution._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 200;
      } else if (pipelineKey === "chatHistory") {
        // Deleting threads, cascaded messages, storage files, and swarms, cap at 100 threads
        const batch = await ctx.db
          .query("threads")
          .withIndex("by_updatedAt", (q) => q.lt("updatedAt", cutoffTimestamp))
          .take(100);

        let filesDeletedCount = 0;
        let threadsFullyDeleted = 0;
        let reachedCap = false;

        for (const thread of batch) {
          if (reachedCap) {
            hasMore = true;
            break;
          }

          // 1. Messages and attachments
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
            .collect();

          let messageIndex = 0;
          for (; messageIndex < messages.length; messageIndex++) {
            const message = messages[messageIndex];
            if (message.attachments) {
              for (const storageId of message.attachments) {
                try {
                  await ctx.storage.delete(storageId);
                  filesDeletedCount++;
                } catch (err) {
                  console.error(
                    `Failed to delete storage file ${storageId} in chat purge:`,
                    err
                  );
                }

                if (filesDeletedCount >= 200) {
                  reachedCap = true;
                }
              }
            }
            await ctx.db.delete(message._id);
            if (reachedCap) {
              break;
            }
          }

          // If we reached the cap, we broke out of the message loop early.
          // In that case, we MUST NOT delete swarm logs or the thread itself yet.
          if (reachedCap) {
            hasMore = true;
            continue;
          }

          // 2. Swarm logs
          const swarms = await ctx.db
            .query("swarmLogs")
            .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
            .collect();

          for (const swarm of swarms) {
            await ctx.db.delete(swarm._id);
          }

          // 3. The thread itself
          await ctx.db.delete(thread._id);
          threadsFullyDeleted++;
        }
        currentDeleted = threadsFullyDeleted;
        hasMore = hasMore || batch.length === 100;
      }

      const newTotal = deletedCount + currentDeleted;

      if (hasMore) {
        // Update recordsPurged dynamically and schedule next batch in 1000ms
        await ctx.db.patch(historyId, {
          recordsPurged: newTotal,
        });

        await ctx.scheduler.runAfter(1000, internal.purges.executePurgeRecursive, {
          pipelineKey,
          cutoffTimestamp,
          historyId,
          deletedCount: newTotal,
          ...(nextCursor !== undefined ? { cursor: nextCursor } : {}),
        });
      } else {
        // Complete the run successfully
        await ctx.db.patch(historyId, {
          status: "SUCCESS",
          recordsPurged: newTotal,
          completedAt: Date.now(),
        });

        /*
         * The clear-out lands on the trail as well as in its own history.
         *
         * `purgeHistory` records that a pipeline ran; it is a separate screen
         * with its own retention, and somebody reading the audit trail to find
         * out why a month of records is missing would never reach it. That is
         * particularly true of this pipeline, which deletes the trail itself.
         */
        if (newTotal > 0) {
          await ctx.db.insert("auditLogs", {
            ...(history.actorId ? { actorId: history.actorId } : {}),
            actionType: pipelineKey === "auditLogs" ? AUDIT_PURGE_ACTION : "RECORDS_PURGED",
            entityType: "purgeHistory",
            entityId: historyId,
            timestamp: Date.now(),
            metadata: JSON.stringify({
              pipelineKey,
              recordsRemoved: newTotal,
              startedBy: history.triggerType === "MANUAL" ? "a person" : "the schedule",
              removedBeforeAt: cutoffTimestamp,
            }),
          });
        }
      }
    } catch (err) {
      console.error(`Error in executePurgeRecursive for ${pipelineKey}:`, err);
      await ctx.db.patch(historyId, {
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
        completedAt: Date.now(),
      });
    }
  },
});

export const dispatcher = internalMutation({
  args: {},
  handler: async (ctx) => {
    const configDoc = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    if (!configDoc || !configDoc.value) {
      return;
    }

    const configs = parsePurgePipelineConfig(configDoc.value);

    const now = Date.now();
    let configChanged = false;

    for (const pipelineKey of PURGE_PIPELINE_KEYS) {
      const config = configs[pipelineKey];

      if (!config.enabled) {
        continue;
      }

      // If nextRunTimestamp is not set, initialize it
      if (!config.nextRunTimestamp || config.nextRunTimestamp === 0) {
        config.nextRunTimestamp = calculateNextPurgeRun(
          config.interval,
          config.hourUtc,
          config.dayOfWeek,
          config.dayOfMonth
        );
        configChanged = true;
      }

      if (now >= config.nextRunTimestamp) {
        console.log(
          `Scheduler: triggering scheduled purge for pipeline: ${pipelineKey}`
        );

        const cutoffTimestamp = calculatePurgeCutoffTimestamp(config.retentionDays, now);

        // Insert history record
        const historyId = await ctx.db.insert("purgeHistory", {
          pipelineKey,
          triggerType: "SCHEDULED",
          status: "RUNNING",
          recordsPurged: 0,
          startedAt: now,
        });

        // Trigger execution asynchronously
        await ctx.scheduler.runAfter(0, internal.purges.executePurgeRecursive, {
          pipelineKey,
          cutoffTimestamp,
          historyId,
          deletedCount: 0,
        });

        // Calculate next execution run
        config.nextRunTimestamp = calculateNextPurgeRun(
          config.interval,
          config.hourUtc,
          config.dayOfWeek,
          config.dayOfMonth
        );
        configChanged = true;
      }
    }

    if (configChanged) {
      await ctx.db.patch(configDoc._id, {
        value: JSON.stringify(configs),
        updatedAt: now,
      });
    }
  },
});

export const cancelPurge = superAdminMutation({
  args: {
    historyId: v.id("purgeHistory"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const history = await ctx.db.get(args.historyId);
    if (!history) {
      throw new Error("Purge execution history record not found.");
    }

    if (history.status !== "RUNNING") {
      throw new Error(`Purge run ${args.historyId} is not actively running (status: ${history.status}).`);
    }

    const now = Date.now();
    await ctx.db.patch(args.historyId, {
      status: "CANCELLED",
      completedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: user._id,
      actionType: "MANUAL_PURGE_CANCEL",
      entityType: "purgeHistory",
      entityId: args.historyId,
      timestamp: now,
      metadata: JSON.stringify({
        pipelineKey: history.pipelineKey,
        recordsPurgedSoFar: history.recordsPurged,
      }),
    });

    return true;
  },
});
