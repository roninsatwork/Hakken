import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { issueUpload, requireOwnedUpload } from "./uploadReservations";
import { ABANDONED_UPLOAD_MS, DOCUMENT_UPLOAD_BYTES, UPLOAD_TICKET_MS } from "./uploadPolicy";

const modules = import.meta.glob("./**/*.*s");
async function setup() {
  const t = convexTest(schema, modules);
  const owner = await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Upload company", createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { role: "ADMIN", companyId });
    return { userId, companyId };
  });
  const client = t.withIdentity({ subject: owner.userId });
  const mint = async (sizeBytes = 5, contentType = "text/plain") => {
    const url = await client.mutation(api.chat.generateChatUploadUrl, { sizeBytes, contentType });
    return new URL(url).searchParams.get("token")!;
  };
  const upload = async () => {
    const token = await mint();
    const reservation = await t.mutation(internal.uploadReservations.begin, { token, contentType: "text/plain" });
    const storageId = await t.run(async ctx => {
      const id = await ctx.storage.store(new Blob(["hello"], { type: "text/plain" }));
      // convex-test omits Blob.type from system metadata, unlike native uploads.
      await ctx.db.patch(id as never, { contentType: "text/plain" } as never);
      return id;
    });
    await t.mutation(internal.uploadReservations.finish, { id: reservation.id, storageId, bytes: 5 });
    return { ...reservation, storageId };
  };
  return { t, owner, client, mint, upload };
}
beforeEach(() => vi.stubEnv("CONVEX_SITE_URL", "https://uploads.convex.site"));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("single-use owned uploads", () => {
  test("requires login; returns the gateway and stores only a token hash", async () => {
    const { t, mint } = await setup();
    await expect(t.mutation(api.chat.generateChatUploadUrl, {})).rejects.toThrow();
    const token = await mint();
    const rows = await t.run(ctx => ctx.db.query("uploadReservations").collect());
    expect(rows[0].tokenDigest).not.toBe(token);
    expect(rows[0].exactBytes).toBe(5);
    expect(rows[0].state).toBe("ISSUED");
  });
  test("a permission can be claimed only once, including competing claims", async () => {
    const { t, mint } = await setup();
    const token = await mint();
    const claims = await Promise.allSettled([0, 1].map(() => t.mutation(internal.uploadReservations.begin, { token, contentType: "text/plain" })));
    expect(claims.filter(result => result.status === "fulfilled")).toHaveLength(1);
    await expect(t.mutation(internal.uploadReservations.begin, { token, contentType: "text/plain" })).rejects.toThrow("already used");
  });
  test("expired or company-switched permissions cannot start", async () => {
    vi.useFakeTimers();
    const { t, owner, mint } = await setup();
    const expired = await mint();
    vi.advanceTimersByTime(UPLOAD_TICKET_MS + 1);
    await expect(t.mutation(internal.uploadReservations.begin, { token: expired, contentType: "text/plain" })).rejects.toThrow("expired");
    const moved = await mint();
    await t.run(ctx => ctx.db.patch(owner.userId, { companyId: undefined }));
    await expect(t.mutation(internal.uploadReservations.begin, { token: moved, contentType: "text/plain" })).rejects.toThrow("owner");
  });
  test("50 MiB documents still fit; larger files and wrong MIME are rejected", async () => {
    const { t, mint } = await setup();
    const token = await mint(DOCUMENT_UPLOAD_BYTES, "application/pdf");
    await expect(mint(DOCUMENT_UPLOAD_BYTES + 1, "application/pdf")).rejects.toThrow("limit");
    await expect(mint(2 * 1024 ** 2, "application/javascript")).rejects.toThrow();
    await expect(t.mutation(internal.uploadReservations.begin, { token, contentType: "text/plain" })).rejects.toThrow("type");
  });
  test("reserves ingress bytes even if the caller never uploads", async () => {
    const { t, owner } = await setup();
    await t.run(async ctx => {
      for (let i = 0; i < 20; i++) await issueUpload(ctx, owner, "chat", { sizeBytes: DOCUMENT_UPLOAD_BYTES, contentType: "application/pdf" });
    });
    await expect(t.run(ctx => issueUpload(ctx, owner, "chat", { sizeBytes: DOCUMENT_UPLOAD_BYTES, contentType: "application/pdf" }))).rejects.toThrow("quota");
    expect(await t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(20);
  });
  test("checks user, company and purpose before attachment; foreign files survive rejection", async () => {
    const { t, owner, upload } = await setup();
    const file = await upload();
    const stranger = await t.run(ctx => ctx.db.insert("users", { role: "ADMIN", companyId: owner.companyId }));
    await expect(t.run(ctx => requireOwnedUpload(ctx, file.storageId, { ...owner, userId: stranger }, ["chat"]))).rejects.toThrow("not available");
    await expect(t.run(ctx => requireOwnedUpload(ctx, file.storageId, { userId: owner.userId }, ["chat"]))).rejects.toThrow("not available");
    await expect(t.run(ctx => requireOwnedUpload(ctx, file.storageId, owner, ["image"]))).rejects.toThrow("not available");
    expect(await t.run(ctx => ctx.db.system.get(file.storageId))).not.toBeNull();
    await t.run(ctx => requireOwnedUpload(ctx, file.storageId, owner, ["chat"]));
    expect((await t.run(ctx => ctx.db.get(file.id)))?.state).toBe("ATTACHED");
  });
  test("storage metadata, not a client claim, controls finalization", async () => {
    const { t, mint } = await setup();
    const token = await mint();
    const reservation = await t.mutation(internal.uploadReservations.begin, { token, contentType: "text/plain" });
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["too long"], { type: "text/plain" })));
    await expect(t.mutation(internal.uploadReservations.finish, { id: reservation.id, storageId, bytes: 5 })).rejects.toThrow("size");
  });
  test("company and deployment quotas stop a different user's new permissions", async () => {
    const { t, owner } = await setup();
    const nextUser = await t.run(ctx => ctx.db.insert("users", { role: "USER", companyId: owner.companyId }));
    const start = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    for (const scope of [`company:${owner.companyId}`, "deployment"]) {
      const id = await t.run(ctx => ctx.db.insert("uploadQuotas", {
        key: `${scope}:hour:${start}`, count: 5000, bytes: 20 * 1024 ** 3, expiresAt: start + 3_600_000,
      }));
      await expect(t.withIdentity({ subject: nextUser }).mutation(api.chat.generateChatUploadUrl, {
        sizeBytes: 5, contentType: "text/plain",
      })).rejects.toThrow("quota");
      await t.run(ctx => ctx.db.delete(id));
    }
    expect(await t.run(ctx => ctx.db.query("uploadReservations").collect())).toHaveLength(0);
  });
  test("a profile mutation cannot attach or delete another user's image", async () => {
    const { t, owner, client } = await setup();
    const outsider = await t.run(ctx => ctx.db.insert("users", { role: "USER", companyId: owner.companyId }));
    const url = await client.mutation(api.users.generateUploadUrl, { sizeBytes: 5, contentType: "image/png" });
    const reservation = await t.mutation(internal.uploadReservations.begin, {
      token: new URL(url).searchParams.get("token")!, contentType: "image/png",
    });
    const storageId = await t.run(async ctx => {
      const id = await ctx.storage.store(new Blob(["image"]));
      await ctx.db.patch(id as never, { contentType: "image/png" } as never);
      await ctx.db.insert("mockStorageMetadata", { storageId: id, size: 5, contentType: "image/png" });
      return id;
    });
    await t.mutation(internal.uploadReservations.finish, { id: reservation.id, storageId, bytes: 5 });
    await expect(t.withIdentity({ subject: outsider }).mutation(api.users.updateMyProfile, { storageId })).rejects.toThrow("not available");
    expect(await t.run(ctx => ctx.db.system.get(storageId))).not.toBeNull();
    await expect(client.mutation(api.users.updateMyProfile, { storageId })).resolves.toBe(owner.userId);
  });
  test("cleanup deletes abandoned and unregistered new files, preserves attached and legacy files", async () => {
    vi.useFakeTimers();
    const { t, owner, upload } = await setup();
    const legacy = await t.run(ctx => ctx.storage.store(new Blob(["old"])));
    vi.advanceTimersByTime(10);
    const abandoned = await upload();
    const attached = await upload();
    await t.run(ctx => requireOwnedUpload(ctx, attached.storageId, owner, ["chat"]));
    const orphan = await t.run(ctx => ctx.storage.store(new Blob(["interrupted before finish"])));
    vi.advanceTimersByTime(ABANDONED_UPLOAD_MS + 1000);
    await t.mutation(internal.uploadReservations.cleanup, {});
    expect(await t.run(ctx => ctx.db.system.get(abandoned.storageId))).toBeNull();
    expect(await t.run(ctx => ctx.db.system.get(orphan))).toBeNull();
    expect(await t.run(ctx => ctx.db.system.get(attached.storageId))).not.toBeNull();
    expect(await t.run(ctx => ctx.db.system.get(legacy))).not.toBeNull();
  });
  test("orphan sweep resumes with fixed query bounds across cron ticks", async () => {
    vi.useFakeTimers();
    const { t, mint } = await setup();
    await mint();
    await t.run(async ctx => {
      for (let index = 0; index < 120; index++) await ctx.storage.store(new Blob(["orphan"]));
    });
    vi.advanceTimersByTime(ABANDONED_UPLOAD_MS + 1000);
    await t.mutation(internal.uploadReservations.cleanup, {});
    const control = await t.run(ctx => ctx.db.query("uploadControl").first());
    expect(control?.storageCursor).toBeTruthy();
    expect(control?.storageScanBefore).toBe(Date.now() - ABANDONED_UPLOAD_MS);
    vi.advanceTimersByTime(300_000);
    await t.mutation(internal.uploadReservations.cleanup, {});
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(0);
    expect((await t.run(ctx => ctx.db.query("uploadControl").first()))?.storageScanBefore).toBeUndefined();
  });
});
