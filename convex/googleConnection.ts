import { v } from "convex/values";
import { httpAction, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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
import { GOOGLE_ANALYTICS_READ_SCOPE, propertiesForSite, siteAddresses, type PropertyChoice } from "./googleAnalyticsApi";

/**
 * The one Google sign-in a company's own website connects with, shared by
 * Search Console and Google Analytics (docs/plans/active/google-analytics-plan.md
 * GA2, GA18, §3 and §4.6).
 *
 * A company admin starts it from either section's Connection page; the state
 * it carries names the section (`search-console:` or `google-analytics:`). The
 * browser goes through `/api/search-console/oauth/authorize` to Google's own
 * sign-in and comes back to `/api/search-console/oauth/callback` — the address
 * registered with Google for Search Console, kept so nothing changes in the
 * Google project (§7, step 3). The code is exchanged here, the account and the
 * encrypted tokens are kept once in `googleConnections` and `googleTokens`,
 * and each section then finds its own property:
 *
 * - **The section the sign-in started from** must find the website, or the
 *   sign-in fails on its page and keeps nothing.
 * - **The other section** takes the same sign-in when it is still waiting for
 *   one — never connected, choosing, or needing reconnecting — and Google gave
 *   it access: one sign-in, both ready (§10, Q3). A section that works keeps
 *   its own sign-in, so an agency's Search Console on one account and its
 *   client's Analytics on another both stand.
 *
 * Starting from Analytics asks Google for both sections' access at once
 * (§10, Q3); starting from Search Console asks for its own, and
 * `include_granted_scopes` keeps whatever the account granted before.
 *
 * **One Google grant, many connections.** Google keeps one grant per account
 * for an app, and revoking any token of it revokes all of it. The same account
 * may well serve several websites, and several companies, so a grant is
 * revoked only when no other connection still holds a token for that account.
 */

export type GoogleSection = "SEARCH_CONSOLE" | "GOOGLE_ANALYTICS";

/** Why a Google connection cannot give a usable token: the section notes it on its own connection. */
export type GoogleTokenProblem = "NOT_CONFIGURED" | "REVOKED" | "UNREADABLE" | "GOOGLE_BUSY";

/** A sign-in older than this cannot be finished: connect again. */
export const STATE_MAX_AGE_MS = 15 * 60 * 1000;

/** Renew when the access token has less life left than this. */
const REFRESH_MARGIN_MS = 60 * 1000;

/** Connections checked for sharing one Google account, before its grant is revoked. */
const MAX_SHARING = 200;

/** A website's Google connections, one per account: a handful at most. */
const MOST_PER_HOLD = 10;

const STATE_PREFIX: Record<GoogleSection, string> = {
  SEARCH_CONSOLE: "search-console",
  GOOGLE_ANALYTICS: "google-analytics",
};

/** What each section asks Google for. Analytics asks for Search Console's too: one sign-in, both ready (§10, Q3). */
const SCOPES_OF: Record<GoogleSection, readonly string[]> = {
  SEARCH_CONSOLE: SEARCH_CONSOLE_SCOPES,
  GOOGLE_ANALYTICS: [GOOGLE_ANALYTICS_READ_SCOPE, ...SEARCH_CONSOLE_SCOPES],
};

/** The access a section reads its figures with. */
export const READ_SCOPE_OF: Record<GoogleSection, string> = {
  SEARCH_CONSOLE: SEARCH_CONSOLE_READ_SCOPE,
  GOOGLE_ANALYTICS: GOOGLE_ANALYTICS_READ_SCOPE,
};

/** Whether this deployment has the Google app and the key tokens are kept under: Search Console's app, shared (§7, step 3). */
export function isGoogleConfigured(): boolean {
  return getConnectorOAuthClientCredentials(SEARCH_CONSOLE_PROVIDER) !== null && isConnectorTokenEncryptionConfigured();
}

/** A sign-in's single-use state, naming the section it started from. */
export function newSignInState(section: GoogleSection, siteId: Id<"companyWebsites">, now: number) {
  const random = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${STATE_PREFIX[section]}:${siteId}:${now}:${hex}`;
}

function sectionOfState(state: string): GoogleSection | null {
  if (state.startsWith(`${STATE_PREFIX.SEARCH_CONSOLE}:`)) return "SEARCH_CONSOLE";
  if (state.startsWith(`${STATE_PREFIX.GOOGLE_ANALYTICS}:`)) return "GOOGLE_ANALYTICS";
  return null;
}

/** The link the browser follows to Google, from the section's Connection page. */
export function authorizeLink(state: string) {
  const siteUrl = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
  return `${siteUrl}/api/search-console/oauth/authorize?${new URLSearchParams({ state })}`;
}

/** The section's Connection page, where every sign-in finishes, whatever happened. */
function connectScreenUrl(section: GoogleSection, siteId: Id<"companyWebsites">) {
  const base = (process.env.SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/app/${section === "SEARCH_CONSOLE" ? "search-console" : "analytics"}/${siteId}/connection`;
}

function redirectTo(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

type Pending = {
  section: GoogleSection;
  companyWebsiteId: Id<"companyWebsites">;
  host: string;
};

async function pendingOf(ctx: ActionCtx, state: string): Promise<Pending | null> {
  const section = sectionOfState(state);
  if (section === "SEARCH_CONSOLE") {
    const pending = await ctx.runQuery(internal.searchConsoleConnect.pendingByState, { state });
    return pending ? { section, companyWebsiteId: pending.companyWebsiteId, host: pending.host } : null;
  }
  if (section === "GOOGLE_ANALYTICS") {
    const pending = await ctx.runQuery(internal.googleAnalyticsConnect.pendingByState, { state });
    return pending ? { section, companyWebsiteId: pending.companyWebsiteId, host: pending.host } : null;
  }
  return null;
}

const EXPIRED_SIGN_IN = "This sign-in has expired. Start again from the website's Connection page.";

/** GET /api/search-console/oauth/authorize?state=… — on to Google's own sign-in. */
export const handleGoogleAuthorize = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });
  const pending = await pendingOf(ctx, state);
  if (!pending) return new Response(EXPIRED_SIGN_IN, { status: 400 });

  const provider = getConnectorOAuthProvider(SEARCH_CONSOLE_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(SEARCH_CONSOLE_PROVIDER);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) {
    return new Response("Google is not set up on this deployment yet.", { status: 400 });
  }
  const google = new URL(provider.authorizationEndpoint);
  google.search = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: `${url.origin}/api/search-console/oauth/callback`,
    response_type: "code",
    scope: SCOPES_OF[pending.section].join(" "),
    state,
    // Keep what the account granted before: adding Analytics never takes Search Console away.
    include_granted_scopes: "true",
    ...provider.extraAuthorizationParams,
  }).toString();
  return redirectTo(google.toString());
});

