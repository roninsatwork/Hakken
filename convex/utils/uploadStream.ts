import { ConvexError } from "convex/values";
import type { AppErrorData } from "./appError";

/** Keep only the current chunk in memory, and never forward an over-limit chunk. */
export class UploadStreamError extends ConvexError<AppErrorData> {
  constructor(message: string, readonly status: number) {
    super({ code: status >= 500 ? "UPSTREAM_FAILURE" : "INVALID_INPUT", message });
  }
}

export function boundedUploadStream(request: Request, maxBytes: number, exactBytes: number | undefined, abort: AbortController) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    throw new UploadStreamError("Invalid upload length.", 400);
  }
  if (length !== null && Number(length) > maxBytes) throw new UploadStreamError("File exceeds the upload limit.", 413);
  if (length !== null && exactBytes !== undefined && Number(length) !== exactBytes) throw new UploadStreamError("File size does not match its upload permission.", 400);
  if (!request.body) throw new UploadStreamError("Empty upload.", 400);
  const reader = request.body.getReader();
  let bytes = 0;
  let complete = false;
  let failure: UploadStreamError | undefined;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  abort.signal.addEventListener("abort", cancel, { once: true });
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (abort.signal.aborted) throw new UploadStreamError("Upload interrupted.", 408);
        const chunk = await reader.read();
        if (abort.signal.aborted) throw new UploadStreamError("Upload interrupted.", 408);
        if (chunk.done) {
          if (!bytes || (exactBytes !== undefined && bytes !== exactBytes) || (length !== null && bytes !== Number(length))) {
            throw new UploadStreamError("File size does not match its upload permission.", 400);
          }
          complete = true;
          controller.close();
          return;
        }
        if (bytes + chunk.value.byteLength > maxBytes) throw new UploadStreamError("File exceeds the upload limit.", 413);
        bytes += chunk.value.byteLength;
        controller.enqueue(chunk.value);
      } catch (error) {
        failure = error instanceof UploadStreamError ? error : new UploadStreamError("Upload interrupted.", 400);
        // Convex's fetch bridge can surface controller.error() outside the
        // HTTP action's catch, replacing our 413 with a platform 500. End the
        // body normally, cancel ingress, and report the failure
        // through result()/failure() instead. No excess chunk is forwarded,
        // and the gateway never accepts a receipt without checking result().
        try { controller.close(); } catch { /* Already closed by cancellation. */ }
        cancel();
      }
    },
    cancel() { abort.abort(); cancel(); },
  }, { highWaterMark: 0 });
  return {
    body,
    result() {
      if (failure) throw failure;
      if (!complete) throw new UploadStreamError("Upload did not complete.", 400);
      return bytes;
    },
    failure: () => failure,
    dispose() { abort.signal.removeEventListener("abort", cancel); if (!complete) cancel(); },
  };
}

/** The native storage receipt is tiny. Never trust an unbounded response body. */
export async function readUploadReceipt(response: Response): Promise<string> {
  if (!response.ok || !response.body) throw new UploadStreamError("Storage could not accept the upload.", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) throw new UploadStreamError("Invalid storage receipt.", 502);
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const receipt: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!receipt || typeof receipt !== "object" || !("storageId" in receipt) || typeof receipt.storageId !== "string") {
    throw new UploadStreamError("Invalid storage receipt.", 502);
  }
  return receipt.storageId;
}
