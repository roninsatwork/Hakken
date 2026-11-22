import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getActiveCompanyId } from "./authz";
import { tenantAction, tenantMutation, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  ACCESS_PASS_LIFETIME_MS,
  ALLOW_CODE_LIFETIME_MS,
  CHAT_APP_NAMES,
  CHAT_APP_SCOPE,
  type ChatApp,
  LISTED_CHAT_APPS,
  QUESTIONS_PER_MINUTE,
  RENEWAL_PASS_LIFETIME_MS,
  appForReturnAddress,
  appForReturnAddresses,
  documentClientApp,
  fingerprintOf,
  isCodeChallenge,
  isOurResource,
  newSecret,
  publicOrigin,
  readClientDocument,
  returnAddressWith,
  sameReturnAddress,
  verifierMatches,
} from "./utils/chatApps";
import { companyHasOutsideFeature } from "./utils/featureSwitchReads";
import { creditChatAppQuestion } from "./creditHooks";
import { resolvePlatformName } from "./settingsService";

/**
 * Ask Hakken in ChatGPT and Claude: who may connect, and the passes that let
 * them in (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * phase 1). OAuth 2.1 with PKCE, built in Hakken (Anthony, 2026-11-21: "use
 * hakken"). The Allow page (`src/app/oauth/authorize`) asks
 * `describeAllowRequest` and then `allow`; the HTTP handlers
 * (`chatAppsHttp.ts`) swap codes and renewal passes here, and check a pass on
 * every question.
 *
 * Every pass belongs to one person and one company. A company or website an app
 * names is never trusted: each question is answered for the pass's company, as
 * the screens answer for the signed-in person's.
 */

const chatAppValidator = v.union(v.literal("chatgpt"), v.literal("claude"), v.literal("local"));
const listedChatAppValidator = v.union(v.literal("chatgpt"), v.literal("claude"));

/** A published client document is read again after a day. */
const DOCUMENT_FRESH_MS = 24 * 60 * 60 * 1000;
/** Clients signed up in ten minutes before sign-up pauses: Claude signs up once a connection, nobody needs more. */
const SIGN_UPS_PER_TEN_MINUTES = 200;
/** Companies a super admin picks from on the Allow page. */
const COMPANY_CHOICES = 500;

type Refusal = { ok: false; error: string; description: string };

const origin = () => publicOrigin(process.env.SITE_URL);

async function linkState(ctx: Pick<QueryCtx, "db">, userId: Id<"users">, app: ChatApp) {
  return await ctx.db.query("chatAppLinkStates").withIndex("by_user_app", (q) => q.eq("userId", userId).eq("app", app)).first();
}

async function toolCallLimitReached(ctx: Pick<QueryCtx, "db">, userId: Id<"users">, now: number) {
  const recent = await ctx.db.query("chatAppRequests")
    .withIndex("by_user_method_at", (q) => q.eq("userId", userId).eq("method", "tools/call").gt("at", now - 60_000))
    .order("desc")
    .take(QUESTIONS_PER_MINUTE);
  return recent.length >= QUESTIONS_PER_MINUTE;
}

// ---------- clients ----------

export const clientInternal = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, args): Promise<Doc<"chatAppClients"> | null> => await ctx.db.query("chatAppClients").withIndex("by_client_id", (q) => q.eq("clientId", args.clientId)).first(),
});

/** An app's published client document, kept so the Allow page and the token swap read the same addresses. */
export const saveClientDocumentInternal = internalMutation({
  args: { clientId: v.string(), name: v.string(), redirectUris: v.array(v.string()) },
  handler: async (ctx, args): Promise<Id<"chatAppClients"> | null> => {
    const app = appForReturnAddresses(args.redirectUris, origin()) ?? documentClientApp(args.clientId);
    if (!app) return null;
    const known = await ctx.db.query("chatAppClients").withIndex("by_client_id", (q) => q.eq("clientId", args.clientId)).first();
    const now = Date.now();
    if (known) {
      await ctx.db.patch(known._id, { name: args.name, redirectUris: args.redirectUris, readAt: now });
      return known._id;
    }
    return await ctx.db.insert("chatAppClients", { clientId: args.clientId, app, name: args.name, redirectUris: args.redirectUris, source: "document", createdAt: now, readAt: now });
  },
});

