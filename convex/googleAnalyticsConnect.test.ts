import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { decryptConnectorToken } from "./connectorTokenCrypto";
import { finishDueNow, finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Connecting an owned website's Google Analytics, end to end with Google faked
 * at the network (docs/plans/active/google-analytics-plan.md §3), and the one
 * Google sign-in it shares with Search Console (§4.6): the properties listed
 * with the website's first, one chosen, the website's own addresses read, what
 * counts ticked and valued, the other section taking up the same sign-in, an
 * agency's two accounts kept apart, and disconnecting. Nothing here reaches
 * Google.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const NOW = Date.parse("2026-10-09T09:30:00Z");
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const SC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const IDENTITY = "openid https://www.googleapis.com/auth/userinfo.email";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Property = { property: string; displayName: string; streams: string[]; hosts?: Record<string, number> };

type Google = {
  account: string;
  scope: string;
  /** Search Console's properties. */
  sites: { siteUrl: string; permissionLevel: string }[];
  /** Analytics' properties. */
  properties: Property[];
  keyEvents: { eventName: string; defaultValue?: { numericValue: number }; countingMethod?: string }[];
  /** Each key event's count and value sent in the last 30 days. */
  eventFigures: Record<string, [number, number]>;
  /** The next times the key events are asked for, Google's answer instead: busy (503) or not allowed (403). */
  keyEventsFail?: { times: number; status: number };
  /** Each other address's events, as `eventFigures` (conversion-addresses-plan.md): a shop's sales, a copy's. */
  elsewhere?: Record<string, Record<string, [number, number]>>;
  /** The other addresses visitors reach from the website: a page on them has the website as its referrer. */
  reached?: string[];
  calls: { url: string; body: string }[];
};

function fakeGoogle(overrides: Partial<Google> = {}): Google {
  const google: Google = {
    account: "owner@acme-shop.test",
    scope: `${GA_SCOPE} ${SC_SCOPE} ${IDENTITY}`,
    sites: [{ siteUrl: "sc-domain:acme-shop.test", permissionLevel: "siteOwner" }],
    properties: [
      { property: "properties/111", displayName: "Another client", streams: ["https://another.test"] },
      { property: "properties/312456789", displayName: "Acme", streams: ["https://www.acme-shop.test"], hosts: { "www.acme-shop.test": 900, "staging.acme-shop.test": 40, localhost: 3 } },
    ],
    keyEvents: [
      { eventName: "generate_lead" },
      { eventName: "click_tel" },
      { eventName: "sign_up", defaultValue: { numericValue: 10 } },
      { eventName: "scroll" },
    ],
    eventFigures: { generate_lead: [14, 0], click_tel: [6, 0], sign_up: [5, 50], scroll: [1032, 0] },
    calls: [],
    ...overrides,
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    google.calls.push({ url, body });
    if (url === "https://oauth2.googleapis.com/token") {
      if (new URLSearchParams(body).get("grant_type") === "refresh_token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
      return Response.json({ access_token: "ya29.first", refresh_token: `1//refresh-${google.account}`, expires_in: 3599, scope: google.scope });
    }
    if (url === "https://oauth2.googleapis.com/revoke") return new Response("{}", { status: 200 });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json({ email: google.account });
    if (url === "https://searchconsole.googleapis.com/webmasters/v3/sites") return Response.json({ siteEntry: google.sites });
    if (url.startsWith("https://analyticsadmin.googleapis.com/v1beta/accountSummaries")) {
      return Response.json({
        accountSummaries: [{
          displayName: "Acme Ltd",
          propertySummaries: google.properties.map((entry) => ({ property: entry.property, displayName: entry.displayName, propertyType: "PROPERTY_TYPE_ORDINARY" })),
        }],
      });
    }
    const streams = /analyticsadmin\.googleapis\.com\/v1beta\/(properties\/\d+)\/dataStreams/.exec(url);
    if (streams) {
      const entry = google.properties.find((candidate) => candidate.property === streams[1]);
      return Response.json({ dataStreams: (entry?.streams ?? []).map((address) => ({ type: "WEB_DATA_STREAM", webStreamData: { defaultUri: address } })) });
    }
    const keyEvents = /analyticsadmin\.googleapis\.com\/v1beta\/(properties\/\d+)\/keyEvents/.exec(url);
    if (keyEvents && google.keyEventsFail && google.keyEventsFail.times > 0) {
      google.keyEventsFail.times -= 1;
      return new Response(JSON.stringify({ error: { message: google.keyEventsFail.status === 503 ? "The service is currently unavailable." : "User does not have sufficient permissions for this property." } }), { status: google.keyEventsFail.status });
    }
    if (keyEvents) return Response.json({ keyEvents: google.keyEvents });
    const details = /analyticsadmin\.googleapis\.com\/v1beta\/(properties\/\d+)$/.exec(url);
    if (details) return Response.json({ displayName: "Acme", timeZone: "Europe/London", currencyCode: "GBP" });
    const report = /analyticsdata\.googleapis\.com\/v1beta\/(properties\/\d+):runReport$/.exec(url);
    if (report) {
      const ask = JSON.parse(body) as { dimensions: { name: string }[]; metrics: { name: string }[] };
      const entry = google.properties.find((candidate) => candidate.property === report[1]);
      // Each address's events (conversion-addresses-plan.md): the website's own, then each other address's.
      if (ask.dimensions[0].name === "hostName" && ask.dimensions[1]?.name === "eventName") {
        const named = /"fieldName":"eventName","inListFilter":\{"values":(\[[^\]]*\])/.exec(body);
        const only = named ? new Set(JSON.parse(named[1]) as string[]) : null;
        const rows = Object.entries({ "www.acme-shop.test": google.eventFigures, ...google.elsewhere }).flatMap(([host, figures]) => Object.entries(figures)
          .filter(([name]) => !only || only.has(name))
          .map(([name, [count, value]]) => ({
            dimensionValues: [{ value: host }, { value: name }],
            metricValues: ask.metrics.map((metric) => ({ value: String(metric.name === "eventValue" ? value : count) })),
          })));
        return Response.json({ rows, rowCount: rows.length });
      }
      // The other addresses reached from the website: a page there with the website as its referrer.
      if (ask.dimensions[0].name === "hostName" && body.includes("pageReferrer")) {
        const rows = ["www.acme-shop.test", ...(google.reached ?? [])].map((host) => ({ dimensionValues: [{ value: host }], metricValues: [{ value: "25" }] }));
        return Response.json({ rows, rowCount: rows.length });
      }
      if (ask.dimensions[0].name === "hostName") {
        const rows = Object.entries(entry?.hosts ?? {}).map(([host, visits]) => ({ dimensionValues: [{ value: host }], metricValues: [{ value: String(visits) }] }));
        return Response.json({ rows, rowCount: rows.length });
      }
      if (ask.dimensions[0].name === "eventName") {
        const rows = Object.entries(google.eventFigures).map(([name, [count, value]]) => ({
          dimensionValues: [{ value: name }], metricValues: [{ value: String(count) }, { value: String(value) }],
        }));
        return Response.json({ rows, rowCount: rows.length });
      }
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  }));
  return google;
}

const revokes = (google: Google) => google.calls.filter((call) => call.url === "https://oauth2.googleapis.com/revoke");

async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: Date.now() });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    const adminId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { name: "User", email: "user@acme-shop.test", role: "USER", companyId, createdAt: Date.now() });
    return { companyId, websiteId, siteId, adminId, userId };
  });
  return { t, ...ids, admin: t.withIdentity({ subject: ids.adminId }), user: t.withIdentity({ subject: ids.userId }) };
}

