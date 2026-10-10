import { v } from "convex/values";

import { httpAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { X_PROVIDER, getConnectorOAuthClientCredentials, getConnectorOAuthProvider } from "./connectorOAuthProviders";
import { decryptConnectorToken, encryptConnectorToken, isConnectorTokenEncryptionConfigured } from "./connectorTokenCrypto";
import { exchangeAuthorizationCode, revokeOAuthToken } from "./oauthTokenCalls";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";

/**
 * Connecting Anthony's X account (docs/plans/active/knowledge-news-and-
 * digest-plan.md, phase 6): X gives bookmarks only to a personal sign-in, so
 * he connects once on Admin → Content → Who to follow and approves reading
 * bookmarks, and the News Collector imports each new one. The flow is Search
 * Console's (`searchConsoleConnect.ts`) — a single-use state minted for the
 * signed-in super admin, the code exchanged on the server only, the tokens
 * kept encrypted and never shown — with the PKCE X requires: the verifier is
 * made when the sign-in leaves for X and kept encrypted until it returns.
 */

/** What reading bookmarks needs: the posts, who wrote them, the bookmarks, and a renewable grant. */
export const X_SCOPES = ["tweet.read", "users.read", "bookmark.read", "offline.access"] as const;

/** A sign-in older than this cannot be finished: connect again. */
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

/** Whether this deployment has the X app's pair and the key tokens are kept under. */
export function isXSignInConfigured(): boolean {
  return getConnectorOAuthClientCredentials(X_PROVIDER) !== null && isConnectorTokenEncryptionConfigured();
}

/** Whether X accounts can be read: the app token from the X developer app. */
export function isXAppTokenConfigured(): boolean {
  return Boolean(process.env.X_BEARER_TOKEN?.trim());
}

function whoToFollowScreen(outcome: string) {
  const base = (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/admin/content/who-to-follow?x=${outcome}`;
}

function redirectTo(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function theConnection(ctx: { db: QueryCtx["db"] }): Promise<Doc<"xConnections"> | null> {
  return await ctx.db.query("xConnections").first();
}

// ── Starting ───────────────────────────────────────────────────────────────

/** Start connecting: super admins only. Hands back the one link the browser follows; only the state leaves the server. */
export const beginXConnect = superAdminMutation({
  args: {},
  returns: v.object({ authorizeUrl: v.string() }),
  handler: async (ctx) => {
    if (!isXSignInConfigured()) {
      throw appError("NOT_CONFIGURED", "Connecting X is not set up on this deployment yet: it needs X_CLIENT_ID, X_CLIENT_SECRET and CONNECTOR_TOKEN_ENCRYPTION_KEY.");
    }
    const now = Date.now();
    const state = `x:${now}:${randomHex(24)}`;
    const pending = { pendingState: state, pendingAt: now, pendingBy: ctx.userId, verifierCiphertext: undefined, updatedAt: now };
    const held = await theConnection(ctx);
    // A connection that works keeps working until a new sign-in finishes.
    if (held) await ctx.db.patch(held._id, pending);
    else await ctx.db.insert("xConnections", { status: "CONNECTING", ...pending, createdAt: now });
    const siteUrl = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
    return { authorizeUrl: `${siteUrl}/api/x/oauth/authorize?${new URLSearchParams({ state })}` };
  },
});

/** A sign-in under way, when its state is one this deployment minted in the last fifteen minutes. */
export const pendingByState = internalQuery({
  args: { state: v.string() },
  returns: v.union(v.null(), v.object({ verifierCiphertext: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    if (!args.state) return null;
    const connection = await ctx.db.query("xConnections").withIndex("by_pending_state", (q) => q.eq("pendingState", args.state)).first();
    if (!connection?.pendingAt || Date.now() - connection.pendingAt > STATE_MAX_AGE_MS) return null;
    return { verifierCiphertext: connection.verifierCiphertext ?? null };
  },
});

export const keepVerifier = internalMutation({
  args: { state: v.string(), verifierCiphertext: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("xConnections").withIndex("by_pending_state", (q) => q.eq("pendingState", args.state)).first();
    if (connection) await ctx.db.patch(connection._id, { verifierCiphertext: args.verifierCiphertext, updatedAt: Date.now() });
    return null;
  },
});

/** GET /api/x/oauth/authorize?state=… — on to X's own sign-in, with a fresh PKCE challenge. */
export const handleXAuthorize = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });
  const pending = await ctx.runQuery(internal.xConnect.pendingByState, { state });
  if (!pending) return new Response("This sign-in has expired. Start again from Who to follow.", { status: 400 });
  const provider = getConnectorOAuthProvider(X_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(X_PROVIDER);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) {
    return new Response("Connecting X is not set up on this deployment yet.", { status: 400 });
  }
  const verifier = randomHex(48);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  await ctx.runMutation(internal.xConnect.keepVerifier, { state, verifierCiphertext: await encryptConnectorToken(verifier) });
  const x = new URL(provider.authorizationEndpoint);
  x.search = new URLSearchParams({
    response_type: "code",
    client_id: credentials.clientId,
    redirect_uri: `${url.origin}/api/x/oauth/callback`,
    scope: X_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return redirectTo(x.toString());
});

// ── Coming back ────────────────────────────────────────────────────────────

/**
 * GET /api/x/oauth/callback?code=…&state=… — the state is single-use, the
 * code exchanged here and nowhere else. A sign-in that cannot read bookmarks
 * keeps nothing of X's; one that was working before keeps working. Back to
 * Who to follow, saying how it went.
 */
export const handleXCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const refusal = url.searchParams.get("error")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });
  const pending = await ctx.runQuery(internal.xConnect.pendingByState, { state });
  if (!pending) return new Response("This sign-in has expired. Start again from Who to follow.", { status: 400 });
  const provider = getConnectorOAuthProvider(X_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(X_PROVIDER);

  const fail = async (outcome: "declined" | "failed" | "missing-scope", problem: string, grant?: string) => {
    await ctx.runMutation(internal.xConnect.endSignIn, { state, problem });
    if (provider && credentials && grant) await revokeOAuthToken(provider, grant, credentials);
    return redirectTo(whoToFollowScreen(outcome));
  };

  if (refusal) return await fail(refusal === "access_denied" ? "declined" : "failed", refusal === "access_denied" ? "The X sign-in was declined." : "X did not finish the sign-in.");
  if (!code || !provider || !credentials || !pending.verifierCiphertext) return await fail("failed", "X did not finish the sign-in.");

  const exchanged = await exchangeAuthorizationCode({
    provider,
    credentials,
    code,
    redirectUri: `${url.origin}/api/x/oauth/callback`,
    codeVerifier: await decryptConnectorToken(pending.verifierCiphertext),
  });
  if (!exchanged.ok || !exchanged.tokens.access_token) return await fail("failed", "X would not hand over access for this sign-in.");
  const tokens = exchanged.tokens;
  const accessToken = exchanged.tokens.access_token;
  const granted = tokens.scope ? tokens.scope.split(" ").filter(Boolean) : [];
  if (!granted.includes("bookmark.read") || !tokens.refresh_token) {
    return await fail("missing-scope", "Reading bookmarks was not allowed in the X sign-in, so nothing was connected.", tokens.refresh_token ?? accessToken);
  }
  const me = await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${accessToken}` } })
    .then(async (response) => (response.ok ? ((await response.json()) as { data?: { id?: string; username?: string } }).data ?? null : null))
    .catch(() => null);
  if (!me?.id) return await fail("failed", "X did not say which account signed in.", tokens.refresh_token);

  await ctx.runMutation(internal.xConnect.completeXConnect, {
    state,
    account: me.username ? `@${me.username}` : me.id,
    xUserId: me.id,
    accessTokenCiphertext: await encryptConnectorToken(accessToken),
    refreshTokenCiphertext: await encryptConnectorToken(tokens.refresh_token),
    ...(tokens.expires_in ? { expiresAt: Date.now() + tokens.expires_in * 1000 } : {}),
  });
  return redirectTo(whoToFollowScreen("connected"));
});

