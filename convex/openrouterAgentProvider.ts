"use node";

/**
 * OpenRouter behind the neutral agent-provider contract.
 *
 * Level 1 (`openrouterProviderService`) made OpenRouter a catalogue provider and
 * gave it the plain text path — chat replies, thread titles, memory suggestions.
 * That is three of the ten jobs. The objective loop needs streaming *and* tool
 * calls, which is a different contract, so it needs this.
 *
 * Nothing here parses SSE or accumulates a turn: that lives in
 * `openrouterMessageService` as pure functions, so the translation can be tested
 * without a network call. This file is HTTP, streaming and retry.
 *
 * Caching needs no special handling. `promptCacheService` defaults an unknown
 * provider to automatic prefix caching, which is exactly how OpenRouter behaves
 * — so `cacheName` is ignored and neither `createPromptCache` nor
 * `releasePromptCache` is implemented, rather than being stubbed out to do
 * nothing.
 */

import { OPENROUTER_PROVIDER_KEY } from "./aiModelService";
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
  AgentStreamOptions,
  AgentTurnRequest,
  AgentTurnResponse,
} from "./agentProviderTypes";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

export function createOpenRouterAgentProvider(args: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
} = {}): AgentProviderAdapter {
  const apiKey = args.apiKey ?? process.env.OPENROUTER_API_KEY;
  const fetchImpl = args.fetchImpl ?? fetch;

  return {
    providerKey: OPENROUTER_PROVIDER_KEY,

    async streamTurn(request: AgentTurnRequest, options: AgentStreamOptions): Promise<AgentTurnResponse> {
      if (!apiKey) {
        throw new Error("OpenRouter credentials are missing OPENROUTER_API_KEY.");
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
        max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: request.temperature,
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
        providerKey: OPENROUTER_PROVIDER_KEY,
        providerName: "OpenRouter",
        operation: options.operation ?? "agentStreamTurn",
        // Once the reader has seen text, a retry would replay the answer from
        // the beginning and duplicate what is already on screen — the rule both
        // other streaming paths follow.
        shouldRetry: () => !delivered,
      }, async () => {
        const response = await fetchImpl(OPENROUTER_CHAT_URL, {
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
          throw new Error(`OpenRouter request failed (${response.status}): ${detail.slice(0, 500)}`);
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
