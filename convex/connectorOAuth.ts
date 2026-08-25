import { v } from "convex/values";
import { httpAction, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  getConnectorOAuthClientCredentials,
  getConnectorOAuthProvider,
} from "./connectorOAuthProviders";
import {
  decryptConnectorToken,
  encryptConnectorToken,
  isConnectorTokenEncryptionConfigured,
} from "./connectorTokenCrypto";
import { appError } from "./utils/appError";

/**
 * The consent flow: the platform's first real OAuth plumbing.
 *
 * An admin clicks Connect (`beginConnectorOAuth` stores a PENDING connection
 * with a single-use random state), lands on `/api/connectors/oauth/authorize`
 * here, is redirected to the provider's consent screen, and comes back to
 * `/api/connectors/oauth/callback` where the code is exchanged server-side.
 * Tokens are written as ciphertext (`connectorTokenCrypto`) into
 * `connectorOAuthTokens` — a table no client-callable function reads.
 *
 * Provider-agnostic on purpose (commitment 2 of the Gmail plan): endpoints
 * and credentials come from `connectorOAuthProviders`; Google is simply the
 * first entry.
 */

/** A pending connection older than this cannot be completed — restart. */
const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;

/** Refresh when the access token has less life left than this. */
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

/** The hourly sweep refreshes anything dying within this window. */
const TOKEN_SWEEP_HORIZON_MS = 2 * 60 * 60 * 1000;

function adminReturnUrl(connectorId: string, params: Record<string, string>) {
  const base = process.env.SITE_URL?.trim() || "http://localhost:3000";
  const query = new URLSearchParams(params).toString();
  return `${base.replace(/\/+$/, "")}/admin/ai/tools/connectors/${connectorId}?${query}`;
}

function redirectTo(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

/**
 * GET /api/connectors/oauth/authorize?state=...
 *
 * Turns a pending connection into a provider redirect. Everything secret
 * stays server-side: the browser carries only the single-use state.
 */
export const handleConnectorOAuthAuthorize = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });

  const connection = await ctx.runQuery(internal.connectorOAuth.getPendingConnectionByState, {
    state,
  });
  if (!connection) return new Response("Unknown or expired authorization.", { status: 400 });

  const provider = getConnectorOAuthProvider(connection.provider);
  const credentials = getConnectorOAuthClientCredentials(connection.provider);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) {
    return new Response("This provider is not configured on this deployment.", { status: 400 });
  }

  const redirectUri = `${url.origin}/api/connectors/oauth/callback`;
  const authUrl = new URL(provider.authorizationEndpoint);
  authUrl.search = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: connection.scopes.join(" "),
    state,
    ...provider.extraAuthorizationParams,
  }).toString();

  return redirectTo(authUrl.toString());
});

/**
 * GET /api/connectors/oauth/callback?code=...&state=...
 *
 * Validates the state against the stored PENDING connection (single-use:
 * any outcome moves it out of PENDING), exchanges the code server-side,
 * writes ciphertext, marks the connection, and sends the admin back to the
 * connector screen with an honest outcome either way.
 */
