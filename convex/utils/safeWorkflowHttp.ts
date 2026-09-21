"use node";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import { appError } from "./appError";
import { validateSafeUrl } from "./security";

export const WORKFLOW_ACTION_TIMEOUT_MS = 15_000;
export const WORKFLOW_ACTION_MAX_RESPONSE_BYTES = 128 * 1024;

type ResolvedAddress = { address: string };
type ResolveHostname = (hostname: string) => Promise<readonly ResolvedAddress[]>;
type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

export type SafeWorkflowFetchDependencies = {
  fetchImplementation?: FetchImplementation;
  resolveHostname?: ResolveHostname;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/**
 * DNS answers are checked as well as the author-entered URL. This closes the
 * gap where a public-looking hostname resolves to loopback, a private network,
 * or a cloud metadata address only when the request is executed.
 */
export function isBlockedWorkflowAddress(address: string): boolean {
  let normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(normalized);

  if (version === 4) return isBlockedIpv4(normalized);
  if (version !== 6) return true;
  normalized = new URL(`http://[${normalized}]/`).hostname.slice(1, -1);

  return (
    !/^[23][0-9a-f]{3}:/.test(normalized) ||
    /^2001:(?:[0-9a-f]{1,2}|1[0-9a-f]{2}):/.test(normalized) ||
    normalized.startsWith("2001::") ||
    normalized.startsWith("2002:") ||
    normalized.startsWith("3fff:") ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("fec") ||
    normalized.startsWith("fed") ||
    normalized.startsWith("fee") ||
    normalized.startsWith("fef") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

async function resolveWithSystemDns(hostname: string): Promise<readonly ResolvedAddress[]> {
  return await lookup(hostname, { all: true, verbatim: true });
}

export async function assertWorkflowTargetResolvesPublicly(
  url: string,
  resolveHostname: ResolveHostname = resolveWithSystemDns
): Promise<readonly ResolvedAddress[]> {
  validateSafeUrl(url, "Action Node");
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await resolveHostname(hostname);

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedWorkflowAddress(address))) {
    throw appError("INVALID_INPUT", "SSRF Prevention: Action Node hostname resolved to a restricted address.");
  }
  return addresses;
}

/** Connect to the checked address, while preserving the hostname for Host and TLS. */
export async function fetchPinnedAddress(
  url: string,
  options: RequestInit,
  address: string,
): Promise<Response> {
  if (options.body != null && typeof options.body !== "string") {
    throw appError("INVALID_INPUT", "Outbound requests require a text body.");
  }
  return await new Promise<Response>((resolve, reject) => {
    const target = new URL(url);
    const request = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
      method: options.method ?? "GET",
      headers: { ...Object.fromEntries(new Headers(options.headers).entries()), "accept-encoding": "identity" },
      signal: options.signal ?? undefined,
      // No shared pool may reuse an unchecked socket. No second DNS lookup.
      agent: false,
      lookup: (_hostname, lookupOptions, callback) => {
        const family = isIP(address);
        if (lookupOptions.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
    }, (incoming) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      const status = incoming.statusCode ?? 502;
      if ([204, 205, 304].includes(status) || options.method === "HEAD") {
        incoming.destroy();
        resolve(new Response(null, { status, headers }));
      } else {
        resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status, headers }));
      }
    });
    request.on("error", reject);
    request.end(options.body ?? undefined);
  });
}

async function readBoundedResponse(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await response.body?.cancel();
    throw appError("UPSTREAM_FAILURE", `Action Node response exceeds ${maxBytes} bytes.`);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw appError("UPSTREAM_FAILURE", `Action Node response exceeds ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Execute one workflow-owned HTTP request under the outbound policy.
 * Redirects are refused rather than followed: the Location can point at a
 * target that was never approved or DNS-checked, and Action nodes do not need
 * browser navigation semantics.
 */
export async function fetchWorkflowAction(
  url: string,
  fetchOptions: RequestInit,
  dependencies: SafeWorkflowFetchDependencies = {}
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const resolveHostname = dependencies.resolveHostname ?? resolveWithSystemDns;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? WORKFLOW_ACTION_TIMEOUT_MS
  );

  try {
    const addresses = await Promise.race([
      assertWorkflowTargetResolvesPublicly(url, resolveHostname),
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    ]);
    const response = await (dependencies.fetchImplementation ?? ((input, init) =>
      fetchPinnedAddress(input, init ?? {}, addresses[0].address)))(url, {
      ...fetchOptions,
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw appError("UPSTREAM_FAILURE", "Action Node redirects are not allowed.");
    }
    if (response.headers.get("content-encoding") && response.headers.get("content-encoding") !== "identity") {
      await response.body?.cancel();
      throw appError("UPSTREAM_FAILURE", "Encoded outbound responses are not supported.");
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await readBoundedResponse(
        response,
        dependencies.maxResponseBytes ?? WORKFLOW_ACTION_MAX_RESPONSE_BYTES,
        controller.signal,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}
