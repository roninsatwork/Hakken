"use node";

import { OPENAI_PROVIDER_KEY } from "./aiModelService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter } from "./aiRuntimeTypes";
import { assertTextOnlyContents, parseProviderJsonResponse, type ProviderFetch } from "./providerHttpService";

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
};

export function buildOpenAIProviderConfig(args: { env: OpenAIProviderEnv }) {
  if (!args.env.OPENAI_API_KEY) {
    throw new Error("OpenAI credentials are missing OPENAI_API_KEY.");
  }

  return {
    apiKey: args.env.OPENAI_API_KEY,
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
  const env = args.env ?? { OPENAI_API_KEY: process.env.OPENAI_API_KEY };
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

      const response = await fetchImpl(config.baseUrl, {
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
        }),
      });

      const payload = await parseProviderJsonResponse(response, "OpenAI") as OpenAIResponsesPayload;
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
  const env = args.env ?? { OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  const config = buildOpenAIProviderConfig({ env });
  const fetchImpl = args.fetchImpl ?? fetch;

  const response = await fetchImpl("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });
  const payload = await parseProviderJsonResponse(response, "OpenAI") as OpenAIModelListPayload;

  return (payload.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}