export const handleConnectorOAuthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const providerError = url.searchParams.get("error")?.trim() ?? "";

  if (!state) return new Response("Missing state.", { status: 400 });

  const connection = await ctx.runQuery(internal.connectorOAuth.getPendingConnectionByState, {
    state,
  });
  if (!connection) return new Response("Unknown or expired authorization.", { status: 400 });

  const fail = async (message: string) => {
    await ctx.runMutation(internal.connectorOAuth.markConnectionError, {
      connectionId: connection._id,
      message,
    });
    return redirectTo(adminReturnUrl(connection.connectorId, { oauthError: message }));
  };

  if (providerError) return await fail(`The provider refused authorization: ${providerError}`);
  if (!code) return await fail("The provider returned no authorization code.");

  const provider = getConnectorOAuthProvider(connection.provider);
  const credentials = getConnectorOAuthClientCredentials(connection.provider);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) {
    return await fail("This provider is not configured on this deployment.");
  }

  // Exchange the code — the one step that must never happen in a browser.
  let tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  try {
    const response = await fetch(provider.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: `${url.origin}/api/connectors/oauth/callback`,
      }).toString(),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return await fail(`Token exchange failed (${response.status}): ${detail}`);
    }
    tokens = await response.json();
  } catch {
    return await fail("Token exchange failed: the provider could not be reached.");
  }

  if (!tokens.access_token) return await fail("The provider returned no access token.");

  const grantedScopes = tokens.scope ? tokens.scope.split(" ").filter(Boolean) : connection.scopes;
  const missingScopes = connection.scopes.filter((scope) => !grantedScopes.includes(scope));
  if (missingScopes.length > 0) {
    return await fail(`The connection is missing required scopes: ${missingScopes.join(", ")}`);
  }

  const accountEmail = await provider.resolveAccountEmail(tokens.access_token).catch(() => null);

  const accessTokenCiphertext = await encryptConnectorToken(tokens.access_token);
  const refreshTokenCiphertext = tokens.refresh_token
    ? await encryptConnectorToken(tokens.refresh_token)
    : undefined;

  await ctx.runMutation(internal.connectorOAuth.finalizeConnection, {
    connectionId: connection._id,
    accountEmail: accountEmail ?? "connected account",
    grantedScopes,
    accessTokenCiphertext,
    refreshTokenCiphertext,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  });

  return redirectTo(adminReturnUrl(connection.connectorId, { oauthConnected: "1" }));
});

export const getPendingConnectionByState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args): Promise<Doc<"toolConnectorOAuthConnections"> | null> => {
    if (!args.state) return null;
    const connection = await ctx.db
      .query("toolConnectorOAuthConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!connection || connection.status !== "PENDING") return null;
    // A stale PENDING row cannot complete: the admin restarts, which mints a
    // fresh state. Bounding the window bounds replay exposure too.
    if (Date.now() - connection.createdAt > OAUTH_STATE_MAX_AGE_MS) return null;
    return connection;
  },
});

export const markConnectionError = internalMutation({
  args: {
    connectionId: v.id("toolConnectorOAuthConnections"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: "ERROR",
      message: args.message,
      updatedAt: now,
    });
    await ctx.db.patch(connection.connectorId, {
      authConnectionStatus: "ERROR",
      lastTestMessage: args.message,
      updatedAt: now,
    });
  },
});

