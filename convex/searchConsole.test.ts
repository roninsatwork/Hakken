import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { decryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { recentWindow } from "./searchConsoleSync";
import { newestWholeDay, shiftDay } from "./searchConsoleDays";

/**
 * An owned website's Search Console, end to end with Google faked at the
 * network (docs/plans/active/search-console-plan.md §3–§4): connecting from
 * the site's page, the property chosen, sign-ins that cannot connect, the
 * Search Console Collector's runs (a new website's last 90 days, then the
 * newest days and the last four again), the days kept packed (plan §14.3),
 * rolled up into weeks and months, the ready-made periods, access taken back,
 * disconnecting, clearing what was collected, and a website the company no
 * longer holds. Nothing here reaches Google.
 *
 * Nothing starts collecting on its own (plan §12): connecting collects
 * nothing; each test that needs figures runs the Collector, as its schedule
 * does.
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
type Pair = Row & { page: string };
/**
 * What the fake Google holds: per property, kind of result and day, the totals and each split's rows. The
 * pairs a search with its page; without them, each search goes to the home page.
 */
type Figures = Record<string, Record<string, Record<string, { total: Row; query?: Row[]; pair?: Pair[]; page?: Row[]; country?: Row[]; device?: Row[]; searchAppearance?: Row[] }>>>;

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
      const day = days[ask.startDate];
      if (ask.dimensions.length === 2) {
        const pairs = day?.pair ?? (day?.query ?? []).map((row) => ({ ...row, page: "https://acme-shop.test/" }));
        return Response.json({ rows: pairs.map((pair) => ({ keys: [pair.key, pair.page], ...figures(pair) })) });
      }
      const split = day?.[ask.dimensions[0] as "query"] ?? [];
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

/** A list kept for one day, as [key, clicks] — a search's own clicks added up from its pairs. */
const rowsOf = (t: Harness, siteId: Id<"companyWebsites">, list: "query" | "page" | "country" | "device" | "appearance", day: string, grain: "DAY" | "WEEK" | "MONTH" = "DAY") =>
  t.run(async (ctx) => {
    const records = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q
        .eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", list === "query" ? "pair" : list).eq("grain", grain).eq("start", day))
      .collect();
    const sums = new Map<string, number>();
    for (const record of records) record.keys.forEach((key, index) => sums.set(key, (sums.get(key) ?? 0) + record.clicks[index]));
    return [...sums].sort();
  });

/** A Collector agent and a run of it, as its schedule starts one. */
async function collector(t: Harness) {
  const agentId = await t.run(async (ctx) => await ctx.db.insert("agents", {
    name: "Search Console: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
    systemKey: "SEARCH_CONSOLE_COLLECTOR", createdAt: Date.now(), updatedAt: Date.now(),
  }));
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "SCHEDULE", objective: "Collect", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  return { agentId, runId };
}

/** One Collector run, to its end: every connected website's own run, collected and settled. */
async function collect(t: Harness) {
  const { runId } = await collector(t);
  await t.action(internal.searchConsoleAgentRun.runSearchConsoleCollectorNow, { runId });
  await finishScheduled(t);
}

const held = (t: Harness) => t.run(async (ctx) => ({
  days: (await ctx.db.query("searchConsoleDays").collect()).length,
  lists: (await ctx.db.query("searchConsoleLists").collect()).length,
}));

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

  test("connecting collects nothing: collecting waits for the Search Console agent", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await finishScheduled(t);

    expect(await connectionOf(t, siteId)).toMatchObject({ status: "CONNECTED", property });
    expect(await held(t)).toEqual({ days: 0, lists: 0 });
    expect(await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect())).toEqual([]);
    expect(google.calls.some((call) => call.url.endsWith("/searchAnalytics/query"))).toBe(false);
  });

  test("a new website's first run brings its last 90 days, each day one record a list, and nothing older", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);

    const connection = await connectionOf(t, siteId);
    // Ninety days, Google's newest the last of them.
    expect(connection).toMatchObject({ newestDay: NEWEST, oldestDay: "2026-06-29" });
    expect(connection?.problem).toBeUndefined();

    const days = await t.run(async (ctx) => await ctx.db.query("searchConsoleDays").collect());
    expect(days.map((entry) => `${entry.searchType} ${entry.day} ${entry.clicks}`).sort()).toEqual([
      "discover 2026-09-26 1",
      "web 2026-09-25 4",
      "web 2026-09-26 12",
    ]);
    // A search's clicks are added up from its pairs; the rest of the day's total Google hides.
    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["emergency plumber", 3], ["plumber leeds", 5]]);
    expect(await rowsOf(t, siteId, "page", NEWEST)).toEqual([["https://acme-shop.test/", 8]]);
    expect(await rowsOf(t, siteId, "country", NEWEST)).toEqual([["gbr", 11], ["irl", 1]]);
    expect(await rowsOf(t, siteId, "device", NEWEST)).toEqual([["DESKTOP", 3], ["MOBILE", 9]]);
    expect(await rowsOf(t, siteId, "appearance", NEWEST)).toEqual([["REVIEW_SNIPPET", 2]]);
    expect(await rowsOf(t, siteId, "query", "2025-06-01")).toEqual([]);

    // One record a day for each list: never one per row.
    const lists = await t.run(async (ctx) => await ctx.db.query("searchConsoleLists").collect());
    expect(lists.filter((record) => record.start === NEWEST && record.searchType === "web").map((record) => record.list).sort())
      .toEqual(["appearance", "country", "device", "page", "pair"]);
    expect(lists.every((record) => record.grain === "DAY" && record.part === 0)).toBe(true);
    const pair = lists.find((record) => record.list === "pair" && record.start === NEWEST)!;
    expect(pair.pages).toEqual(["https://acme-shop.test/", "https://acme-shop.test/"]);
    // Position kept as a sum weighted by impressions: 3.5 for each of 50 impressions.
    expect(pair.positionSums).toEqual([175, 105]);

    const runs = await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect());
    expect(runs[0]).toMatchObject({ kind: "DAILY", fromDay: "2026-09-20", toDay: NEWEST });
    expect(runs.at(-1)).toMatchObject({ fromDay: "2026-06-29" });
    expect(runs.every((run) => run.kind === "DAILY" && run.finishedAt !== undefined && run.error === undefined)).toBe(true);
  });

  test("when each search and page was first and last shown is kept", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);
    const seen = await t.run(async (ctx) => await ctx.db.query("searchConsoleSeen").withIndex("by_hold_country_kind_key", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined)).collect());
    expect(seen.map((entry) => `${entry.kind} ${entry.key} ${entry.firstDay} ${entry.lastDay}`).sort()).toEqual([
      "page https://acme-shop.test/ 2026-09-26 2026-09-26",
      "query emergency plumber 2026-09-26 2026-09-26",
      "query plumber leeds 2026-09-25 2026-09-26",
    ]);
  });

  test("the ready-made periods are built after each run: searches from the pairs, with their pages", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);
    const thirty = await t.run(async (ctx) => await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "query").eq("period", "30").eq("which", "NOW"))
      .collect());
    expect(thirty).toHaveLength(1);
    expect(thirty[0]).toMatchObject({ from: "2026-08-28", to: NEWEST, keys: ["plumber leeds", "emergency plumber"], clicks: [9, 3], counts: [1, 1], tops: ["https://acme-shop.test/", "https://acme-shop.test/"] });
    // The thirty days before are held, and had nothing: kept as held and empty, so the change reads as nothing gained.
    const before = await t.run(async (ctx) => await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "query").eq("period", "30").eq("which", "BEFORE"))
      .collect());
    expect(before.map((part) => part.keys)).toEqual([[]]);
    // Twelve months of a website held for 90 days counts the 90 days, and says so.
    const year = await t.run(async (ctx) => await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "page").eq("period", "365").eq("which", "NOW"))
      .first());
    expect(year).toMatchObject({ from: "2026-06-29", to: NEWEST, keys: ["https://acme-shop.test/"], counts: [2], tops: ["plumber leeds"] });
    // The weeks the Position bands and Brand charts read: the website has no brand words yet, so every click is the rest's.
    const weeks = await t.run(async (ctx) => await ctx.db
      .query("searchConsoleWeeks")
      .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web"))
      .collect());
    expect(weeks.map((week) => [week.week, week.top3, week.top10, week.brandClicks, week.otherClicks])).toEqual([["2026-09-21", 0, 2, 0, 12]]);
    // Discover has no searches: no pairs or searches kept for it.
    const discover = await t.run(async (ctx) => await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "discover").eq("list", "query"))
      .collect());
    expect(discover).toEqual([]);
  });

  test("the next run brings the new day and the last four again, keeping only what Google still has", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);

    // A day later: yesterday's figures settled, one search gone, and a new day.
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    const web = google.figures[property].web;
    web[NEWEST] = { total: row("", 13, 420), query: [row("plumber leeds", 7)] };
    web["2026-09-27"] = { total: row("", 6, 200), query: [row("drain unblocking", 6)] };
    await collect(t);

    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["plumber leeds", 7]]);
    expect(await rowsOf(t, siteId, "page", NEWEST)).toEqual([]);
    expect(await rowsOf(t, siteId, "query", "2026-09-27")).toEqual([["drain unblocking", 6]]);
    expect(await connectionOf(t, siteId)).toMatchObject({ newestDay: "2026-09-27", oldestDay: "2026-06-29" });
    const runs = await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect());
    expect(runs.at(-1)).toMatchObject({ kind: "DAILY", fromDay: "2026-09-23", toDay: "2026-09-27" });
  });

  test("days past 90 roll into their week, and weeks past 12 months into their month, figures and positions intact", async () => {
    const { t, siteId } = await setup();
    const put = (grain: "DAY" | "WEEK", start: string, keys: string[], clicks: number[], impressions: number[], positionSums: number[]) =>
      t.run(async (ctx) => await ctx.db.insert("searchConsoleLists", {
        companyWebsiteId: siteId, searchType: "web", list: "page", grain, start, part: 0, keys, clicks, impressions, positionSums, fetchedAt: 1,
      }));
    // 2026-06-01 is a Monday; with 2026-09-26 the newest, days before 2026-06-29 are past 90.
    await put("DAY", "2026-06-01", ["/a", "/b"], [2, 1], [10, 10], [20, 50]);
    await put("DAY", "2026-06-02", ["/a"], [3], [30], [30]);
    await put("DAY", "2026-06-29", ["/a"], [9], [90], [90]);
    // A week starting before 2025-09-26 is past 12 months.
    await put("WEEK", "2025-09-15", ["/a"], [4], [40], [160]);
    await put("WEEK", "2025-09-22", ["/a"], [5], [50], [100]);

    const due = await t.query(internal.searchConsoleRollups.rollUpsDue, { companyWebsiteId: siteId, newest: NEWEST });
    expect(due.days.map((slot) => slot.start)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(due.weeks.map((slot) => slot.start)).toEqual(["2025-09-15", "2025-09-22"]);
    for (const slot of due.days) await t.mutation(internal.searchConsoleRollups.rollUp, { companyWebsiteId: siteId, ...slot, from: "DAY" });
    for (const slot of due.weeks) await t.mutation(internal.searchConsoleRollups.rollUp, { companyWebsiteId: siteId, ...slot, from: "WEEK" });

    const kept = await t.run(async (ctx) => await ctx.db.query("searchConsoleLists").collect());
    expect(kept.map((record) => `${record.grain} ${record.start}`).sort()).toEqual(["DAY 2026-06-29", "MONTH 2025-09-01", "WEEK 2026-06-01"]);
    const week = kept.find((record) => record.grain === "WEEK")!;
    expect(week.keys).toEqual(["/a", "/b"]);
    expect(week.clicks).toEqual([5, 1]);
    expect(week.positionSums).toEqual([50, 50]);
    const month = kept.find((record) => record.grain === "MONTH")!;
    expect(month).toMatchObject({ keys: ["/a"], clicks: [9], impressions: [90], positionSums: [260] });
  });

  test("Google taking the access back asks for connecting again, and the figures stay", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);

    // Two hours on the access token has expired, and Google refuses to renew it.
    vi.setSystemTime(NOW + 2 * 60 * 60 * 1000);
    google.refreshStatus = 400;
    await collect(t);

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
    await collect(t);
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "NEEDS_RECONNECT", problem: "NO_ACCESS" });
    expect(google.calls.some((call) => call.url.endsWith("/searchAnalytics/query"))).toBe(true);
  });

  test("another property after a disconnect: the old figures go, and the next run brings the new", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({
      figures: {
        ...figures(),
        "https://www.acme-shop.test/": { web: { [NEWEST]: { total: row("", 3, 90), query: [row("acme shop", 3)] } } },
      },
    });
    await signIn(t, admin, siteId);
    await collect(t);
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
    // The old property's figures are gone, and nothing new came in by itself.
    expect(await held(t)).toEqual({ days: 0, lists: 0 });
    expect(await t.run(async (ctx) => await ctx.db.query("searchConsolePeriods").collect())).toEqual([]);
    expect((await connectionOf(t, siteId))?.clearing).toBeUndefined();

    await collect(t);
    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["acme shop", 3]]);
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "CONNECTED", dataProperty: "https://www.acme-shop.test/", newestDay: NEWEST });
  });

  test("clearing what was collected keeps the connection, its tracked lists and runs, and nothing comes back by itself", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);
    await admin.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "query", key: "plumber leeds", track: true });
    expect((await held(t)).lists).toBeGreaterThan(0);
    const runs = (await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect())).length;
    const asked = google.calls.length;

    await t.mutation(internal.searchConsoleSync.clearCollected, { companyWebsiteId: siteId });
    await finishScheduled(t);

    expect(await held(t)).toEqual({ days: 0, lists: 0 });
    expect(await t.run(async (ctx) => (await ctx.db.query("searchConsolePeriods").collect()).length + (await ctx.db.query("searchConsoleSeen").collect()).length)).toBe(0);
    const connection = await connectionOf(t, siteId);
    expect(connection).toMatchObject({ status: "CONNECTED", property, dataProperty: property });
    expect(connection?.newestDay).toBeUndefined();
    expect(connection?.oldestDay).toBeUndefined();
    expect(connection?.lastCollectedAt).toBeUndefined();
    expect(connection?.clearing).toBeUndefined();
    // The sign-in stays and Google was not asked again; the run log and the tracked list stay.
    expect(await tokensOf(t)).toHaveLength(1);
    expect(google.calls.length).toBe(asked);
    expect(await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect())).toHaveLength(runs);
    expect(await t.run(async (ctx) => await ctx.db.query("searchConsoleTracked").collect())).toHaveLength(1);
    const status = (await admin.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))!;
    expect(status.connection).toMatchObject({ status: "CONNECTED", newestDay: null, lastCollectedAt: null });

    // The next run needs no new sign-in, and brings the 90 days again.
    await collect(t);
    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["emergency plumber", 3], ["plumber leeds", 5]]);
  });
});

