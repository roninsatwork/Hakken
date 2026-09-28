import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { decryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * An owned website's Search Console, end to end with Google faked at the
 * network (docs/plans/active/search-console-plan.md §3–§4): connecting from
 * the site's page, the property chosen, sign-ins that cannot connect,
 * sixteen months of every search and page by day, the last four days fetched
 * again, access taken back, disconnecting, and a website the company no
 * longer holds. Nothing here reaches Google.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const NOW = Date.parse("2026-09-27T09:30:00Z");
const NEWEST = "2026-09-26";
const OLDEST = "2025-05-26";
const READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const ALL_SCOPES = `${READ_SCOPE} openid https://www.googleapis.com/auth/userinfo.email`;

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Row = { key: string; clicks: number; impressions: number };
/** What the fake Google holds: per property, kind of result and day, the totals and each split's rows. */
type Figures = Record<string, Record<string, Record<string, { total: Row; query?: Row[]; page?: Row[]; country?: Row[]; device?: Row[]; searchAppearance?: Row[] }>>>;

type Google = {
  account: string;
  scope: string;
  properties: { siteUrl: string; permissionLevel: string }[];
  figures: Figures;
  /** Answers instead of the figures, for a status Google gives to every ask. */
  analyticsStatus?: number;
  refreshStatus?: number;
  calls: { url: string; body: string }[];
};

function fakeGoogle(overrides: Partial<Google> = {}): Google {
  const google: Google = {
    account: "owner@acme-shop.test",
    scope: ALL_SCOPES,
    properties: [{ siteUrl: "sc-domain:acme-shop.test", permissionLevel: "siteOwner" }],
    figures: {},
    calls: [],
    ...overrides,
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    google.calls.push({ url, body });
    if (url === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(body);
      if (form.get("grant_type") === "refresh_token") {
        if (google.refreshStatus) return new Response('{"error":"invalid_grant"}', { status: google.refreshStatus });
        return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
      }
      return Response.json({ access_token: "ya29.first", refresh_token: "1//refresh", expires_in: 3599, scope: google.scope });
    }
    if (url === "https://oauth2.googleapis.com/revoke") return new Response("{}", { status: 200 });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json({ email: google.account });
    if (url === "https://searchconsole.googleapis.com/webmasters/v3/sites") return Response.json({ siteEntry: google.properties });
    const analytics = /webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/.exec(url);
    if (analytics) {
      if (google.analyticsStatus) return new Response("refused", { status: google.analyticsStatus });
      const property = decodeURIComponent(analytics[1]);
      const ask = JSON.parse(body) as { startDate: string; endDate: string; type: string; dimensions: string[]; startRow: number };
      const days = google.figures[property]?.[ask.type] ?? {};
      if (ask.startRow > 0) return Response.json({});
      const figures = (row: Row) => ({ clicks: row.clicks, impressions: row.impressions, ctr: row.clicks / row.impressions, position: 3.5 });
      if (ask.dimensions[0] === "date") {
        return Response.json({
          rows: Object.entries(days)
            .filter(([day]) => day >= ask.startDate && day <= ask.endDate)
            .map(([day, entry]) => ({ keys: [day], ...figures(entry.total) })),
        });
      }
      const split = days[ask.startDate]?.[ask.dimensions[0] as "query"] ?? [];
      return Response.json({ rows: split.map((row) => ({ keys: [row.key], ...figures(row) })) });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }));
  return google;
}

const row = (key: string, clicks: number, impressions = clicks * 10): Row => ({ key, clicks, impressions });

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function person(t: Harness, companyId: Id<"companies">, role: "ADMIN" | "USER" | "SUPER_ADMIN") {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
    name: role, email: `${role}-${Math.random()}@acme-shop.test`, role, companyId, createdAt: Date.now(),
  }));
  return t.withIdentity({ subject: userId });
}

async function hold(t: Harness, companyId: Id<"companies">, host: string, relationship: "OWNED" | "TRACKED" = "OWNED") {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship, createdAt: Date.now() });
  });
}

