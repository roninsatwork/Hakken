/**
 * Reading a request body without agreeing to read whatever arrives.
 *
 * `request.text()` and `request.json()` buffer the whole body before anyone
 * gets to look at its size, so a handler that calls either has already done the
 * work by the time it could refuse. The public API and the workflow webhook
 * each learned this separately and each wrote their own cap; the Apify webhook
 * never did, and read whatever it was handed.
 *
 * The reader stops at the limit and cancels the stream rather than draining it.
 * It returns a verdict rather than a Response because the handlers that use it
 * do not agree on what a reply looks like — the public API answers in JSON, the
 * webhooks in plain text — and a shared reader has no business deciding that.
 */

/** Generous for a webhook, nowhere near enough to be worth aiming at a server. */
export const DEFAULT_MAX_BODY_BYTES = 128 * 1024;

export type BoundedBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "unreadable" };

export async function readBoundedBody(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<BoundedBodyResult> {
  // The declared length is a hint, not a promise — checking it turns away the
  // honest oversized caller for nothing, and the byte count below catches the
  // rest.
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: false, reason: "unreadable" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }

    const bodyBytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes) };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }
}

/** The same read, for the handlers that want the parsed object. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<{ ok: true; payload: unknown } | { ok: false; reason: "too_large" | "unreadable" }> {
  const body = await readBoundedBody(request, maxBytes);
  if (!body.ok) return body;

  try {
    return { ok: true, payload: JSON.parse(body.text) as unknown };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
