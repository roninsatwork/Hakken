/**
 * What an agent is allowed to reach over HTTP.
 *
 * This is the most dangerous capability in the platform, so it is worth being
 * explicit about why it is safe rather than trusting the checks below to speak
 * for themselves.
 *
 * **The agent never chooses the host.** The connector's contract gives it a
 * `method` and a `path` only; the base URL comes from a secret reference
 * configured by a super-admin. That is what structurally prevents server-side
 * request forgery: an injected instruction saying "fetch http://169.254.169.254"
 * cannot express itself, because there is no field for a host. Everything below
 * defends the remaining surface — a path that tries to escape its base, and a
 * base URL a careless administrator should not have configured.
 *
 * **Known limit.** A hostname that resolves to a private address cannot be
 * detected here; the runtime has no DNS resolution before the request is made.
 * The residual risk is therefore an administrator with super-admin rights
 * pointing a connector at an internal name — an attack that requires the
 * attacker to already hold the highest privilege in the system, at which point
 * this connector is not the weakest thing available to them.
 */

/** Methods a connector may use. Anything not listed cannot be requested. */
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/**
 * Host shapes that are never a legitimate outbound target.
 *
 * The link-local address is the cloud metadata endpoint, which is the classic
 * SSRF prize: reaching it can yield the deployment's own cloud credentials.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

/** Timeout for one outbound call. */
export const HTTP_CONNECTOR_TIMEOUT_MS = 15_000;

/** Cap on how much of a response is read back into the agent's context. */
export const HTTP_CONNECTOR_MAX_RESPONSE_BYTES = 128 * 1024;

/** Cap on a request body the agent composes. */
export const HTTP_CONNECTOR_MAX_BODY_BYTES = 64 * 1024;

function isIpv4(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * Whether an IPv4 literal is outside the public internet.
 *
 * Covers loopback, the three private ranges, link-local (including the cloud
 * metadata address), carrier-grade NAT and the unspecified address.
 */
function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;

  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(hostname: string) {
  const address = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (address === "::" || address === "::1") return true;
  // Unique-local and link-local ranges.
  return /^f[cd]/.test(address) || address.startsWith("fe80");
}

export type HttpTargetDecision =
  | { ok: true; url: string; method: string }
  | { ok: false; reason: string };

/** Validate the administrator-configured base URL. */
export function validateHttpConnectorBaseUrl(baseUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return { ok: false, reason: "The connector's base URL is not a valid URL." };
  }

  if (url.protocol !== "https:") {
    // An agent's requests carry the connector's credential. Sending that over
    // plain HTTP hands it to anyone on the path.
    return { ok: false, reason: "The connector's base URL must use https." };
  }

  if (url.username || url.password) {
    return { ok: false, reason: "The connector's base URL must not embed credentials." };
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "The connector's base URL must not point at an internal host." };
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { ok: false, reason: "The connector's base URL must not point at an internal host." };
  }
  if (isIpv4(hostname) && isPrivateIpv4(hostname)) {
    return { ok: false, reason: "The connector's base URL must not point at a private network address." };
  }
  if (hostname.includes(":") && isPrivateIpv6(hostname)) {
    return { ok: false, reason: "The connector's base URL must not point at a private network address." };
  }

  return { ok: true, url };
}

/**
 * Combine the configured base with the path the agent asked for.
 *
 * The path is the only part of the target the model controls, so this is where
 * an injected instruction would try to escape: an absolute URL to redirect the
 * request elsewhere, a protocol-relative `//host` doing the same more quietly,
 * or `../` climbing above the base the administrator scoped.
 */
export function resolveHttpConnectorTarget(args: {
  baseUrl: string;
  path: string;
  method: string;
}): HttpTargetDecision {
  const method = args.method.trim().toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return { ok: false, reason: `HTTP method '${args.method}' is not allowed.` };
  }

  const base = validateHttpConnectorBaseUrl(args.baseUrl);
  if (!base.ok) return base;

  const path = args.path.trim();
  if (path.length === 0) return { ok: false, reason: "A request path is required." };

  // `//evil.test/x` is protocol-relative: resolved against an https base it
  // silently becomes a request to another host.
  if (path.startsWith("//")) {
    return { ok: false, reason: "The request path must not name another host." };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return { ok: false, reason: "The request path must be a path, not a full URL." };
  }
  if (path.includes("\\")) {
    return { ok: false, reason: "The request path must not contain backslashes." };
  }

  // The base's own path is the boundary the administrator scoped the connector
  // to, so it must end in a separator before anything is appended — otherwise
  // a base of `https://api.test/v1` plus `2/secrets` would reach `/v12/secrets`.
  const basePath = base.url.pathname.endsWith("/") ? base.url.pathname : `${base.url.pathname}/`;
  const relative = path.startsWith("/") ? path.slice(1) : path;

  let target: URL;
  try {
    target = new URL(relative, `${base.url.origin}${basePath}`);
  } catch {
    return { ok: false, reason: "The request path is not valid." };
  }

  if (target.origin !== base.url.origin) {
    return { ok: false, reason: "The request path must stay within the connector's base URL." };
  }
  // Catches `../` climbing above the scope the administrator granted.
  if (!target.pathname.startsWith(basePath) && target.pathname !== base.url.pathname) {
    return { ok: false, reason: "The request path must stay within the connector's base URL." };
  }

  return { ok: true, url: target.toString(), method };
}

export type HttpBodyDecision =
  | { ok: true; body?: string }
  | { ok: false; reason: string };

/**
 * Validate the request body the agent composed.
 *
 * Required to be JSON because the connector's contract says `bodyJson`, and
 * because sending a model's free text as an unknown content type to a
 * customer's API is a good way to produce something nobody can debug.
 */
export function resolveHttpConnectorBody(args: {
  method: string;
  bodyJson?: string;
}): HttpBodyDecision {
  const body = args.bodyJson?.trim();
  if (!body) {
    if (args.method === "GET" || args.method === "DELETE") return { ok: true };
    return { ok: true };
  }

  if (args.method === "GET") {
    return { ok: false, reason: "A GET request cannot carry a body." };
  }
  if (body.length > HTTP_CONNECTOR_MAX_BODY_BYTES) {
    return { ok: false, reason: "The request body is too large." };
  }

  try {
    JSON.parse(body);
  } catch {
    return { ok: false, reason: "The request body must be valid JSON." };
  }

  return { ok: true, body };
}

/**
 * Whether a response may be handed back to the model.
 *
 * A redirect is refused rather than followed. Following one would let the
 * destination — which the administrator scoped, but does not control — send the
 * request, and the connector's credential with it, somewhere else entirely.
 */
export function describeHttpConnectorResponse(args: {
  status: number;
  contentLength?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (args.status >= 300 && args.status < 400) {
    return { ok: false, reason: "The connector's endpoint redirected the request, which is not followed." };
  }
  if (args.contentLength !== undefined && args.contentLength > HTTP_CONNECTOR_MAX_RESPONSE_BYTES) {
    return { ok: false, reason: "The response is too large to return to the agent." };
  }
  return { ok: true };
}

/** Trim an oversized response body rather than flooding the model's context. */
export function truncateHttpConnectorBody(body: string) {
  if (body.length <= HTTP_CONNECTOR_MAX_RESPONSE_BYTES) {
    return { body, truncated: false };
  }
  return {
    body: `${body.slice(0, HTTP_CONNECTOR_MAX_RESPONSE_BYTES)}\n\n... [truncated]`,
    truncated: true,
  };
}