async function setup() {
  const t = harness();
  const companyId = await company(t, "Acme");
  const siteId = await hold(t, companyId, "acme-shop.test");
  return { t, companyId, siteId, admin: await person(t, companyId, "ADMIN") };
}

type Caller = Awaited<ReturnType<typeof person>>;

/** Start connecting, and come back from Google with its code, as the browser would. */
async function signIn(t: Harness, admin: Caller, siteId: Id<"companyWebsites">, back = "code=auth-code") {
  const { authorizeUrl } = await admin.mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId });
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  const response = await t.fetch(`/api/search-console/oauth/callback?state=${encodeURIComponent(state)}&${back}`);
  return { state, response };
}

const connectionOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first());

const tokensOf = (t: Harness) => t.run(async (ctx) => await ctx.db.query("searchConsoleTokens").collect());

const rowsOf = (t: Harness, siteId: Id<"companyWebsites">, dimension: string, day: string) =>
  t.run(async (ctx) => (await ctx.db
    .query("searchConsoleRows")
    .withIndex("by_hold_type_dimension_day", (q) => q.eq("companyWebsiteId", siteId).eq("searchType", "web").eq("dimension", dimension as "query").eq("day", day))
    .collect())
    .map((entry) => [entry.key, entry.clicks])
    .sort());

