import { describe, expect, test, vi } from "vitest";

import {
  buildOpenRouterToolCallId,
  createOpenRouterStreamAccumulator,
  interpretOpenRouterFinishReason,
  toOpenRouterMessages,
  toOpenRouterTools,
} from "./openrouterMessageService";

/**
 * A tool request and its result must still find each other.
 *
 * The runtime stores a transcript that pairs them by position; this protocol
 * requires an explicit id on both sides. If the two ever disagree, the model is
 * sent a result it cannot attribute to anything it asked for — which does not
 * fail loudly, it just produces a confused answer.
 */
describe("openrouter transcript translation", () => {
  test("pairs a tool result with the request that preceded it", () => {
    const messages = toOpenRouterMessages([
      { role: "user", parts: [{ text: "What is the weather?" }] },
      { role: "model", parts: [{ functionCall: { name: "get_weather", args: { city: "Leeds" } } }] },
      { role: "function", parts: [{ functionResponse: { name: "get_weather", response: { temp: 11 } } }] },
    ]);

    expect(messages).toEqual([
      { role: "user", content: "What is the weather?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: buildOpenRouterToolCallId(1, 0),
          type: "function",
          // Arguments travel as a JSON string in this protocol, not an object.
          function: { name: "get_weather", arguments: JSON.stringify({ city: "Leeds" }) },
        }],
      },
      {
        role: "tool",
        tool_call_id: buildOpenRouterToolCallId(1, 0),
        content: JSON.stringify({ temp: 11 }),
      },
    ]);
  });

  test("keeps two parallel tool calls distinguishable", () => {
    const messages = toOpenRouterMessages([
      {
        role: "model",
        parts: [
          { functionCall: { name: "first", args: {} } },
          { functionCall: { name: "second", args: {} } },
        ],
      },
      {
        role: "function",
        parts: [
          { functionResponse: { name: "first", response: "a" } },
          { functionResponse: { name: "second", response: "b" } },
        ],
      },
    ]);

    const assistant = messages[0] as { tool_calls: Array<{ id: string }> };
    const results = messages.slice(1) as Array<{ tool_call_id: string; content: string }>;

    expect(assistant.tool_calls.map((call) => call.id)).toEqual([
      buildOpenRouterToolCallId(0, 0),
      buildOpenRouterToolCallId(0, 1),
    ]);
    expect(results.map((result) => result.tool_call_id)).toEqual([
      buildOpenRouterToolCallId(0, 0),
      buildOpenRouterToolCallId(0, 1),
    ]);
    expect(results.map((result) => result.content)).toEqual(["a", "b"]);
  });

  test("labels the model's own turns as assistant", () => {
    const messages = toOpenRouterMessages([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi" }] },
    ]);

    expect(messages).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
  });

  test("gives a tool with no schema an empty object rather than nothing", () => {
    // A missing `parameters` is rejected by the protocol, so it must not be
    // passed straight through as undefined.
    expect(toOpenRouterTools([{ name: "ping", description: "Ping." }])).toEqual([{
      type: "function",
      function: { name: "ping", description: "Ping.", parameters: { type: "object", properties: {} } },
    }]);
  });
});

describe("openrouter finish reasons", () => {
  test("a content filter is a refusal, not a completed answer", () => {
    // The loop must not post this as a reply: it carries no text, and doing so
    // shows the reader an empty message where an answer should be.
    expect(interpretOpenRouterFinishReason("content_filter").action).toBe("REFUSED");
  });

  test("maps the rest of the protocol's reasons", () => {
    expect(interpretOpenRouterFinishReason("stop").action).toBe("COMPLETE");
    expect(interpretOpenRouterFinishReason("tool_calls").action).toBe("RUN_TOOLS");
    expect(interpretOpenRouterFinishReason("length").action).toBe("TRUNCATED");
    expect(interpretOpenRouterFinishReason(undefined).action).toBe("COMPLETE");
  });
});

/**
 * Tool arguments arrive in pieces.
 *
 * The name and id come once and the argument JSON accumulates across many
 * frames, so parsing before the stream ends would throw on a half-received
 * string — partway through an otherwise fine answer.
 */
describe("openrouter stream accumulation", () => {
  test("reassembles a tool call whose arguments arrive in fragments", async () => {
    const accumulator = createOpenRouterStreamAccumulator();

    await accumulator.handle({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_x", function: { name: "search", arguments: '{"quer' } }] } }] });
    await accumulator.handle({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'y":"ott' } }] } }] });
    await accumulator.handle({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ers"}' } }] } }] });
    await accumulator.handle({ choices: [{ finish_reason: "tool_calls" }] });

    expect(accumulator.result().toolCalls).toEqual([{ name: "search", args: { query: "otters" } }]);
  });

  test("streams text out as it arrives, and totals it at the end", async () => {
    const onText = vi.fn();
    const accumulator = createOpenRouterStreamAccumulator({ onText });

    await accumulator.handle({ choices: [{ delta: { content: "Hello " } }] });
    await accumulator.handle({ choices: [{ delta: { content: "world" } }] });
    await accumulator.handle({ choices: [{ finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 3 } });

    expect(onText).toHaveBeenCalledTimes(2);
    expect(accumulator.result()).toMatchObject({
      text: "Hello world",
      finishReason: "stop",
      inputTokens: 12,
      outputTokens: 3,
    });
  });

  test("drops a tool call whose arguments never finished arriving", async () => {
    const accumulator = createOpenRouterStreamAccumulator();

    await accumulator.handle({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "search", arguments: '{"query":' } }] } }] });

    // Running a tool with a guess at its arguments is worse than not running it.
    expect(accumulator.result().toolCalls).toEqual([]);
  });

  test("keeps parallel tool calls apart by their index", async () => {
    const accumulator = createOpenRouterStreamAccumulator();

    await accumulator.handle({ choices: [{ delta: { tool_calls: [
      { index: 0, function: { name: "first", arguments: "{}" } },
      { index: 1, function: { name: "second", arguments: '{"a":' } },
    ] } }] });
    await accumulator.handle({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: "1}" } }] } }] });

    expect(accumulator.result().toolCalls).toEqual([
      { name: "first", args: {} },
      { name: "second", args: { a: 1 } },
    ]);
  });
});
