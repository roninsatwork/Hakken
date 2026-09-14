import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { ABANDONED_UPLOAD_MS, UPLOAD_TICKET_MS, UPLOAD_TIMEOUT_MS, digestUploadToken, normalizeUploadType, uploadByteLimit, validateUploadForPurpose, type UploadPurpose } from "./uploadPolicy";

type Owner = { userId?: Id<"users">; companyId?: Id<"companies">; threadId?: Id<"threads"> };
const GiB = 1024 ** 3;

/** Reserve ingress bytes before granting a pass, never after the client finalizes. */
export async function issueUpload(ctx: MutationCtx, owner: Owner, purpose: UploadPurpose, metadata: { sizeBytes?: number; contentType?: string } = {}) {
  const site = process.env.CONVEX_SITE_URL?.replace(/\/+$/, "");
  if (!site) throw appError("NOT_CONFIGURED", "Upload gateway requires CONVEX_SITE_URL.");
  const contentType = metadata.contentType ? normalizeUploadType(metadata.contentType) : undefined;
  const maxBytes = metadata.sizeBytes ?? uploadByteLimit(purpose, contentType);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > uploadByteLimit(purpose, contentType)) throw appError("INVALID_INPUT", "Upload size exceeds the allowed limit.");
  if (contentType) validateUploadForPurpose(purpose, maxBytes, contentType);
  const now = Date.now();
  const actor = owner.userId ? `user:${owner.userId}` : `thread:${owner.threadId}`;
  for (const [window, duration, multiplier] of [["hour", 3_600_000, 1], ["day", 86_400_000, 4]] as const) {
    const start = Math.floor(now / duration) * duration;
    for (const [scope, byteLimit, countLimit] of [
      // Leave headroom for the existing 500-file knowledge batch.
      [actor, GiB, 1000], [`company:${owner.companyId ?? "platform"}`, 10 * GiB, 2500], ["deployment", 20 * GiB, 5000],
    ] as const) {
      const key = `${scope}:${window}:${start}`;
      const row = await ctx.db.query("uploadQuotas").withIndex("by_key", q => q.eq("key", key)).unique();
      const count = (row?.count ?? 0) + 1;
      const bytes = (row?.bytes ?? 0) + maxBytes;
      if (count > countLimit * multiplier || bytes > byteLimit * multiplier) throw appError("INVALID_INPUT", "Upload quota reached. Please try again later.");
      if (row) await ctx.db.patch(row._id, { count, bytes });
      else await ctx.db.insert("uploadQuotas", { key, count, bytes, expiresAt: start + duration });
    }
  }
  if (!(await ctx.db.query("uploadControl").withIndex("by_key", q => q.eq("key", "gateway")).unique())) {
    await ctx.db.insert("uploadControl", { key: "gateway", enforcedSince: now });
  }
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await ctx.db.insert("uploadReservations", {
    ...owner, purpose, tokenDigest: await digestUploadToken(token), maxBytes, exactBytes: metadata.sizeBytes,
    contentType, state: "ISSUED", createdAt: now, expiresAt: now + UPLOAD_TICKET_MS,
  });
  return `${site}/api/uploads?token=${token}`;
}

export const begin = internalMutation({
  args: { token: v.string(), contentType: v.string() },
  returns: v.object({ id: v.id("uploadReservations"), maxBytes: v.number(), exactBytes: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.token)) throw appError("UNAUTHORIZED", "Invalid upload pass.");
    const digest = await digestUploadToken(args.token);
    const row = await ctx.db.query("uploadReservations").withIndex("by_token", q => q.eq("tokenDigest", digest)).unique();
    if (!row || row.state !== "ISSUED" || row.expiresAt <= Date.now()) throw appError("UNAUTHORIZED", "Upload pass expired or already used.");
    if (row.userId) {
      const user = await ctx.db.get(row.userId);
      if (!user || getActiveCompanyId(user) !== row.companyId) throw appError("UNAUTHORIZED", "Upload owner is no longer available.");
    } else if (row.threadId) {
      const thread = await ctx.db.get(row.threadId);
      const widget = thread?.widgetId ? await ctx.db.get(thread.widgetId) : null;
      if (!thread || !widget?.isActive || widget.companyId !== row.companyId) throw appError("UNAUTHORIZED", "Upload conversation is no longer available.");
    } else throw appError("UNAUTHORIZED", "Upload has no owner.");
    const type = normalizeUploadType(args.contentType);
    if (row.contentType && row.contentType !== type) throw appError("INVALID_INPUT", "Upload type does not match its pass.");
    const maxBytes = Math.min(row.maxBytes, uploadByteLimit(row.purpose, type));
    validateUploadForPurpose(row.purpose, row.exactBytes ?? maxBytes, type);
    await ctx.db.patch(row._id, { state: "UPLOADING", maxBytes, contentType: type, expiresAt: Date.now() + UPLOAD_TIMEOUT_MS + 60_000 });
    return { id: row._id, maxBytes, exactBytes: row.exactBytes };
  },
});

