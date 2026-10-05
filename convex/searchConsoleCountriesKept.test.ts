import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * Countries kept ready (docs/plans/active/search-console-plan.md §16), end
 * to end with Google faked at the network: a run collects each country on
 * the website's list with Google's country filter after all countries — a
 * country new to the list over the whole 90 days — and settles it as all
 * countries are settled; a read of a kept country reads only its rows, any
 * other country is asked of Google live, and what Google cannot answer live
 * says the country is not kept ready. A country past the limit is cleared
 * when a run starts.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");
const NOW = Date.parse("2026-09-27T09:30:00Z");
const NEWEST = "2026-09-26";
/** The first of the 90 days a run fetches with nothing held. */
const WINDOW_FROM = "2026-06-29";
const PROPERTY = "sc-domain:acme-shop.test";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Row = { key: string; clicks: number; impressions: number };
type Pair = Row & { page: string };
type Day = { total: Row; pair?: Pair[]; page?: Row[]; country?: Row[]; device?: Row[]; searchAppearance?: Row[] };
/** What the fake Google holds, per country (`all` for no filter), kind of result and day. */
type Figures = Record<string, Record<string, Record<string, Day>>>;
type Ask = {
  startDate: string;
  endDate: string;
  type: string;
  dimensions: string[];
  startRow: number;
  dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; operator: string; expression: string }> }>;
};

const row = (key: string, clicks: number, impressions = clicks * 10): Row => ({ key, clicks, impressions });
const pair = (key: string, page: string, clicks: number, impressions = clicks * 10): Pair => ({ key, page, clicks, impressions });

/** Google, faked: answers each ask from the figures of the country its filter names, adding up the days asked. */
function fakeGoogle(figures: Figures) {
  const asks: Ask[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!/searchAnalytics\/query$/.test(url)) throw new Error(`Unexpected fetch in test: ${url}`);
    const ask = JSON.parse(String(init?.body)) as Ask;
    asks.push(ask);
    if (ask.startRow > 0) return Response.json({});
    const filters = ask.dimensionFilterGroups?.flatMap((group) => group.filters) ?? [];
    const country = filters.find((filter) => filter.dimension === "country")?.expression ?? "all";
    const days = Object.entries(figures[country]?.[ask.type] ?? {}).filter(([day]) => day >= ask.startDate && day <= ask.endDate);
    const figuresOf = (entry: { clicks: number; impressions: number }) => ({ clicks: entry.clicks, impressions: entry.impressions, ctr: entry.clicks / entry.impressions, position: 3.5 });
    if (ask.dimensions[0] === "date") return Response.json({ rows: days.map(([day, entry]) => ({ keys: [day], ...figuresOf(entry.total) })) });
    const sums = new Map<string, { keys: string[]; clicks: number; impressions: number }>();
    for (const [, entry] of days) {
      const rows = ask.dimensions.length === 2
        ? (entry.pair ?? []).map((one) => ({ keys: [one.key, one.page], clicks: one.clicks, impressions: one.impressions }))
        : (entry[ask.dimensions[0] as "page"] ?? []).map((one) => ({ keys: [one.key], clicks: one.clicks, impressions: one.impressions }));
      for (const one of rows) {
        const held = sums.get(one.keys.join("|"));
        if (held) {
          held.clicks += one.clicks;
          held.impressions += one.impressions;
        } else sums.set(one.keys.join("|"), { ...one });
      }
    }
    return Response.json({ rows: [...sums.values()].map((one) => ({ keys: one.keys, ...figuresOf(one) })) });
  }));
  return asks;
}

/** The asks for one country, and those for all countries. */
const countryOf = (ask: Ask) => ask.dimensionFilterGroups?.flatMap((group) => group.filters).find((filter) => filter.dimension === "country")?.expression;