/**
 * An app signing itself up (Dynamic Client Registration, RFC 7591): accepted only
 * when every return address is an allowed app's, and kept as a public client
 * that proves itself with PKCE.
 */
export const signUpClientInternal = internalMutation({
  args: { name: v.string(), redirectUris: v.array(v.string()) },
  handler: async (ctx, args): Promise<{ ok: true; clientId: string; app: ChatApp; createdAt: number } | Refusal> => {
    const app = appForReturnAddresses(args.redirectUris, origin());
    if (!app) return { ok: false, error: "invalid_redirect_uri", description: "Only ChatGPT and Claude may connect, at their own return addresses." };
    const now = Date.now();
    const recent = await ctx.db.query("chatAppClients").withIndex("by_created", (q) => q.gt("createdAt", now - 10 * 60 * 1000)).take(SIGN_UPS_PER_TEN_MINUTES);
    if (recent.length >= SIGN_UPS_PER_TEN_MINUTES) return { ok: false, error: "temporarily_unavailable", description: "Too many sign-ups just now. Try again in a few minutes." };
    const clientId = newSecret("client");
    await ctx.db.insert("chatAppClients", { clientId, app, name: args.name.trim().slice(0, 80), redirectUris: args.redirectUris, source: "signedUp", createdAt: now });
    return { ok: true, clientId, app, createdAt: now };
  },
});

/** Fetches an app's published client document, if it's one Hakken may read. Fixed hosts only, so nothing private is reachable. */
async function fetchClientDocument(clientId: string): Promise<{ name: string; redirectUris: string[] } | null> {
  if (!documentClientApp(clientId)) return null;
  try {
    const response = await fetch(clientId, { redirect: "error", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 64 * 1024) return null;
    return readClientDocument(clientId, JSON.parse(text));
  } catch {
    return null;
  }
}

// ---------- the Allow page ----------

const allowRequestArgs = {
  clientId: v.string(),
  redirectUri: v.string(),
  responseType: v.string(),
  codeChallenge: v.string(),
  codeChallengeMethod: v.string(),
  resource: v.optional(v.string()),
  state: v.optional(v.string()),
};

type AllowPerson = {
  name: string;
  superAdmin: boolean;
  company: { id: Id<"companies">; name: string } | null;
  companies: { id: Id<"companies">; name: string }[];
  switchedOff: Id<"companies">[];
};

type AllowCheck =
  | { ok: true; app: ChatApp; appName: string; returnHost: string }
  | { ok: false; reason: "unknownApp" | "badReturn" | "badRequest" };

/** The request's own checks, before anything about the person: the app, its return address, PKCE and the resource. */
function checkRequest(client: Doc<"chatAppClients"> | null, args: { redirectUri: string; responseType: string; codeChallenge: string; codeChallengeMethod: string; resource?: string }): AllowCheck {
  if (!client) return { ok: false, reason: "unknownApp" };
  if (!client.redirectUris.some((registered) => sameReturnAddress(registered, args.redirectUri))) return { ok: false, reason: "badReturn" };
  const app = appForReturnAddress(args.redirectUri, origin());
  if (!app) return { ok: false, reason: "badReturn" };
  if (args.responseType !== "code" || !isCodeChallenge(args.codeChallenge, args.codeChallengeMethod) || !isOurResource(args.resource, origin())) return { ok: false, reason: "badRequest" };
  // A test app on a developer's machine is named as it named itself (Claude Code, MCP Inspector); ChatGPT and Claude by Hakken.
  const appName = app === "local" && client.name ? client.name : CHAT_APP_NAMES[app];
  return { ok: true, app, appName, returnHost: new URL(args.redirectUri).host };
}

export const allowPersonInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<AllowPerson | null> => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const superAdmin = user.role === "SUPER_ADMIN";
    const activeId = getActiveCompanyId(user);
    const companies = superAdmin
      ? (await ctx.db.query("companies").take(COMPANY_CHOICES)).map((company) => ({ id: company._id, name: company.name })).sort((a, b) => a.name.localeCompare(b.name))
      : [];
    const active = activeId ? await ctx.db.get(activeId) : null;
    const switchedOff: Id<"companies">[] = [];
    for (const company of superAdmin ? companies.map((one) => one.id) : activeId ? [activeId] : []) {
      if (!(await companyHasOutsideFeature(ctx, company, "chatApps"))) switchedOff.push(company);
    }
    return {
      name: user.name ?? user.email ?? "",
      superAdmin,
      company: active ? { id: active._id, name: active.name } : null,
      companies,
      switchedOff,
    };
  },
});

