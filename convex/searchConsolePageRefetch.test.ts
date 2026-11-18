import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { unpackNumbers } from "./utils/searchConsolePacks";
import { lineKeywordsInQuery } from "./searchConsoleKeywordBooks";
import { periodPartAsText } from "./searchConsolePeriodReads";

/**
 * Every website's kept page lists fetched again once their figures became
 * every country's (`searchConsolePageRefetch.ts`, 2026-11-17), with Google
 * faked at the network. The UK's pages held only the searches Google names;
 * asked of no country, they hold every click. Only pages are asked, one ask a
 * day kept, never with a country; the website's periods are then built again
 * whole. A busy Google is waited on a few times, never asked in a loop.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");
const NOW = Date.parse("2026-09-27T09:30:00Z");
const NEWEST = "2026-09-26";
const EARLIER = "2026-09-20";
const PROPERTY = "sc-domain:acme-shop.test";
const HOME = "https://acme-shop.test/";
const AI = "https://acme-shop.test/ai/";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Ask = {
  startDate: string;
  endDate: string;
  type: string;
  dimensions: string[];
  startRow: number;
  dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; expression: string }> }>;
};

const countryOf = (ask: Ask) => ask.dimensionFilterGroups?.flatMap((group) => group.filters).find((filter) => filter.dimension === "country")?.expression;

/**
 * Google, faked: every country's pages on each day asked; the United
 * Kingdom's named ones alone when filtered to it, as Google answers. With
 * `busy`, every ask is refused as too many.
 */
function fakeGoogle({ busy = false } = {}) {
  const asks: Ask[] = [];
  const every: Record<string, Array<[string, number]>> = { [NEWEST]: [[HOME, 9], [AI, 5]], [EARLIER]: [[HOME, 6], [AI, 2]] };
  const uk: Record<string, Array<[string, number]>> = { [NEWEST]: [[HOME, 3]], [EARLIER]: [[HOME, 2]] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!/searchAnalytics\/query$/.test(url)) throw new Error(`Unexpected fetch in test: ${url}`);
    const ask = JSON.parse(String(init?.body)) as Ask;
    asks.push(ask);
    if (busy) return new Response("Rate limit exceeded", { status: 429 });
    if (ask.startRow > 0 || ask.type !== "web" || ask.dimensions.join("+") !== "page") return Response.json({});
    const held = countryOf(ask) === "gbr" ? uk : every;
    const sums = new Map<string, number>();
    for (const [day, rows] of Object.entries(held)) {
      if (day < ask.startDate || day > ask.endDate) continue;
      for (const [page, clicks] of rows) sums.set(page, (sums.get(page) ?? 0) + clicks);
    }
    return Response.json({ rows: [...sums].map(([page, clicks]) => ({ keys: [page], clicks, impressions: clicks * 10, ctr: 0.1, position: 4 })) });
  }));
  return asks;
}

/** A connected website holding two web days, each with its UK pages as they were collected before 2026-11-17. */
async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", searchConsoleCountries: ["gbr"], createdAt: 1 });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", mainCountry: "gbr",
      property: PROPERTY, permission: "siteOwner", dataProperty: PROPERTY, newestDay: NEWEST, oldestDay: EARLIER, createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    for (const day of [EARLIER, NEWEST]) {
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day, clicks: 20, impressions: 400, ctr: 0.05, position: 4, namedClicks: 5, fetchedAt: 1 });
    }
    return { siteId, connectionId };
  });
  // The UK's pages, as the nightly collection kept them before (Google's own words for the page; the app numbers it).
  for (const [day, clicks] of [[EARLIER, 2], [NEWEST, 3]] as const) {
    await t.mutation(internal.searchConsoleSync.writeList, {
      connectionId: ids.connectionId, property: PROPERTY, companyWebsiteId: ids.siteId, searchType: "web", list: "page", day, part: 0, fetchedAt: 1,
      keys: [HOME], clicks: [clicks], impressions: [clicks * 10], positionSums: [clicks * 40],
    });
  }
  return { t, ...ids };
}

/** Each day's page clicks as kept. */
const pageClicks = (t: Harness, siteId: Id<"companyWebsites">) => t.run(async (ctx) => {
  const records = await ctx.db.query("searchConsoleLists")
    .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "page").eq("grain", "DAY"))
    .take(50);
  const byDay: Record<string, number> = {};
  for (const record of records) byDay[record.start] = (byDay[record.start] ?? 0) + unpackNumbers(record.clicks).reduce((sum, clicks) => sum + clicks, 0);
  return byDay;
});

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

