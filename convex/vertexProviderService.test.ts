import type { GoogleGenAI } from "@google/genai";
import { describe, expect, test, vi } from "vitest";
import {
  buildVertexProviderConfig,
  DEFAULT_VERTEX_LOCATION,
  DEFAULT_VERTEX_PROJECT,
  embedVertexContentWithRetry,
  generateVertexContentWithRetry,
} from "./vertexProviderService";

describe("vertex provider service", () => {
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
});