export const finalizeConnection = internalMutation({
  args: {
    connectionId: v.id("toolConnectorOAuthConnections"),
    accountEmail: v.string(),
    grantedScopes: v.array(v.string()),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.status !== "PENDING") {
      throw appError("CONFLICT", "OAuth session is not pending.");
    }
    const now = Date.now();

    // One token row per connection: a reconnect replaces what it finds.
    // Bounded because that invariant makes more than a handful impossible.
    const existing = await ctx.db
      .query("connectorOAuthTokens")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .take(10);
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("connectorOAuthTokens", {
      connectionId: connection._id,
      connectorId: connection.connectorId,
      companyId: connection.companyId,
      provider: connection.provider,
      accessTokenCiphertext: args.accessTokenCiphertext,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      expiresAt: args.expiresAt,
      scopes: args.grantedScopes,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(connection._id, {
      status: "CONNECTED",
      accountRef: args.accountEmail,
      scopes: args.grantedScopes,
      message: "OAuth connection completed.",
      connectedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(connection.connectorId, {
      authConnectionStatus: "CONNECTED",
      authAccountRef: args.accountEmail,
      oauthScopes: args.grantedScopes,
      oauthConnectedAt: now,
      testStatus: "UNTESTED",
      lastTestMessage: `Connected as ${args.accountEmail}.`,
      updatedAt: now,
    });

    const connector = await ctx.db.get(connection.connectorId);
    await ctx.db.insert("auditLogs", {
      actorId: connection.initiatedBy,
      actionType: "CONNECTOR_OAUTH_CONNECTED",
      entityId: connection.connectorId.toString(),
      entityType: "toolConnectors",
      companyId: connection.companyId ?? connector?.companyId,
      timestamp: now,
      // The account and scopes, never a token: same restraint as every other
      // connector audit entry.
      metadata: JSON.stringify({
        provider: connection.provider,
        account: args.accountEmail,
        scopes: args.grantedScopes,
      }),
    });
  },
});

/**
 * The one door to a usable access token, for internal callers only.
 *
 * Decrypts, refreshes when the token is near death, and reports a dead
 * connection honestly: `{ ok: false }` with a reconnect message, never a
 * silent failure (commitment 4).
 */
export const getConnectorAccessToken = internalAction({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (
    ctx,
    args
  ): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> => {
    const row = await ctx.runQuery(internal.connectorOAuth.readTokenRow, {
      connectorId: args.connectorId,
    });
    if (!row) {
      return { ok: false, error: "This connector is not connected. Connect it from the admin screen." };
    }

    const needsRefresh = row.expiresAt !== undefined && row.expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS;
    if (!needsRefresh) {
      try {
        return { ok: true, accessToken: await decryptConnectorToken(row.accessTokenCiphertext) };
      } catch {
        return { ok: false, error: "Stored connector credentials could not be read. Reconnect the mailbox." };
      }
    }

    return await refreshTokenRow(ctx, row);
  },
});

async function refreshTokenRow(
  ctx: ActionCtx,
  row: Doc<"connectorOAuthTokens">
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const provider = getConnectorOAuthProvider(row.provider);
  const credentials = getConnectorOAuthClientCredentials(row.provider);
  if (!provider || !credentials) {
    return { ok: false, error: "This provider is not configured on this deployment." };
  }
  if (!row.refreshTokenCiphertext) {
    return { ok: false, error: "The connection cannot be renewed. Reconnect the mailbox." };
  }

  let refreshToken: string;
  try {
    refreshToken = await decryptConnectorToken(row.refreshTokenCiphertext);
  } catch {
    return { ok: false, error: "Stored connector credentials could not be read. Reconnect the mailbox." };
  }

  let tokens: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    const response = await fetch(provider.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }).toString(),
    });
    if (!response.ok) {
      // A revoked grant (password change, admin revoke) answers 400 here.
      // Surface it as the honest disconnected state the design promises.
      await ctx.runMutation(internal.connectorOAuth.markConnectionDead, {
        tokenRowId: row._id,
        reason: `The provider refused to renew the connection (${response.status}).`,
      });
      return {
        ok: false,
        error: "The mailbox connection was revoked at the provider. Reconnect it from the admin screen.",
      };
    }
    tokens = await response.json();
  } catch {
    return { ok: false, error: "The provider could not be reached to renew the connection." };
  }

  if (!tokens.access_token) {
    return { ok: false, error: "The provider returned no renewed token. Reconnect the mailbox." };
  }

  const accessTokenCiphertext = await encryptConnectorToken(tokens.access_token);
  const refreshTokenCiphertext = tokens.refresh_token
    ? await encryptConnectorToken(tokens.refresh_token)
    : undefined;

  await ctx.runMutation(internal.connectorOAuth.storeRefreshedToken, {
    tokenRowId: row._id,
    accessTokenCiphertext,
    refreshTokenCiphertext,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  });

  return { ok: true, accessToken: tokens.access_token };
}

export const readTokenRow = internalQuery({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args): Promise<Doc<"connectorOAuthTokens"> | null> => {
    return await ctx.db
      .query("connectorOAuthTokens")
      .withIndex("by_connector", (q) => q.eq("connectorId", args.connectorId))
      .first();
  },
});

