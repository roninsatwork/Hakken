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

/** Exchange an authorization code, server-side only, or say why it failed. */
export async function exchangeAuthorizationCode(args: {
  provider: ConnectorOAuthProviderConfig;
  credentials: Credentials;
  code: string;
  redirectUri: string;
}): Promise<{ ok: true; tokens: OAuthTokens } | { ok: false; message: string }> {
  try {
    const response = await fetch(args.provider.tokenEndpoint, {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: args.code,
        client_id: args.credentials.clientId,
        client_secret: args.credentials.clientSecret,
        redirect_uri: args.redirectUri,
      }).toString(),
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
      headers: FORM,
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: args.refreshToken,
        client_id: args.credentials.clientId,
        client_secret: args.credentials.clientSecret,
      }).toString(),
    });
    if (!response.ok) return { ok: false, refused: true, status: response.status };
    return { ok: true, tokens: (await response.json()) as OAuthTokens };
  } catch {
    return { ok: false, refused: false };
  }
}

/** Revoke a grant at the provider. Unreachable is not an error: the caller forgets the token either way. */
export async function revokeOAuthToken(provider: ConnectorOAuthProviderConfig, token: string): Promise<void> {
  try {
    await fetch(provider.revocationEndpoint, {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // The local deletion that follows still runs.
  }
}
