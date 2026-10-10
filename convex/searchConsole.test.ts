import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { unpackNumbers, unpackedPart } from "./utils/searchConsolePacks";
import { periodPartAsText } from "./searchConsolePeriodReads";
import { lineKeywordsInQuery } from "./searchConsoleKeywordBooks";
import { decodePages } from "./holdPageRefs";
import { decryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { recentWindow } from "./searchConsoleSync";
import { newestWholeDay, shiftDay } from "./searchConsoleDays";
import { useFixedDay } from "@/src/test/realTime";

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

type Row = { key: string; clicks: number; impressions: number; position?: number };
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
      const ask = JSON.parse(body) as {
        startDate: string; endDate: string; type: string; dimensions: string[]; startRow: number;
        dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; expression: string }> }>;
      };
      // Only one search's or one page's rows, when asked for them (a country filter it does not split by).
      const only = (ask.dimensionFilterGroups ?? []).flatMap((group) => group.filters).filter((filter) => filter.dimension === "query" || filter.dimension === "page");
      const days = google.figures[property]?.[ask.type] ?? {};
      if (ask.startRow > 0) return Response.json({});
      const figures = (row: Row) => ({ clicks: row.clicks, impressions: row.impressions, ctr: row.clicks / row.impressions, position: row.position ?? 3.5 });
      if (ask.dimensions[0] === "date") {
        return Response.json({
          rows: Object.entries(days)
            .filter(([day]) => day >= ask.startDate && day <= ask.endDate)
            .map(([day, entry]) => ({ keys: [day], ...figures(entry.total) })),
        });
      }
      // Every day asked for added up, by its keys, as Google does: a day's ask, or the weeks the long lists ask for.
      const sums = new Map<string, { keys: string[]; clicks: number; impressions: number; positionSum: number }>();
      for (const [day, held] of Object.entries(days)) {
        if (day < ask.startDate || day > ask.endDate) continue;
        const rows = ask.dimensions.length === 2
          ? (held.pair ?? (held.query ?? []).map((row) => ({ ...row, page: "https://acme-shop.test/" }))).map((pair) => ({ keys: [pair.key, pair.page], row: pair }))
          : (held[ask.dimensions[0] as "query"] ?? []).map((row) => ({ keys: [row.key], row }));
        for (const { keys, row: one } of rows) {
          if (only.some((filter) => keys[ask.dimensions.indexOf(filter.dimension)] !== filter.expression)) continue;
          const { position } = figures(one);
          const sum = sums.get(keys.join("\u0000")) ?? { keys, clicks: 0, impressions: 0, positionSum: 0 };
          sum.clicks += one.clicks;
          sum.impressions += one.impressions;
          sum.positionSum += position * one.impressions;
          sums.set(keys.join("\u0000"), sum);
        }
      }
      return Response.json({
        rows: [...sums.values()].map((sum) => ({
          keys: sum.keys, clicks: sum.clicks, impressions: sum.impressions, ctr: sum.clicks / sum.impressions, position: sum.positionSum / sum.impressions,
        })),
      });
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

const tokensOf = (t: Harness) => t.run(async (ctx) => await ctx.db.query("googleTokens").collect());

/** The Google account a website's Search Console reads with, through the shared sign-in (google-analytics-plan.md §4.6). */
const accountOfSite = (t: Harness, siteId: Id<"companyWebsites">) => t.run(async (ctx) => {
  const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first();
  return connection?.googleConnectionId ? (await ctx.db.get(connection.googleConnectionId))?.account ?? null : null;
});

