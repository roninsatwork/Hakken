import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { normalizeSearchTerm } from "./adminQueryService";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  ANTHROPIC_PROVIDER_KEY,
  DEFAULT_MODEL_USE_CASES,
  EMBEDDING_MODEL_USE_CASE,
  GOOGLE_VERTEX_EMBEDDING_DIMENSIONS,
  GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
  AGENT_CAPABLE_USE_CASES,
  GOOGLE_VERTEX_PROVIDER_KEY,
  OPENAI_PROVIDER_KEY,
  OPENROUTER_PROVIDER_KEY,
  buildModelSearchText,
  canGenerateText,
  canProviderServeUseCase,
  describeUseCaseProviderLimit,
  getProviderQualifiedModelId,
  isGoogleVertexModelId,
  resolveExecutionModel,
} from "./aiModelService";

/**
 * How many models a full-catalogue read will take.
 *
 * The catalogue *list* no longer uses this — it pages in the database. What
 * remains are the reads that genuinely need every row: the counts rollup, the
 * search-text backfill, and the enabled-model queries behind the pickers.
 *
 * Raised from 500 when OpenRouter arrived. One gateway provider alone publishes
 * around 345 models, which took a deployment that had 107 to roughly 452 — close
 * enough to the old ceiling that a second gateway would have crossed it. Past
 * this limit the rollup reports `isPartial` rather than presenting a truncated
 * count as a total.
 */
const MODEL_CATALOG_LIMIT = 2000;
const DEFAULT_MODEL_LIMIT = 10;
/** Providers are a handful, not a catalogue. One read covers every one of them. */
const PROVIDER_LIMIT = 50;
/** Enough default rows to describe what a provider serves without scanning them all. */
const PROVIDER_USAGE_LIMIT = 200;
const GOOGLE_VERTEX_DISPLAY_NAME = "Google Vertex AI";
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  [GOOGLE_VERTEX_PROVIDER_KEY]: GOOGLE_VERTEX_DISPLAY_NAME,
  [OPENAI_PROVIDER_KEY]: "OpenAI",
  [ANTHROPIC_PROVIDER_KEY]: "Anthropic",
  [OPENROUTER_PROVIDER_KEY]: "OpenRouter",
};
const PLATFORM_PROVIDER_KEYS = [GOOGLE_VERTEX_PROVIDER_KEY, OPENAI_PROVIDER_KEY, ANTHROPIC_PROVIDER_KEY, OPENROUTER_PROVIDER_KEY];

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

export const getModels = tenantQuery({
  args: {},
  handler: async (ctx) => {
    return withInferredProviders(await ctx.db.query("aiModels").order("asc").take(MODEL_CATALOG_LIMIT));
  },
});

/**
 * What a model picker actually needs: a name, its provider, and the jobs it
 * can serve. `getActiveModels` hands back whole model rows — descriptions,
 * search text, pricing, the lot — which is hundreds of kilobytes of prose
 * shipped to a browser to fill a dropdown.
 */
export const getModelPickerOptions = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const [models, disabledProviders] = await Promise.all([
      ctx.db
        .query("aiModels")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
        .take(MODEL_CATALOG_LIMIT),
      ctx.db
        .query("aiProviders")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", false))
        .take(PROVIDER_LIMIT),
    ]);
    const disabledKeys = new Set(disabledProviders.map((provider) => provider.providerKey));
    return models
      .filter((model) => !model.providerKey || !disabledKeys.has(model.providerKey))
      .map((model) => ({
        _id: model._id,
        modelId: model.modelId,
        displayName: model.displayName,
        providerKey: model.providerKey ?? "",
        supportedUseCases: model.supportedUseCases ?? [],
        capabilities: model.capabilities ?? [],
        isEnabled: model.isEnabled,
        // The two numbers the pickers print beside a name. Everything else a
        // model row carries — its description, its search text, its whole
        // pricing table — stays on the server.
        standardInputCostBelow200k: model.standardInputCostBelow200k,
        outputResponseCost: model.outputResponseCost,
      }));
  },
});

