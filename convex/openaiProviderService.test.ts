import { describe, expect, test, vi } from "vitest";
import {
  buildOpenAIProviderConfig,
  createOpenAIProviderAdapter,
  extractOpenAIResponseText,
  listOpenAIModels,
} from "./openaiProviderService";

describe("openai provider service", () => {
  test("requires an API key", () => {
    expect(() => buildOpenAIProviderConfig({ env: {} })).toThrow("OpenAI credentials are missing OPENAI_API_KEY.");
  });

  test("accepts common OpenAI API key environment aliases", () => {
    expect(buildOpenAIProviderConfig({ env: { OPENAI_API_KEY: " primary-key " } }).apiKey).toBe("primary-key");
    expect(buildOpenAIProviderConfig({ env: { OPEN_AI_API_KEY: "split-key" } }).apiKey).toBe("split-key");
    expect(buildOpenAIProviderConfig({ env: { OPENAI_KEY: "short-key" } }).apiKey).toBe("short-key");
  });

  test("extracts response text from output_text or content blocks", () => {
    expect(extractOpenAIResponseText({ output_text: "Hello" })).toBe("Hello");
    expect(extractOpenAIResponseText({
      output: [
        { content: [{ text: "One " }, { text: "Two" }] },
      ],
    })).toBe("One Two");
  });

  test("generates text through the Responses API", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "gpt-test",
        input: [
          { role: "system", content: "System" },
          { role: "user", content: "Prompt" },
        ],
      });
      return new Response(JSON.stringify({
        output_text: "Reply",
        usage: { input_tokens: 12, output_tokens: 4 },
      }), { status: 200 });
    });

    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "key" },
      fetchImpl,
    });

    await expect(adapter.generateText({
      model: { modelId: "openai:gpt-test", providerKey: "openai", providerModelId: "gpt-test" },
      systemInstruction: "System",
      contents: [{ type: "text", text: "Prompt" }],
    })).resolves.toEqual({
      text: "Reply",
      inputTokens: 12,
      outputTokens: 4,
    });
  });

  test("lists model IDs from the account model endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: "gpt-test" }, { id: "" }, { id: "text-embedding-3-small" }],
    }), { status: 200 }));

    await expect(listOpenAIModels({
      env: { OPENAI_API_KEY: "key" },
      fetchImpl,
    })).resolves.toEqual(["gpt-test", "text-embedding-3-small"]);
  });
});
