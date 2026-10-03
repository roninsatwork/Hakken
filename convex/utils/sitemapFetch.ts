"use node";

import { gunzipSync } from "node:zlib";

import { assertWorkflowTargetResolvesPublicly, fetchPinnedAddress } from "./safeWorkflowHttp";
import { siteHosts, type FetchText, type FetchedText } from "./sitemapReading";

/**
 * Fetching a website's robots.txt and sitemap files, for `readSitemap`
 * (`sitemapReading.ts`).
 *
 * Every request goes through the platform's guard against private and
 * internal addresses (`safeWorkflowHttp.ts`): the host's DNS answers are
 * checked, and the request connects to the checked address and no other, so
 * a public-looking name that resolves to a private network, loopback or a
 * cloud metadata address is refused. `fetchWorkflowAction` itself is not used
 * because it reads every answer as text, and a `.xml.gz` sitemap is bytes:
 * this reads the bytes, unzips them, and only then decodes.
 *
 * Only the website's own host and its www or bare twin, over https — checked
 * again at each redirect, so a sitemap cannot send the reading to another
 * website or to plain http. Each file has a time limit and a size cap, the
 * unzipped text a cap of its own.
 */

/** How long one file may take, connection to last byte. The News Collector's limit for a feed. */
export const SITEMAP_FETCH_TIMEOUT_MS = 20_000;

/** The most one sitemap file may be, as it arrives (zipped or not). */
export const SITEMAP_FILE_BYTES = 10 * 1024 * 1024;

/** The most one sitemap file may be once unzipped: the sitemap protocol's own ceiling, 50 MB. */
export const SITEMAP_TEXT_BYTES = 50 * 1024 * 1024;

/** The most robots.txt may be: Google reads 500 KiB of one. */
export const ROBOTS_BYTES = 512 * 1024;

/** Redirects followed per file — bare to www, http to https, an old address to a new one. */
export const SITEMAP_REDIRECTS = 3;

const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; SitemapReader/1.0)",
  accept: "application/xml, text/xml, application/x-gzip, text/plain;q=0.8, */*;q=0.5",
};

/** The answer's bytes, or null once past the cap — read no further. */
async function readBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** A gzip stream starts with these two bytes, whatever the file is called or the server says it is. */
const isGzip = (bytes: Uint8Array) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

/** The file as text: unzipped when it is gzip, or null when that runs past the unzipped cap. */
function textOf(bytes: Uint8Array, encoding: string | null): string | null {
  const zipped = isGzip(bytes) || encoding === "gzip";
  if (!zipped) return new TextDecoder().decode(bytes);
  try {
    return new TextDecoder().decode(gunzipSync(bytes, { maxOutputLength: SITEMAP_TEXT_BYTES }));
  } catch (error) {
    if (error instanceof RangeError || (error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return null;
    throw error;
  }
}

/** Whether the reading may go to an address: https, on the website's own host or its twin. */
function mayRead(url: URL, host: string): boolean {
  return url.protocol === "https:" && siteHosts(host).includes(url.hostname.toLowerCase());
}

/** Fetch one address under the guard, following up to `SITEMAP_REDIRECTS` redirects on the website. */
async function fetchOne(address: string, host: string, maxBytes: number): Promise<FetchedText> {
  let current = new URL(address);
  for (let hop = 0; ; hop += 1) {
    if (!mayRead(current, host)) return { ok: false, problem: "OTHER_WEBSITE", missing: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SITEMAP_FETCH_TIMEOUT_MS);
    try {
      const addresses = await Promise.race([
        assertWorkflowTargetResolvesPublicly(current.toString()),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        }),
      ]);
      const response = await fetchPinnedAddress(
        current.toString(),
        { method: "GET", headers: HEADERS, redirect: "manual", signal: controller.signal },
        addresses[0].address,
      );
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location || hop >= SITEMAP_REDIRECTS) return { ok: false, problem: `ANSWERED:${response.status}`, missing: false };
        current = new URL(location, current);
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel().catch(() => undefined);
        const missing = response.status === 404 || response.status === 410;
        return { ok: false, problem: `${missing ? "MISSING" : "ANSWERED"}:${response.status}`, missing };
      }
      const bytes = await readBytes(response, maxBytes);
      const text = bytes === null ? null : textOf(bytes, response.headers.get("content-encoding"));
      if (text === null) return { ok: false, problem: "TOO_LARGE", missing: false };
      return { ok: true, url: current.toString(), text };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, problem: "TIMEOUT", missing: false };
      // The guard's refusal: an address the platform will not reach.
      if (error instanceof Error && /SSRF/.test(error.message)) return { ok: false, problem: "REFUSED", missing: false };
      return { ok: false, problem: "FAILED", missing: false };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The fetcher a reading of this website uses: robots.txt held to its own cap, sitemap files to theirs. */
export function sitemapFetcher(host: string): FetchText {
  return async (url, purpose) => await fetchOne(url, host, purpose === "robots" ? ROBOTS_BYTES : SITEMAP_FILE_BYTES);
}
