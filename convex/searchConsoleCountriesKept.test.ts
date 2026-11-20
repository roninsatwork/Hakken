import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { periodPartAsText } from "./searchConsolePeriodReads";
import { lineKeywordsInQuery } from "./searchConsoleKeywordBooks";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { unpackNumbers } from "./utils/searchConsolePacks";

/**
 * Home countries only (docs/plans/active/search-console-home-countries-plan.md,
 * 2026-10-06), end to end with Google faked at the network: a run collects the
 * website's main home country with Google's country filter, held without a
 * country — but its list of every country's totals, and every page, asked
 * whole (pages since 2026-11-17, `EVERY_COUNTRY_LISTS`) — then each
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

/** The lists asked of every country, whatever the home country (`EVERY_COUNTRY_LISTS`): the country list, and the pages since 2026-11-17. */
const everyCountry = (ask: Ask) => ask.dimensions.join("+") === "country" || ask.dimensions.join("+") === "page";

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
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED",
      property: PROPERTY, permission: "siteOwner", dataProperty: PROPERTY, newestDay: "2026-09-25", oldestDay: "2026-06-28", createdAt: 1, updatedAt: 1,
      ...(switched ? { mainCountry: countries[0] ?? "gbr" } : {}),
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
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
  // A line's keywords are places in its month's book (`searchConsoleKeywordBooks.ts`): read back as the app does.
  lists: await Promise.all((await ctx.db.query("searchConsoleLists").withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500))
    .map(async (record) => ({ ...record, keys: await lineKeywordsInQuery(ctx, siteId, country, record.start, record.keys) }))),
  // Numbers are stored packed as text (`packNumbers`): read back as the app reads them.
  periods: await Promise.all((await ctx.db.query("searchConsolePeriods").withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", country)).take(500))
    .map(async (part) => await periodPartAsText(ctx, part))),
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

/** Google's sixteen-month line on the tests' day: where the days before collection began are asked from. */
const HISTORY_FROM = "2025-05-26";

describe("collecting the main country and a country kept ready", () => {
  test("the main country is asked with its filter and held without a country, its list of every country asked whole; a country kept beside it gets its whole 90 days; image is never asked", async () => {
    const { t, siteId } = await setup(["gbr", "moz"]);
    const asks = fakeGoogle(figures());
    await collect(t);

    // The main country: only the days since the newest held, and the last four again — every ask filtered to it but its country list.
    // Its collection's days, as its totals by date ask for them: the 90 days and twelve months are asked of Google
    // when its lists are added up (keep-less-history-plan.md, part 3).
    const main = asks.filter((ask) => countryOf(ask) === "gbr");
    // Apart from the days before collection began, asked once back to Google's line (insights-intelligence-plan.md phase 9).
    const history = main.filter((ask) => ask.dimensions[0] === "date" && ask.startDate === HISTORY_FROM);
    expect(history.length).toBeGreaterThan(0);
    const collected = main.filter((ask) => ask.dimensions[0] === "date" && ask.startDate !== HISTORY_FROM);
    expect(collected.map((ask) => `${ask.type} ${ask.startDate}`)).toContain("web 2026-09-22");
    expect(collected.every((ask) => ask.startDate >= "2026-09-22")).toBe(true);
    const whole = asks.filter((ask) => countryOf(ask) === undefined);
    expect(whole.length).toBeGreaterThan(0);
    expect(whole.every(everyCountry)).toBe(true);
    // The pages are every country's, for the main country and the one kept beside it (2026-11-17): Google leaves the
    // searches it keeps private out of a page's figures whenever a country is named. Only the main country's own pages,
    // asked once a period for Demand by Classification (2026-11-18), carry its filter.
    const pageAsks = asks.filter((ask) => ask.dimensions.join("+") === "page");
    expect(pageAsks.some((ask) => countryOf(ask) === undefined)).toBe(true);
    expect(pageAsks.every((ask) => countryOf(ask) === undefined || countryOf(ask) === "gbr")).toBe(true);
    // The country kept beside it: every other ask filtered to it, over its whole 90 days, and never a country list inside it.
    const kept = asks.filter((ask) => countryOf(ask) === "moz");
    expect(kept.every((ask) => !ask.dimensions.includes("country"))).toBe(true);
    expect(kept.filter((ask) => ask.dimensions[0] === "date" && ask.startDate !== HISTORY_FROM).map((ask) => ask.startDate).sort()[0]).toBe(WINDOW_FROM);
    // Then its own days before collection began, back to Google's line, as the main country's (SF3).
    expect(kept.some((ask) => ask.dimensions[0] === "date" && ask.startDate === HISTORY_FROM)).toBe(true);
    // Image search is neither kept nor shown (2026-10-06).
    expect(asks.some((ask) => ask.type === "image")).toBe(false);

    const held = await keptOf(t, siteId, undefined);
    expect(held.days.map((day) => `${day.day} ${day.clicks}`)).toEqual([`${NEWEST} 8`]);
    expect(held.lists.filter((record) => record.list === "pair").map((record) => record.keys.join(","))).toEqual(["plumber leeds,emergency plumber"]);
    // Every country's totals, for Countries and devices.
    expect(held.lists.find((record) => record.list === "country")?.keys).toEqual(["gbr", "moz"]);
    // Every country's pages, each the United Kingdom's and Mozambique's together: 12 clicks, where the UK's pages hold 8.
    const pageClicks = (lists: typeof held.lists, day: string) => lists
      .filter((record) => record.list === "page" && record.start === day)
      .flatMap((record) => unpackNumbers(record.clicks)).reduce((sum, clicks) => sum + clicks, 0);
    expect(pageClicks(held.lists, NEWEST)).toBe(12);
    const moz = await keptOf(t, siteId, "moz");
    expect(pageClicks(moz.lists, NEWEST)).toBe(12);
    expect(moz.days.map((day) => `${day.day} ${day.clicks}`)).toEqual([`${NEWEST} 4`]);
    expect(moz.lists.some((record) => record.list === "country")).toBe(false);

    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "moz", newestDay: NEWEST, oldestDay: WINDOW_FROM, daysFrom: HISTORY_FROM }]);
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
    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "moz", newestDay: "2026-09-27", oldestDay: WINDOW_FROM, daysFrom: HISTORY_FROM }]);
  });

  test("settling builds each home country's ready-made periods, and New and lost for each", async () => {
    const { t, siteId } = await setup(["moz", "gbr"]);
    fakeGoogle(figures());
    await collect(t);

    const gbr = await keptOf(t, siteId, "gbr");
    const period = (list: string, which: string, span: string) => gbr.periods.find((part) => part.list === list && part.which === which && part.period === span);
    // This month and the last 3 months on Sunday 27 September (sees-header-and-rolling-dates-plan.md).
    expect(period("query", "NOW", "thisMonth")).toMatchObject({ from: "2026-09-01", to: NEWEST, keys: ["plumber leeds", "emergency plumber"], clicks: [5, 3], counts: [1, 1] });
    expect(period("query", "NOW", "last3Months")).toMatchObject({ from: "2026-06-27", keys: ["plumber leeds", "emergency plumber", "boiler repair"] });
    expect(period("device", "NOW", "thisMonth")).toMatchObject({ keys: ["MOBILE", "DESKTOP"], clicks: [6, 2] });
    expect(gbr.periods.some((part) => part.list === "country")).toBe(false);
    expect(gbr.weeks.filter((week) => week.grain === "WEEK" && week.otherClicks > 0).map((week) => [week.week, week.otherClicks])).toEqual([["2026-07-27", 2], ["2026-09-21", 8]]);
    // New and lost, kept for every home country.
    expect(gbr.seen.map((row) => row.key).sort()).toEqual(expect.arrayContaining(["boiler repair", "emergency plumber", "plumber leeds"]));
    expect(gbr.seenDays.length).toBeGreaterThan(0);
    // The main country's periods stand apart: Mozambique's searches only.
    const main = await keptOf(t, siteId, undefined);
    expect(main.periods.find((part) => part.list === "query" && part.which === "NOW" && part.period === "thisMonth")?.keys).toEqual(["ai agency"]);
    expect(main.seen.map((row) => row.key)).toContain("ai agency");
  });
});

