import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { Id } from "./_generated/dataModel";

interface PipelineConfig {
  enabled: boolean;
  retentionDays: number;
  interval: "Hourly" | "Daily" | "Weekly" | "Monthly";
  hourUtc: number; // 0 to 23
  dayOfWeek?: number; // 0 (Sunday) to 6 (Saturday) - for Weekly
  dayOfMonth?: number; // 1 to 28 - for Monthly
  nextRunTimestamp: number;
}

const DEFAULT_CONFIGS: Record<string, PipelineConfig> = {
  agentLogs: {
    enabled: false,
    retentionDays: 90,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
  workflowLogs: {
    enabled: false,
    retentionDays: 90,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
  userLogins: {
    enabled: false,
    retentionDays: 180,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
  chatHistory: {
    enabled: false,
    retentionDays: 180,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
  auditLogs: {
    enabled: false,
    retentionDays: 90,
    interval: "Daily",
    hourUtc: 2,
    dayOfWeek: 0,
    dayOfMonth: 1,
    nextRunTimestamp: 0,
  },
};

function calculateNextRun(
  interval: "Hourly" | "Daily" | "Weekly" | "Monthly",
  hourUtc: number,
  dayOfWeek?: number,
  dayOfMonth?: number
): number {
  const now = new Date();
  // Clear milliseconds/seconds/minutes to make clean hour marks
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      0,
      0,
      0
    )
  );

  if (interval === "Hourly") {
    next.setUTCHours(next.getUTCHours() + 1);
  } else if (interval === "Daily") {
    next.setUTCHours(hourUtc);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  } else if (interval === "Weekly") {
    next.setUTCHours(hourUtc);
    const targetDay = dayOfWeek !== undefined ? dayOfWeek : 0; // 0 = Sunday
    const currentDay = next.getUTCDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) {
      daysToAdd += 7;
    } else if (daysToAdd === 0 && next.getTime() <= now.getTime()) {
      daysToAdd = 7;
    }
    next.setUTCDate(next.getUTCDate() + daysToAdd);
  } else if (interval === "Monthly") {
    next.setUTCHours(hourUtc);
    const targetDate = dayOfMonth !== undefined ? dayOfMonth : 1;
    next.setUTCDate(targetDate);
    if (next.getTime() <= now.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(targetDate);
    }
  }
  return next.getTime();
}

export const getPipelineConfig = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized: Super Administrator privileges required.");
    }

    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    if (!config || !config.value) {
      return DEFAULT_CONFIGS;
    }

    try {
      const parsed = JSON.parse(config.value);
      return { ...DEFAULT_CONFIGS, ...parsed };
    } catch {
      return DEFAULT_CONFIGS;
    }
  },
});

export const updatePipelineConfig = mutation({
  args: {
    configStr: v.string(), // JSON string representing the config
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized: Super Administrator privileges required.");
    }

    // Validate configStr to ensure it is valid JSON
    let parsed: Record<string, PipelineConfig>;
    try {
      parsed = JSON.parse(args.configStr);
    } catch {
      throw new Error("Invalid configuration JSON payload");
    }

    // Process and calculate nextRunTimestamp for enabled configs if necessary
    const now = Date.now();
    for (const key of Object.keys(DEFAULT_CONFIGS)) {
      if (parsed[key]) {
        const conf = parsed[key];
        if (typeof conf.retentionDays !== "number" || conf.retentionDays < 30) {
          throw new Error(`Retention policy for category '${key}' must be at least 30 days.`);
        }
        // If enabled and nextRunTimestamp is missing/zero or interval/hour changed, recalculate
        if (conf.enabled) {
          conf.nextRunTimestamp = calculateNextRun(conf.interval, conf.hourUtc, conf.dayOfWeek, conf.dayOfMonth);
        } else {
          conf.nextRunTimestamp = 0;
        }
      }
    }

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

export const getPurgeHistoryPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized: Super Administrator privileges required.");
    }

    return await ctx.db
      .query("purgeHistory")
      .withIndex("by_started")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getRecentPurges = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") return [];

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

export const runManualPurge = mutation({
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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized: Super Administrator privileges required.");
    }

    const configDoc = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PURGE_PIPELINES_CONFIG"))
      .first();

    let retentionDays = 90;
    if (configDoc && configDoc.value) {
      try {
        const configs = JSON.parse(configDoc.value);
        if (configs[args.pipelineKey]) {
          retentionDays = configs[args.pipelineKey].retentionDays || 90;
        }
      } catch {
        // Use default
      }
    }

    if (retentionDays < 30) {
      throw new Error(`Retention policy for manual purge must be at least 30 days.`);
    }

    const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

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
        const batch = await ctx.db
          .query("auditLogs")
          .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoffTimestamp))
          .take(500);

        for (const record of batch) {
          await ctx.db.delete(record._id);
        }
        currentDeleted = batch.length;
        hasMore = batch.length === 500;
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
        });
      } else {
        // Complete the run successfully
        await ctx.db.patch(historyId, {
          status: "SUCCESS",
          recordsPurged: newTotal,
          completedAt: Date.now(),
        });
      }
    } catch (err: any) {
      console.error(`Error in executePurgeRecursive for ${pipelineKey}:`, err);
      await ctx.db.patch(historyId, {
        status: "FAILED",
        error: err.message || String(err),
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

    let configs: Record<string, PipelineConfig>;
    try {
      configs = JSON.parse(configDoc.value);
    } catch {
      return;
    }

    const now = Date.now();
    let configChanged = false;

    for (const [pipelineKey, config] of Object.entries(configs)) {
      const typedKey = pipelineKey as "agentLogs" | "workflowLogs" | "userLogins" | "chatHistory" | "auditLogs";
      if (!["agentLogs", "workflowLogs", "userLogins", "chatHistory", "auditLogs"].includes(typedKey)) {
        continue;
      }

      if (!config.enabled) {
        continue;
      }

      // If nextRunTimestamp is not set, initialize it
      if (!config.nextRunTimestamp || config.nextRunTimestamp === 0) {
        config.nextRunTimestamp = calculateNextRun(
          config.interval,
          config.hourUtc,
          config.dayOfWeek,
          config.dayOfMonth
        );
        configChanged = true;
      }

      if (now >= config.nextRunTimestamp) {
        console.log(
          `Scheduler: triggering scheduled purge for pipeline: ${typedKey}`
        );

        const cutoffTimestamp =
          now - config.retentionDays * 24 * 60 * 60 * 1000;

        // Insert history record
        const historyId = await ctx.db.insert("purgeHistory", {
          pipelineKey: typedKey,
          triggerType: "SCHEDULED",
          status: "RUNNING",
          recordsPurged: 0,
          startedAt: now,
        });

        // Trigger execution asynchronously
        await ctx.scheduler.runAfter(0, internal.purges.executePurgeRecursive, {
          pipelineKey: typedKey,
          cutoffTimestamp,
          historyId,
          deletedCount: 0,
        });

        // Calculate next execution run
        config.nextRunTimestamp = calculateNextRun(
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

export const cancelPurge = mutation({
  args: {
    historyId: v.id("purgeHistory"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated request");
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "SUPER_ADMIN") {
      throw new Error("Unauthorized: Super Administrator privileges required.");
    }

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
