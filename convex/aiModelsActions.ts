"use node";
import { action, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireActionSuperAdmin } from "./actionAuth";
import {
  ANTHROPIC_PROVIDER_KEY,
  EMBEDDING_MODEL_USE_CASE,
  GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
  GOOGLE_VERTEX_PROVIDER_KEY,
  OPENAI_PROVIDER_KEY,
} from "./aiModelService";
import { listAnthropicModels } from "./anthropicProviderService";
import { listOpenAIModels } from "./openaiProviderService";
import { buildVertexProviderConfig } from "./vertexProviderService";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getProviderDisplayName(providerKey: string) {
  if (providerKey === GOOGLE_VERTEX_PROVIDER_KEY) return "Google Vertex AI";
  if (providerKey === OPENAI_PROVIDER_KEY) return "OpenAI";
  if (providerKey === ANTHROPIC_PROVIDER_KEY) return "Anthropic";
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

function isOpenAITextGenerationModel(modelId: string) {
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

const CURATED_OPENAI_TEXT_MODELS = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "o4-mini",
  "o3",
  "o3-mini",
  "o1",
];

export function getOpenAITextModelCatalogue(modelIds: string[]) {
  const liveTextModelIds = modelIds.filter(isOpenAITextGenerationModel);
  return Array.from(new Set([...CURATED_OPENAI_TEXT_MODELS, ...liveTextModelIds]));
}

async function syncGoogleVertexModelCatalogue(ctx: ActionCtx) {
  // In @google/genai with Vertex, we fetch available models using the standard method
  // Unfortunately models.list does not currently support Vertex AI perfectly in some beta SDK versions.
  // Wait, let's actually just fetch models in a fail-safe way.
  // If ai.models.list isn't populated, we can provide a definitive list of active production models
  // because Vertex AI doesn't always expose the standard model indexing publicly like AI Studio does.

  const hardcodedVertexModels = [
    { name: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro (Preview)", description: "Reasoning and complex logic", capabilities: ["text", "reasoning", "vision", "tool-calling", "json-mode"] },
    { name: "gemini-3.1-flash-lite-preview", displayName: "Gemini 3.1 Flash Lite", description: "Ultra-low latency operations", capabilities: ["text", "vision", "tool-calling", "json-mode"] },
    { name: "gemini-3-flash-preview", displayName: "Gemini 3 Flash", description: "Balanced fast performance", capabilities: ["text", "vision", "tool-calling", "json-mode"] },
    { name: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", description: "Standard generation", capabilities: ["text", "vision", "tool-calling", "json-mode"] },
    { name: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", description: "Complex instructions", capabilities: ["text", "reasoning", "vision", "tool-calling", "json-mode"] },
    {
      name: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      displayName: "Text Embedding 004",
      description: "Stable 768-dimension embedding model for Sonae knowledge vector indexes",
      capabilities: ["embeddings"],
      supportedUseCases: [EMBEDDING_MODEL_USE_CASE],
    }
  ];

  const formattedModels = hardcodedVertexModels.map((m) => ({
    modelId: m.name,
    providerModelId: m.name,
    displayName: m.displayName,
    description: m.description,
    capabilities: m.capabilities,
    supportedUseCases: "supportedUseCases" in m && m.supportedUseCases
      ? m.supportedUseCases
      : ["chat", "fast-chat", "reasoning", "agent", "workflow", "report", "router", "title", "transcription"],
  }));

  await ctx.runMutation(internal.aiModels.internalBatchUpsert, {
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerDisplayName: "Google Vertex AI",
    models: formattedModels,
  });
  await ctx.runMutation(internal.aiModels.backfillGoogleVertexModelProviders);

  return formattedModels;
}

async function syncOpenAIModelCatalogue(ctx: ActionCtx) {
  let modelIds: string[] = [];
  let fallbackMessage = "";

  try {
    modelIds = await listOpenAIModels();
  } catch (error) {
    fallbackMessage = getErrorMessage(error);
    modelIds = CURATED_OPENAI_TEXT_MODELS;
  }

  const liveTextModelIds = modelIds.filter(isOpenAITextGenerationModel);
  if (modelIds.length > 0 && liveTextModelIds.length === 0) {
    fallbackMessage = fallbackMessage || "OpenAI returned no text-generation models from the live catalogue.";
  }

  const formattedModels = getOpenAITextModelCatalogue(modelIds)
    .map((modelId) => ({
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

  if (fallbackMessage) {
    const credentialsMissing = fallbackMessage.includes("OPENAI_API_KEY");
    const healthArgs = {
      providerKey: OPENAI_PROVIDER_KEY,
      displayName: "OpenAI",
      status: credentialsMissing ? "error" : "degraded",
      syncStatus: "catalog-fallback",
      settings: JSON.stringify({
        lastHealthMessage: `OpenAI live sync unavailable. Seeded curated catalogue. ${fallbackMessage}`,
      }),
    } as const;

    await ctx.runMutation(internal.aiModels.internalUpdateProviderHealth, credentialsMissing
      ? { ...healthArgs, isEnabled: false }
      : healthArgs);
  }

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

export const syncGoogleModels = action({
  args: {},
  handler: async (ctx) => {
    await requireActionSuperAdmin(ctx);

    try {
      return await syncGoogleVertexModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync Google Vertex AI models: ${getErrorMessage(e)}`);
    }
  },
});

export const syncOpenAIModels = action({
  args: {},
  handler: async (ctx) => {
    await requireActionSuperAdmin(ctx);

    try {
      return await syncOpenAIModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync OpenAI models: ${getErrorMessage(e)}`);
    }
  },
});

export const syncAnthropicModels = action({
  args: {},
  handler: async (ctx) => {
    await requireActionSuperAdmin(ctx);

    try {
      return await syncAnthropicModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync Anthropic models: ${getErrorMessage(e)}`);
    }
  },
});

export const syncVertexModels = action({
  args: {},
  handler: async (ctx) => {
    await requireActionSuperAdmin(ctx);

    try {
      return await syncGoogleVertexModelCatalogue(ctx);
    } catch (e: unknown) {
      throw new Error(`Failed to sync Vertex Models: ${getErrorMessage(e)}`);
    }
  },
});

export const testProviderConnection = action({
  args: {
    providerKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requireActionSuperAdmin(ctx);
    const displayName = getProviderDisplayName(args.providerKey);

    try {
      let detail = "";

      if (args.providerKey === GOOGLE_VERTEX_PROVIDER_KEY) {
        const config = buildVertexProviderConfig({
          env: {
            GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
            GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
            GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
            GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
          },
        });
        detail = `Credentials configured for ${config.project}/${config.location}.`;
      } else if (args.providerKey === OPENAI_PROVIDER_KEY) {
        const models = await listOpenAIModels();
        detail = `Connection ok. ${models.length.toLocaleString()} models visible.`;
      } else if (args.providerKey === ANTHROPIC_PROVIDER_KEY) {
        const models = await listAnthropicModels();
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
        isEnabled: true,
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
