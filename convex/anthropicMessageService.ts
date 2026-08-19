/**
 * Translating the agent runtime's conversation into Anthropic's Messages API.
 *
 * The runtime speaks Google's shape — a flat `Content[]` where a tool request
 * and its result are separate turns with `functionCall` / `functionResponse`
 * parts. Anthropic models the same exchange differently: tool requests are
 * `tool_use` blocks inside an assistant turn, and their results are
 * `tool_result` blocks inside the *user* turn that follows, matched by
 * `tool_use_id`. The system prompt is a top-level field rather than a turn.
 *
 * Everything here is pure. It is also the part most worth testing: a mistake in
 * this translation does not throw, it produces a subtly wrong conversation —
 * the model answering as though a tool returned nothing, or being handed a
 * result for a call it never made.
 */
import { isRecord } from "./utils/lang";

export type AnthropicTextBlock = { type: "text"; text: string; cache_control?: CacheControl };
export type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type AnthropicToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type CacheControl = { type: "ephemeral" };

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
};

export type AnthropicToolDeclaration = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: CacheControl;
};

/** The runtime's provider-neutral view of one turn. */
export type RuntimeTurn = {
  role?: string;
  parts?: Array<{
    text?: string;
    functionCall?: { name?: string; args?: Record<string, unknown> };
    functionResponse?: { name?: string; response?: unknown };
  }>;
};


/**
 * A stable id linking a tool request to its result.
 *
 * Google's shape matches a request to its response by *position and name*;
 * Anthropic requires an explicit `tool_use_id` on both sides. Deriving it from
 * the turn index and the call's position within that turn reproduces the same
 * pairing deterministically, without inventing state the runtime does not keep.
 */
export function buildToolUseId(turnIndex: number, callIndex: number) {
  return `toolu_${turnIndex}_${callIndex}`;
}

/**
 * Convert one function result into the string Anthropic expects.
 *
 * Anthropic takes tool results as text, not as arbitrary JSON, so a structured
 * payload is serialised. A result that cannot be serialised becomes an explicit
 * error rather than the string "undefined", which the model would otherwise try
 * to interpret as data.
 */
export function serializeToolResult(response: unknown): { content: string; isError: boolean } {
  if (typeof response === "string") return { content: response, isError: false };

  try {
    const serialized = JSON.stringify(response);
    if (serialized === undefined) {
      return { content: "Tool returned a value that could not be serialised.", isError: true };
    }
    // The runtime wraps results as { status, data } or { status, error }.
    const isError = isRecord(response) && response.status === "error";
    return { content: serialized, isError };
  } catch {
    return { content: "Tool returned a value that could not be serialised.", isError: true };
  }
}

/**
 * Translate the runtime's conversation into Anthropic messages.
 *
 * Two structural differences do the work here. Google labels the model's turns
 * `model`; Anthropic calls them `assistant`. And Google puts tool results in
 * their own `function` turn, while Anthropic requires them inside a `user`
 * turn — so a `function` turn becomes a user message carrying `tool_result`
 * blocks.
 */
export function toAnthropicMessages(turns: RuntimeTurn[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  turns.forEach((turn, turnIndex) => {
    const parts = turn.parts ?? [];
    const blocks: AnthropicContentBlock[] = [];
    let callIndex = 0;

    for (const part of parts) {
      if (part.functionCall) {
        blocks.push({
          type: "tool_use",
          id: buildToolUseId(turnIndex, callIndex),
          name: part.functionCall.name ?? "unknown_tool",
          input: part.functionCall.args ?? {},
        });
        callIndex += 1;
        continue;
      }

      if (part.functionResponse) {
        const payload = isRecord(part.functionResponse.response)
          ? (part.functionResponse.response as Record<string, unknown>).content
            ?? part.functionResponse.response
          : part.functionResponse.response;
        const { content, isError } = serializeToolResult(payload);
        blocks.push({
          type: "tool_result",
          // Pairs with the request in the *preceding* turn, which is where the
          // matching `tool_use` block was emitted.
          tool_use_id: buildToolUseId(turnIndex - 1, callIndex),
          content,
          ...(isError ? { is_error: true } : {}),
        });
        callIndex += 1;
        continue;
      }

      if (typeof part.text === "string" && part.text.length > 0) {
        blocks.push({ type: "text", text: part.text });
      }
    }

    if (blocks.length === 0) return;

    // A turn carrying tool results is a user turn in Anthropic's model, even
    // though the runtime labels it `function`.
    const carriesToolResults = blocks.some((block) => block.type === "tool_result");
    const role: "user" | "assistant" = carriesToolResults
      ? "user"
      : turn.role === "model" || turn.role === "assistant"
        ? "assistant"
        : "user";

    messages.push({ role, content: blocks });
  });

  return messages;
}

/** Convert the runtime's tool declarations into Anthropic's shape. */
export function toAnthropicTools(declarations: Array<{
  name: string;
  description?: string;
  parametersJsonSchema?: Record<string, unknown>;
}>): AnthropicToolDeclaration[] {
  return declarations.map((declaration) => ({
    name: declaration.name,
    description: declaration.description ?? "",
    // Anthropic requires an object schema. A tool declared without one would
    // otherwise be rejected for the whole request, taking the other tools with
    // it.
    input_schema: declaration.parametersJsonSchema ?? { type: "object", properties: {} },
  }));
}

/**
 * Mark the cacheable prefix of a request.
 *
 * Anthropic caches by prefix, and the render order is tools → system →
 * messages. A breakpoint on the last tool therefore covers every tool; one on
 * the last system block covers the tools *and* the system prompt. Both are
 * stable for the life of a run, which is exactly what P3.4 identified as the
 * cacheable part.
 *
 * At most four breakpoints are allowed per request, so this places two and
 * leaves headroom rather than marking everything it can.
 */
export function applyAnthropicCacheControl(args: {
  tools: AnthropicToolDeclaration[];
  system: AnthropicTextBlock[];
}) {
  const tools = args.tools.map((tool, index) =>
    index === args.tools.length - 1
      ? { ...tool, cache_control: { type: "ephemeral" as const } }
      : tool);

  const system = args.system.map((block, index) =>
    index === args.system.length - 1
      ? { ...block, cache_control: { type: "ephemeral" as const } }
      : block);

  return { tools, system };
}

export type AnthropicStopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | "pause_turn"
  | "refusal";

/**
 * What the runtime should do next, from Anthropic's stop reason.
 *
 * `refusal` is the one that must not be mistaken for a normal ending: the
 * response carries no usable answer, and treating it as `end_turn` would post
 * an empty reply as though the agent had finished.
 */
export function interpretAnthropicStopReason(stopReason: string | null | undefined) {
  switch (stopReason) {
    case "tool_use":
      return { action: "RUN_TOOLS" as const };
    case "refusal":
      return { action: "REFUSED" as const };
    case "max_tokens":
      return { action: "TRUNCATED" as const };
    case "pause_turn":
      // The provider paused a server-side loop and expects the same
      // conversation sent back to resume. Not an ending.
      return { action: "CONTINUE" as const };
    default:
      return { action: "COMPLETE" as const };
  }
}

/** Pull the assistant's text out of a response's content blocks. */
export function extractAnthropicText(blocks: Array<{ type?: string; text?: string }>) {
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("");
}

/** Pull the tool calls out of a response's content blocks. */
export function extractAnthropicToolCalls(blocks: Array<{
  type?: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
}>) {
  return blocks
    .filter((block) => block.type === "tool_use")
    .map((block) => ({
      id: block.id ?? "",
      name: block.name ?? "",
      args: isRecord(block.input) ? block.input : {},
    }));
}