/**
 * What the Allow page shows: which app is asking, where it'll send the person
 * back, who is signed in and for which company. An action because a published
 * client document may need reading first. Nothing is saved but that document.
 */
const companyChoiceValidator = v.object({ id: v.id("companies"), name: v.string() });

export const describeAllowRequest = tenantAction({
  args: allowRequestArgs,
  returns: v.union(
    v.object({ ok: v.literal(false), reason: v.union(v.literal("unknownApp"), v.literal("badReturn"), v.literal("badRequest")) }),
    v.object({
      ok: v.literal(true),
      app: chatAppValidator,
      appName: v.string(),
      returnHost: v.string(),
      issuer: v.string(),
      person: v.object({
        name: v.string(),
        superAdmin: v.boolean(),
        company: v.union(companyChoiceValidator, v.null()),
        companies: v.array(companyChoiceValidator),
        switchedOff: v.array(v.id("companies")),
      }),
    }),
  ),
  handler: async (ctx, args): Promise<Exclude<AllowCheck, { ok: true }> | (Extract<AllowCheck, { ok: true }> & { issuer: string; person: AllowPerson })> => {
    let client = await ctx.runQuery(internal.chatAppPasses.clientInternal, { clientId: args.clientId });
    if (documentClientApp(args.clientId) && (!client || (client.readAt ?? 0) < Date.now() - DOCUMENT_FRESH_MS)) {
      const document = await fetchClientDocument(args.clientId);
      if (document) {
        await ctx.runMutation(internal.chatAppPasses.saveClientDocumentInternal, { clientId: args.clientId, ...document });
        client = await ctx.runQuery(internal.chatAppPasses.clientInternal, { clientId: args.clientId });
      }
    }
    const check = checkRequest(client, args);
    if (!check.ok) return check;
    const person = await ctx.runQuery(internal.chatAppPasses.allowPersonInternal, { userId: ctx.userId });
    if (!person) throw appError("UNAUTHORIZED", "Sign in first.");
    return { ...check, issuer: origin(), person };
  },
});

/** The person presses Allow: a grant for the app and the company, and a one-use code to send back. */
export const allow = tenantMutation({
  args: { ...allowRequestArgs, companyId: v.optional(v.id("companies")) },
  returns: v.object({ returnTo: v.string() }),
  handler: async (ctx, args) => {
    const client = await ctx.db.query("chatAppClients").withIndex("by_client_id", (q) => q.eq("clientId", args.clientId)).first();
    const check = checkRequest(client, args);
    if (!check.ok || !client) throw appError("INVALID_INPUT", "This app can't connect.");
    const superAdmin = ctx.user.role === "SUPER_ADMIN";
    const companyId = superAdmin ? args.companyId : ctx.user.companyId;
    if (!companyId || !(await ctx.db.get(companyId))) throw appError("INVALID_INPUT", "Pick a company first.");
    if (!superAdmin && args.companyId && args.companyId !== companyId) throw appError("UNAUTHORIZED", "That company isn't yours.");
    if (!(await companyHasOutsideFeature(ctx, companyId, "chatApps"))) throw appError("MODULE_DISABLED", "Linking ChatGPT and Claude is switched off for this company.");

    const now = Date.now();
    const version = (await linkState(ctx, ctx.userId, check.app))?.version ?? 0;
    const existing = (await ctx.db.query("chatAppGrants").withIndex("by_user_app_cut_off", (q) => q.eq("userId", ctx.userId).eq("app", check.app).eq("cutOffAt", undefined)).order("desc").take(50))
      .find((grant) => grant.companyId === companyId && (grant.linkVersion ?? 0) === version);
    const grantId = existing?._id ?? await ctx.db.insert("chatAppGrants", { userId: ctx.userId, companyId, app: check.app, clientId: client.clientId, allowedAt: now, linkVersion: version });
    if (existing) await ctx.db.patch(existing._id, { clientId: client.clientId, allowedAt: now });

    const code = newSecret("code");
    await ctx.db.insert("chatAppCodes", {
      fingerprint: await fingerprintOf(code),
      grantId,
      clientId: client.clientId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      expiresAt: now + ALLOW_CODE_LIFETIME_MS,
    });
    return { returnTo: returnAddressWith(args.redirectUri, { code, state: args.state, iss: origin() }) };
  },
});

