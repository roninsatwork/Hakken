import type { GoogleGenAI } from "@google/genai";
import { describe, expect, test, vi } from "vitest";
import { whileMovingClock } from "@/src/test/realTime";
import {
  buildVertexProviderConfig,
  createVertexGenAIClient,
  listVertexModels,
  VERTEX_TEXT_CLIENT,
  DEFAULT_VERTEX_LOCATION,
  DEFAULT_VERTEX_PROJECT,
  embedVertexContentWithRetry,
  generateVertexContentWithRetry,
  streamVertexContentWithRetry,
  vertexModelRules,
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

  test("writing asks Google's US region on the v1 address; anything else keeps the configured location and the library's address", () => {
    // Read off the client the library builds, so a library upgrade that
    // changes where a location goes fails here rather than in the field.
    const env = { GOOGLE_CLOUD_LOCATION: "global", GOOGLE_CLIENT_EMAIL: "probe@example.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: "not-a-real-key" };
    const addressOf = (ai: GoogleGenAI) => {
      const client = (ai as unknown as { apiClient: { getBaseUrl(): string; getApiVersion(): string } }).apiClient;
      return `${client.getBaseUrl()}${client.getApiVersion()}`;
    };

    expect(VERTEX_TEXT_CLIENT).toEqual({ location: "us", apiVersion: "v1" });
    expect(addressOf(createVertexGenAIClient({ env, ...VERTEX_TEXT_CLIENT }))).toBe("https://aiplatform.us.rep.googleapis.com/v1");
    expect(addressOf(createVertexGenAIClient({ env }))).toBe("https://aiplatform.googleapis.com/v1beta1");
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

      await expect(whileMovingClock(resultPromise)).resolves.toMatchObject({ text: "ok" });
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

      await expect(whileMovingClock(resultPromise)).resolves.toMatchObject({
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

  test("keeps each streamed function call's own id, and adds none where the model gave none", async () => {
    // Gemini 3.8 Flash and Gemini 4 require the answer to a call to carry the
    // call's id. Reading it off the part here is the start of carrying it back.
    const ai = streamingClient([
      {
        candidates: [{
          content: {
            parts: [
              { functionCall: { id: "call-1", name: "read_search_console", args: {} }, thoughtSignature: "signature-one" },
              { functionCall: { name: "read_site_overview", args: {} } },
            ],
          },
        }],
      },
    ]);

    const response = await streamVertexContentWithRetry(ai, { model: "model-test", contents: "Read the figures" });

    expect(response.functionCalls?.[0]).toMatchObject({ id: "call-1", name: "read_search_console", thoughtSignature: "signature-one" });
    expect(response.functionCalls?.[1]).not.toHaveProperty("id");
  });
});

/**
 * What each Gemini takes, from Google's guides to Gemini 3.8 Flash and Gemini 4
 * Argon (read 2026-11-09): sampling ignored from 3 on, Minimal thinking refused
 * on 3.8 Flash, Pro and 4, and no explicit prompt cache on 4.
 */
describe("vertex model rules", () => {
  test("Gemini 2.5 takes everything it took before", () => {
    expect(vertexModelRules("gemini-2.5-flash")).toEqual({
      honoursTemperature: true,
      takesMinimalThinking: true,
      takesPromptCache: true,
    });
  });

  test("Gemini 3 ignores temperature, and keeps Minimal only on Flash before 3.7 and on Flash-Lite", () => {
    for (const id of ["gemini-3-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite-preview"]) {
      expect(vertexModelRules(id), id).toEqual({ honoursTemperature: false, takesMinimalThinking: true, takesPromptCache: true });
    }
    for (const id of ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview"]) {
      expect(vertexModelRules(id), id).toEqual({ honoursTemperature: false, takesMinimalThinking: false, takesPromptCache: true });
    }
  });

  test("Gemini 4 takes no temperature, no Minimal thinking and no explicit prompt cache", () => {
    // `argon` is neither Pro nor Flash: the family is read as any word.
    expect(vertexModelRules("gemini-4-argon")).toEqual({
      honoursTemperature: false,
      takesMinimalThinking: false,
      takesPromptCache: false,
    });
  });

  test("reads the model id out of a full Vertex resource name", () => {
    expect(vertexModelRules("publishers/google/models/gemini-4-argon").takesPromptCache).toBe(false);
  });

  test("a model id that is not Gemini keeps today's behaviour", () => {
    expect(vertexModelRules("vertex-test-model-1")).toEqual({
      honoursTemperature: true,
      takesMinimalThinking: true,
      takesPromptCache: true,
    });
  });
});
