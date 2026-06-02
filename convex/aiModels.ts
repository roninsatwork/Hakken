import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { requireCurrentUser, requireSuperAdmin } from "./authz";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import {
  ANTHROPIC_PROVIDER_KEY,
  DEFAULT_MODEL_USE_CASES,
  EMBEDDING_MODEL_USE_CASE,
  GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
  GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
  GOOGLE_VERTEX_PROVIDER_KEY,
  OPENAI_PROVIDER_KEY,
  getProviderQualifiedModelId,
  isGoogleVertexModelId,
  resolveExecutionModel,
} from "./aiModelService";

const MODEL_CATALOG_LIMIT = 500;
const MODEL_SEARCH_LIMIT = 250;
const DEFAULT_MODEL_LIMIT = 10;
const GOOGLE_VERTEX_DISPLAY_NAME = "Google Vertex AI";
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  [GOOGLE_VERTEX_PROVIDER_KEY]: GOOGLE_VERTEX_DISPLAY_NAME,
  [OPENAI_PROVIDER_KEY]: "OpenAI",
  [ANTHROPIC_PROVIDER_KEY]: "Anthropic",
};
const PLATFORM_PROVIDER_KEYS = [GOOGLE_VERTEX_PROVIDER_KEY, OPENAI_PROVIDER_KEY, ANTHROPIC_PROVIDER_KEY];

type AiModelDefaultUseCase = (typeof DEFAULT_MODEL_USE_CASES)[number];

function withInferredProvider(model: Doc<"aiModels">): Doc<"aiModels"> {
  if (model.providerKey || !isGoogleVertexModelId(model.modelId)) {
    return model;
  }

  return {
    ...model,
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerModelId: model.providerModelId ?? model.modelId,
  };
}

function withInferredProviders(models: Doc<"aiModels">[]) {
  return models.map(withInferredProvider);
}

export const getModels = query({
  args: {},
  handler: async (ctx) => {
    await requireCurrentUser(ctx, "Unauthenticated request");
    return withInferredProviders(await ctx.db.query("aiModels").order("asc").take(MODEL_CATALOG_LIMIT));
  },
});

export const getActiveModels = query({
  args: {
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx, "Unauthenticated request");

    const [rawModels, disabledProviders] = await Promise.all([
      ctx.db
        .query("aiModels")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
        .take(MODEL_CATALOG_LIMIT),
      ctx.db
        .query("aiProviders")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", false))
        .take(50),
    ]);
    const disabledProviderKeys = new Set(disabledProviders.map((provider) => provider.providerKey));
    let models = withInferredProviders(rawModels)
      .filter((model) => !model.providerKey || !disabledProviderKeys.has(model.providerKey));

    if (args.useCase) {
      models = models.filter((model) => {
        if (!model.supportedUseCases || model.supportedUseCases.length === 0) return true;
        return model.supportedUseCases.includes(args.useCase as string);
      });
    }

    models.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (a.friendlyName || a.displayName || a.modelId).localeCompare(b.friendlyName || b.displayName || b.modelId);
    });

    return models;
  },
});