// ---------------------------------------------------------------------------
// Coming back
// ---------------------------------------------------------------------------

type ConsoleFound = { section: "SEARCH_CONSOLE"; choices: { property: string; permission: string }[]; only: { property: string; permission: string } | null };
type AnalyticsFound = { section: "GOOGLE_ANALYTICS"; choices: (PropertyChoice & { addresses?: string[]; others?: string[] })[] };
type Found =
  | { ok: true; found: ConsoleFound | AnalyticsFound }
  | { ok: false; outcome: "NO_PROPERTY" | "UNVERIFIED" | "FAILED" };

/** Properties whose addresses are read on the way back, to say on the choice which addresses Hakken reads (§3, step 4). */
const ADDRESSES_READ_FOR = 3;

/** What a section finds of the website in the account just signed in. */
async function findFor(section: GoogleSection, accessToken: string, host: string): Promise<Found> {
  if (section === "SEARCH_CONSOLE") {
    const listed = await listProperties(accessToken);
    if (!listed.ok) return { ok: false, outcome: "FAILED" };
    const fit = propertiesForHost(listed.properties, host);
    if (fit.readable.length === 0) return { ok: false, outcome: fit.unverified.length > 0 ? "UNVERIFIED" : "NO_PROPERTY" };
    return { ok: true, found: { section, choices: fit.readable, only: fit.only } };
  }
  const listed = await propertiesForSite(accessToken, host);
  if (!listed.ok) return { ok: false, outcome: "FAILED" };
  if (listed.choices.length === 0) return { ok: false, outcome: "NO_PROPERTY" };
  const choices: AnalyticsFound["choices"] = listed.choices;
  for (const choice of choices.filter((entry) => entry.stream !== null).slice(0, ADDRESSES_READ_FOR)) {
    const read = await siteAddresses(accessToken, choice.property, host, "today");
    if (read.ok) Object.assign(choice, { addresses: read.found.addresses, others: read.found.others });
  }
  return { ok: true, found: { section, choices } };
}

