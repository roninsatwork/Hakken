import { describe, expect, test, vi } from "vitest";
import { ProviderRuntimeError } from "./aiProviderRetryService";
import { parseProviderJsonResponse, requestProviderJson } from "./providerHttpService";

describe("provider HTTP service", () => {
  test("parses successful provider JSON responses", async () => {
    await expect(parseProviderJsonResponse(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
      "Test Provider"
    )).resolves.toEqual({ ok: true });
  });

  test("classifies throttled provider responses as retryable with Retry-After", async () => {
    await expect(parseProviderJsonResponse(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
        headers: { "Retry-After": "2" },
      }),
      "Test Provider"
    )).rejects.toMatchObject({
      status: 429,
      retryable: true,
      retryAfterMs: 2000,
    });
  });

  test("treats invalid successful JSON as non-retryable", async () => {
    await expect(parseProviderJsonResponse(
      new Response("not-json", { status: 200 }),
      "Test Provider"
    )).rejects.toMatchObject({
      retryable: false,
      safeProviderMessage: "Test Provider returned invalid JSON.",
    });
  });

  test("retries provider requests through the shared retry helper", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<(_: RequestInfo | URL, __?: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          error: { message: "busy" },
        }), {
          status: 503,
          headers: { "Retry-After": "1" },
        }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const requestPromise = requestProviderJson({
        providerKey: "test",
        providerName: "Test Provider",
        operation: "testOperation",
        fetchImpl,
        url: "https://provider.example/test",
        init: { method: "POST" },
        retryPolicy: {
          maxAttempts: 2,
          jitterRatio: 0,
        },
      });

      await vi.runAllTimersAsync();
      await expect(requestPromise).resolves.toEqual({ ok: true });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("preserves provider runtime errors after retry exhaustion", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "unavailable" },
    }), { status: 503 }));

    await expect(requestProviderJson({
      providerKey: "test",
      providerName: "Test Provider",
      operation: "testOperation",
      fetchImpl,
      url: "https://provider.example/test",
      init: { method: "GET" },
      retryPolicy: {
        maxAttempts: 1,
      },
    })).rejects.toBeInstanceOf(ProviderRuntimeError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
