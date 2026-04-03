import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

// Public authenticated query for the Admin UI editor
export const getSystemPrompt = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "SYSTEM_PROMPT"))
      .first();

    return config?.value || "";
  },
});

// Internal unauthenticated query for the LLM Engine Action
export const getInternalSystemPrompt = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "SYSTEM_PROMPT"))
      .first();

    return config?.value || null;
  },
});

export const updateSystemPrompt = mutation({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Target identity unauthenticated or session expired");
    }

    // Role verification: Ensure only ADMIN can edit core system protocols
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized: System Protocol modifications require Super Administrator clearance.");
    }

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "SYSTEM_PROMPT"))
      .first();

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        value: args.prompt,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
      
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_SYSTEM_PROMPT",
        actorId: user._id,
        entityType: "systemConfig",
        entityId: "SYSTEM_PROMPT",
        timestamp: Date.now(),
        metadata: JSON.stringify({ promptLength: args.prompt.length })
      });
      
      return existingConfig._id;
    } else {
      const id = await ctx.db.insert("systemConfig", {
        key: "SYSTEM_PROMPT",
        value: args.prompt,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
      
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_SYSTEM_PROMPT",
        actorId: user._id,
        entityType: "systemConfig",
        entityId: "SYSTEM_PROMPT",
        timestamp: Date.now(),
        metadata: JSON.stringify({ promptLength: args.prompt.length })
      });
      
      return id;
    }
  },
});

export const getAnalyticsId = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "GOOGLE_ANALYTICS_ID"))
      .first();

    return config?.value || null;
  },
});

export const updateAnalyticsId = mutation({
  args: {
    trackingId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Target identity unauthenticated or session expired");
    }

    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") {
        throw new Error("Unauthorized: System Protocol modifications require Super Administrator clearance.");
    }

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "GOOGLE_ANALYTICS_ID"))
      .first();

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        value: args.trackingId.trim(),
        updatedAt: Date.now(),
        updatedBy: userId,
      });
      
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_ANALYTICS_ID",
        actorId: user._id,
        entityType: "systemConfig",
        entityId: "GOOGLE_ANALYTICS_ID",
        timestamp: Date.now(),
        metadata: JSON.stringify({ newTrackingId: args.trackingId.trim() })
      });
      
      return existingConfig._id;
    } else {
      const id = await ctx.db.insert("systemConfig", {
        key: "GOOGLE_ANALYTICS_ID",
        value: args.trackingId.trim(),
        updatedAt: Date.now(),
        updatedBy: userId,
      });
      
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_ANALYTICS_ID",
        actorId: user._id,
        entityType: "systemConfig",
        entityId: "GOOGLE_ANALYTICS_ID",
        timestamp: Date.now(),
        metadata: JSON.stringify({ newTrackingId: args.trackingId.trim() })
      });
      
      return id;
    }
  },
});

export const getPiiConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PII_REDACTION_CONFIG"))
      .first();

    if (!config || !config.value) {
      // Return sensible defaults if not set yet
      return {
        enabled: false,
        maskEmails: true,
        maskCreditCards: true,
        maskPhones: false,
        maskNinos: true
      };
    }

    return JSON.parse(config.value);
  },
});

export const updatePiiConfig = mutation({
  args: {
    configStr: v.string(), // JSON string
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "PII_REDACTION_CONFIG"))
      .first();

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        value: args.configStr,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("systemConfig", {
        key: "PII_REDACTION_CONFIG",
        value: args.configStr,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_PII_FIREWALL",
      actorId: user._id,
      entityType: "systemConfig",
      entityId: "PII_REDACTION_CONFIG",
      timestamp: Date.now(),
      metadata: args.configStr
    });

    return true;
  },
});