describe("reading the home countries", () => {
  test("the main country reads what is held without a country, by its code too, and a country kept ready its own rows; Google is not asked", async () => {
    const { t, siteId, reader } = await setup(["gbr", "moz"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    const thirty = { siteId, searchType: "web" as const, dimension: "query" as const, from: "2026-09-01", to: NEWEST, page: 1, rows: 25 };

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
    // A list asked of Google carries the whole list's own figures, as a ready-made one does: Position bands' eye (2026-11-19).
    expect(list.ok && list.summary?.wholeList?.bandClicks["1-3"]).toBe(list.ok ? list.rows.flat().filter((one) => one.band === "1-3").reduce((sum, one) => sum + one.clicks, 0) : -1);
    const splits = await reader.action(api.searchConsoleLists.searchConsoleKeySplits, {
      siteId, searchType: "web", dimension: "query", key: "plumber leeds", from: "2026-08-28", to: NEWEST,
    });
    expect(splits.ok).toBe(true);
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.filter((ask) => !everyCountry(ask)).every((ask) => countryOf(ask) === "gbr")).toBe(true);
    expect(asks.filter((ask) => ask.dimensions.includes("country")).every((ask) => countryOf(ask) === undefined)).toBe(true);
  });

  test("a list of pages not redone yet is every country's when asked live; the searches beside it stay the main country's", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    const thirty = { siteId, searchType: "web" as const, from: "2026-08-28", to: NEWEST };

    // Shown but not clicked and the rest read every country's pages until they're redone (`EVERY_COUNTRY_LISTS`).
    const list = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, dimension: "page" });
    // Every country's pages: the one only Mozambique was shown too.
    expect(list.ok && list.rows.flat().map((one) => one.key).sort()).toEqual(["https://acme-shop.test/", "https://acme-shop.test/ai/"]);
    const pages = asks.filter((ask) => ask.dimensions.join("+") === "page");
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((ask) => countryOf(ask) === undefined)).toBe(true);
    const searches = asks.filter((ask) => ask.dimensions.join("+") === "query+page");
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((ask) => countryOf(ask) === "gbr")).toBe(true);
  });

  test("Pages follows the country: its live list, a page's days and its devices are the main country's, a page's countries every country's (18 November 2026)", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    const thirty = { siteId, searchType: "web" as const, from: "2026-08-28", to: NEWEST };

    const list = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, dimension: "page", inCountry: true });
    // The United Kingdom's own pages: never the one only Mozambique was shown, and each with its keywords from its searches.
    expect(list.ok && list.rows.flat().map((one) => [one.key, one.clicks, one.count, one.top])).toEqual([["https://acme-shop.test/", 8, 2, "plumber leeds"]]);
    const page = { ...thirty, dimension: "page" as const, key: "https://acme-shop.test/" };
    const splits = await reader.action(api.searchConsoleLists.searchConsoleKeySplits, page);
    expect(splits.ok && splits.devices.map((one) => [one.key, one.clicks])).toEqual([["MOBILE", 6], ["DESKTOP", 2]]);
    // A row's clicks and its own screen's are the same country's.
    expect(await reader.action(api.searchConsoleLists.searchConsoleKeySeries, page)).toMatchObject({ ok: true, totals: { clicks: 8 } });

    const namesPage = (ask: Ask) => ask.dimensionFilterGroups?.some((group) => group.filters.some((filter) => filter.dimension === "page")) ?? false;
    const ofPages = asks.filter((ask) => (ask.dimensions.join("+") === "page" || namesPage(ask)) && !ask.dimensions.includes("country"));
    expect(ofPages.length).toBeGreaterThan(0);
    expect(ofPages.every((ask) => countryOf(ask) === "gbr")).toBe(true);
    // Where a page's clicks came from by country is every country's, as on Countries and devices.
    const byCountry = asks.filter((ask) => ask.dimensions.join("+") === "country");
    expect(byCountry).toHaveLength(1);
    expect(countryOf(byCountry[0])).toBeUndefined();
  });

  test("Pages asked live without each page's keywords: Google's pairs aren't asked, and the download asks them apart, the same keywords and top one (speed fixes, 18 November 2026)", async () => {
    const { t, siteId, reader } = await setup(["gbr"]);
    const asks = fakeGoogle(figures());
    await collect(t);
    asks.length = 0;
    const thirty = { siteId, searchType: "web" as const, from: "2026-08-28", to: NEWEST };
    const pairsAsked = () => asks.filter((ask) => ask.dimensions.join("+") === "query+page");

    const apart = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, dimension: "page", inCountry: true, keywordsApart: true });
    expect(apart.ok && apart.keywordsApart).toBe(true);
    expect(apart.ok && apart.rows.flat().map((one) => [one.key, one.clicks, one.count, one.top])).toEqual([["https://acme-shop.test/", 8, null, null]]);
    expect(pairsAsked()).toEqual([]);
    // The figures are the same as with the keywords beside them.
    const whole = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...thirty, dimension: "page", inCountry: true });
    expect(whole.ok && whole.keywordsApart).toBeUndefined();
    expect(whole.ok && apart.ok && whole.summary).toEqual(apart.ok && apart.summary);
    expect(whole.ok && whole.rows.flat().map((one) => [one.key, one.clicks, one.impressions, one.position])).toEqual(apart.ok && apart.rows.flat().map((one) => [one.key, one.clicks, one.impressions, one.position]));
    // A list of pages never asks for the pairs of the dates before: no list of pages reads them.
    expect(pairsAsked().length).toBeGreaterThan(0);
    expect(pairsAsked().every((ask) => ask.startDate === thirty.from)).toBe(true);

    asks.length = 0;
    const keywords = await reader.action(api.searchConsoleLiveAsks.searchConsoleLivePageKeywords, thirty);
    expect(keywords.ok && keywords.pages.flat()).toEqual([{ key: "https://acme-shop.test/", count: 2, top: "plumber leeds" }]);
    // The country's own searches, as the list's, both of Google's pages asked at once.
    expect(pairsAsked().map((ask) => [countryOf(ask), ask.startRow])).toEqual([["gbr", 0], ["gbr", 25_000]]);
    // Another company's reader is told the website isn't connected, and Google isn't asked.
    asks.length = 0;
    const rival = t.withIdentity({ subject: await t.run(async (ctx) => await ctx.db.insert("users", {
      name: "Rival", email: "rival@rival.test", role: "USER", companyId: await ctx.db.insert("companies", { name: "Rival", createdAt: 1 }), createdAt: 1,
    })) });
    expect(await rival.action(api.searchConsoleLiveAsks.searchConsoleLivePageKeywords, thirty)).toEqual({ ok: false, problem: "NOT_CONNECTED" });
    expect(asks).toEqual([]);
  });

  test("Countries and devices keep the dates before: each country's and device's clicks then, every country's total and the countries clicked; a ticked country's days are its own (2026-11-18)", async () => {
    const { t, siteId, connectionId, reader } = await setup(["gbr"]);
    // Nothing held yet, so the run collects the whole 90 days, the same days last month among them.
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { newestDay: undefined, oldestDay: undefined }));
    const held = figures();
    held.all.web["2026-08-20"] = { total: row("", 9, 300), country: [row("gbr", 5), row("moz", 1), row("irl", 3)], device: [row("MOBILE", 6), row("DESKTOP", 3)] };
    held.gbr.web["2026-08-20"] = { total: row("", 5, 120), device: [row("MOBILE", 4), row("DESKTOP", 1)] };
    const asks = fakeGoogle(held);
    await collect(t);
    asks.length = 0;
    const month = { siteId, searchType: "web" as const, from: "2026-09-01", to: NEWEST, period: "thisMonth" as const };

    const countries = await reader.query(api.searchConsoleLists.searchConsoleSplitList, { ...month, dimension: "country" });
    expect(countries.comparable).toBe(true);
    expect(countries.rows.map((one) => [one.key, one.clicks, one.previousClicks, one.change])).toEqual([["gbr", 8, 5, 3], ["moz", 4, 1, 3]]);
    // Every country the dates before held, Ireland too, though Google showed the website there no more.
    expect(countries.summary).toMatchObject({ clicks: 12, beforeTotals: { clicks: 9 }, clickedRows: 2, clickedBefore: 3 });
    const devices = await reader.query(api.searchConsoleLists.searchConsoleSplitList, { ...month, dimension: "device" });
    expect(devices.rows.map((one) => [one.key, one.clicks, one.previousClicks])).toEqual([["MOBILE", 6, 4], ["DESKTOP", 2, 1]]);
    expect(asks).toEqual([]);

    // A country ticked onto the chart: its own days, the dates before in the same ask, filtered to it alone.
    const series = await reader.action(api.searchConsoleLists.searchConsoleKeySeries, { ...month, dimension: "country", key: "moz" });
    expect(series).toMatchObject({ ok: true, totals: { clicks: 4 } });
    expect(asks).toHaveLength(1);
    expect(asks[0].dimensionFilterGroups?.flatMap((group) => group.filters)).toEqual([{ dimension: "country", operator: "equals", expression: "moz" }]);
    await expect(reader.action(api.searchConsoleLists.searchConsoleKeySeries, { ...month, dimension: "country", key: "GBR" })).rejects.toThrow("not a country Google names");
  });

  test("a finished long period settled before countries and devices kept their dates before asks Google for those two lists alone, once (2026-11-18)", async () => {
    const { t, siteId, connectionId } = await setup(["gbr"]);
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { newestDay: undefined, oldestDay: undefined }));
    const asks = fakeGoogle(figures());
    await collect(t);
    // Last month is August; what it is set against, July, is past the 60 days kept: asked of Google, and settled.
    const july = (list: string) => t.run(async (ctx) => (await ctx.db.query("searchConsolePeriods").withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", list as "country").eq("period", "lastMonth").eq("which", "BEFORE")).collect()));
    const kept = [...(await july("country")), ...(await july("device"))];
    expect(kept.map((part) => [part.list, part.from, part.to])).toEqual([["country", "2026-07-01", "2026-07-31"], ["device", "2026-07-01", "2026-07-31"]]);
    // As a build before 18 November left it: July's pages and searches kept, its countries and devices not.
    await t.run(async (ctx) => {
      for (const part of kept) await ctx.db.delete(part._id);
    });
    asks.length = 0;
    const connection = (await connectionOf(t, siteId))!;
    const token = await t.mutation(internal.searchConsoleSettling.startSettle, { connectionId, parts: 1 });
    await t.action(internal.searchConsoleSettle.settlePart, {
      connectionId, holdId: siteId, token, searchType: "web", newest: connection.newestDay!, oldest: connection.oldestDay!, onlyLong: true, stage: "NINETY",
    });
    await finishScheduled(t);

    expect((await july("country"))[0]).toMatchObject({ from: "2026-07-01", to: "2026-07-31" });
    expect((await july("device"))[0]).toMatchObject({ from: "2026-07-01", to: "2026-07-31" });
    // July's pages and searches stay as they were: only its countries and devices are asked for, once each.
    const ofJuly = asks.filter((ask) => ask.startDate === "2026-07-01" && ask.endDate === "2026-07-31").map((ask) => ask.dimensions.join("+")).sort();
    expect(ofJuly).toEqual(["country", "device"]);
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

/**
 * Demand by Classification (search-console-demand-by-classification-way-2-plan-2026-11-18.md): its figures follow the
 * country menu, so it reads the main home country's own pages, Google's country filter on, kept by the collector for each
 * period and its dates before (`countryPage`). Another country is asked of Google when it's chosen.
 */
describe("Demand by Classification: the home country's own pages (2026-11-18)", () => {
  test("the collector keeps the main country's own pages for each period and its dates before; the read sorts them by Classification and asks Google nothing; another country asks it twice", async () => {
    const { t, siteId, connectionId, reader } = await setup(["gbr", "moz"]);
    // Nothing held yet, so the run collects the whole 90 days.
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { newestDay: undefined, oldestDay: undefined }));
    const held = figures();
    // Google ties 5 of the United Kingdom's 8 clicks to a page: the other 3 are searches it keeps private.
    held.gbr.web[NEWEST] = { ...held.gbr.web[NEWEST], page: [row("https://acme-shop.test/", 5)] };
    held.gbr.web["2026-08-20"] = { total: row("", 5, 120), page: [row("https://acme-shop.test/boilers/", 3)] };
    held.all.web["2026-08-20"] = { total: row("", 5, 120), page: [row("https://acme-shop.test/boilers/", 3)] };
    const boilers = await t.run(async (ctx) => {
      const id = await ctx.db.insert("pageClassifications", { companyWebsiteId: siteId, name: "Boilers", type: "SERVICE", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: siteId, classificationId: id, kind: "CONTAINS", value: "/boilers/", createdAt: 1 });
      const ai = await ctx.db.insert("pageClassifications", { companyWebsiteId: siteId, name: "AI", type: "SERVICE", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: siteId, classificationId: ai, kind: "CONTAINS", value: "/ai/", createdAt: 1 });
      return { id, ai };
    });
    const asks = fakeGoogle(held);
    await collect(t);

    // Asked of Google with the main country's filter, never with the country kept beside it: those are asked when chosen.
    const ofPages = asks.filter((ask) => ask.dimensions.join("+") === "page");
    expect(ofPages.some((ask) => countryOf(ask) === "gbr" && ask.startDate === "2026-09-01" && ask.endDate === NEWEST)).toBe(true);
    expect(ofPages.some((ask) => countryOf(ask) === "moz")).toBe(false);
    const main = await keptOf(t, siteId, undefined);
    const kept = (which: string) => main.periods.find((part) => part.list === "countryPage" && part.period === "thisMonth" && part.which === which);
    expect(kept("NOW")).toMatchObject({ from: "2026-09-01", to: NEWEST, keys: ["https://acme-shop.test/"], clicks: [5] });
    expect(kept("BEFORE")).toMatchObject({ from: "2026-08-01", to: "2026-08-26", clicks: [5] });
    expect((await keptOf(t, siteId, "moz")).periods.some((part) => part.list === "countryPage")).toBe(false);

    asks.length = 0;
    const month = { siteId, from: "2026-09-01", to: NEWEST, period: "thisMonth" as const };
    const demand = await reader.query(api.searchConsoleDemand.searchConsoleDemand, month);
    expect(demand).toMatchObject({ live: false, from: "2026-09-01", to: NEWEST, comparable: true });
    expect(demand.live === false && demand.rows).toEqual([
      // The home page is in no Classification yet; Boilers was shown only the month before.
      { kind: "NOT_SORTED", clicks: 5, impressions: 50, clicksBefore: 0, impressionsBefore: 0, pages: 1 },
      { kind: boilers.id, clicks: 0, impressions: 0, clicksBefore: 5, impressionsBefore: 50, pages: 0 },
    ]);
    // An address naming the main country by its code reads the same; other dates and another country are asked of Google.
    expect(await reader.query(api.searchConsoleDemand.searchConsoleDemand, { ...month, country: "gbr" })).toEqual(demand);
    expect(await reader.query(api.searchConsoleDemand.searchConsoleDemand, { siteId, from: "2026-09-02", to: NEWEST })).toEqual({ live: true });
    expect(await reader.query(api.searchConsoleDemand.searchConsoleDemand, { ...month, country: "moz" })).toEqual({ live: true });
    expect(asks).toEqual([]);

    // Mozambique: its pages for the dates and the dates before, one ask each, its filter on.
    const live = await reader.action(api.searchConsoleDemand.searchConsoleLiveDemand, { ...month, country: "moz" });
    expect(live).toEqual({ ok: true, from: "2026-09-01", to: NEWEST, comparable: true, rows: [{ kind: boilers.ai, clicks: 4, impressions: 40, clicksBefore: 0, impressionsBefore: 0, pages: 1 }] });
    // Asked side by side, so in either order.
    expect(asks.map((ask) => [ask.dimensions.join("+"), countryOf(ask), ask.startDate, ask.endDate]).sort()).toEqual([
      ["page", "moz", "2026-08-01", "2026-08-26"],
      ["page", "moz", "2026-09-01", NEWEST],
    ]);
    // Another company's reader is refused.
    const rival = t.withIdentity({ subject: await t.run(async (ctx) => await ctx.db.insert("users", {
      name: "Rival", email: "rival@rival.test", role: "USER", companyId: await ctx.db.insert("companies", { name: "Rival", createdAt: 1 }), createdAt: 1,
    })) });
    await expect(rival.query(api.searchConsoleDemand.searchConsoleDemand, month)).rejects.toThrow("not one your company holds");
    expect(await rival.action(api.searchConsoleDemand.searchConsoleLiveDemand, month)).toEqual({ ok: false, problem: "NOT_CONNECTED" });
  });
});