describe("the Search Console Collector agent", () => {
  const SHOP = "sc-domain:acme-shop.test";
  const BLOG = "sc-domain:acme-blog.test";

  const runsOf = (t: Harness, agentId: Id<"agents">) =>
    t.run(async (ctx) => await ctx.db.query("agentRuns").withIndex("by_agent_started", (q) => q.eq("agentId", agentId)).collect());

  async function twoSites() {
    const { t, companyId, siteId, admin } = await setup();
    const blogId = await hold(t, companyId, "acme-blog.test");
    const google = fakeGoogle({
      properties: [{ siteUrl: SHOP, permissionLevel: "siteOwner" }, { siteUrl: BLOG, permissionLevel: "siteOwner" }],
      figures: {
        [SHOP]: { web: {
          [NEWEST]: { total: row("", 8, 300), query: [row("plumber leeds", 5), row("emergency plumber", 3)] },
          // Well back in the history: never fetched by the agent.
          "2025-06-01": { total: row("", 2, 60), query: [row("boiler repair", 2)] },
        } },
        [BLOG]: { web: { [NEWEST]: { total: row("", 2, 40), query: [row("how to fix a tap", 2)] } } },
      },
    });
    await signIn(t, admin, siteId);
    await signIn(t, admin, blogId);
    await finishScheduled(t);
    return { t, siteId, blogId, google };
  }

  test("each connected website gets a run of its own: its last 90 days to start, never older, then settled", async () => {
    const { t, siteId, blogId } = await twoSites();
    const { agentId, runId } = await collector(t);

    await t.action(internal.searchConsoleAgentRun.runSearchConsoleCollectorNow, { runId });
    await finishScheduled(t);

    const runs = await runsOf(t, agentId);
    const started = runs.find((run) => run._id === runId)!;
    expect(started.status).toBe("SUCCESS");
    expect(started.finalOutput).toContain("each of the 2 websites");
    const own = runs.filter((run) => run._id !== runId);
    expect(own.map((run) => run.title).sort()).toEqual(["Search Console: acme-blog.test", "Search Console: acme-shop.test"]);
    expect(own.every((run) => run.status === "SUCCESS" && run.finalOutput?.includes("nothing older is fetched"))).toBe(true);
    const lines = await t.run(async (ctx) => await ctx.db.query("agentLogs").collect());
    expect(own.every((run) => lines.some((line) => line.runId === run._id && line.responseContent.includes("rows from")))).toBe(true);
    // Each website's run ends by adding up its periods, as a line of its own.
    expect(own.every((run) => lines.some((line) => line.runId === run._id && line.interactionType === "Kept and added up"))).toBe(true);

    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["emergency plumber", 3], ["plumber leeds", 5]]);
    expect(await rowsOf(t, blogId, "query", NEWEST)).toEqual([["how to fix a tap", 2]]);
    expect(await rowsOf(t, siteId, "query", "2025-06-01")).toEqual([]);
    const collected = await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect());
    expect(collected.every((run) => run.kind === "DAILY")).toBe(true);
    expect(await connectionOf(t, siteId)).toMatchObject({ newestDay: NEWEST, oldestDay: "2026-06-29" });
  });

  test("a run started while another is still going stops, so nothing is collected twice", async () => {
    const { t } = await twoSites();
    const { agentId, runId } = await collector(t);
    await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId, triggerType: "EVENT", objective: "Collect", title: "Search Console: acme-shop.test",
      status: "RUNNING", startedAt: Date.now() - 60_000, updatedAt: Date.now(),
    }));

    await t.action(internal.searchConsoleAgentRun.runSearchConsoleCollectorNow, { runId });
    await finishScheduled(t);

    expect((await runsOf(t, agentId)).find((run) => run._id === runId)?.finalOutput).toContain("still going");
    expect(await runsOf(t, agentId)).toHaveLength(2);
    expect(await held(t)).toEqual({ days: 0, lists: 0 });
  });

  test("a website whose sign-in Google took back: its run fails saying what to do, the other still collects", async () => {
    const { t, siteId, blogId, google } = await twoSites();
    const { agentId, runId } = await collector(t);
    // Two hours on the access tokens have expired, and Google refuses to renew them.
    vi.setSystemTime(NOW + 2 * 60 * 60 * 1000);
    google.refreshStatus = 400;
    await t.run(async (ctx) => {
      const blog = (await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", blogId)).first())!;
      // The blog's token was renewed by someone else just now: still good.
      const token = (await ctx.db.query("searchConsoleTokens").withIndex("by_connection", (q) => q.eq("connectionId", blog._id)).first())!;
      await ctx.db.patch(token._id, { expiresAt: Date.now() + 60 * 60 * 1000 });
    });

    await t.action(internal.searchConsoleAgentRun.runSearchConsoleCollectorNow, { runId });
    await finishScheduled(t);

    const own = (await runsOf(t, agentId)).filter((run) => run._id !== runId);
    const shop = own.find((run) => run.title === "Search Console: acme-shop.test")!;
    expect(shop.status).toBe("FAILED");
    expect(shop.finalOutput).toContain("Connect it again");
    expect(own.find((run) => run.title === "Search Console: acme-blog.test")?.status).toBe("SUCCESS");
    expect(await connectionOf(t, siteId)).toMatchObject({ status: "NEEDS_RECONNECT" });
    expect(await rowsOf(t, blogId, "query", NEWEST)).toEqual([["how to fix a tap", 2]]);
  });

  test("with nothing connected, a run says so and starts nothing", async () => {
    const t = harness();
    const { agentId, runId } = await collector(t);
    await t.action(internal.searchConsoleAgentRun.runSearchConsoleCollectorNow, { runId });
    await finishScheduled(t);
    const runs = await runsOf(t, agentId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "SUCCESS", finalOutput: "No website is connected to Search Console, so there was nothing to collect." });
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
    await collect(t);
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
    await collect(t);
    expect((await held(t)).lists).toBeGreaterThan(0);

    const superAdmin = await person(t, companyId, "SUPER_ADMIN");
    await superAdmin.mutation(api.websites.removeCompanyWebsite, { id: siteId });
    await finishScheduled(t);

    const left = await t.run(async (ctx) => ({
      connections: await ctx.db.query("searchConsoleConnections").collect(),
      tokens: await ctx.db.query("searchConsoleTokens").collect(),
      days: await ctx.db.query("searchConsoleDays").collect(),
      lists: await ctx.db.query("searchConsoleLists").collect(),
      periods: await ctx.db.query("searchConsolePeriods").collect(),
      seen: await ctx.db.query("searchConsoleSeen").collect(),
      runs: await ctx.db.query("searchConsoleRuns").collect(),
    }));
    expect(left).toEqual({ connections: [], tokens: [], days: [], lists: [], periods: [], seen: [], runs: [] });
    expect(revokes(google)).toHaveLength(1);
  });
});

describe("which days a run asks for", () => {
  test("nothing held: the last 90 days; held: the newest and the last four again; a first 90 days that stopped part-way: all of them again", () => {
    const now = Date.parse("2026-09-28T09:00:00Z");
    const top = newestWholeDay(now);
    const first = shiftDay(top, -89);
    expect(recentWindow(undefined, now)).toEqual({ from: first, top });
    expect(recentWindow(top, now, first)).toEqual({ from: shiftDay(top, -3), top });
    // The first run stopped with only its newest 20 days in.
    expect(recentWindow(top, now, shiftDay(top, -19))).toEqual({ from: first, top });
  });
});
