import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { unpackedPart } from "./utils/searchConsolePacks";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Home countries only (docs/plans/active/search-console-home-countries-plan.md,
 * 2026-10-06), end to end with Google faked at the network: a run collects the
 * website's main home country with Google's country filter, held without a
 * country — but its list of every country's totals, asked whole — then each
 * country kept ready beside it, a country new to the list over the whole 90
 * days, and settles each. Image search is never asked. New and lost is kept for
 * every home country. A website whose figures were all countries' is cleared
 * at its next run and collected for its main country at the one after; a live
 * ask naming no country is of the main one. A country past the limit is
 * cleared when a run starts.
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

/** The country an ask is filtered to; undefined for one asked whole. */
const countryOf = (ask: Ask) => ask.dimensionFilterGroups?.flatMap((group) => group.filters).find((filter) => filter.dimension === "country")?.expression;

/** The website's figures: all of them (asked with no filter), the United Kingdom's — its main country — and Mozambique's. */
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
 * A company's website, connected, its main country's days held up to the day
 * before Google's newest — so a run asks it for its last few days only — and
 * its home countries those given, the first its main one; with `switched`
 * false, its figures held are from before 2026-10-06, all countries'.
 */
async function setup(countries: string[], switched = true) {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Reader", email: "reader@acme-shop.test", role: "USER", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", searchConsoleCountries: countries, createdAt: 1 });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", googleAccount: "owner@acme-shop.test",
      property: PROPERTY, permission: "siteOwner", dataProperty: PROPERTY, newestDay: "2026-09-25", oldestDay: "2026-06-28", createdAt: 1, updatedAt: 1,
      ...(switched ? { mainCountry: countries[0] ?? "gbr" } : {}),
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
  // Numbers are stored packed as text (`packNumbers`): read back as the app reads them.
  periods: (await ctx.db.query("searchConsolePeriods").withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500)).map((part) => unpackedPart(part)),
  weeks: await ctx.db.query("searchConsoleWeeks").withIndex("by_hold_country_type_week", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
  seen: await ctx.db.query("searchConsoleSeen").withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
  seenDays: await ctx.db.query("searchConsoleSeenDays").withIndex("by_hold_country_type_kind_day", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500),
}));

