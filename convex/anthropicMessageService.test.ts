import { describe, expect, test } from "vitest";
import {
  applyAnthropicCacheControl,
  buildToolUseId,
  extractAnthropicText,
  extractAnthropicToolCalls,
  interpretAnthropicStopReason,
  serializeToolResult,
  toAnthropicMessages,
  toAnthropicTools,
} from "./anthropicMessageService";

/**
 * The runtime speaks Google's conversation shape; Anthropic models the same
 * exchange differently. A mistake in this translation does not throw — it
 * produces a subtly wrong conversation, which is the worst kind of bug to have
 * in the layer between an agent and its tools.
 */

describe("translating turns", () => {
  test("maps the model's turns to assistant", () => {
    // Google calls them `model`; Anthropic calls them `assistant`. A turn sent
    // under the wrong role reads to the model as though the user said it.
    const messages = toAnthropicMessages([
      { role: "user", parts: [{ text: "What is the refund window?" }] },
      { role: "model", parts: [{ text: "Fourteen days." }] },
    ]);

    expect(messages).toEqual([
      { role: "user", content: [{ type: "text", text: "What is the refund window?" }] },
      { role: "assistant", content: [{ type: "text", text: "Fourteen days." }] },
    ]);
  });

  test("turns a tool request into an assistant tool_use block", () => {
    const messages = toAnthropicMessages([
      { role: "user", parts: [{ text: "Look it up" }] },
      { role: "model", parts: [{ functionCall: { name: "search_knowledge", args: { query: "refunds" } } }] },
    ]);

    expect(messages[1]).toEqual({
      role: "assistant",
      content: [{
        type: "tool_use",
        id: buildToolUseId(1, 0),
        name: "search_knowledge",
        input: { query: "refunds" },
      }],
    });
  });

  test("puts tool results in a user turn, matched to their request", () => {
    // Google gives results their own `function` turn; Anthropic requires them
    // inside the *user* turn that follows, paired by tool_use_id. Sending them
    // as an assistant turn is rejected outright.
    const messages = toAnthropicMessages([
      { role: "user", parts: [{ text: "Look it up" }] },
      { role: "model", parts: [{ functionCall: { name: "search_knowledge", args: {} } }] },
      {
        role: "function",
        parts: [{ functionResponse: { name: "search_knowledge", response: { content: { status: "success", data: [] } } } }],
      },
    ]);

    expect(messages[2].role).toBe("user");
    const result = messages[2].content[0];
    expect(result.type).toBe("tool_result");
    if (result.type === "tool_result") {
      // Points at the request in the preceding turn, not its own.
      expect(result.tool_use_id).toBe(buildToolUseId(1, 0));
    }
  });

  test("pairs several calls in one turn with their own results", () => {
    // A model turn may request tools in parallel. Every request needs its own
    // id, and every result must point at the right one — crossing them feeds
    // the model one tool's answer under another tool's name.
    const messages = toAnthropicMessages([
      { role: "user", parts: [{ text: "Check both" }] },
      {
        role: "model",
        parts: [
          { functionCall: { name: "search", args: { q: "a" } } },
          { functionCall: { name: "search", args: { q: "b" } } },
        ],
      },
      {
        role: "function",
        parts: [
          { functionResponse: { name: "search", response: "first" } },
          { functionResponse: { name: "search", response: "second" } },
        ],
      },
    ]);

    const calls = messages[1].content;
    expect(calls.map((block) => block.type === "tool_use" ? block.id : null))
      .toEqual([buildToolUseId(1, 0), buildToolUseId(1, 1)]);

    const results = messages[2].content;
    expect(results.map((block) => block.type === "tool_result" ? block.tool_use_id : null))
      .toEqual([buildToolUseId(1, 0), buildToolUseId(1, 1)]);
  });

  test("marks a failed tool result as an error", () => {
    // Anthropic has a dedicated flag for this. Without it a failure reads as
    // ordinary data and the model reasons over an error payload as fact.
    const messages = toAnthropicMessages([
      { role: "model", parts: [{ functionCall: { name: "search", args: {} } }] },
      {
        role: "function",
        parts: [{ functionResponse: { name: "search", response: { content: { status: "error", error: "boom" } } } }],
      },
    ]);

    const result = messages[1].content[0];
    expect(result.type === "tool_result" && result.is_error).toBe(true);
  });

  test("tool results are a user turn however the turn was labelled", () => {
    // The runtime labels result turns `function`, which already maps to user.
    // This guarantees the property holds regardless of the label — a transcript
    // assembled elsewhere, or trimmed and rebuilt, must not end up sending tool
    // results as an assistant turn, which Anthropic rejects outright.
    const messages = toAnthropicMessages([
      { role: "model", parts: [{ functionCall: { name: "search", args: {} } }] },
      { role: "model", parts: [{ functionResponse: { name: "search", response: "done" } }] },
    ]);

    expect(messages[1].role).toBe("user");
  });

  test("drops turns that carry nothing", () => {
    // An empty content array is rejected by the API, so an empty turn must not
    // be emitted at all.
    const messages = toAnthropicMessages([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [] },
      { role: "model", parts: [{ text: "" }] },
    ]);

    expect(messages).toHaveLength(1);
  });
});