type Caller = ReturnType<Harness["withIdentity"]>;

/** Start connecting from a section, and come back from Google with its code, as the browser would. */
async function signIn(t: Harness, admin: Caller, siteId: Id<"companyWebsites">, from: "analytics" | "console" = "analytics", back = "code=auth-code") {
  const { authorizeUrl } = from === "analytics"
    ? await admin.mutation(api.googleAnalyticsConnect.beginGoogleAnalyticsConnect, { siteId })
    : await admin.mutation(api.searchConsoleConnect.beginSearchConsoleConnect, { siteId });
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  const response = await t.fetch(`/api/search-console/oauth/callback?state=${encodeURIComponent(state)}&${back}`);
  await finishScheduled(t);
  return { state, response };
}

const analyticsOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first());
const consoleOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first());
const signIns = (t: Harness) => t.run(async (ctx) => ({
  connections: await ctx.db.query("googleConnections").collect(),
  tokens: await ctx.db.query("googleTokens").collect(),
}));

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
});

describe("connecting a website's Google Analytics", () => {
  test("an admin is sent to Google for Analytics and Search Console at once, keeping what was granted before", async () => {
    const { t, siteId, admin } = await setup();
    const { authorizeUrl } = await admin.mutation(api.googleAnalyticsConnect.beginGoogleAnalyticsConnect, { siteId });
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    expect(state).toMatch(/^google-analytics:/);
    const response = await t.fetch(`/api/search-console/oauth/authorize?state=${encodeURIComponent(state)}`);
    expect(response.status).toBe(302);
    const google = new URL(response.headers.get("Location")!);
    expect(google.searchParams.get("scope")).toBe(`${GA_SCOPE} ${SC_SCOPE} ${IDENTITY}`);
    expect(google.searchParams.get("include_granted_scopes")).toBe("true");
    expect(google.searchParams.get("redirect_uri")).toMatch(/\/api\/search-console\/oauth\/callback$/);
  });

  test("only the company's admins connect, only its own websites", async () => {
    const { t, companyId, siteId, user } = await setup();
    await expect(user.mutation(api.googleAnalyticsConnect.beginGoogleAnalyticsConnect, { siteId })).rejects.toThrow();
    const tracked = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "rival.test", displayHost: "rival.test", firstSeenAt: Date.now() });
      return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "TRACKED", createdAt: Date.now() });
    });
    const rival = t.withIdentity({
      subject: await t.run(async (ctx) => {
        const rivalId = await ctx.db.insert("companies", { name: "Rival", createdAt: Date.now() });
        return await ctx.db.insert("users", { name: "Rival", email: "admin@rival.test", role: "ADMIN", companyId: rivalId, createdAt: Date.now() });
      }),
    });
    await expect(rival.mutation(api.googleAnalyticsConnect.beginGoogleAnalyticsConnect, { siteId })).rejects.toThrow("not one your company holds");
    expect(await rival.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId })).toBeNull();
    expect(await user.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId: tracked })).toMatchObject({ owned: false });
  });

  test("the properties come back with the website's first, its addresses read; Search Console, waiting, takes the same sign-in", async () => {
    const { t, siteId, admin, user } = await setup();
    fakeGoogle();
    const { response } = await signIn(t, admin, siteId);
    expect(response.headers.get("Location")).toBe(`http://localhost:3000/app/analytics/${siteId}/connection`);

    const status = (await user.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))!;
    expect(status.canManage).toBe(false);
    expect(status.connection).toMatchObject({ status: "CHOOSING", googleAccount: "owner@acme-shop.test", sharedWithSearchConsole: true });
    expect(status.connection!.choices.map((choice) => [choice.property, choice.stream])).toEqual([
      ["properties/312456789", "https://www.acme-shop.test"],
      ["properties/111", null],
    ]);
    expect(status.connection!.choices[0]).toMatchObject({ addresses: ["www.acme-shop.test"], others: ["staging.acme-shop.test", "localhost"] });
    expect(JSON.stringify(status)).not.toMatch(/ya29|refresh|google-analytics:/);

    // One sign-in, both ready (§10, Q3): Search Console found its one property and connected.
    expect(await consoleOf(t, siteId)).toMatchObject({ status: "CONNECTED", property: "sc-domain:acme-shop.test" });
    const held = await signIns(t);
    expect(held.connections).toHaveLength(1);
    expect(held.tokens).toHaveLength(1);
    expect(await decryptConnectorToken(held.tokens[0].refreshTokenCiphertext!)).toBe("1//refresh-owner@acme-shop.test");
  });

  test("events that read as enquiries are listed beside the key events, ticked only when no key event is; one counted once a visit is marked", async () => {
    // conversions-back-in-time-plan.md BT1, BT2, BT5: Ronins' "contact" is no key event, yet its forms count from Google's own figures.
    const { t, siteId, admin } = await setup();
    fakeGoogle({
      keyEvents: [{ eventName: "generate_lead", countingMethod: "ONCE_PER_SESSION" }, { eventName: "scroll" }],
      eventFigures: { generate_lead: [14, 0], scroll: [1032, 0], contact: [67, 0], page_view: [5000, 0], ronins_enquiry_sent: [12, 0] },
    });
    await signIn(t, admin, siteId);
    await admin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId, property: "properties/312456789" });
    await finishScheduled(t);
    const listed = (await analyticsOf(t, siteId))!;
    expect(listed.listedWith).toBe("EVENT_COUNT_ADDRESSES");
    expect(listed.events?.map((event) => [event.eventName, event.keyEvent, event.perVisit, event.counted])).toEqual([
      ["generate_lead", true, true, true],
      ["scroll", true, false, false],
      // The most seen first; a key event is ticked, so neither is: a key event built from one is never counted beside it.
      ["contact", false, false, false],
      ["ronins_enquiry_sent", false, false, false],
    ]);
    // With no key event a likely conversion, the enquiry is ticked for the client.
    const quiet = await setup();
    fakeGoogle({ keyEvents: [{ eventName: "scroll" }], eventFigures: { scroll: [1032, 0], contact: [67, 0] } });
    await signIn(quiet.t, quiet.admin, quiet.siteId);
    await quiet.admin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId: quiet.siteId, property: "properties/312456789" });
    await finishScheduled(quiet.t);
    expect((await analyticsOf(quiet.t, quiet.siteId))!.events?.map((event) => [event.eventName, event.counted])).toEqual([["scroll", false], ["contact", true]]);
  });

  test("choosing the property reads what counts: the likely ones ticked, a scroll never, Analytics' values shown; saving connects", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle();
    await signIn(t, admin, siteId);
    await admin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId, property: "properties/312456789" });
    expect((await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))!.connection).toMatchObject({ status: "COUNTING", events: null });
    await finishScheduled(t);

    const counting = (await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))!.connection!;
    expect(counting).toMatchObject({
      status: "COUNTING",
      propertyName: "Acme",
      stream: "https://www.acme-shop.test",
      addresses: ["www.acme-shop.test"],
      otherAddresses: ["staging.acme-shop.test", "localhost"],
      currency: "GBP",
      timeZone: "Europe/London",
    });
    expect(counting.events).toEqual([
      { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 14, keyEvent: true, perVisit: false },
      { eventName: "click_tel", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 6, keyEvent: true, perVisit: false },
      { eventName: "sign_up", counted: false, analyticsValue: 10, hakkenValue: null, lastThirtyDays: 5, keyEvent: true, perVisit: false },
      { eventName: "scroll", counted: false, analyticsValue: null, hakkenValue: null, lastThirtyDays: 1032, keyEvent: true, perVisit: false },
    ]);

    await expect(admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId, events: [{ eventName: "page_view", counted: true, hakkenValue: null }],
    })).rejects.toThrow("not one of the events");
    await expect(admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId, events: [{ eventName: "generate_lead", counted: true, hakkenValue: -5 }],
    })).rejects.toThrow("between 0");

    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId,
      events: [
        { eventName: "generate_lead", counted: true, hakkenValue: 250 },
        { eventName: "click_tel", counted: true, hakkenValue: 150 },
      ],
    });
    const connected = (await analyticsOf(t, siteId))!;
    expect(connected).toMatchObject({ status: "CONNECTED", dataProperty: "properties/312456789" });
    expect(connected.events?.filter((event) => event.counted).map((event) => [event.eventName, event.hakkenValue])).toEqual([
      ["generate_lead", 250], ["click_tel", 150],
    ]);
    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audit.map((entry) => entry.actionType)).toContain("GOOGLE_ANALYTICS_CONNECTED");
    expect(JSON.stringify(audit)).not.toContain("ya29");
  });

  test("a shop on its own address: its sales count, credited beside the website's; a staging copy and a copy of the tag elsewhere never do", async () => {
    // conversion-addresses-plan.md: National Extension College sells every course on store.nec.ac.uk (2026-10-19).
    const { t, siteId, admin } = await setup();
    fakeGoogle({
      keyEvents: [{ eventName: "purchase" }, { eventName: "generate_lead" }],
      eventFigures: { generate_lead: [14, 0], page_view: [5000, 0] },
      elsewhere: {
        "store.acme-shop.test": { purchase: [40, 4000], add_to_cart: [300, 0] },
        "staging.acme-shop.test": { purchase: [2, 0] },
        "copied-theme.example.org": { generate_lead: [5, 0] },
      },
      reached: ["store.acme-shop.test"],
    });
    await signIn(t, admin, siteId);
    await admin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId, property: "properties/312456789" });
    await finishScheduled(t);

    const counting = (await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))!.connection!;
    expect(counting.addressesRead.map((address) => [address.host, address.kind, address.reached, address.counted])).toEqual([
      ["store.acme-shop.test", "SAME_DOMAIN", true, true],
      ["copied-theme.example.org", "OTHER_DOMAIN", false, false],
      ["staging.acme-shop.test", "COPY", false, false],
    ]);
    // The website's own count beside each event, the shop's kept with the shop; Analytics' value from where sales count.
    const purchase = counting.events!.find((event) => event.eventName === "purchase")!;
    expect(purchase).toMatchObject({ lastThirtyDays: 0, analyticsValue: 100, counted: true });
    expect(counting.addressesRead[0].events).toEqual([{ eventName: "purchase", year: 40, month: 40 }]);

    // Saved with the shop unticked: held as the admin's own choice, and nothing else counts.
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId,
      events: [{ eventName: "purchase", counted: true, hakkenValue: null }],
      addresses: [{ host: "store.acme-shop.test", counted: false }],
    });
    const saved = (await analyticsOf(t, siteId))!;
    expect(saved.status).toBe("CONNECTED");
    expect(saved.addressesRead?.find((address) => address.host === "store.acme-shop.test")?.counted).toBe(false);
    await expect(admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId, events: [], addresses: [{ host: "elsewhere.test", counted: true }],
    })).rejects.toThrow("not one of the addresses");

    // Ticked again on the connected website: the figures are collected again, whole, with the shop's.
    await t.run(async (ctx) => { await ctx.db.patch(saved._id, { countedWith: "EVENT_COUNT", collecting: undefined }); });
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, {
      siteId,
      events: [{ eventName: "purchase", counted: true, hakkenValue: null }],
      addresses: [{ host: "store.acme-shop.test", counted: true }],
    });
    const ticked = (await analyticsOf(t, siteId))!;
    expect(ticked.countedWith).toBeUndefined();
    expect(ticked.addressesRead?.find((address) => address.host === "store.acme-shop.test")?.counted).toBeUndefined();
  });

  test("Google failing to list the events: the screen says so and when it asks again, and it asks again by itself until it reads", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ keyEventsFail: { times: 2, status: 503 } });
    await signIn(t, admin, siteId);
    await admin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId, property: "properties/312456789" });
    await finishDueNow(t);

    // Not read: Google's words kept, and the next try 5 minutes on (ga-big-site-reliability-plan.md BR1).
    const failed = (await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))!.connection!;
    expect(failed).toMatchObject({ status: "COUNTING", events: null, problem: "GOOGLE_BUSY" });
    expect(failed.problemDetail).toContain("BUSY 503");
    expect(failed.readAgainAt! - Date.now()).toBeGreaterThan(4 * 60_000);
    expect(failed.readAgainAt! - Date.now()).toBeLessThanOrEqual(5 * 60_000);

    // Asked again by itself — a second failure, 30 minutes on — then read.
    await finishScheduled(t);
    const read = (await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))!.connection!;
    expect(read).toMatchObject({ status: "COUNTING", problem: null, problemDetail: null, readAgainAt: null });
    expect(read.events?.map((event) => event.eventName)).toEqual(["generate_lead", "click_tel", "sign_up", "scroll"]);
    expect(google.calls.filter((call) => call.url.includes("/keyEvents")).length).toBe(3);
  });

  test("an account that can't read the property's events: connect again, and nothing asked again", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ keyEventsFail: { times: 1, status: 403 } });
    await signIn(t, admin, siteId);
    await admin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId, property: "properties/312456789" });
    await finishScheduled(t);

    const stopped = (await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))!.connection!;
    expect(stopped).toMatchObject({ status: "NEEDS_RECONNECT", problem: "NO_ACCESS", readAgainAt: null });
    expect(google.calls.filter((call) => call.url.includes("/keyEvents")).length).toBe(1);
  });

  test("a sign-in with Analytics left unticked keeps nothing and says why", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle({ scope: `${SC_SCOPE} ${IDENTITY}` });
    await signIn(t, admin, siteId);
    expect(await analyticsOf(t, siteId)).toMatchObject({ status: "CONNECTING", attempt: { outcome: "MISSING_SCOPE", account: "owner@acme-shop.test" } });
    expect((await signIns(t)).tokens).toEqual([]);
    expect(revokes(google)).toHaveLength(1);
    expect(await consoleOf(t, siteId)).toBeNull();
  });

  test("an account with no Analytics property says so", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ properties: [] });
    await signIn(t, admin, siteId);
    expect(await analyticsOf(t, siteId)).toMatchObject({ status: "CONNECTING", attempt: { outcome: "NO_PROPERTY" } });
  });
});