/**
 * GET /api/search-console/oauth/callback?code=…&state=…
 *
 * The state is single-use: whatever happens, the sign-in it names is over.
 * The code is exchanged here and nowhere else. A sign-in that cannot connect
 * — declined, the section's access left unticked, no property for this site
 * in the account — keeps nothing of Google's and says why on the section's
 * page; a connection that was working before it keeps working.
 */
export const handleGoogleCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const refusal = url.searchParams.get("error")?.trim() ?? "";
  if (!state) return new Response("Missing state.", { status: 400 });
  const pending = await pendingOf(ctx, state);
  if (!pending) return new Response(EXPIRED_SIGN_IN, { status: 400 });

  const section = pending.section;
  const back = redirectTo(connectScreenUrl(section, pending.companyWebsiteId));
  const provider = getConnectorOAuthProvider(SEARCH_CONSOLE_PROVIDER);
  const fail = async (outcome: "DECLINED" | "MISSING_SCOPE" | "NO_PROPERTY" | "UNVERIFIED" | "FAILED", account?: string, grant?: string) => {
    if (section === "SEARCH_CONSOLE") {
      await ctx.runMutation(internal.searchConsoleConnect.recordAttempt, { state, outcome, account });
    } else {
      // Analytics has no unverified properties: a property it cannot read is not listed at all.
      await ctx.runMutation(internal.googleAnalyticsConnect.recordAttempt, { state, outcome: outcome === "UNVERIFIED" ? "NO_PROPERTY" : outcome, account });
    }
    // A grant nobody holds is handed back, unless another connection holds the account's.
    if (provider && grant && account && !(await ctx.runQuery(internal.googleConnection.accountInUse, { account }))) {
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
  const accessToken = tokens.access_token!;
  const grant = tokens.refresh_token ?? accessToken;
  const account = (await provider.resolveAccountEmail(accessToken).catch(() => null)) ?? undefined;

  const granted = tokens.scope ? tokens.scope.split(" ").filter(Boolean) : [...SCOPES_OF[section]];
  if (!granted.includes(READ_SCOPE_OF[section])) return await fail("MISSING_SCOPE", account, grant);
  // Without a refresh token the connection would die within the hour.
  if (!tokens.refresh_token) return await fail("FAILED", account, grant);

  const found = await findFor(section, accessToken, pending.host);
  if (!found.ok) return await fail(found.outcome, account, grant);

  const googleConnectionId = await ctx.runMutation(internal.googleConnection.keepGrant, {
    companyWebsiteId: pending.companyWebsiteId,
    account,
    scopes: granted,
    accessTokenCiphertext: await encryptConnectorToken(accessToken),
    refreshTokenCiphertext: await encryptConnectorToken(tokens.refresh_token),
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  });
  await complete(ctx, found.found, { state, googleConnectionId, account, companyWebsiteId: pending.companyWebsiteId });

  // The other section, when it is waiting for a sign-in and Google gave it access (§10, Q3).
  const other: GoogleSection = section === "SEARCH_CONSOLE" ? "GOOGLE_ANALYTICS" : "SEARCH_CONSOLE";
  if (granted.includes(READ_SCOPE_OF[other])
    && await ctx.runQuery(internal.googleConnection.waitingForSignIn, { companyWebsiteId: pending.companyWebsiteId, section: other })) {
    const alsoFound = await findFor(other, accessToken, pending.host);
    if (alsoFound.ok) {
      await complete(ctx, alsoFound.found, { googleConnectionId, account, companyWebsiteId: pending.companyWebsiteId });
    }
  }
  // An account no section reads with any more, after a sign-in with another, is given back.
  await ctx.scheduler.runAfter(0, internal.googleConnection.releaseUnused, { companyWebsiteId: pending.companyWebsiteId });
  return back;
});