export const finish = internalMutation({
  args: { id: v.id("uploadReservations"), storageId: v.id("_storage"), bytes: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.state !== "UPLOADING" || row.expiresAt <= Date.now()) throw appError("CONFLICT", "Upload is no longer active.");
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || metadata.size !== args.bytes || args.bytes > row.maxBytes || (row.exactBytes !== undefined && args.bytes !== row.exactBytes)) throw appError("INVALID_INPUT", "Upload size does not match its pass.");
    validateUploadForPurpose(row.purpose, metadata.size, metadata.contentType ?? "");
    if (normalizeUploadType(metadata.contentType ?? "") !== row.contentType) throw appError("INVALID_INPUT", "Stored upload type does not match.");
    await ctx.db.patch(row._id, { state: "READY", storageId: args.storageId, expiresAt: Date.now() + ABANDONED_UPLOAD_MS });
    return null;
  },
});

/** Must run before metadata validation, fetching a URL, or deleting a rejected file. */
export async function requireOwnedUpload(ctx: MutationCtx, storageId: Id<"_storage">, owner: Owner, purposes: UploadPurpose[], attach = true) {
  const row = await ctx.db.query("uploadReservations").withIndex("by_storage", q => q.eq("storageId", storageId)).unique();
  const sameOwner = row && (owner.threadId ? row.threadId === owner.threadId : !!owner.userId && row.userId === owner.userId && !row.threadId);
  if (!row || !sameOwner || row.companyId !== owner.companyId || !purposes.includes(row.purpose) || !["READY", "ATTACHED"].includes(row.state) || (row.state === "READY" && row.expiresAt <= Date.now())) {
    throw appError("UNAUTHORIZED", "This uploaded file is not available to you. Upload it again.");
  }
  if (attach && row.state !== "ATTACHED") await ctx.db.patch(row._id, { state: "ATTACHED" });
}

export const authorizeWorkbook = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage"), attach: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw appError("UNAUTHENTICATED", "Sign in to use uploaded files.");
    await requireOwnedUpload(ctx, args.storageId, { userId: args.userId, companyId: getActiveCompanyId(user) }, ["workbook"], args.attach);
    return null;
  },
});

/** Bounded sweeps never touch files predating gateway enforcement. */
export const cleanup = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const now = Date.now();
    let moreExpired = false;
    for (const state of ["ISSUED", "UPLOADING", "READY"] as const) {
      const expired = await ctx.db.query("uploadReservations").withIndex("by_state_expiry", q => q.eq("state", state).lt("expiresAt", now)).take(50);
      moreExpired ||= expired.length === 50;
      for (const row of expired) {
        if (row.storageId && await ctx.db.system.get(row.storageId)) await ctx.storage.delete(row.storageId);
        await ctx.db.delete(row._id);
      }
    }
    const quotas = await ctx.db.query("uploadQuotas").withIndex("by_expiry", q => q.lt("expiresAt", now)).take(100);
    for (const row of quotas) await ctx.db.delete(row._id);
    if (moreExpired || quotas.length === 100) await ctx.scheduler.runAfter(0, internal.uploadReservations.cleanup, {});
    const control = await ctx.db.query("uploadControl").withIndex("by_key", q => q.eq("key", "gateway")).unique();
    if (!control || control.enforcedSince >= now - ABANDONED_UPLOAD_MS) return null;
    // Also covers a process dying after storage accepted bytes but before finish
    // recorded the returned id. All production writes must use this gateway.
    // A cursor belongs to its original query bounds; keep the upper bound
    // fixed across ticks until this pass finishes.
    const scanBefore = control.storageScanBefore ?? now - ABANDONED_UPLOAD_MS;
    const page = await ctx.db.system.query("_storage").withIndex("by_creation_time", q => q.gte("_creationTime", control.enforcedSince).lt("_creationTime", scanBefore))
      .paginate({ cursor: control.storageCursor ?? null, numItems: 100 });
    for (const file of page.page) {
      const reservation = await ctx.db.query("uploadReservations").withIndex("by_storage", q => q.eq("storageId", file._id)).unique();
      if (!reservation) await ctx.storage.delete(file._id);
    }
    await ctx.db.patch(control._id, {
      storageCursor: page.isDone ? undefined : page.continueCursor,
      storageScanBefore: page.isDone ? undefined : scanBefore,
    });
    return null;
  },
});
