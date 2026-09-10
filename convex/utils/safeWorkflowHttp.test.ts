import { describe, expect, test, vi } from "vitest";

import {
  fetchWorkflowAction,
  isBlockedWorkflowAddress,
} from "./safeWorkflowHttp";

const resolvePublic = async () => [{ address: "93.184.216.34" }];

describe("safe workflow HTTP", () => {
  test.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "198.18.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks restricted resolved address %s", (address) => {
    expect(isBlockedWorkflowAddress(address)).toBe(true);
  });

  test.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "allows public resolved address %s",
    (address) => {
      expect(isBlockedWorkflowAddress(address)).toBe(false);
    }
  );

  test("refuses a hostname whose DNS answer is private before fetch", async () => {
    const fetchImplementation = vi.fn();

    await expect(fetchWorkflowAction(
      "https://public-looking.example/hook",
      { method: "POST" },
      {
        fetchImplementation,
        resolveHostname: async () => [{ address: "127.0.0.1" }],
      }
    )).rejects.toThrow("hostname resolved to a restricted address");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  test("refuses redirects without following their Location", async () => {
    const fetchImplementation = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    }));

    await expect(fetchWorkflowAction(
      "https://hooks.example/start",
      {},
      { fetchImplementation, resolveHostname: resolvePublic }
    )).rejects.toThrow("redirects are not allowed");
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  test("cancels a streamed response as soon as it exceeds the cap", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads++;
        if (reads === 1) controller.enqueue(new TextEncoder().encode("12345"));
        else controller.error(new Error("Oversized response must not be drained"));
      },
      cancel,
    }, { highWaterMark: 0 });

    await expect(fetchWorkflowAction(
      "https://hooks.example/data",
      {},
      {
        fetchImplementation: async () => new Response(body),
        resolveHostname: resolvePublic,
        maxResponseBytes: 4,
      }
    )).rejects.toThrow("response exceeds 4 bytes");
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBe(1);
  });

  test("aborts a request that exceeds the deadline", async () => {
    const fetchImplementation = vi.fn(async (_url: string, init?: RequestInit) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })
    );

    await expect(fetchWorkflowAction(
      "https://hooks.example/slow",
      {},
      { fetchImplementation, resolveHostname: resolvePublic, timeoutMs: 1 }
    )).rejects.toMatchObject({ name: "AbortError" });
  });
});
