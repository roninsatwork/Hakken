import { describe, expect, test, vi } from "vitest";
import {
  createAnthropicStreamAccumulator,
  parseToolArguments,
  type AnthropicStreamEvent,
} from "./anthropicStreamService";
import { parseProviderSseChunk } from "./providerHttpService";

/**
 * The two failure modes worth engineering against here are both invisible in a
 * naive test: an event split across network chunks, and a tool call whose
 * arguments are only valid JSON once every fragment has arrived.
 *
 * Framing is the shared `parseProviderSseChunk` — this file's private copy was
 * retired when the assistant streaming work touched the path. The framing
 * tests stay here, run against the shared parser with Anthropic's own event
 * shapes, so the split-mid-line coverage survives the retirement.
 */

function sse(event: Record<string, unknown>) {
  return `event: ${event.type as string}\ndata: ${JSON.stringify(event)}\n\n`;
}

function parseEvents(chunk: string, buffer: string) {
  const { payloads, remainder } = parseProviderSseChunk(chunk, buffer);
  return { events: payloads as AnthropicStreamEvent[], remainder };
}

/** Feed a whole transcript through the accumulator, one chunk at a time. */
async function accumulate(chunks: string[], onText?: (fragment: string) => void) {
  const accumulator = createAnthropicStreamAccumulator({ onText });
  let buffer = "";
  for (const chunk of chunks) {
    const { events, remainder } = parseEvents(chunk, buffer);
    buffer = remainder;
    for (const event of events) await accumulator.handle(event);
  }
  return accumulator.result();
}

describe("framing", () => {
  test("parses complete events out of a chunk", () => {
    const { events, remainder } = parseEvents(
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } }),
      "",
    );
    expect(events).toHaveLength(1);
    expect(remainder).toBe("");
  });

  test("holds back a line split across chunks and completes it on the next", () => {
    // The failure this prevents: a network chunk boundary has nothing to do
    // with a line boundary, so parsing each chunk independently silently drops
    // the split event — under load only, never in a test that feeds whole
    // messages.
    const whole = sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } });
    const cut = Math.floor(whole.length / 2);

    const first = parseEvents(whole.slice(0, cut), "");
    expect(first.events).toHaveLength(0);
    expect(first.remainder.length).toBeGreaterThan(0);

    const second = parseEvents(whole.slice(cut), first.remainder);
    expect(second.events).toHaveLength(1);
    expect(second.events[0].delta?.text).toBe("hello");
  });

  test("ignores event lines, blank lines and the terminator", () => {
    const { events } = parseEvents("event: ping\n\ndata: [DONE]\n\n", "");
    expect(events).toHaveLength(0);
  });

  test("skips a malformed payload rather than failing the stream", () => {
    // Aborting a half-delivered answer over one bad frame is worse for the
    // reader than a missing fragment.
    const { events } = parseEvents(
      `data: {not json}\n\n${sse({ type: "message_stop" })}`,
      "",
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("message_stop");
  });
});

