import { describe, expect, test, vi } from "vitest";
import {
  ProviderRuntimeError,
  calculateRetryDelayMs,
  classifyProviderError,
  isRetryableHttpStatus,
  parseRetryAfterMs,
  withProviderRetry,
} from "./aiProviderRetryService";

describe("ai provider retry service", () => {
  test("classifies retryable and non-retryable HTTP statuses", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(401)).toBe(false);
  });

  test("parses Retry-After seconds and HTTP dates", () => {
    expect(parseRetryAfterMs(new Headers({ "Retry-After": "2" }))).toBe(2000);
    expect(parseRetryAfterMs(
      new Headers({ "Retry-After": "Tue, 09 Jun 2026 12:00:05 GMT" }),
      Date.parse("Tue, 09 Jun 2026 12:00:00 GMT")
    )).toBe(5000);
    expect(parseRetryAfterMs(new Headers({ "Retry-After": "not-a-date" }))).toBeUndefined();
  });

  test("uses bounded exponential delay with deterministic jitter", () => {
    expect(calculateRetryDelayMs({
      attempt: 2,
      policy: {
        maxAttempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterRatio: 0,
      },
    })).toBe(2000);

    expect(calculateRetryDelayMs({
      attempt: 1,
      retryAfterMs: 60000,
      policy: {
        maxAttempts: 4,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        jitterRatio: 0,
      },
    })).toBe(30000);
  });

  test("classifies provider runtime errors without losing metadata", () => {
    const error = new ProviderRuntimeError("rate limited", {
      providerKey: "openai",
      status: 429,
      retryable: true,
      retryAfterMs: 1200,
    });

    expect(classifyProviderError(error)).toMatchObject({
      providerKey: "openai",
      status: 429,
      retryable: true,
      retryAfterMs: 1200,
    });
  });

  test("retries retryable failures and returns the later success", async () => {
    const sleep = vi.fn(async () => undefined);
    const operation = vi
      .fn<(_: number) => Promise<string>>()
      .mockRejectedValueOnce(new ProviderRuntimeError("rate limited", {
        status: 429,
        retryable: true,
        retryAfterMs: 2500,
      }))
      .mockResolvedValueOnce("ok");

    const onRetry = vi.fn();
    await expect(withProviderRetry({
      providerKey: "openai",
      providerName: "OpenAI",
      operation: "generateText",
      policy: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        jitterRatio: 0,
        sleep,
      },
      onRetry,
    }, operation)).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2500);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "openai",
      attempt: 1,
      delayMs: 2500,
      status: 429,
    }));
  });

  test("does not retry non-retryable failures", async () => {
    const sleep = vi.fn(async () => undefined);
    const operation = vi.fn(async () => {
      throw new ProviderRuntimeError("unauthorized", {
        status: 401,
        retryable: false,
      });
    });

    await expect(withProviderRetry({
      providerName: "OpenAI",
      operation: "listModels",
      policy: { maxAttempts: 3, sleep },
    }, operation)).rejects.toThrow("unauthorized");

    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test("retries network TypeErrors before exhausting", async () => {
    const sleep = vi.fn(async () => undefined);
    const operation = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(withProviderRetry({
      providerName: "Anthropic",
      operation: "generateText",
      policy: {
        maxAttempts: 2,
        baseDelayMs: 10,
        maxDelayMs: 10,
        jitterRatio: 0,
        sleep,
      },
    }, operation)).rejects.toThrow("fetch failed");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