/** Hand what a section found to the section: by the sign-in's state when it started there, or taken up when it was waiting. */
async function complete(
  ctx: ActionCtx,
  found: ConsoleFound | AnalyticsFound,
  args: { state?: string; googleConnectionId: Id<"googleConnections">; account?: string; companyWebsiteId: Id<"companyWebsites"> },
) {
  if (found.section === "SEARCH_CONSOLE") {
    await ctx.runMutation(internal.searchConsoleConnect.completeSignIn, {
      state: args.state,
      companyWebsiteId: args.companyWebsiteId,
      googleConnectionId: args.googleConnectionId,
      choices: found.choices,
      only: found.only,
    });
    return;
  }
  await ctx.runMutation(internal.googleAnalyticsConnect.completeSignIn, {
    state: args.state,
    companyWebsiteId: args.companyWebsiteId,
    googleConnectionId: args.googleConnectionId,
    choices: found.choices.map((choice) => ({
      property: choice.property,
      displayName: choice.displayName,
      accountName: choice.accountName,
      stream: choice.stream,
      checked: choice.checked,
      ...(choice.addresses ? { addresses: choice.addresses, others: choice.others ?? [] } : {}),
    })),
  });
}

/**
 * Whether a section is waiting for a sign-in it did not start: never
 * connected, choosing, or needing reconnecting — and not signing in itself.
 * A disconnected section stays disconnected; a working one keeps its own.
 */
export const waitingForSignIn = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), section: v.union(v.literal("SEARCH_CONSOLE"), v.literal("GOOGLE_ANALYTICS")) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = args.section === "SEARCH_CONSOLE"
      ? await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first()
      : await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
    if (!connection) return true;
    const signingIn = connection.pendingAt !== undefined && Date.now() - connection.pendingAt <= STATE_MAX_AGE_MS;
    return !signingIn && (connection.status === "CONNECTING" || connection.status === "CHOOSING" || connection.status === "NEEDS_RECONNECT");
  },
});

/**
 * The account's grant, kept once for the website: its connection for that
 * account found or made, and its tokens replaced — one token row per
 * connection, the newest sign-in's.
 */
export const keepGrant = internalMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    account: v.optional(v.string()),
    scopes: v.array(v.string()),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("googleConnections"),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) throw new Error("The website is no longer held.");
    const now = Date.now();
    const existing = await ctx.db
      .query("googleConnections")
      .withIndex("by_hold_account", (q) => q.eq("companyWebsiteId", args.companyWebsiteId).eq("account", args.account))
      .first();
    const googleConnectionId = existing?._id ?? await ctx.db.insert("googleConnections", {
      companyId: hold.companyId,
      companyWebsiteId: hold._id,
      websiteId: hold.websiteId,
      account: args.account,
      scopes: args.scopes,
      createdAt: now,
      updatedAt: now,
    });
    if (existing) await ctx.db.patch(existing._id, { scopes: args.scopes, updatedAt: now });
    await deleteTokens(ctx, googleConnectionId);
    await ctx.db.insert("googleTokens", {
      googleConnectionId,
      accessTokenCiphertext: args.accessTokenCiphertext,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    return googleConnectionId;
  },
});

async function deleteTokens(ctx: MutationCtx, googleConnectionId: Id<"googleConnections">) {
  for (const row of await ctx.db
    .query("googleTokens")
    .withIndex("by_connection", (q) => q.eq("googleConnectionId", googleConnectionId))
    .take(10)) {
    await ctx.db.delete(row._id);
  }
}

// ---------------------------------------------------------------------------
// Giving back
// ---------------------------------------------------------------------------

