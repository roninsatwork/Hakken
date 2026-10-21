import { v, type Infer } from "convex/values";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, tenantQuery } from "./tenantFunctions";
import { ADMIN_WRITE_ROLES } from "./authz";
import { companyHolds, findMySite, requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";
import { websiteIconUrl } from "./websiteIcons";
import {
  BING_WEBMASTER_PROVIDER,
  getConnectorOAuthClientCredentials,
  getConnectorOAuthProvider,
} from "./connectorOAuthProviders";
import { decryptConnectorToken, encryptConnectorToken, isConnectorTokenEncryptionConfigured } from "./connectorTokenCrypto";
import { exchangeAuthorizationCode, refreshAccessToken } from "./oauthTokenCalls";
import { BING_SCOPE, listUserSites, sitesForHost } from "./bingWebmasterApi";
import { unpackNumbers } from "./utils/searchConsolePacks";
import { OPENING_PERIOD } from "./utils/calendarPeriods";
import { bingAttemptValidator, bingProblemValidator, bingStatusValidator } from "./bingWebmasterSchema";

/**
 * Connecting an owned website to Bing Webmaster Tools
 * (docs/plans/active/bing-webmaster-plan.md §3), as Search Console connects
 * (`searchConsoleConnect.ts`), with Bing's own sign-in (§2.2).
 *
 * A company admin opens the website's Bing Webmaster page and connects
 * (`beginBingConnect` keeps a single-use state on the website's connection).
 * The browser goes through `/api/bing-webmaster/oauth/authorize` to Bing's
 * sign-in and comes back to `/api/bing-webmaster/oauth/callback`, where the
 * code is exchanged, the account's verified sites that are this website are
 * found, and the encrypted keys kept (`bingTokens`). One verified site that
 * is the whole website is chosen at once; several wait for the admin.
 *
 * Bing documents no way to give a grant back, so disconnecting forgets the
 * keys: a person takes the access back in Bing Webmaster Tools itself.
 */

export type BingProblem = Infer<typeof bingProblemValidator>;
type BingAttempt = Infer<typeof bingAttemptValidator>;

/** A sign-in older than this cannot be finished: connect again. */
export const STATE_MAX_AGE_MS = 15 * 60 * 1000;

/** Renew when the access token has less life left than this: Bing's last an hour. */
const REFRESH_MARGIN_MS = 60 * 1000;

const STATE_PREFIX = "bing-webmaster";
export const BING_AUTHORIZE_PATH = "/api/bing-webmaster/oauth/authorize";
export const BING_CALLBACK_PATH = "/api/bing-webmaster/oauth/callback";

/** Whether this deployment has the Bing app the sign-in goes through, and the key tokens are kept under. */
export function isBingConfigured(): boolean {
  return getConnectorOAuthClientCredentials(BING_WEBMASTER_PROVIDER) !== null && isConnectorTokenEncryptionConfigured();
}

function newSignInState(siteId: Id<"companyWebsites">, now: number) {
  const random = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${STATE_PREFIX}:${siteId}:${now}:${hex}`;
}

function authorizeLink(state: string) {
  const siteUrl = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
  return `${siteUrl}${BING_AUTHORIZE_PATH}?${new URLSearchParams({ state })}`;
}

/** The website's Connection page, where every sign-in finishes, whatever happened. */
function connectScreenUrl(siteId: Id<"companyWebsites">) {
  const base = (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/app/bing-webmaster/${siteId}/connection`;
}

async function connectionOfHold(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("bingConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

/** Start connecting a website: its admins and super admins, its own websites only (BW7). */
export const beginBingConnect = adminMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({ authorizeUrl: v.string() }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) throw appError("INVALID_INPUT", "Bing Webmaster is only for your company's own websites.");
    if (!isBingConfigured()) throw appError("NOT_CONFIGURED", "Bing Webmaster is not set up on this deployment yet.");
    const now = Date.now();
    const state = newSignInState(args.siteId, now);
    const existing = await connectionOfHold(ctx, args.siteId);
    // A connection that works keeps working until a new sign-in finishes.
    const pending = { pendingState: state, pendingAt: now, pendingBy: ctx.userId, updatedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, pending);
    } else {
      await ctx.db.insert("bingConnections", {
        companyId: site.hold.companyId,
        companyWebsiteId: args.siteId,
        websiteId: site.website._id,
        status: "CONNECTING",
        ...pending,
        createdAt: now,
      });
    }
    return { authorizeUrl: authorizeLink(state) };
  },
});