const revokes = (google: Google) => google.calls.filter((call) => call.url === "https://oauth2.googleapis.com/revoke");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("CONVEX_SITE_URL", "https://dev-site.convex.site");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("connecting a website's Search Console", () => {
  test("an admin is sent to Google's sign-in for read-only Search Console, choosing the account", async () => {
    const { t, siteId, admin } = await setup();
    const { authorizeUrl } = await admin.mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId });
    expect(authorizeUrl.startsWith("https://dev-site.convex.site/api/search-console/oauth/authorize?state=")).toBe(true);
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    // Random beyond the site and the time: 48 hex characters.
    expect(state).toMatch(/:[0-9a-f]{48}$/);

    const response = await t.fetch(`/api/search-console/oauth/authorize?state=${encodeURIComponent(state)}`);
    expect(response.status).toBe(302);
    const google = new URL(response.headers.get("Location")!);
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("scope")).toBe(ALL_SCOPES);
    expect(google.searchParams.get("client_id")).toBe("sc-client.apps.googleusercontent.com");
    expect(google.searchParams.get("redirect_uri")).toMatch(/\/api\/search-console\/oauth\/callback$/);
    expect(google.searchParams.get("access_type")).toBe("offline");
    expect(google.searchParams.get("prompt")).toBe("select_account consent");
    expect(google.searchParams.get("state")).toBe(state);
  });

  test("only the company's admins connect, only its own websites, only once it is set up", async () => {
    const { t, companyId, siteId, admin } = await setup();
    const user = await person(t, companyId, "USER");
    await expect(user.mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId })).rejects.toThrow();

    const otherAdmin = await person(t, await company(t, "Rival"), "ADMIN");
    await expect(otherAdmin.mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId }))
      .rejects.toThrow("not one your company holds");

    const watched = await hold(t, companyId, "rival-shop.test", "TRACKED");
    await expect(admin.mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId: watched }))
      .rejects.toThrow("only for your company's own websites");

    vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "");
    await expect(admin.mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId }))
      .rejects.toThrow("not set up");
    expect((await user.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))?.configured).toBe(false);
  });

  test("the one property that is the whole site connects at once: keys kept as ciphertext, the page told", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({
      properties: [
        { siteUrl: "sc-domain:acme-shop.test", permissionLevel: "siteOwner" },
        { siteUrl: "https://other.test/", permissionLevel: "siteOwner" },
      ],
    });
    const { response } = await signIn(t, admin, siteId);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`http://localhost:3000/app/search-console/${siteId}/connection`);

    const connection = await connectionOf(t, siteId);
    expect(connection).toMatchObject({
      status: "CONNECTED",
      property: "sc-domain:acme-shop.test",
      permission: "siteOwner",
      googleAccount: "owner@acme-shop.test",
    });
    expect(connection?.pendingState).toBeUndefined();

    const [token] = await tokensOf(t);
    expect(token.accessTokenCiphertext).not.toContain("ya29");
    expect(await decryptConnectorToken(token.accessTokenCiphertext)).toBe("ya29.first");
    expect(await decryptConnectorToken(token.refreshTokenCiphertext!)).toBe("1//refresh");

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audit.map((entry) => entry.actionType)).toContain("SEARCH_CONSOLE_CONNECTED");
    expect(JSON.stringify(audit)).not.toContain("ya29");

    const status = (await admin.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))!;
    expect(status).toMatchObject({ configured: true, owned: true, canManage: true, historyFrom: OLDEST });
    expect(status.connection).toMatchObject({ status: "CONNECTED", property: "sc-domain:acme-shop.test", googleAccount: "owner@acme-shop.test" });
    expect(JSON.stringify(status)).not.toMatch(/ya29|refresh|search-console:/);
  });

  test("several properties wait for the admin, who can choose only one the account can read", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({
      properties: [
        { siteUrl: "https://acme-shop.test/blog/", permissionLevel: "siteOwner" },
        { siteUrl: "https://www.acme-shop.test/", permissionLevel: "siteFullUser" },
        { siteUrl: "sc-domain:acme-shop.test", permissionLevel: "siteUnverifiedUser" },
      ],
    });
    await signIn(t, admin, siteId);
    const status = (await admin.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))!;
    expect(status.connection?.status).toBe("CHOOSING");
    expect(status.connection?.choices.map((choice) => choice.property)).toEqual([
      "https://www.acme-shop.test/",
      "https://acme-shop.test/blog/",
    ]);

    await expect(admin.mutation(api.searchConsoleConnect.chooseSearchConsoleProperty, { siteId, property: "sc-domain:acme-shop.test" }))
      .rejects.toThrow("not one this account can read");
    await admin.mutation(api.searchConsoleConnect.chooseSearchConsoleProperty, { siteId, property: "https://www.acme-shop.test/" });
    const connected = await connectionOf(t, siteId);
    expect(connected).toMatchObject({ status: "CONNECTED", property: "https://www.acme-shop.test/" });
    expect(connected?.choices).toBeUndefined();
  });

  test.each([
    ["declined at Google", {}, "error=access_denied", "DECLINED", null, false],
    ["Search Console left unticked", { scope: "openid https://www.googleapis.com/auth/userinfo.email" }, "code=auth-code", "MISSING_SCOPE", "owner@acme-shop.test", true],
    ["no property for the site", { properties: [{ siteUrl: "https://other.test/", permissionLevel: "siteOwner" }] }, "code=auth-code", "NO_PROPERTY", "owner@acme-shop.test", true],
    ["a property the account is not verified for", { properties: [{ siteUrl: "sc-domain:acme-shop.test", permissionLevel: "siteUnverifiedUser" }] }, "code=auth-code", "UNVERIFIED", "owner@acme-shop.test", true],
  ] as const)("a sign-in %s keeps nothing of Google's and says why", async (_name, overrides, back, outcome, account, revoked) => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle(overrides as Partial<Google>);
    const { state, response } = await signIn(t, admin, siteId, back);
    expect(response.headers.get("Location")).toBe(`http://localhost:3000/app/search-console/${siteId}/connection`);

    const status = (await admin.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))!;
    expect(status.connection).toMatchObject({ status: "CONNECTING", signingIn: false, attempt: { outcome, account } });
    expect(await tokensOf(t)).toEqual([]);
    // What Google granted and nobody holds is handed back.
    expect(revokes(google).length > 0).toBe(revoked);
    // The sign-in is over: its state cannot be used again.
    expect((await t.fetch(`/api/search-console/oauth/callback?state=${encodeURIComponent(state)}&code=again`)).status).toBe(400);
  });

  test("a sign-in expires after fifteen minutes, and a forged one is refused", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle();
    expect((await t.fetch("/api/search-console/oauth/authorize?state=forged")).status).toBe(400);
    expect((await t.fetch("/api/search-console/oauth/callback?state=forged&code=abc")).status).toBe(400);

    const { authorizeUrl } = await admin.mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId });
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    vi.setSystemTime(NOW + 16 * 60 * 1000);
    expect((await t.fetch(`/api/search-console/oauth/authorize?state=${encodeURIComponent(state)}`)).status).toBe(400);
    expect((await t.fetch(`/api/search-console/oauth/callback?state=${encodeURIComponent(state)}&code=abc`)).status).toBe(400);
  });

  test("the company reads it — a plain user without the buttons — and no other company can", async () => {
    const { t, companyId, siteId, admin } = await setup();
    fakeGoogle();
    await signIn(t, admin, siteId);
    const user = await person(t, companyId, "USER");
    const seen = (await user.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))!;
    expect(seen.canManage).toBe(false);
    expect(seen.connection?.status).toBe("CONNECTED");

    const otherAdmin = await person(t, await company(t, "Rival"), "ADMIN");
    expect(await otherAdmin.query(api.searchConsoleConnect.searchConsoleStatus, { siteId })).toBeNull();
    await expect(otherAdmin.mutation(api.searchConsoleConnect.disconnectSearchConsole, { siteId })).rejects.toThrow("not one your company holds");
  });
});