/** The website's figures: all of them, the United Kingdom's, and Mozambique's (not kept ready). */
function figures(): Figures {
  return {
    all: { web: {
      [NEWEST]: {
        total: row("", 12, 400),
        pair: [pair("plumber leeds", "https://acme-shop.test/", 5), pair("ai agency", "https://acme-shop.test/ai/", 4), pair("emergency plumber", "https://acme-shop.test/", 3)],
        page: [row("https://acme-shop.test/", 8), row("https://acme-shop.test/ai/", 4)],
        country: [row("gbr", 8), row("moz", 4)],
        device: [row("MOBILE", 9), row("DESKTOP", 3)],
      },
    } },
    gbr: { web: {
      [NEWEST]: {
        total: row("", 8, 250),
        pair: [pair("plumber leeds", "https://acme-shop.test/", 5), pair("emergency plumber", "https://acme-shop.test/", 3)],
        page: [row("https://acme-shop.test/", 8)],
        device: [row("MOBILE", 6), row("DESKTOP", 2)],
      },
      // Sixty days back: only a country fetched over its whole 90 days has it.
      "2026-08-01": { total: row("", 2, 60), pair: [pair("boiler repair", "https://acme-shop.test/boilers/", 2)], page: [row("https://acme-shop.test/boilers/", 2)] },
    } },
    moz: { web: {
      [NEWEST]: { total: row("", 4, 150), pair: [pair("ai agency", "https://acme-shop.test/ai/", 4)], page: [row("https://acme-shop.test/ai/", 4)], device: [row("DESKTOP", 4)] },
    } },
  };
}

/**
 * A company's website, connected, its all-countries days held up to the day
 * before Google's newest — so a run asks all countries for its last few days
 * only — and keeping the countries given ready.
 */
async function setup(countries: string[]) {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Reader", email: "reader@acme-shop.test", role: "USER", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", searchConsoleCountries: countries, createdAt: 1 });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", googleAccount: "owner@acme-shop.test",
      property: PROPERTY, permission: "siteOwner", dataProperty: PROPERTY, newestDay: "2026-09-25", oldestDay: "2026-06-28", createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("searchConsoleTokens", {
      connectionId, accessTokenCiphertext: await encryptConnectorToken("ya29.stored"), refreshTokenCiphertext: await encryptConnectorToken("1//refresh"),
      expiresAt: Date.now() + 3_000_000, scopes: [], createdAt: 1, updatedAt: 1,
    });
    return { companyId, userId, siteId, connectionId };
  });
  return { t, ...ids, reader: t.withIdentity({ subject: ids.userId }) };
}

/** One Collector run, to its end: the website's own run, collected and settled. */
async function collect(t: Harness) {
  const runId = await t.run(async (ctx) => {
    const agentId = await ctx.db.insert("agents", {
      name: "Search Console: Collector Agent", modelId: "model-test", thinkingMode: false, isActive: true,
      systemKey: "SEARCH_CONSOLE_COLLECTOR", createdAt: 1, updatedAt: 1,
    });
    return await ctx.db.insert("agentRuns", { agentId, triggerType: "SCHEDULE", objective: "Collect", status: "QUEUED", startedAt: 1, updatedAt: 1 });
  });
  await t.action(internal.searchConsoleAgentRun.runSearchConsoleCollectorNow, { runId });
  await finishScheduled(t);
}

const connectionOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first());