/** A list kept for one day, as [key, clicks] — a search's own clicks added up from its pairs. */
const rowsOf = (t: Harness, siteId: Id<"companyWebsites">, list: "query" | "page" | "country" | "device" | "appearance", day: string, grain: "DAY" | "WEEK" | "MONTH" = "DAY") =>
  t.run(async (ctx) => {
    const records = await ctx.db
      .query("searchConsoleLists")
      .withIndex("by_hold_country_type_list_grain_start", (q) => q
        .eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", list === "query" ? "pair" : list).eq("grain", grain).eq("start", day))
      .collect();
    const sums = new Map<string, number>();
    // A page list holds each address once, as a reference (`holdPageRefs.ts`): read back as the app does.
    for (const record of records) {
      // A line's keywords are places in its month's book (`searchConsoleKeywordBooks.ts`): read back as the app does.
      const keys = typeof record.keys === "string" ? await lineKeywordsInQuery(ctx, siteId, undefined, record.start, record.keys)
        : list === "page" ? await decodePages(ctx, siteId, record.keys) : record.keys;
      const clicks = unpackNumbers(record.clicks);
      keys.forEach((key, index) => sums.set(key, (sums.get(key) ?? 0) + clicks[index]));
    }
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
  useFixedDay();
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
    // What the account granted before stays: adding Analytics never takes Search Console away.
    expect(google.searchParams.get("include_granted_scopes")).toBe("true");
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
    });
    expect(await accountOfSite(t, siteId)).toBe("owner@acme-shop.test");
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
    // Numbers are stored packed as text (`packNumbers`): read back as the app reads them.
    const lists = (await t.run(async (ctx) => await ctx.db.query("searchConsoleLists").collect())).map((record) => unpackedPart(record));
    expect(lists.filter((record) => record.start === NEWEST && record.searchType === "web").map((record) => record.list).sort())
      .toEqual(["appearance", "country", "device", "page", "pair"]);
    expect(lists.every((record) => record.grain === "DAY" && record.part === 0)).toBe(true);
    const pair = lists.find((record) => record.list === "pair" && record.start === NEWEST)!;
    // Each page address kept once: the pair's lines point to it (`holdPageRefs.ts`).
    expect(pair.pages).toEqual(["~0", "~0"]);
    expect(await t.run(async (ctx) => await decodePages(ctx, siteId, pair.pages!))).toEqual(["https://acme-shop.test/", "https://acme-shop.test/"]);
    // Position kept as a sum weighted by impressions: 3.5 for each of 50 impressions.
    expect(pair.positionSums).toEqual([175, 105]);

    const runs = await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect());
    expect(runs[0]).toMatchObject({ kind: "DAILY", fromDay: "2026-09-20", toDay: NEWEST });
    expect(runs.at(-1)).toMatchObject({ fromDay: "2026-06-29" });
    expect(runs.every((run) => run.kind === "DAILY" && run.finishedAt !== undefined && run.error === undefined)).toBe(true);
  });

  test("when each search and page was first and last shown is kept, for web search, all countries (store less round two, F)", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);
    const seen = await t.run(async (ctx) => await ctx.db.query("searchConsoleSeen").withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined)).collect());
    // Web results carry no kind of result, as every row held before the others were kept (drift fixes, 2026-10-03).
    expect(seen.map((entry) => `${entry.searchType ?? "web"} ${entry.kind} ${entry.key} ${entry.firstDay} ${entry.lastDay}`).sort()).toEqual([
      "web page https://acme-shop.test/ 2026-09-26 2026-09-26",
      "web query emergency plumber 2026-09-26 2026-09-26",
      "web query plumber leeds 2026-09-25 2026-09-26",
    ]);
    expect(seen.filter((entry) => entry.searchType === "web")).toEqual([]);
  });

  test("only the searches kept are kept: clicked, in the top 20, or on two pages or more (store less round two, D)", async () => {
    const { t, siteId, admin } = await setup();
    const page = (path: string) => `https://acme-shop.test${path}`;
    fakeGoogle({ figures: { "sc-domain:acme-shop.test": { web: { [NEWEST]: {
      total: row("", 5, 400),
      pair: [
        { key: "plumber leeds", page: page("/"), clicks: 5, impressions: 100, position: 30 },
        { key: "almost there", page: page("/"), clicks: 0, impressions: 100, position: 12 },
        { key: "two pages", page: page("/"), clicks: 0, impressions: 50, position: 40 },
        { key: "two pages", page: page("/boilers/"), clicks: 0, impressions: 50, position: 45 },
        { key: "deep and lonely", page: page("/"), clicks: 0, impressions: 100, position: 35 },
      ],
      page: [row(page("/"), 5, 350), row(page("/boilers/"), 0, 50)],
    } } } } });
    await signIn(t, admin, siteId);
    await collect(t);
    const kept = await t.run(async (ctx) => {
      const lines = (await ctx.db.query("searchConsoleLists").collect())
        .filter((record) => record.list === "pair" && record.searchType === "web" && record.start === NEWEST && record.country === undefined);
      // Each keyword held once in its month's book, the line its place (keep-less-history-plan.md, part 8.3).
      expect(lines.every((record) => typeof record.keys === "string")).toBe(true);
      return await Promise.all(lines.map(async (record) => await lineKeywordsInQuery(ctx, siteId, undefined, record.start, record.keys)));
    });
    expect(kept.flat().sort()).toEqual(["almost there", "plumber leeds", "two pages", "two pages"]);
    const seen = await t.run(async (ctx) => (await ctx.db.query("searchConsoleSeen").collect()).filter((entry) => entry.kind === "query").map((entry) => entry.key));
    expect(seen).not.toContain("deep and lonely");
  });

  test("the ready-made periods are built after each run: searches from the pairs, with their pages", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);
    const thirty = (await t.run(async (ctx) => await Promise.all((await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "query").eq("period", "30").eq("which", "NOW"))
      // Read back as text: a list holds places in its build's book (core-data-normalisation-plan.md §5.1).
      .collect()).map(async (part) => await periodPartAsText(ctx, part)))));
    expect(thirty).toHaveLength(1);
    expect(thirty[0]).toMatchObject({ from: "2026-08-28", to: NEWEST, keys: ["plumber leeds", "emergency plumber"], clicks: [9, 3], counts: [1, 1], tops: ["https://acme-shop.test/", "https://acme-shop.test/"] });
    // The thirty days before are held, and had nothing: kept as held and empty, so the change reads as nothing gained.
    const before = await t.run(async (ctx) => await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "query").eq("period", "30").eq("which", "BEFORE"))
      .collect());
    // No rows: an empty list of places in the build's book, packed, is "" (core-data-normalisation-plan.md §5.1).
    expect(before.map((part) => part.keys.length)).toEqual([0]);
    // One search's pages and one page's searches keep no period before (store less round two, E).
    for (const list of ["pair", "pairByPage"] as const) {
      const pairsBefore = await t.run(async (ctx) => await ctx.db
        .query("searchConsolePeriods")
        .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", list).eq("period", "30").eq("which", "BEFORE"))
        .collect());
      expect(pairsBefore).toEqual([]);
    }
    // Twelve months of a website held for 90 days is the 90 days: kept once, its own slot only saying its days (finish-off plan 2E).
    const year = await t.run(async (ctx) => await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "page").eq("period", "365").eq("which", "NOW"))
      .collect());
    expect(year).toEqual([expect.objectContaining({ from: "2026-06-29", to: NEWEST, keys: [] })]);
    // And read as the 90 days, which it is.
    const listed = (from: string) => admin.query(api.searchConsoleLists.searchConsoleListPage, { siteId, searchType: "web", dimension: "page", from, to: NEWEST, page: 1, rows: 25 });
    const twelveMonths = await listed(shiftDay(NEWEST, -364));
    expect(twelveMonths.rows.map((one: { key: string }) => one.key)).toEqual(["https://acme-shop.test/"]);
    expect(twelveMonths.rows).toEqual((await listed("2026-06-29")).rows);
    // Google Images keeps no searches (store less round two, A): its keyword list says so; its pages still list.
    const images = (dimension: "query" | "page") => admin.query(api.searchConsoleLists.searchConsoleListPage, { siteId, searchType: "image", dimension, from: "2026-06-29", to: NEWEST, page: 1, rows: 25 });
    expect(await images("query")).toMatchObject({ noSearches: true, preparing: false, rows: [] });
    expect((await images("page")).noSearches).toBeUndefined();
    // The days, weeks and months the Position bands and Brand charts read: the website has no brand words yet, so every click is the rest's.
    const charted = await t.run(async (ctx) => await ctx.db
      .query("searchConsoleWeeks")
      .withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web"))
      .collect());
    const shown = (grain: string) => charted.filter((row) => row.grain === grain && row.top3 + row.top10 + row.top20 + row.rest > 0);
    expect(shown("WEEK").map((week) => [week.week, week.top3, week.top10, week.brandClicks, week.otherClicks])).toEqual([["2026-09-21", 0, 2, 0, 12]]);
    // Each day of the 60 kept (keep-less-history-plan.md, part 3); a first collection's weeks and months over all its 90.
    expect(charted.filter((row) => row.grain === "DAY")).toHaveLength(60);
    expect(charted.filter((row) => row.grain === "MONTH").map((month) => [month.week, month.days])).toEqual([
      ["2026-06-01", 2], ["2026-07-01", 31], ["2026-08-01", 31], ["2026-09-01", 26],
    ]);
    expect(shown("MONTH").map((month) => [month.week, month.top10, month.otherClicks])).toEqual([["2026-09-01", 2, 12]]);
    // Discover has no searches: no pairs or searches kept for it.
    const discover = await t.run(async (ctx) => await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "discover").eq("list", "query"))
      .collect());
    expect(discover).toEqual([]);
  });

  test("the 90 days are asked of Google a week at a time, and add up to what it shows (keep-less-history-plan.md, part 3)", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    // A keyword book for a month no kept day is in, as one left from June would be (part 8.3).
    await t.mutation(internal.searchConsoleKeywordBooks.addToBook, { holdId: siteId, month: "2026-06", keywords: ["old keyword"] });
    await collect(t);
    const asks = google.calls
      .filter((call) => call.url.endsWith("/searchAnalytics/query"))
      .map((call) => JSON.parse(call.body) as { startDate: string; endDate: string; dimensions: string[] });
    // The searches and pages: never more than a week an ask, so Google's 50,000 rows do not cut them.
    const pairs = asks.filter((ask) => ask.dimensions.join("+") === "query+page" && ask.startDate !== ask.endDate);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((ask) => shiftDay(ask.startDate, 6) >= ask.endDate)).toBe(true);
    const ninety = (await t.run(async (ctx) => await Promise.all((await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "query").eq("period", "90").eq("which", "NOW"))
      // Read back as text: a list holds places in its build's book (core-data-normalisation-plan.md §5.1).
      .collect()).map(async (part) => await periodPartAsText(ctx, part)))));
    expect(ninety).toEqual([expect.objectContaining({ from: "2026-06-29", to: NEWEST, keys: ["plumber leeds", "emergency plumber"], clicks: [9, 3] })]);
    // Its days are held 60 days, the first collection's older ones cleared once it was added up.
    const days = await t.run(async (ctx) => (await ctx.db.query("searchConsoleLists").collect()).map((record) => record.start));
    expect(days.every((day) => day >= "2026-07-29")).toBe(true);
    // And a keyword book only for a month still kept (part 8.3): June's goes with its lines.
    const months = await t.run(async (ctx) => [...new Set((await ctx.db.query("searchConsoleKeywordBooks").collect()).map((record) => record.month))].sort());
    expect(months).toEqual(["2026-09"]);
  });

  test("the pairs are kept in key order both ways, with Pages competing's, Rich results' and Fan-out's own lists (drift fixes, 2026-10-03)", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);
    const slot = async (list: "pair" | "pairByPage" | "competing" | "query" | "appearance", period: "14" | "28" | "30", which: "NOW" | "BEFORE" = "NOW") => (await t.run(async (ctx) => await Promise.all((await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", list).eq("period", period).eq("which", which))
      // Read back as text: a list holds places in its build's book (core-data-normalisation-plan.md §5.1).
      .collect()).map(async (part) => await periodPartAsText(ctx, part)))));
    // One keyword's pages and one page's keywords are not kept (keep-less-history-plan.md, 5.1)…
    expect(await slot("pair", "30")).toEqual([]);
    expect(await slot("pairByPage", "30")).toEqual([]);
    // …but asked of Google when opened, each row's count across the website from the keyword and page lists kept.
    const within = async (kind: "query" | "page", key: string) => {
      const answer = await admin.action(api.searchConsoleLists.searchConsoleLiveList, {
        siteId, searchType: "web", dimension: kind === "query" ? "page" : "query", within: { kind, key }, from: "2026-08-28", to: NEWEST,
      });
      return answer.ok ? answer.rows.flat().map((one) => [one.key, one.count]) : answer.problem;
    };
    expect(await within("page", "https://acme-shop.test/")).toEqual([["plumber leeds", 1], ["emergency plumber", 1]]);
    expect(await within("query", "plumber leeds")).toEqual([["https://acme-shop.test/", 2]]);
    // Every keyword here was shown with one page: none competing, and the one page Google showed counted.
    expect(await slot("competing", "30")).toMatchObject([{ keys: [], shown: 1 }]);
    expect(await slot("competing", "30", "BEFORE")).toEqual([]);
    // Rich results' pages for each kind, counted on the period the screens list only: the one page shown with it.
    expect((await slot("appearance", "30"))[0].counts).toEqual([1]);
    expect((await slot("appearance", "30", "BEFORE"))[0]?.counts).toBeUndefined();
    // Fan-out's 14 and 28 days: web keywords, no period before.
    expect(await slot("query", "14")).toMatchObject([{ from: "2026-09-13", to: NEWEST, keys: ["plumber leeds", "emergency plumber"], clicks: [9, 3] }]);
    expect(await slot("query", "28")).toMatchObject([{ from: "2026-08-30", to: NEWEST }]);
    expect(await slot("query", "28", "BEFORE")).toEqual([]);
  });

  test("lists are added up on a first collection, weekly, after the company's own collection, and when opened behind — not by each nightly fetch", async () => {
    const { t, companyId, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);
    const builtAt = async (period: "7" | "90") => (await t.run(async (ctx) => await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "page").eq("period", period).eq("which", "NOW").eq("part", 0))
      .first()))?.builtAt;
    // A first collection adds its lists up.
    const first = await builtAt("7");
    expect(first).toBeDefined();

    // The next night's fetch brings a new day and adds nothing up.
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    google.figures[property].web["2026-09-27"] = { total: row("", 6, 200), query: [row("drain unblocking", 6)] };
    await collect(t);
    expect(await builtAt("7")).toBe(first);
    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    expect(runs.at(-1)?.finalOutput).toContain("added up weekly, after the company's own collection, and when a screen opens them behind");
    // The weekly sweep finds nothing a week old yet.
    expect(await t.action(internal.searchConsoleSettling.weeklyRebuilds, {})).toBe(0);

    // The company's own collection finishes: its own website's lists are added up — the 7 days, the 90 days not yet a week old.
    const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "SCHEDULE", status: "DONE", plannedCount: 0, reusedCount: 0, sentCount: 0, readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
    } as never));
    expect(await t.mutation(internal.searchConsoleSettling.afterCompanyCollection, { cycleId })).toBe(1);
    await finishScheduled(t);
    const second = await builtAt("7");
    expect(second).toBeGreaterThan(first!);
    expect(await builtAt("90")).toBe(first);

    // A week on, the sweep adds up the website whole.
    vi.setSystemTime(NOW + 8 * 24 * 60 * 60 * 1000);
    expect(await t.action(internal.searchConsoleSettling.weeklyRebuilds, {})).toBe(1);
    await finishScheduled(t);
    expect(await builtAt("90")).toBeGreaterThan(first!);
    // Every job counted and the settle closed.
    expect((await connectionOf(t, siteId))?.settling).toBeUndefined();
  });

  test("a screen whose lists are behind catches them up: the 30 days with the charts, or the 90 days and twelve months (cost review)", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ figures: figures() });
    await signIn(t, admin, siteId);
    await collect(t);
    // A day later a new day comes in, and nothing is added up with it.
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    google.figures[property].web["2026-09-27"] = { total: row("", 6, 200), query: [row("drain unblocking", 6)] };
    await collect(t);
    const newest = "2026-09-27";
    const dates = (days: number) => ({ siteId, from: shiftDay(newest, 1 - days), to: newest });
    const slot = (period: "30" | "90") => t.run(async (ctx) => await Promise.all((await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "query").eq("period", period).eq("which", "NOW"))
      .collect()).map(async (part) => await periodPartAsText(ctx, part))));

    // The 30 days: behind, caught up once however many screens open.
    expect(await admin.query(api.searchConsoleCatchUp.searchConsoleCatchUp, dates(30))).toMatchObject({ behind: true, heldTo: NEWEST, newest });
    expect(await admin.mutation(api.searchConsoleCatchUp.requestSearchConsoleCatchUp, dates(30))).toBe(true);
    expect(await admin.mutation(api.searchConsoleCatchUp.requestSearchConsoleCatchUp, dates(30))).toBe(false);
    await finishScheduled(t);
    expect(await admin.query(api.searchConsoleCatchUp.searchConsoleCatchUp, dates(30))).toMatchObject({ behind: false });
    expect((await slot("30")).map((part) => part.to)).toEqual([newest]);
    // Only the short lists: the 90 days are still behind, and caught up when a screen reads them.
    expect(await admin.query(api.searchConsoleCatchUp.searchConsoleCatchUp, dates(90))).toMatchObject({ behind: true, heldTo: NEWEST });
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000 + 3 * 60 * 1000);
    expect(await admin.mutation(api.searchConsoleCatchUp.requestSearchConsoleCatchUp, dates(90))).toBe(true);
    await finishScheduled(t);
    expect(await admin.query(api.searchConsoleCatchUp.searchConsoleCatchUp, dates(90))).toMatchObject({ behind: false });
    const ninety = await slot("90");
    expect(ninety.map((part) => part.to)).toEqual([newest]);
    expect(ninety[0].keys).toContain("drain unblocking");
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
    const before = google.calls.length;
    await collect(t);

    // Only the days whose totals Google changed are fetched again, list by list (store less round two, 3).
    const listsAsked = google.calls.slice(before).flatMap((call) => {
      if (!call.url.includes("searchAnalytics")) return [];
      const ask = JSON.parse(call.body) as { startDate: string; dimensions: string[] };
      return ask.dimensions[0] === "date" ? [] : [ask.startDate];
    });
    expect([...new Set(listsAsked)].sort()).toEqual([NEWEST, "2026-09-27"]);
    expect(await rowsOf(t, siteId, "query", NEWEST)).toEqual([["plumber leeds", 7]]);
    expect(await rowsOf(t, siteId, "page", NEWEST)).toEqual([]);
    expect(await rowsOf(t, siteId, "query", "2026-09-27")).toEqual([["drain unblocking", 6]]);
    expect(await connectionOf(t, siteId)).toMatchObject({ newestDay: "2026-09-27", oldestDay: "2026-06-29" });
    const runs = await t.run(async (ctx) => await ctx.db.query("searchConsoleRuns").collect());
    expect(runs.at(-1)).toMatchObject({ kind: "DAILY", fromDay: "2026-09-23", toDay: "2026-09-27" });
  });

  test("a website's kept records are read a page at a time, so a busy one never reads too much at once (2026-10-05)", async () => {
    // morehandles.co.uk's pairs, about six records a day of 220 KB, came to 19 MB in one fifteen-day read: its periods were never built.
    const { t, siteId } = await setup();
    await t.run(async (ctx) => {
      for (let day = 1; day <= 30; day += 1) {
        await ctx.db.insert("searchConsoleLists", {
          companyWebsiteId: siteId, searchType: "web", list: "page", grain: "DAY", start: `2026-09-${String(day).padStart(2, "0")}`, part: 0,
          keys: ["/a"], clicks: [day], impressions: [10], positionSums: [20], fetchedAt: 1,
        });
      }
    });
    const read = (cursor: string | null) => t.query(internal.searchConsoleRollups.keptBetween, {
      companyWebsiteId: siteId, searchType: "web", list: "page", grain: "DAY", from: "2026-09-01", to: "2026-09-30", cursor,
    });

    const pages = [];
    for (let cursor: string | null = null; ;) {
      const page = await read(cursor);
      pages.push(page.records.length);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    expect(Math.max(...pages)).toBeLessThanOrEqual(12);
    expect(pages.reduce((sum, count) => sum + count, 0)).toBe(30);
  });

  test("lines past the 60 days kept are cleared, every kind's, with the weeks and months rolled up before 2026-10-07", async () => {
    const { t, siteId } = await setup();
    const put = (searchType: "web" | "image", grain: "DAY" | "WEEK" | "MONTH", start: string) =>
      t.run(async (ctx) => await ctx.db.insert("searchConsoleLists", {
        companyWebsiteId: siteId, searchType, list: "device", grain, start, part: 0, keys: ["MOBILE"], clicks: [1], impressions: [10], positionSums: [20], fetchedAt: 1,
      }));
    // Newest Saturday 2026-09-26: the 60 days kept begin on 29 July (keep-less-history-plan.md, part 3).
    for (const searchType of ["web", "image"] as const) {
      await put(searchType, "DAY", "2026-07-28");
      await put(searchType, "DAY", "2026-07-29");
      await put(searchType, "DAY", NEWEST);
      await put(searchType, "WEEK", "2026-06-01");
      await put(searchType, "MONTH", "2025-09-01");
    }

    for (const searchType of ["web", "image"] as const) {
      while (await t.mutation(internal.searchConsoleRollups.dropOldLines, { companyWebsiteId: siteId, newest: NEWEST, searchType })) { /* until none is left */ }
    }

    const kept = await t.run(async (ctx) => await ctx.db.query("searchConsoleLists").collect());
    expect(kept.map((record) => `${record.searchType} ${record.grain} ${record.start}`).sort()).toEqual([
      "image DAY 2026-07-29", `image DAY ${NEWEST}`, "web DAY 2026-07-29", `web DAY ${NEWEST}`,
    ]);
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
    // Each website's run ends by adding up its periods, as one job per kind of result side by side (cost review 4).
    expect(own.every((run) => lines.some((line) => line.runId === run._id && line.interactionType === "Kept"))).toBe(true);
    expect(own.every((run) => lines.some((line) => line.runId === run._id && line.interactionType === "Added up" && line.responseContent.includes("90-day and 12-month")))).toBe(true);

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
      const token = (await ctx.db.query("googleTokens").withIndex("by_connection", (q) => q.eq("googleConnectionId", blog.googleConnectionId!)).first())!;
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
      tokens: await ctx.db.query("googleTokens").collect(),
      google: await ctx.db.query("googleConnections").collect(),
      days: await ctx.db.query("searchConsoleDays").collect(),
      lists: await ctx.db.query("searchConsoleLists").collect(),
      periods: await ctx.db.query("searchConsolePeriods").collect(),
      seen: await ctx.db.query("searchConsoleSeen").collect(),
      runs: await ctx.db.query("searchConsoleRuns").collect(),
    }));
    expect(left).toEqual({ connections: [], tokens: [], google: [], days: [], lists: [], periods: [], seen: [], runs: [] });
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
