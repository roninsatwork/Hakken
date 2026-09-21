import type { GoogleGenAI } from "@google/genai";
import { describe, expect, test, vi } from "vitest";
import {
  buildVertexProviderConfig,
  listVertexModels,
  DEFAULT_VERTEX_LOCATION,
  DEFAULT_VERTEX_PROJECT,
  embedVertexContentWithRetry,
  generateVertexContentWithRetry,
  streamVertexContentWithRetry,
} from "./vertexProviderService";

/** A streaming client yielding the given chunks, shaped as the SDK yields them. */
function streamingClient(chunks: unknown[]) {
  return {
    models: {
      generateContentStream: vi.fn(async () => (async function* () {
        for (const chunk of chunks) yield chunk;
      })()),
    },
  } as unknown as GoogleGenAI;
}

/**
 * A pager shaped as @google/genai shapes it: `page` is the current page's
 * items, and `nextPage()` advances the pager and returns the new items — it
 * does not return another pager.
 */
function pagingClient(pages: { name: string }[][]) {
  let index = 0;
  const pager = {
    get page() { return pages[index]; },
    hasNextPage: () => index < pages.length - 1,
    nextPage: async () => { index += 1; return pages[index]; },
  };
  return { models: { list: vi.fn(async () => pager) } } as unknown as GoogleGenAI;
}

describe("vertex provider service", () => {
  test("collects models from every page, not just the first", async () => {
    const models = await listVertexModels(pagingClient([
      [{ name: "publishers/google/models/alpha-model" }],
      [{ name: "publishers/google/models/beta-model" }],
      [{ name: "publishers/google/models/gamma-model" }],
    ]));

    expect(models.map((model) => model.modelId)).toEqual([
      "alpha-model",
      "beta-model",
      "gamma-model",
    ]);
  });

  test("stops at the page limit rather than following a pager forever", async () => {
    const models = await listVertexModels(
      pagingClient([
        [{ name: "publishers/google/models/first-entry" }],
        [{ name: "publishers/google/models/second-entry" }],
        [{ name: "publishers/google/models/third-entry" }],
      ]),
      { pageLimit: 2 },
    );

    expect(models.map((model) => model.modelId)).toEqual(["first-entry", "second-entry"]);
  });

  test("builds Vertex client config from environment values", () => {
    expect(
      buildVertexProviderConfig({
        env: {
          GOOGLE_CLOUD_PROJECT: "project-a",
          GOOGLE_CLOUD_LOCATION: "europe-west2",
          GOOGLE_CLIENT_EMAIL: "svc@example.com",
          GOOGLE_PRIVATE_KEY: "line-one\\nline-two",
        },
      })
    ).toEqual({
      project: "project-a",
      location: "europe-west2",
      credentials: {
        client_email: "svc@example.com",
        private_key: "line-one\nline-two",
      },
    });
  });

  test("uses stable Vertex defaults when project and location are not configured", () => {
    expect(
      buildVertexProviderConfig({
        env: {
          GOOGLE_CLIENT_EMAIL: "svc@example.com",
          GOOGLE_PRIVATE_KEY: "key",
        },
      })
    ).toMatchObject({
      project: DEFAULT_VERTEX_PROJECT,
      location: DEFAULT_VERTEX_LOCATION,
    });
  });

  test("throws a clear error when Vertex credentials are missing", () => {
    expect(() => buildVertexProviderConfig({ env: {} })).toThrow(
      "Vertex AI credentials are missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY."
    );
  });

  test("retries retryable Google generation errors", async () => {
    vi.useFakeTimers();
    try {
      const generateContent = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error("RESOURCE_EXHAUSTED: quota burst exhausted"), {
          code: "RESOURCE_EXHAUSTED",
          status: 429,
        }))
        .mockResolvedValueOnce({ text: "ok" });
      const ai = { models: { generateContent } } as unknown as GoogleGenAI;

      const resultPromise = generateVertexContentWithRetry(ai, {
        model: "model-test",
        contents: "Prompt",
      }, {
        retryPolicy: { maxAttempts: 2, baseDelayMs: 1000, jitterRatio: 0 },
      });

      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toMatchObject({ text: "ok" });
      expect(generateContent).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("retries retryable Google embedding errors", async () => {
    vi.useFakeTimers();
    try {
      const embedContent = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error("UNAVAILABLE"), {
          code: "UNAVAILABLE",
        }))
        .mockResolvedValueOnce({ embeddings: [{ values: [0.1, 0.2] }] });
      const ai = { models: { embedContent } } as unknown as GoogleGenAI;

      const resultPromise = embedVertexContentWithRetry(ai, {
        model: "text-embedding-004",
        contents: "Prompt",
      }, {
        retryPolicy: { maxAttempts: 2, baseDelayMs: 1000, jitterRatio: 0 },
      });

      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toMatchObject({
        embeddings: [{ values: [0.1, 0.2] }],
      });
      expect(embedContent).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The regression this suite exists to hold: the stream used to read the SDK's
   * `functionCalls` accessor, which returns the call without the thought
   * signature sitting beside it on the part. Gemini 3 requires that signature
   * back on the next turn, so every tool call died one turn after it ran.
   */
  test("keeps the thought signature attached to each streamed function call", async () => {
    const ai = streamingClient([
      {
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: "run_scraper_job", args: { actorId: "research" } },
              thoughtSignature: "signature-one",
            }],
          },
        }],
      },
      {
        candidates: [{
          content: {
            parts: [{
              functionCall: { name: "firecrawl_scrape", args: { url: "https://example.com" } },
              thoughtSignature: "signature-two",
            }],
          },
        }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    ]);

    const response = await streamVertexContentWithRetry(ai, {
      model: "model-test",
      contents: "Collect the listings",
    });

    expect(response.functionCalls).toEqual([
      {
        name: "run_scraper_job",
        args: { actorId: "research" },
        thoughtSignature: "signature-one",
      },
      {
        name: "firecrawl_scrape",
        args: { url: "https://example.com" },
        thoughtSignature: "signature-two",
      },
    ]);
  });

  test("reports no function calls when a model turn only speaks", async () => {
    const ai = streamingClient([
      { candidates: [{ content: { parts: [{ text: "Here you go." }] } }], text: "Here you go." },
    ]);

    const fragments: string[] = [];
    const response = await streamVertexContentWithRetry(ai, {
      model: "model-test",
      contents: "Say hello",
    }, { onText: (fragment) => { fragments.push(fragment); } });

    expect(response.functionCalls).toBeUndefined();
    expect(response.text).toBe("Here you go.");
    expect(fragments).toEqual(["Here you go."]);
  });
});