export const getOffsetPaginatedModels = query({
  args: {
    searchTerm: v.optional(v.string()),
    statusFilter: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    providerFilter: v.optional(v.string()),
    capabilityFilter: v.optional(v.string()),
    useCaseFilter: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const term = normalizeSearchTerm(args.searchTerm);
    const statusEnabled = args.statusFilter === undefined ? undefined : args.statusFilter === "active";
    const providerFilter = args.providerFilter && args.providerFilter !== "all" ? args.providerFilter : undefined;
    const capabilityFilter = args.capabilityFilter && args.capabilityFilter !== "all" ? args.capabilityFilter : undefined;
    const useCaseFilter = args.useCaseFilter && args.useCaseFilter !== "all" ? args.useCaseFilter : undefined;
    let models: Doc<"aiModels">[] = [];

    if (term) {
      const [displayNameMatches, modelIdMatches] = await Promise.all([
        ctx.db
          .query("aiModels")
          .withSearchIndex("search_display_name", (q) => q.search("displayName", term))
          .take(MODEL_SEARCH_LIMIT),
        ctx.db
          .query("aiModels")
          .withSearchIndex("search_model_id", (q) => q.search("modelId", term))
          .take(MODEL_SEARCH_LIMIT),
      ]);
      models = Array.from(new Map([...displayNameMatches, ...modelIdMatches].map((model) => [model._id, model])).values());
    } else if (providerFilter === GOOGLE_VERTEX_PROVIDER_KEY && statusEnabled !== undefined) {
      models = await ctx.db
        .query("aiModels")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", statusEnabled))
        .take(MODEL_CATALOG_LIMIT);
    } else if (providerFilter === GOOGLE_VERTEX_PROVIDER_KEY) {
      models = await ctx.db.query("aiModels").order("asc").take(MODEL_CATALOG_LIMIT);
    } else if (providerFilter && statusEnabled !== undefined) {
      models = await ctx.db
        .query("aiModels")
        .withIndex("by_provider_enabled", (q) => q.eq("providerKey", providerFilter).eq("isEnabled", statusEnabled))
        .take(MODEL_CATALOG_LIMIT);
    } else if (providerFilter) {
      models = await ctx.db
        .query("aiModels")
        .withIndex("by_provider", (q) => q.eq("providerKey", providerFilter))
        .take(MODEL_CATALOG_LIMIT);
    } else if (statusEnabled !== undefined) {
      models = await ctx.db
        .query("aiModels")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", statusEnabled))
        .take(MODEL_CATALOG_LIMIT);
    } else {
      models = await ctx.db.query("aiModels").order("asc").take(MODEL_CATALOG_LIMIT);
    }

    models = withInferredProviders(models);

    if (term) {
      models = models.filter((m) =>
        includesSearchTerm(m.displayName, term) ||
        includesSearchTerm(m.modelId, term) ||
        includesSearchTerm(m.providerModelId, term)
      );
    }

    if (args.statusFilter) {
      models = models.filter((m) => m.isEnabled === (args.statusFilter === "active"));
    }

    if (providerFilter) {
      models = models.filter((m) => m.providerKey === providerFilter);
    }

    if (capabilityFilter) {
      models = models.filter((m) => m.capabilities?.includes(capabilityFilter));
    }

    if (useCaseFilter) {
      models = models.filter((m) => modelSupportsUseCase(m, useCaseFilter));
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

export const getProviders = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const providers = await ctx.db.query("aiProviders").withIndex("by_provider_key").take(50);
    const providersByKey = new Map(providers.map((provider) => [provider.providerKey, provider]));
    const mergedProviders = PLATFORM_PROVIDER_KEYS.map((providerKey) => {
      const existingProvider = providersByKey.get(providerKey);
      if (existingProvider) return existingProvider;

      return {
        _id: `inferred_${providerKey}_provider`,
        _creationTime: 0,
        providerKey,
        displayName: PROVIDER_DISPLAY_NAMES[providerKey] ?? providerKey,
        isEnabled: false,
        authMode: "environment",
        status: "unknown" as const,
        lastHealthCheckAt: undefined,
        lastSyncedAt: undefined,
        syncStatus: undefined,
        settings: undefined,
        createdAt: 0,
        updatedAt: 0,
      };
    });

    const otherProviders = providers.filter((provider) => !PLATFORM_PROVIDER_KEYS.includes(provider.providerKey));
    return [...mergedProviders, ...otherProviders];
  },
});

async function getModelByStableId(ctx: QueryCtx, modelId: string) {
  return await ctx.db
    .query("aiModels")
    .withIndex("by_model_id", (q) => q.eq("modelId", modelId))
    .first();
}

async function getModelByStableIdForMutation(ctx: MutationCtx, modelId: string) {
  return await ctx.db
    .query("aiModels")
    .withIndex("by_model_id", (q) => q.eq("modelId", modelId))
    .first();
}

function isSupportedDefaultUseCase(useCase: string): useCase is AiModelDefaultUseCase {
  return DEFAULT_MODEL_USE_CASES.includes(useCase as AiModelDefaultUseCase);
}

function modelSupportsUseCase(model: Pick<Doc<"aiModels">, "supportedUseCases">, useCase: string) {
  return !model.supportedUseCases || model.supportedUseCases.length === 0 || model.supportedUseCases.includes(useCase);
}

function getProviderDisplayName(providerKey: string) {
  return PROVIDER_DISPLAY_NAMES[providerKey] ?? providerKey;
}

async function upsertProviderStatus(ctx: MutationCtx, args: {
  providerKey: string;
  displayName?: string;
  isEnabled?: boolean;
  status?: "unknown" | "healthy" | "degraded" | "disabled" | "error";
  syncStatus?: string;
  settings?: string;
  lastHealthCheckAt?: number;
  lastSyncedAt?: number;
}) {
  const now = Date.now();
  const existingProvider = await ctx.db
    .query("aiProviders")
    .withIndex("by_provider_key", (q) => q.eq("providerKey", args.providerKey))
    .first();

  const patch = {
    displayName: args.displayName ?? getProviderDisplayName(args.providerKey),
    ...(args.isEnabled === undefined ? {} : { isEnabled: args.isEnabled }),
    ...(args.status === undefined ? {} : { status: args.status }),
    ...(args.syncStatus === undefined ? {} : { syncStatus: args.syncStatus }),
    ...(args.settings === undefined ? {} : { settings: args.settings }),
    ...(args.lastHealthCheckAt === undefined ? {} : { lastHealthCheckAt: args.lastHealthCheckAt }),
    ...(args.lastSyncedAt === undefined ? {} : { lastSyncedAt: args.lastSyncedAt }),
    updatedAt: now,
  };

  if (existingProvider) {
    await ctx.db.patch(existingProvider._id, patch);
    return existingProvider._id;
  }

  return await ctx.db.insert("aiProviders", {
    providerKey: args.providerKey,
    displayName: args.displayName ?? getProviderDisplayName(args.providerKey),
    isEnabled: args.isEnabled ?? false,
    authMode: "environment",
    status: args.status ?? "unknown",
    syncStatus: args.syncStatus,
    settings: args.settings,
    lastHealthCheckAt: args.lastHealthCheckAt,
    lastSyncedAt: args.lastSyncedAt,
    createdAt: now,
    updatedAt: now,
  });
}

async function assertModelCanBeDefaultForUseCase(ctx: MutationCtx, args: { modelId: string; useCase: string }) {
  if (!isSupportedDefaultUseCase(args.useCase)) {
    throw new Error("Unsupported AI model default use case.");
  }

  const model = await getModelByStableIdForMutation(ctx, args.modelId);
  if (!model?.isEnabled) {
    throw new Error("Selected AI model is not enabled.");
  }

  if (!modelSupportsUseCase(model, args.useCase)) {
    throw new Error(`Selected AI model does not support the ${args.useCase} use case.`);
  }

  if (model.providerKey) {
    const provider = await ctx.db
      .query("aiProviders")
      .withIndex("by_provider_key", (q) => q.eq("providerKey", model.providerKey as string))
      .first();

    if (provider && !provider.isEnabled) {
      throw new Error("Selected AI model provider is disabled.");
    }
  }

  return withInferredProvider(model);
}

function summarizeDefaultModel(model: Doc<"aiModels"> | null) {
  if (!model) return null;
  const resolved = withInferredProvider(model);
  return {
    modelId: resolved.modelId,
    providerKey: resolved.providerKey ?? GOOGLE_VERTEX_PROVIDER_KEY,
    providerModelId: resolved.providerModelId ?? resolved.modelId,
    displayName: resolved.friendlyName || resolved.displayName || resolved.modelId,
    isEnabled: resolved.isEnabled,
  };
}

export const setProviderEnabled = mutation({
  args: {
    providerKey: v.string(),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const now = Date.now();
    await upsertProviderStatus(ctx, {
      providerKey: args.providerKey,
      isEnabled: args.isEnabled,
      status: args.isEnabled ? "unknown" : "disabled",
      syncStatus: args.isEnabled ? "enabled" : "disabled",
    });

    await ctx.db.insert("auditLogs", {
      actionType: "SET_AI_PROVIDER_ENABLED",
      actorId: userId,
      entityType: "systemConfig",
      entityId: "SYSTEM_AI_PROVIDERS",
      timestamp: now,
      metadata: JSON.stringify({ providerKey: args.providerKey, enabled: args.isEnabled }),
    });

    return true;
  },
});

export const getGlobalModelDefaults = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const defaults = await Promise.all(DEFAULT_MODEL_USE_CASES.map(async (useCase) => {
      const defaultRow = await ctx.db
        .query("aiModelDefaults")
        .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", useCase))
        .first();
      const model = defaultRow ? await getModelByStableId(ctx, defaultRow.modelId) : null;

      return {
        useCase,
        default: defaultRow ? {
          _id: defaultRow._id,
          modelId: defaultRow.modelId,
          providerKey: defaultRow.providerKey,
          fallbackModelId: defaultRow.fallbackModelId,
          updatedAt: defaultRow.updatedAt,
          model: summarizeDefaultModel(model),
        } : null,
      };
    }));

    return {
      useCases: DEFAULT_MODEL_USE_CASES,
      defaults,
    };
  },
});

