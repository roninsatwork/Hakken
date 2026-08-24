import { describe, expect, test } from "vitest";

import { buildOpenAITurnOptions, createOpenAIAgentProvider } from "./openaiAgentProvider";
import type { AgentTurnRequest } from "./agentProviderTypes";

/**
 * The gap a live run found, 2026-08-03: the agent screen offered an OpenAI
 * model and the run refused at the first step, because the runtime had no
 * adapter for the provider. These tests hold the adapter to the same contract
 * the loop already depends on for the other three providers — request shape
 * out, streamed turn back, tool calls and usage intact.
 *
 * The wire dialect is OpenAI's own chat-completions format; the translation
 * helpers are shared with the OpenRouter adapter, which mimics it.
 */

const MODEL = {
  modelId: "openai:test-model",
  providerKey: "openai",
  providerModelId: "test-model",
};

function sseResponse(frames: unknown[]) {
  const body = [...frames.map((frame) => `data: ${JSON.stringify(frame)}`), "data: [DONE]", ""].join("\n\n");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function baseRequest(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return {
    model: MODEL,
    systemInstruction: "Be concise.",
    turns: [{ role: "user", parts: [{ text: "What is our refund policy?" }] }],
    tools: [],
    temperature: 0.1,
    ...overrides,
  };
}

describe("the OpenAI agent adapter", () => {
  test("streams a text turn and reports usage", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const provider = createOpenAIAgentProvider({
      apiKey: "test-key",
      fetchImpl: async (url, init) => {
        captured = { url: String(url), body: JSON.parse(String(init?.body)) };
        return sseResponse([
          { choices: [{ delta: { content: "Here is " } }] },
          { choices: [{ delta: { content: "the answer." }, finish_reason: "stop" }] },
          { choices: [], usage: { prompt_tokens: 40, completion_tokens: 6, prompt_tokens_details: { cached_tokens: 12 } } },
        ]);
      },
    });

    const fragments: string[] = [];
    const response = await provider.streamTurn(
      baseRequest({ reasoningEffort: "MEDIUM" }),
      { onText: (fragment) => { fragments.push(fragment); } },
    );

    expect(response).toMatchObject({
      text: "Here is the answer.",
      toolCalls: [],
      inputTokens: 40,
      outputTokens: 6,
      cachedInputTokens: 12,
      outcome: "COMPLETE",
    });
    expect(fragments.join("")).toBe("Here is the answer.");

    expect(captured?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(captured?.body).toMatchObject({
      model: "test-model",
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: "medium",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "What is our refund policy?" },
      ],
    });
    // No hosted search and no cache resource: OpenAI caches automatically, and
    // its hosted search belongs to dedicated models only.
    expect(captured?.body).not.toHaveProperty("plugins");
    expect(captured?.body).not.toHaveProperty("web_search_options");
  });

  test("returns a tool call as RUN_TOOLS with its arguments parsed", async () => {
    const provider = createOpenAIAgentProvider({
      apiKey: "test-key",
      fetchImpl: async () => sseResponse([
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: "call_1",
                function: { name: "search_knowledge", arguments: "{\"query\":" },
              }],
            },
          }],
        },
        {
          choices: [{
            delta: { tool_calls: [{ index: 0, function: { arguments: "\"refunds\"}" } }] },
            finish_reason: "tool_calls",
          }],
        },
        { choices: [], usage: { prompt_tokens: 30, completion_tokens: 9 } },
      ]),
    });

    const response = await provider.streamTurn(
      baseRequest({
        tools: [{ name: "search_knowledge", description: "Search.", parametersJsonSchema: { type: "object" } }],
      }),
      {},
    );

    expect(response.outcome).toBe("RUN_TOOLS");
    expect(response.toolCalls).toEqual([
      { name: "search_knowledge", args: { query: "refunds" } },
    ]);
  });

  test("sets reasoning to 'none' when tools are declared, as the provider instructs", async () => {
    // The first live agent turn failed with a 400 whose message says it
    // plainly: "To use function tools, use /v1/responses or set
    // reasoning_effort to 'none'." Omitting the field is not enough — the
    // model reasons by default. Tools are the agent's job, so they win.
    let body: Record<string, unknown> | undefined;
    const provider = createOpenAIAgentProvider({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return sseResponse([
          { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
        ]);
      },
    });

    await provider.streamTurn(
      baseRequest({
        reasoningEffort: "HIGH",
        tools: [{ name: "search_knowledge", description: "Search.", parametersJsonSchema: { type: "object" } }],
      }),
      {},
    );

    expect(body).toMatchObject({ reasoning_effort: "none" });
    expect(body).toHaveProperty("tools");
  });

  test("refuses to run without a key, naming the variable to set", async () => {
    const provider = createOpenAIAgentProvider({ apiKey: "", fetchImpl: async () => sseResponse([]) });
    await expect(provider.streamTurn(baseRequest(), {})).rejects.toThrow("OPENAI_API_KEY");
  });

  test("asks for structured output in OpenAI's response_format shape", () => {
    const options = buildOpenAITurnOptions({
      responseJsonSchema: { type: "object", properties: { done: { type: "boolean" } } },
    });
    expect(options).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: { name: "agent_response", strict: true },
      },
    });
  });
});
