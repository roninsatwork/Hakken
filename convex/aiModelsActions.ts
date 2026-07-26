"use node";
import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireActionSuperAdmin } from "./actionAuth";
import {
  ANTHROPIC_PROVIDER_KEY,
  EMBEDDING_MODEL_USE_CASE,
  GOOGLE_VERTEX_PROVIDER_KEY,
  OPENAI_PROVIDER_KEY,
  OPENROUTER_PROVIDER_KEY,
} from "./aiModelService";
import { listAnthropicModels } from "./anthropicProviderService";
import { listOpenAIModels } from "./openaiProviderService";
import { listOpenRouterModels } from "./openrouterProviderService";
import { buildVertexProviderConfig, createVertexGenAIClient, listVertexModels } from "./vertexProviderService";
import { superAdminAction } from "./tenantFunctions";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getProviderDisplayName(providerKey: string) {
  if (providerKey === GOOGLE_VERTEX_PROVIDER_KEY) return "Google Vertex AI";
  if (providerKey === OPENAI_PROVIDER_KEY) return "OpenAI";
  if (providerKey === ANTHROPIC_PROVIDER_KEY) return "Anthropic";
  if (providerKey === OPENROUTER_PROVIDER_KEY) return "OpenRouter";
  return providerKey;
}

function titleizeModelId(modelId: string) {
  return modelId
    .replace(/[:-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getTextGenerationUseCases(modelId: string) {
  const normalized = modelId.toLowerCase();
  const useCases = ["chat", "fast-chat", "agent", "workflow", "report", "router", "title"];
  if (normalized.includes("reason") || normalized.startsWith("o") || normalized.includes("opus") || normalized.includes("sonnet")) {
    useCases.push("reasoning");
  }
  return useCases;
}

function getTextGenerationCapabilities(modelId: string) {
  const normalized = modelId.toLowerCase();
  const capabilities = ["text", "json-mode"];
  if (normalized.includes("reason") || normalized.startsWith("o") || normalized.includes("opus") || normalized.includes("sonnet")) {
    capabilities.push("reasoning");
  }
  if (!normalized.includes("embedding")) {
    capabilities.push("tool-calling");
  }
  return capabilities;
}

export function isOpenAITextGenerationModel(modelId: string) {
  const normalized = modelId.toLowerCase();
  if (
    normalized.includes("embedding") ||
    normalized.includes("transcribe") ||
    normalized.includes("tts") ||
    normalized.includes("realtime") ||
    normalized.includes("audio") ||
    normalized.includes("image") ||
    normalized.includes("moderation") ||
    normalized.includes("sora") ||
    normalized.includes("whisper") ||
    normalized.includes("dall")
  ) {
    return false;
  }

  return normalized.startsWith("gpt-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4") ||
    normalized.startsWith("chatgpt-");
}

async function syncGoogleVertexModelCatalogue(ctx: ActionCtx) {
  const ai = createVertexGenAIClient();
  const listed = await listVertexModels(ai);

  if (listed.length === 0) {
    throw new Error("Vertex AI returned no usable models.");
  }

  const formattedModels = listed.map((model) => {
    const isEmbedding = model.modelId.toLowerCase().includes("embedding");
    return {
      modelId: model.modelId,
      providerModelId: model.modelId,
      // Vertex answers with the model id as its display name, so
      // "gemini-2.5-flash" would become the name on screen. Titleizing is a
      // rule applied to whatever comes back, not a table of pretty names to
      // keep in step with Google's releases.
      displayName: titleizeModelId(model.displayName || model.modelId),
      description: model.description,
      // Vertex does not report what a model can do in a form this catalogue
      // uses, so capabilities are derived from the model id — again a rule
      // rather than a list of models to maintain.
      capabilities: isEmbedding ? ["embeddings"] : getTextGenerationCapabilities(model.modelId),
      // Vertex text models also take audio and images, which the generic
      // text-generation list does not claim. The hardcoded catalogue this
      // replaced said so; dropping it meant no model could be chosen to turn
      // speech into text, and that row became unsettable.
      supportedUseCases: isEmbedding
        ? [EMBEDDING_MODEL_USE_CASE]
        : [...getTextGenerationUseCases(model.modelId), "transcription", "vision"],
      // Vertex leaves these unset on the listing. Passing undefined through
      // would clear whatever a model already had, so they are only sent when
      // Vertex actually reports them.
      ...(model.contextWindowTokens ? { contextWindowTokens: model.contextWindowTokens } : {}),
      ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    };
  });

  await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerDisplayName: "Google Vertex AI",
    models: formattedModels,
  });
  await ctx.runMutation(internal.aiModels.backfillGoogleVertexModelProviders);

  await ctx.runMutation(internal.aiModels.internalUpdateProviderHealth, {
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    displayName: "Google Vertex AI",
    status: "healthy",
    syncStatus: "catalog-synced",
    settings: JSON.stringify({
      lastHealthMessage: `Listed ${formattedModels.length} models from Vertex AI.`,
    }),
  });

  return formattedModels;
}

/**
 * The OpenAI catalogue, asked of OpenAI.
 *
 * A curated list of twelve model ids used to be merged into whatever the live
 * call returned, and substituted wholesale when the call failed. Same fault as
 * the Vertex list: it silently decided what existed, went stale without saying
 * so, and made a failed sync look like a successful one.
 */
async function syncOpenAIModelCatalogue(ctx: ActionCtx) {
  const modelIds = await listOpenAIModels();
  const textModelIds = modelIds.filter(isOpenAITextGenerationModel);

  if (textModelIds.length === 0) {
    throw new Error("OpenAI returned no text-generation models.");
  }

  const formattedModels = textModelIds.map((modelId) => ({
    modelId,
    providerModelId: modelId,
    displayName: titleizeModelId(modelId),
    description: "OpenAI text generation model available to this API key.",
    capabilities: getTextGenerationCapabilities(modelId),
    supportedUseCases: getTextGenerationUseCases(modelId),
  }));

  await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
    providerKey: OPENAI_PROVIDER_KEY,
    providerDisplayName: "OpenAI",
    models: formattedModels,
  });

  await ctx.runMutation(internal.aiModels.internalUpdateProviderHealth, {
    providerKey: OPENAI_PROVIDER_KEY,
    displayName: "OpenAI",
    status: "healthy",
    syncStatus: "catalog-synced",
    settings: JSON.stringify({
      lastHealthMessage: `Listed ${formattedModels.length} text models from OpenAI.`,
    }),
  });

  return formattedModels;
}