/**
 * Pages (search-console-pages-way-1-plan-2026-11-17.md, "Follows the country menu — 18 November 2026"): its list reads the
 * same kept pages as Demand by Classification (`countryPage`), each with its keywords and top one from the country's own
 * searches, for its download. Another country, another kind of result, or other dates are asked of Google with the
 * country's filter (`searchConsoleLiveList`, `inCountry`).
 */
describe("Pages: the home country's own pages (2026-11-18)", () => {
  test("Pages reads the main country's kept pages with their keywords and asks Google nothing; another country, News and other dates are asked of it", async () => {
    const { t, siteId, connectionId, reader } = await setup(["gbr", "moz"]);
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { newestDay: undefined, oldestDay: undefined }));
    const held = figures();
    // Google ties 5 of the United Kingdom's 8 clicks to a page: the other 3 are searches it keeps private.
    held.gbr.web[NEWEST] = { ...held.gbr.web[NEWEST], page: [row("https://acme-shop.test/", 5)] };
    const asks = fakeGoogle(held);
    await collect(t);
    asks.length = 0;

    const dates = { siteId, searchType: "web" as const, dimension: "page" as const, from: "2026-09-01", to: NEWEST, period: "thisMonth" as const };
    const month = { ...dates, page: 1, rows: 25 };
    const pages = await reader.query(api.searchConsoleLists.searchConsoleListPage, { ...month, inCountry: true });
    expect(pages).toMatchObject({ live: false, preparing: false, from: "2026-09-01", to: NEWEST, comparable: true, summary: { clicks: 5 } });
    expect(pages.rows.map((one) => [one.key, one.clicks, one.count, one.top])).toEqual([["https://acme-shop.test/", 5, 2, "plumber leeds"]]);
    // The download the same: its keywords and top one beside each page.
    const file = await reader.action(api.searchConsoleLists.exportSearchConsoleList, {
      ...dates, inCountry: true, headers: ["Page", "Clicks", "Keywords", "Top keyword"], fields: ["key", "clicks", "count", "top"],
    });
    expect(file.csv.split("\n")).toEqual(["Page,Clicks,Keywords,Top keyword", "https://acme-shop.test/,5,2,plumber leeds"]);
    // The screens not redone yet still read every country's pages.
    const every = await reader.query(api.searchConsoleLists.searchConsoleListPage, month);
    expect(every.rows.map((one) => [one.key, one.clicks])).toEqual([["https://acme-shop.test/", 8], ["https://acme-shop.test/ai/", 4]]);
    expect(asks).toEqual([]);
    // The main country by its code reads the same; a country kept beside it, News and other dates are asked of Google.
    expect((await reader.query(api.searchConsoleLists.searchConsoleListPage, { ...month, inCountry: true, country: "gbr" })).rows).toEqual(pages.rows);
    for (const other of [{ country: "moz" }, { searchType: "news" as const }, { from: "2026-09-02", period: undefined }]) {
      expect(await reader.query(api.searchConsoleLists.searchConsoleListPage, { ...month, inCountry: true, ...other })).toMatchObject({ live: true, rows: [] });
    }
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
    expect(asks.filter((ask) => !everyCountry(ask)).every((ask) => countryOf(ask) === "gbr")).toBe(true);
    // The collection's days from its 90-day window; the days before it asked once back to Google's line (phase 9).
    expect(asks.filter((ask) => ask.dimensions[0] === "date" && ask.startDate !== HISTORY_FROM).map((ask) => ask.startDate).sort()[0]).toBe(WINDOW_FROM);
    expect((await keptOf(t, siteId, undefined)).days.map((day) => `${day.searchType} ${day.day} ${day.clicks}`)).toEqual(["web 2026-08-01 2", `web ${NEWEST} 8`]);
  });

  test("a website holding nothing yet notes its main country and is collected at once; with no countries listed, its place's country", async () => {
    const { t, siteId, connectionId } = await setup([], false);
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { newestDay: undefined, oldestDay: undefined }));
    const asks = fakeGoogle(figures());
    await collect(t);
    expect(await connectionOf(t, siteId)).toMatchObject({ mainCountry: "gbr", newestDay: NEWEST });
    expect(asks.filter((ask) => !everyCountry(ask)).every((ask) => countryOf(ask) === "gbr")).toBe(true);
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
      await ctx.db.insert("searchConsolePeriods", { companyWebsiteId: siteId, country: "irl", searchType: "web", list: "query", period: "thisMonth", which: "NOW", part: 0, from: "2026-09-01", to: "2026-09-25", ...packed, builtAt: 1 });
      await ctx.db.insert("searchConsoleWeeks", { companyWebsiteId: siteId, country: "irl", searchType: "web", week: "2026-09-14", top3: 1, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 1, builtAt: 1 });
      await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, country: "irl", kind: "query", key: "plumber dublin", firstDay: "2026-09-20", lastDay: "2026-09-20" });
      await ctx.db.insert("searchConsoleSeenDays", { companyWebsiteId: siteId, country: "irl", kind: "query", day: "2026-09-20", first: 1, last: 1, builtAt: 1 });
    });
    const asks = fakeGoogle(figures());
    await collect(t);

    expect(await keptOf(t, siteId, "irl")).toEqual({ days: [], lists: [], periods: [], weeks: [], seen: [], seenDays: [] });
    expect(asks.some((ask) => countryOf(ask) === "irl")).toBe(false);
    expect(asks.some((ask) => countryOf(ask) === "moz")).toBe(true);
    expect((await connectionOf(t, siteId))?.countriesHeld).toEqual([{ country: "moz", newestDay: NEWEST, oldestDay: WINDOW_FROM, daysFrom: HISTORY_FROM }]);
  });
});
