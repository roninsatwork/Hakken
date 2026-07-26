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
/**
 * The embedding model, and the region that serves it.
 *
 * This was `text-embedding-004`, which Google has since retired. Asking for it
 * returned a provider NOT_FOUND, and every caller wraps retrieval in a catch that
 * logs and continues — so the assistant carried on answering with no knowledge
 * attached, confidently and with no sign on any screen that it had stopped
 * consulting anything. Found while verifying company checks against the dev
 * deployment.
 *
 * `text-embedding-005` is the successor and produces 768 dimensions, so the vector
 * index keeps its shape and no schema change is needed. It is regional, though:
 * asked of Vertex, the `global` endpoint offers only `gemini-embedding-2`, while
 * `europe-west2` serves this one. Embeddings therefore pin their own location while
 * generation stays wherever it was — a single global location cannot serve both,
 * and moving generation to a region would strand the Gemini models that are
 * global-only.
 *
 * Changing this model invalidates existing vectors. Embeddings from two different
 * models are not comparable even at the same dimension count, so stored chunks must
 * be re-embedded; matching a new query vector against old stored ones returns
 * confident nonsense, which is worse than returning nothing.
 */
export const GOOGLE_VERTEX_EMBEDDING_MODEL_ID = "text-embedding-005";
export const GOOGLE_VERTEX_EMBEDDING_LOCATION = "europe-west2";
export const GOOGLE_VERTEX_EMBEDDING_DIMENSIONS = 768;
export const GOOGLE_VERTEX_PROVIDER_KEY = "google";
export const OPENAI_PROVIDER_KEY = "openai";
export const ANTHROPIC_PROVIDER_KEY = "anthropic";
export const OPENROUTER_PROVIDER_KEY = "openrouter";
export const EMBEDDING_MODEL_USE_CASE = "embedding";

/**
 * The jobs a model can be chosen for.
 *
 * `reasoning` was removed: it appeared on the Defaults screen and could be set,
 * but **no runtime call site ever asked for it**. Choosing a model for it did
 * nothing, which is worse than not offering the choice — a setting that appears
 * to work and does not is how a reader loses trust in the rest of the screen.
 *
 * Any `aiModelDefaults` row already written for it is simply never read. If a
 * reasoning path is added later, adding the entry back is all it takes.
 */
export const DEFAULT_MODEL_USE_CASES = [
  "chat",
  "fast-chat",
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

/**
 * The one string the catalogue search reads.
 *
 * A reader might type the friendly name they gave a model, the name the provider
 * publishes, the stable id, or the provider's own id. Those used to live in two
 * separate search indexes whose results had to be merged in memory, which is
 * what stopped the catalogue paging in the database at all.
 *
 * Duplicates are dropped so the field stays small: for a synced model the
 * display name is usually just the titleized id, so all four values collapse to
 * two or three.
 */
export function buildModelSearchText(model: {
  friendlyName?: string;
  displayName?: string;
  modelId?: string;
  providerModelId?: string;
}) {
  const parts = [model.friendlyName, model.displayName, model.modelId, model.providerModelId];
  const seen = new Set<string>();
  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
    // Ids are punctuated rather than spaced, and a reader searches for the
    // words inside them. Adding the spaced form means "otter" finds
    // "openai:quiet-otter" without depending on how the index happens to split
    // punctuation.
    const spaced = trimmed.replace(/[:/_.-]+/g, " ").trim();
    if (spaced && spaced !== trimmed) seen.add(spaced);
  }
  return Array.from(seen).join(" ");
}

/**
 * Which providers can actually serve a given job.
 *
 * Phase O made most of this platform provider-neutral, but not all of it, and
 * the difference matters to whoever is choosing a model. Two capabilities are
 * genuinely Google-only:
 *
 * - **embedding**, because the knowledge vector index is built at a fixed 768
 *   dimensions and changing that means re-embedding every document;
 * - **transcription**, because there is no neutral contract for audio.
 *
 * And two jobs need a provider with an *agent* adapter — streaming plus tool
 * calls — which is a higher bar than plain text generation.
 *
 * This lives here rather than in the registries because the screens need it too,
 * and the registries are Node-only. Keeping the answer in one place is what
 * stops the picker and the runtime disagreeing, which is the failure this
 * replaces: the screen offered any model for any job, and the reader found out
 * it could not run when it did not.
 */
const GOOGLE_ONLY_USE_CASES = new Set([EMBEDDING_MODEL_USE_CASE, "transcription"]);
const AGENT_CAPABLE_USE_CASES = new Set(["agent", "workflow"]);
const AGENT_CAPABLE_PROVIDER_KEYS = new Set([
  GOOGLE_VERTEX_PROVIDER_KEY,
  ANTHROPIC_PROVIDER_KEY,
  OPENROUTER_PROVIDER_KEY,
]);

export function canProviderServeUseCase(providerKey: string | undefined, useCase: string) {
  // A model with no provider key is a legacy row, treated as Google everywhere.
  const provider = providerKey ?? GOOGLE_VERTEX_PROVIDER_KEY;

  if (GOOGLE_ONLY_USE_CASES.has(useCase)) return provider === GOOGLE_VERTEX_PROVIDER_KEY;
  if (AGENT_CAPABLE_USE_CASES.has(useCase)) return AGENT_CAPABLE_PROVIDER_KEYS.has(provider);
  return true;
}

/**
 * Why a job's model list is shorter than the catalogue, in a sentence.
 *
 * Empty when there is no restriction. A short list with no explanation reads as
 * a bug; a short list with a reason reads as a constraint.
 */
export function describeUseCaseProviderLimit(useCase: string) {
  if (useCase === EMBEDDING_MODEL_USE_CASE) {
    return "Only Google models can do this job: the searchable index of your documents is built to their shape, and changing it would mean rebuilding every one.";
  }
  if (useCase === "transcription") {
    return "Only Google models can do this job on this platform.";
  }
  if (AGENT_CAPABLE_USE_CASES.has(useCase)) {
    return "Agents need a model that can use tools while it works, which not every provider offers.";
  }
  return "";
}

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

/**
 * Whether a model can be asked to produce text.
 *
 * An embedding model cannot, and asking one to is a provider 404 rather than a
 * graceful refusal. This existed as an assumption in the eval graders, which chose
 * "any other enabled model" — so on a deployment where an embedding model happened
 * to sort first, every model-graded eval failed with a NOT_FOUND that read as a
 * legitimate grading failure.
 *
 * Phrased as an exclusion of embedding-only models rather than a requirement for a
 * `text` capability, because much of the catalogue has no capability metadata at
 * all and requiring it would empty the pool.
 */
export function canGenerateText(model: {
  capabilities?: string[];
  supportedUseCases?: string[];
}) {
  const capabilities = model.capabilities ?? [];
  const useCases = model.supportedUseCases ?? [];

  if (capabilities.includes("text")) return true;
  if (capabilities.includes("embeddings")) return false;
  if (useCases.includes(EMBEDDING_MODEL_USE_CASE) && !useCases.includes("chat")) return false;

  return true;
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
