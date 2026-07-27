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
  AgentReasoningEffort,
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

/**
 * The agent's three levels as an Anthropic thinking budget, in tokens.
 *
 * Anthropic's minimum is 1024, so Low is the floor rather than something
 * smaller. Every budget stays well under `DEFAULT_MAX_OUTPUT_TOKENS`, which the
 * API requires and which is also what keeps room for the answer itself.
 *
 * Extended thinking fixes temperature at 1, so this adapter — which has never
 * sent a temperature — deliberately still does not.
 */
const ANTHROPIC_THINKING_BUDGET_TOKENS: Record<AgentReasoningEffort, number> = {
  LOW: 1024,
  MEDIUM: 2048,
  HIGH: 4096,
};

/**
 * Anthropic's own hosted search tool.
 *
 * A server tool: the model runs the search itself rather than asking the
 * runtime to, so it sits alongside the agent's declared tools and never reaches
 * the loop's tool-call handling.
 */
const ANTHROPIC_WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
} as const;

/**
 * Anthropic has no response-format field, so the shape is asked for in words.
 *
 * The other two providers enforce a JSON Schema natively. Rather than leave this
 * provider silently ignoring the setting — the exact fault being fixed — the
 * required shape is appended to the instruction. It is a weaker guarantee, and
 * saying so here is better than a screen that promises the same thing whichever
 * model is chosen.
 */
export function appendAnthropicResponseShape(
  systemInstruction: string,
  responseJsonSchema?: Record<string, unknown>,
) {
  if (!responseJsonSchema) return systemInstruction;
  const instruction = "Reply with JSON only, and nothing else — no prose, no code fence. "
    + `It must match this JSON Schema exactly:\n${JSON.stringify(responseJsonSchema)}`;
  return systemInstruction ? `${systemInstruction}\n\n${instruction}` : instruction;
}

/** What this turn asks for beyond the transcript, built where it can be read. */
export function buildAnthropicTurnOptions(request: {
  reasoningEffort?: AgentReasoningEffort;
  webSearch?: boolean;
}) {
  return {
    ...(request.reasoningEffort
      ? {
        thinking: {
          type: "enabled" as const,
          budget_tokens: ANTHROPIC_THINKING_BUDGET_TOKENS[request.reasoningEffort],
        },
      }
      : {}),
    extraTools: request.webSearch ? [ANTHROPIC_WEB_SEARCH_TOOL] : [],
  };
}

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
        system: (() => {
          const instruction = appendAnthropicResponseShape(
            request.systemInstruction,
            request.responseJsonSchema,
          );
          return instruction ? [{ type: "text", text: instruction }] : [];
        })(),
      });

      const { extraTools, ...turnOptions } = buildAnthropicTurnOptions({
        reasoningEffort: request.reasoningEffort,
        webSearch: request.webSearch,
      });
      // Appended after the cached tools rather than mixed in, so adding search
      // does not move a cache breakpoint and invalidate the cached prefix.
      const tools = [...cacheable.tools, ...extraTools];

      const body = JSON.stringify({
        model: request.model.providerModelId,
        max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        stream: true,
        ...turnOptions,
        ...(cacheable.system.length > 0 ? { system: cacheable.system } : {}),
        ...(tools.length > 0 ? { tools } : {}),
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