export const storeRefreshedToken = internalMutation({
  args: {
    tokenRowId: v.id("connectorOAuthTokens"),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenRowId);
    if (!row) return;
    await ctx.db.patch(row._id, {
      accessTokenCiphertext: args.accessTokenCiphertext,
      // A refresh response that omits the refresh token keeps the old one —
      // Google only re-issues it on full consent.
      ...(args.refreshTokenCiphertext ? { refreshTokenCiphertext: args.refreshTokenCiphertext } : {}),
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
  },
});

/** A grant the provider refused to renew: delete ciphertext, mark honestly. */
export const markConnectionDead = internalMutation({
  args: {
    tokenRowId: v.id("connectorOAuthTokens"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenRowId);
    if (!row) return;
    await ctx.db.delete(row._id);
    const now = Date.now();
    const connection = await ctx.db.get(row.connectionId);
    if (connection) {
      await ctx.db.patch(connection._id, {
        status: "ERROR",
        message: `${args.reason} Reconnect the mailbox.`,
        updatedAt: now,
      });
    }
    await ctx.db.patch(row.connectorId, {
      authConnectionStatus: "ERROR",
      lastTestMessage: `${args.reason} Reconnect the mailbox.`,
      updatedAt: now,
    });
  },
});

/**
 * Revoke at the provider, then delete the ciphertext, then mark the
 * connection — the ordering commitment 4 names. Scheduled by
 * `disconnectConnectorOAuth`; a provider that cannot be reached still loses
 * the local ciphertext, because a key we cannot revoke must at least be one
 * we no longer hold.
 */
export const revokeAndDisconnect = internalAction({
  args: {
    connectorId: v.id("toolConnectors"),
    actorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.connectorOAuth.readTokenRow, {
      connectorId: args.connectorId,
    });

    if (row) {
      const provider = getConnectorOAuthProvider(row.provider);
      const credentials = getConnectorOAuthClientCredentials(row.provider);
      if (provider && credentials) {
        // Prefer the refresh token: revoking it kills the whole grant.
        const ciphertext = row.refreshTokenCiphertext ?? row.accessTokenCiphertext;
        try {
          const token = await decryptConnectorToken(ciphertext);
          await fetch(provider.revocationEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token }).toString(),
          });
        } catch {
          // Unreachable or undecryptable: the local deletion below still runs.
        }
      }
    }

    await ctx.runMutation(internal.connectorOAuth.completeDisconnect, {
      connectorId: args.connectorId,
      actorId: args.actorId,
    });
  },
});

export const completeDisconnect = internalMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    actorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("connectorOAuthTokens")
      .withIndex("by_connector", (q) => q.eq("connectorId", args.connectorId))
      .take(10);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    const connector = await ctx.db.get(args.connectorId);
    if (connector) {
      await ctx.db.insert("auditLogs", {
        actorId: args.actorId,
        actionType: "CONNECTOR_OAUTH_DISCONNECTED",
        entityId: args.connectorId.toString(),
        entityType: "toolConnectors",
        companyId: connector.companyId,
        timestamp: now,
        metadata: JSON.stringify({ account: connector.authAccountRef }),
      });
    }
  },
});

/**
 * The hourly sweep: refresh tokens dying within the horizon so a long-idle
 * connection is alive the moment it is needed, and a silently revoked one
 * is discovered within the hour rather than at demo time.
 */
export const refreshExpiringTokens = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.runQuery(internal.connectorOAuth.listExpiringTokenRows, {
      before: Date.now() + TOKEN_SWEEP_HORIZON_MS,
    });
    for (const row of rows) {
      await refreshTokenRow(ctx, row);
    }
  },
});

export const listExpiringTokenRows = internalQuery({
  args: { before: v.number() },
  handler: async (ctx, args): Promise<Doc<"connectorOAuthTokens">[]> => {
    return await ctx.db
      .query("connectorOAuthTokens")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", args.before))
      .take(50);
  },
});
