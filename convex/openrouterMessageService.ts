/**
 * Translating the runtime's transcript into OpenRouter's wire format, and back.
 *
 * Kept apart from the adapter deliberately: everything here is a pure function
 * over plain data, so the translation and the stream accumulation can be tested
 * without a network call. The adapter is then only HTTP, streaming and retry.
 *
 * OpenRouter speaks OpenAI's chat-completions protocol, which differs from the
 * runtime's stored shape in three ways that matter:
 *
 * - the model's turns are `assistant`, not `model`;
 * - a tool request is an `assistant` message carrying `tool_calls`, whose
 *   arguments are a **JSON string** rather than an object;
 * - a tool result is its own `tool` message, matched back to the request by an
 *   explicit `tool_call_id`.
 */

import type { RuntimeTurn } from "./agentProviderTypes";
import { isRecord } from "./utils/lang";

export type OpenRouterMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenRouterToolDeclaration = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};


/**
 * A stable id linking a tool request to its result.
 *
 * The runtime does not store one: it pairs a request with its response by
 * position. Deriving the id from the turn index and the call's position within
 * that turn reproduces that pairing deterministically, without inventing state
 * the runtime would then have to checkpoint. Same approach the Anthropic
 * translation takes, for the same reason.
 */
export function buildOpenRouterToolCallId(turnIndex: number, callIndex: number) {
  return `call_${turnIndex}_${callIndex}`;
}

/** A tool result as the string OpenAI's protocol expects. */
export function serializeOpenRouterToolResult(payload: unknown) {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload ?? null);
  } catch {
    // Better an explicit note than the literal string "undefined", which the
    // model would try to interpret as the tool's answer.
    return JSON.stringify({ error: "Tool result could not be serialised." });
  }
}

export function toOpenRouterMessages(turns: RuntimeTurn[]): OpenRouterMessage[] {
  const messages: OpenRouterMessage[] = [];

  turns.forEach((turn, turnIndex) => {
    const parts = turn.parts ?? [];
    const textFragments: string[] = [];
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
    const toolResults: Array<{ role: "tool"; tool_call_id: string; content: string }> = [];
    let callIndex = 0;

    for (const part of parts) {
      if (part.functionCall) {
        toolCalls.push({
          id: buildOpenRouterToolCallId(turnIndex, callIndex),
          type: "function",
          function: {
            name: part.functionCall.name ?? "unknown_tool",
            // Arguments travel as a JSON string in this protocol, not an object.
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        });
        callIndex += 1;
        continue;
      }

      if (part.functionResponse) {
        const payload = isRecord(part.functionResponse.response)
          ? (part.functionResponse.response as Record<string, unknown>).content
            ?? part.functionResponse.response
          : part.functionResponse.response;
        toolResults.push({
          role: "tool",
          // Pairs with the request in the *preceding* turn, which is where the
          // matching call was emitted.
          tool_call_id: buildOpenRouterToolCallId(turnIndex - 1, callIndex),
          content: serializeOpenRouterToolResult(payload),
        });
        callIndex += 1;
        continue;
      }

      if (typeof part.text === "string" && part.text.length > 0) {
        textFragments.push(part.text);
      }
    }

    const isAssistant = turn.role === "model" || turn.role === "assistant";
    const text = textFragments.join("\n\n");

    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        // The protocol allows a tool request with no accompanying prose.
        content: text.length > 0 ? text : null,
        tool_calls: toolCalls,
      });
    } else if (text.length > 0) {
      messages.push(isAssistant ? { role: "assistant", content: text } : { role: "user", content: text });
    }

    // Tool results are their own messages, and must follow the assistant message
    // that requested them.
    messages.push(...toolResults);
  });

  return messages;
}

export function toOpenRouterTools(declarations: Array<{
  name: string;
  description?: string;
  parametersJsonSchema?: Record<string, unknown>;
}>): OpenRouterToolDeclaration[] {
  return declarations.map((declaration) => ({
    type: "function" as const,
    function: {
      name: declaration.name,
      description: declaration.description ?? "",
      parameters: declaration.parametersJsonSchema ?? { type: "object", properties: {} },
    },
  }));
}

/**
 * Why the model stopped, in the runtime's vocabulary.
 *
 * `content_filter` is the one that must not be reported as a completed answer:
 * it carries no reply, and posting it as one shows the reader an empty message
 * where an answer should be.
 */
export function interpretOpenRouterFinishReason(reason: string | undefined): {
  action: "COMPLETE" | "RUN_TOOLS" | "TRUNCATED" | "REFUSED" | "CONTINUE";
} {
  switch (reason) {
    case "tool_calls":
    case "function_call":
      return { action: "RUN_TOOLS" };
    case "length":
      return { action: "TRUNCATED" };
    case "content_filter":
      return { action: "REFUSED" };
    case "stop":
      return { action: "COMPLETE" };
    default:
      // An unrecognised or absent reason with no tool calls is treated as a
      // finished answer; the adapter lets the presence of calls win over this.
      return { action: "COMPLETE" };
  }
}

type StreamChoiceDelta = {
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

export type OpenRouterStreamEvent = {
  choices?: Array<{
    delta?: StreamChoiceDelta;
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

/**
 * Reassemble a streamed turn.
 *
 * Tool calls arrive in fragments: the name and id come once, then the argument
 * JSON accumulates across many events, keyed by `index`. Parsing has to wait
 * until the stream ends, because a half-received argument string is not valid
 * JSON and would throw partway through an otherwise fine answer.
 */
export function createOpenRouterStreamAccumulator(args: {
  onText?: (fragment: string) => Promise<void> | void;
} = {}) {
  let text = "";
  let finishReason: string | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  const partialCalls = new Map<number, { id?: string; name: string; argumentsJson: string }>();

  return {
    async handle(event: OpenRouterStreamEvent) {
      const choice = event.choices?.[0];
      const delta = choice?.delta;

      if (typeof delta?.content === "string" && delta.content.length > 0) {
        text += delta.content;
        await args.onText?.(delta.content);
      }

      for (const call of delta?.tool_calls ?? []) {
        const index = call.index ?? 0;
        const existing = partialCalls.get(index) ?? { name: "", argumentsJson: "" };
        partialCalls.set(index, {
          id: call.id ?? existing.id,
          name: call.function?.name ?? existing.name,
          argumentsJson: existing.argumentsJson + (call.function?.arguments ?? ""),
        });
      }

      if (choice?.finish_reason) finishReason = choice.finish_reason;

      if (event.usage) {
        inputTokens = event.usage.prompt_tokens ?? inputTokens;
        outputTokens = event.usage.completion_tokens ?? outputTokens;
        cachedInputTokens = event.usage.prompt_tokens_details?.cached_tokens ?? cachedInputTokens;
      }
    },

    result() {
      const toolCalls = Array.from(partialCalls.entries())
        .sort(([left], [right]) => left - right)
        .flatMap(([, call]) => {
          if (!call.name) return [];
          let parsedArgs: Record<string, unknown> = {};
          if (call.argumentsJson.trim().length > 0) {
            try {
              const parsed = JSON.parse(call.argumentsJson);
              if (isRecord(parsed)) parsedArgs = parsed;
            } catch {
              // A tool call whose arguments never finished arriving is dropped
              // rather than run with a guess at what they were.
              return [];
            }
          }
          return [{ name: call.name, args: parsedArgs }];
        });

      return { text, toolCalls, finishReason, inputTokens, outputTokens, cachedInputTokens };
    },
  };
}