/** One country's kept rows (or all countries' with none), every table. */
const keptOf = (t: Harness, siteId: Id<"companyWebsites">, country: string | undefined) => t.run(async (ctx) => ({
  days: await ctx.db.query("searchConsoleDays").withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
  lists: await ctx.db.query("searchConsoleLists").withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
  periods: await ctx.db.query("searchConsolePeriods").withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
  weeks: await ctx.db.query("searchConsoleWeeks").withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
  seen: await ctx.db.query("searchConsoleSeen").withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
  seenDays: await ctx.db.query("searchConsoleSeenDays").withIndex("by_hold_country_type_kind_day", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("collecting a country kept ready", () => {
  test("a run asks Google for the country with its filter and files its rows with the country: a country new to the list gets its whole 90 days", async () => {
    const { t, siteId } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);

    // All countries: only the days since the newest held, and the last four again.
    const all = asks.filter((ask) => countryOf(ask) === undefined);
    expect(all.filter((ask) => ask.dimensions[0] === "date").map((ask) => `${ask.type} ${ask.startDate}`)).toContain("web 2026-09-22");
    expect(all.every((ask) => ask.startDate >= "2026-09-22")).toBe(true);
    // The country: every ask filtered to it, over its whole 90 days, and never a country list inside it.
    const country = asks.filter((ask) => countryOf(ask) !== undefined);
    expect(country.length).toBeGreaterThan(0);
    expect(country.every((ask) => countryOf(ask) === "gbr" && !ask.dimensions.includes("country"))).toBe(true);
    expect(country.filter((ask) => ask.dimensions[0] === "date").map((ask) => ask.startDate).sort()[0]).toBe(WINDOW_FROM);
    expect(country.filter((ask) => ask.dimensions[0] !== "date").map((ask) => ask.dimensions.join("+")).sort())
      .toEqual(["device", "device", "page", "page", "query+page", "query+page", "searchAppearance", "searchAppearance"]);

    const gbr = await keptOf(t, siteId, "gbr");
    expect(gbr.days.map((day) => `${day.day} ${day.clicks}`).sort()).toEqual(["2026-08-01 2", `${NEWEST} 8`]);
    expect(gbr.lists.filter((record) => record.list === "pair").map((record) => `${record.start} ${record.keys.join(",")}`).sort())
      .toEqual(["2026-08-01 boiler repair", `${NEWEST} plumber leeds,emergency plumber`]);
    expect(gbr.lists.some((record) => record.list === "country")).toBe(false);
    // All countries' rows are their own: the United Kingdom's are not among them.
    const everywhere = await keptOf(t, siteId, undefined);
    expect(everywhere.days.map((day) => `${day.day} ${day.clicks}`)).toEqual([`${NEWEST} 12`]);

    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "gbr", newestDay: NEWEST, oldestDay: WINDOW_FROM }]);
    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    const own = runs.find((run) => run.title === "Search Console: acme-shop.test")!;
    expect(own.status).toBe("SUCCESS");
    expect(own.finalOutput).toContain("United Kingdom (GBR)");
  });

  test("the next run asks the country for its newest days and the last four again, as all countries", async () => {
    const { t, siteId } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    await collect(t);
    const country = asks.filter((ask) => countryOf(ask) === "gbr");
    expect(country.filter((ask) => ask.dimensions[0] === "date" && ask.type === "web").map((ask) => `${ask.startDate} ${ask.endDate}`)).toEqual(["2026-09-23 2026-09-27"]);
    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "gbr", newestDay: "2026-09-27", oldestDay: WINDOW_FROM }]);
  });

  test("settling builds the country's ready-made periods and weeks, as all countries'; New and lost is kept for all countries only", async () => {
    const { t, siteId } = await setup(["gbr"]);
    fakeGoogle(figures());
    await collect(t);

    const gbr = await keptOf(t, siteId, "gbr");
    const period = (list: string, which: string, span: string) => gbr.periods.find((part) => part.list === list && part.which === which && part.period === span);
    expect(period("query", "NOW", "30")).toMatchObject({ from: "2026-08-28", to: NEWEST, keys: ["plumber leeds", "emergency plumber"], clicks: [5, 3], counts: [1, 1] });
    expect(period("query", "NOW", "90")).toMatchObject({ from: WINDOW_FROM, keys: ["plumber leeds", "emergency plumber", "boiler repair"] });
    expect(period("device", "NOW", "30")).toMatchObject({ keys: ["MOBILE", "DESKTOP"], clicks: [6, 2] });
    // No country list inside a country.
    expect(gbr.periods.some((part) => part.list === "country")).toBe(false);
    expect(gbr.weeks.filter((week) => week.grain === "WEEK" && week.otherClicks > 0).map((week) => [week.week, week.otherClicks])).toEqual([["2026-07-27", 2], ["2026-09-21", 8]]);
    // New and lost is kept for web search, all countries (store less round two, F): no register of the country's own.
    expect(gbr.seen).toEqual([]);
    expect(gbr.seenDays).toEqual([]);
    // All countries' periods stand apart, with the searches from Mozambique.
    const everywhere = await keptOf(t, siteId, undefined);
    expect(everywhere.periods.find((part) => part.list === "query" && part.which === "NOW" && part.period === "30")?.keys)
      .toEqual(["plumber leeds", "ai agency", "emergency plumber"]);
    const lines = await t.run(async (ctx) => await ctx.db.query("agentLogs").collect());
    expect(lines.map((line) => line.interactionType)).toEqual(expect.arrayContaining(["Kept and added up", "Kept and added up, United Kingdom (GBR)"]));
  });
});