/**
 * The OpenRouter catalogue, with its prices.
 *
 * OpenRouter is the only provider of ours that reports price, context length and
 * modalities per model, so this is the one sync that leaves nothing for an admin
 * to type in. Capabilities come from what OpenRouter says rather than from the
 * shape of the model id — the id-based guess used elsewhere would tag every
 * model in the `openai/` namespace as a reasoning model, because it starts
 * with "o".
 *
 * Every model it publishes is synced. Filtering here would be a hardcoded list
 * in a different coat; models arrive switched off, and the catalogue's search
 * and paging are what make a large list navigable.
 */
async function syncOpenRouterModelCatalogue(ctx: ActionCtx) {
  const listed = await listOpenRouterModels();

  if (listed.length === 0) {
    throw new Error("OpenRouter returned no models.");
  }

  const formattedModels = listed.map((model) => ({
    modelId: model.modelId,
    providerModelId: model.modelId,
    displayName: model.displayName,
    description: model.description,
    capabilities: model.capabilities,
    supportedUseCases: model.supportedUseCases,
    ...(model.contextWindowTokens ? { contextWindowTokens: model.contextWindowTokens } : {}),
    ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    ...(model.inputCostPerMillion !== undefined ? { standardInputCostBelow200k: model.inputCostPerMillion } : {}),
    // OpenRouter has no long-context price tier, so the same rate serves both.
    ...(model.inputCostPerMillion !== undefined ? { standardInputCostAbove200k: model.inputCostPerMillion } : {}),
    ...(model.outputCostPerMillion !== undefined ? { outputResponseCost: model.outputCostPerMillion } : {}),
  }));

  await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
    providerKey: OPENROUTER_PROVIDER_KEY,
    providerDisplayName: "OpenRouter",
    models: formattedModels,
  });

  const pricedCount = formattedModels.filter((model) => model.standardInputCostBelow200k !== undefined).length;
  await ctx.runMutation(internal.aiModels.internalUpdateProviderHealth, {
    providerKey: OPENROUTER_PROVIDER_KEY,
    displayName: "OpenRouter",
    status: "healthy",
    syncStatus: "catalog-synced",
    settings: JSON.stringify({
      lastHealthMessage: `Listed ${formattedModels.length} models from OpenRouter, ${pricedCount} with prices.`,
    }),
  });

  return formattedModels;
}

