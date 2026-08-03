"use node";

/**
 * OpenAI behind the neutral agent-provider contract.
 *
 * The message shapes here are imported from `openrouterMessageService`, and
 * that is not a shortcut wearing a disguise: the wire dialect is OpenAI's own
 * chat-completions format, which OpenRouter mimics. The mimic's adapter simply
 * landed first. The pure translation — runtime turns to messages, tool
 * declarations, the stream accumulator, finish reasons — is byte-for-byte the
 * same protocol, so sharing it is what keeps the two from drifting apart.
 *
 * Caching needs no special handling: OpenAI caches long stable prefixes
 * automatically and reports what it reused in `prompt_tokens_details`, which
 * the shared accumulator already reads. So `cacheName` is ignored and neither
 * `createPromptCache` nor `releasePromptCache` is implemented — the same
 * posture as OpenRouter, for the same reason.
 *
 * Hosted web search is deliberately not requested. OpenAI ties it to dedicated
 * search models, and sending the option to any other model rejects the whole
 * request — a run dying because of a toggle is worse than the toggle doing
 * nothing here. Agents still reach the web through the platform's own web
 * tools, which is how the research agent actually reads pages on every
 * provider.
 */

import { OPENAI_PROVIDER_KEY } from "./aiModelService";
import { withProviderRetry } from "./aiProviderRetryService";
import {
  createOpenRouterStreamAccumulator,
  interpretOpenRouterFinishReason,
  toOpenRouterMessages,
  toOpenRouterTools,
  type OpenRouterMessage,
  type OpenRouterStreamEvent,
} from "./openrouterMessageService";
import { parseProviderSseChunk } from "./providerHttpService";
import type {
  AgentProviderAdapter,
  AgentReasoningEffort,
  AgentStreamOptions,
  AgentTurnRequest,
  AgentTurnResponse,
} from "./agentProviderTypes";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/**
 * The agent's three levels in OpenAI's own term.
 *
 * `reasoning_effort` is how OpenAI's reasoning-capable models take the
 * setting; models that cannot reason ignore it rather than failing.
 */
const OPENAI_REASONING_EFFORT: Record<AgentReasoningEffort, "low" | "medium" | "high"> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

/** What this turn asks for beyond the transcript, built where it can be read. */
export function buildOpenAITurnOptions(request: {
  reasoningEffort?: AgentReasoningEffort;
  responseJsonSchema?: Record<string, unknown>;
  hasTools?: boolean;
}) {
  return {
    // OpenAI rejects the combination of function tools and reasoning on some
    // models in this API — the first live agent turn failed with exactly that
    // 400, whose message names the way through: *"To use function tools, use
    // /v1/responses or set reasoning_effort to 'none'."* Omitting the field is
    // not enough, because the model reasons by default. An agent's job is its
    // tools, so tools force 'none' rather than failing the run. Porting this
    // adapter to /v1/responses would give these models reasoning and tools
    // together; until then this is the provider's own sanctioned shape.
    ...(request.hasTools
      ? { reasoning_effort: "none" as const }
      : request.reasoningEffort
        ? { reasoning_effort: OPENAI_REASONING_EFFORT[request.reasoningEffort] }
        : {}),
    ...(request.responseJsonSchema
      ? {
        response_format: {
          type: "json_schema" as const,
          json_schema: { name: "agent_response", strict: true, schema: request.responseJsonSchema },
        },
      }
      : {}),
  };
}

export function createOpenAIAgentProvider(args: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
} = {}): AgentProviderAdapter {
  const apiKey = args.apiKey
    ?? process.env.OPENAI_API_KEY?.trim()
    ?? process.env.OPEN_AI_API_KEY?.trim()
    ?? process.env.OPENAI_KEY?.trim();
  const fetchImpl = args.fetchImpl ?? fetch;

  return {
    providerKey: OPENAI_PROVIDER_KEY,

    async streamTurn(request: AgentTurnRequest, options: AgentStreamOptions): Promise<AgentTurnResponse> {
      if (!apiKey) {
        throw new Error("OpenAI credentials are missing OPENAI_API_KEY.");
      }

      const messages: OpenRouterMessage[] = [
        ...(request.systemInstruction
          ? [{ role: "system" as const, content: request.systemInstruction }]
          : []),
        ...toOpenRouterMessages(request.turns),
      ];
      const tools = toOpenRouterTools(request.tools);

      const body = JSON.stringify({
        model: request.model.providerModelId,
        stream: true,
        // Asked for explicitly: without it the final frame carries no usage, and
        // a run with no token counts cannot be costed or budgeted.
        stream_options: { include_usage: true },
        max_completion_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: request.temperature,
        ...buildOpenAITurnOptions({
          reasoningEffort: request.reasoningEffort,
          responseJsonSchema: request.responseJsonSchema,
          hasTools: tools.length > 0,
        }),
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });

      let delivered = false;
      const accumulator = createOpenRouterStreamAccumulator({
        onText: async (fragment) => {
          delivered = true;
          await options.onText?.(fragment);
        },
      });

      await withProviderRetry({
        providerKey: OPENAI_PROVIDER_KEY,
        providerName: "OpenAI",
        operation: options.operation ?? "agentStreamTurn",
        // Once the reader has seen text, a retry would replay the answer from
        // the beginning and duplicate what is already on screen — the rule
        // every streaming path follows.
        shouldRetry: () => !delivered,
      }, async () => {
        const response = await fetchImpl(OPENAI_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body,
        });

        if (!response.ok || !response.body) {
          const detail = response.ok ? "no response body" : await response.text();
          throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 500)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // `stream: true` keeps multi-byte characters intact across chunk
          // boundaries; decoding each chunk on its own would corrupt any
          // character split between two of them.
          const chunk = decoder.decode(value, { stream: true });
          const parsed = parseProviderSseChunk(chunk, buffer);
          buffer = parsed.remainder;
          for (const payload of parsed.payloads) {
            await accumulator.handle(payload as OpenRouterStreamEvent);
          }
        }
      });

      const result = accumulator.result();
      const interpreted = interpretOpenRouterFinishReason(result.finishReason);

      return {
        text: result.text,
        toolCalls: result.toolCalls,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cachedInputTokens: result.cachedInputTokens,
        // A finish reason of `tool_calls` and the presence of calls should
        // agree; trusting the calls keeps the loop consistent if they ever
        // do not.
        outcome: result.toolCalls.length > 0 ? "RUN_TOOLS" : interpreted.action,
      };
    },
  };
}