export const setGlobalModelDefault = mutation({
  args: {
    useCase: v.string(),
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const model = await assertModelCanBeDefaultForUseCase(ctx, args);
    const now = Date.now();
    const existingDefault = await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", args.useCase))
      .first();

    const defaultPatch = {
      providerKey: model.providerKey ?? GOOGLE_VERTEX_PROVIDER_KEY,
      modelId: model.modelId,
      updatedAt: now,
      updatedBy: userId,
    };

    if (existingDefault) {
      await ctx.db.patch(existingDefault._id, defaultPatch);
    } else {
      await ctx.db.insert("aiModelDefaults", {
        scope: "global",
        useCase: args.useCase,
        ...defaultPatch,
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "SET_GLOBAL_AI_MODEL_DEFAULT",
      actorId: userId,
      entityType: "systemConfig",
      entityId: "SYSTEM_AI_MODEL_DEFAULTS",
      timestamp: now,
      metadata: JSON.stringify({ useCase: args.useCase, modelId: model.modelId }),
    });

    return true;
  },
});

export const clearGlobalModelDefault = mutation({
  args: {
    useCase: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");
    if (!isSupportedDefaultUseCase(args.useCase)) {
      throw new Error("Unsupported AI model default use case.");
    }

    const existingDefault = await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", args.useCase))
      .first();

    if (existingDefault) {
      await ctx.db.delete(existingDefault._id);
    }

    await ctx.db.insert("auditLogs", {
      actionType: "CLEAR_GLOBAL_AI_MODEL_DEFAULT",
      actorId: userId,
      entityType: "systemConfig",
      entityId: "SYSTEM_AI_MODEL_DEFAULTS",
      timestamp: Date.now(),
      metadata: JSON.stringify({ useCase: args.useCase }),
    });

    return true;
  },
});

export const internalUpdateProviderHealth = internalMutation({
  args: {
    providerKey: v.string(),
    displayName: v.optional(v.string()),
    status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("error"), v.literal("unknown"), v.literal("disabled")),
    syncStatus: v.optional(v.string()),
    settings: v.optional(v.string()),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await upsertProviderStatus(ctx, {
      providerKey: args.providerKey,
      displayName: args.displayName,
      status: args.status,
      syncStatus: args.syncStatus,
      settings: args.settings,
      isEnabled: args.isEnabled,
      lastHealthCheckAt: Date.now(),
    });

    return true;
  },
});

