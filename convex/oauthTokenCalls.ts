import type { ConnectorOAuthProviderConfig } from "./connectorOAuthProviders";

/**
 * The three calls every OAuth connection makes to its provider: exchange the
 * code the consent screen hands back, renew an access token from its refresh
 * token, revoke the grant. Shared by the admin connectors (`connectorOAuth.ts`)
 * and Search Console (`searchConsoleConnect.ts`) — one copy of each call, so
 * the two cannot drift. Nothing here reads or writes the database: callers
 * decide what a refusal means for their own connection.
 */

export type OAuthTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type Credentials = { clientId: string; clientSecret: string };

const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

/**
 * The app's own proof, as its provider wants it: an HTTP Basic header (X), or
 * the pair in the form body (Google). One place, for all three calls.
 */
function withClient(provider: ConnectorOAuthProviderConfig, credentials: Credentials, form: Record<string, string>) {
  if (provider.clientAuth === "basic") {
    return {
      headers: { ...FORM, Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}` },
      body: new URLSearchParams({ ...form, client_id: credentials.clientId }).toString(),
    };
  }
  return { headers: FORM, body: new URLSearchParams({ ...form, client_id: credentials.clientId, client_secret: credentials.clientSecret }).toString() };
}

/** Exchange an authorization code, server-side only, or say why it failed. */
export async function exchangeAuthorizationCode(args: {
  provider: ConnectorOAuthProviderConfig;
  credentials: Credentials;
  code: string;
  redirectUri: string;
  /** The PKCE verifier the sign-in's challenge was made from, for a provider that asks for one. */
  codeVerifier?: string;
}): Promise<{ ok: true; tokens: OAuthTokens } | { ok: false; message: string }> {
  try {
    const response = await fetch(args.provider.tokenEndpoint, {
      method: "POST",
      ...withClient(args.provider, args.credentials, {
        grant_type: "authorization_code",
        code: args.code,
        redirect_uri: args.redirectUri,
        ...(args.codeVerifier ? { code_verifier: args.codeVerifier } : {}),
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return { ok: false, message: `Token exchange failed (${response.status}): ${detail}` };
    }
    return { ok: true, tokens: (await response.json()) as OAuthTokens };
  } catch {
    return { ok: false, message: "Token exchange failed: the provider could not be reached." };
  }
}

/**
 * Renew an access token. `refused` is the provider saying no — a revoked
 * grant answers 400 — as against not being reached, which is worth trying
 * again later.
 */
export async function refreshAccessToken(args: {
  provider: ConnectorOAuthProviderConfig;
  credentials: Credentials;
  refreshToken: string;
}): Promise<{ ok: true; tokens: OAuthTokens } | { ok: false; refused: true; status: number } | { ok: false; refused: false }> {
  try {
    const response = await fetch(args.provider.tokenEndpoint, {
      method: "POST",
      ...withClient(args.provider, args.credentials, { grant_type: "refresh_token", refresh_token: args.refreshToken }),
    });
    if (!response.ok) return { ok: false, refused: true, status: response.status };
    return { ok: true, tokens: (await response.json()) as OAuthTokens };
  } catch {
    return { ok: false, refused: false };
  }
}

/**
 * Revoke a grant at the provider. Unreachable is not an error: the caller
 * forgets the token either way. A provider that wants the app's proof here
 * too (X) is given it.
 */
export async function revokeOAuthToken(provider: ConnectorOAuthProviderConfig, token: string, credentials?: Credentials): Promise<void> {
  try {
    await fetch(provider.revocationEndpoint, {
      method: "POST",
      ...(provider.clientAuth === "basic" && credentials
        ? withClient(provider, credentials, { token, token_type_hint: "refresh_token" })
        : { headers: FORM, body: new URLSearchParams({ token }).toString() }),
    });
  } catch {
    // The local deletion that follows still runs.
  }
}