beforeEach(() => {
  useFixedDay();
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

describe("collecting the main country and a country kept ready", () => {
  test("the main country is asked with its filter and held without a country, its list of every country asked whole; a country kept beside it gets its whole 90 days; image is never asked", async () => {
    const { t, siteId } = await setup(["gbr", "moz"]);
    const asks = fakeGoogle(figures());
    await collect(t);

    // The main country: only the days since the newest held, and the last four again — every ask filtered to it but its country list.
    // Its collection's days, as its totals by date ask for them: the 90 days and twelve months are asked of Google
    // when its lists are added up (keep-less-history-plan.md, part 3).
    const main = asks.filter((ask) => countryOf(ask) === "gbr");
    const collected = main.filter((ask) => ask.dimensions[0] === "date");
    expect(collected.map((ask) => `${ask.type} ${ask.startDate}`)).toContain("web 2026-09-22");
    expect(collected.every((ask) => ask.startDate >= "2026-09-22")).toBe(true);
    const whole = asks.filter((ask) => countryOf(ask) === undefined);
    expect(whole.length).toBeGreaterThan(0);
    expect(whole.every((ask) => ask.dimensions.join("+") === "country")).toBe(true);
    // The country kept beside it: every ask filtered to it, over its whole 90 days, and never a country list inside it.
    const kept = asks.filter((ask) => countryOf(ask) === "moz");
    expect(kept.every((ask) => !ask.dimensions.includes("country"))).toBe(true);
    expect(kept.filter((ask) => ask.dimensions[0] === "date").map((ask) => ask.startDate).sort()[0]).toBe(WINDOW_FROM);
    // Image search is neither kept nor shown (2026-10-06).
    expect(asks.some((ask) => ask.type === "image")).toBe(false);

    const held = await keptOf(t, siteId, undefined);
    expect(held.days.map((day) => `${day.day} ${day.clicks}`)).toEqual([`${NEWEST} 8`]);
    expect(held.lists.filter((record) => record.list === "pair").map((record) => record.keys.join(","))).toEqual(["plumber leeds,emergency plumber"]);
    // Every country's totals, for Countries and devices.
    expect(held.lists.find((record) => record.list === "country")?.keys).toEqual(["gbr", "moz"]);
    const moz = await keptOf(t, siteId, "moz");
    expect(moz.days.map((day) => `${day.day} ${day.clicks}`)).toEqual([`${NEWEST} 4`]);
    expect(moz.lists.some((record) => record.list === "country")).toBe(false);

    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "moz", newestDay: NEWEST, oldestDay: WINDOW_FROM }]);
    const runs = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    const own = runs.find((run) => run.title === "Search Console: acme-shop.test")!;
    expect(own.status).toBe("SUCCESS");
    expect(own.objective).toContain("in United Kingdom (GBR)");
    expect(own.finalOutput).toContain("Mozambique (MOZ)");
  });

  test("the next run asks a country kept ready for its newest days and the last four again, as the main one", async () => {
    const { t, siteId } = await setup(["gbr", "moz"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    await collect(t);
    const kept = asks.filter((ask) => countryOf(ask) === "moz");
    expect(kept.filter((ask) => ask.dimensions[0] === "date" && ask.type === "web").map((ask) => `${ask.startDate} ${ask.endDate}`)).toEqual(["2026-09-23 2026-09-27"]);
    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "moz", newestDay: "2026-09-27", oldestDay: WINDOW_FROM }]);
  });

  test("settling builds each home country's ready-made periods, and New and lost for each", async () => {
    const { t, siteId } = await setup(["moz", "gbr"]);
    fakeGoogle(figures());
    await collect(t);

    const gbr = await keptOf(t, siteId, "gbr");
    const period = (list: string, which: string, span: string) => gbr.periods.find((part) => part.list === list && part.which === which && part.period === span);
    expect(period("query", "NOW", "30")).toMatchObject({ from: "2026-08-28", to: NEWEST, keys: ["plumber leeds", "emergency plumber"], clicks: [5, 3], counts: [1, 1] });
    expect(period("query", "NOW", "90")).toMatchObject({ from: WINDOW_FROM, keys: ["plumber leeds", "emergency plumber", "boiler repair"] });
    expect(period("device", "NOW", "30")).toMatchObject({ keys: ["MOBILE", "DESKTOP"], clicks: [6, 2] });
    expect(gbr.periods.some((part) => part.list === "country")).toBe(false);
    expect(gbr.weeks.filter((week) => week.grain === "WEEK" && week.otherClicks > 0).map((week) => [week.week, week.otherClicks])).toEqual([["2026-07-27", 2], ["2026-09-21", 8]]);
    // New and lost, kept for every home country.
    expect(gbr.seen.map((row) => row.key).sort()).toEqual(expect.arrayContaining(["boiler repair", "emergency plumber", "plumber leeds"]));
    expect(gbr.seenDays.length).toBeGreaterThan(0);
    // The main country's periods stand apart: Mozambique's searches only.
    const main = await keptOf(t, siteId, undefined);
    expect(main.periods.find((part) => part.list === "query" && part.which === "NOW" && part.period === "30")?.keys).toEqual(["ai agency"]);
    expect(main.seen.map((row) => row.key)).toContain("ai agency");
  });
});

