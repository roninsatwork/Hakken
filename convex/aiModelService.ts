import type { Doc } from "./_generated/dataModel";

/**
 * Last-resort model identifier, used only when the catalogue holds nothing
 * enabled at all.
 *
 * This is a compiled-in provider model ID and it pins whatever generation was
 * current when it was written — so it is reached only after every
 * catalogue-driven path has been exhausted (see `getFirstEnabledModel`). On any
 * deployment with a single enabled model it is unreachable.
 *
 * It should not exist. The correct behaviour when nothing is configured is to
 * fail with "configure and enable an AI model", because routing to a guessed ID
 * turns a clear configuration error into an opaque provider 404. That change
 * affects agent creation as well as execution and is recorded as outstanding in
 * the plan rather than made as a side effect.
 */
export const SYSTEM_FAILSAFE_MODEL_ID = "gemini-2.5-flash";
export const GOOGLE_VERTEX_EMBEDDING_MODEL_ID = "text-embedding-004";
export const GOOGLE_VERTEX_EMBEDDING_DIMENSIONS = 768;
export const GOOGLE_VERTEX_PROVIDER_KEY = "google";
export const OPENAI_PROVIDER_KEY = "openai";
export const ANTHROPIC_PROVIDER_KEY = "anthropic";
export const EMBEDDING_MODEL_USE_CASE = "embedding";

export const DEFAULT_MODEL_USE_CASES = [
  "chat",
  "fast-chat",
  "reasoning",
  "agent",
  "workflow",
  "report",
  "router",
  "title",
  "transcription",
  EMBEDDING_MODEL_USE_CASE,
] as const;

export type AiModelUseCase = (typeof DEFAULT_MODEL_USE_CASES)[number] | string;

type AiModelSelection = Pick<
  Doc<"aiModels">,
  "modelId" | "isDefault" | "isEnabled" | "providerKey" | "providerModelId"
>;

export type ExecutionModelResolution = {
  modelId: string;
  providerKey: string;
  providerModelId: string;
  source: "requested" | "default" | "failsafe";
};

export function getActiveDefaultModel(models: AiModelSelection[]) {
  return models.find((model) => model.isDefault && model.isEnabled);
}

/**
 * Any enabled model, when no default is marked.
 *
 * The catalogue is the source of truth for what this deployment can actually
 * call. Reaching past it to a compiled-in identifier means running against a
 * model nobody configured — and, because that identifier pins a generation
 * chosen when it was written, one the provider may since have retired. A
 * retired ID does not fail as "no model configured"; it fails as an opaque 404
 * from the provider, several layers from the cause.
 */
export function getFirstEnabledModel(models: AiModelSelection[]) {
  return models.find((model) => model.isEnabled);
}

export function getDefaultModelId(models: AiModelSelection[]) {
  return getActiveDefaultModel(models)?.modelId
    ?? getFirstEnabledModel(models)?.modelId
    ?? SYSTEM_FAILSAFE_MODEL_ID;
}

function resolveModelMetadata(model: AiModelSelection) {
  return {
    modelId: model.modelId,
    providerKey: model.providerKey ?? GOOGLE_VERTEX_PROVIDER_KEY,
    providerModelId: model.providerModelId ?? model.modelId,
  };
}

export function resolveExecutionModel(args: {
  requestedModelId?: string;
  requestedModel?: AiModelSelection | null;
  defaultModels: AiModelSelection[];
}): ExecutionModelResolution {
  if (args.requestedModelId && args.requestedModel?.isEnabled) {
    return {
      ...resolveModelMetadata(args.requestedModel),
      source: "requested",
    };
  }

  const defaultModel = getActiveDefaultModel(args.defaultModels);
  if (defaultModel) {
    return {
      ...resolveModelMetadata(defaultModel),
      source: "default",
    };
  }

  // Prefer anything the deployment has actually enabled over the compiled-in
  // identifier below. A catalogue with models but no default marked is a
  // configuration gap, not a reason to call a model nobody chose.
  const enabledModel = getFirstEnabledModel(args.defaultModels);
  if (enabledModel) {
    return {
      ...resolveModelMetadata(enabledModel),
      source: "default",
    };
  }

  return {
    modelId: SYSTEM_FAILSAFE_MODEL_ID,
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerModelId: SYSTEM_FAILSAFE_MODEL_ID,
    source: "failsafe",
  };
}

export function getExecutionModelPool(models: AiModelSelection[]) {
  const enabledModelIds = models
    .filter((model) => model.isEnabled)
    .map((model) => model.modelId);

  return enabledModelIds.length > 0 ? enabledModelIds : [SYSTEM_FAILSAFE_MODEL_ID];
}

export function getProviderQualifiedModelId(providerKey: string, providerModelId: string) {
  return `${providerKey}:${providerModelId}`;
}

export function isGoogleVertexModelId(modelId: string) {
  const normalized = modelId.toLowerCase();

  return normalized.startsWith("gemini-") ||
    normalized.startsWith("text-embedding-") ||
    normalized.startsWith("imagen-") ||
    normalized.startsWith("veo-");
}

export function getGoogleVertexProviderModelId(
  config: Pick<ExecutionModelResolution, "providerKey" | "providerModelId">,
  runtimeLabel = "runtime"
) {
  if (config.providerKey !== GOOGLE_VERTEX_PROVIDER_KEY) {
    throw new Error(`AI provider '${config.providerKey}' is configured but ${runtimeLabel} requires a Google Vertex model.`);
  }

  return config.providerModelId;
}
