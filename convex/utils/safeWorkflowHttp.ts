import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(normalized);

  if (version === 4) return isBlockedIpv4(normalized);
  if (version !== 6) return true;

  return (
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
): Promise<void> {
  validateSafeUrl(url, "Action Node");
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await resolveHostname(hostname);

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedWorkflowAddress(address))) {
    throw appError("INVALID_INPUT", "SSRF Prevention: Action Node hostname resolved to a restricted address.");
  }
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    await response.body?.cancel();
    throw appError("UPSTREAM_FAILURE", `Action Node response exceeds ${maxBytes} bytes.`);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw appError("UPSTREAM_FAILURE", `Action Node response exceeds ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
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
): Promise<{ status: number; body: string }> {
  const resolveHostname = dependencies.resolveHostname ?? resolveWithSystemDns;
  await assertWorkflowTargetResolvesPublicly(url, resolveHostname);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? WORKFLOW_ACTION_TIMEOUT_MS
  );

  try {
    const response = await (dependencies.fetchImplementation ?? fetch)(url, {
      ...fetchOptions,
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw appError("UPSTREAM_FAILURE", "Action Node redirects are not allowed.");
    }

    return {
      status: response.status,
      body: await readBoundedResponse(
        response,
        dependencies.maxResponseBytes ?? WORKFLOW_ACTION_MAX_RESPONSE_BYTES
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}
