"use node";

import { OPENAI_PROVIDER_KEY } from "./aiModelService";
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

export function getOpenAIApiKey(env: OpenAIProviderEnv) {
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
    throw appError("NOT_CONFIGURED", "OpenAI credentials are missing OPENAI_API_KEY.");
  }

  return {
    apiKey,
    baseUrl: "https://api.openai.com/v1/responses",
    // Streaming goes over chat completions — the wire the agent adapter
    // already streams on — while schema and no-listener calls stay on the
    // Responses API above.
    chatUrl: "https://api.openai.com/v1/chat/completions",
  };
}

/**
 * OpenAI's reasoning-family models reject the temperature parameter outright
 * ("Unsupported parameter: 'temperature' is not supported with this model").
 * Which models do this is not knowable from the catalogue, so the honest
 * handling is: send what was asked for, and if the model refuses the
 * parameter, ask again without it rather than failing the whole call. This
 * broke every thread title on such models before it was caught.
 */
export function isOpenAITemperatureRejection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unsupported parameter[^]*temperature|['"]temperature['"] is not supported/i.test(message);
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

      // With an onText listener the caller wants the words as they arrive;
      // without one the non-streaming call keeps its exact existing behaviour
      // (structured-output callers pass schemas, not listeners).
      if (request.onText) {
        return await streamOpenAIText({
          apiKey: config.apiKey,
          chatUrl: config.chatUrl,
          fetchImpl,
          request,
          messages: request.systemInstruction
            ? [
                { role: "system", content: request.systemInstruction },
                { role: "user", content: input },
              ]
            : [{ role: "user", content: input }],
        });
      }

      const requestBody = (withTemperature: boolean) => JSON.stringify({
        model: request.model.providerModelId,
        input: request.systemInstruction
          ? [
              { role: "system", content: request.systemInstruction },
              { role: "user", content: input },
            ]
          : input,
        ...(withTemperature && request.temperature !== undefined
          ? { temperature: request.temperature }
          : {}),
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
      });

      const call = (withTemperature: boolean) => requestProviderJson({
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
          body: requestBody(withTemperature),
        },
      }) as Promise<OpenAIResponsesPayload>;

      let payload: OpenAIResponsesPayload;
      try {
        payload = await call(true);
      } catch (error) {
        // A model that refuses the temperature parameter gets the call again
        // without it — the caller asked for an answer, not for a knob.
        if (request.temperature !== undefined && isOpenAITemperatureRejection(error)) {
          payload = await call(false);
        } else {
          throw error;
        }
      }

      return {
        text: extractOpenAIResponseText(payload),
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      };
    },
  };
}

/**
 * The streamed half of the adapter, imitating `openaiAgentProvider`.
 *
 * OpenAI's chat-completions stream is byte-for-byte the OpenRouter shape, so
 * the accumulator is shared. Same retry rule as every streaming path: retry
 * only while no fragment has been delivered, because once the reader has seen
 * text a retry would replay the answer from the beginning.
 */
async function streamOpenAIText(args: {
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

  const streamOnce = (withTemperature: boolean) => withProviderRetry({
    providerKey: OPENAI_PROVIDER_KEY,
    providerName: "OpenAI",
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
        ...(withTemperature && request.temperature !== undefined
          ? { temperature: request.temperature }
          : {}),
        max_completion_tokens: request.maxOutputTokens,
      }),
    });

    await readProviderSseStream(response, "OpenAI", (payload) =>
      accumulator.handle(payload as OpenRouterStreamEvent));
  });

  try {
    await streamOnce(true);
  } catch (error) {
    // Same rule as the single-write path: a model that refuses the
    // temperature parameter gets the call again without it. Safe here only
    // because the refusal arrives before any fragment is delivered.
    if (!delivered && request.temperature !== undefined && isOpenAITemperatureRejection(error)) {
      await streamOnce(false);
    } else {
      throw error;
    }
  }

  const result = accumulator.result();
  return {
    // Trimmed for parity with the single-write path's extraction.
    text: result.text.trim(),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
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