describe("serialising tool results", () => {
  test("passes a plain string through", () => {
    expect(serializeToolResult("done")).toEqual({ content: "done", isError: false });
  });

  test("serialises structured results", () => {
    expect(serializeToolResult({ status: "success", data: [1, 2] }))
      .toEqual({ content: '{"status":"success","data":[1,2]}', isError: false });
  });

  test("reports a value it cannot serialise instead of sending 'undefined'", () => {
    // The model would try to interpret the literal string "undefined" as data.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeToolResult(circular).isError).toBe(true);
    expect(serializeToolResult(undefined).isError).toBe(true);
  });
});

describe("tool declarations", () => {
  test("converts to Anthropic's shape", () => {
    expect(toAnthropicTools([{
      name: "search_knowledge",
      description: "Search knowledge.",
      parametersJsonSchema: { type: "object", properties: { query: { type: "string" } } },
    }])).toEqual([{
      name: "search_knowledge",
      description: "Search knowledge.",
      input_schema: { type: "object", properties: { query: { type: "string" } } },
    }]);
  });

  test("substitutes an empty object schema when a tool has none", () => {
    // Anthropic rejects a tool without an object schema, and it rejects the
    // whole request — one malformed tool would take every other tool with it.
    const tools = toAnthropicTools([{ name: "no_schema" }]);
    expect(tools[0].input_schema).toEqual({ type: "object", properties: {} });
  });
});

describe("cache breakpoints", () => {
  test("marks the last tool and the last system block", () => {
    // Anthropic caches by prefix, rendering tools → system → messages, so a
    // breakpoint on the last system block covers the tools too.
    const result = applyAnthropicCacheControl({
      tools: [
        { name: "a", description: "", input_schema: {} },
        { name: "b", description: "", input_schema: {} },
      ],
      system: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    });

    expect(result.tools[0].cache_control).toBeUndefined();
    expect(result.tools[1].cache_control).toEqual({ type: "ephemeral" });
    expect(result.system[0].cache_control).toBeUndefined();
    expect(result.system[1].cache_control).toEqual({ type: "ephemeral" });
  });

  test("stays well inside the four-breakpoint limit", () => {
    const result = applyAnthropicCacheControl({
      tools: Array.from({ length: 10 }, (_, index) => ({
        name: `t${index}`, description: "", input_schema: {},
      })),
      system: Array.from({ length: 10 }, (_, index) => ({
        type: "text" as const, text: `s${index}`,
      })),
    });

    const marked = [...result.tools, ...result.system]
      .filter((entry) => entry.cache_control !== undefined).length;
    expect(marked).toBeLessThanOrEqual(4);
  });

  test("copes with nothing to mark", () => {
    expect(applyAnthropicCacheControl({ tools: [], system: [] }))
      .toEqual({ tools: [], system: [] });
  });
});

describe("stop reasons", () => {
  test("distinguishes a refusal from a normal ending", () => {
    // A refusal carries no usable answer. Treating it as end_turn would post an
    // empty reply as though the agent had finished its work.
    expect(interpretAnthropicStopReason("refusal")).toEqual({ action: "REFUSED" });
    expect(interpretAnthropicStopReason("end_turn")).toEqual({ action: "COMPLETE" });
  });

  test("recognises a request to run tools", () => {
    expect(interpretAnthropicStopReason("tool_use")).toEqual({ action: "RUN_TOOLS" });
  });

  test("recognises truncation and a paused server-side loop", () => {
    expect(interpretAnthropicStopReason("max_tokens")).toEqual({ action: "TRUNCATED" });
    // A pause is not an ending — the same conversation goes back to resume.
    expect(interpretAnthropicStopReason("pause_turn")).toEqual({ action: "CONTINUE" });
  });

  test("treats an unknown reason as a completed turn", () => {
    expect(interpretAnthropicStopReason(undefined)).toEqual({ action: "COMPLETE" });
    expect(interpretAnthropicStopReason("something_new")).toEqual({ action: "COMPLETE" });
  });
});

describe("reading a response", () => {
  test("joins text blocks and ignores the rest", () => {
    expect(extractAnthropicText([
      { type: "text", text: "Refunds take " },
      { type: "tool_use" },
      { type: "text", text: "14 days." },
    ])).toBe("Refunds take 14 days.");
  });

  test("extracts tool calls with their arguments", () => {
    expect(extractAnthropicToolCalls([
      { type: "text", text: "let me check" },
      { type: "tool_use", id: "toolu_1", name: "search", input: { q: "refunds" } },
    ])).toEqual([{ id: "toolu_1", name: "search", args: { q: "refunds" } }]);
  });

  test("defaults a malformed tool input to an empty object", () => {
    expect(extractAnthropicToolCalls([
      { type: "tool_use", id: "toolu_1", name: "search", input: "not an object" },
    ])).toEqual([{ id: "toolu_1", name: "search", args: {} }]);
  });
});