/** Whether any connection holds a token for this Google account — other than one, when named. */
export const accountInUse = internalQuery({
  args: { account: v.string(), except: v.optional(v.id("googleConnections")) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const sharing = await ctx.db
      .query("googleConnections")
      .withIndex("by_account", (q) => q.eq("account", args.account))
      .take(MAX_SHARING);
    for (const connection of sharing) {
      if (connection._id === args.except) continue;
      const token = await ctx.db
        .query("googleTokens")
        .withIndex("by_connection", (q) => q.eq("googleConnectionId", connection._id))
        .first();
      if (token) return true;
    }
    // More sharing than can be checked counts as shared: never revoke what may be in use.
    return sharing.length === MAX_SHARING;
  },
});

/**
 * The website's Google connections no section reads with — all of them when
 * the website is no longer held — with what giving each back needs.
 */
export const unusedOf = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), all: v.boolean() },
  handler: async (ctx, args) => {
    const used = new Set<string>();
    if (!args.all) {
      const consoleConnection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
      const analytics = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
      for (const connection of [consoleConnection, analytics]) {
        // A section signing in may yet come back to its old account: nothing of it is given back meanwhile.
        if (connection?.pendingAt !== undefined && Date.now() - connection.pendingAt <= STATE_MAX_AGE_MS) return [];
        if (connection?.googleConnectionId && connection.status !== "DISCONNECTED") used.add(connection.googleConnectionId);
      }
    }
    const connections = await ctx.db
      .query("googleConnections")
      .withIndex("by_hold_account", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(MOST_PER_HOLD);
    const unused: { googleConnectionId: Id<"googleConnections">; account: string | null; ciphertext: string | null }[] = [];
    for (const connection of connections) {
      if (used.has(connection._id)) continue;
      const token = await ctx.db
        .query("googleTokens")
        .withIndex("by_connection", (q) => q.eq("googleConnectionId", connection._id))
        .first();
      unused.push({
        googleConnectionId: connection._id,
        account: connection.account ?? null,
        ciphertext: token ? (token.refreshTokenCiphertext ?? token.accessTokenCiphertext) : null,
      });
    }
    return unused;
  },
});

/**
 * Give back every Google connection of the website no section reads with:
 * revoked at Google unless another connection holds the same account's grant,
 * then forgotten. A grant Google cannot be reached to revoke is still one
 * Hakken no longer holds. With `all`, every one of the website's (a website
 * the company no longer holds).
 */
export const releaseUnused = internalAction({
  args: { companyWebsiteId: v.id("companyWebsites"), all: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unused = await ctx.runQuery(internal.googleConnection.unusedOf, { companyWebsiteId: args.companyWebsiteId, all: args.all === true });
    const provider = getConnectorOAuthProvider(SEARCH_CONSOLE_PROVIDER);
    for (const entry of unused) {
      const shared = entry.account
        ? await ctx.runQuery(internal.googleConnection.accountInUse, { account: entry.account, except: entry.googleConnectionId })
        : false;
      if (entry.ciphertext && provider && !shared) {
        try {
          await revokeOAuthToken(provider, await decryptConnectorToken(entry.ciphertext));
        } catch {
          // Unreadable: forgetting it below still runs.
        }
      }
      await ctx.runMutation(internal.googleConnection.dropConnection, {
        googleConnectionId: entry.googleConnectionId,
        companyWebsiteId: args.companyWebsiteId,
        all: args.all === true,
      });
    }
    return null;
  },
});

/** Forget a Google connection and its tokens — unless a section took it up again meanwhile. */
export const dropConnection = internalMutation({
  args: { googleConnectionId: v.id("googleConnections"), companyWebsiteId: v.id("companyWebsites"), all: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.all) {
      const consoleConnection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
      const analytics = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
      const inUse = [consoleConnection, analytics].some((connection) => connection?.googleConnectionId === args.googleConnectionId && connection.status !== "DISCONNECTED");
      if (inUse) return null;
    }
    await deleteTokens(ctx, args.googleConnectionId);
    if (await ctx.db.get(args.googleConnectionId)) await ctx.db.delete(args.googleConnectionId);
    return null;
  },
});