export const getActiveModels = tenantQuery({
  args: {
    useCase: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [rawModels, disabledProviders] = await Promise.all([
      ctx.db
        .query("aiModels")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
        .take(MODEL_CATALOG_LIMIT),
      ctx.db
        .query("aiProviders")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", false))
        .take(PROVIDER_LIMIT),
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

    // The agent screen must only offer models an agent can actually run. The
    // dropdown once offered a model whose provider the agent runtime had no
    // adapter for, and the run refused at its first step — a choice that looks
    // valid on the screen and fails at execution time is a trap, not a choice.
    if (args.useCase && AGENT_CAPABLE_USE_CASES.has(args.useCase)) {
      models = models.filter((model) => canProviderServeUseCase(model.providerKey, args.useCase!));
    }

    models.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (a.friendlyName || a.displayName || a.modelId).localeCompare(b.friendlyName || b.displayName || b.modelId);
    });

    return models;
  },
});

/**
 * A page of the catalogue, produced by the database.
 *
 * The previous version read up to 500 rows, then filtered, sorted and sliced
 * the page in memory. With three providers publishing a handful of models each
 * that was invisible. OpenRouter publishes hundreds, at which point every
 * keystroke in the search box dragged the whole catalogue into the query and the
 * 500 cap began truncating without saying so.
 *
 * Now every narrowing happens in an index:
 *
 * - a search term goes to `search_text`, with the provider and status applied as
 *   *filter fields* so they narrow inside the index rather than after it;
 * - otherwise `by_provider_enabled`, `by_provider` or `by_enabled` is chosen by
 *   which filters are set.
 *
 * Ordering is the index's own, not a sort over the whole catalogue. Floating the
 * default row to the top was a nicety that cost a full scan, and the Default
 * column now answers that question on every row anyway.
 */
export const getPaginatedModels = superAdminQuery({
  args: {
    searchTerm: v.optional(v.string()),
    statusFilter: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    providerFilter: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const term = normalizeSearchTerm(args.searchTerm);
    const statusEnabled = args.statusFilter === undefined ? undefined : args.statusFilter === "active";
    const providerFilter = args.providerFilter && args.providerFilter !== "all" ? args.providerFilter : undefined;

    if (term) {
      const page = await ctx.db
        .query("aiModels")
        .withSearchIndex("search_text", (q) => {
          let search = q.search("searchText", term);
          if (providerFilter) search = search.eq("providerKey", providerFilter);
          if (statusEnabled !== undefined) search = search.eq("isEnabled", statusEnabled);
          return search;
        })
        .paginate(args.paginationOpts);

      return { ...page, page: withInferredProviders(page.page) };
    }

    if (providerFilter && statusEnabled !== undefined) {
      const page = await ctx.db
        .query("aiModels")
        .withIndex("by_provider_enabled", (q) => q.eq("providerKey", providerFilter).eq("isEnabled", statusEnabled))
        .paginate(args.paginationOpts);
      return { ...page, page: withInferredProviders(page.page) };
    }

    if (providerFilter) {
      const page = await ctx.db
        .query("aiModels")
        .withIndex("by_provider", (q) => q.eq("providerKey", providerFilter))
        .paginate(args.paginationOpts);
      return { ...page, page: withInferredProviders(page.page) };
    }

    if (statusEnabled !== undefined) {
      const page = await ctx.db
        .query("aiModels")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", statusEnabled))
        .paginate(args.paginationOpts);
      return { ...page, page: withInferredProviders(page.page) };
    }

    const page = await ctx.db.query("aiModels").order("asc").paginate(args.paginationOpts);
    return { ...page, page: withInferredProviders(page.page) };
  },
});

const MODEL_ROLLUP_KEY = "aiModels";

/**
 * Recount the catalogue and store the answer.
 *
 * Called from every path that can change what is in the catalogue or whether it
 * is switched on. One pass over the models is the price; it is paid when an
 * admin syncs or toggles, never when someone opens a screen.
 */