// ---------- passes ----------

async function issuePasses(ctx: Pick<MutationCtx, "db">, grantId: Id<"chatAppGrants">, chain: string, now: number) {
  const access = newSecret("pass");
  const renew = newSecret("renew");
  await ctx.db.insert("chatAppPasses", { fingerprint: await fingerprintOf(access), kind: "access", grantId, chain, expiresAt: now + ACCESS_PASS_LIFETIME_MS });
  await ctx.db.insert("chatAppPasses", { fingerprint: await fingerprintOf(renew), kind: "renew", grantId, chain, expiresAt: now + RENEWAL_PASS_LIFETIME_MS });
  return { ok: true as const, accessPass: access, renewalPass: renew, expiresIn: Math.round(ACCESS_PASS_LIFETIME_MS / 1000), scope: CHAT_APP_SCOPE };
}

async function cutOffChain(ctx: Pick<MutationCtx, "db">, chain: string, now: number) {
  for (const pass of await ctx.db.query("chatAppPasses").withIndex("by_chain", (q) => q.eq("chain", chain)).take(500)) {
    if (pass.cutOffAt === undefined) await ctx.db.patch(pass._id, { cutOffAt: now });
  }
}

/** Whether the person may still read the grant's company: still in it (a super admin always), and the switch on. */
async function grantStillGood(ctx: Pick<QueryCtx, "db">, grant: Doc<"chatAppGrants"> | null): Promise<{ ok: true; grant: Doc<"chatAppGrants"> } | { ok: false; why: "cutOff" | "left" | "switchedOff" }> {
  if (!grant || grant.cutOffAt !== undefined) return { ok: false, why: "cutOff" };
  if ((grant.linkVersion ?? 0) !== ((await linkState(ctx, grant.userId, grant.app))?.version ?? 0)) return { ok: false, why: "cutOff" };
  const user = await ctx.db.get(grant.userId);
  if (!user || (user.role !== "SUPER_ADMIN" && user.companyId !== grant.companyId) || !(await ctx.db.get(grant.companyId))) return { ok: false, why: "left" };
  if (!(await companyHasOutsideFeature(ctx, grant.companyId, "chatApps"))) return { ok: false, why: "switchedOff" };
  return { ok: true, grant };
}

/** The token swap's first step: a one-use code, its PKCE verifier and the same return address, for an hour's pass and a renewal pass. */
export const redeemCodeInternal = internalMutation({
  args: { code: v.string(), clientId: v.string(), redirectUri: v.string(), codeVerifier: v.string(), resource: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fingerprint = await fingerprintOf(args.code);
    const row = await ctx.db.query("chatAppCodes").withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint)).first();
    const refused: Refusal = { ok: false, error: "invalid_grant", description: "That code doesn't work. Start again from the app." };
    if (!row || row.expiresAt <= now || row.clientId !== args.clientId || row.redirectUri !== args.redirectUri) return refused;
    if (row.usedAt !== undefined) {
      // A code used twice: someone else may hold it, so every pass it gave goes too (RFC 6749, section 4.1.2).
      for (const pass of await ctx.db.query("chatAppPasses").withIndex("by_grant", (q) => q.eq("grantId", row.grantId)).take(500)) {
        if (pass.cutOffAt === undefined && pass._creationTime >= row.usedAt) await ctx.db.patch(pass._id, { cutOffAt: now });
      }
      return refused;
    }
    if (!isOurResource(args.resource, origin()) || !(await verifierMatches(args.codeVerifier, row.codeChallenge))) return refused;
    const good = await grantStillGood(ctx, await ctx.db.get(row.grantId));
    if (!good.ok) return { ok: false, error: "access_denied", description: "This app can't read these figures any more." } satisfies Refusal;
    await ctx.db.patch(row._id, { usedAt: now });
    return await issuePasses(ctx, row.grantId, newSecret("code"), now);
  },
});