describe("reading one country", () => {
  test("a country kept ready reads only its own rows, and Google is not asked", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    const thirty = { siteId, searchType: "web" as const, dimension: "query" as const, from: "2026-08-28", to: NEWEST, page: 1, rows: 25 };

    expect(await reader.query(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId })).toEqual({ ready: ["gbr"], asAll: [] });
    const uk = await reader.query(api.searchConsoleLists.searchConsoleListPage, { ...thirty, country: "gbr" });
    expect(uk).toMatchObject({ live: false, preparing: false, total: 2 });
    expect(uk.rows.map((one) => [one.key, one.clicks])).toEqual([["plumber leeds", 5], ["emergency plumber", 3]]);
    const everywhere = await reader.query(api.searchConsoleLists.searchConsoleListPage, thirty);
    expect(everywhere.rows.map((one) => one.key)).toEqual(["plumber leeds", "ai agency", "emergency plumber"]);

    const { page: _page, rows: _rows, ...split } = thirty;
    const devices = await reader.query(api.searchConsoleLists.searchConsoleSplitList, { ...split, dimension: "device", country: "gbr" });
    expect(devices.rows.map((one) => [one.key, one.clicks])).toEqual([["MOBILE", 6], ["DESKTOP", 2]]);
    // A country keeps no country list: Google answers it.
    expect((await reader.query(api.searchConsoleLists.searchConsoleSplitList, { ...split, dimension: "country", country: "gbr" })).live).toBe(true);

    const days = await reader.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-08-01", to: NEWEST, country: "gbr" });
    expect(days).toMatchObject({ live: false, totals: { clicks: 10 } });
    expect(days.days.map((day) => day.day)).toEqual(["2026-08-01", NEWEST]);
    const curve = await reader.query(api.searchConsoleChanges.searchConsoleCurve, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, country: "gbr" });
    expect(curve).toMatchObject({ live: false, points: [{ position: 4, keywords: 2, clicks: 8 }] });
    const weeks = await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, { siteId, searchType: "web", country: "gbr", from: "2026-07-01", to: NEWEST, step: "week" });
    expect(weeks).toMatchObject({ notReady: false, preparing: false, notBuilt: false, step: "week" });
    expect(weeks.periods.filter((week) => week.top3 + week.top10 + week.top20 + week.rest > 0).map((week) => week.start)).toEqual(["2026-07-27", "2026-09-21"]);

    const newLost = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "week", country: "gbr", page: 1, rows: 25 });
    // New and lost is kept for web search, all countries (store less round two, F).
    expect(newLost).toMatchObject({ notKept: true, rows: [] });
    const allNewLost = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "week", page: 1, rows: 25 });
    expect(allNewLost.rows.map((one) => one.key)).toContain("ai agency");

    expect(asks).toEqual([]);
  });

  test("any other country is asked of Google live, with the country filter", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    const thirty = { siteId, searchType: "web" as const, dimension: "query" as const, from: "2026-08-28", to: NEWEST };

    expect(await reader.query(api.searchConsoleLists.searchConsoleListPage, { ...thirty, country: "moz", page: 1, rows: 25 })).toMatchObject({ live: true, total: 0 });
    expect(await reader.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, country: "moz" }))
      .toMatchObject({ live: true, days: [], totals: null });
    expect(await reader.query(api.searchConsoleChanges.searchConsoleCurve, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, country: "moz" }))
      .toMatchObject({ live: true, points: [] });
    expect(await reader.query(api.searchConsoleChanges.searchConsoleUpdates, { siteId, searchType: "web", language: "en", country: "moz", from: "2026-06-01", to: NEWEST })).toMatchObject({ live: true, updates: [] });
    expect(asks).toEqual([]);

    const list = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, country: "moz" });
    expect(list.ok && list.rows.flat().map((one) => [one.key, one.clicks])).toEqual([["ai agency", 4]]);
    const days = await reader.action(api.searchConsoleReads.searchConsoleLiveDays, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, country: "moz" });
    expect(days).toMatchObject({ ok: true, totals: { clicks: 4, impressions: 150 }, previous: null, named: null });
    const series = await reader.action(api.searchConsoleLists.searchConsoleKeySeries, {
      siteId, searchType: "web", dimension: "query", key: "ai agency", from: "2026-08-28", to: NEWEST, country: "moz",
    });
    expect(series.ok).toBe(true);
    const splits = await reader.action(api.searchConsoleLists.searchConsoleKeySplits, {
      siteId, searchType: "web", dimension: "query", key: "ai agency", from: "2026-08-28", to: NEWEST, country: "moz",
    });
    expect(splits.ok).toBe(true);
    // Every ask carried the country — but the countries of one keyword, which stay every country.
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.filter((ask) => !(ask.dimensions.length === 1 && ask.dimensions[0] === "country")).every((ask) => countryOf(ask) === "moz")).toBe(true);
    expect(asks.filter((ask) => ask.dimensions[0] === "country").every((ask) => countryOf(ask) === undefined)).toBe(true);
    const dated = asks.find((ask) => ask.dimensions[0] === "date" && !ask.dimensionFilterGroups?.[0].filters.some((filter) => filter.dimension === "query"))!;
    expect(dated).toMatchObject({ startDate: "2026-07-29", endDate: NEWEST });
  });

  test("Google updates in a country not kept ready come from one live ask", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    await t.run(async (ctx) => await ctx.db.insert("googleUpdates", {
      titleEn: "September 2026 spam update", descriptionEn: "Spam.", startedOn: "2026-09-01", finishedOn: "2026-09-05", url: "https://status.search.google.com/", createdAt: 1, updatedAt: 1,
    }));
    asks.length = 0;
    const answer = await reader.action(api.searchConsoleChanges.searchConsoleLiveUpdates, { siteId, searchType: "web", language: "en", country: "moz", from: "2026-06-01", to: NEWEST });
    expect(answer).toMatchObject({ ok: true, from: "2026-06-28", to: NEWEST, updates: [{ title: "September 2026 spam update", state: "done", before: null, after: null }] });
    expect(asks.map((ask) => [ask.dimensions.join("+"), countryOf(ask), ask.startDate, ask.endDate])).toEqual([["date", "moz", "2026-06-28", NEWEST]]);
  });

  test("what Google cannot answer live says the country is not kept ready, or on its way once added", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    fakeGoogle(figures());
    const newLost = { siteId, searchType: "web" as const, from: "2026-08-28", to: NEWEST, step: "week" as const, page: 1, rows: 25 };
    const chart = { siteId, searchType: "web" as const, from: "2026-08-28", to: NEWEST, step: "week" as const };
    // Added, but not yet collected: on its way.
    expect(await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { ...newLost, country: "gbr" })).toMatchObject({ notKept: true, rows: [] });
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, { ...chart, country: "gbr" })).toMatchObject({ periods: [], notReady: false, preparing: true });
    await collect(t);
    expect(await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { ...newLost, country: "moz" })).toMatchObject({ notKept: true, rows: [], total: 0 });
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, { ...chart, country: "moz" })).toMatchObject({ periods: [], notReady: true, preparing: false });
    // All countries, as before.
    expect((await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, chart)).notReady).toBe(false);
  });

  test("another company's website is refused, and a code Google does not name is refused", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    const rival = t.withIdentity({ subject: await t.run(async (ctx) => await ctx.db.insert("users", {
      name: "Rival", email: "rival@rival.test", role: "USER", companyId: await ctx.db.insert("companies", { name: "Rival", createdAt: 1 }), createdAt: 1,
    })) });
    const thirty = { siteId, searchType: "web" as const, dimension: "query" as const, from: "2026-08-28", to: NEWEST };

    await expect(rival.query(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId })).rejects.toThrow("not one your company holds");
    await expect(rival.query(api.searchConsoleLists.searchConsoleListPage, { ...thirty, country: "gbr", page: 1, rows: 25 })).rejects.toThrow("not one your company holds");
    await expect(rival.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, country: "gbr" })).rejects.toThrow("not one your company holds");
    await expect(rival.query(api.searchConsolePeriods.searchConsoleChartFigures, { siteId, searchType: "web", country: "gbr", from: "2026-08-28", to: NEWEST, step: "week" })).rejects.toThrow("not one your company holds");
    expect(await rival.action(api.searchConsoleReads.searchConsoleLiveDays, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, country: "moz" })).toEqual({ ok: false, problem: "NOT_CONNECTED" });
    expect(await rival.action(api.searchConsoleChanges.searchConsoleLiveUpdates, { siteId, searchType: "web", language: "en", country: "moz", from: "2026-08-28", to: NEWEST })).toEqual({ ok: false, problem: "NOT_CONNECTED" });
    expect(await rival.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, country: "moz" })).toEqual({ ok: false, problem: "NOT_CONNECTED" });

    await expect(reader.query(api.searchConsoleLists.searchConsoleListPage, { ...thirty, country: "xyz", page: 1, rows: 25 })).rejects.toThrow("not a country Google names");
    await expect(reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, country: "GBR" })).rejects.toThrow("not a country Google names");
    await expect(reader.action(api.searchConsoleReads.searchConsoleLiveDays, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, country: "zzz" })).rejects.toThrow("not a country Google names");
    expect(asks).toEqual([]);
  });
});