describe("reading the home countries", () => {
  test("the main country reads what is held without a country, by its code too, and a country kept ready its own rows; Google is not asked", async () => {
    const { t, siteId, reader } = await setup(["gbr", "moz"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    const thirty = { siteId, searchType: "web" as const, dimension: "query" as const, from: "2026-08-28", to: NEWEST, page: 1, rows: 25 };

    expect(await reader.query(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId })).toEqual({ main: "gbr", ready: ["moz"] });
    // Only the kinds of result the website was shown in are its tabs: here web alone, so no switch.
    await t.run(async (ctx) => await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "video", day: NEWEST, clicks: 0, impressions: 0, ctr: 0, position: 0, fetchedAt: 1 }));
    expect((await reader.query(api.searchConsoleConnect.searchConsoleStatus, { siteId }))?.kinds).toEqual(["web"]);
    const main = await reader.query(api.searchConsoleLists.searchConsoleListPage, thirty);
    expect(main.rows.map((one) => [one.key, one.clicks])).toEqual([["plumber leeds", 5], ["emergency plumber", 3]]);
    // An address naming the main country reads the same.
    expect((await reader.query(api.searchConsoleLists.searchConsoleListPage, { ...thirty, country: "gbr" })).rows).toEqual(main.rows);
    const moz = await reader.query(api.searchConsoleLists.searchConsoleListPage, { ...thirty, country: "moz" });
    expect(moz).toMatchObject({ live: false, preparing: false, total: 1 });
    expect(moz.rows.map((one) => [one.key, one.clicks])).toEqual([["ai agency", 4]]);

    const { page: _page, rows: _rows, ...split } = thirty;
    // Every country's totals, on the main country's Countries and devices.
    const countries = await reader.query(api.searchConsoleLists.searchConsoleSplitList, { ...split, dimension: "country" });
    expect(countries.rows.map((one) => [one.key, one.clicks])).toEqual([["gbr", 8], ["moz", 4]]);
    const devices = await reader.query(api.searchConsoleLists.searchConsoleSplitList, { ...split, dimension: "device" });
    expect(devices.rows.map((one) => [one.key, one.clicks])).toEqual([["MOBILE", 6], ["DESKTOP", 2]]);

    const days = await reader.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-08-01", to: NEWEST, country: "moz" });
    expect(days).toMatchObject({ live: false, totals: { clicks: 4 } });
    const newLost = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "week", country: "moz", page: 1, rows: 25 });
    expect(newLost.notKept).toBe(false);
    expect(newLost.rows.map((one) => one.key)).toContain("ai agency");
    // Only web search keeps New and lost.
    expect(await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "video", from: "2026-08-28", to: NEWEST, step: "week", page: 1, rows: 25 }))
      .toMatchObject({ notKept: true, rows: [] });

    expect(asks).toEqual([]);
  });

  test("a live ask naming no country is of the main one; the countries of one keyword stay every country", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    const thirty = { siteId, searchType: "web" as const, dimension: "query" as const, from: "2026-08-28", to: NEWEST };

    const list = await reader.action(api.searchConsoleLists.searchConsoleLiveList, thirty);
    expect(list.ok && list.rows.flat().map((one) => one.key).sort()).toEqual(["emergency plumber", "plumber leeds"]);
    const splits = await reader.action(api.searchConsoleLists.searchConsoleKeySplits, {
      siteId, searchType: "web", dimension: "query", key: "plumber leeds", from: "2026-08-28", to: NEWEST,
    });
    expect(splits.ok).toBe(true);
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.filter((ask) => !ask.dimensions.includes("country")).every((ask) => countryOf(ask) === "gbr")).toBe(true);
    expect(asks.filter((ask) => ask.dimensions.includes("country")).every((ask) => countryOf(ask) === undefined)).toBe(true);
  });

  test("a country kept ready before its first collection is on its way; one not kept says so", async () => {
    const { t, siteId, reader } = await setup(["gbr", "moz"]);
    fakeGoogle(figures());
    const newLost = { siteId, searchType: "web" as const, from: "2026-08-28", to: NEWEST, step: "week" as const, page: 1, rows: 25 };
    const chart = { siteId, searchType: "web" as const, from: "2026-08-28", to: NEWEST, step: "week" as const };
    expect(await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { ...newLost, country: "moz" })).toMatchObject({ preparing: true, rows: [] });
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, { ...chart, country: "moz" })).toMatchObject({ periods: [], notReady: false, preparing: true });
    await collect(t);
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, { ...chart, country: "irl" })).toMatchObject({ periods: [], notReady: true, preparing: false });
    expect((await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, chart)).notReady).toBe(false);
  });

  test("another company's website is refused, and a code Google does not name is refused", async () => {
    const { t, siteId, reader } = await setup(["gbr", "moz"]);
    const asks = fakeGoogle(figures());
    const rival = t.withIdentity({ subject: await t.run(async (ctx) => await ctx.db.insert("users", {
      name: "Rival", email: "rival@rival.test", role: "USER", companyId: await ctx.db.insert("companies", { name: "Rival", createdAt: 1 }), createdAt: 1,
    })) });
    const thirty = { siteId, searchType: "web" as const, dimension: "query" as const, from: "2026-08-28", to: NEWEST };

    await expect(rival.query(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId })).rejects.toThrow("not one your company holds");
    await expect(rival.query(api.searchConsoleLists.searchConsoleListPage, { ...thirty, country: "moz", page: 1, rows: 25 })).rejects.toThrow("not one your company holds");
    await expect(rival.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, country: "moz" })).rejects.toThrow("not one your company holds");
    expect(await rival.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, country: "moz" })).toEqual({ ok: false, problem: "NOT_CONNECTED" });

    await expect(reader.query(api.searchConsoleLists.searchConsoleListPage, { ...thirty, country: "xyz", page: 1, rows: 25 })).rejects.toThrow("not a country Google names");
    await expect(reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, country: "GBR" })).rejects.toThrow("not a country Google names");
    expect(asks).toEqual([]);
  });
});