describe("collecting", () => {
  const property = "sc-domain:acme-shop.test";

  function figures(): Figures {
    return {
      [property]: {
        web: {
          [NEWEST]: {
            total: row("", 12, 400),
            query: [row("plumber leeds", 5), row("emergency plumber", 3)],
            page: [row("https://acme-shop.test/", 8)],
            country: [row("gbr", 11), row("irl", 1)],
            device: [row("MOBILE", 9), row("DESKTOP", 3)],
            searchAppearance: [row("REVIEW_SNIPPET", 2)],
          },
          "2026-09-25": { total: row("", 4, 150), query: [row("plumber leeds", 4)] },
          // Well back in the history.
          "2025-06-01": { total: row("", 2, 60), query: [row("boiler repair", 2)] },
        },
        // No searches in Discover: its totals and pages only.
        discover: { [NEWEST]: { total: row("", 1, 30), page: [row("https://acme-shop.test/news", 1)] } },
      },
    };
  }

  test("sixteen months of every search and page by day on connecting, newest first", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await finishScheduled(t);

    const connection = await connectionOf(t, siteId);
    expect(connection).toMatchObject({ newestDay: NEWEST, oldestDay: OLDEST });
    expect(connection?.backfilledAt).toBeGreaterThan(0);
    expect(connection?.problem).toBeUndefined();

    const days = await t.run(async (ctx) => await ctx.db.query("searchConsoleDays").collect());
    expect(days.map((entry) => `${entry.searchType} ${entry.day} ${entry.clicks}`).sort()).toEqual([
      "discover 2026-09-26 1",
      "web 2025-06-01 2",
      "web 2026-09-25 4",
      "web 2026-09-26 12",
    ]);
    // The searches add up to less than the day's total: the rest Google hides.
    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["emergency plumber", 3], ["plumber leeds", 5]]);
    expect(await rowsOf(t, siteId, "country", NEWEST)).toEqual([["gbr", 11], ["irl", 1]]);
    expect(await rowsOf(t, siteId, "device", NEWEST)).toEqual([["DESKTOP", 3], ["MOBILE", 9]]);
    expect(await rowsOf(t, siteId, "appearance", NEWEST)).toEqual([["REVIEW_SNIPPET", 2]]);
    expect(await rowsOf(t, siteId, "query", "2025-06-01")).toEqual([["boiler repair", 2]]);

    const runs = await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect());
    // The newest days first, then the history back a week at a time.
    expect(runs[0]).toMatchObject({ kind: "DAILY", fromDay: "2026-09-23", toDay: NEWEST });
    expect(runs[1]).toMatchObject({ kind: "HISTORY", fromDay: "2026-09-16", toDay: "2026-09-22" });
    expect(runs.at(-1)).toMatchObject({ kind: "HISTORY", fromDay: OLDEST });
    expect(runs.every((run) => run.finishedAt !== undefined && run.error === undefined)).toBe(true);
  });

  test("each day brings the new day and the last four again, keeping only what Google still has", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await finishScheduled(t);

    // A day later: yesterday's figures settled, one search gone, and a new day.
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    const web = google.figures[property].web;
    web[NEWEST] = { total: row("", 13, 420), query: [row("plumber leeds", 7)] };
    web["2026-09-27"] = { total: row("", 6, 200), query: [row("drain unblocking", 6)] };
    await t.mutation(internal.searchConsoleSync.collectAllDaily, {});
    await finishScheduled(t);

    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["plumber leeds", 7]]);
    expect(await rowsOf(t, siteId, "page", NEWEST)).toEqual([]);
    expect(await rowsOf(t, siteId, "query", "2026-09-27")).toEqual([["drain unblocking", 6]]);
    const connection = await connectionOf(t, siteId);
    expect(connection).toMatchObject({ newestDay: "2026-09-27", oldestDay: OLDEST });
    const runs = await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect());
    expect(runs.at(-1)).toMatchObject({ kind: "DAILY", fromDay: "2026-09-23", toDay: "2026-09-27" });
  });

  test("the daily run goes through every connected site, however many", async () => {
    const t = harness();
    const companyId = await company(t, "Acme");
    await t.run(async (ctx) => {
      for (let index = 0; index < 150; index += 1) {
        const host = `site-${index}.test`;
        const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
        const companyWebsiteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
        await ctx.db.insert("searchConsoleConnections", {
          companyId, companyWebsiteId, websiteId, status: "CONNECTED", createdAt: Date.now(), updatedAt: Date.now(),
        });
      }
    });
    // A pass of a hundred, and the rest handed on.
    expect(await t.mutation(internal.searchConsoleSync.collectAllDaily, {})).toBe(100);
    await finishScheduled(t);
    const started = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter((job) => job.name.includes("collectRecent")));
    expect(started).toHaveLength(150);
  });

  test("Google taking the access back asks for connecting again, and the figures stay", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await finishScheduled(t);

    // Two hours on the access token has expired, and Google refuses to renew it.
    vi.setSystemTime(NOW + 2 * 60 * 60 * 1000);
    google.refreshStatus = 400;
    await t.mutation(internal.searchConsoleSync.collectAllDaily, {});
    await finishScheduled(t);

    expect(await connectionOf(t, siteId)).toMatchObject({ status: "NEEDS_RECONNECT", problem: "REVOKED" });
    expect(await tokensOf(t)).toEqual([]);
    expect(await rowsOf(t, siteId, "query", NEWEST)).toHaveLength(2);
    const status = (await admin.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))!;
    expect(status.connection).toMatchObject({ status: "NEEDS_RECONNECT", problem: "REVOKED", newestDay: NEWEST });
  });

  test("an account that lost the property asks for connecting again", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures(), analyticsStatus: 403 });
    await signIn(t, admin, siteId);
    await finishScheduled(t);
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "NEEDS_RECONNECT", problem: "NO_ACCESS" });
    expect(google.calls.some((call) => call.url.endsWith("/searchAnalytics/query"))).toBe(true);
  });

  test("another property after a disconnect: the old figures go before the new come in", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({
      figures: {
        ...figures(),
        "https://www.acme-shop.test/": { web: { [NEWEST]: { total: row("", 3, 90), query: [row("acme shop", 3)] } } },
      },
    });
    await signIn(t, admin, siteId);
    await finishScheduled(t);
    await admin.mutation(api.searchConsoleConnect.disconnectSearchConsole, { siteId });
    await finishScheduled(t);

    google.properties = [
      { siteUrl: "sc-domain:acme-shop.test", permissionLevel: "siteOwner" },
      { siteUrl: "https://www.acme-shop.test/", permissionLevel: "siteOwner" },
    ];
    await signIn(t, admin, siteId);
    expect((await connectionOf(t, siteId))?.status).toBe("CHOOSING");
    await admin.mutation(api.searchConsoleConnect.chooseSearchConsoleProperty, { siteId, property: "https://www.acme-shop.test/" });
    await finishScheduled(t);

    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["acme shop", 3]]);
    expect(await rowsOf(t, siteId, "query", "2025-06-01")).toEqual([]);
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "CONNECTED", dataProperty: "https://www.acme-shop.test/", newestDay: NEWEST });
    expect((await connectionOf(t, siteId))?.clearing).toBeUndefined();
  });
});

