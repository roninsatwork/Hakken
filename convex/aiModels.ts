import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const getModels = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("aiModels").order("asc").collect();
  },
});

export const resolveModelForExecution = internalQuery({
  args: { requestedModelId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const FAILSAFE_MODEL = "gemini-3.1-pro-preview"; // Hardcoded network backup

    // Try finding the exact model requested
    if (args.requestedModelId) {
       const model = await ctx.db
         .query("aiModels")
         .withIndex("by_model_id", (q) => q.eq("modelId", args.requestedModelId as string))
         .first();

       if (model && model.isEnabled) {
           return model.modelId;
       }
    }

    // It doesn't exist or is disabled, fallback to Default
    const defaultModel = await ctx.db
      .query("aiModels")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();

    if (defaultModel && defaultModel.isEnabled) {
       return defaultModel.modelId;
    }

    // System failsafe if no active default is configured
    return FAILSAFE_MODEL;
  },
});

export const toggleModelEnforcement = mutation({
  args: { modelId: v.id("aiModels"), isEnabled: v.boolean() },
  handler: async (ctx, args) => {
    if (!args.isEnabled) {
      const model = await ctx.db.get(args.modelId);
      if (model?.isDefault) {
        await ctx.db.patch(args.modelId, { isDefault: false });
      }
    }
    await ctx.db.patch(args.modelId, { isEnabled: args.isEnabled });
  },
});

export const setDefaultModel = mutation({
  args: { modelId: v.id("aiModels") },
  handler: async (ctx, args) => {
    const currentDefaults = await ctx.db
      .query("aiModels")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .collect();

    for (const model of currentDefaults) {
      if (model._id !== args.modelId) {
        await ctx.db.patch(model._id, { isDefault: false });
      }
    }

    await ctx.db.patch(args.modelId, { isDefault: true, isEnabled: true });
  },
});

export const internalBatchUpsert = internalMutation({
  args: {
    models: v.array(
      v.object({
        modelId: v.string(),
        displayName: v.string(),
        description: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const incomingModel of args.models) {
      const existing = await ctx.db
        .query("aiModels")
        .withIndex("by_model_id", (q) => q.eq("modelId", incomingModel.modelId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          displayName: incomingModel.displayName,
          description: incomingModel.description,
          lastSyncedAt: now,
        });
      } else {
        await ctx.db.insert("aiModels", {
          modelId: incomingModel.modelId,
          displayName: incomingModel.displayName,
          description: incomingModel.description,
          isEnabled: false,
          isDefault: false,
          lastSyncedAt: now,
        });
      }
    }
    return true;
  },
});