/** A sign-in that ended without connecting: over, saying why; a working connection is left as it was. */
export const endSignIn = internalMutation({
  args: { state: v.string(), problem: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("xConnections").withIndex("by_pending_state", (q) => q.eq("pendingState", args.state)).first();
    if (!connection) return null;
    await ctx.db.patch(connection._id, {
      pendingState: undefined, pendingAt: undefined, pendingBy: undefined, verifierCiphertext: undefined,
      problem: args.problem, updatedAt: Date.now(),
    });
    return null;
  },
});

export const completeXConnect = internalMutation({
  args: {
    state: v.string(),
    account: v.string(),
    xUserId: v.string(),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("xConnections").withIndex("by_pending_state", (q) => q.eq("pendingState", args.state)).first();
    if (!connection) return null;
    // Another account starts over; the same account keeps its place in the bookmarks.
    const sameAccount = connection.xUserId === args.xUserId;
    await ctx.db.patch(connection._id, {
      status: "CONNECTED",
      pendingState: undefined, pendingAt: undefined, pendingBy: undefined, verifierCiphertext: undefined,
      account: args.account,
      xUserId: args.xUserId,
      accessTokenCiphertext: args.accessTokenCiphertext,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      expiresAt: args.expiresAt,
      ...(sameAccount ? {} : { lastBookmarkId: undefined, lastReadAt: undefined }),
      problem: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// ── The screen ─────────────────────────────────────────────────────────────

/** What Who to follow says about X: whether it can be set up, and the connected account — never its access. */
export const getXForAdmin = superAdminQuery({
  args: {},
  returns: v.object({
    signInConfigured: v.boolean(),
    appTokenConfigured: v.boolean(),
    status: v.union(v.literal("NONE"), v.literal("CONNECTING"), v.literal("CONNECTED"), v.literal("BROKEN")),
    account: v.union(v.string(), v.null()),
    lastReadAt: v.union(v.number(), v.null()),
    problem: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const connection = await theConnection(ctx);
    const status: Doc<"xConnections">["status"] | "NONE" = connection?.status ?? "NONE";
    return {
      signInConfigured: isXSignInConfigured(),
      appTokenConfigured: isXAppTokenConfigured(),
      status,
      account: connection?.account ?? null,
      lastReadAt: connection?.lastReadAt ?? null,
      problem: connection?.problem ?? null,
    };
  },
});

/** Forget the X account: its access gone from here at once, and handed back to X. */
export const disconnectX = superAdminMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const connection = await theConnection(ctx);
    if (!connection) return null;
    if (connection.refreshTokenCiphertext) {
      await ctx.scheduler.runAfter(0, internal.xRead.revokeXGrant, { refreshTokenCiphertext: connection.refreshTokenCiphertext });
    }
    await ctx.db.delete(connection._id);
    return null;
  },
});

// ── For the News Collector ─────────────────────────────────────────────────

/** The connection's access, encrypted, for a run to read bookmarks with. */
export const connectionForRun = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({
    xUserId: v.string(),
    account: v.string(),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    expiresAt: v.union(v.number(), v.null()),
    lastBookmarkId: v.union(v.string(), v.null()),
  })),
  handler: async (ctx) => {
    const connection = await theConnection(ctx);
    if (connection?.status !== "CONNECTED" || !connection.xUserId || !connection.accessTokenCiphertext || !connection.refreshTokenCiphertext) return null;
    return {
      xUserId: connection.xUserId,
      account: connection.account ?? connection.xUserId,
      accessTokenCiphertext: connection.accessTokenCiphertext,
      refreshTokenCiphertext: connection.refreshTokenCiphertext,
      expiresAt: connection.expiresAt ?? null,
      lastBookmarkId: connection.lastBookmarkId ?? null,
    };
  },
});

