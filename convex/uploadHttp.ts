import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { normalizeUploadType, UPLOAD_TIMEOUT_MS } from "./uploadPolicy";
import { boundedUploadStream, readUploadReceipt, UploadStreamError } from "./utils/uploadStream";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const reply = (body: object, status: number) => new Response(JSON.stringify(body), { status, headers });
export const handleUploadOptions = httpAction(async () => new Response(null, { status: 204, headers }));

export const handleUpload = httpAction(async (ctx, request) => {
  const refuse = (body: object, status: number) => {
    void request.body?.cancel().catch(() => undefined);
    return reply(body, status);
  };
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return refuse({ error: "Invalid upload permission." }, 401);
  if (!["", "identity"].includes(request.headers.get("content-encoding") ?? "")) {
    return refuse({ error: "Encoded upload bodies are not supported." }, 400);
  }
  const contentType = normalizeUploadType(request.headers.get("content-type") ?? "");
  let reservation;
  try {
    reservation = await ctx.runMutation(internal.uploadReservations.begin, { token, contentType });
  } catch {
    return refuse({ error: "Upload permission expired, already used, or does not allow this file type. Upload the file again." }, 403);
  }
  const abort = new AbortController();
  const onDisconnect = () => abort.abort();
  request.signal.addEventListener("abort", onDisconnect, { once: true });
  if (request.signal.aborted) abort.abort();
  const timeout = setTimeout(() => abort.abort(), UPLOAD_TIMEOUT_MS);
  let stream: ReturnType<typeof boundedUploadStream> | undefined;
  let storageId: Id<"_storage"> | undefined;
  try {
    stream = boundedUploadStream(request, reservation.maxBytes, reservation.exactBytes, abort);
    // This URL is never returned to a browser: all ingress passes the counter.
    const uploadUrl = await ctx.storage.generateUploadUrl();
    const options: RequestInit & { duplex: "half" } = {
      method: "POST", headers: { "Content-Type": contentType }, body: stream.body,
      signal: abort.signal, redirect: "manual", duplex: "half",
    };
    const response = await fetch(uploadUrl, options);
    storageId = await readUploadReceipt(response) as Id<"_storage">;
    const bytes = stream.result();
    await ctx.runMutation(internal.uploadReservations.finish, { id: reservation.id, storageId, bytes });
    return reply({ storageId }, 200);
  } catch (error) {
    // A failed counter already closed forwarding and cancelled ingress.
    // Aborting Convex's now-closed fetch stream can itself throw, hiding 413.
    if (!stream?.failure()) abort.abort();
    if (storageId) await ctx.storage.delete(storageId).catch(() => undefined);
    const problem = stream?.failure() ?? error;
    return reply({ error: problem instanceof UploadStreamError ? problem.data.message : "Upload failed. Please try again." },
      problem instanceof UploadStreamError ? problem.status : 502);
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onDisconnect);
    stream?.dispose();
    if (!stream) void request.body?.cancel().catch(() => undefined);
  }
});
