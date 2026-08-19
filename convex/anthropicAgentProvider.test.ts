import { afterEach, describe, expect, test, vi } from "vitest";
import { createAnthropicAgentProvider } from "./anthropicAgentProvider";
import type { AgentTurnRequest } from "./agentProviderTypes";

/**
 * Contract tests for the Anthropic adapter (maintenance plan M3.3).
 *
 * The runtime suite mocks at exactly the provider-adapter boundary, which made
 * the adapters the one seam that was both mocked away in the big suite and
 * untested on their own — a wire-protocol regression here was invisible to
 * every test. These use the adapter's own `fetchImpl` injection, so what is
 * asserted is precisely what would go on the wire and how the streamed reply
 * is normalised back into the neutral turn shape. No network, no SDK.
 */

function sseResponse(events: Array<Record<string, unknown>>) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n`).join("") + "data: [DONE]\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function baseRequest(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return {
    model: { modelId: "model_1", providerKey: "anthropic", providerModelId: "claude-test-1" },
    systemInstruction: "You are the workshop assistant.",
    turns: [{ role: "user", parts: [{ text: "What is on today?" }] }],
    tools: [
      {
        name: "list_bookings",
        description: "List bookings",
        parametersJsonSchema: { type: "object", properties: { day: { type: "string" } } },
      },
    ],
    temperature: 0.4,
    ...overrides,
  };
}

/** One reply's worth of events: usage, a text block, and a clean stop. */
const TEXT_REPLY_EVENTS = [
  { type: "message_start", message: { usage: { input_tokens: 120, cache_read_input_tokens: 80 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Two bookings" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " this morning." } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } },
];

describe("anthropic agent provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("sends the Messages API request the docs describe", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const provider = createAnthropicAgentProvider({
      apiKey: "test-key",
      fetchImpl: async (url, init) => {
        captured = { url: String(url), init: init ?? {} };
        return sseResponse(TEXT_REPLY_EVENTS);
      },
    });

    await provider.streamTurn(
      baseRequest({ reasoningEffort: "MEDIUM", webSearch: true }),
      {}
    );

    expect(captured?.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");

    const body = JSON.parse(String(captured?.init.body));
    expect(body.model).toBe("claude-test-1");
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(8192);
    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });

    // Tools: the declared tool carries the cache breakpoint; web search is
    // appended after it so enabling search never invalidates the cached prefix.
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "list_bookings",
      "web_search",
    ]);
    expect(body.tools[0].input_schema).toEqual({
      type: "object",
      properties: { day: { type: "string" } },
    });
    expect(body.tools[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools[1].type).toBe("web_search_20250305");

    // System prompt rendered as blocks, last one cache-marked.
    expect(body.system).toHaveLength(1);
    expect(body.system[0].text).toBe("You are the workshop assistant.");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });

    expect(body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "What is on today?" }] },
    ]);

    // This adapter has never sent a temperature (extended thinking fixes it
    // at 1), and it ignores cacheName by design.
    expect(body.temperature).toBeUndefined();
  });

  test("asks for a JSON shape in words, since Anthropic has no response-format field", async () => {
    let capturedBody: { system: Array<{ text: string }> } | undefined;
    const provider = createAnthropicAgentProvider({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return sseResponse(TEXT_REPLY_EVENTS);
      },
    });

    await provider.streamTurn(
      baseRequest({ responseJsonSchema: { type: "object", properties: { ok: { type: "boolean" } } } }),
      {}
    );

    const system = capturedBody?.system[0].text ?? "";
    expect(system).toContain("You are the workshop assistant.");
    expect(system).toContain("Reply with JSON only");
    expect(system).toContain('"ok"');
  });

  test("normalises a streamed text reply, fragments delivered in order", async () => {
    const provider = createAnthropicAgentProvider({
      apiKey: "test-key",
      fetchImpl: async () => sseResponse(TEXT_REPLY_EVENTS),
    });

    const fragments: string[] = [];
    const response = await provider.streamTurn(baseRequest(), {
      onText: (fragment) => {
        fragments.push(fragment);
      },
    });

    expect(fragments).toEqual(["Two bookings", " this morning."]);
    expect(response).toEqual({
      text: "Two bookings this morning.",
      toolCalls: [],
      inputTokens: 120,
      outputTokens: 9,
      cachedInputTokens: 80,
      outcome: "COMPLETE",
    });
  });

  test("reassembles a tool call from argument fragments and asks the loop to run it", async () => {
    const provider = createAnthropicAgentProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        sseResponse([
          { type: "message_start", message: { usage: { input_tokens: 50 } } },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "toolu_1", name: "list_bookings" },
          },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"day":' } },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"Tuesday"}' } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 4 } },
        ]),
    });

    const response = await provider.streamTurn(baseRequest(), {});

    expect(response.toolCalls).toEqual([{ name: "list_bookings", args: { day: "Tuesday" } }]);
    expect(response.outcome).toBe("RUN_TOOLS");
    expect(response.text).toBe("");
  });

  test("a truncated reply is reported as such, not as a finished answer", async () => {
    const provider = createAnthropicAgentProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        sseResponse([
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "Half an ans" } },
          { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 3 } },
        ]),
    });

    const response = await provider.streamTurn(baseRequest(), {});

    expect(response.outcome).toBe("TRUNCATED");
    expect(response.text).toBe("Half an ans");
  });

  test("refuses to call out at all without a key", async () => {
    // The factory falls back to the real env var; a developer's own key must
    // not turn this into a live call.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    let called = false;
    const provider = createAnthropicAgentProvider({
      apiKey: undefined,
      fetchImpl: async () => {
        called = true;
        return sseResponse([]);
      },
    });

    await expect(provider.streamTurn(baseRequest(), {})).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(called).toBe(false);
  });
});
