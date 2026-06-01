import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getCurrentUser, requireSuperAdmin } from "./authz";
import {
  buildAuditPurgeConfigPayload,
  calculateAuditPurgeCutoff,
  calculateFollowingMonthlyAuditPurgeRun,
  parseAuditPurgeConfig,
  serializeAuditPurgeConfig,
  withAuditLogActorName,
} from "./auditLogService";

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
    const current = await getCurrentUser(ctx);
    if (current?.user.role !== "SUPER_ADMIN") return null;

    const configRow = await ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", "AUDIT_PURGE_CONFIG")).first();
    return parseAuditPurgeConfig(configRow?.value);
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
    const { userId, user } = await requireSuperAdmin(ctx);

    const now = Date.now();
    const payload = buildAuditPurgeConfigPayload(args);
    const serializedPayload = serializeAuditPurgeConfig(payload);

    const configRow = await ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", "AUDIT_PURGE_CONFIG")).first();
    if (configRow) {
      await ctx.db.patch(configRow._id, { value: serializedPayload, updatedAt: now, updatedBy: userId });
    } else {
      await ctx.db.insert("systemConfig", {
        key: "AUDIT_PURGE_CONFIG",
        value: serializedPayload,
        updatedAt: now,
        updatedBy: userId
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_AUDIT_PURGE_CONFIG",
      actorId: user._id,
      entityType: "systemConfig",
      entityId: "AUDIT_PURGE_CONFIG",
      timestamp: now,
      metadata: serializedPayload
    });
  }
});

// 4. The Purge Dispatcher (Hourly Cron Target)
export const dispatcher = internalMutation({
  args: {},
  handler: async (ctx) => {
    const configRow = await ctx.db.query("systemConfig").withIndex("by_key", q => q.eq("key", "AUDIT_PURGE_CONFIG")).first();
    if (!configRow) return;
    const config = parseAuditPurgeConfig(configRow.value);

    // Stop if globally disabled
    if (!config.enabled) return;

    const now = Date.now();
    if (now >= config.nextRunTimestamp) {
        // Schedule execution independently
        await ctx.scheduler.runAfter(0, internal.auditLogs.executePurge, { retentionDays: config.retentionDays });
        
        // Advance schedule clock to next month exactly maintaining execution parameters
        config.nextRunTimestamp = calculateFollowingMonthlyAuditPurgeRun(config.dayOfMonth, config.hourOfDay, new Date(now));
        await ctx.db.patch(configRow._id, { value: serializeAuditPurgeConfig(config) });
    }
  }
});

// 5. Recursive Deep Purge Engine Limit Protection
export const executePurge = internalMutation({
  args: { retentionDays: v.number() },
  handler: async (ctx, args) => {
    const cutoff = calculateAuditPurgeCutoff(args.retentionDays);
    
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
    const current = await getCurrentUser(ctx);
    if (current?.user.role !== "SUPER_ADMIN") return [];

    const logs = await ctx.db.query("auditLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(500);
      
    return await Promise.all(logs.map(async (log) => {
      const actor = await ctx.db.get(log.actorId);
      return withAuditLogActorName(log, actor);
    }));
  }
});
