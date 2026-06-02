import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { requireCurrentUser, requireSuperAdmin } from "./authz";
import type { Doc } from "./_generated/dataModel";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { resolveExecutionModel } from "./aiModelService";

export const getModels = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentUser(ctx, "Unauthenticated request");
    return await ctx.db.query("aiModels").order("asc").take(10000);
  },
});

export const getOffsetPaginatedModels = query({
  args: {
    searchTerm: v.optional(v.string()),
    statusFilter: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const term = normalizeSearchTerm(args.searchTerm);
    const statusEnabled = args.statusFilter === undefined ? undefined : args.statusFilter === "active";
    let models: Doc<"aiModels">[] = [];

    if (term) {
      const [displayNameMatches, modelIdMatches] = await Promise.all([
        ctx.db
          .query("aiModels")
          .withSearchIndex("search_display_name", (q) => q.search("displayName", term))
          .take(500),
        ctx.db
          .query("aiModels")
          .withSearchIndex("search_model_id", (q) => q.search("modelId", term))
          .take(500),
      ]);
      models = Array.from(new Map([...displayNameMatches, ...modelIdMatches].map((model) => [model._id, model])).values());
    } else if (statusEnabled !== undefined) {
      models = await ctx.db
        .query("aiModels")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", statusEnabled))
        .take(1000);
    } else {
      models = await ctx.db.query("aiModels").order("asc").take(10000);
    }

    if (term) {
      models = models.filter((m) =>
        includesSearchTerm(m.displayName, term) ||
        includesSearchTerm(m.modelId, term)
      );
    }

    if (args.statusFilter) {
      models = models.filter((m) => m.isEnabled === (args.statusFilter === "active"));
    }

    models.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      if (a.isEnabled && !b.isEnabled) return -1;
      if (!a.isEnabled && b.isEnabled) return 1;
      return 0;
    });

    const page = paginateItems(models, args.page, args.pageSize);

    return {
      data: page.data,
      totalCount: page.totalCount,
      totalPages: page.totalPages,
      page: args.page,
    };
  },
});

export const resolveModelForExecution = internalQuery({
  args: { requestedModelId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let requestedModel = null;
    if (args.requestedModelId) {
       requestedModel = await ctx.db
         .query("aiModels")
         .withIndex("by_model_id", (q) => q.eq("modelId", args.requestedModelId as string))
         .first();
    }

    const defaultModels = await ctx.db
      .query("aiModels")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .take(10000);

    return resolveExecutionModel({
      requestedModelId: args.requestedModelId,
      requestedModel,
      defaultModels,
    }).modelId;
  },
});

export const toggleModelEnforcement = mutation({
  args: { modelId: v.id("aiModels"), isEnabled: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    if (!args.isEnabled) {
      const model = await ctx.db.get(args.modelId);
      if (model?.isDefault) {
        await ctx.db.patch(args.modelId, { isDefault: false });
      }
    }
    await ctx.db.patch(args.modelId, { isEnabled: args.isEnabled });

    const targetModel = await ctx.db.get(args.modelId);
    await ctx.db.insert("auditLogs", {
      actionType: "TOGGLE_AI_MODEL",
      actorId: userId,
      entityType: "systemConfig",
      entityId: "SYSTEM_MODELS",
      timestamp: Date.now(),
      metadata: JSON.stringify({ model: targetModel?.modelId, enabled: args.isEnabled })
    });
  },
});

export const setDefaultModel = mutation({
  args: { modelId: v.id("aiModels") },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const currentDefaults = await ctx.db
      .query("aiModels")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .take(10000);

    for (const model of currentDefaults) {
      if (model._id !== args.modelId) {
        await ctx.db.patch(model._id, { isDefault: false });
      }
    }

    await ctx.db.patch(args.modelId, { isDefault: true, isEnabled: true });

    const newDefault = await ctx.db.get(args.modelId);
    await ctx.db.insert("auditLogs", {
      actionType: "SET_DEFAULT_AI_MODEL",
      actorId: userId,
      entityType: "systemConfig",
      entityId: "SYSTEM_MODELS",
      timestamp: Date.now(),
      metadata: JSON.stringify({ model: newDefault?.modelId })
    });
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

export const getModel = query({
  args: { modelId: v.id("aiModels") },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx, "Unauthenticated request");
    return await ctx.db.get(args.modelId);
  },
});

export const updatePricingConfig = mutation({
  args: {
    modelId: v.id("aiModels"),
    friendlyName: v.optional(v.string()),
    standardInputCostBelow200k: v.optional(v.number()),
    standardInputCostAbove200k: v.optional(v.number()),
    cachedInputCostBelow200k: v.optional(v.number()),
    cachedInputCostAbove200k: v.optional(v.number()),
    outputResponseCost: v.optional(v.number()),
    outputReasoningCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const { modelId, ...fields } = args;
    await ctx.db.patch(modelId, fields);

    const targetModel = await ctx.db.get(modelId);
    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_MODEL_PRICING",
      actorId: userId,
      entityType: "systemConfig",
      entityId: "SYSTEM_MODELS",
      timestamp: Date.now(),
      metadata: JSON.stringify({ model: targetModel?.modelId, fields })
    });
  },
});

export const getAllModelsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("aiModels").take(10000);
  },
});