describe("one Google sign-in for both sections", () => {
  test("Search Console connected first: adding Analytics with the same account keeps one sign-in, renewed", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ scope: `${SC_SCOPE} ${IDENTITY}` });
    await signIn(t, admin, siteId, "console");
    expect(await consoleOf(t, siteId)).toMatchObject({ status: "CONNECTED" });
    // Search Console's sign-in asked nothing of Analytics, and Analytics was not started.
    expect(await analyticsOf(t, siteId)).toBeNull();
    expect((await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))?.searchConsoleConnected).toBe(true);

    fakeGoogle();
    await signIn(t, admin, siteId);
    const held = await signIns(t);
    expect(held.connections).toHaveLength(1);
    expect(held.tokens).toHaveLength(1);
    expect((await consoleOf(t, siteId))?.googleConnectionId).toBe(held.connections[0]._id);
    expect((await analyticsOf(t, siteId))?.googleConnectionId).toBe(held.connections[0]._id);
    expect(held.connections[0].scopes).toContain(GA_SCOPE);
  });

  test("an agency's Search Console on one account and its client's Analytics on another: both stand", async () => {
    const { t, siteId, admin } = await setup();
    fakeGoogle({ account: "agency@agency.test", scope: `${SC_SCOPE} ${IDENTITY}` });
    await signIn(t, admin, siteId, "console");
    const google = fakeGoogle({ account: "client@acme-shop.test" });
    await signIn(t, admin, siteId);

    const held = await signIns(t);
    expect(held.connections.map((connection) => connection.account).sort()).toEqual(["agency@agency.test", "client@acme-shop.test"]);
    const consoleConnection = (await consoleOf(t, siteId))!;
    const analytics = (await analyticsOf(t, siteId))!;
    expect(consoleConnection.status).toBe("CONNECTED");
    expect(consoleConnection.googleConnectionId).not.toBe(analytics.googleConnectionId);
    expect(revokes(google)).toHaveLength(0);
    expect((await admin.query(api.googleAnalyticsConnect.googleAnalyticsStatus, { siteId }))?.connection?.sharedWithSearchConsole).toBe(false);
  });

  test("disconnecting Analytics leaves Search Console connected and its grant kept; disconnecting both gives it back", async () => {
    const { t, siteId, admin } = await setup();
    const google = fakeGoogle();
    await signIn(t, admin, siteId);
    await admin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId, property: "properties/312456789" });
    await finishScheduled(t);
    await admin.mutation(api.googleAnalyticsConnect.saveWhatCounts, { siteId, events: [] });

    await admin.mutation(api.googleAnalyticsConnect.disconnectGoogleAnalytics, { siteId });
    await finishScheduled(t);
    expect(await analyticsOf(t, siteId)).toMatchObject({ status: "DISCONNECTED" });
    expect(await consoleOf(t, siteId)).toMatchObject({ status: "CONNECTED" });
    expect(revokes(google)).toHaveLength(0);
    expect((await signIns(t)).tokens).toHaveLength(1);

    await admin.mutation(api.searchConsoleConnect.disconnectSearchConsole, { siteId });
    await finishScheduled(t);
    expect(revokes(google)).toHaveLength(1);
    expect(await signIns(t)).toEqual({ connections: [], tokens: [] });
  });

  test("a website no longer held takes its Analytics and its sign-in with it", async () => {
    const { t, siteId, admin, companyId } = await setup();
    const google = fakeGoogle();
    await signIn(t, admin, siteId);
    const superAdmin = t.withIdentity({
      subject: await t.run(async (ctx) => await ctx.db.insert("users", { name: "Super", email: "super@acme-shop.test", role: "SUPER_ADMIN", companyId, createdAt: Date.now() })),
    });
    await superAdmin.mutation(api.websites.removeCompanyWebsite, { id: siteId });
    await finishScheduled(t);
    expect(await analyticsOf(t, siteId)).toBeNull();
    expect(await signIns(t)).toEqual({ connections: [], tokens: [] });
    expect(revokes(google)).toHaveLength(1);
  });
});
