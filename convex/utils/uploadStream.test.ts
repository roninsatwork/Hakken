import { describe, expect, test, vi } from "vitest";
import { boundedUploadStream, readUploadReceipt } from "./uploadStream";

function incoming(size: number, headers?: Record<string, string>) {
  let sent = 0;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === size) { controller.close(); return; }
      const chunk = new Uint8Array(Math.min(64 * 1024, size - sent));
      sent += chunk.length;
      controller.enqueue(chunk);
    }, cancel,
  }, { highWaterMark: 0 });
  return { request: new Request("https://upload.test", { method: "POST", body, headers, duplex: "half" } as RequestInit), cancel, sent: () => sent };
}
async function drain(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let count = 0;
  while (true) { const chunk = await reader.read(); if (chunk.done) return count; count += chunk.value.length; }
}

describe("bounded upload stream", () => {
  test("streams all 50 MiB without pre-reading or buffering the file", async () => {
    const size = 50 * 1024 ** 2;
    const input = incoming(size);
    const stream = boundedUploadStream(input.request, size, size, new AbortController());
    await Promise.resolve();
    expect(input.sent()).toBe(0);
    expect(await drain(stream.body)).toBe(size);
    expect(stream.result()).toBe(size);
    stream.dispose();
  });
  test("cancels on the first byte over the ceiling without a content length", async () => {
    const input = incoming(50 * 1024 ** 2 + 1);
    const abort = new AbortController();
    const stream = boundedUploadStream(input.request, 50 * 1024 ** 2, undefined, abort);
    expect(await drain(stream.body)).toBe(50 * 1024 ** 2);
    expect(() => stream.result()).toThrow("exceeds");
    // Close forwarding without aborting a finished Convex fetch stream.
    expect(abort.signal.aborted).toBe(false);
    expect(input.cancel).toHaveBeenCalled();
    stream.dispose();
  });
  test.each(["-1", "invalid", "9007199254740992"])("rejects invalid declared length %s", length => {
    const input = incoming(5, { "content-length": length });
    expect(() => boundedUploadStream(input.request, 10, undefined, new AbortController())).toThrow("Invalid");
  });
  test("rejects oversized declarations before reading", () => {
    const input = incoming(20, { "content-length": "20" });
    expect(() => boundedUploadStream(input.request, 10, undefined, new AbortController())).toThrow("exceeds");
    expect(input.sent()).toBe(0);
  });
  test.each([3, 8])("rejects false content length and exact size (%s bytes)", async size => {
    const input = incoming(size, { "content-length": "5" });
    const stream = boundedUploadStream(input.request, 10, 5, new AbortController());
    await drain(stream.body);
    expect(() => stream.result()).toThrow("does not match");
    stream.dispose();
  });
  test("aborting a stalled read cancels the incoming stream", async () => {
    const cancel = vi.fn();
    const request = new Request("https://upload.test", { method: "POST", body: new ReadableStream({ cancel }), duplex: "half" } as RequestInit);
    const abort = new AbortController();
    const stream = boundedUploadStream(request, 10, undefined, abort);
    const reading = drain(stream.body);
    abort.abort();
    await reading;
    expect(() => stream.result()).toThrow("interrupted");
    expect(cancel).toHaveBeenCalled();
    stream.dispose();
  });
  test("rejects empty streams and early success", async () => {
    const stream = boundedUploadStream(incoming(0).request, 10, undefined, new AbortController());
    expect(() => stream.result()).toThrow("did not complete");
    await drain(stream.body);
    expect(() => stream.result()).toThrow("does not match");
    stream.dispose();
  });
  test("caps the upstream receipt", async () => {
    await expect(readUploadReceipt(new Response("x".repeat(4097)))).rejects.toThrow("Invalid storage receipt");
    expect(await readUploadReceipt(Response.json({ storageId: "file" }))).toBe("file");
  });
});
