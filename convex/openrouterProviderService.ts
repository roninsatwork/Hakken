"use node";

/**
 * OpenRouter, as a provider.
 *
 * OpenRouter is a gateway rather than a model house: one key reaches hundreds of
 * models from many vendors, and its catalogue is the only one of ours that
 * publishes price, context length and modalities per model. That means models
 * synced from here arrive priced, which is what every other provider leaves an
 * admin to type in by hand.
 *
 * The wire format is OpenAI's chat-completions shape, so this mirrors
 * `openaiProviderService.ts` closely and uses the same neutral HTTP helper.
 */

import { OPENROUTER_PROVIDER_KEY } from "./aiModelService";
import { withProviderRetry } from "./aiProviderRetryService";
import { createOpenRouterStreamAccumulator, type OpenRouterStreamEvent } from "./openrouterMessageService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter } from "./aiRuntimeTypes";
import {
  assertTextOnlyContents,
  readProviderSseStream,
  requestProviderJson,
  type ProviderFetch,
} from "./providerHttpService";
import { appError } from "./utils/appError";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

type OpenRouterChatPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

type OpenRouterModelPayload = {
  data?: Array<{
    id?: string;
    name?: string;
    description?: string;
    context_length?: number;
    architecture?: {
      input_modalities?: string[];
      output_modalities?: string[];
    };
    supported_parameters?: string[];
    top_provider?: {
      max_completion_tokens?: number;
    };
    pricing?: {
      prompt?: string;
      completion?: string;
    };
  }>;
};

export type OpenRouterProviderEnv = {
  OPENROUTER_API_KEY?: string;
};

function getProcessOpenRouterEnv(): OpenRouterProviderEnv {
  return { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY };
}

export function buildOpenRouterProviderConfig(args: { env: OpenRouterProviderEnv }) {
  const apiKey = args.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw appError("NOT_CONFIGURED", "OpenRouter credentials are missing OPENROUTER_API_KEY.");
  }

  return {
    apiKey,
    chatUrl: `${OPENROUTER_BASE_URL}/chat/completions`,
    modelsUrl: `${OPENROUTER_BASE_URL}/models`,
  };
}

export function extractOpenRouterResponseText(payload: OpenRouterChatPayload) {
  return payload.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * OpenRouter quotes per token; this catalogue stores per million.
 *
 * The conversion is a multiplication by one million — the same factor that was
 * being applied in the wrong direction on the admin screens until it was found
 * and removed. It is done once, here, so no other part of the system has to know
 * that OpenRouter's unit differs from everyone else's.
 *
 * A price of "0" is a genuine answer for a free model, and is kept as 0 rather
 * than treated as missing.
 */
export function convertOpenRouterRateToPerMillion(rate: string | undefined) {
  if (rate === undefined || rate === null || rate === "") return undefined;
  const perToken = Number(rate);
  if (!Number.isFinite(perToken) || perToken < 0) return undefined;
  return perToken * 1_000_000;
}

/**
 * What this model can do, from what OpenRouter says rather than from its name.
 *
 * The other providers' capabilities are guessed from the model id, because
 * neither Vertex nor OpenAI reports them. OpenRouter does, so guessing here
 * would be choosing the worse source — and the existing guess is actively wrong
 * for this catalogue, tagging every id in the `openai/` namespace as a reasoning
 * model because it begins with "o".
 */
export function describeOpenRouterCapabilities(model: {
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
}) {
  const capabilities = new Set<string>(["text"]);
  const inputs = model.architecture?.input_modalities ?? [];
  const parameters = model.supported_parameters ?? [];

  if (inputs.includes("image")) capabilities.add("vision");
  if (inputs.includes("audio")) capabilities.add("audio");
  if (parameters.includes("tools") || parameters.includes("tool_choice")) capabilities.add("tool-calling");
  if (parameters.includes("response_format") || parameters.includes("structured_outputs")) capabilities.add("json-mode");
  if (parameters.includes("reasoning") || parameters.includes("include_reasoning")) capabilities.add("reasoning");

  return Array.from(capabilities);
}

/** The jobs a model can serve, derived from what it can do. */
export function describeOpenRouterUseCases(capabilities: string[]) {
  const useCases = ["chat", "fast-chat", "agent", "workflow", "report", "router", "title"];
  if (capabilities.includes("reasoning")) useCases.push("reasoning");
  if (capabilities.includes("vision")) useCases.push("vision");
  if (capabilities.includes("tool-calling")) useCases.push("tool-calling");
  return useCases;
}

export type OpenRouterCatalogueModel = {
  modelId: string;
  displayName: string;
  description?: string;
  capabilities: string[];
  supportedUseCases: string[];
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
};

export function toOpenRouterCatalogueModel(
  entry: NonNullable<OpenRouterModelPayload["data"]>[number],
): OpenRouterCatalogueModel | null {
  const modelId = entry.id?.trim();
  if (!modelId) return null;

  const capabilities = describeOpenRouterCapabilities(entry);

  return {
    modelId,
    // OpenRouter publishes a readable name; the id is the fallback rather than
    // something to titleize, because these ids are namespaced and titleizing
    // "vendor/model" produces nonsense.
    displayName: entry.name?.trim() || modelId,
    description: entry.description?.trim() || undefined,
    capabilities,
    supportedUseCases: describeOpenRouterUseCases(capabilities),
    contextWindowTokens: entry.context_length,
    maxOutputTokens: entry.top_provider?.max_completion_tokens,
    inputCostPerMillion: convertOpenRouterRateToPerMillion(entry.pricing?.prompt),
    outputCostPerMillion: convertOpenRouterRateToPerMillion(entry.pricing?.completion),
  };
}

export function createOpenRouterProviderAdapter(args: {
  env?: OpenRouterProviderEnv;
  fetchImpl?: ProviderFetch;
} = {}): AiProviderAdapter {
  const env = args.env ?? getProcessOpenRouterEnv();
  const config = buildOpenRouterProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;

  return {
    providerKey: OPENROUTER_PROVIDER_KEY,
    async generateText(request: AiGenerationRequest): Promise<AiGenerationResponse> {
      assertTextOnlyContents(request.contents, "OpenRouter");
      const userText = request.contents
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n");

      const messages = request.systemInstruction
        ? [
            { role: "system", content: request.systemInstruction },
            { role: "user", content: userText },
          ]
        : [{ role: "user", content: userText }];

      // With an onText listener the caller wants the words as they arrive;
      // without one the non-streaming call keeps its exact existing behaviour
      // (structured-output callers pass schemas, not listeners).
      if (request.onText) {
        return await streamOpenRouterText({
          apiKey: config.apiKey,
          chatUrl: config.chatUrl,
          fetchImpl,
          request,
          messages,
        });
      }

      const payload = await requestProviderJson({
        providerKey: OPENROUTER_PROVIDER_KEY,
        providerName: "OpenRouter",
        operation: "generateText",
        fetchImpl,
        url: config.chatUrl,
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model.providerModelId,
            messages,
            temperature: request.temperature,
            max_tokens: request.maxOutputTokens,
            // OpenRouter passes this through to whichever vendor serves the
            // model, so structured output works for any model that supports it.
            ...(request.jsonSchema
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: { name: "response", strict: false, schema: request.jsonSchema },
                  },
                }
              : {}),
          }),
        },
      }) as OpenRouterChatPayload;

      return {
        text: extractOpenRouterResponseText(payload),
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      };
    },
  };
}