describe("fetching every website's pages again, of every country", () => {
  test("each day kept is asked for its pages once, of no country, its UK pages replaced; then the periods are built again", async () => {
    const { t, siteId, connectionId } = await setup();
    expect(await pageClicks(t, siteId)).toEqual({ [EARLIER]: 2, [NEWEST]: 3 });
    const asks = fakeGoogle();

    await t.action(internal.searchConsolePageRefetch.refetchPages, {});
    await finishScheduled(t);

    // One ask a day kept, for its pages alone, naming no country. The build after it asks the main country's own pages for
    // each period, its filter on, for Demand by Classification (2026-11-18): This week's one day among them.
    const everyCountry = asks.filter((ask) => countryOf(ask) === undefined);
    const dayAsks = everyCountry.filter((ask) => ask.startDate === ask.endDate);
    expect(dayAsks.map((ask) => `${ask.dimensions.join("+")} ${ask.startDate}`).sort()).toEqual([`page ${EARLIER}`, `page ${NEWEST}`]);
    expect(asks.filter((ask) => ask.dimensions.join("+") === "page").every((ask) => countryOf(ask) === undefined || countryOf(ask) === "gbr")).toBe(true);
    // Every country's pages kept in place of the UK's.
    expect(await pageClicks(t, siteId)).toEqual({ [EARLIER]: 8, [NEWEST]: 14 });

    const state = await t.run(async (ctx) => ({
      connection: await ctx.db.get(connectionId),
      runs: await ctx.db.query("searchConsoleRuns").withIndex("by_hold_started", (q) => q.eq("companyWebsiteId", siteId)).collect(),
      days: await ctx.db.query("searchConsoleDays").withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", siteId)).collect(),
      lastWeek: await ctx.db.query("searchConsolePeriods")
        .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "page").eq("period", "lastWeek").eq("which", "NOW"))
        .first(),
    }));
    // Its asks in the run log, for the next count of Google's allowance; the days' totals untouched.
    expect(state.runs.map((run) => run.requests)).toEqual([2]);
    expect(state.days.map((day) => `${day.day} ${day.clicks} ${day.namedClicks}`)).toEqual([`${EARLIER} 20 5`, `${NEWEST} 20 5`]);
    // The periods built again from the new pages, and the settle ended: last week, as far as it is held, holds the 20th's
    // every-country pages, 8 clicks where the UK's held 2.
    expect(state.connection?.settling).toBeUndefined();
    expect(state.lastWeek).toMatchObject({ from: EARLIER, to: EARLIER });
    expect(unpackNumbers(state.lastWeek!.clicks).reduce((sum, clicks) => sum + clicks, 0)).toBe(8);
  });

  test("a busy Google is waited on three times, then the website is left as it was: never asked in a loop", async () => {
    const { t, siteId, connectionId } = await setup();
    const asks = fakeGoogle({ busy: true });

    await t.action(internal.searchConsolePageRefetch.refetchPages, {});
    await finishScheduled(t);

    // Its first step, tried once and three times more, half an hour apart: two days asked each time at most.
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.length).toBeLessThanOrEqual(8);
    expect(await pageClicks(t, siteId)).toEqual({ [EARLIER]: 2, [NEWEST]: 3 });
    const state = await t.run(async (ctx) => ({
      connection: await ctx.db.get(connectionId),
      runs: await ctx.db.query("searchConsoleRuns").withIndex("by_hold_started", (q) => q.eq("companyWebsiteId", siteId)).collect(),
    }));
    expect(state.runs).toHaveLength(4);
    expect(state.runs.every((run) => run.error?.startsWith("BUSY 429"))).toBe(true);
    expect(state.connection?.settling).toBeUndefined();
  });

  test("a website not connected, or switched off, is left without asking Google", async () => {
    const { t, connectionId } = await setup();
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { switchedOff: true }));
    const asks = fakeGoogle();
    await t.action(internal.searchConsolePageRefetch.refetchPages, {});
    await finishScheduled(t);
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { switchedOff: undefined, status: "NEEDS_RECONNECT" }));
    await t.action(internal.searchConsolePageRefetch.refetchPages, {});
    await finishScheduled(t);
    expect(asks).toEqual([]);
  });
});

/**
 * Google, faked for the searches: each day's searches with their pages in the
 * United Kingdom, the home country they are collected in. "deep and lonely" —
 * no click, place 35, one page — is what the keep rule left out until
 * 18 November 2026.
 */
function fakeGooglePairs() {
  const asks: Ask[] = [];
  const pairs: Record<string, Array<[string, string, number, number, number]>> = {
    [NEWEST]: [["plumber leeds", HOME, 3, 40, 4], ["deep and lonely", AI, 0, 12, 35]],
    [EARLIER]: [["plumber leeds", HOME, 2, 30, 5], ["deep and lonely", HOME, 0, 9, 38]],
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!/searchAnalytics\/query$/.test(url)) throw new Error(`Unexpected fetch in test: ${url}`);
    const ask = JSON.parse(String(init?.body)) as Ask;
    asks.push(ask);
    if (ask.startRow > 0 || ask.type !== "web" || ask.dimensions.join("+") !== "query+page") return Response.json({});
    const sums = new Map<string, { keys: string[]; clicks: number; impressions: number; positionSum: number }>();
    for (const [day, rows] of Object.entries(pairs)) {
      if (day < ask.startDate || day > ask.endDate) continue;
      for (const [search, page, clicks, impressions, position] of rows) {
        const one = sums.get(`${search}|${page}`) ?? { keys: [search, page], clicks: 0, impressions: 0, positionSum: 0 };
        one.clicks += clicks;
        one.impressions += impressions;
        one.positionSum += position * impressions;
        sums.set(`${search}|${page}`, one);
      }
    }
    return Response.json({ rows: [...sums.values()].map((one) => ({ keys: one.keys, clicks: one.clicks, impressions: one.impressions, ctr: one.clicks / one.impressions, position: one.positionSum / one.impressions })) });
  }));
  return asks;
}

