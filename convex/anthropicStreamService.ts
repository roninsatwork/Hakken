/**
 * Reading an Anthropic streaming response.
 *
 * The repo has no Anthropic SDK — the adapter speaks raw HTTP — so the
 * server-sent event stream has to be parsed here. The shape is deliberately
 * different from the Google streaming path the runtime already uses: Google
 * hands back whole chunks with accumulated text, Anthropic emits a sequence of
 * typed events that only make sense in aggregate.
 *
 * Two things make that worth separating into pure functions. Framing is easy to
 * get subtly wrong — an SSE payload can be split mid-line across network chunks,
 * and a parser that assumes chunk boundaries are line boundaries loses text
 * intermittently under load and never in a test. And a tool call arrives as a
 * name in one event and its arguments as a series of JSON *fragments* in later
 * ones, so nothing is usable until the block closes.
 */

export type AnthropicStreamEvent = {
  type?: string;
  index?: number;
  message?: {
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
    stop_reason?: string | null;
  };
  content_block?: { type?: string; id?: string; name?: string; text?: string };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
};

/**
 * Split a stream chunk into complete SSE payloads, keeping any partial tail.
 *
 * The caller feeds the returned `remainder` back in with the next chunk. This is
 * the whole reason framing lives here: a network chunk boundary has nothing to
 * do with a line boundary, so `data: {"text":"hel` and `lo"}` can arrive
 * separately. Parsing each chunk independently drops that event, and it happens
 * only under load — never in a test that feeds whole messages.
 */
export function parseSseChunk(chunk: string, buffer: string) {
  const combined = buffer + chunk;
  const lines = combined.split("\n");
  // The last element is whatever followed the final newline — possibly a
  // half-received line, so it is held back rather than parsed.
  const remainder = lines.pop() ?? "";

  const events: AnthropicStreamEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // `event:` lines duplicate the `type` inside the payload, and blank lines
    // separate events; neither carries data.
    if (!trimmed.startsWith("data:")) continue;

    const payload = trimmed.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;

    try {
      events.push(JSON.parse(payload) as AnthropicStreamEvent);
    } catch {
      // A payload that will not parse is skipped rather than failing the run.
      // The alternative is aborting a half-delivered answer over one malformed
      // frame, which is worse for the reader than a missing fragment.
      continue;
    }
  }

  return { events, remainder };
}

export type AccumulatedToolCall = { id: string; name: string; args: Record<string, unknown> };

export type AccumulatedStream = {
  text: string;
  toolCalls: AccumulatedToolCall[];
  stopReason?: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

type PendingBlock = { type: "text" } | { type: "tool_use"; id: string; name: string; json: string };

/**
 * Assemble a streamed response from its events.
 *
 * Text arrives as deltas and is handed to `onText` as it comes, which is what
 * lets the reader see the answer being written. Tool calls cannot be: their
 * arguments arrive as JSON fragments that are not valid JSON until the block
 * closes, so a call is only emitted once it is complete.
 */
export function createAnthropicStreamAccumulator(args: {
  onText?: (fragment: string) => Promise<void> | void;
} = {}) {
  const state: AccumulatedStream = {
    text: "",
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
  };
  const blocks = new Map<number, PendingBlock>();

  async function handle(event: AnthropicStreamEvent) {
    switch (event.type) {
      case "message_start": {
        const usage = event.message?.usage;
        state.inputTokens += usage?.input_tokens ?? 0;
        state.outputTokens += usage?.output_tokens ?? 0;
        state.cachedInputTokens += usage?.cache_read_input_tokens ?? 0;
        return;
      }

      case "content_block_start": {
        const index = event.index ?? 0;
        if (event.content_block?.type === "tool_use") {
          blocks.set(index, {
            type: "tool_use",
            id: event.content_block.id ?? "",
            name: event.content_block.name ?? "",
            json: "",
          });
        } else {
          blocks.set(index, { type: "text" });
          // A text block can carry an opening fragment on the start event.
          const seed = event.content_block?.text;
          if (seed) {
            state.text += seed;
            await args.onText?.(seed);
          }
        }
        return;
      }

      case "content_block_delta": {
        const index = event.index ?? 0;
        const block = blocks.get(index);

        if (event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
          state.text += event.delta.text;
          await args.onText?.(event.delta.text);
          return;
        }

        if (event.delta?.type === "input_json_delta" && block?.type === "tool_use") {
          // Fragments of the arguments object. Not parseable until complete.
          block.json += event.delta.partial_json ?? "";
        }
        return;
      }

      case "content_block_stop": {
        const index = event.index ?? 0;
        const block = blocks.get(index);
        if (block?.type === "tool_use") {
          state.toolCalls.push({
            id: block.id,
            name: block.name,
            args: parseToolArguments(block.json),
          });
        }
        blocks.delete(index);
        return;
      }

      case "message_delta": {
        if (event.delta?.stop_reason) state.stopReason = event.delta.stop_reason;
        state.outputTokens += event.usage?.output_tokens ?? 0;
        return;
      }

      default:
        return;
    }
  }

  return {
    handle,
    result: (): AccumulatedStream => ({ ...state, toolCalls: [...state.toolCalls] }),
  };
}

/**
 * Parse a tool call's accumulated argument fragments.
 *
 * An empty string is a call with no arguments, which is legitimate. Anything
 * that will not parse becomes an empty object rather than throwing: the runtime
 * validates arguments against the tool's schema anyway, and a schema failure is
 * a message the model can act on, whereas an exception here kills the run.
 */
export function parseToolArguments(json: string): Record<string, unknown> {
  const trimmed = json.trim();
  if (trimmed.length === 0) return {};

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