async function getUseCaseDefaultModel(
  ctx: QueryCtx,
  args: { companyId?: Id<"companies">; useCase?: string }
) {
  if (!args.useCase) return null;

  if (args.companyId) {
    const companyDefault = await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_company_use_case", (q) => q.eq("companyId", args.companyId).eq("useCase", args.useCase as string))
      .first();
    const companyModel = companyDefault ? await getModelByStableId(ctx, companyDefault.modelId) : null;
    if (companyModel?.isEnabled) return companyModel;

    if (companyDefault?.fallbackModelId) {
      const fallbackModel = await getModelByStableId(ctx, companyDefault.fallbackModelId);
      if (fallbackModel?.isEnabled) return fallbackModel;
    }
  }

  const globalDefault = await ctx.db
    .query("aiModelDefaults")
    .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", args.useCase as string))
    .first();
  const globalModel = globalDefault ? await getModelByStableId(ctx, globalDefault.modelId) : null;
  if (globalModel?.isEnabled) return globalModel;

  if (globalDefault?.fallbackModelId) {
    const fallbackModel = await getModelByStableId(ctx, globalDefault.fallbackModelId);
    if (fallbackModel?.isEnabled) return fallbackModel;
  }

  return null;
}

async function resolveModelConfig(
  ctx: QueryCtx,
  args: { requestedModelId?: string; companyId?: Id<"companies">; useCase?: string }
) {
  const requestedModel = args.requestedModelId ? await getModelByStableId(ctx, args.requestedModelId) : null;
  const useCaseDefault = await getUseCaseDefaultModel(ctx, args);

  const defaultModels = await ctx.db
    .query("aiModels")
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .take(DEFAULT_MODEL_LIMIT);

  return resolveExecutionModel({
    requestedModelId: args.requestedModelId,
    requestedModel,
    defaultModels: useCaseDefault
      ? [{ ...withInferredProvider(useCaseDefault), isDefault: true }]
      : withInferredProviders(defaultModels),
  });
}

