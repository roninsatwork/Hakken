import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { adminQuery, publicQuery, superAdminMutation, superAdminQuery } from "./tenantFunctions";
import {
  buildAnalyticsIdAuditMetadata,
  buildSystemConfigPatch,
  buildSystemConfigWrite,
  buildSystemPromptAuditMetadata,
  GOOGLE_ANALYTICS_CONFIG_KEY,
  parseSystemPiiConfig,
  PII_REDACTION_CONFIG_KEY,
  SYSTEM_PROMPT_CONFIG_KEY,
  trimAnalyticsTrackingId,
} from "./systemService";

// Platform readers need the prompt for the Admin UI editor. The runtime uses
// getInternalSystemPrompt instead, so ordinary signed-in users never need it.
export const getSystemPrompt = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_PROMPT_CONFIG_KEY))
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
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_PROMPT_CONFIG_KEY))
      .first();

    return config?.value || null;
  },
});

export const updateSystemPrompt = superAdminMutation({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_PROMPT_CONFIG_KEY))
      .first();

    const now = Date.now();
    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, buildSystemConfigPatch({
        value: args.prompt,
        now,
        userId,
      }));
      
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_SYSTEM_PROMPT",
        actorId: userId,
        entityType: "systemConfig",
        entityId: SYSTEM_PROMPT_CONFIG_KEY,
        timestamp: now,
        metadata: buildSystemPromptAuditMetadata(args.prompt)
      });
      
      return existingConfig._id;
    } else {
      const id = await ctx.db.insert("systemConfig", buildSystemConfigWrite({
        key: SYSTEM_PROMPT_CONFIG_KEY,
        value: args.prompt,
        now,
        userId,
      }));
      
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_SYSTEM_PROMPT",
        actorId: userId,
        entityType: "systemConfig",
        entityId: SYSTEM_PROMPT_CONFIG_KEY,
        timestamp: now,
        metadata: buildSystemPromptAuditMetadata(args.prompt)
      });
      
      return id;
    }
  },
});

export const getAnalyticsId = publicQuery({
  reason: "Analytics id is read by the client on every page, including before sign-in.",
  args: {},
  handler: async (ctx) => {
    /* intentionally public: required for frontend analytics mounting */
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", GOOGLE_ANALYTICS_CONFIG_KEY))
      .first();

    return config?.value || null;
  },
});

export const updateAnalyticsId = superAdminMutation({
  args: {
    trackingId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", GOOGLE_ANALYTICS_CONFIG_KEY))
      .first();

    const now = Date.now();
    const trackingId = trimAnalyticsTrackingId(args.trackingId);
    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, buildSystemConfigPatch({
        value: trackingId,
        now,
        userId,
      }));
      
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_ANALYTICS_ID",
        actorId: userId,
        entityType: "systemConfig",
        entityId: GOOGLE_ANALYTICS_CONFIG_KEY,
        timestamp: now,
        metadata: buildAnalyticsIdAuditMetadata(args.trackingId)
      });
      
      return existingConfig._id;
    } else {
      const id = await ctx.db.insert("systemConfig", buildSystemConfigWrite({
        key: GOOGLE_ANALYTICS_CONFIG_KEY,
        value: trackingId,
        now,
        userId,
      }));
      
      await ctx.db.insert("auditLogs", {
        actionType: "UPDATE_ANALYTICS_ID",
        actorId: userId,
        entityType: "systemConfig",
        entityId: GOOGLE_ANALYTICS_CONFIG_KEY,
        timestamp: now,
        metadata: buildAnalyticsIdAuditMetadata(args.trackingId)
      });
      
      return id;
    }
  },
});

export const getPiiConfig = adminQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", PII_REDACTION_CONFIG_KEY))
      .first();

    return parseSystemPiiConfig(config?.value);
  },
});

export const updatePiiConfig = superAdminMutation({
  args: {
    configStr: v.string(), // JSON string
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const existingConfig = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", PII_REDACTION_CONFIG_KEY))
      .first();

    const now = Date.now();
    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, buildSystemConfigPatch({
        value: args.configStr,
        now,
        userId,
      }));
    } else {
      await ctx.db.insert("systemConfig", buildSystemConfigWrite({
        key: PII_REDACTION_CONFIG_KEY,
        value: args.configStr,
        now,
        userId,
      }));
    }

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_PII_FIREWALL",
      actorId: userId,
      entityType: "systemConfig",
      entityId: PII_REDACTION_CONFIG_KEY,
      timestamp: now,
      metadata: args.configStr
    });

    return true;
  },
});