describe("a country nearly all of the searches (2026-10-05)", () => {
  /** Ten days on which the United Kingdom is 95% of the website's showings. */
  function nearlyAll(): Figures {
    const all: Record<string, Day> = {};
    const uk: Record<string, Day> = {};
    for (let back = 0; back < 10; back += 1) {
      const day = new Date(Date.parse(`${NEWEST}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
      all[day] = {
        total: row("", 20, 400),
        pair: [pair("plumber leeds", "https://acme-shop.test/", 19), pair("ai agency", "https://acme-shop.test/ai/", 1)],
        page: [row("https://acme-shop.test/", 19), row("https://acme-shop.test/ai/", 1)],
        country: [row("gbr", 19), row("moz", 1)],
        device: [row("MOBILE", 20)],
      };
      uk[day] = {
        total: row("", 19, 380),
        pair: [pair("plumber leeds", "https://acme-shop.test/", 19)],
        page: [row("https://acme-shop.test/", 19)],
        device: [row("MOBILE", 19)],
      };
    }
    return { all: { web: all }, gbr: { web: uk } };
  }

  test("keeps no search-and-page lines of its own once judged so, and its searches read as all countries'", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const held = nearlyAll();
    const asks = fakeGoogle(held);
    await collect(t);
    // Nothing held to judge by before the first run: the country is collected whole.
    expect((await connectionOf(t, siteId))?.countriesAsAll).toBeUndefined();

    asks.length = 0;
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    // The newest day's figures settle, so its lists are fetched again (a day Google has not changed is not).
    held.gbr.web[NEWEST].total = row("", 19, 381);
    await collect(t);

    expect((await connectionOf(t, siteId))?.countriesAsAll).toEqual(["gbr"]);
    const uk = asks.filter((ask) => countryOf(ask) === "gbr");
    expect(uk.length).toBeGreaterThan(0);
    expect(uk.some((ask) => ask.dimensions.includes("page"))).toBe(false);
    expect(uk.some((ask) => ask.dimensions.includes("device"))).toBe(true);

    // The United Kingdom's searches are all countries' — "ai agency" was searched from Mozambique.
    // The last 30 days, ending on the newest day the second run holds.
    const thirty = { siteId, searchType: "web" as const, dimension: "query" as const, from: "2026-08-29", to: "2026-09-27", page: 1, rows: 25, country: "gbr" };
    const read = await reader.query(api.searchConsoleLists.searchConsoleListPage, thirty);
    expect(read).toMatchObject({ live: false });
    expect(read.rows.map((one: { key: string }) => one.key)).toContain("ai agency");
    expect(await reader.query(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId })).toEqual({ ready: ["gbr"], asAll: ["gbr"] });
  });
});

describe("a country past the limit", () => {
  test("is cleared when a run starts, its held days forgotten, and not collected", async () => {
    const { t, companyId, siteId, connectionId } = await setup(["gbr", "irl"]);
    await t.run(async (ctx) => {
      await ctx.db.insert("fanOutLimits", { companyId, companyWebsiteId: siteId, consoleCountriesPerSite: 1, updatedAt: 1 });
      await ctx.db.patch(connectionId, { countriesHeld: [{ country: "irl", newestDay: "2026-09-25", oldestDay: WINDOW_FROM }] });
      const packed = { keys: ["plumber dublin"], clicks: [1], impressions: [10], positionSums: [30] };
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, country: "irl", searchType: "web", day: "2026-09-20", clicks: 1, impressions: 10, ctr: 0.1, position: 3, fetchedAt: 1 });
      await ctx.db.insert("searchConsoleLists", { companyWebsiteId: siteId, country: "irl", searchType: "web", list: "page", grain: "DAY", start: "2026-09-20", part: 0, ...packed, fetchedAt: 1 });
      await ctx.db.insert("searchConsolePeriods", { companyWebsiteId: siteId, country: "irl", searchType: "web", list: "query", period: "30", which: "NOW", part: 0, from: "2026-08-27", to: "2026-09-25", ...packed, builtAt: 1 });
      await ctx.db.insert("searchConsoleWeeks", { companyWebsiteId: siteId, country: "irl", searchType: "web", week: "2026-09-14", top3: 1, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 1, builtAt: 1 });
      await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, country: "irl", kind: "query", key: "plumber dublin", firstDay: "2026-09-20", lastDay: "2026-09-20" });
      await ctx.db.insert("searchConsoleSeenDays", { companyWebsiteId: siteId, country: "irl", kind: "query", day: "2026-09-20", first: 1, last: 1, builtAt: 1 });
    });
    const asks = fakeGoogle(figures());
    await collect(t);

    expect(await keptOf(t, siteId, "irl")).toEqual({ days: [], lists: [], periods: [], weeks: [], seen: [], seenDays: [] });
    expect(asks.some((ask) => countryOf(ask) === "irl")).toBe(false);
    expect(asks.some((ask) => countryOf(ask) === "gbr")).toBe(true);
    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "gbr", newestDay: NEWEST, oldestDay: WINDOW_FROM }]);
  });
});
