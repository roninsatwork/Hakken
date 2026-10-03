import { v, type Infer } from "convex/values";
import { httpAction, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, tenantQuery } from "./tenantFunctions";
import { ADMIN_WRITE_ROLES } from "./authz";
import { companyHolds, findMySite, requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";
import {
  SEARCH_CONSOLE_PROVIDER,
  getConnectorOAuthClientCredentials,
  getConnectorOAuthProvider,
} from "./connectorOAuthProviders";
import {
  decryptConnectorToken,
  encryptConnectorToken,
  isConnectorTokenEncryptionConfigured,
} from "./connectorTokenCrypto";
import { exchangeAuthorizationCode, refreshAccessToken, revokeOAuthToken } from "./oauthTokenCalls";
import { SEARCH_CONSOLE_READ_SCOPE, SEARCH_CONSOLE_SCOPES, listProperties, propertiesForHost } from "./searchConsoleApi";
import {
  attemptOutcomeValidator,
  connectionProblemValidator,
  connectionStatusValidator,
} from "./searchConsoleSchema";
import { historyLimitDay } from "./searchConsoleDays";

/**
 * Connecting an owned website to its Google Search Console
 * (docs/plans/active/search-console-plan.md §3).
 *
 * A company admin opens the website in the Search Console section and connects
 * (`beginSearchConsoleConnect` stores a single-use random state on the site's
 * connection), is sent through `/api/search-console/oauth/authorize` to
 * Google's own sign-in and consent, and comes back to
 * `/api/search-console/oauth/callback`, where the code is exchanged
 * server-side, the account's properties that are this website are found, and
 * the tokens are written as ciphertext (`connectorTokenCrypto`) into
 * `searchConsoleTokens`, which only internal functions read. One property that
 * is the whole site is chosen at once; several wait on the site's page for the
 * admin to choose.
 *
 * The exchange, renewal and revocation are the Gmail connector's own calls
 * (`oauthTokenCalls.ts`); what differs is whose the connection is — an owned
 * website's, never an admin tool's — and where it starts and finishes: the
 * site's own screens.
 *
 * **One Google grant, many connections.** Google keeps one grant per account
 * for an app, and revoking any token of it revokes all of it. The same account
 * may well serve several websites, and several companies (an agency's account
 * reading its clients' sites), so a grant is revoked only when no other
 * connection still holds a token for that account.
 */

export type ConnectionProblem = Infer<typeof connectionProblemValidator>;
type AttemptOutcome = Infer<typeof attemptOutcomeValidator>;

/** A sign-in older than this cannot be finished: connect again. */
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

/** Renew when the access token has less life left than this. */
const REFRESH_MARGIN_MS = 60 * 1000;

/** Connections checked for sharing one Google account, before its grant is revoked. */
const MAX_SHARING = 200;

const propertyValidator = v.object({ property: v.string(), permission: v.string() });

/** Whether this deployment has the Search Console Google app and the key tokens are kept under. */
export function isSearchConsoleConfigured(): boolean {
  return getConnectorOAuthClientCredentials(SEARCH_CONSOLE_PROVIDER) !== null && isConnectorTokenEncryptionConfigured();
}

/**
 * The site's connection screen in the Search Console section, where every
 * sign-in finishes, whatever happened.
 */
function connectScreenUrl(siteId: Id<"companyWebsites">) {
  const base = (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/app/search-console/${siteId}/connection`;
}

function redirectTo(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function newState(siteId: Id<"companyWebsites">, now: number) {
  const random = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `search-console:${siteId}:${now}:${hex}`;
}

async function connectionOfHold(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

/**
 * Start connecting a site: its admins and super admins only (SC4), its own
 * websites only (SC8). Hands back the one link the browser follows; the state
 * it carries is the only thing that leaves the server.
 */
export const beginSearchConsoleConnect = adminMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({ authorizeUrl: v.string() }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) {
      throw appError("INVALID_INPUT", "Search Console is only for your company's own websites.");
    }
    if (!isSearchConsoleConfigured()) {
      throw appError("NOT_CONFIGURED", "Search Console is not set up on this deployment yet.");
    }
    const now = Date.now();
    const state = newState(args.siteId, now);
    const existing = await connectionOfHold(ctx, args.siteId);
    // A connection that works keeps working until a new sign-in finishes.
    const pending = { pendingState: state, pendingAt: now, pendingBy: ctx.userId, updatedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, pending);
    } else {
      await ctx.db.insert("searchConsoleConnections", {
        companyId: site.hold.companyId,
        companyWebsiteId: args.siteId,
        websiteId: site.website._id,
        status: "CONNECTING",
        ...pending,
        createdAt: now,
      });
    }
    const siteUrl = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
    return { authorizeUrl: `${siteUrl}/api/search-console/oauth/authorize?${new URLSearchParams({ state })}` };
  },
});

/** A sign-in under way, when its state is one this deployment minted in the last fifteen minutes. */
export const pendingByState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    if (!args.state) return null;
    const connection = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_pending_state", (q) => q.eq("pendingState", args.state))
      .first();
    if (!connection?.pendingAt || Date.now() - connection.pendingAt > STATE_MAX_AGE_MS) return null;
    const website = await ctx.db.get(connection.websiteId);
    if (!website) return null;
    return { connectionId: connection._id, companyWebsiteId: connection.companyWebsiteId, host: website.host };
  },
});

/** GET /api/search-console/oauth/authorize?state=… — on to Google's own sign-in. */
export const handleSearchConsoleAuthorize = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });
  const pending = await ctx.runQuery(internal.searchConsoleConnect.pendingByState, { state });
  if (!pending) return new Response("This sign-in has expired. Start again from the site's Search Console page.", { status: 400 });

  const provider = getConnectorOAuthProvider(SEARCH_CONSOLE_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(SEARCH_CONSOLE_PROVIDER);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) {
    return new Response("Search Console is not set up on this deployment yet.", { status: 400 });
  }
  const google = new URL(provider.authorizationEndpoint);
  google.search = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: `${url.origin}/api/search-console/oauth/callback`,
    response_type: "code",
    scope: SEARCH_CONSOLE_SCOPES.join(" "),
    state,
    ...provider.extraAuthorizationParams,
  }).toString();
  return redirectTo(google.toString());
});

// ---------------------------------------------------------------------------
// Coming back
// ---------------------------------------------------------------------------

/**
 * GET /api/search-console/oauth/callback?code=…&state=…
 *
 * The state is single-use: whatever happens, the sign-in it names is over.
 * The code is exchanged here and nowhere else. A sign-in that cannot connect
 * — declined, Search Console left unticked, no property for this site in the
 * account — keeps nothing of Google's and says why on the site's page; a
 * connection that was working before it keeps working.
 */
export const handleSearchConsoleCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const refusal = url.searchParams.get("error")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });
  const pending = await ctx.runQuery(internal.searchConsoleConnect.pendingByState, { state });
  if (!pending) return new Response("This sign-in has expired. Start again from the site's Search Console page.", { status: 400 });

  const back = redirectTo(connectScreenUrl(pending.companyWebsiteId));
  const provider = getConnectorOAuthProvider(SEARCH_CONSOLE_PROVIDER);
  const fail = async (outcome: AttemptOutcome, account?: string, grant?: string) => {
    await ctx.runMutation(internal.searchConsoleConnect.recordAttempt, {
      connectionId: pending.connectionId,
      state,
      outcome,
      account,
    });
    // A grant nobody holds is handed back, unless another connection holds the account's.
    if (provider && grant && account && !(await ctx.runQuery(internal.searchConsoleConnect.accountInUse, { account }))) {
      await revokeOAuthToken(provider, grant);
    }
    return back;
  };

  if (refusal) return await fail(refusal === "access_denied" ? "DECLINED" : "FAILED");
  const credentials = getConnectorOAuthClientCredentials(SEARCH_CONSOLE_PROVIDER);
  if (!code || !provider || !credentials || !isConnectorTokenEncryptionConfigured()) return await fail("FAILED");

  const exchanged = await exchangeAuthorizationCode({
    provider,
    credentials,
    code,
    redirectUri: `${url.origin}/api/search-console/oauth/callback`,
  });
  if (!exchanged.ok || !exchanged.tokens.access_token) return await fail("FAILED");
  const tokens = exchanged.tokens;
  const accessToken = exchanged.tokens.access_token;
  const grant = tokens.refresh_token ?? accessToken;
  const account = (await provider.resolveAccountEmail(accessToken).catch(() => null)) ?? undefined;

  const granted = tokens.scope ? tokens.scope.split(" ").filter(Boolean) : SEARCH_CONSOLE_SCOPES;
  if (!granted.includes(SEARCH_CONSOLE_READ_SCOPE)) return await fail("MISSING_SCOPE", account, grant);
  // Without a refresh token the connection would die within the hour.
  if (!tokens.refresh_token) return await fail("FAILED", account, grant);

  const listed = await listProperties(accessToken);
  if (!listed.ok) return await fail("FAILED", account, grant);
  const fit = propertiesForHost(listed.properties, pending.host);
  if (fit.readable.length === 0) return await fail(fit.unverified.length > 0 ? "UNVERIFIED" : "NO_PROPERTY", account, grant);

  await ctx.runMutation(internal.searchConsoleConnect.completeSignIn, {
    connectionId: pending.connectionId,
    state,
    account,
    choices: fit.readable,
    only: fit.only,
    accessTokenCiphertext: await encryptConnectorToken(accessToken),
    refreshTokenCiphertext: await encryptConnectorToken(tokens.refresh_token),
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
    scopes: granted,
  });
  return back;
});

/** A sign-in that did not connect: over, and why, for the site's page. */
export const recordAttempt = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    state: v.string(),
    outcome: attemptOutcomeValidator,
    account: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.pendingState !== args.state) return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      pendingState: undefined,
      pendingAt: undefined,
      pendingBy: undefined,
      attempt: { outcome: args.outcome, account: args.account, at: now },
      updatedAt: now,
    });
    return null;
  },
});

/**
 * A sign-in that found the site: the tokens kept, and the property chosen —
 * the one the connection had before when it is still there, or the only one
 * that is the whole site — or left for the admin to choose from the rest.
 */
export const completeSignIn = internalMutation({
  args: {
    connectionId: v.id("searchConsoleConnections"),
    state: v.string(),
    account: v.optional(v.string()),
    choices: v.array(propertyValidator),
    only: v.union(propertyValidator, v.null()),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    expiresAt: v.optional(v.number()),
    scopes: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.pendingState !== args.state) {
      throw appError("CONFLICT", "This sign-in has already been used.");
    }
    const now = Date.now();
    // One token row per connection: a new sign-in replaces what it finds.
    for (const row of await ctx.db
      .query("searchConsoleTokens")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .take(10)) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("searchConsoleTokens", {
      connectionId: connection._id,
      accessTokenCiphertext: args.accessTokenCiphertext,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      expiresAt: args.expiresAt,
      scopes: args.scopes,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(connection._id, {
      pendingState: undefined,
      pendingAt: undefined,
      googleAccount: args.account,
      attempt: undefined,
      updatedAt: now,
    });

    // Signing in again to mend a connection keeps its property; after a disconnect, the admin chooses again.
    const kept = connection.status !== "DISCONNECTED" && connection.property
      ? args.choices.find((choice) => choice.property === connection.property)
      : undefined;
    const pick = kept ?? args.only;
    if (pick) {
      await connectTo(ctx, connection._id, pick, connection.pendingBy);
    } else {
      await ctx.db.patch(connection._id, { status: "CHOOSING", choices: args.choices, pendingBy: undefined });
    }
    return null;
  },
});

/**
 * Connected to a property. Collecting does not start here: it waits for the
 * Search Console agent and its schedule (search-console-plan.md §12). Another
 * property than the one the figures held came from clears them — two
 * properties' figures are never mixed.
 */
async function connectTo(
  ctx: MutationCtx,
  connectionId: Id<"searchConsoleConnections">,
  choice: { property: string; permission: string },
  actorId: Id<"users"> | undefined,
) {
  const connection = (await ctx.db.get(connectionId))!;
  const now = Date.now();
  const another = connection.dataProperty !== undefined && connection.dataProperty !== choice.property;
  await ctx.db.patch(connection._id, {
    status: "CONNECTED",
    property: choice.property,
    permission: choice.permission,
    dataProperty: choice.property,
    choices: undefined,
    pendingBy: undefined,
    connectedBy: actorId,
    connectedAt: now,
    disconnectedAt: undefined,
    problem: undefined,
    problemAt: undefined,
    ...(another
      ? { clearing: true, newestDay: undefined, oldestDay: undefined, countriesHeld: undefined, backfilledAt: undefined, historyAt: undefined }
      : {}),
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actorId,
    actionType: "SEARCH_CONSOLE_CONNECTED",
    entityId: connection._id.toString(),
    entityType: "searchConsoleConnections",
    companyId: connection.companyId,
    timestamp: now,
    // The account and property, never a token.
    metadata: JSON.stringify({ account: connection.googleAccount, property: choice.property }),
  });
  if (another) {
    await ctx.scheduler.runAfter(0, internal.searchConsoleSync.clearFigures, {
      companyWebsiteId: connection.companyWebsiteId,
    });
  }
}

/** The admin's choice among the account's properties that are this website. */
export const chooseSearchConsoleProperty = adminMutation({
  args: { siteId: v.id("companyWebsites"), property: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, site.hold._id);
    if (!connection || connection.status !== "CHOOSING") {
      throw appError("CONFLICT", "There is no property to choose: connect again.");
    }
    const choice = connection.choices?.find((entry) => entry.property === args.property);
    if (!choice) throw appError("NOT_FOUND", "That property is not one this account can read for this website.");
    await connectTo(ctx, connection._id, choice, ctx.userId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Disconnecting
// ---------------------------------------------------------------------------

/**
 * Stop collecting and give Google's access back (SC7): what was collected
 * stays, marked with the day it was disconnected.
 */
export const disconnectSearchConsole = adminMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, site.hold._id);
    if (!connection || connection.status === "DISCONNECTED") return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      status: "DISCONNECTED",
      disconnectedAt: now,
      pendingState: undefined,
      pendingAt: undefined,
      pendingBy: undefined,
      choices: undefined,
      problem: undefined,
      problemAt: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SEARCH_CONSOLE_DISCONNECTED",
      entityId: connection._id.toString(),
      entityType: "searchConsoleConnections",
      companyId: connection.companyId,
      timestamp: now,
      metadata: JSON.stringify({ account: connection.googleAccount, property: connection.property }),
    });
    await ctx.scheduler.runAfter(0, internal.searchConsoleConnect.forgetTokens, { connectionId: connection._id });
    return null;
  },
});

/** Whether any connection holds a token for this Google account — other than one, when named. */
export const accountInUse = internalQuery({
  args: { account: v.string(), except: v.optional(v.id("searchConsoleConnections")) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const sharing = await ctx.db
      .query("searchConsoleConnections")
      .withIndex("by_google_account", (q) => q.eq("googleAccount", args.account))
      .take(MAX_SHARING);
    for (const connection of sharing) {
      if (connection._id === args.except) continue;
      const token = await ctx.db
        .query("searchConsoleTokens")
        .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
        .first();
      if (token) return true;
    }
    // More sharing than can be checked counts as shared: never revoke what may be in use.
    return sharing.length === MAX_SHARING;
  },
});

/** A connection's grant, as far as forgetting it needs. */
export const grantOf = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    const token = await ctx.db
      .query("searchConsoleTokens")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .first();
    return {
      status: connection?.status ?? null,
      account: connection?.googleAccount ?? null,
      ciphertext: token ? (token.refreshTokenCiphertext ?? token.accessTokenCiphertext) : null,
    };
  },
});

/**
 * Revoke a connection's grant at Google, unless another connection holds the
 * same account's, then forget its tokens. A grant Google cannot be reached to
 * revoke is still one Hakken no longer holds.
 */
async function giveBack(ctx: ActionCtx, connectionId: Id<"searchConsoleConnections">) {
  const grant = await ctx.runQuery(internal.searchConsoleConnect.grantOf, { connectionId });
  const provider = getConnectorOAuthProvider(SEARCH_CONSOLE_PROVIDER);
  if (!grant.ciphertext || !provider) return grant;
  const shared = grant.account
    ? await ctx.runQuery(internal.searchConsoleConnect.accountInUse, { account: grant.account, except: connectionId })
    : false;
  if (!shared) {
    try {
      await revokeOAuthToken(provider, await decryptConnectorToken(grant.ciphertext));
    } catch {
      // Unreadable: forgetting it below still runs.
    }
  }
  return grant;
}

/** After a disconnect. A connection connected again meanwhile keeps its new tokens. */
export const forgetTokens = internalAction({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = await ctx.runQuery(internal.searchConsoleConnect.grantOf, { connectionId: args.connectionId });
    if (grant.status !== "DISCONNECTED") return null;
    await giveBack(ctx, args.connectionId);
    await ctx.runMutation(internal.searchConsoleConnect.dropTokens, { connectionId: args.connectionId, onlyIfDisconnected: true });
    return null;
  },
});

/** A website the company no longer holds: its grant given back, then everything Search Console brought. */
export const forgetHold = internalAction({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connectionId = await ctx.runQuery(internal.searchConsoleConnect.connectionIdOfHold, {
      companyWebsiteId: args.companyWebsiteId,
    });
    if (connectionId) {
      await giveBack(ctx, connectionId);
      await ctx.runMutation(internal.searchConsoleConnect.dropTokens, { connectionId, onlyIfDisconnected: false });
    }
    await ctx.runMutation(internal.searchConsoleSync.purgeHold, { companyWebsiteId: args.companyWebsiteId });
    return null;
  },
});

export const connectionIdOfHold = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  handler: async (ctx, args) => (await connectionOfHold(ctx, args.companyWebsiteId))?._id ?? null,
});

export const dropTokens = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), onlyIfDisconnected: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (args.onlyIfDisconnected && connection?.status !== "DISCONNECTED") return null;
    for (const row of await ctx.db
      .query("searchConsoleTokens")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .take(10)) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// A usable access token
// ---------------------------------------------------------------------------

export const tokenRowOf = internalQuery({
  args: { connectionId: v.id("searchConsoleConnections") },
  handler: async (ctx, args): Promise<Doc<"searchConsoleTokens"> | null> =>
    await ctx.db
      .query("searchConsoleTokens")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .first(),
});

export const storeRenewedToken = internalMutation({
  args: {
    tokenRowId: v.id("searchConsoleTokens"),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenRowId);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      accessTokenCiphertext: args.accessTokenCiphertext,
      // Google re-issues the refresh token only on full consent; otherwise the old one stands.
      ...(args.refreshTokenCiphertext ? { refreshTokenCiphertext: args.refreshTokenCiphertext } : {}),
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Something stopped the connection or its collection. Google taking the
 * access back, the account losing the property, or keys that cannot be read
 * need the admin to connect again; the rest (Google busy, the deployment's
 * settings, a site no longer the company's own) leave the connection as it is
 * and say so until a collection goes right.
 */
export const noteProblem = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections"), problem: connectionProblemValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;
    const now = Date.now();
    const reconnect = args.problem === "REVOKED" || args.problem === "NO_ACCESS" || args.problem === "UNREADABLE";
    await ctx.db.patch(connection._id, {
      problem: args.problem,
      problemAt: now,
      ...(reconnect && connection.status === "CONNECTED" ? { status: "NEEDS_RECONNECT" as const } : {}),
      updatedAt: now,
    });
    // Keys Google has refused, or that cannot be read, are no use to keep.
    if (args.problem === "REVOKED" || args.problem === "UNREADABLE") {
      for (const row of await ctx.db
        .query("searchConsoleTokens")
        .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
        .take(10)) {
        await ctx.db.delete(row._id);
      }
    }
    return null;
  },
});

/**
 * The one door to a usable access token, for the collection. Renews it when
 * it is near its end, or when Google has just refused it (`renew`), and says
 * plainly when the connection cannot go on.
 */
export async function accessTokenFor(
  ctx: ActionCtx,
  connectionId: Id<"searchConsoleConnections">,
  renew = false,
): Promise<{ ok: true; accessToken: string } | { ok: false; problem: ConnectionProblem }> {
  const stop = async (problem: ConnectionProblem) => {
    await ctx.runMutation(internal.searchConsoleConnect.noteProblem, { connectionId, problem });
    return { ok: false as const, problem };
  };
  const provider = getConnectorOAuthProvider(SEARCH_CONSOLE_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(SEARCH_CONSOLE_PROVIDER);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) return await stop("NOT_CONFIGURED");
  const row = await ctx.runQuery(internal.searchConsoleConnect.tokenRowOf, { connectionId });
  if (!row) return await stop("REVOKED");

  const fresh = !renew && (row.expiresAt === undefined || row.expiresAt - Date.now() > REFRESH_MARGIN_MS);
  if (fresh) {
    try {
      return { ok: true, accessToken: await decryptConnectorToken(row.accessTokenCiphertext) };
    } catch {
      return await stop("UNREADABLE");
    }
  }
  if (!row.refreshTokenCiphertext) return await stop("REVOKED");
  let refreshToken: string;
  try {
    refreshToken = await decryptConnectorToken(row.refreshTokenCiphertext);
  } catch {
    return await stop("UNREADABLE");
  }
  const renewed = await refreshAccessToken({ provider, credentials, refreshToken });
  if (!renewed.ok) return await stop(renewed.refused ? "REVOKED" : "GOOGLE_BUSY");
  if (!renewed.tokens.access_token) return await stop("REVOKED");
  await ctx.runMutation(internal.searchConsoleConnect.storeRenewedToken, {
    tokenRowId: row._id,
    accessTokenCiphertext: await encryptConnectorToken(renewed.tokens.access_token),
    refreshTokenCiphertext: renewed.tokens.refresh_token
      ? await encryptConnectorToken(renewed.tokens.refresh_token)
      : undefined,
    expiresAt: renewed.tokens.expires_in ? Date.now() + renewed.tokens.expires_in * 1000 : undefined,
  });
  return { ok: true, accessToken: renewed.tokens.access_token };
}

// ---------------------------------------------------------------------------
// What the site's page reads
// ---------------------------------------------------------------------------

const orNull = <T extends ReturnType<typeof v.string>>(validator: T) => v.union(validator, v.null());

/**
 * The site's Search Console connection, as its page shows it: never a token,
 * never the sign-in's state. Anyone in the company sees it; `canManage` says
 * whether this reader may connect, choose and disconnect (SC4). Null for a
 * website that is not one of the caller's company's — the same answer as a
 * missing one, as the Sites header gives.
 */
export const searchConsoleStatus = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    configured: v.boolean(),
    owned: v.boolean(),
    canManage: v.boolean(),
    /** The website, as a person reads it, and the company's other own websites, for the switcher. */
    host: v.string(),
    ownSites: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string() })),
    /** The oldest day Google still keeps: how far back the history goes. */
    historyFrom: v.string(),
    connection: v.union(
      v.null(),
      v.object({
        status: connectionStatusValidator,
        signingIn: v.boolean(),
        googleAccount: orNull(v.string()),
        property: orNull(v.string()),
        permission: orNull(v.string()),
        choices: v.array(propertyValidator),
        connectedAt: v.union(v.number(), v.null()),
        disconnectedAt: v.union(v.number(), v.null()),
        newestDay: orNull(v.string()),
        oldestDay: orNull(v.string()),
        historyDone: v.boolean(),
        clearing: v.boolean(),
        lastCollectedAt: v.union(v.number(), v.null()),
        problem: v.union(connectionProblemValidator, v.null()),
        attempt: v.union(
          v.null(),
          v.object({ outcome: attemptOutcomeValidator, account: orNull(v.string()), at: v.number() }),
        ),
      }),
    ),
  })),
  handler: async (ctx, args) => {
    const site = await findMySite(ctx, args.siteId);
    if (!site) return null;
    const connection = await connectionOfHold(ctx, site.hold._id);
    const holds = await companyHolds(ctx, site.hold.companyId);
    const now = Date.now();
    return {
      configured: isSearchConsoleConfigured(),
      owned: !isTrackedHold(site.hold),
      canManage: (ADMIN_WRITE_ROLES as readonly string[]).includes(ctx.user.role ?? ""),
      host: site.website.displayHost,
      ownSites: holds
        .filter((entry) => entry.summary.relationship === "OWNED")
        .map((entry) => ({ siteId: entry.summary.siteId, host: entry.summary.host })),
      historyFrom: historyLimitDay(now),
      connection: connection
        ? {
          status: connection.status,
          signingIn: Boolean(connection.pendingAt && now - connection.pendingAt <= STATE_MAX_AGE_MS),
          googleAccount: connection.googleAccount ?? null,
          property: connection.property ?? null,
          permission: connection.permission ?? null,
          choices: connection.status === "CHOOSING" ? connection.choices ?? [] : [],
          connectedAt: connection.connectedAt ?? null,
          disconnectedAt: connection.disconnectedAt ?? null,
          newestDay: connection.newestDay ?? null,
          oldestDay: connection.oldestDay ?? null,
          historyDone: connection.backfilledAt !== undefined,
          clearing: connection.clearing === true,
          lastCollectedAt: connection.lastCollectedAt ?? null,
          problem: connection.problem ?? null,
          attempt: connection.attempt
            ? { outcome: connection.attempt.outcome, account: connection.attempt.account ?? null, at: connection.attempt.at }
            : null,
        }
        : null,
    };
  },
});
