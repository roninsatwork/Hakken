import { afterEach, describe, expect, test, vi } from "vitest";
import { createOpenRouterAgentProvider } from "./openrouterAgentProvider";
import type { AgentTurnRequest } from "./agentProviderTypes";

/**
 * Contract tests for the OpenRouter adapter (maintenance plan M3.3).
 *
 * Same reasoning as the Anthropic file: the runtime suite mocks at the
 * adapter boundary, so the wire protocol had no test at all. The adapter's
 * `fetchImpl` injection lets these assert the exact chat-completions request
 * and the normalisation of the streamed reply, with no network involved.
 */

function sseResponse(events: Array<Record<string, unknown>>) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n`).join("") + "data: [DONE]\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function baseRequest(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return {
    model: { modelId: "model_1", providerKey: "openrouter", providerModelId: "anthropic/claude-test" },
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

/** A text reply with the usage-carrying final frame `include_usage` asks for. */
const TEXT_REPLY_EVENTS = [
  { choices: [{ delta: { content: "Two bookings" } }] },
  { choices: [{ delta: { content: " this morning." } }] },
  { choices: [{ delta: {}, finish_reason: "stop" }] },
  {
    choices: [],
    usage: { prompt_tokens: 140, completion_tokens: 11, prompt_tokens_details: { cached_tokens: 90 } },
  },
];

describe("openrouter agent provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("sends the chat-completions request the docs describe", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const provider = createOpenRouterAgentProvider({
      apiKey: "test-key",
      fetchImpl: async (url, init) => {
        captured = { url: String(url), init: init ?? {} };
        return sseResponse(TEXT_REPLY_EVENTS);
      },
    });

    await provider.streamTurn(
      baseRequest({
        reasoningEffort: "HIGH",
        webSearch: true,
        responseJsonSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      }),
      {}
    );

    expect(captured?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(String(captured?.init.body));
    expect(body.model).toBe("anthropic/claude-test");
    expect(body.stream).toBe(true);
    // Without this the final frame carries no usage and the run cannot be
    // costed — the one field a billing regression would silently remove.
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.max_tokens).toBe(8192);
    expect(body.temperature).toBe(0.4);
    expect(body.reasoning).toEqual({ effort: "high" });
    expect(body.plugins).toEqual([{ id: "web" }]);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "agent_response",
        strict: true,
        schema: { type: "object", properties: { ok: { type: "boolean" } } },
      },
    });

    // System prompt travels as the first message on this protocol.
    expect(body.messages[0]).toEqual({ role: "system", content: "You are the workshop assistant." });
    expect(body.messages).toHaveLength(2);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.name).toBe("list_bookings");
  });

  test("normalises a streamed text reply with the usage frame applied", async () => {
    const provider = createOpenRouterAgentProvider({
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
      inputTokens: 140,
      outputTokens: 11,
      cachedInputTokens: 90,
      outcome: "COMPLETE",
    });
  });

  test("reassembles a tool call whose arguments arrive in fragments", async () => {
    const provider = createOpenRouterAgentProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        sseResponse([
          {
            choices: [{
              delta: {
                tool_calls: [{ index: 0, id: "call_1", function: { name: "list_bookings", arguments: '{"day":' } }],
              },
            }],
          },
          {
            choices: [{
              delta: { tool_calls: [{ index: 0, function: { arguments: '"Tuesday"}' } }] },
              finish_reason: "tool_calls",
            }],
          },
          { choices: [], usage: { prompt_tokens: 60, completion_tokens: 5 } },
        ]),
    });

    const response = await provider.streamTurn(baseRequest(), {});

    expect(response.toolCalls).toEqual([
      expect.objectContaining({ name: "list_bookings", args: { day: "Tuesday" } }),
    ]);
    expect(response.outcome).toBe("RUN_TOOLS");
  });

  test("a length-stopped reply is reported truncated, not complete", async () => {
    const provider = createOpenRouterAgentProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        sseResponse([
          { choices: [{ delta: { content: "Half an ans" }, finish_reason: "length" }] },
        ]),
    });

    const response = await provider.streamTurn(baseRequest(), {});

    expect(response.outcome).toBe("TRUNCATED");
  });

  test("refuses to call out at all without a key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    let called = false;
    const provider = createOpenRouterAgentProvider({
      apiKey: undefined,
      fetchImpl: async () => {
        called = true;
        return sseResponse([]);
      },
    });

    await expect(provider.streamTurn(baseRequest(), {})).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(called).toBe(false);
  });
});