/** A renewal pass, used once, for a fresh pair. Used twice, the whole chain is cut off: one of the two holders isn't the app. */
export const renewInternal = internalMutation({
  args: { renewalPass: v.string(), clientId: v.string(), resource: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const refused: Refusal = { ok: false, error: "invalid_grant", description: "That renewal pass doesn't work. Connect again from the app." };
    const fingerprint = await fingerprintOf(args.renewalPass);
    const pass = await ctx.db.query("chatAppPasses").withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint)).first();
    if (!pass || pass.kind !== "renew") return refused;
    // Reuse is checked first: the used pass was cut off with its chain, and a second use must still cut off the new pair.
    if (pass.usedAt !== undefined) {
      await cutOffChain(ctx, pass.chain, now);
      const grant = await ctx.db.get(pass.grantId);
      if (grant && grant.cutOffAt === undefined) await ctx.db.patch(grant._id, { cutOffAt: now, cutOffBy: "reused" });
      return refused;
    }
    if (pass.cutOffAt !== undefined || pass.expiresAt <= now) return refused;
    const grant = await ctx.db.get(pass.grantId);
    if (!grant || grant.clientId !== args.clientId || !isOurResource(args.resource, origin())) return refused;
    const good = await grantStillGood(ctx, grant);
    if (!good.ok) return refused;
    await ctx.db.patch(pass._id, { usedAt: now });
    // The used pass's partner, the old access pass, ends now too: one pair alive per chain.
    await cutOffChain(ctx, pass.chain, now);
    return await issuePasses(ctx, grant._id, pass.chain, now);
  },
});

/**
 * Every question's first step: the pass, the person, the company and the
 * switch, and the person's limit of questions a minute. The answer says who is
 * asking, for the door to answer as them.
 */
export const checkPassInternal = internalMutation({
  args: { accessPass: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), grantId: v.id("chatAppGrants"), userId: v.id("users"), companyId: v.id("companies"), app: chatAppValidator, platformName: v.string() }),
    v.object({ ok: v.literal(false), status: v.union(v.literal(401), v.literal(403), v.literal(429)), why: v.union(v.literal("noPass"), v.literal("cutOff"), v.literal("left"), v.literal("switchedOff"), v.literal("tooMany")), grantId: v.optional(v.id("chatAppGrants")) }),
  ),
  handler: async (ctx, args): Promise<
    | { ok: true; grantId: Id<"chatAppGrants">; userId: Id<"users">; companyId: Id<"companies">; app: ChatApp; platformName: string }
    | { ok: false; status: 401 | 403 | 429; why: "noPass" | "cutOff" | "left" | "switchedOff" | "tooMany"; grantId?: Id<"chatAppGrants"> }
  > => {
    const now = Date.now();
    const fingerprint = await fingerprintOf(args.accessPass);
    const pass = await ctx.db.query("chatAppPasses").withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint)).first();
    if (!pass || pass.kind !== "access" || pass.cutOffAt !== undefined || pass.expiresAt <= now) return { ok: false, status: 401, why: "noPass" };
    const good = await grantStillGood(ctx, await ctx.db.get(pass.grantId));
    if (!good.ok) {
      if (good.why === "left") {
        const grant = await ctx.db.get(pass.grantId);
        if (grant && grant.cutOffAt === undefined) await ctx.db.patch(grant._id, { cutOffAt: now, cutOffBy: "left" });
      }
      return { ok: false, status: good.why === "switchedOff" ? 403 : 401, why: good.why, grantId: pass.grantId };
    }
    const grant = good.grant;
    if (await toolCallLimitReached(ctx, grant.userId, now)) return { ok: false, status: 429, why: "tooMany", grantId: grant._id };
    if ((grant.lastUsedAt ?? 0) < now - 60_000) await ctx.db.patch(grant._id, { lastUsedAt: now });
    const settings = await ctx.db.query("systemSettings").first();
    return { ok: true, grantId: grant._id, userId: grant.userId, companyId: grant.companyId, app: grant.app, platformName: resolvePlatformName(settings?.platformName) };
  },
});