/** Each day's searches as kept, read back from their month's book. */
const pairSearches = (t: Harness, siteId: Id<"companyWebsites">) => t.run(async (ctx) => {
  const records = await ctx.db.query("searchConsoleLists")
    .withIndex("by_hold_country_type_list_grain_start", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "pair").eq("grain", "DAY"))
    .take(50);
  const byDay: Record<string, string[]> = {};
  for (const record of records) {
    byDay[record.start] = [...(byDay[record.start] ?? []), ...await lineKeywordsInQuery(ctx, siteId, undefined, record.start, record.keys)].sort();
  }
  return byDay;
});

describe("asking the days kept again for every search (the keep rule went on 18 November 2026)", () => {
  test("each day kept is asked once for its searches in the home country, every search kept; New and lost and the named clicks follow, then the periods are built again", async () => {
    const { t, siteId, connectionId } = await setup();
    // The searches as the keep rule left them: the clicked one alone.
    for (const [day, clicks] of [[EARLIER, 2], [NEWEST, 3]] as const) {
      await t.mutation(internal.searchConsoleSync.writeList, {
        connectionId, property: PROPERTY, companyWebsiteId: siteId, searchType: "web", list: "pair", day, part: 0, fetchedAt: 1,
        keys: ["plumber leeds"], pages: [HOME], clicks: [clicks], impressions: [clicks * 15], positionSums: [clicks * 60],
      });
    }
    expect(await pairSearches(t, siteId)).toEqual({ [EARLIER]: ["plumber leeds"], [NEWEST]: ["plumber leeds"] });
    const asks = fakeGooglePairs();

    await t.action(internal.searchConsolePageRefetch.refetchPairs, { queue: [connectionId] });
    await finishScheduled(t);

    // First, one ask a day kept, for its searches with their pages, in the United Kingdom, and nothing else: then the build
    // after them asks for its long periods, as every build does.
    expect(asks.slice(0, 2).map((ask) => `${ask.dimensions.join("+")} ${ask.startDate} ${ask.endDate} ${countryOf(ask)}`).sort())
      .toEqual([`query+page ${EARLIER} ${EARLIER} gbr`, `query+page ${NEWEST} ${NEWEST} gbr`]);
    // Every search kept, the one the keep rule left out among them.
    expect(await pairSearches(t, siteId)).toEqual({ [EARLIER]: ["deep and lonely", "plumber leeds"], [NEWEST]: ["deep and lonely", "plumber leeds"] });

    const state = await t.run(async (ctx) => ({
      connection: await ctx.db.get(connectionId),
      runs: await ctx.db.query("searchConsoleRuns").withIndex("by_hold_started", (q) => q.eq("companyWebsiteId", siteId)).collect(),
      days: await ctx.db.query("searchConsoleDays").withIndex("by_hold_country_type_day", (q) => q.eq("companyWebsiteId", siteId)).collect(),
      seen: (await ctx.db.query("searchConsoleSeen").collect()).filter((row) => row.kind === "query").map((row) => `${row.key} ${row.firstDay} ${row.lastDay}`).sort(),
      lastWeek: await ctx.db.query("searchConsolePeriods")
        .withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", "web").eq("list", "query").eq("period", "lastWeek").eq("which", "NOW"))
        .first(),
    }));
    // Its asks in the run log; each day's totals Google's own, and the clicks its searches name noted again.
    expect(state.runs.map((run) => run.requests)).toEqual([2]);
    expect(state.days.map((day) => `${day.day} ${day.clicks} ${day.namedClicks}`)).toEqual([`${EARLIER} 20 2`, `${NEWEST} 20 3`]);
    // New and lost's register widened by the searches come back.
    expect(state.seen).toEqual([`deep and lonely ${EARLIER} ${NEWEST}`, `plumber leeds ${EARLIER} ${NEWEST}`]);
    // The periods built again from every search: last week, as far as it is held, the 20th's two searches.
    expect(state.connection?.settling).toBeUndefined();
    const lastWeek = await t.run(async (ctx) => await periodPartAsText(ctx, state.lastWeek!));
    expect(lastWeek.keys).toEqual(["plumber leeds", "deep and lonely"]);
  });
});