describe("switching to the main home country (2026-10-06)", () => {
  test("a website whose figures were all countries' is cleared at its next run, and its main country's 90 days collected straight after", async () => {
    const { t, siteId } = await setup(["gbr"], false);
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day: "2026-09-25", clicks: 12, impressions: 400, ctr: 0.03, position: 3, fetchedAt: 1 });
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "image", day: "2026-09-25", clicks: 2, impressions: 90, ctr: 0.02, position: 9, fetchedAt: 1 });
    });
    const asks = fakeGoogle(figures());

    await collect(t);
    expect(await connectionOf(t, siteId)).toMatchObject({ mainCountry: "gbr", newestDay: NEWEST });
    // The all-countries and image days cleared; a run started once they were gone collected the main country whole.
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.filter((ask) => !ask.dimensions.includes("country")).every((ask) => countryOf(ask) === "gbr")).toBe(true);
    expect(asks.filter((ask) => ask.dimensions[0] === "date").map((ask) => ask.startDate).sort()[0]).toBe(WINDOW_FROM);
    expect((await keptOf(t, siteId, undefined)).days.map((day) => `${day.searchType} ${day.day} ${day.clicks}`)).toEqual(["web 2026-08-01 2", `web ${NEWEST} 8`]);
  });

  test("a website holding nothing yet notes its main country and is collected at once; with no countries listed, its place's country", async () => {
    const { t, siteId, connectionId } = await setup([], false);
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { newestDay: undefined, oldestDay: undefined }));
    const asks = fakeGoogle(figures());
    await collect(t);
    expect(await connectionOf(t, siteId)).toMatchObject({ mainCountry: "gbr", newestDay: NEWEST });
    expect(asks.filter((ask) => !ask.dimensions.includes("country")).every((ask) => countryOf(ask) === "gbr")).toBe(true);
  });

  test("a main country moved on the Market page is cleared and collected afresh", async () => {
    const { t, siteId } = await setup(["gbr", "moz"]);
    fakeGoogle(figures());
    await collect(t);
    await t.run(async (ctx) => await ctx.db.patch(siteId, { searchConsoleCountries: ["moz", "gbr"] }));
    await collect(t);
    expect(await connectionOf(t, siteId)).toMatchObject({ mainCountry: "moz" });
    expect((await keptOf(t, siteId, undefined)).days.map((day) => `${day.day} ${day.clicks}`)).toEqual([`${NEWEST} 4`]);
    expect((await keptOf(t, siteId, "gbr")).days.map((day) => `${day.day} ${day.clicks}`)).toEqual(["2026-08-01 2", `${NEWEST} 8`]);
  });
});

describe("a country past the limit", () => {
  test("is cleared when a run starts, its held days forgotten, and not collected", async () => {
    const { t, companyId, siteId, connectionId } = await setup(["gbr", "moz", "irl"]);
    await t.run(async (ctx) => {
      await ctx.db.insert("fanOutLimits", { companyId, companyWebsiteId: siteId, consoleCountriesPerSite: 2, updatedAt: 1 });
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
    expect(asks.some((ask) => countryOf(ask) === "moz")).toBe(true);
    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "moz", newestDay: NEWEST, oldestDay: WINDOW_FROM }]);
  });
});
