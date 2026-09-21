import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { UPLOAD_TIMEOUT_MS } from "./uploadPolicy";

beforeEach(() => vi.stubEnv("CONVEX_SITE_URL", "https://uploads.convex.site"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

async function setup(sizeBytes = 5) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const userId = await t.run(ctx => ctx.db.insert("users", { role: "USER" }));
  const client = t.withIdentity({ subject: userId });
  const url = await client.mutation(api.chat.generateChatUploadUrl, { sizeBytes, contentType: "text/plain" });
  const fetchStorage = vi.fn(async (_url: string, options: RequestInit) => {
    expect(_url).not.toContain("/api/uploads");
    expect(options.redirect).toBe("manual");
    const data = await new Response(options.body).blob();
    const storageId = await t.run(async ctx => {
      const id = await ctx.storage.store(data);
      await ctx.db.patch(id as never, { contentType: "text/plain" } as never);
      await ctx.db.insert("mockStorageMetadata", { storageId: id, size: data.size, contentType: "text/plain" });
      return id;
    });
    return Response.json({ storageId });
  });
  vi.stubGlobal("fetch", fetchStorage);
  const path = new URL(url).pathname + new URL(url).search;
  return { t, userId, client, path, fetchStorage };
}
test("gateway stores a counted file, attaches it for its owner, and refuses replay", async () => {
  const { t, userId, client, path, fetchStorage } = await setup();
  const response = await t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" });
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  const { storageId } = await response.json();
  const threadId = await client.mutation(api.chat.createThread, {});
  expect(await client.mutation(api.chat.sendMessage, { threadId, content: "Uploaded", fileIds: [storageId] })).toBe(true);
  const row = await t.run(ctx => ctx.db.query("uploadReservations").first());
  expect(row).toMatchObject({ userId, storageId, state: "ATTACHED" });
  expect((await t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" })).status).toBe(403);
  expect(fetchStorage).toHaveBeenCalledTimes(1);
});
test("OPTIONS grants only the upload headers and does not mint storage access", async () => {
  const { t, fetchStorage } = await setup();
  const response = await t.fetch("/api/uploads", { method: "OPTIONS" });
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  expect(fetchStorage).not.toHaveBeenCalled();
});
test("rejects unknown passes and encoded bodies before storage", async () => {
  const { t, path, fetchStorage } = await setup();
  expect((await t.fetch("/api/uploads?token=wrong", { method: "POST", body: "hello" })).status).toBe(401);
  expect((await t.fetch(path, { method: "POST", headers: { "Content-Encoding": "gzip" }, body: "hello" })).status).toBe(400);
  expect(fetchStorage).not.toHaveBeenCalled();
});
test("preflight rejects oversized requests without forwarding any bytes", async () => {
  const { t, path, fetchStorage } = await setup();
  const response = await t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain", "Content-Length": "6" }, body: "bigger" });
  expect(response.status).toBe(413);
  expect(fetchStorage).not.toHaveBeenCalled();
});
test("unannounced excess bytes abort storage forwarding", async () => {
  const { t, path } = await setup();
  const response = await t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "bigger" });
  expect(response.status).toBe(413);
  expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
});
test("a truncated file cannot become ready", async () => {
  const { t, path } = await setup();
  const response = await t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hi" });
  expect(response.status).toBe(400);
  expect((await t.run(ctx => ctx.db.query("uploadReservations").first()))?.state).toBe("UPLOADING");
});
test("an early storage receipt after a stream failure is deleted, never accepted", async () => {
  const { t, path, fetchStorage } = await setup();
  fetchStorage.mockImplementationOnce(async (_url, options) => {
    // Model a storage server that finalizes before seeing the abort signal.
    await new Response(options.body).blob();
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["partial"])));
    return Response.json({ storageId });
  });
  const response = await t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "bigger" });
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: "File exceeds the upload limit." });
  expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  expect((await t.run(ctx => ctx.db.query("uploadReservations").first()))?.state).toBe("UPLOADING");
});
test("failed metadata verification deletes the just-uploaded file", async () => {
  const { t, path, fetchStorage } = await setup();
  fetchStorage.mockImplementationOnce(async (_url, options) => {
    await new Response(options.body).blob();
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["invalid length"])));
    return Response.json({ storageId });
  });
  expect((await t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" })).status).toBe(502);
  expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
});
test("storage redirects are not followed", async () => {
  const { t, path, fetchStorage } = await setup();
  fetchStorage.mockResolvedValueOnce(new Response(null, { status: 307, headers: { Location: "https://other.test" } }));
  expect((await t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" })).status).toBe(502);
  expect(fetchStorage).toHaveBeenCalledTimes(1);
});
test("a stalled upload is cancelled when its time allowance ends", async () => {
  vi.useFakeTimers();
  const { t, path, fetchStorage } = await setup();
  const entered = Promise.withResolvers<void>();
  fetchStorage.mockImplementationOnce(async (_url, options) => {
    entered.resolve();
    return new Promise((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  });
  const response = t.fetch(path, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" });
  await entered.promise;
  await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1);
  expect((await response).status).toBe(502);
});
