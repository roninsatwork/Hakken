/**
 * The OAuth providers the consent flow knows how to speak to.
 *
 * The flow itself — authorize redirect, state validation, code exchange,
 * refresh, revoke — is provider-agnostic (commitment 2 of the Gmail plan);
 * this registry is the only place a provider's endpoints and credential
 * names live. Google is the first entry because the Gmail connector is the
 * platform's first working connector; a later provider is a new entry here,
 * not a new flow.
 *
 * Client credentials come from the deployment environment, in the same
 * namespace discipline as `CONNECTOR_SECRET_*`: `CONNECTOR_GOOGLE_CLIENT_ID`
 * and `CONNECTOR_GOOGLE_CLIENT_SECRET`. They are the app's own identity at
 * the provider, not a user's — user tokens are ciphertext in
 * `connectorOAuthTokens`, never in the environment.
 */

export type ConnectorOAuthProviderConfig = {
  provider: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /**
   * Environment names to fall back to when the CONNECTOR_* pair is absent.
   * A deployment whose sign-in app and connector app are the same Google
   * client (the live deployment is) then needs no copied settings at all —
   * and a fresh clone of the platform is two settings simpler.
   */
  fallbackClientIdEnv?: string;
  fallbackClientSecretEnv?: string;
  /**
   * Extra query parameters the provider needs on the authorization URL.
   * Google's two are load-bearing: `access_type=offline` is what makes a
   * refresh token exist at all, and `prompt=consent` makes Google re-issue
   * one on reconnect (it otherwise omits it for a returning user, which
   * would leave the connection unable to outlive its first hour).
   */
  extraAuthorizationParams: Record<string, string>;
  /** Where to learn which account was connected, once a token is in hand. */
  resolveAccountEmail: (accessToken: string) => Promise<string | null>;
  /**
   * How the app proves itself to the token and revocation endpoints: in the
   * form body (Google), or as an HTTP Basic header (X, which refuses a secret
   * in the body). Body when absent.
   */
  clientAuth?: "body" | "basic";
  /** Whether the sign-in must carry a PKCE challenge: X requires one. */
  pkce?: boolean;
};

const GOOGLE_PROVIDER: ConnectorOAuthProviderConfig = {
  provider: "google",
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
  clientIdEnv: "CONNECTOR_GOOGLE_CLIENT_ID",
  clientSecretEnv: "CONNECTOR_GOOGLE_CLIENT_SECRET",
  // The Convex Auth sign-in client. Same Google app, different door — a
  // deployment that has not been given a dedicated connector client uses it.
  fallbackClientIdEnv: "AUTH_GOOGLE_ID",
  fallbackClientSecretEnv: "AUTH_GOOGLE_SECRET",
  extraAuthorizationParams: {
    access_type: "offline",
    prompt: "consent",
  },
  resolveAccountEmail: async (accessToken: string) => {
    // The Gmail profile endpoint answers with the mailbox's own address and
    // is covered by the Gmail scope the connector already asks for — no
    // extra identity scope needed.
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const profile = (await response.json()) as { emailAddress?: string };
    return profile.emailAddress ?? null;
  },
};

/**
 * Google again, for Search Console (docs/plans/active/search-console-plan.md):
 * a separate Google app with its own client pair and no fallback to the
 * sign-in app's. Gmail's scopes are restricted and reviewed by Google before
 * an app using them may be published; Search Console's read-only scope is
 * not, and its app must be published — connections from an app left in
 * testing die after seven days.
 */
export const SEARCH_CONSOLE_PROVIDER = "google-search-console";

const GOOGLE_SEARCH_CONSOLE_PROVIDER: ConnectorOAuthProviderConfig = {
  provider: SEARCH_CONSOLE_PROVIDER,
  authorizationEndpoint: GOOGLE_PROVIDER.authorizationEndpoint,
  tokenEndpoint: GOOGLE_PROVIDER.tokenEndpoint,
  revocationEndpoint: GOOGLE_PROVIDER.revocationEndpoint,
  clientIdEnv: "SEARCH_CONSOLE_GOOGLE_CLIENT_ID",
  clientSecretEnv: "SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET",
  // Offline and consent as for Gmail; and the account picker every time, since
  // the person connecting often has several Google accounts and the site's
  // Search Console may be in any of them.
  extraAuthorizationParams: { access_type: "offline", prompt: "select_account consent" },
  resolveAccountEmail: async (accessToken: string) => {
    // Google's own account answer, from the `openid email` scopes asked with Search Console's.
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const account = (await response.json()) as { email?: string };
    return account.email ?? null;
  },
};

/**
 * X, for Anthony's own bookmarks (docs/plans/active/knowledge-news-and-
 * digest-plan.md, phase 6): X gives bookmarks only to a personal sign-in.
 * OAuth 2.0 with PKCE, the app proving itself with a Basic header; its pair
 * is `X_CLIENT_ID` and `X_CLIENT_SECRET`, from the X developer app. The
 * "account" is the signed-in handle.
 */
export const X_PROVIDER = "x";

const X_OAUTH_PROVIDER: ConnectorOAuthProviderConfig = {
  provider: X_PROVIDER,
  authorizationEndpoint: "https://x.com/i/oauth2/authorize",
  tokenEndpoint: "https://api.x.com/2/oauth2/token",
  revocationEndpoint: "https://api.x.com/2/oauth2/revoke",
  clientIdEnv: "X_CLIENT_ID",
  clientSecretEnv: "X_CLIENT_SECRET",
  extraAuthorizationParams: {},
  clientAuth: "basic",
  pkce: true,
  resolveAccountEmail: async (accessToken: string) => {
    const response = await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return null;
    const me = (await response.json()) as { data?: { username?: string } };
    return me.data?.username ? `@${me.data.username}` : null;
  },
};

const PROVIDERS: Record<string, ConnectorOAuthProviderConfig> = {
  google: GOOGLE_PROVIDER,
  [SEARCH_CONSOLE_PROVIDER]: GOOGLE_SEARCH_CONSOLE_PROVIDER,
  [X_PROVIDER]: X_OAUTH_PROVIDER,
};

export function getConnectorOAuthProvider(provider: string): ConnectorOAuthProviderConfig | null {
  return PROVIDERS[provider] ?? null;
}

export function getConnectorOAuthClientCredentials(provider: string):
  | { clientId: string; clientSecret: string }
  | null {
  const config = getConnectorOAuthProvider(provider);
  if (!config) return null;
  // The dedicated pair wins; the sign-in app's pair only answers when the
  // dedicated pair is wholly absent — a half-set pair is a configuration
  // mistake and must fail visibly, not half-fall-back.
  let clientId = process.env[config.clientIdEnv]?.trim();
  let clientSecret = process.env[config.clientSecretEnv]?.trim();
  if (!clientId && !clientSecret && config.fallbackClientIdEnv && config.fallbackClientSecretEnv) {
    clientId = process.env[config.fallbackClientIdEnv]?.trim();
    clientSecret = process.env[config.fallbackClientSecretEnv]?.trim();
  }
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Whether this provider's credentials are configured on the deployment. */
export function isConnectorOAuthProviderConfigured(provider: string) {
  return getConnectorOAuthClientCredentials(provider) !== null;
}
