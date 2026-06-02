import { describe, expect, test, vi } from "vitest";
import {
  buildAnthropicProviderConfig,
  createAnthropicProviderAdapter,
  extractAnthropicResponseText,
  listAnthropicModels,
} from "./anthropicProviderService";

describe("anthropic provider service", () => {
  test("requires an API key", () => {
    expect(() => buildAnthropicProviderConfig({ env: {} })).toThrow("Anthropic credentials are missing ANTHROPIC_API_KEY.");
  });

  test("extracts response text from text content blocks", () => {
    expect(extractAnthropicResponseText({
      content: [
        { type: "text", text: "One " },
        { type: "text", text: "Two" },
      ],
    })).toBe("One Two");
  });

  test("generates text through the Messages API", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "anthropic-version": "2023-06-01",
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "claude-test",
        max_tokens: 1024,
        system: "System",
        messages: [{ role: "user", content: "Prompt" }],
      });
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "Reply" }],
        usage: { input_tokens: 12, output_tokens: 4 },
      }), { status: 200 });
    });

    const adapter = createAnthropicProviderAdapter({
      env: { ANTHROPIC_API_KEY: "key" },
      fetchImpl,
    });

    await expect(adapter.generateText({
      model: { modelId: "anthropic:claude-test", providerKey: "anthropic", providerModelId: "claude-test" },
      systemInstruction: "System",
      contents: [{ type: "text", text: "Prompt" }],
    })).resolves.toEqual({
      text: "Reply",
      inputTokens: 12,
      outputTokens: 4,
    });
  });

  test("lists model IDs and display names from the account model endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: "claude-test", display_name: "Claude Test" },
        { id: "" },
      ],
    }), { status: 200 }));

    await expect(listAnthropicModels({
      env: { ANTHROPIC_API_KEY: "key" },
      fetchImpl,
    })).resolves.toEqual([{ id: "claude-test", displayName: "Claude Test" }]);
  });
});
