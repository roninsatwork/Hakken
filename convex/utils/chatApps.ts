/**
 * Ask Hakken in ChatGPT and Claude: the rules that need no database
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md).
 *
 * A person adds Hakken to ChatGPT or Claude, signs in and presses Allow, and the
 * app then reads their company's figures through Hakken's MCP door (`/mcp`).
 * This file holds the parts every step shares: which apps may connect and where
 * they may be sent back, PKCE, the passes and their fingerprints, and the two
 * public documents an app reads to find its way in. Plain functions, no
 * database, so the HTTP handlers, the Allow page's checks and the tests read
 * the same rules.
 *
 * Named "chat apps" in code because `aiApp…` already names the AI answers
 * Visibility tracks (`aiAppSchema.ts`).
 */

import { appError } from "./appError";

/** The apps that may connect (Anthony, 2026-11-21: ChatGPT and Claude only at first). */
export const CHAT_APPS = ["chatgpt", "claude", "local"] as const;
export type ChatApp = (typeof CHAT_APPS)[number];

/** The two a client sees on its Integrations tab. `local` is for testing on a developer's machine only. */
export const LISTED_CHAT_APPS = ["chatgpt", "claude"] as const satisfies readonly ChatApp[];
export type ListedChatApp = (typeof LISTED_CHAT_APPS)[number];

export const CHAT_APP_NAMES: Record<ChatApp, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  local: "A test app",
};

/** Who makes each app, whose terms say what happens to the figures it reads (the Allow page says so). */
export const CHAT_APP_MAKERS: Record<ChatApp, string> = {
  chatgpt: "OpenAI",
  claude: "Anthropic",
  local: "The app maker",
};

/**
 * Where each app may be sent back after Allow, exactly. A return address is
 * matched whole, never by prefix, so a look-alike path can't collect a code.
 * Checked on 21 November 2026 against each app's own published client document
 * and connector docs (developers.openai.com/apps-sdk/build/auth,
 * claude.com/docs/connectors/building/authentication). ChatGPT uses its one
 * address because Hakken names itself in every answer (RFC 9207).
 */
export const CHAT_APP_RETURN_ADDRESSES: Record<Exclude<ChatApp, "local">, readonly string[]> = {
  chatgpt: ["https://chatgpt.com/connector_platform_oauth_redirect"],
  claude: ["https://claude.ai/api/mcp/auth_callback"],
};

/** The hosts an app's own published client document may live on (Client ID Metadata Documents). */
export const CHAT_APP_DOCUMENT_HOSTS: Record<Exclude<ChatApp, "local">, readonly string[]> = {
  chatgpt: ["chatgpt.com"],
  claude: ["claude.ai"],
};

/** The scope every pass carries: reading a company's figures, nothing else. */
export const CHAT_APP_SCOPE = "figures:read";

/** How long each thing lasts. */
export const ALLOW_CODE_LIFETIME_MS = 5 * 60 * 1000;
export const ACCESS_PASS_LIFETIME_MS = 60 * 60 * 1000;
export const RENEWAL_PASS_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Questions one person may ask a minute (Anthony, 2026-11-21: "Make this 15 not 60"). */
export const QUESTIONS_PER_MINUTE = 15;

/** The address this deployment is reached at, which every public document names. */
export function publicOrigin(siteUrl: string | undefined): string {
  const origin = (siteUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+$/.test(origin)) throw appError("NOT_CONFIGURED", "SITE_URL must be set to the app's own address, such as https://app.example.com.");
  return origin;
}

/** The MCP door's address: the resource every pass is for (RFC 8707). */
export function resourceOf(origin: string): string {
  return `${origin}/mcp`;
}

/**
 * Whether a deployment may let a test app on a developer's own machine connect
 * (Claude Code, MCP Inspector). Only a deployment whose own address is local:
 * never one reached on the internet.
 */