async function recomputeModelRollup(ctx: MutationCtx) {
  const models = await ctx.db.query("aiModels").take(MODEL_CATALOG_LIMIT);
  const byProviderKey = new Map<string, { total: number; enabled: number }>();

  for (const model of models) {
    // Legacy rows carry no provider key and are treated as Google everywhere
    // else, so they are counted that way here too rather than under "".
    const providerKey = model.providerKey
      ?? (isGoogleVertexModelId(model.modelId) ? GOOGLE_VERTEX_PROVIDER_KEY : "unknown");
    const counts = byProviderKey.get(providerKey) ?? { total: 0, enabled: 0 };
    counts.total += 1;
    if (model.isEnabled) counts.enabled += 1;
    byProviderKey.set(providerKey, counts);
  }

  const rollup = {
    rollupKey: MODEL_ROLLUP_KEY,
    totalModels: models.length,
    enabledModels: models.filter((model) => model.isEnabled).length,
    byProvider: Array.from(byProviderKey.entries()).map(([providerKey, counts]) => ({
      providerKey,
      total: counts.total,
      enabled: counts.enabled,
    })),
    computedAt: Date.now(),
    isPartial: models.length >= MODEL_CATALOG_LIMIT,
  };

  const existing = await ctx.db
    .query("aiModelRollups")
    .withIndex("by_rollup_key", (q) => q.eq("rollupKey", MODEL_ROLLUP_KEY))
    .first();

  if (existing) await ctx.db.patch(existing._id, rollup);
  else await ctx.db.insert("aiModelRollups", rollup);
}

/**
 * The counts, read as a single document.
 *
 * `computedAt` and `isPartial` travel with them so a screen can say how old the
 * answer is and whether it covers the whole catalogue. A number presented as
 * live truth when it is neither is the habit these rollups exist to break.
 */
export const getModelCounts = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const rollup = await ctx.db
      .query("aiModelRollups")
      .withIndex("by_rollup_key", (q) => q.eq("rollupKey", MODEL_ROLLUP_KEY))
      .first();

    if (!rollup) {
      return { totalModels: 0, enabledModels: 0, byProvider: [], computedAt: null, isPartial: false };
    }

    return {
      totalModels: rollup.totalModels,
      enabledModels: rollup.enabledModels,
      byProvider: rollup.byProvider,
      computedAt: rollup.computedAt,
      isPartial: rollup.isPartial,
    };
  },
});