describe("assembling a reply", () => {
  test("accumulates text and hands each fragment to the reader as it arrives", async () => {
    const seen: string[] = [];
    const result = await accumulate([
      sse({ type: "message_start", message: { usage: { input_tokens: 10 } } }),
      sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Refunds " } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "take 14 days." } }),
      sse({ type: "content_block_stop", index: 0 }),
      sse({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 8 } }),
    ], (fragment) => { seen.push(fragment); });

    expect(result.text).toBe("Refunds take 14 days.");
    // Streamed, not delivered in one lump at the end — that is what makes the
    // answer appear progressively.
    expect(seen).toEqual(["Refunds ", "take 14 days."]);
    expect(result.stopReason).toBe("end_turn");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(8);
  });

  test("records cached input tokens so caching can be priced", async () => {
    const result = await accumulate([
      sse({ type: "message_start", message: { usage: { input_tokens: 100, cache_read_input_tokens: 90 } } }),
    ]);
    expect(result.cachedInputTokens).toBe(90);
  });

  test("emits a tool call only once its arguments are complete", async () => {
    // Arguments arrive as JSON fragments that are not parseable until the block
    // closes. Emitting on each delta would hand the runtime a broken object.
    const result = await accumulate([
      sse({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "search_knowledge" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":' } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"refunds"}' } }),
      sse({ type: "content_block_stop", index: 0 }),
      sse({ type: "message_delta", delta: { stop_reason: "tool_use" } }),
    ]);

    expect(result.toolCalls).toEqual([
      { id: "toolu_1", name: "search_knowledge", args: { query: "refunds" } },
    ]);
    expect(result.stopReason).toBe("tool_use");
  });

  test("keeps parallel tool calls separate by block index", async () => {
    // Two calls stream interleaved. Keying by index is what stops one call's
    // arguments being appended to the other's.
    const result = await accumulate([
      sse({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_a", name: "search" } }),
      sse({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_b", name: "search" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"q":"a"}' } }),
      sse({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"q":"b"}' } }),
      sse({ type: "content_block_stop", index: 0 }),
      sse({ type: "content_block_stop", index: 1 }),
    ]);

    expect(result.toolCalls).toEqual([
      { id: "toolu_a", name: "search", args: { q: "a" } },
      { id: "toolu_b", name: "search", args: { q: "b" } },
    ]);
  });

  test("carries text and a tool call in the same turn", async () => {
    // A turn that requests a tool often narrates first.
    const result = await accumulate([
      sse({ type: "content_block_start", index: 0, content_block: { type: "text" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Let me check." } }),
      sse({ type: "content_block_stop", index: 0 }),
      sse({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "search" } }),
      sse({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } }),
      sse({ type: "content_block_stop", index: 1 }),
    ]);

    expect(result.text).toBe("Let me check.");
    expect(result.toolCalls).toHaveLength(1);
  });

  test("surfaces a refusal as the stop reason", async () => {
    const result = await accumulate([
      sse({ type: "message_delta", delta: { stop_reason: "refusal" } }),
    ]);
    expect(result.stopReason).toBe("refusal");
  });

  test("a text block's opening fragment is not lost", async () => {
    const seen: string[] = [];
    const result = await accumulate([
      sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "Opening" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " and more." } }),
    ], (fragment) => { seen.push(fragment); });

    expect(result.text).toBe("Opening and more.");
    expect(seen[0]).toBe("Opening");
  });

  test("ignores event types it does not know", async () => {
    // The API adds event types over time; an unrecognised one must not break a
    // response that is otherwise fine.
    const accumulator = createAnthropicStreamAccumulator();
    await accumulator.handle({ type: "some_future_event" } as AnthropicStreamEvent);
    expect(accumulator.result().text).toBe("");
  });

  test("awaits the reader before continuing", async () => {
    // The runtime's onText writes to the database. Not awaiting it would let
    // writes race and land out of order.
    const order: string[] = [];
    const slowReader = vi.fn(async (fragment: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(fragment);
    });

    await accumulate([
      sse({ type: "content_block_start", index: 0, content_block: { type: "text" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "one" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "two" } }),
    ], slowReader);

    expect(order).toEqual(["one", "two"]);
  });
});

describe("tool argument parsing", () => {
  test("treats no arguments as an empty object", () => {
    expect(parseToolArguments("")).toEqual({});
    expect(parseToolArguments("   ")).toEqual({});
  });

  test("falls back to an empty object rather than throwing", () => {
    // The runtime validates arguments against the tool's schema, so a schema
    // failure is a message the model can act on. An exception here kills the
    // run instead.
    expect(parseToolArguments('{"broken":')).toEqual({});
    expect(parseToolArguments("[1,2,3]")).toEqual({});
    expect(parseToolArguments("null")).toEqual({});
  });

  test("parses a complete argument object", () => {
    expect(parseToolArguments('{"query":"refunds","limit":5}'))
      .toEqual({ query: "refunds", limit: 5 });
  });
});
