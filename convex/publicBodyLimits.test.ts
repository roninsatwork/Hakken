import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";

beforeEach(() => {
  vi.stubEnv("APIFY_WEBHOOK_SECRET", "body-limit-test-secret");
  vi.stubEnv("VOICE_RELAY_SECRET", "body-limit-test-secret");
});
afterEach(() => vi.unstubAllEnvs());

const surfaces = [
  { path: "/apify-webhook", limit: 128 * 1024, headers: { "X-Apify-Secret": "body-limit-test-secret" } },
  { path: "/api/voice/knowledge", limit: 128 * 1024 },
  { path: "/api/telephony/voice", limit: 16_384 },
  { path: "/api/telephony/turns", limit: 128 * 1024 },
  { path: "/api/telephony/status", limit: 16_384 },
];

describe.each(surfaces)("bounded public body at $path", ({ path, limit, headers }) => {
  test.each(["ascii", "multibyte"])("cancels oversized %s streams before authentication", async (encoding) => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const cancel = vi.fn();
    // The multibyte body fits the old character limit but exceeds the byte cap.
    const chunk = new TextEncoder().encode(encoding === "ascii"
      ? "x".repeat(limit + 1) : "é".repeat(Math.floor(limit / 2) + 1));
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads++;
        if (reads === 1) controller.enqueue(chunk);
        else controller.error(new Error("An oversized body must not be drained"));
      },
      cancel,
    }, { highWaterMark: 0 });
    const response = await t.fetch(path, {
      method: "POST", headers, body, duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBe(1);
  });

  test("turns a broken stream into a controlled client error", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error("Disconnected caller")); },
    });
    const response = await t.fetch(path, {
      method: "POST", headers, body, duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(response.status).toBe(400);
  });
});