export function allowsLocalApps(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

/** A return address on the developer's own machine: http on localhost or a loopback address, any port. */
export function isLoopbackAddress(address: string): boolean {
  try {
    const url = new URL(address);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/**
 * Whether the return address an app asks for is one it registered. Exact, except
 * that a loopback address may come back on any port (RFC 8252, section 7.3):
 * Claude Code publishes `http://localhost/callback` and listens on a free port.
 */
export function sameReturnAddress(registered: string, asked: string): boolean {
  if (registered === asked) return true;
  if (!isLoopbackAddress(registered) || !isLoopbackAddress(asked)) return false;
  const a = new URL(registered);
  const b = new URL(asked);
  return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
}

/**
 * Which allowed app a return address belongs to, or null when none does.
 * A loopback address counts only on a local deployment.
 */
export function appForReturnAddress(address: string, origin: string): ChatApp | null {
  for (const app of ["chatgpt", "claude"] as const) {
    if (CHAT_APP_RETURN_ADDRESSES[app].includes(address)) return app;
  }
  if (allowsLocalApps(origin) && isLoopbackAddress(address)) return "local";
  return null;
}

/**
 * The app every return address of a client belongs to. A client whose addresses
 * point at two apps, or at none, is refused: one client is one app.
 */
export function appForReturnAddresses(addresses: readonly string[], origin: string): ChatApp | null {
  if (addresses.length === 0 || addresses.length > 10) return null;
  const apps = new Set(addresses.map((address) => appForReturnAddress(address, origin)));
  if (apps.size !== 1 || apps.has(null)) return null;
  return [...apps][0] as ChatApp;
}

/**
 * Whether a client id is a published client document's address (Client ID
 * Metadata Documents): https, a path, no credentials or fragment, on an allowed
 * app's host. Only then is it fetched.
 */
export function documentClientApp(clientId: string): Exclude<ChatApp, "local"> | null {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port || url.pathname === "/" || url.pathname === "") return null;
  const host = url.hostname.toLowerCase();
  for (const app of ["chatgpt", "claude"] as const) {
    if (CHAT_APP_DOCUMENT_HOSTS[app].includes(host)) return app;
  }
  return null;
}

/** A client document's fields Hakken uses, checked. Null when it isn't one. */
export function readClientDocument(clientId: string, document: unknown): { name: string; redirectUris: string[] } | null {
  if (!document || typeof document !== "object") return null;
  const doc = document as Record<string, unknown>;
  if (doc.client_id !== clientId) return null;
  const redirectUris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((uri): uri is string => typeof uri === "string") : [];
  if (redirectUris.length === 0) return null;
  const name = typeof doc.client_name === "string" && doc.client_name.trim() ? doc.client_name.trim().slice(0, 80) : "";
  return { name, redirectUris };
}

/** Bytes as base64url, no padding. */
export function base64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A secret of 32 random bytes, with a short kind in front so a leaked one says what it is. */
export function newSecret(kind: "code" | "pass" | "renew" | "client"): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `hk_${kind}_${base64Url(bytes)}`;
}

/** What Hakken keeps of a secret: its SHA-256, in hex. The secret itself is never stored. */
export async function fingerprintOf(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** PKCE (RFC 7636): only S256, and a challenge of the right shape. */
export function isCodeChallenge(challenge: string, method: string | null | undefined): boolean {
  return method === "S256" && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

/** PKCE's check: the verifier's SHA-256, as base64url, is the challenge sent with the Allow request. */
export async function verifierMatches(verifier: string, challenge: string): Promise<boolean> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest)) === challenge;
}

/**
 * A pass names the door it's for (RFC 8707). An app may leave the resource out,
 * or name the door with or without a trailing slash; anything else is another
 * server and is refused.
 */
export function isOurResource(asked: string | null | undefined, origin: string): boolean {
  if (asked === null || asked === undefined || asked === "") return true;
  const door = resourceOf(origin);
  return asked === door || asked === `${door}/` || asked === origin || asked === `${origin}/`;
}

/** The protected resource's document (RFC 9728), served at `/.well-known/oauth-protected-resource`. */
export function protectedResourceDocument(origin: string, platformName: string) {
  return {
    resource: resourceOf(origin),
    authorization_servers: [origin],
    scopes_supported: [CHAT_APP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: platformName,
  };
}

/** The sign-in server's document (RFC 8414), served at `/.well-known/oauth-authorization-server`. */
export function authorizationServerDocument(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: [CHAT_APP_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

/** The 401 an app reads to find the sign-in (MCP authorization, RFC 9728 section 5.1). */
export function unauthorizedHeader(origin: string, error?: "invalid_token"): string {
  const parts = [`resource_metadata="${origin}/.well-known/oauth-protected-resource"`, `scope="${CHAT_APP_SCOPE}"`];
  if (error) parts.unshift(`error="${error}"`);
  return `Bearer ${parts.join(", ")}`;
}

/**
 * The address the person goes back to: the app's return address with the code,
 * its own state and Hakken's name (RFC 9207), or with the refusal.
 */
export function returnAddressWith(address: string, params: Record<string, string | undefined>): string {
  const url = new URL(address);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
