import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authorizationServerDocument, CHAT_APP_SCOPE, protectedResourceDocument, publicOrigin } from "./utils/chatApps";

/**
 * Ask Hakken in ChatGPT and Claude: the sign-in server's public endpoints
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, phase 1).
 * Reached at Hakken's own address, where Next.js passes them through
 * (`src/app/api/chat-apps/[door]/route.ts`), so an app sees one name for the
 * door, the sign-in and the Allow page.
 *
 * - `/.well-known/oauth-protected-resource` (and `/mcp` after it): where the door's sign-in is (RFC 9728).
 * - `/.well-known/oauth-authorization-server`: how to sign in (RFC 8414).
 * - `/oauth/token`: a code or renewal pass swapped for passes.
 * - `/oauth/register`: an app signing itself up (RFC 7591), for the allowed apps only.
 *
 * Nothing here trusts the request for who is asking: every pass is checked in
 * `chatAppPasses.ts` against what Hakken saved when the person pressed Allow.
 */

/** Any web page may read these: the passes are sent as a header, never a cookie, so nothing rides along. */
export const OPEN_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
  "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...OPEN_HEADERS, ...headers } });
}

/** An OAuth error, as RFC 6749 section 5.2 shapes it. Never cached. */
function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status, { "Cache-Control": "no-store" });
}

export const handleOpenOptions = httpAction(async () => new Response(null, { status: 204, headers: OPEN_HEADERS }));

export const handleProtectedResource = httpAction(async (ctx) => {
  const { platformName } = await ctx.runQuery(internal.settings.getEmailBranding, {});
  return json(protectedResourceDocument(publicOrigin(process.env.SITE_URL), platformName), 200, { "Cache-Control": "public, max-age=300" });
});

export const handleAuthorizationServer = httpAction(async () => json(authorizationServerDocument(publicOrigin(process.env.SITE_URL)), 200, { "Cache-Control": "public, max-age=300" }));

/** A request's fields: a form, as RFC 6749 asks and Claude sends, or JSON, which some apps send instead. */
async function fieldsOf(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("Content-Type") ?? "";
  const text = (await request.text()).slice(0, 16 * 1024);
  if (type.includes("application/json")) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(body).filter(([, value]) => typeof value === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** The token endpoint: a code with its PKCE verifier, or a renewal pass, for an hour's pass and a fresh renewal pass. */
export const handleToken = httpAction(async (ctx, request) => {
  const fields = await fieldsOf(request);
  const clientId = fields.client_id ?? "";
  if (!clientId) return oauthError("invalid_client", "Say which app is asking (client_id).", 401);

  let answer;
  if (fields.grant_type === "authorization_code") {
    if (!fields.code || !fields.code_verifier || !fields.redirect_uri) return oauthError("invalid_request", "A code needs its verifier and return address.");
    answer = await ctx.runMutation(internal.chatAppPasses.redeemCodeInternal, {
      code: fields.code,
      clientId,
      redirectUri: fields.redirect_uri,
      codeVerifier: fields.code_verifier,
      ...(fields.resource ? { resource: fields.resource } : {}),
    });
  } else if (fields.grant_type === "refresh_token") {
    if (!fields.refresh_token) return oauthError("invalid_request", "Send the renewal pass (refresh_token).");
    answer = await ctx.runMutation(internal.chatAppPasses.renewInternal, {
      renewalPass: fields.refresh_token,
      clientId,
      ...(fields.resource ? { resource: fields.resource } : {}),
    });
  } else {
    return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
  }

  if (!answer.ok) return oauthError(answer.error, answer.description);
  return json(
    { access_token: answer.accessPass, token_type: "Bearer", expires_in: answer.expiresIn, refresh_token: answer.renewalPass, scope: answer.scope },
    200,
    { "Cache-Control": "no-store", Pragma: "no-cache" },
  );
});

/** An app signing itself up (RFC 7591). Claude does this once a connection when it doesn't use its published document. */
export const handleRegister = httpAction(async (ctx, request) => {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse((await request.text()).slice(0, 16 * 1024)) as Record<string, unknown>;
  } catch {
    return oauthError("invalid_client_metadata", "Send the app's details as JSON.");
  }
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string") : [];
  const name = typeof body.client_name === "string" ? body.client_name : "";
  const answer = await ctx.runMutation(internal.chatAppPasses.signUpClientInternal, { name, redirectUris });
  if (!answer.ok) return oauthError(answer.error, answer.description, answer.error === "temporarily_unavailable" ? 429 : 400);
  return json(
    {
      client_id: answer.clientId,
      client_id_issued_at: Math.floor(answer.createdAt / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: CHAT_APP_SCOPE,
    },
    201,
    { "Cache-Control": "no-store" },
  );
});