/**
 * The streamed half of the adapter, imitating `openrouterAgentProvider`.
 *
 * Same wire, same accumulator, same retry rule: retry only while no fragment
 * has been delivered, because once the reader has seen text a retry would
 * replay the answer from the beginning.
 */
async function streamOpenRouterText(args: {
  apiKey: string;
  chatUrl: string;
  fetchImpl: ProviderFetch;
  request: AiGenerationRequest;
  messages: Array<{ role: string; content: string }>;
}): Promise<AiGenerationResponse> {
  const { request } = args;

  let delivered = false;
  const accumulator = createOpenRouterStreamAccumulator({
    onText: async (fragment) => {
      delivered = true;
      await request.onText?.(fragment);
    },
  });

  await withProviderRetry({
    providerKey: OPENROUTER_PROVIDER_KEY,
    providerName: "OpenRouter",
    operation: "generateText",
    shouldRetry: () => !delivered,
  }, async () => {
    const response = await args.fetchImpl(args.chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: request.model.providerModelId,
        stream: true,
        // Asked for explicitly: without it the final frame carries no usage,
        // and a reply with no token counts cannot be costed.
        stream_options: { include_usage: true },
        messages: args.messages,
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
      }),
    });

    await readProviderSseStream(response, "OpenRouter", (payload) =>
      accumulator.handle(payload as OpenRouterStreamEvent));
  });

  const result = accumulator.result();
  return {
    // Trimmed for parity with the single-write path's extraction.
    text: result.text.trim(),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

/**
 * The whole OpenRouter catalogue, with prices.
 *
 * The listing endpoint is public, but the key is still sent when present so the
 * response reflects anything account-specific.
 */
export async function listOpenRouterModels(args: {
  env?: OpenRouterProviderEnv;
  fetchImpl?: ProviderFetch;
} = {}): Promise<OpenRouterCatalogueModel[]> {
  const env = args.env ?? getProcessOpenRouterEnv();
  const config = buildOpenRouterProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;

  const payload = await requestProviderJson({
    providerKey: OPENROUTER_PROVIDER_KEY,
    providerName: "OpenRouter",
    operation: "listModels",
    fetchImpl,
    url: config.modelsUrl,
    init: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    retryPolicy: { maxAttempts: 3 },
  }) as OpenRouterModelPayload;

  return (payload.data ?? [])
    .map(toOpenRouterCatalogueModel)
    .filter((model): model is OpenRouterCatalogueModel => model !== null);
}