export const resolveModelConfigForExecution = internalQuery({
  args: {
    requestedModelId: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await resolveModelConfig(ctx, args);
  },
});

export const resolveModelForExecution = internalQuery({
  args: {
    requestedModelId: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const modelConfig = await resolveModelConfig(ctx, args);
    return modelConfig.modelId;
  },
});

export const getCompanyModelDefaults = query({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");

    const defaults = await Promise.all(DEFAULT_MODEL_USE_CASES.map(async (useCase) => {
      const [companyDefault, globalDefault] = await Promise.all([
        ctx.db
          .query("aiModelDefaults")
          .withIndex("by_company_use_case", (q) => q.eq("companyId", args.companyId).eq("useCase", useCase))
          .first(),
        ctx.db
          .query("aiModelDefaults")
          .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", useCase))
          .first(),
      ]);

      const [companyModel, globalModel] = await Promise.all([
        companyDefault ? getModelByStableId(ctx, companyDefault.modelId) : Promise.resolve(null),
        globalDefault ? getModelByStableId(ctx, globalDefault.modelId) : Promise.resolve(null),
      ]);

      return {
        useCase,
        companyDefault: companyDefault ? {
          _id: companyDefault._id,
          modelId: companyDefault.modelId,
          providerKey: companyDefault.providerKey,
          fallbackModelId: companyDefault.fallbackModelId,
          updatedAt: companyDefault.updatedAt,
          model: summarizeDefaultModel(companyModel),
        } : null,
        globalDefault: globalDefault ? {
          _id: globalDefault._id,
          modelId: globalDefault.modelId,
          providerKey: globalDefault.providerKey,
          fallbackModelId: globalDefault.fallbackModelId,
          updatedAt: globalDefault.updatedAt,
          model: summarizeDefaultModel(globalModel),
        } : null,
      };
    }));

    return {
      companyId: args.companyId,
      useCases: DEFAULT_MODEL_USE_CASES,
      defaults,
    };
  },
});

export const setCompanyModelDefault = mutation({
  args: {
    companyId: v.id("companies"),
    useCase: v.string(),
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");

    const model = await assertModelCanBeDefaultForUseCase(ctx, {
      modelId: args.modelId,
      useCase: args.useCase,
    });
    const now = Date.now();

    const existingDefault = await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_company_use_case", (q) => q.eq("companyId", args.companyId).eq("useCase", args.useCase))
      .first();

    const defaultPatch = {
      providerKey: model.providerKey ?? GOOGLE_VERTEX_PROVIDER_KEY,
      modelId: model.modelId,
      updatedAt: now,
      updatedBy: userId,
    };

    if (existingDefault) {
      await ctx.db.patch(existingDefault._id, defaultPatch);
    } else {
      await ctx.db.insert("aiModelDefaults", {
        scope: "company",
        companyId: args.companyId,
        useCase: args.useCase,
        ...defaultPatch,
      });
    }

    await ctx.db.insert("auditLogs", {
      actionType: "SET_COMPANY_AI_MODEL_DEFAULT",
      actorId: userId,
      entityType: "companies",
      entityId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({ companyId: args.companyId, useCase: args.useCase, modelId: model.modelId }),
    });

    return true;
  },
});