/** Reserve one question before the tool runs. The insert makes parallel checks share the same limit. */
export const reserveQuestionInternal = internalMutation({
  args: { accessPass: v.string(), tool: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), requestId: v.id("chatAppRequests") }),
    v.object({ ok: v.literal(false), status: v.union(v.literal(401), v.literal(403), v.literal(429)) }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const fingerprint = await fingerprintOf(args.accessPass);
    const pass = await ctx.db.query("chatAppPasses").withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint)).first();
    if (!pass || pass.kind !== "access" || pass.cutOffAt !== undefined || pass.expiresAt <= now) return { ok: false as const, status: 401 as const };
    const good = await grantStillGood(ctx, await ctx.db.get(pass.grantId));
    if (!good.ok) return { ok: false as const, status: good.why === "switchedOff" ? 403 as const : 401 as const };
    const grant = good.grant;
    if (await toolCallLimitReached(ctx, grant.userId, now)) return { ok: false as const, status: 429 as const };
    const requestId = await ctx.db.insert("chatAppRequests", {
      grantId: grant._id, userId: grant.userId, companyId: grant.companyId, app: grant.app,
      method: "tools/call", tool: args.tool.slice(0, 64), outcome: "pending", at: now,
    });
    return { ok: true as const, requestId };
  },
});

/** One line in the log for each question, answered or refused. */
export const logQuestionInternal = internalMutation({
  args: {
    requestId: v.optional(v.id("chatAppRequests")),
    grantId: v.optional(v.id("chatAppGrants")),
    method: v.string(),
    tool: v.optional(v.string()),
    detail: v.optional(v.string()),
    website: v.optional(v.string()),
    period: v.optional(v.string()),
    outcome: v.union(v.literal("answered"), v.literal("refused")),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = args.grantId ? await ctx.db.get(args.grantId) : null;
    const { requestId: reservedId, ...row } = args;
    let requestId: Id<"chatAppRequests">;
    if (reservedId) {
      const reserved = await ctx.db.get(reservedId);
      if (!reserved || reserved.grantId !== args.grantId || reserved.method !== "tools/call" || reserved.outcome !== "pending") return null;
      await ctx.db.patch(reservedId, { ...row, website: args.website?.slice(0, 200) });
      requestId = reservedId;
    } else {
      requestId = await ctx.db.insert("chatAppRequests", {
        ...row,
        ...(grant ? { userId: grant.userId, companyId: grant.companyId, app: grant.app } : {}),
        website: args.website?.slice(0, 200),
        at: Date.now(),
      });
    }
    // Each answered question spends the company's credits and shows on its Usage statement.
    if (grant && args.method === "tools/call" && args.outcome === "answered") {
      await creditChatAppQuestion(ctx, { companyId: grant.companyId, userId: grant.userId, requestId });
    }
    return null;
  },
});

// ---------- the person's own Integrations ----------

/** ChatGPT and Claude for the Integrations tab: linked or not, and whether the company has the feature. */
export const myChatApps = tenantQuery({
  args: {},
  returns: v.object({
    switchedOn: v.boolean(),
    companyName: v.string(),
    apps: v.array(v.object({
      app: listedChatAppValidator,
      linked: v.union(v.object({ companyName: v.string(), allowedAt: v.number(), lastUsedAt: v.union(v.number(), v.null()) }), v.null()),
    })),
  }),
  handler: async (ctx) => {
    const switchedOn = await companyHasOutsideFeature(ctx, ctx.companyId, "chatApps");
    const company = ctx.companyId ? await ctx.db.get(ctx.companyId) : null;
    const apps = [];
    for (const app of LISTED_CHAT_APPS) {
      const version = (await linkState(ctx, ctx.userId, app))?.version ?? 0;
      const grant = (await ctx.db.query("chatAppGrants").withIndex("by_user_app_cut_off", (q) => q.eq("userId", ctx.userId).eq("app", app).eq("cutOffAt", undefined)).order("desc").take(50))
        .find((one) => (one.linkVersion ?? 0) === version);
      const company = grant ? await ctx.db.get(grant.companyId) : null;
      apps.push({
        app,
        linked: grant ? { companyName: company?.name ?? "", allowedAt: grant.allowedAt, lastUsedAt: grant.lastUsedAt ?? null } : null,
      });
    }
    return { switchedOn, companyName: company?.name ?? "", apps };
  },
});