async function syncAnthropicModelCatalogue(ctx: ActionCtx) {
  const models = await listAnthropicModels();
  const formattedModels = models.map((model) => ({
    modelId: model.id,
    providerModelId: model.id,
    displayName: model.displayName || titleizeModelId(model.id),
    description: "Anthropic Claude text generation model available to this API key.",
    capabilities: getTextGenerationCapabilities(model.id),
    supportedUseCases: getTextGenerationUseCases(model.id),
  }));

  await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
    providerKey: ANTHROPIC_PROVIDER_KEY,
    providerDisplayName: "Anthropic",
    models: formattedModels,
  });

  return formattedModels;
}

export const syncGoogleModels = superAdminAction({
  args: {},
  handler: async (ctx) => {
    try {
      return await syncGoogleVertexModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync Google Vertex AI models: ${getErrorMessage(e)}`);
    }
  },
});

export const syncOpenAIModels = superAdminAction({
  args: {},
  handler: async (ctx) => {
    try {
      return await syncOpenAIModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync OpenAI models: ${getErrorMessage(e)}`);
    }
  },
});

export const syncOpenRouterModels = superAdminAction({
  args: {},
  handler: async (ctx) => {
    try {
      return await syncOpenRouterModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync OpenRouter models: ${getErrorMessage(e)}`);
    }
  },
});

export const syncAnthropicModels = superAdminAction({
  args: {},
  handler: async (ctx) => {
    try {
      return await syncAnthropicModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync Anthropic models: ${getErrorMessage(e)}`);
    }
  },
});

export const syncVertexModels = superAdminAction({
  args: {},
  handler: async (ctx) => {
    try {
      return await syncGoogleVertexModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync Vertex Models: ${getErrorMessage(e)}`);
    }
  },
});

export const testProviderConnection = superAdminAction({
  args: {
    providerKey: v.string(),
  },
  handler: async (ctx, args) => {
    const displayName = getProviderDisplayName(args.providerKey);

    try {
      let detail = "";

      if (args.providerKey === GOOGLE_VERTEX_PROVIDER_KEY) {
        // This used to build the credentials object and stop there, then report
        // "healthy" — so the badge meant "the environment variables parse" for
        // Vertex and "the API answered" for the other two. Same word, two very
        // different promises. It now calls Vertex, as the others call theirs.
        const config = buildVertexProviderConfig({
          env: {
            GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
            GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
            GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
            GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
          },
        });
        const models = await listVertexModels(createVertexGenAIClient());
        detail = `Connection ok. ${models.length.toLocaleString()} models visible in ${config.project}/${config.location}.`;
      } else if (args.providerKey === OPENAI_PROVIDER_KEY) {
        const models = await listOpenAIModels();
        detail = `Connection ok. ${models.length.toLocaleString()} models visible.`;
      } else if (args.providerKey === ANTHROPIC_PROVIDER_KEY) {
        const models = await listAnthropicModels();
        detail = `Connection ok. ${models.length.toLocaleString()} models visible.`;
      } else if (args.providerKey === OPENROUTER_PROVIDER_KEY) {
        const models = await listOpenRouterModels();
        detail = `Connection ok. ${models.length.toLocaleString()} models visible.`;
      } else {
        throw new Error(`Unsupported provider '${args.providerKey}'.`);
      }

      await ctx.runMutation(internal.aiModels.internalUpdateProviderHealth, {
        providerKey: args.providerKey,
        displayName,
        status: "healthy",
        syncStatus: "connection-ok",
        settings: JSON.stringify({ lastHealthMessage: detail }),
        // Testing a connection used to switch the provider on. A button that
        // reads as a read-only check must not change what the platform runs;
        // enabling is the toggle's job and it is one click away.
      });

      return { ok: true, providerKey: args.providerKey, message: detail };
    } catch (error) {
      const message = getErrorMessage(error);
      await ctx.runMutation(internal.aiModels.internalUpdateProviderHealth, {
        providerKey: args.providerKey,
        displayName,
        status: "error",
        syncStatus: "connection-error",
        settings: JSON.stringify({ lastHealthMessage: message }),
      });

      return { ok: false, providerKey: args.providerKey, message };
    }
  },
});
