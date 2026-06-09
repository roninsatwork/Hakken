"use node";

import { ANTHROPIC_PROVIDER_KEY } from "./aiModelService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter } from "./aiRuntimeTypes";
import { assertTextOnlyContents, requestProviderJson, type ProviderFetch } from "./providerHttpService";

const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

type AnthropicMessagesPayload = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type AnthropicModelListPayload = {
  data?: Array<{
    id?: string;
    display_name?: string;
  }>;
};

export type AnthropicProviderEnv = {
  ANTHROPIC_API_KEY?: string;
};

export function buildAnthropicProviderConfig(args: { env: AnthropicProviderEnv }) {
  if (!args.env.ANTHROPIC_API_KEY) {
    throw new Error("Anthropic credentials are missing ANTHROPIC_API_KEY.");
  }

  return {
    apiKey: args.env.ANTHROPIC_API_KEY,
    baseUrl: "https://api.anthropic.com/v1/messages",
    apiVersion: ANTHROPIC_API_VERSION,
  };
}

export function extractAnthropicResponseText(payload: AnthropicMessagesPayload) {
  return payload.content
    ?.filter((part) => part.type === "text" || typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("")
    .trim() ?? "";
}

export function createAnthropicProviderAdapter(args: {
  env?: AnthropicProviderEnv;
  fetchImpl?: ProviderFetch;
} = {}): AiProviderAdapter {
  const env = args.env ?? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  const config = buildAnthropicProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;

  return {
    providerKey: ANTHROPIC_PROVIDER_KEY,
    async generateText(request: AiGenerationRequest): Promise<AiGenerationResponse> {
      assertTextOnlyContents(request.contents, "Anthropic");
      const input = request.contents
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n");

      const payload = await requestProviderJson({
        providerKey: ANTHROPIC_PROVIDER_KEY,
        providerName: "Anthropic",
        operation: "generateText",
        fetchImpl,
        url: config.baseUrl,
        init: {
          method: "POST",
          headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": config.apiVersion,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model.providerModelId,
            max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
            system: request.systemInstruction,
            temperature: request.temperature,
            messages: [{ role: "user", content: input }],
          }),
        },
      }) as AnthropicMessagesPayload;
      return {
        text: extractAnthropicResponseText(payload),
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      };
    },
  };
}

export async function listAnthropicModels(args: {
  env?: AnthropicProviderEnv;
  fetchImpl?: ProviderFetch;
} = {}) {
  const env = args.env ?? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  const config = buildAnthropicProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;

  const payload = await requestProviderJson({
    providerKey: ANTHROPIC_PROVIDER_KEY,
    providerName: "Anthropic",
    operation: "listModels",
    fetchImpl,
    url: `${config.baseUrl.replace("/messages", "/models")}?limit=1000`,
    init: {
      method: "GET",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": config.apiVersion,
      },
    },
    retryPolicy: {
      maxAttempts: 3,
    },
  }) as AnthropicModelListPayload;

  const models: Array<{ id: string; displayName?: string }> = [];
  for (const model of payload.data ?? []) {
    if (typeof model.id === "string" && model.id.trim().length > 0) {
      models.push(typeof model.display_name === "string"
        ? { id: model.id, displayName: model.display_name }
        : { id: model.id });
    }
  }

  return models;
}