/** A sign-in under way, when its state is one this deployment minted in the last fifteen minutes. */
export const pendingByState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    if (!args.state) return null;
    const connection = await ctx.db
      .query("bingConnections")
      .withIndex("by_pending_state", (q) => q.eq("pendingState", args.state))
      .first();
    if (!connection?.pendingAt || Date.now() - connection.pendingAt > STATE_MAX_AGE_MS) return null;
    const website = await ctx.db.get(connection.websiteId);
    if (!website) return null;
    return { companyWebsiteId: connection.companyWebsiteId, host: website.host };
  },
});

const EXPIRED_SIGN_IN = "This sign-in has expired. Start again from the website's Connection page.";

function redirectTo(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

/** GET /api/bing-webmaster/oauth/authorize?state=… — on to Bing's own sign-in. */
export const handleBingAuthorize = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });
  const pending = await ctx.runQuery(internal.bingWebmasterConnect.pendingByState, { state });
  if (!pending) return new Response(EXPIRED_SIGN_IN, { status: 400 });
  const provider = getConnectorOAuthProvider(BING_WEBMASTER_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(BING_WEBMASTER_PROVIDER);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) {
    return new Response("Bing Webmaster is not set up on this deployment yet.", { status: 400 });
  }
  const bing = new URL(provider.authorizationEndpoint);
  bing.search = new URLSearchParams({
    response_type: "code",
    client_id: credentials.clientId,
    redirect_uri: `${url.origin}${BING_CALLBACK_PATH}`,
    scope: BING_SCOPE,
    state,
  }).toString();
  return redirectTo(bing.toString());
});

// ---------------------------------------------------------------------------
// Coming back
// ---------------------------------------------------------------------------

/**
 * GET /api/bing-webmaster/oauth/callback?code=…&state=…
 *
 * The state is single-use: whatever happens, the sign-in it names is over.
 * A sign-in that cannot connect — declined, no verified site of this website
 * in the account — keeps nothing and says why on the Connection page; a
 * connection that worked before keeps working.
 */
export const handleBingCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const refusal = url.searchParams.get("error")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });
  const pending = await ctx.runQuery(internal.bingWebmasterConnect.pendingByState, { state });
  if (!pending) return new Response(EXPIRED_SIGN_IN, { status: 400 });

  const back = redirectTo(connectScreenUrl(pending.companyWebsiteId));
  const fail = async (outcome: BingAttempt, detail?: string) => {
    // Why, in the deployment's logs: the screen says only what it means for the person.
    console.warn(`Bing sign-in did not connect: ${outcome}${detail ? ` — ${detail}` : ""}`);
    await ctx.runMutation(internal.bingWebmasterConnect.recordAttempt, { state, outcome });
    return back;
  };

  if (refusal) return await fail(refusal === "access_denied" ? "DECLINED" : "FAILED", `Bing answered "${refusal.slice(0, 80)}"`);
  const provider = getConnectorOAuthProvider(BING_WEBMASTER_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(BING_WEBMASTER_PROVIDER);
  if (!code || !provider || !credentials || !isConnectorTokenEncryptionConfigured()) return await fail("FAILED");

  const exchanged = await exchangeAuthorizationCode({ provider, credentials, code, redirectUri: `${url.origin}${BING_CALLBACK_PATH}` });
  if (!exchanged.ok || !exchanged.tokens.access_token) {
    return await fail("FAILED", exchanged.ok ? "no access token in Bing's answer" : exchanged.message.slice(0, 300));
  }
  const tokens = exchanged.tokens;
  // Without a refresh token the connection would die within the hour.
  if (!tokens.refresh_token) return await fail("FAILED", "Bing sent no refresh token");

  const listed = await listUserSites(tokens.access_token!);
  if (!listed.ok) return await fail("FAILED", `Bing's sites: ${listed.status} ${listed.detail}`.slice(0, 300));
  const fit = sitesForHost(listed.sites, pending.host);
  if (fit.readable.length === 0) return await fail(fit.unverified.length > 0 ? "UNVERIFIED" : "NO_SITE");

  await ctx.runMutation(internal.bingWebmasterConnect.completeSignIn, {
    state,
    choices: fit.readable.map((entry) => entry.site),
    only: fit.only?.site ?? null,
    accessTokenCiphertext: await encryptConnectorToken(tokens.access_token!),
    refreshTokenCiphertext: await encryptConnectorToken(tokens.refresh_token),
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  });
  return back;
});