describe("disconnecting", () => {
  test("keeps the figures and gives Google's access back — once no other site uses the account", async () => {
    const { t, companyId, siteId, admin } = await setup();
    const second = await hold(t, companyId, "acme-blog.test");
    const google = fakeGoogle({
      properties: [
        { siteUrl: "sc-domain:acme-shop.test", permissionLevel: "siteOwner" },
        { siteUrl: "sc-domain:acme-blog.test", permissionLevel: "siteOwner" },
      ],
      figures: { "sc-domain:acme-shop.test": { web: { [NEWEST]: { total: row("", 2, 20), query: [row("acme", 2)] } } } },
    });
    await signIn(t, admin, siteId);
    await signIn(t, admin, second);
    await finishScheduled(t);
    expect(await tokensOf(t)).toHaveLength(2);

    await admin.mutation(api.searchConsoleConnect.disconnectSearchConsole, { siteId });
    await finishScheduled(t);
    // The other site still uses the account's grant: kept at Google.
    expect(revokes(google)).toHaveLength(0);
    expect(await tokensOf(t)).toHaveLength(1);
    const status = (await admin.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))!;
    expect(status.connection?.status).toBe("DISCONNECTED");
    expect(status.connection?.disconnectedAt).toBeGreaterThan(0);
    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["acme", 2]]);
    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audit.map((entry) => entry.actionType)).toContain("SEARCH_CONSOLE_DISCONNECTED");

    await admin.mutation(api.searchConsoleConnect.disconnectSearchConsole, { siteId: second });
    await finishScheduled(t);
    expect(revokes(google)).toHaveLength(1);
    expect(new URLSearchParams(revokes(google)[0].body).get("token")).toBe("1//refresh");
    expect(await tokensOf(t)).toEqual([]);
  });

  test("a website the company no longer holds takes its Search Console with it", async () => {
    const { t, companyId, siteId, admin } = await setup();
    const google = fakeGoogle({
      figures: { "sc-domain:acme-shop.test": { web: { [NEWEST]: { total: row("", 2, 20), query: [row("acme", 2)] } } } },
    });
    await signIn(t, admin, siteId);
    await finishScheduled(t);

    const superAdmin = await person(t, companyId, "SUPER_ADMIN");
    await superAdmin.mutation(api.websites.removeCompanyWebsite, { id: siteId });
    await finishScheduled(t);

    const left = await t.run(async (ctx) => ({
      connections: await ctx.db.query("searchConsoleConnections").collect(),
      tokens: await ctx.db.query("searchConsoleTokens").collect(),
      days: await ctx.db.query("searchConsoleDays").collect(),
      rows: await ctx.db.query("searchConsoleRows").collect(),
      runs: await ctx.db.query("searchConsoleRuns").collect(),
    }));
    expect(left).toEqual({ connections: [], tokens: [], days: [], rows: [], runs: [] });
    expect(revokes(google)).toHaveLength(1);
  });
});
