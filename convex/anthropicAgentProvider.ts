"use node";

import { ANTHROPIC_PROVIDER_KEY } from "./aiModelService";
import { withProviderRetry } from "./aiProviderRetryService";
import {
  applyAnthropicCacheControl,
  extractAnthropicText,
  interpretAnthropicStopReason,
  toAnthropicMessages,
  toAnthropicTools,
} from "./anthropicMessageService";
import {
  createAnthropicStreamAccumulator,
  parseSseChunk,
} from "./anthropicStreamService";
import type {
  AgentProviderAdapter,
  AgentStreamOptions,
  AgentTurnRequest,
  AgentTurnResponse,
} from "./agentProviderTypes";

/**
 * Anthropic behind the neutral agent-provider contract.
 *
 * The repo carries no Anthropic SDK, so this speaks the Messages API over raw
 * HTTP: build the request from the translation service, stream the response
 * through the accumulator, and hand back the same normalised shape the Google
 * adapter returns.
 *
 * Caching is expressed differently here. Google uploads the prefix as a cache
 * object referenced by name; Anthropic marks it inline with `cache_control`
 * breakpoints on the last tool and the last system block, which — given it
 * renders tools → system → messages — covers the whole stable prefix. So this
 * adapter ignores `cacheName` and marks the request itself.
 */

const ANTHROPIC_API_VERSION = "2023-06-01";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

export function createAnthropicAgentProvider(args: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
} = {}): AgentProviderAdapter {
  const apiKey = args.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const fetchImpl = args.fetchImpl ?? fetch;

  return {
    providerKey: ANTHROPIC_PROVIDER_KEY,

    async streamTurn(request: AgentTurnRequest, options: AgentStreamOptions): Promise<AgentTurnResponse> {
      if (!apiKey) {
        throw new Error("Anthropic credentials are missing ANTHROPIC_API_KEY.");
      }

      const cacheable = applyAnthropicCacheControl({
        tools: toAnthropicTools(request.tools),
        system: request.systemInstruction
          ? [{ type: "text", text: request.systemInstruction }]
          : [],
      });

      const body = JSON.stringify({
        model: request.model.providerModelId,
        max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        stream: true,
        ...(cacheable.system.length > 0 ? { system: cacheable.system } : {}),
        ...(cacheable.tools.length > 0 ? { tools: cacheable.tools } : {}),
        messages: toAnthropicMessages(request.turns),
      });

      let delivered = false;
      const accumulator = createAnthropicStreamAccumulator({
        onText: async (fragment) => {
          delivered = true;
          await options.onText?.(fragment);
        },
      });

      await withProviderRetry({
        providerKey: ANTHROPIC_PROVIDER_KEY,
        providerName: "Anthropic",
        operation: options.operation ?? "agentStreamTurn",
        // Once the reader has seen text, a retry would replay the answer from
        // the beginning and duplicate what is already on screen — the same rule
        // the Google streaming path follows.
        shouldRetry: () => !delivered,
      }, async () => {
        const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_API_VERSION,
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body,
        });

        if (!response.ok || !response.body) {
          const detail = response.ok ? "no response body" : await response.text();
          throw new Error(`Anthropic request failed (${response.status}): ${detail.slice(0, 500)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // `stream: true` keeps multi-byte characters intact across chunk
          // boundaries; decoding each chunk independently would corrupt any
          // character split across two of them.
          const chunk = decoder.decode(value, { stream: true });
          const parsed = parseSseChunk(chunk, buffer);
          buffer = parsed.remainder;
          for (const event of parsed.events) await accumulator.handle(event);
        }
      });

      const result = accumulator.result();
      const interpreted = interpretAnthropicStopReason(result.stopReason);

      return {
        text: result.text,
        toolCalls: result.toolCalls.map((call) => ({ name: call.name, args: call.args })),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cachedInputTokens: result.cachedInputTokens,
        // A stop reason of `tool_use` and the presence of calls should agree;
        // trusting the calls keeps the loop consistent if they ever do not.
        outcome: result.toolCalls.length > 0 ? "RUN_TOOLS" : interpreted.action,
      };
    },
  };
}

/** Text of a non-streaming response, for callers that do not need fragments. */
export function readAnthropicMessageText(payload: { content?: Array<{ type?: string; text?: string }> }) {
  return extractAnthropicText(payload.content ?? []);
}