export const getProviders = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const providers = await ctx.db.query("aiProviders").withIndex("by_provider_key").take(PROVIDER_LIMIT);
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
    throw appError("INVALID_INPUT", "Unsupported AI model default use case.");
  }

  const model = await getModelByStableIdForMutation(ctx, args.modelId);
  if (!model?.isEnabled) {
    throw appError("INVALID_INPUT", "Selected AI model is not enabled.");
  }

  if (!modelSupportsUseCase(model, args.useCase)) {
    throw appError("INVALID_INPUT", `Selected AI model does not support the ${args.useCase} use case.`);
  }

  // Two capabilities are genuinely Google-only, and two jobs need a provider
  // with an agent adapter. Checked here as well as on the screen, because a
  // picker that offers only valid choices and a runtime that accepts anything
  // is one API call away from the failure this is meant to prevent.
  if (!canProviderServeUseCase(model.providerKey, args.useCase)) {
    const reason = describeUseCaseProviderLimit(args.useCase);
    throw appError("INVALID_INPUT", 
      `Selected AI model's provider cannot handle the ${args.useCase} job.${reason ? ` ${reason}` : ""}`,
    );
  }

  if (model.providerKey) {
    const provider = await ctx.db
      .query("aiProviders")
      .withIndex("by_provider_key", (q) => q.eq("providerKey", model.providerKey as string))
      .first();

    if (provider && !provider.isEnabled) {
      throw appError("INVALID_INPUT", "Selected AI model provider is disabled.");
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

/**
 * What a provider is currently handling, asked before it is switched off.
 *
 * Disabling a provider now genuinely stops its models serving, which is the
 * point — but it means the toggle can silently take a company's agents offline.
 * The screen asks first, and this is what it needs in order to say what is about
 * to stop.
 *
 * Read through `by_provider` rather than by scanning every default row, because
 * company-scoped defaults grow with the number of companies.
 */
export const getProviderDefaultUsage = superAdminQuery({
  args: {
    providerKey: v.string(),
  },
  handler: async (ctx, args) => {
    const defaults = await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_provider", (q) => q.eq("providerKey", args.providerKey))
      .take(PROVIDER_USAGE_LIMIT);

    const globalUseCases = defaults
      .filter((row) => row.scope === "global")
      .map((row) => row.useCase);
    const companyIds = new Set(
      defaults
        .filter((row) => row.scope === "company" && row.companyId)
        .map((row) => row.companyId as Id<"companies">),
    );

    return {
      globalUseCases,
      companyCount: companyIds.size,
      // The screen must not present a truncated read as the whole picture.
      isPartial: defaults.length >= PROVIDER_USAGE_LIMIT,
    };
  },
});

export const setProviderEnabled = superAdminMutation({
  args: {
    providerKey: v.string(),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
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

export const getGlobalModelDefaults = superAdminQuery({
  args: {},
  handler: async (ctx) => {
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

export const setGlobalModelDefault = superAdminMutation({
  args: {
    useCase: v.string(),
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
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

export const clearGlobalModelDefault = superAdminMutation({
  args: {
    useCase: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    if (!isSupportedDefaultUseCase(args.useCase)) {
      throw appError("INVALID_INPUT", "Unsupported AI model default use case.");
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

/**
 * The model chosen for this job, at the most specific scope that has one.
 *
 * Every tier now asks whether the model is *servable* rather than merely
 * enabled, so a default sitting on a switched-off provider falls through to the
 * next tier instead of running.
 *
 * A tier must also be *capable*: the defaults screen tells the reader that a
 * model which cannot do this job "falls through to whatever is set below it",
 * and until this check the runtime did not honour that sentence — an OpenAI
 * model saved as the transcription default was resolved anyway and threw at
 * the provider boundary, taking every dictation with it.
 */
function canModelServeUseCase(
  model: { providerKey?: string } | null | undefined,
  useCase: string | undefined,
) {
  if (!model || !useCase) return true;
  return canProviderServeUseCase(model.providerKey, useCase);
}

async function getUseCaseDefaultModel(
  ctx: QueryCtx,
  args: { companyId?: Id<"companies">; useCase?: string },
  disabledProviderKeys: Set<string>,
) {
  if (!args.useCase) return null;

  const isUsable = (model: Doc<"aiModels"> | null | undefined) =>
    isModelServable(model, disabledProviderKeys) && canModelServeUseCase(model, args.useCase);

  if (args.companyId) {
    const companyDefault = await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_company_use_case", (q) => q.eq("companyId", args.companyId).eq("useCase", args.useCase as string))
      .first();
    const companyModel = companyDefault ? await getModelByStableId(ctx, companyDefault.modelId) : null;
    if (isUsable(companyModel)) return companyModel;

    if (companyDefault?.fallbackModelId) {
      const fallbackModel = await getModelByStableId(ctx, companyDefault.fallbackModelId);
      if (isUsable(fallbackModel)) return fallbackModel;
    }
  }

  const globalDefault = await ctx.db
    .query("aiModelDefaults")
    .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", args.useCase as string))
    .first();
  const globalModel = globalDefault ? await getModelByStableId(ctx, globalDefault.modelId) : null;
  if (isUsable(globalModel)) return globalModel;

  if (globalDefault?.fallbackModelId) {
    const fallbackModel = await getModelByStableId(ctx, globalDefault.fallbackModelId);
    if (isUsable(fallbackModel)) return fallbackModel;
  }

  return null;
}

/**
 * The providers this deployment has switched off.
 *
 * Read from the `by_enabled` index rather than scanned, and shaped as a set so
 * the callers below stay O(1) per model. `getActiveModels` has always used this
 * rule to decide what appears in a picker; until now the runtime did not.
 */
async function getDisabledProviderKeys(ctx: QueryCtx) {
  const disabledProviders = await ctx.db
    .query("aiProviders")
    .withIndex("by_enabled", (q) => q.eq("isEnabled", false))
    .take(PROVIDER_LIMIT);
  return new Set(disabledProviders.map((provider) => provider.providerKey));
}

/**
 * Whether the runtime may actually call this model.
 *
 * Being enabled is not enough: a model on a provider someone has switched off
 * must not run. Disabling a provider used to hide its models from every picker
 * and block new defaults while leaving *existing* defaults running on it, so the
 * button stated an outcome the system did not deliver.
 *
 * A model with no provider key at all is a legacy row that predates provider
 * tracking; those are treated as Google, matching `withInferredProviders` and
 * the rule `getActiveModels` already applies.
 */
function isModelServable(
  model: { isEnabled?: boolean; providerKey?: string } | null | undefined,
  disabledProviderKeys: Set<string>,
) {
  if (!model?.isEnabled) return false;
  return !model.providerKey || !disabledProviderKeys.has(model.providerKey);
}

async function resolveModelConfig(
  ctx: QueryCtx,
  args: { requestedModelId?: string; companyId?: Id<"companies">; useCase?: string }
) {
  const disabledProviderKeys = await getDisabledProviderKeys(ctx);
  const requestedModel = args.requestedModelId ? await getModelByStableId(ctx, args.requestedModelId) : null;
  const useCaseDefault = await getUseCaseDefaultModel(ctx, args, disabledProviderKeys);

  const defaultModels = await ctx.db
    .query("aiModels")
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .take(DEFAULT_MODEL_LIMIT);

  return resolveExecutionModel({
    requestedModelId: args.requestedModelId,
    // Filtered here rather than inside `resolveExecutionModel`, which is a pure
    // function over model records and has no way to know what a provider is.
    requestedModel: isModelServable(requestedModel, disabledProviderKeys) ? requestedModel : null,
    defaultModels: useCaseDefault
      ? [{ ...withInferredProvider(useCaseDefault), isDefault: true }]
      : withInferredProviders(defaultModels).filter(
          (model) =>
            isModelServable(model, disabledProviderKeys) &&
            // The platform-wide default is subject to the same capability rule
            // as a per-job default: a job no tier can serve lands on the
            // failsafe rather than on a model that will throw.
            canModelServeUseCase(model, args.useCase)
        ),
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

/**
 * How each job would actually route for this company, by the runtime's own rules.
 *
 * The company AI screen used to answer this by counting `aiModelDefaults` rows
 * against a hand-copied list of seven use cases and testing `isEnabled`. That
 * was wrong three ways: the list omitted `fast-chat` and `transcription`, an
 * enabled model behind a switched-off provider counted as working, and a job
 * served by its `fallbackModelId` counted as broken.
 *
 * It also demanded an `embedding` default that nothing can create — the bulk
 * path skips use cases the chosen model cannot serve, and no embedding model can
 * be the platform chat default — for a job that runs perfectly well on
 * `GOOGLE_VERTEX_EMBEDDING_MODEL_ID`. So the screen showed a permanent 6/7.
 *
 * Every job resolves to *something*: text jobs fall through to
 * `SYSTEM_FAILSAFE_MODEL_ID` and embeddings to the Google failsafe. The only
 * genuine fault is a company override that cannot run, because that silently
 * falls back to the platform's choice rather than the one someone made here.
 */
export async function summariseCompanyModelRouting(ctx: QueryCtx, companyId: Id<"companies">) {
  const disabledProviderKeys = await getDisabledProviderKeys(ctx);

  const rows = await Promise.all(DEFAULT_MODEL_USE_CASES.map(async (useCase) => {
    const companyRow = await ctx.db
      .query("aiModelDefaults")
      .withIndex("by_company_use_case", (q) => q.eq("companyId", companyId).eq("useCase", useCase))
      .first();

    if (!companyRow) return { useCase, isConfiguredHere: false, runsAsChosen: true };

    // Mirrors `getUseCaseDefaultModel`: the primary, then the fallback behind it.
    const companyModel = await getModelByStableId(ctx, companyRow.modelId);
    if (isModelServable(companyModel, disabledProviderKeys)) {
      return { useCase, isConfiguredHere: true, runsAsChosen: true };
    }
    const fallbackModel = companyRow.fallbackModelId
      ? await getModelByStableId(ctx, companyRow.fallbackModelId)
      : null;
    return {
      useCase,
      isConfiguredHere: true,
      runsAsChosen: isModelServable(fallbackModel, disabledProviderKeys),
    };
  }));

  return {
    totalUseCases: rows.length,
    configuredHere: rows.filter((row) => row.isConfiguredHere).length,
    brokenUseCases: rows.filter((row) => row.isConfiguredHere && !row.runsAsChosen).map((row) => row.useCase),
  };
}

export const getCompanyModelDefaults = superAdminQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found");

    const [defaults, models, disabledProviders, providers] = await Promise.all([
      Promise.all(DEFAULT_MODEL_USE_CASES.map(async (useCase) => {
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
      })),
      ctx.db
        .query("aiModels")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
        .take(MODEL_CATALOG_LIMIT),
      ctx.db
        .query("aiProviders")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", false))
        .take(PROVIDER_LIMIT),
      ctx.db.query("aiProviders").withIndex("by_provider_key").take(PROVIDER_LIMIT),
    ]);

    const disabledProviderKeys = new Set(disabledProviders.map((provider) => provider.providerKey));
    const modelPickerOptions = models
      .filter((model) => !model.providerKey || !disabledProviderKeys.has(model.providerKey))
      .map((model) => ({
        modelId: model.modelId,
        displayName: model.displayName,
        providerKey: model.providerKey ?? "",
        supportedUseCases: model.supportedUseCases ?? [],
        standardInputCostBelow200k: model.standardInputCostBelow200k,
        outputResponseCost: model.outputResponseCost,
      }));
    const providersByKey = new Map(providers.map((provider) => [provider.providerKey, provider]));
    const providerNames = [
      ...PLATFORM_PROVIDER_KEYS.map((providerKey) => ({
        providerKey,
        displayName: providersByKey.get(providerKey)?.displayName
          ?? PROVIDER_DISPLAY_NAMES[providerKey]
          ?? providerKey,
      })),
      ...providers
        .filter((provider) => !PLATFORM_PROVIDER_KEYS.includes(provider.providerKey))
        .map((provider) => ({ providerKey: provider.providerKey, displayName: provider.displayName })),
    ];

    return {
      companyId: args.companyId,
      useCases: DEFAULT_MODEL_USE_CASES,
      defaults,
      modelPickerOptions,
      providerNames,
    };
  },
});

export const setCompanyModelDefault = superAdminMutation({
  args: {
    companyId: v.id("companies"),
    useCase: v.string(),
    modelId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found");

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

export const clearCompanyModelDefault = superAdminMutation({
  args: {
    companyId: v.id("companies"),
    useCase: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    if (!isSupportedDefaultUseCase(args.useCase)) {
      throw appError("INVALID_INPUT", "Unsupported AI model default use case.");
    }

    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found");

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
    // Embeddings go through the same servability rule as everything else: a
    // configured embedding model on a switched-off provider falls through to the
    // failsafe rather than being called.
    const embeddingDefault = await getUseCaseDefaultModel(ctx, {
      companyId: args.companyId,
      useCase: EMBEDDING_MODEL_USE_CASE,
    }, await getDisabledProviderKeys(ctx));

    if (embeddingDefault) {
      const resolved = withInferredProvider(embeddingDefault);
      if (resolved.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY) {
        throw appError("NOT_CONFIGURED", "Embedding generation currently requires a Google Vertex model to preserve the 768-dimension vector index.");
      }

      if (!resolved.supportedUseCases?.includes(EMBEDDING_MODEL_USE_CASE)) {
        throw appError("NOT_CONFIGURED", "Configured embedding model does not support the embedding use case.");
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

export const toggleModelEnforcement = superAdminMutation({
  args: { modelId: v.id("aiModels"), isEnabled: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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
    await recomputeModelRollup(ctx);

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

export const setDefaultModel = superAdminMutation({
  args: { modelId: v.id("aiModels") },
  handler: async (ctx, args) => {
    const { userId } = ctx;

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
    await recomputeModelRollup(ctx);

    const newDefault = await ctx.db.get(args.modelId);
    const skippedUseCases: string[] = [];
    if (newDefault) {
      const now = Date.now();
      for (const useCase of DEFAULT_MODEL_USE_CASES) {
        // This loop used to write every job without asking whether the model
        // could do it, so the bulk action created exactly the state the
        // per-row path rejects. The screen then showed "No platform default"
        // beside a price for the default that did exist — and touching the row
        // cleared it.
        const canServe = modelSupportsUseCase(newDefault, useCase)
          && canProviderServeUseCase(newDefault.providerKey, useCase);
        if (!canServe) {
          skippedUseCases.push(useCase);
          continue;
        }
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
      metadata: JSON.stringify({ model: newDefault?.modelId, skippedUseCases })
    });

    // Reported rather than silently done, so the screen can say which jobs this
    // model could not take over instead of leaving the reader to notice.
    return { appliedUseCases: DEFAULT_MODEL_USE_CASES.length - skippedUseCases.length, skippedUseCases };
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
        // Only OpenRouter reports prices; the others leave these unset and an
        // admin types them in. Sending them through the sync is what makes those
        // models arrive costed rather than throttled for want of a rate.
        standardInputCostBelow200k: v.optional(v.number()),
        standardInputCostAbove200k: v.optional(v.number()),
        outputResponseCost: v.optional(v.number()),
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
      // A colon used to mean "already provider-qualified". That held while every
      // provider's own ids were colon-free — and stops holding the moment a
      // provider publishes ids like `vendor/model:variant`, which would be
      // stored unqualified and could collide in `by_model_id` with another
      // provider's row. The question was always "is this already prefixed with
      // *this* provider", so that is what it now asks.
      const stableModelId = incomingModel.modelId.startsWith(`${providerKey}:`)
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
          // Rebuilt on every write, because a stale search field is a model the
          // reader cannot find and has no way to know is missing.
          searchText: buildModelSearchText({
            friendlyName: existing.friendlyName,
            displayName: incomingModel.displayName,
            modelId: stableModelId,
            providerModelId,
          }),
          description: incomingModel.description,
          capabilities: incomingModel.capabilities,
          supportedUseCases: incomingModel.supportedUseCases,
          contextWindowTokens: incomingModel.contextWindowTokens,
          maxOutputTokens: incomingModel.maxOutputTokens,
          // A provider that reports prices keeps them current. One that does not
          // must not blank out what an admin typed in, so these are only written
          // when the sync actually supplied them.
          ...(incomingModel.standardInputCostBelow200k !== undefined
            ? { standardInputCostBelow200k: incomingModel.standardInputCostBelow200k }
            : {}),
          ...(incomingModel.standardInputCostAbove200k !== undefined
            ? { standardInputCostAbove200k: incomingModel.standardInputCostAbove200k }
            : {}),
          ...(incomingModel.outputResponseCost !== undefined
            ? { outputResponseCost: incomingModel.outputResponseCost }
            : {}),
          status: "available",
          lastSyncedAt: now,
        });
      } else {
        await ctx.db.insert("aiModels", {
          modelId: stableModelId,
          providerKey,
          providerModelId,
          displayName: incomingModel.displayName,
          searchText: buildModelSearchText({
            displayName: incomingModel.displayName,
            modelId: stableModelId,
            providerModelId,
          }),
          description: incomingModel.description,
          isEnabled: false,
          isDefault: false,
          status: "available",
          capabilities: incomingModel.capabilities,
          supportedUseCases: incomingModel.supportedUseCases,
          contextWindowTokens: incomingModel.contextWindowTokens,
          maxOutputTokens: incomingModel.maxOutputTokens,
          standardInputCostBelow200k: incomingModel.standardInputCostBelow200k,
          standardInputCostAbove200k: incomingModel.standardInputCostAbove200k,
          outputResponseCost: incomingModel.outputResponseCost,
          inputTokenUnit: "token",
          outputTokenUnit: "token",
          currency: "USD",
          pricingSource: "provider-sync",
          pricingEffectiveAt: now,
          lastSyncedAt: now,
        });
      }
    }

    // Once, after the whole batch, rather than once per model.
    await recomputeModelRollup(ctx);

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

/**
 * Give existing rows a search field.
 *
 * `searchText` is maintained on write, but rows that predate it have none — and
 * a model with no search text is invisible to the catalogue search while looking
 * perfectly normal in the list. Run once after deploying; safe to run again.
 */
export const backfillModelSearchText = internalMutation({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db.query("aiModels").take(MODEL_CATALOG_LIMIT);
    let updatedCount = 0;

    for (const model of models) {
      const searchText = buildModelSearchText(model);
      if (model.searchText === searchText) continue;
      await ctx.db.patch(model._id, { searchText });
      updatedCount += 1;
    }

    await recomputeModelRollup(ctx);
    return { updatedCount, isPartial: models.length >= MODEL_CATALOG_LIMIT };
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

export const getModel = tenantQuery({
  args: { modelId: v.id("aiModels") },
  handler: async (ctx, args) => {
    const model = await ctx.db.get(args.modelId);
    return model ? withInferredProvider(model) : model;
  },
});

export const updatePricingConfig = superAdminMutation({
  args: {
    modelId: v.id("aiModels"),
    friendlyName: v.optional(v.string()),
    standardInputCostBelow200k: v.optional(v.number()),
    standardInputCostAbove200k: v.optional(v.number()),
    cachedInputCostBelow200k: v.optional(v.number()),
    cachedInputCostAbove200k: v.optional(v.number()),
    outputResponseCost: v.optional(v.number()),
    // `outputReasoningCost` was collected by the model page and read by nothing:
    // no cost calculation, no budget, no report. A field that only ever travels
    // one way looks like it means something, so it stopped being asked for.
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;

    const { modelId, ...fields } = args;
    const existing = await ctx.db.get(modelId);
    await ctx.db.patch(modelId, {
      ...fields,
      // The friendly name is the one a reader chose, so it is the one they are
      // most likely to search for.
      ...(existing
        ? {
            searchText: buildModelSearchText({
              friendlyName: fields.friendlyName ?? existing.friendlyName,
              displayName: existing.displayName,
              modelId: existing.modelId,
              providerModelId: existing.providerModelId,
            }),
          }
        : {}),
    });

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

/**
 * One model's record, found by its stable id.
 *
 * Three runtime paths wanted a single model in order to price a call, and each
 * read the *whole catalogue* and built a Map to find it. That cost one document
 * per model in the deployment, per call — invisible at twenty models and a real
 * read on every agent step once a gateway provider adds hundreds.
 *
 * `by_model_id` answers the same question in one lookup.
 */
export const getModelByIdInternal = internalQuery({
  args: { modelId: v.string() },
  handler: async (ctx, args) => {
    const model = await getModelByStableId(ctx, args.modelId);
    return model ? withInferredProvider(model) : null;
  },
});

/**
 * The model ids this deployment has switched on.
 *
 * Returns ids rather than whole documents: the only caller needs a list to pick
 * a grader from, and shipping every field of every model to do that is the same
 * waste in a different shape.
 */
export const getEnabledModelIdsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db
      .query("aiModels")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .take(MODEL_CATALOG_LIMIT);
    return models.map((model) => model.modelId);
  },
});

/**
 * Enabled models that can actually produce text.
 *
 * The graders pick a model from this pool. They used to read every enabled model,
 * which on a deployment with an enabled embedding model meant grading with
 * `text-embedding-004` — a provider NOT_FOUND that `parseGradeVerdict` correctly
 * turned into a failure, so every model-graded eval failed for a reason that had
 * nothing to do with the answer.
 */
export const getEnabledTextModelIdsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const models = await ctx.db
      .query("aiModels")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .take(MODEL_CATALOG_LIMIT);
    return models.filter((model) => canGenerateText(model)).map((model) => model.modelId);
  },
});

export const getAllModelsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("aiModels").take(MODEL_CATALOG_LIMIT);
  },
});