/** Renewed access, or the reason it can no longer be renewed. */
export const keepRenewedAccess = internalMutation({
  args: {
    accessTokenCiphertext: v.optional(v.string()),
    refreshTokenCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    broken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await theConnection(ctx);
    if (!connection) return null;
    if (args.broken) {
      await ctx.db.patch(connection._id, { status: "BROKEN", problem: args.broken, updatedAt: Date.now() });
      return null;
    }
    await ctx.db.patch(connection._id, {
      ...(args.accessTokenCiphertext ? { accessTokenCiphertext: args.accessTokenCiphertext } : {}),
      ...(args.refreshTokenCiphertext ? { refreshTokenCiphertext: args.refreshTokenCiphertext } : {}),
      ...(args.expiresAt ? { expiresAt: args.expiresAt } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Where the bookmarks were read to, after a run. */
export const markBookmarksRead = internalMutation({
  args: { lastBookmarkId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await theConnection(ctx);
    if (!connection) return null;
    await ctx.db.patch(connection._id, {
      ...(args.lastBookmarkId ? { lastBookmarkId: args.lastBookmarkId } : {}),
      lastReadAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** An X account's id and the newest post already read, kept on its channel. */
export const keepXAccountPlace = internalMutation({
  args: { channelId: v.id("followChannels"), externalId: v.optional(v.string()), sinceId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!channel) return null;
    await ctx.db.patch(args.channelId, {
      ...(args.externalId ? { externalId: args.externalId } : {}),
      ...(args.sinceId ? { sinceId: args.sinceId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

