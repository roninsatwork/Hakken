import { describe, expect, test, vi } from "vitest";
import { buildGoogleAgentConfig, createGoogleAgentProvider } from "./googleAgentProvider";
import { createVertexGenAIClient, streamVertexContentWithRetry } from "./vertexProviderService";
import type { AgentTurnRequest } from "./agentProviderTypes";

/**
 * Contract tests for the Google Vertex adapter (maintenance plan M3.3).
 *
 * Unlike the other two adapters this one speaks through the @google/genai
 * SDK rather than raw HTTP, so the mock sits on `vertexProviderService` — the
 * same seam the SDK occupies — and the assertions cover what the adapter
 * hands the SDK and how it normalises what comes back. The config builder is
 * already a pure function and is asserted directly.
 */

vi.mock("./vertexProviderService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./vertexProviderService")>()),
  createVertexGenAIClient: vi.fn(() => ({}) as never),
  streamVertexContentWithRetry: vi.fn(),
}));

function baseRequest(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return {
    model: { modelId: "model_1", providerKey: "google", providerModelId: "vertex-test-model-1" },
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

describe("google agent config builder", () => {
  test("assembles instruction, tools, grounding, thinking and JSON shape", () => {
    const config = buildGoogleAgentConfig({
      systemInstruction: "You are the workshop assistant.",
      temperature: 0.4,
      tools: [{ functionDeclarations: [{ name: "list_bookings" }] }],
      reasoningEffort: "HIGH",
      webSearch: true,
      responseJsonSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      usingCache: false,
    });

    expect(config).toMatchObject({
      systemInstruction: "You are the workshop assistant.",
      temperature: 0.4,
      thinkingConfig: { thinkingLevel: "HIGH" },
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    });
    // Grounding joins the declared tools rather than replacing them.
    expect((config as { tools: unknown[] }).tools).toEqual([
      { functionDeclarations: [{ name: "list_bookings" }] },
      { googleSearch: {} },
    ]);
  });

  test("with a cache in play the prefix comes from the cache, never repeated inline", () => {
    const config = buildGoogleAgentConfig({
      systemInstruction: "You are the workshop assistant.",
      temperature: 0.4,
      tools: [{ functionDeclarations: [{ name: "list_bookings" }] }],
      cacheName: "caches/prefix_1",
      usingCache: true,
    });

    expect(config).toMatchObject({ temperature: 0.4, cachedContent: "caches/prefix_1" });
    // Repeating these alongside cachedContent is rejected by the API.
    expect(config).not.toHaveProperty("systemInstruction");
    expect(config).not.toHaveProperty("tools");
  });
});

describe("google agent provider", () => {
  test("hands the SDK the resolved model, declarations and config", async () => {
    vi.mocked(streamVertexContentWithRetry).mockResolvedValue({
      text: "Two bookings this morning.",
      functionCalls: [],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 8, cachedContentTokenCount: 40 },
    } as never);

    const provider = createGoogleAgentProvider();
    const response = await provider.streamTurn(baseRequest(), {});

    expect(createVertexGenAIClient).toHaveBeenCalled();
    const [, sdkRequest] = vi.mocked(streamVertexContentWithRetry).mock.calls.at(-1) ?? [];
    expect(sdkRequest).toMatchObject({
      model: "vertex-test-model-1",
      contents: [{ role: "user", parts: [{ text: "What is on today?" }] }],
    });
    const config = (sdkRequest as { config: { tools: Array<{ functionDeclarations: Array<{ name: string }> }> } }).config;
    expect(config.tools[0].functionDeclarations[0].name).toBe("list_bookings");

    expect(response).toEqual({
      text: "Two bookings this morning.",
      toolCalls: [],
      inputTokens: 100,
      outputTokens: 8,
      cachedInputTokens: 40,
      outcome: "COMPLETE",
    });
  });

  test("a cached prefix drops the covered turns from the request", async () => {
    vi.mocked(streamVertexContentWithRetry).mockResolvedValue({
      text: "Done.",
      functionCalls: [],
      usageMetadata: {},
    } as never);

    const provider = createGoogleAgentProvider();
    await provider.streamTurn(
      baseRequest({
        cacheName: "caches/prefix_1",
        cachedPrefixTurns: 1,
        turns: [
          { role: "user", parts: [{ text: "cached opening" }] },
          { role: "user", parts: [{ text: "fresh question" }] },
        ],
      }),
      {}
    );

    const [, sdkRequest] = vi.mocked(streamVertexContentWithRetry).mock.calls.at(-1) ?? [];
    expect((sdkRequest as { contents: unknown[] }).contents).toEqual([
      { role: "user", parts: [{ text: "fresh question" }] },
    ]);
    expect((sdkRequest as { config: { cachedContent?: string } }).config.cachedContent).toBe("caches/prefix_1");
  });

  test("function calls come back as tool calls and ask the loop to run them", async () => {
    vi.mocked(streamVertexContentWithRetry).mockResolvedValue({
      text: "",
      functionCalls: [{ name: "list_bookings", args: { day: "Tuesday" }, thoughtSignature: "sig_1" }],
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 3 },
    } as never);

    const provider = createGoogleAgentProvider();
    const response = await provider.streamTurn(baseRequest(), {});

    expect(response.toolCalls).toEqual([
      { name: "list_bookings", args: { day: "Tuesday" }, thoughtSignature: "sig_1" },
    ]);
    expect(response.outcome).toBe("RUN_TOOLS");
  });

  test("refuses a model that resolved to a different provider", async () => {
    const provider = createGoogleAgentProvider();

    await expect(
      provider.streamTurn(
        baseRequest({ model: { modelId: "m", providerKey: "anthropic", providerModelId: "claude-x" } }),
        {}
      )
    ).rejects.toThrow(/requires a Google Vertex model/);
  });
});
