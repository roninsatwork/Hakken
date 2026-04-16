import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";

// 1. Log an action
export const logAction = internalMutation({
  args: {
    actorId: v.id("users"),
    actionType: v.string(),
    entityId: v.optional(v.string()),
    entityType: v.string(),
    metadata: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("auditLogs", {
      ...args,
      timestamp: Date.now()
    });
  }
});

// 2. Fetch Config for UI
export const getConfig = query({
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") return null;

    const configRow = await ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", "AUDIT_PURGE_CONFIG")).first();
    if (!configRow) {
      return {
        enabled: false,
        retentionDays: 30,
        dayOfMonth: 1,
        hourOfDay: 2,
        nextRunTimestamp: 0,
      };
    }
    return JSON.parse(configRow.value);
  }
});

// 3. Update Audit Log Config
export const updateConfig = mutation({
  args: {
    enabled: v.boolean(),
    retentionDays: v.number(),
    dayOfMonth: v.number(),
    hourOfDay: v.number(),
    nextRunTimestamp: v.optional(v.number()), // Let the UI blindly pass the existing payload
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    // Calculate next run timestamp securely handling UTC bounds
    const now = new Date();
    const nextRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), args.dayOfMonth, args.hourOfDay, 0, 0, 0));
    
    // If the planned time has already passed this month, bump to next month
    if (nextRun.getTime() <= now.getTime()) {
      nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
    }

    const payload = {
      ...args,
      nextRunTimestamp: nextRun.getTime()
    };

    const configRow = await ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", "AUDIT_PURGE_CONFIG")).first();
    if (configRow) {
      await ctx.db.patch(configRow._id, { value: JSON.stringify(payload), updatedAt: Date.now(), updatedBy: userId });
    } else {
      await ctx.db.insert("systemConfig", {
        key: "AUDIT_PURGE_CONFIG",
        value: JSON.stringify(payload),
        updatedAt: Date.now(),
        updatedBy: userId
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_AUDIT_PURGE_CONFIG",
      actorId: user._id,
      entityType: "systemConfig",
      entityId: "AUDIT_PURGE_CONFIG",
      timestamp: Date.now(),
      metadata: JSON.stringify(payload)
    });
  }
});

// 4. The Purge Dispatcher (Hourly Cron Target)
export const dispatcher = internalMutation({
  args: {},
  handler: async (ctx) => {
    const configRow = await ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", "AUDIT_PURGE_CONFIG")).first();
    if (!configRow) return;
    const config = JSON.parse(configRow.value);

    // Stop if globally disabled
    if (!config.enabled) return;

    if (Date.now() >= config.nextRunTimestamp) {
        // Schedule execution independently
        await ctx.scheduler.runAfter(0, internal.auditLogs.executePurge, { retentionDays: config.retentionDays });
        
        // Advance schedule clock to next month exactly maintaining execution parameters
        const now = new Date();
        const nextRun = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, config.dayOfMonth, config.hourOfDay, 0, 0, 0));
        
        config.nextRunTimestamp = nextRun.getTime();
        await ctx.db.patch(configRow._id, { value: JSON.stringify(config) });
    }
  }
});

// 5. Recursive Deep Purge Engine Limit Protection
export const executePurge = internalMutation({
  args: { retentionDays: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.retentionDays * 24 * 60 * 60 * 1000);
    
    // Max 500 rows per transaction constraint natively respected
    const oldLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_timestamp", q => q.lt("timestamp", cutoff))
      .take(500);

    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }

    // Cascade scheduler trigger if queue buffer hit maximum
    if (oldLogs.length === 500) {
      await ctx.scheduler.runAfter(1000, internal.auditLogs.executePurge, { retentionDays: args.retentionDays });
    }
  }
});

// 6. View Recent Logs (UI Feed)
export const getRecentLogs = query({
  handler: async (ctx) => {
    const adminId = await auth.getUserId(ctx);
    if (!adminId) return [];
    
    const user = await ctx.db.get(adminId);
    if (!user || user.role !== "SUPER_ADMIN") return [];

    const logs = await ctx.db.query("auditLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(500);
      
    return await Promise.all(logs.map(async (log) => {
      const actor = await ctx.db.get(log.actorId);
      return {
        ...log,
        actorName: actor?.name || actor?.email || "Unknown Admin",
      }
    }));
  }
});
