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

  test("retries transient Responses API failures", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<(_: RequestInfo | URL, __?: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          error: { message: "rate limited" },
        }), {
          status: 429,
          headers: { "Retry-After": "1" },
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          output_text: "Reply after retry",
          usage: { input_tokens: 8, output_tokens: 3 },
        }), { status: 200 }));

      const adapter = createOpenAIProviderAdapter({
        env: { OPENAI_API_KEY: "key" },
        fetchImpl,
      });

      const resultPromise = adapter.generateText({
        model: { modelId: "openai:gpt-test", providerKey: "openai", providerModelId: "gpt-test" },
        contents: [{ type: "text", text: "Prompt" }],
      });

      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toEqual({
        text: "Reply after retry",
        inputTokens: 8,
        outputTokens: 3,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("does not retry non-retryable Responses API failures", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "unauthorized" },
    }), { status: 401 }));

    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "key" },
      fetchImpl,
    });

    await expect(adapter.generateText({
      model: { modelId: "openai:gpt-test", providerKey: "openai", providerModelId: "gpt-test" },
      contents: [{ type: "text", text: "Prompt" }],
    })).rejects.toThrow("unauthorized");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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

  test("retries transient model list failures", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<(_: RequestInfo | URL, __?: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          error: { message: "temporary overload" },
        }), { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          data: [{ id: "gpt-test" }],
        }), { status: 200 }));

      const resultPromise = listOpenAIModels({
        env: { OPENAI_API_KEY: "key" },
        fetchImpl,
      });

      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toEqual(["gpt-test"]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

const STREAM_MODEL = {
  modelId: "openai:test-model",
  providerKey: "openai",
  providerModelId: "test-model",
};

function sseResponse(frames: unknown[]) {
  const body = [...frames.map((frame) => `data: ${JSON.stringify(frame)}`), "data: [DONE]", ""].join("\n\n");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** A stream that delivers one frame and then dies, the way a dropped connection does. */
function dyingSseResponse(frame: unknown) {
  const encoder = new TextEncoder();
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    // Pull-based so the frame is genuinely read before the failure lands;
    // erroring inside start() can discard the queued chunk entirely.
    pull(controller) {
      pulls += 1;
      if (pulls === 1) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        return;
      }
      controller.error(new Error("connection reset"));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/**
 * The assistant path streams on OpenAI.
 *
 * Streaming goes over chat completions — the same wire the agent adapter
 * already streams on — while schema and no-listener calls keep the Responses
 * API untouched. Same rules as every streaming path: fragments as they
 * arrive, usage intact, retry only before the first delivered fragment.
 */
describe("openai assistant streaming", () => {
  test("a reply streams through onText and lands with usage intact", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async (url, init) => {
        captured = { url: String(url), body: JSON.parse(String(init?.body)) };
        return sseResponse([
          { choices: [{ delta: { content: "Here is " } }] },
          { choices: [{ delta: { content: "the answer." }, finish_reason: "stop" }] },
          { choices: [], usage: { prompt_tokens: 40, completion_tokens: 6 } },
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
    expect(captured?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(captured?.body).toMatchObject({
      model: "test-model",
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "What is our refund policy?" },
      ],
    });
  });

  test("without a listener the Responses API path is untouched", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async (url, init) => {
        captured = { url: String(url), body: JSON.parse(String(init?.body)) };
        return new Response(JSON.stringify({
          output_text: "Short and unstreamed.",
          usage: { input_tokens: 5, output_tokens: 4 },
        }), { status: 200 });
      },
    });

    const response = await adapter.generateText({
      model: STREAM_MODEL,
      contents: [{ type: "text", text: "Quick one." }],
    });

    expect(response.text).toBe("Short and unstreamed.");
    expect(captured?.url).toBe("https://api.openai.com/v1/responses");
    expect(captured?.body).not.toHaveProperty("stream");
  });

  test("a failure before the first fragment retries; the retry succeeds", async () => {
    let calls = 0;
    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("temporarily unavailable", { status: 503 });
        }
        return sseResponse([
          { choices: [{ delta: { content: "Recovered." }, finish_reason: "stop" }] },
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
    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls += 1;
        return dyingSseResponse({ choices: [{ delta: { content: "the answer was going well " } }] });
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

/**
 * OpenAI's reasoning-family models reject the temperature parameter with a
 * 400. This silently broke every thread title on such models: the sidebar
 * filled with "New Conversation" because the title call failed each time.
 */
describe("openai temperature rejection fallback", () => {
  const rejection = JSON.stringify({
    error: {
      message: "Unsupported parameter: 'temperature' is not supported with this model.",
      type: "invalid_request_error",
      param: "temperature",
      code: null,
    },
  });

  test("a model that rejects temperature gets the call again without it", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        if ("temperature" in body) {
          return new Response(rejection, { status: 400 });
        }
        return new Response(JSON.stringify({ output_text: "A Good Title" }), { status: 200 });
      },
    });

    const response = await adapter.generateText({
      model: STREAM_MODEL,
      contents: [{ type: "text", text: "Name this conversation." }],
      temperature: 0.3,
    });

    expect(response.text).toBe("A Good Title");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty("temperature", 0.3);
    expect(bodies[1]).not.toHaveProperty("temperature");
  });

  test("any other 400 still fails rather than being retried blind", async () => {
    let calls = 0;
    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: "Invalid model." } }), { status: 400 });
      },
    });

    await expect(adapter.generateText({
      model: STREAM_MODEL,
      contents: [{ type: "text", text: "Hello." }],
      temperature: 0.3,
    })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  test("the streamed path falls back the same way before any text is delivered", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const adapter = createOpenAIProviderAdapter({
      env: { OPENAI_API_KEY: "test-key" },
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        if ("temperature" in body) {
          return new Response(rejection, { status: 400 });
        }
        return sseResponse([
          { choices: [{ delta: { content: "Recovered." }, finish_reason: "stop" }] },
        ]);
      },
    });

    const fragments: string[] = [];
    const response = await adapter.generateText({
      model: STREAM_MODEL,
      contents: [{ type: "text", text: "Stream this." }],
      temperature: 0.3,
      onText: (fragment) => { fragments.push(fragment); },
    });

    expect(response.text).toBe("Recovered.");
    expect(fragments.join("")).toBe("Recovered.");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toHaveProperty("temperature");
  });
});
