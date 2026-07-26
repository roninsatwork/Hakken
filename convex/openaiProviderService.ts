"use node";

import { OPENAI_PROVIDER_KEY } from "./aiModelService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter } from "./aiRuntimeTypes";
import { assertTextOnlyContents, requestProviderJson, type ProviderFetch } from "./providerHttpService";

type OpenAIResponsesPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type OpenAIModelListPayload = {
  data?: Array<{
    id?: string;
  }>;
};

export type OpenAIProviderEnv = {
  OPENAI_API_KEY?: string;
  OPEN_AI_API_KEY?: string;
  OPENAI_KEY?: string;
};

function getOpenAIApiKey(env: OpenAIProviderEnv) {
  return env.OPENAI_API_KEY?.trim() || env.OPEN_AI_API_KEY?.trim() || env.OPENAI_KEY?.trim();
}

function getProcessOpenAIEnv(): OpenAIProviderEnv {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPEN_AI_API_KEY: process.env.OPEN_AI_API_KEY,
    OPENAI_KEY: process.env.OPENAI_KEY,
  };
}

export function buildOpenAIProviderConfig(args: { env: OpenAIProviderEnv }) {
  const apiKey = getOpenAIApiKey(args.env);

  if (!apiKey) {
    throw new Error("OpenAI credentials are missing OPENAI_API_KEY.");
  }

  return {
    apiKey,
    baseUrl: "https://api.openai.com/v1/responses",
  };
}

export function extractOpenAIResponseText(payload: OpenAIResponsesPayload) {
  if (payload.output_text) return payload.output_text;

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim() ?? "";
}

export function createOpenAIProviderAdapter(args: {
  env?: OpenAIProviderEnv;
  fetchImpl?: ProviderFetch;
} = {}): AiProviderAdapter {
  const env = args.env ?? getProcessOpenAIEnv();
  const config = buildOpenAIProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;

  return {
    providerKey: OPENAI_PROVIDER_KEY,
    async generateText(request: AiGenerationRequest): Promise<AiGenerationResponse> {
      assertTextOnlyContents(request.contents, "OpenAI");
      const input = request.contents
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n");

      const payload = await requestProviderJson({
        providerKey: OPENAI_PROVIDER_KEY,
        providerName: "OpenAI",
        operation: "generateText",
        fetchImpl,
        url: config.baseUrl,
        init: {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model.providerModelId,
            input: request.systemInstruction
              ? [
                  { role: "system", content: request.systemInstruction },
                  { role: "user", content: input },
                ]
              : input,
            temperature: request.temperature,
            max_output_tokens: request.maxOutputTokens,
            ...(request.jsonSchema
              ? {
                  text: {
                    format: {
                      type: "json_schema",
                      name: "response",
                      strict: false,
                      schema: request.jsonSchema,
                    },
                  },
                }
              : {}),
          }),
        },
      }) as OpenAIResponsesPayload;
      return {
        text: extractOpenAIResponseText(payload),
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      };
    },
  };
}

export async function listOpenAIModels(args: {
  env?: OpenAIProviderEnv;
  fetchImpl?: ProviderFetch;
} = {}) {
  const env = args.env ?? getProcessOpenAIEnv();
  const config = buildOpenAIProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;

  const payload = await requestProviderJson({
    providerKey: OPENAI_PROVIDER_KEY,
    providerName: "OpenAI",
    operation: "listModels",
    fetchImpl,
    url: "https://api.openai.com/v1/models",
    init: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    },
    retryPolicy: {
      maxAttempts: 3,
    },
  }) as OpenAIModelListPayload;

  return (payload.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}