/**
 * A website the company no longer holds: every grant it signed in with given
 * back, then everything Search Console and Google Analytics brought for it,
 * and its page numbers.
 */
export const forgetHold = internalAction({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runAction(internal.googleConnection.releaseUnused, { companyWebsiteId: args.companyWebsiteId, all: true });
    await ctx.runMutation(internal.searchConsoleSync.purgeHold, { companyWebsiteId: args.companyWebsiteId });
    await ctx.runMutation(internal.googleAnalyticsConnect.purgeHold, { companyWebsiteId: args.companyWebsiteId });
    // The website's page numbers last, once neither section's lists point to them.
    await ctx.runMutation(internal.holdPageRefs.purgeHold, { companyWebsiteId: args.companyWebsiteId });
    return null;
  },
});

// ---------------------------------------------------------------------------
// A usable access token
// ---------------------------------------------------------------------------

export const tokenRowOf = internalQuery({
  args: { googleConnectionId: v.id("googleConnections") },
  handler: async (ctx, args): Promise<Doc<"googleTokens"> | null> =>
    await ctx.db
      .query("googleTokens")
      .withIndex("by_connection", (q) => q.eq("googleConnectionId", args.googleConnectionId))
      .first(),
});

export const storeRenewedToken = internalMutation({
  args: {
    tokenRowId: v.id("googleTokens"),
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

/** Keys Google has refused, or that cannot be read, are no use to keep: both sections then ask to reconnect. */
export const dropTokens = internalMutation({
  args: { googleConnectionId: v.id("googleConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteTokens(ctx, args.googleConnectionId);
    return null;
  },
});

/**
 * The one door to a usable access token, for both sections. Renews it when
 * it is near its end, or when Google has just refused it (`renew`), and says
 * plainly when the connection cannot go on; the section notes that on its own
 * connection.
 */
export async function googleAccessToken(
  ctx: ActionCtx,
  googleConnectionId: Id<"googleConnections"> | null,
  renew = false,
): Promise<{ ok: true; accessToken: string } | { ok: false; problem: GoogleTokenProblem }> {
  const provider = getConnectorOAuthProvider(SEARCH_CONSOLE_PROVIDER);
  const credentials = getConnectorOAuthClientCredentials(SEARCH_CONSOLE_PROVIDER);
  if (!provider || !credentials || !isConnectorTokenEncryptionConfigured()) return { ok: false, problem: "NOT_CONFIGURED" };
  if (!googleConnectionId) return { ok: false, problem: "REVOKED" };
  const row = await ctx.runQuery(internal.googleConnection.tokenRowOf, { googleConnectionId });
  if (!row) return { ok: false, problem: "REVOKED" };
  const stop = async (problem: "REVOKED" | "UNREADABLE") => {
    await ctx.runMutation(internal.googleConnection.dropTokens, { googleConnectionId });
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
  if (!renewed.ok) return renewed.refused ? await stop("REVOKED") : { ok: false, problem: "GOOGLE_BUSY" };
  if (!renewed.tokens.access_token) return await stop("REVOKED");
  await ctx.runMutation(internal.googleConnection.storeRenewedToken, {
    tokenRowId: row._id,
    accessTokenCiphertext: await encryptConnectorToken(renewed.tokens.access_token),
    refreshTokenCiphertext: renewed.tokens.refresh_token
      ? await encryptConnectorToken(renewed.tokens.refresh_token)
      : undefined,
    expiresAt: renewed.tokens.expires_in ? Date.now() + renewed.tokens.expires_in * 1000 : undefined,
  });
  return { ok: true, accessToken: renewed.tokens.access_token };
}

/** The account a Google connection signed in as, for a section's page: never a token. */
export async function accountOf(ctx: { db: QueryCtx["db"] }, googleConnectionId: Id<"googleConnections"> | undefined) {
  if (!googleConnectionId) return null;
  return (await ctx.db.get(googleConnectionId))?.account ?? null;
}
