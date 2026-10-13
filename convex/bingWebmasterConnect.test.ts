import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { decryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Connecting an owned website to Bing Webmaster Tools, end to end with Bing
 * faked at the network (docs/plans/active/bing-webmaster-plan.md §3): the
 * admin sent to Bing's sign-in, the code exchanged, the account's verified
 * site that is the website chosen — or several offered, or none — the keys
 * kept as ciphertext only, and disconnecting. Nothing here reaches Bing.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const NOW = Date.parse("2026-10-12T09:30:00Z");

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Bing = { sites: { Url: string; IsVerified: boolean }[]; refreshToken: string | null; calls: string[] };

function fakeBing(overrides: Partial<Bing> = {}): Bing {
  const bing: Bing = { sites: [{ Url: "https://www.ronins.co.uk/", IsVerified: true }], refreshToken: "refresh-1", calls: [], ...overrides };
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    bing.calls.push(url);
    if (url === "https://www.bing.com/webmasters/oauth/token") {
      const form = new URLSearchParams(String(init?.body ?? ""));
      if (form.get("grant_type") === "authorization_code") {
        return new Response(JSON.stringify({ access_token: "access-1", token_type: "bearer", expires_in: 3599, ...(bing.refreshToken ? { refresh_token: bing.refreshToken } : {}) }), { status: 200 });
      }
      return new Response(JSON.stringify({ access_token: "access-2", expires_in: 3599 }), { status: 200 });
    }
    if (url.startsWith("https://www.bing.com/webmaster/api.svc/json/GetUserSites")) {
      return new Response(JSON.stringify({ d: bing.sites }), { status: 200 });
    }
    // The first collection, started on connecting, finds no agent to run as: nothing else is asked.
    throw new Error(`Unexpected fetch in test: ${url}`);
  }));
  return bing;
}

async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@ronins.test", role: "ADMIN", companyId, createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { name: "User", email: "user@ronins.test", role: "USER", companyId, createdAt: Date.now() });
    return { companyId, websiteId, siteId, adminId, userId };
  });
  return { t, ...ids, admin: t.withIdentity({ subject: ids.adminId }), user: t.withIdentity({ subject: ids.userId }) };
}

type Caller = ReturnType<Harness["withIdentity"]>;

async function signIn(t: Harness, admin: Caller, siteId: Id<"companyWebsites">, back = "code=auth-code") {
  const { authorizeUrl } = await admin.mutation(api.bingWebmasterConnect.beginBingConnect, { siteId });
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  const response = await t.fetch(`/api/bing-webmaster/oauth/callback?state=${encodeURIComponent(state)}&${back}`);
  await finishScheduled(t);
  return { state, response };
}

const connectionOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("bingConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first());
const tokensOf = (t: Harness) => t.run(async (ctx) => await ctx.db.query("bingTokens").collect());

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("BING_WEBMASTER_CLIENT_ID", "bing-client");
  vi.stubEnv("BING_WEBMASTER_CLIENT_SECRET", "bing-secret");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("CONVEX_SITE_URL", "https://dev-site.convex.site");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("connecting a website's Bing Webmaster Tools", () => {
  test("an admin is sent to Bing's sign-in, asking to read only", async () => {
    const { t, siteId, admin } = await setup();
    const { authorizeUrl } = await admin.mutation(api.bingWebmasterConnect.beginBingConnect, { siteId });
    expect(authorizeUrl).toMatch(/^https:\/\/dev-site\.convex\.site\/api\/bing-webmaster\/oauth\/authorize\?state=bing-webmaster%3A/);
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    const response = await t.fetch(`/api/bing-webmaster/oauth/authorize?state=${encodeURIComponent(state)}`);
    expect(response.status).toBe(302);
    const bing = new URL(response.headers.get("Location")!);
    expect(`${bing.origin}${bing.pathname}`).toBe("https://www.bing.com/webmasters/oauth/authorize");
    expect(bing.searchParams.get("scope")).toBe("webmaster.read");
    expect(bing.searchParams.get("client_id")).toBe("bing-client");
    expect(bing.searchParams.get("redirect_uri")).toMatch(/\/api\/bing-webmaster\/oauth\/callback$/);
  });

  test("only the company's admins connect, only its own websites, and another company sees nothing", async () => {
    const { t, companyId, siteId, user } = await setup();
    await expect(user.mutation(api.bingWebmasterConnect.beginBingConnect, { siteId })).rejects.toThrow();
    const tracked = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "rival.test", displayHost: "rival.test", firstSeenAt: Date.now() });
      return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "TRACKED", createdAt: Date.now() });
    });
    const admin = t.withIdentity({ subject: (await t.run(async (ctx) => (await ctx.db.query("users").collect()).find((row) => row.role === "ADMIN")!._id)) });
    await expect(admin.mutation(api.bingWebmasterConnect.beginBingConnect, { siteId: tracked })).rejects.toThrow("only for your company's own websites");
    const rival = t.withIdentity({
      subject: await t.run(async (ctx) => {
        const rivalId = await ctx.db.insert("companies", { name: "Rival", createdAt: Date.now() });
        return await ctx.db.insert("users", { name: "Rival", email: "admin@rival.test", role: "ADMIN", companyId: rivalId, createdAt: Date.now() });
      }),
    });
    expect(await rival.query(api.bingWebmasterConnect.bingStatus, { siteId })).toBeNull();
  });

  test("the one verified site that is the website connects at once, its keys kept as ciphertext only", async () => {
    const { t, siteId, admin, user } = await setup();
    fakeBing();
    const { response } = await signIn(t, admin, siteId);
    expect(response.headers.get("Location")).toBe(`http://localhost:3000/app/bing-webmaster/${siteId}/connection`);
    const connection = (await connectionOf(t, siteId))!;
    expect(connection).toMatchObject({ status: "CONNECTED", site: "https://www.ronins.co.uk/", dataSite: "https://www.ronins.co.uk/" });
    expect(connection.pendingState).toBeUndefined();
    const [token] = await tokensOf(t);
    expect(token.accessTokenCiphertext).not.toContain("access-1");
    expect(await decryptConnectorToken(token.accessTokenCiphertext)).toBe("access-1");
    expect(await decryptConnectorToken(token.refreshTokenCiphertext!)).toBe("refresh-1");

    const status = (await user.query(api.bingWebmasterConnect.bingStatus, { siteId }))!;
    expect(status).toMatchObject({ configured: true, owned: true, canManage: false, host: "ronins.co.uk" });
    expect(status.connection).toMatchObject({ status: "CONNECTED", site: "https://www.ronins.co.uk/", signingIn: false, attempt: null });
    expect(JSON.stringify(status)).not.toMatch(/access-1|refresh-1|bing-webmaster:/);
  });

  test("several verified sites wait for the admin to choose one", async () => {
    const { t, siteId, admin } = await setup();
    fakeBing({ sites: [{ Url: "https://www.ronins.co.uk/", IsVerified: true }, { Url: "http://www.ronins.co.uk/", IsVerified: true }] });
    await signIn(t, admin, siteId);
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "CHOOSING", choices: ["https://www.ronins.co.uk/", "http://www.ronins.co.uk/"] });
    await expect(admin.mutation(api.bingWebmasterConnect.chooseBingSite, { siteId, site: "https://another.test/" })).rejects.toThrow("not one this account can read");
    await admin.mutation(api.bingWebmasterConnect.chooseBingSite, { siteId, site: "http://www.ronins.co.uk/" });
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "CONNECTED", site: "http://www.ronins.co.uk/" });
  });

  test("a sign-in that cannot connect keeps nothing and says why", async () => {
    const { t, siteId, admin } = await setup();
    fakeBing({ sites: [{ Url: "https://www.ronins.co.uk/", IsVerified: false }] });
    await signIn(t, admin, siteId);
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "CONNECTING", attempt: { outcome: "UNVERIFIED", at: NOW } });
    expect(await tokensOf(t)).toEqual([]);

    fakeBing({ sites: [{ Url: "https://another.test/", IsVerified: true }] });
    await signIn(t, admin, siteId);
    expect((await connectionOf(t, siteId))?.attempt?.outcome).toBe("NO_SITE");

    fakeBing();
    await signIn(t, admin, siteId, "error=access_denied");
    expect((await connectionOf(t, siteId))?.attempt?.outcome).toBe("DECLINED");

    fakeBing({ refreshToken: null });
    await signIn(t, admin, siteId);
    expect((await connectionOf(t, siteId))?.attempt?.outcome).toBe("FAILED");
    expect(await tokensOf(t)).toEqual([]);
  });

  test("a sign-in's state is single-use", async () => {
    const { t, siteId, admin } = await setup();
    fakeBing();
    const { state } = await signIn(t, admin, siteId);
    const again = await t.fetch(`/api/bing-webmaster/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`);
    expect(again.status).toBe(400);
  });

  test("disconnecting forgets the keys and keeps what was collected", async () => {
    const { t, siteId, admin } = await setup();
    fakeBing();
    await signIn(t, admin, siteId);
    await t.run(async (ctx) => {
      await ctx.db.insert("bingDays", { companyWebsiteId: siteId, day: "2026-10-11", clicks: 1, impressions: 63, fetchedAt: NOW });
    });
    await admin.mutation(api.bingWebmasterConnect.disconnectBing, { siteId });
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "DISCONNECTED", disconnectedAt: NOW });
    expect(await tokensOf(t)).toEqual([]);
    expect(await t.run(async (ctx) => (await ctx.db.query("bingDays").collect()).length)).toBe(1);
  });
});