/** A sign-in that did not connect: over, and why, for the Connection page. */
export const recordAttempt = internalMutation({
  args: { state: v.string(), outcome: bingAttemptValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("bingConnections")
      .withIndex("by_pending_state", (q) => q.eq("pendingState", args.state))
      .first();
    if (!connection) return null;
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      pendingState: undefined,
      pendingAt: undefined,
      pendingBy: undefined,
      attempt: { outcome: args.outcome, at: now },
      updatedAt: now,
    });
    return null;
  },
});

async function deleteTokens(ctx: MutationCtx, bingConnectionId: Id<"bingConnections">) {
  for (const row of await ctx.db.query("bingTokens").withIndex("by_connection", (q) => q.eq("bingConnectionId", bingConnectionId)).take(10)) {
    await ctx.db.delete(row._id);
  }
}

/**
 * A sign-in that found the website: its keys kept, replacing any before, and
 * its site chosen — the one it had when it is still there, or the only one
 * that is the whole website — or left for the admin to choose.
 */
export const completeSignIn = internalMutation({
  args: {
    state: v.string(),
    choices: v.array(v.string()),
    only: v.union(v.string(), v.null()),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("bingConnections")
      .withIndex("by_pending_state", (q) => q.eq("pendingState", args.state))
      .first();
    if (!connection) throw appError("CONFLICT", "This sign-in has already been used.");
    const now = Date.now();
    await deleteTokens(ctx, connection._id);
    await ctx.db.insert("bingTokens", {
      companyWebsiteId: connection.companyWebsiteId,
      bingConnectionId: connection._id,
      accessTokenCiphertext: args.accessTokenCiphertext,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    const startedBy = connection.pendingBy;
    await ctx.db.patch(connection._id, { pendingState: undefined, pendingAt: undefined, attempt: undefined, updatedAt: now });
    // Signing in again to mend a connection keeps its site; after a disconnect, the admin chooses again.
    const kept = connection.status !== "DISCONNECTED" && connection.site && args.choices.includes(connection.site) ? connection.site : null;
    const pick = kept ?? args.only;
    if (pick) {
      await connectTo(ctx, connection._id, pick, startedBy);
    } else {
      await ctx.db.patch(connection._id, { status: "CHOOSING", choices: args.choices, pendingBy: undefined });
    }
    return null;
  },
});

/**
 * Connected to a site, and collecting started at once (§4.1): a client never
 * meets an empty page for a night. Another site than the one the figures
 * held came from clears them first — two sites' figures are never mixed.
 */
async function connectTo(ctx: MutationCtx, connectionId: Id<"bingConnections">, site: string, actorId: Id<"users"> | undefined) {
  const connection = (await ctx.db.get(connectionId))!;
  const now = Date.now();
  const another = connection.dataSite !== undefined && connection.dataSite !== site;
  await ctx.db.patch(connection._id, {
    status: "CONNECTED",
    site,
    dataSite: site,
    choices: undefined,
    pendingBy: undefined,
    connectedBy: actorId,
    connectedAt: now,
    disconnectedAt: undefined,
    problem: undefined,
    problemAt: undefined,
    ...(another
      ? { clearing: true, newestDay: undefined, oldestDay: undefined, newestWeek: undefined, oldestWeek: undefined, periodsAt: undefined, pagesCheckedAt: undefined }
      : {}),
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actorId,
    actionType: "BING_WEBMASTER_CONNECTED",
    entityId: connection._id.toString(),
    entityType: "bingConnections",
    companyId: connection.companyId,
    timestamp: now,
    // The site, never a key.
    metadata: JSON.stringify({ site }),
  });
  if (another) {
    await ctx.scheduler.runAfter(0, internal.bingWebmasterCollect.clearFigures, { companyWebsiteId: connection.companyWebsiteId, thenCollect: true });
  } else {
    await ctx.scheduler.runAfter(0, internal.bingWebmasterAgentRun.startFirstCollection, { connectionId: connection._id });
  }
}

/** The admin's choice among the account's verified sites that are this website. */
export const chooseBingSite = adminMutation({
  args: { siteId: v.id("companyWebsites"), site: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owned = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, owned.hold._id);
    if (!connection || connection.status !== "CHOOSING") throw appError("CONFLICT", "There is no site to choose: connect again.");
    if (!connection.choices?.includes(args.site)) throw appError("NOT_FOUND", "That site is not one this account can read for this website.");
    await connectTo(ctx, connection._id, args.site, ctx.userId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Disconnecting
// ---------------------------------------------------------------------------

/** Stop collecting and forget the keys: what was collected stays, marked with the day it was disconnected. */
export const disconnectBing = adminMutation({
  args: { siteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owned = await requireMySite(ctx, args.siteId);
    const connection = await connectionOfHold(ctx, owned.hold._id);
    if (!connection || connection.status === "DISCONNECTED") return null;
    const now = Date.now();
    await deleteTokens(ctx, connection._id);
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
      actionType: "BING_WEBMASTER_DISCONNECTED",
      entityId: connection._id.toString(),
      entityType: "bingConnections",
      companyId: connection.companyId,
      timestamp: now,
      metadata: JSON.stringify({ site: connection.site }),
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// A usable access token
// ---------------------------------------------------------------------------

/**
 * Something stopped the connection or its collection. Bing taking the access
 * back, the account losing the site, or keys that cannot be read need the
 * admin to connect again; the rest leave the connection as it is and say so
 * until a collection goes right.
 */
export const noteProblem = internalMutation({
  args: { connectionId: v.id("bingConnections"), problem: bingProblemValidator },
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
    return null;
  },
});

export const tokenRowOf = internalQuery({
  args: { connectionId: v.id("bingConnections") },
  handler: async (ctx, args): Promise<Doc<"bingTokens"> | null> =>
    await ctx.db.query("bingTokens").withIndex("by_connection", (q) => q.eq("bingConnectionId", args.connectionId)).first(),
});

export const storeRenewedToken = internalMutation({
  args: { tokenRowId: v.id("bingTokens"), accessTokenCiphertext: v.string(), refreshTokenCiphertext: v.optional(v.string()), expiresAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenRowId);
    if (!row) return null;
    await ctx.db.patch(row._id, {
      accessTokenCiphertext: args.accessTokenCiphertext,
      ...(args.refreshTokenCiphertext ? { refreshTokenCiphertext: args.refreshTokenCiphertext } : {}),
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Keys Bing has refused, or that cannot be read, are no use to keep: the connection asks to reconnect. */
export const dropTokens = internalMutation({
  args: { connectionId: v.id("bingConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteTokens(ctx, args.connectionId);
    return null;
  },
});

/**
 * The one door to a usable access token, for the collection and the screens'
 * asks: renewed when near its end or just refused (`renew`). When the
 * connection cannot go on, it says so on the connection.
 */
export async function accessTokenFor(
  ctx: ActionCtx,
  connectionId: Id<"bingConnections">,
  renew = false,
): Promise<{ ok: true; accessToken: string } | { ok: false; problem: BingProblem }> {
  const token = await bingAccessToken(ctx, connectionId, renew);
  if (token.ok) return token;
  await ctx.runMutation(internal.bingWebmasterConnect.noteProblem, { connectionId, problem: token.problem });
  return token;
}

async function bingAccessToken(
  ctx: ActionCtx,
  connectionId: Id<"bingConnections">,
  renew: boolean,
): Promise<{ ok: true; accessToken: string } | { ok: false; problem: BingProblem }> {
  const provider = getConnectorOAuthProvider(BING_WEBMASTER_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(BING_WEBMASTER_PROVIDER);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) return { ok: false, problem: "NOT_CONFIGURED" };
  const row = await ctx.runQuery(internal.bingWebmasterConnect.tokenRowOf, { connectionId });
  if (!row) return { ok: false, problem: "REVOKED" };
  const stop = async (problem: "REVOKED" | "UNREADABLE") => {
    await ctx.runMutation(internal.bingWebmasterConnect.dropTokens, { connectionId });
    return { ok: false as const, problem };
  };
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
  if (!renewed.ok) return renewed.refused ? await stop("REVOKED") : { ok: false, problem: "BING_BUSY" };
  if (!renewed.tokens.access_token) return await stop("REVOKED");
  await ctx.runMutation(internal.bingWebmasterConnect.storeRenewedToken, {
    tokenRowId: row._id,
    accessTokenCiphertext: await encryptConnectorToken(renewed.tokens.access_token),
    refreshTokenCiphertext: renewed.tokens.refresh_token ? await encryptConnectorToken(renewed.tokens.refresh_token) : undefined,
    expiresAt: renewed.tokens.expires_in ? Date.now() + renewed.tokens.expires_in * 1000 : undefined,
  });
  return { ok: true, accessToken: renewed.tokens.access_token };
}

// ---------------------------------------------------------------------------
// What the website's pages read
// ---------------------------------------------------------------------------

/** The rows of a list's ready-made opening period (Last Month), newest build: null with none built. */
async function rowsHeld(ctx: { db: QueryCtx["db"] }, holdId: Id<"companyWebsites">, list: "query" | "page"): Promise<number | null> {
  const parts = await ctx.db
    .query("bingPeriods")
    .withIndex("by_hold_list_period_which_part", (q) => q.eq("companyWebsiteId", holdId).eq("list", list).eq("period", OPENING_PERIOD).eq("which", "NOW"))
    .take(200);
  if (parts.length === 0) return null;
  const newest = Math.max(...parts.map((part) => part.builtAt));
  return parts.filter((part) => part.builtAt === newest).reduce((sum, part) => sum + unpackNumbers(part.keys).length, 0);
}

const orNull = <T extends ReturnType<typeof v.string>>(validator: T) => v.union(validator, v.null());

/**
 * The website's Bing connection, as its pages show it: never a key, never the
 * sign-in's state. Anyone in the company sees it; `canManage` says whether
 * this reader may connect, choose and disconnect (BW7). Null for a website
 * that is not one of the caller's company's — the same answer as a missing one.
 */
export const bingStatus = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    configured: v.boolean(),
    owned: v.boolean(),
    canManage: v.boolean(),
    host: v.string(),
    iconUrl: v.union(v.string(), v.null()),
    ownSites: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string() })),
    /** How many keywords and pages Bing showed the website for in its last 90 days, beside the menu's items. */
    counts: v.object({ keywords: v.union(v.number(), v.null()), pages: v.union(v.number(), v.null()) }),
    connection: v.union(v.null(), v.object({
      status: bingStatusValidator,
      signingIn: v.boolean(),
      site: orNull(v.string()),
      choices: v.array(v.string()),
      connectedAt: v.union(v.number(), v.null()),
      disconnectedAt: v.union(v.number(), v.null()),
      newestDay: orNull(v.string()),
      oldestDay: orNull(v.string()),
      newestWeek: orNull(v.string()),
      oldestWeek: orNull(v.string()),
      clearing: v.boolean(),
      collecting: v.boolean(),
      lastCollectedAt: v.union(v.number(), v.null()),
      problem: v.union(bingProblemValidator, v.null()),
      attempt: v.union(v.null(), v.object({ outcome: bingAttemptValidator, at: v.number() })),
    })),
  })),
  handler: async (ctx, args) => {
    const site = await findMySite(ctx, args.siteId);
    if (!site) return null;
    const connection = await connectionOfHold(ctx, site.hold._id);
    const holds = await companyHolds(ctx, site.hold.companyId);
    const now = Date.now();
    return {
      configured: isBingConfigured(),
      owned: !isTrackedHold(site.hold),
      canManage: (ADMIN_WRITE_ROLES as readonly string[]).includes(ctx.user.role ?? ""),
      host: site.website.displayHost,
      iconUrl: await websiteIconUrl(ctx, site.website._id),
      ownSites: holds
        .filter((entry) => entry.summary.relationship === "OWNED")
        .map((entry) => ({ siteId: entry.summary.siteId, host: entry.summary.host })),
      counts: { keywords: await rowsHeld(ctx, site.hold._id, "query"), pages: await rowsHeld(ctx, site.hold._id, "page") },
      connection: connection
        ? {
          status: connection.status,
          signingIn: Boolean(connection.pendingAt && now - connection.pendingAt <= STATE_MAX_AGE_MS),
          site: connection.site ?? null,
          choices: connection.status === "CHOOSING" ? connection.choices ?? [] : [],
          connectedAt: connection.connectedAt ?? null,
          disconnectedAt: connection.disconnectedAt ?? null,
          newestDay: connection.newestDay ?? null,
          oldestDay: connection.oldestDay ?? null,
          newestWeek: connection.newestWeek ?? null,
          oldestWeek: connection.oldestWeek ?? null,
          clearing: connection.clearing === true,
          collecting: connection.collecting !== undefined,
          lastCollectedAt: connection.lastCollectedAt ?? null,
          problem: connection.problem ?? null,
          attempt: connection.attempt ?? null,
        }
        : null,
    };
  },
});
