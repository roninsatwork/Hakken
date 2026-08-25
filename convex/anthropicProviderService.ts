"use node";

import { ANTHROPIC_PROVIDER_KEY } from "./aiModelService";
import { withProviderRetry } from "./aiProviderRetryService";
import { createAnthropicStreamAccumulator, type AnthropicStreamEvent } from "./anthropicStreamService";
import type { AiGenerationRequest, AiGenerationResponse, AiProviderAdapter } from "./aiRuntimeTypes";
import {
  assertTextOnlyContents,
  readProviderSseStream,
  requestProviderJson,
  type ProviderFetch,
} from "./providerHttpService";
import { appError } from "./utils/appError";

const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

type AnthropicMessagesPayload = {
  content?: Array<{
    type?: string;
    text?: string;
    /** Present on `tool_use` blocks, which is how structured output arrives. */
    name?: string;
    input?: unknown;
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
    throw appError("NOT_CONFIGURED", "Anthropic credentials are missing ANTHROPIC_API_KEY.");
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

/**
 * Structured output, the way Anthropic supports it.
 *
 * The Messages API has no `response_format`. The documented technique is to
 * offer a single tool whose input schema *is* the shape you want and force the
 * model to call it, then read the arguments it passed. Asking politely for JSON
 * in the prompt is the alternative, and it fails silently when the model wraps
 * the answer in prose.
 */
const STRUCTURED_RESPONSE_TOOL = "structured_response";

export function extractAnthropicStructuredJson(payload: AnthropicMessagesPayload) {
  const toolUse = payload.content?.find(
    (part) => part.type === "tool_use" && part.name === STRUCTURED_RESPONSE_TOOL,
  );
  if (!toolUse || toolUse.input === undefined) return "";
  return JSON.stringify(toolUse.input);
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

      // With an onText listener the caller wants the words as they arrive;
      // without one the non-streaming call keeps its exact existing behaviour
      // (structured-output callers pass schemas, not listeners).
      if (request.onText) {
        return await streamAnthropicText({ config, fetchImpl, request, input });
      }

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
            ...(request.jsonSchema
              ? {
                  tools: [{
                    name: STRUCTURED_RESPONSE_TOOL,
                    description: "Return the answer in the required structure.",
                    input_schema: request.jsonSchema,
                  }],
                  tool_choice: { type: "tool", name: STRUCTURED_RESPONSE_TOOL },
                }
              : {}),
          }),
        },
      }) as AnthropicMessagesPayload;
      return {
        text: request.jsonSchema
          ? extractAnthropicStructuredJson(payload)
          : extractAnthropicResponseText(payload),
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      };
    },
  };
}

/**
 * The streamed half of the adapter, imitating `anthropicAgentProvider`.
 *
 * Same wire, same accumulator, same retry rule: retry only while no fragment
 * has been delivered, because once the reader has seen text a retry would
 * replay the answer from the beginning.
 */
async function streamAnthropicText(args: {
  config: ReturnType<typeof buildAnthropicProviderConfig>;
  fetchImpl: ProviderFetch;
  request: AiGenerationRequest;
  input: string;
}): Promise<AiGenerationResponse> {
  const { request } = args;

  let delivered = false;
  const accumulator = createAnthropicStreamAccumulator({
    onText: async (fragment) => {
      delivered = true;
      await request.onText?.(fragment);
    },
  });

  await withProviderRetry({
    providerKey: ANTHROPIC_PROVIDER_KEY,
    providerName: "Anthropic",
    operation: "generateText",
    shouldRetry: () => !delivered,
  }, async () => {
    const response = await args.fetchImpl(args.config.baseUrl, {
      method: "POST",
      headers: {
        "x-api-key": args.config.apiKey,
        "anthropic-version": args.config.apiVersion,
        "Content-Type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: request.model.providerModelId,
        stream: true,
        // Anthropic requires max_tokens; the same default the single-write
        // path uses.
        max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
        system: request.systemInstruction,
        temperature: request.temperature,
        messages: [{ role: "user", content: args.input }],
      }),
    });

    await readProviderSseStream(response, "Anthropic", (payload) =>
      accumulator.handle(payload as AnthropicStreamEvent));
  });

  const result = accumulator.result();
  return {
    // Trimmed for parity with the single-write path's extraction.
    text: result.text.trim(),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
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
