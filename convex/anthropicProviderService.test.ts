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

  test("retries transient Messages API failures", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<(_: RequestInfo | URL, __?: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          error: { message: "temporarily unavailable" },
        }), { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          content: [{ type: "text", text: "Reply after retry" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }), { status: 200 }));

      const adapter = createAnthropicProviderAdapter({
        env: { ANTHROPIC_API_KEY: "key" },
        fetchImpl,
      });

      const resultPromise = adapter.generateText({
        model: { modelId: "anthropic:claude-test", providerKey: "anthropic", providerModelId: "claude-test" },
        contents: [{ type: "text", text: "Prompt" }],
      });

      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toEqual({
        text: "Reply after retry",
        inputTokens: 10,
        outputTokens: 5,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("does not retry non-retryable Messages API failures", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "unauthorized" },
    }), { status: 401 }));

    const adapter = createAnthropicProviderAdapter({
      env: { ANTHROPIC_API_KEY: "key" },
      fetchImpl,
    });

    await expect(adapter.generateText({
      model: { modelId: "anthropic:claude-test", providerKey: "anthropic", providerModelId: "claude-test" },
      contents: [{ type: "text", text: "Prompt" }],
    })).rejects.toThrow("unauthorized");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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

  test("retries transient model list failures", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<(_: RequestInfo | URL, __?: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          error: { message: "temporary overload" },
        }), { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          data: [{ id: "claude-test", display_name: "Claude Test" }],
        }), { status: 200 }));

      const resultPromise = listAnthropicModels({
        env: { ANTHROPIC_API_KEY: "key" },
        fetchImpl,
      });

      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toEqual([{ id: "claude-test", displayName: "Claude Test" }]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

const STREAM_MODEL = {
  modelId: "anthropic:test-model",
  providerKey: "anthropic",
  providerModelId: "test-model",
};

function anthropicSseResponse(events: Array<Record<string, unknown>>) {
  const body = events
    .map((event) => `event: ${event.type as string}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** A stream that delivers one event and then dies, the way a dropped connection does. */
function dyingAnthropicSseResponse(event: Record<string, unknown>) {
  const encoder = new TextEncoder();
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    // Pull-based so the frame is genuinely read before the failure lands;
    // erroring inside start() can discard the queued chunk entirely.
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(encoder.encode(`event: ${event.type as string}\ndata: ${JSON.stringify(event)}\n\n`));
        return;
      }
      controller.error(new Error("connection reset"));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/**
 * The assistant path streams on Anthropic.
 *
 * The agent adapter already streams this wire; these tests hold the
 * plain-text adapter to the same rules — fragments as they arrive, usage
 * intact across message_start and message_delta, retry only before the first
 * delivered fragment.
 */
describe("anthropic assistant streaming", () => {
  test("a reply streams through onText and lands with usage intact", async () => {
    let captured: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | undefined;
    const adapter = createAnthropicProviderAdapter({
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchImpl: async (url, init) => {
        captured = {
          url: String(url),
          body: JSON.parse(String(init?.body)),
          headers: Object.fromEntries(Object.entries(init?.headers ?? {})),
        };
        return anthropicSseResponse([
          { type: "message_start", message: { usage: { input_tokens: 40, output_tokens: 0 } } },
          { type: "content_block_start", index: 0, content_block: { type: "text" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Here is " } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "the answer." } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 6 } },
        ]);
      },
    });

    const fragments: string[] = [];
    const response = await adapter.generateText({
      model: STREAM_MODEL,
      systemInstruction: "Be concise.",
      contents: [{ type: "text", text: "What is our refund policy?" }],
      onText: (fragment) => { fragments.push(fragment); },
    });

    expect(fragments.join("")).toBe("Here is the answer.");
    expect(response).toMatchObject({
      text: "Here is the answer.",
      inputTokens: 40,
      outputTokens: 6,
    });
    expect(captured?.body).toMatchObject({
      model: "test-model",
      stream: true,
      // Anthropic requires max_tokens; the streaming path keeps the same
      // default the single-write path uses.
      max_tokens: 1024,
      system: "Be concise.",
      messages: [{ role: "user", content: "What is our refund policy?" }],
    });
  });

  test("without a listener the single-write path is untouched", async () => {
    let captured: Record<string, unknown> | undefined;
    const adapter = createAnthropicProviderAdapter({
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchImpl: async (_url, init) => {
        captured = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          content: [{ type: "text", text: "Short and unstreamed." }],
          usage: { input_tokens: 5, output_tokens: 4 },
        }), { status: 200 });
      },
    });

    const response = await adapter.generateText({
      model: STREAM_MODEL,
      contents: [{ type: "text", text: "Quick one." }],
    });

    expect(response.text).toBe("Short and unstreamed.");
    expect(captured).not.toHaveProperty("stream");
  });

  test("a failure before the first fragment retries; the retry succeeds", async () => {
    let calls = 0;
    const adapter = createAnthropicProviderAdapter({
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("temporarily unavailable", { status: 503 });
        }
        return anthropicSseResponse([
          { type: "content_block_start", index: 0, content_block: { type: "text" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Recovered." } },
          { type: "content_block_stop", index: 0 },
        ]);
      },
    });

    const response = await adapter.generateText({
      model: STREAM_MODEL,
      contents: [{ type: "text", text: "Try twice." }],
      onText: () => {},
    });

    expect(calls).toBe(2);
    expect(response.text).toBe("Recovered.");
  }, 15_000);

  test("a stream that dies after the first fragment is not retried", async () => {
    let calls = 0;
    const adapter = createAnthropicProviderAdapter({
      env: { ANTHROPIC_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls += 1;
        return dyingAnthropicSseResponse({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "the answer was going well " },
        });
      },
    });

    const fragments: string[] = [];
    await expect(adapter.generateText({
      model: STREAM_MODEL,
      contents: [{ type: "text", text: "Doomed question." }],
      onText: (fragment) => { fragments.push(fragment); },
    })).rejects.toThrow();

    // The reader saw text, so a retry would have replayed the answer.
    expect(calls).toBe(1);
    expect(fragments.join("")).toContain("the answer was going well");
  });
});