export const clearCompanyModelDefault = mutation({
  args: {
    companyId: v.id("companies"),
    useCase: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    if (!isSupportedDefaultUseCase(args.useCase)) {
      throw new Error("Unsupported AI model default use case.");
    }

    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");

    const existingDefault = await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_company_use_case", (q) => q.eq("companyId", args.companyId).eq("useCase", args.useCase))
      .first();

    if (existingDefault) {
      await ctx.db.delete(existingDefault._id);
    }

    await ctx.db.insert("auditLogs", {
      actionType: "CLEAR_COMPANY_AI_MODEL_DEFAULT",
      actorId: userId,
      entityType: "companies",
      entityId: args.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({ companyId: args.companyId, useCase: args.useCase }),
    });

    return true;
  },
});

export const resolveEmbeddingModelConfigForExecution = internalQuery({
  args: {
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const embeddingDefault = await getUseCaseDefaultModel(ctx, {
      companyId: args.companyId,
      useCase: EMBEDDING_MODEL_USE_CASE,
    });

    if (embeddingDefault) {
      const resolved = withInferredProvider(embeddingDefault);
      if (resolved.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY) {
        throw new Error("Embedding generation currently requires a Google Vertex model to preserve the 768-dimension vector index.");
      }

      if (!resolved.supportedUseCases?.includes(EMBEDDING_MODEL_USE_CASE)) {
        throw new Error("Configured embedding model does not support the embedding use case.");
      }

      return {
        modelId: resolved.modelId,
        providerKey: resolved.providerKey,
        providerModelId: resolved.providerModelId ?? resolved.modelId,
        source: "default" as const,
        embeddingDimensions: GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
      };
    }

    return {
      modelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
      providerModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      source: "failsafe" as const,
      embeddingDimensions: GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
    };
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
        const currentDefaults = await ctx.db
          .query("aiModelDefaults")
          .withIndex("by_scope_use_case", (q) => q.eq("scope", "global"))
          .take(DEFAULT_MODEL_USE_CASES.length + 10);
        for (const defaultRow of currentDefaults) {
          if (defaultRow.modelId === model.modelId) {
            await ctx.db.delete(defaultRow._id);
          }
        }
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
      .take(DEFAULT_MODEL_LIMIT);

    for (const model of currentDefaults) {
      if (model._id !== args.modelId) {
        await ctx.db.patch(model._id, { isDefault: false });
      }
    }

    await ctx.db.patch(args.modelId, { isDefault: true, isEnabled: true });

    const newDefault = await ctx.db.get(args.modelId);
    if (newDefault) {
      const now = Date.now();
      for (const useCase of DEFAULT_MODEL_USE_CASES) {
        const existingDefault = await ctx.db
          .query("aiModelDefaults")
          .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", useCase))
          .first();

        const providerKey = newDefault.providerKey ?? GOOGLE_VERTEX_PROVIDER_KEY;
        if (existingDefault) {
          await ctx.db.patch(existingDefault._id, {
            providerKey,
            modelId: newDefault.modelId,
            updatedAt: now,
            updatedBy: userId,
          });
        } else {
          await ctx.db.insert("aiModelDefaults", {
            scope: "global",
            useCase,
            providerKey,
            modelId: newDefault.modelId,
            updatedAt: now,
            updatedBy: userId,
          });
        }
      }
    }
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
    providerKey: v.optional(v.string()),
    providerDisplayName: v.optional(v.string()),
    defaultUseCases: v.optional(v.array(v.string())),
    models: v.array(
      v.object({
        modelId: v.string(),
        providerModelId: v.optional(v.string()),
        displayName: v.string(),
        description: v.optional(v.string()),
        capabilities: v.optional(v.array(v.string())),
        supportedUseCases: v.optional(v.array(v.string())),
        contextWindowTokens: v.optional(v.number()),
        maxOutputTokens: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const providerKey = args.providerKey ?? GOOGLE_VERTEX_PROVIDER_KEY;
    const providerDisplayName = args.providerDisplayName ?? "Google Vertex AI";
    const existingProvider = await ctx.db
      .query("aiProviders")
      .withIndex("by_provider_key", (q) => q.eq("providerKey", providerKey))
      .first();

    if (existingProvider) {
      await ctx.db.patch(existingProvider._id, {
        displayName: providerDisplayName,
        isEnabled: true,
        status: "healthy",
        lastSyncedAt: now,
        syncStatus: "synced",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("aiProviders", {
        providerKey,
        displayName: providerDisplayName,
        isEnabled: true,
        authMode: "environment",
        status: "healthy",
        lastSyncedAt: now,
        syncStatus: "synced",
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const incomingModel of args.models) {
      const providerModelId = incomingModel.providerModelId ?? incomingModel.modelId;
      const stableModelId = incomingModel.modelId.includes(":")
        ? incomingModel.modelId
        : providerKey === GOOGLE_VERTEX_PROVIDER_KEY
          ? incomingModel.modelId
          : getProviderQualifiedModelId(providerKey, providerModelId);
      const existing = await ctx.db
        .query("aiModels")
        .withIndex("by_model_id", (q) => q.eq("modelId", stableModelId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          providerKey,
          providerModelId,
          displayName: incomingModel.displayName,
          description: incomingModel.description,
          capabilities: incomingModel.capabilities,
          supportedUseCases: incomingModel.supportedUseCases,
          contextWindowTokens: incomingModel.contextWindowTokens,
          maxOutputTokens: incomingModel.maxOutputTokens,
          status: "available",
          lastSyncedAt: now,
        });
      } else {
        await ctx.db.insert("aiModels", {
          modelId: stableModelId,
          providerKey,
          providerModelId,
          displayName: incomingModel.displayName,
          description: incomingModel.description,
          isEnabled: false,
          isDefault: false,
          status: "available",
          capabilities: incomingModel.capabilities,
          supportedUseCases: incomingModel.supportedUseCases,
          contextWindowTokens: incomingModel.contextWindowTokens,
          maxOutputTokens: incomingModel.maxOutputTokens,
          inputTokenUnit: "token",
          outputTokenUnit: "token",
          currency: "USD",
          pricingSource: "provider-sync",
          pricingEffectiveAt: now,
          lastSyncedAt: now,
        });
      }
    }

    const activeDefault = await ctx.db
      .query("aiModels")
      .withIndex("by_default", (q) => q.eq("isDefault", true))
      .first();

    if (activeDefault) {
      const useCases = args.defaultUseCases ?? DEFAULT_MODEL_USE_CASES;
      for (const useCase of useCases) {
        const existingDefault = await ctx.db
          .query("aiModelDefaults")
          .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", useCase))
          .first();

        const defaultPatch = {
          providerKey: activeDefault.providerKey ?? providerKey,
          modelId: activeDefault.modelId,
          updatedAt: now,
        };

        if (existingDefault) {
          await ctx.db.patch(existingDefault._id, defaultPatch);
        } else {
          await ctx.db.insert("aiModelDefaults", {
            scope: "global",
            useCase,
            ...defaultPatch,
          });
        }
      }
    }
    return true;
  },
});

export const backfillGoogleVertexModelProviders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const models = await ctx.db.query("aiModels").take(MODEL_CATALOG_LIMIT);
    let updatedCount = 0;

    for (const model of models) {
      if (!model.providerKey && isGoogleVertexModelId(model.modelId)) {
        await ctx.db.patch(model._id, {
          providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
          providerModelId: model.providerModelId ?? model.modelId,
          status: model.status ?? "available",
          lastSyncedAt: model.lastSyncedAt || now,
        });
        updatedCount++;
      }
    }

    return { updatedCount };
  },
});

export const getModel = query({
  args: { modelId: v.id("aiModels") },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx, "Unauthenticated request");
    const model = await ctx.db.get(args.modelId);
    return model ? withInferredProvider(model) : model;
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
    return await ctx.db.query("aiModels").take(MODEL_CATALOG_LIMIT);
  },
});