/** The questions one app asked as this person, newest first, for its own page. */
export const myChatAppQuestions = tenantQuery({
  args: { app: listedChatAppValidator },
  returns: v.array(v.object({
    id: v.id("chatAppRequests"),
    tool: v.string(),
    detail: v.union(v.string(), v.null()),
    website: v.union(v.string(), v.null()),
    period: v.union(v.string(), v.null()),
    at: v.number(),
    outcome: v.union(v.literal("answered"), v.literal("refused")),
    reason: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const version = (await linkState(ctx, ctx.userId, args.app))?.version ?? 0;
    const grants = (await ctx.db.query("chatAppGrants").withIndex("by_user_app_cut_off", (q) => q.eq("userId", ctx.userId).eq("app", args.app).eq("cutOffAt", undefined)).order("desc").take(50))
      .filter((grant) => (grant.linkVersion ?? 0) === version);
    const rows: Doc<"chatAppRequests">[] = [];
    for (const grant of grants) {
      rows.push(...(await ctx.db.query("chatAppRequests").withIndex("by_grant_at", (q) => q.eq("grantId", grant._id)).order("desc").take(200)));
    }
    return rows
      .filter((row): row is Doc<"chatAppRequests"> & { outcome: "answered" | "refused" } => row.method === "tools/call" && row.outcome !== "pending")
      .sort((a, b) => b.at - a.at)
      .slice(0, 200)
      .map((row) => ({ id: row._id, tool: row.tool ?? "", detail: row.detail ?? null, website: row.website ?? null, period: row.period ?? null, at: row.at, outcome: row.outcome, reason: row.reason ?? null }));
  },
});

/** Unlink: every pass of the app stops at once. Linking again starts in the app. */
export const unlinkChatApp = tenantMutation({
  args: { app: chatAppValidator },
  returns: v.number(),
  handler: async (ctx, args) => {
    const state = await linkState(ctx, ctx.userId, args.app);
    const active = await ctx.db.query("chatAppGrants")
      .withIndex("by_user_app_cut_off", (q) => q.eq("userId", ctx.userId).eq("app", args.app).eq("cutOffAt", undefined))
      .order("desc").take(1);
    if (!active.length || (active[0].linkVersion ?? 0) !== (state?.version ?? 0)) return 0;
    if (state) await ctx.db.patch(state._id, { version: state.version + 1 });
    else await ctx.db.insert("chatAppLinkStates", { userId: ctx.userId, app: args.app, version: 1 });
    return 1;
  },
});

// ---------- clearing (purges/chatAppHistory) ----------

type Clearing = { db: Pick<MutationCtx["db"], "query" | "delete"> };

/**
 * The nightly clearing's share for Ask Hakken in ChatGPT and Claude
 * (`purges.ts`, `chatAppHistory`): questions past retention, and codes and
 * passes that have run out, whatever the retention, since nothing can use
 * them. A client an app signed up and nobody allowed goes with the questions.
 */
export async function clearChatAppHistory(ctx: Clearing, cutoff: number): Promise<{ deleted: number; hasMore: boolean }> {
  const now = Date.now();
  const questions = await ctx.db.query("chatAppRequests").withIndex("by_at", (q) => q.lt("at", cutoff)).take(500);
  const codes = await ctx.db.query("chatAppCodes").withIndex("by_expires", (q) => q.lt("expiresAt", now)).take(500);
  const passes = await ctx.db.query("chatAppPasses").withIndex("by_expires", (q) => q.lt("expiresAt", now)).take(500);
  const clients = (await ctx.db.query("chatAppClients").withIndex("by_created", (q) => q.lt("createdAt", cutoff)).take(100)).filter((client) => client.source === "signedUp");
  let unused = 0;
  for (const client of clients) {
    if (!(await ctx.db.query("chatAppGrants").withIndex("by_client", (q) => q.eq("clientId", client.clientId)).first())) {
      await ctx.db.delete(client._id);
      unused += 1;
    }
  }
  for (const record of [...questions, ...codes, ...passes]) await ctx.db.delete(record._id);
  return { deleted: questions.length + codes.length + passes.length + unused, hasMore: questions.length === 500 || codes.length === 500 || passes.length === 500 };
}

/** What that clearing would take tonight, for the Retention screen's dry run. */
export async function countChatAppHistory(ctx: { db: Pick<MutationCtx["db"], "query"> }, cutoff: number, now: number, capped: <T>(query: { take: (n: number) => Promise<T[]> }) => Promise<T[]>): Promise<number> {
  return (await capped(ctx.db.query("chatAppRequests").withIndex("by_at", (q) => q.lt("at", cutoff)))).length
    + (await capped(ctx.db.query("chatAppCodes").withIndex("by_expires", (q) => q.lt("expiresAt", now)))).length
    + (await capped(ctx.db.query("chatAppPasses").withIndex("by_expires", (q) => q.lt("expiresAt", now)))).length;
}
