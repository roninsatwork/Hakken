import { describe, expect, test, vi } from "vitest";
import { createGoogleProviderAdapter, parseGoogleThinkingLevel } from "./googleProviderAdapter";
import { createVertexGenAIClient, generateVertexContentWithRetry, vertexModelRules, VERTEX_TEXT_CLIENT } from "./vertexProviderService";
import type { AiGenerationRequest } from "./aiRuntimeTypes";

/**
 * The single-answer Google adapter, held to what each model takes.
 *
 * What a model takes is decided by its id in `vertexModelRules`, tested in
 * vertexProviderService.test.ts with real ids. Here it is set per test, so what
 * is asserted is that the adapter asks it and does what it says.
 */

vi.mock("./vertexProviderService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./vertexProviderService")>()),
  createVertexGenAIClient: vi.fn(() => ({}) as never),
  generateVertexContentWithRetry: vi.fn(async () => ({ text: "{}", usageMetadata: {} })),
  vertexModelRules: vi.fn(() => ({ honoursTemperature: true, takesMinimalThinking: true, takesPromptCache: true, thinksByDefault: false })),
}));

const NEWER_MODEL_RULES = { honoursTemperature: false, takesMinimalThinking: false, takesPromptCache: false, thinksByDefault: true };

function request(overrides: Partial<AiGenerationRequest> = {}): AiGenerationRequest {
  return {
    model: { modelId: "model_1", providerKey: "google", providerModelId: "vertex-test-model-1" },
    systemInstruction: "Write the bubble.",
    contents: [{ type: "text", text: "The figures." }],
    temperature: 0.2,
    ...overrides,
  };
}

function lastConfig() {
  const [, params] = vi.mocked(generateVertexContentWithRetry).mock.calls.at(-1) ?? [];
  return (params as unknown as { config: Record<string, unknown> }).config;
}

describe("google thinking level", () => {
  test("Minimal stays Minimal where the model takes it, and becomes Low where it would be refused", () => {
    expect(parseGoogleThinkingLevel("MINIMAL", { takesMinimalThinking: true })).toBe("MINIMAL");
    expect(parseGoogleThinkingLevel("MINIMAL", { takesMinimalThinking: false })).toBe("LOW");
  });

  test("the other levels pass as they are, and an unknown one sends none", () => {
    for (const rules of [{ takesMinimalThinking: true }, { takesMinimalThinking: false }]) {
      expect(parseGoogleThinkingLevel("LOW", rules)).toBe("LOW");
      expect(parseGoogleThinkingLevel("MEDIUM", rules)).toBe("MEDIUM");
      expect(parseGoogleThinkingLevel("HIGH", rules)).toBe("HIGH");
      expect(parseGoogleThinkingLevel("NONE", rules)).toBeUndefined();
    }
  });
});

describe("google provider adapter", () => {
  test("a newer model gets no temperature, and Low where Minimal was asked", async () => {
    vi.mocked(vertexModelRules).mockReturnValueOnce(NEWER_MODEL_RULES);

    await createGoogleProviderAdapter().generateText(request({ thinkingLevel: "MINIMAL" }));

    expect(vertexModelRules).toHaveBeenLastCalledWith("vertex-test-model-1");
    expect(lastConfig()).not.toHaveProperty("temperature");
    expect(lastConfig()).toMatchObject({ systemInstruction: "Write the bubble.", thinkingConfig: { thinkingLevel: "LOW" } });
  });

  test("an older model keeps its temperature and its Minimal thinking", async () => {
    await createGoogleProviderAdapter().generateText(request({ thinkingLevel: "MINIMAL" }));

    expect(lastConfig()).toMatchObject({ temperature: 0.2, thinkingConfig: { thinkingLevel: "MINIMAL" } });
  });

  test("Fast is Low on a model that thinks unless told, and nothing on one that does not", async () => {
    vi.mocked(vertexModelRules).mockReturnValueOnce(NEWER_MODEL_RULES);
    await createGoogleProviderAdapter().generateText(request({ thinkingLevel: "NONE" }));
    expect(lastConfig()).toMatchObject({ thinkingConfig: { thinkingLevel: "LOW" } });

    await createGoogleProviderAdapter().generateText(request({ thinkingLevel: "NONE" }));
    expect(lastConfig()).not.toHaveProperty("thinkingConfig");
  });

  test("writes in Google's US region on the v1 address, unless a location is given", async () => {
    await createGoogleProviderAdapter().generateText(request());
    expect(createVertexGenAIClient).toHaveBeenLastCalledWith(VERTEX_TEXT_CLIENT);

    await createGoogleProviderAdapter({ location: "europe-west2" }).generateText(request());
    expect(createVertexGenAIClient).toHaveBeenLastCalledWith({ location: "europe-west2", apiVersion: "v1" });
  });
});
