import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * What the Search Console section reads (docs/plans/active/
 * search-console-plan.md §5, §14.3): the company's own websites, a website's
 * figures for the dates chosen, its lists read from the ready-made periods —
 * or asked of Google for other dates — one search's own days, the pages
 * Google showed for it, and the searches and pages it tracks. Google is faked
 * here at the network. None of it reaches another company.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
const NOW = Date.parse("2026-09-27T09:30:00Z");
const PROPERTY = "sc-domain:acme-shop.test";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function person(t: Harness, companyId: Id<"companies">, role: "ADMIN" | "USER" = "USER") {
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

/** A connected site holding the days given, as the collection files them. */
async function connected(
  t: Harness,
  companyId: Id<"companies">,
  siteId: Id<"companyWebsites">,
  held: { oldestDay: string; newestDay: string },
  days: Array<{ day: string; clicks: number; impressions: number; position: number; namedClicks?: number }>,
) {
  await t.run(async (ctx) => {
    const hold = (await ctx.db.get(siteId))!;
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId,
      companyWebsiteId: siteId,
      websiteId: hold.websiteId,
      status: "CONNECTED",
      googleAccount: "owner@acme-shop.test",
      property: PROPERTY,
      permission: "siteOwner",
      dataProperty: PROPERTY,
      ...held,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("searchConsoleTokens", {
      connectionId,
      accessTokenCiphertext: await encryptConnectorToken("ya29.stored"),
      refreshTokenCiphertext: await encryptConnectorToken("1//refresh"),
      expiresAt: Date.now() + 3_000_000,
      scopes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    for (const day of days) {
      await ctx.db.insert("searchConsoleDays", {
        companyWebsiteId: siteId, searchType: "web", day: day.day, clicks: day.clicks, impressions: day.impressions,
        ctr: day.clicks / day.impressions, position: day.position, namedClicks: day.namedClicks, fetchedAt: Date.now(),
      });
    }
  });
}

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

describe("the section's list", () => {
  test("lists the company's own websites alone, with their last thirty days", async () => {
    const t = harness();
    const companyId = await company(t, "Acme");
    const shop = await hold(t, companyId, "acme-shop.test");
    const blog = await hold(t, companyId, "acme-blog.test");
    await hold(t, companyId, "rival-shop.test", "TRACKED");
    await connected(t, companyId, shop, { oldestDay: "2026-08-01", newestDay: "2026-09-26" }, [
      { day: "2026-09-26", clicks: 10, impressions: 100, position: 4 },
      { day: "2026-09-01", clicks: 30, impressions: 300, position: 8 },
      // Before the thirty days.
      { day: "2026-08-20", clicks: 99, impressions: 990, position: 1 },
    ]);

    const sites = await (await person(t, companyId)).query(api.searchConsoleReads.listSearchConsoleSites, {});
    expect(sites.map((site) => site.host).sort()).toEqual(["acme-blog.test", "acme-shop.test"]);
    const connectedSite = sites.find((site) => site.siteId === shop)!;
    expect(connectedSite).toMatchObject({ status: "CONNECTED", from: "2026-08-28", to: "2026-09-26" });
    expect(connectedSite.figures).toEqual({ clicks: 40, impressions: 400, ctr: 0.1, position: 7 });
    expect(sites.find((site) => site.siteId === blog)).toMatchObject({ status: "NOT_CONNECTED", figures: null });
  });
});

describe("performance", () => {
  test("adds the days up, compares with the days before when they are held, and says how much Google names", async () => {
    const t = harness();
    const companyId = await company(t, "Acme");
    const siteId = await hold(t, companyId, "acme-shop.test");
    await connected(t, companyId, siteId, { oldestDay: "2026-09-01", newestDay: "2026-09-26" }, [
      { day: "2026-09-25", clicks: 6, impressions: 200, position: 10, namedClicks: 4 },
      { day: "2026-09-26", clicks: 4, impressions: 100, position: 4, namedClicks: 3 },
      { day: "2026-09-23", clicks: 5, impressions: 50, position: 2, namedClicks: 5 },
    ]);
    const reader = await person(t, companyId);

    const two = await reader.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-09-25", to: "2026-09-26" });
    expect(two.totals).toEqual({ clicks: 10, impressions: 300, ctr: 10 / 300, position: 8 });
    expect(two.named).toBe(7);
    expect(two.days.map((day) => day.day)).toEqual(["2026-09-25", "2026-09-26"]);
    expect(two.previous).toEqual({ clicks: 5, impressions: 50, ctr: 0.1, position: 2 });

    // The days before 1 September are not held: no change to measure.
    const early = await reader.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-09-01", to: "2026-09-26" });
    expect(early.previous).toBeNull();

    await expect(reader.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-09-26", to: "2026-09-01" }))
      .rejects.toThrow("not a range");
    const otherReader = await person(t, await company(t, "Rival"));
    await expect(otherReader.query(api.searchConsoleReads.searchConsolePerformance, { siteId, searchType: "web", from: "2026-09-25", to: "2026-09-26" }))
      .rejects.toThrow("not one your company holds");
  });
});

/** A search, page or split in a ready-made period: its key, clicks, impressions and position, then how many and the top one. */
type PeriodRow = [string, number, number, number, number?, string?];

/** A ready-made period's list, as the collection files it after a run. */
async function period(
  t: Harness,
  siteId: Id<"companyWebsites">,
  list: "query" | "page" | "country",
  span: { period: "7" | "30" | "90" | "365"; which: "NOW" | "BEFORE"; from: string; to: string },
  rows: PeriodRow[],
) {
  const counted = rows.some((row) => row[4] !== undefined);
  await t.mutation(internal.searchConsolePeriods.writePeriodPart, {
    companyWebsiteId: siteId,
    searchType: "web",
    list,
    ...span,
    part: 0,
    keys: rows.map((row) => row[0]),
    clicks: rows.map((row) => row[1]),
    impressions: rows.map((row) => row[2]),
    positionSums: rows.map((row) => row[3] * row[2]),
    ...(counted ? { counts: rows.map((row) => row[4] ?? 0), tops: rows.map((row) => row[5] ?? "") } : {}),
    builtAt: Date.now(),
  });
}

describe("the tables", () => {
  // The last seven days, ending on the newest day held: a ready-made period.
  const range = { searchType: "web" as const, dimension: "query" as const, from: "2026-09-20", to: "2026-09-26" };
  const page = { page: 1, rows: 25 };
  const now = { period: "7" as const, which: "NOW" as const, from: "2026-09-20", to: "2026-09-26" };
  const before = { period: "7" as const, which: "BEFORE" as const, from: "2026-09-13", to: "2026-09-19" };

  async function withSearches() {
    const t = harness();
    const companyId = await company(t, "Acme");
    const siteId = await hold(t, companyId, "acme-shop.test");
    await connected(t, companyId, siteId, { oldestDay: "2026-09-01", newestDay: "2026-09-26" }, [
      { day: "2026-09-26", clicks: 12, impressions: 400, position: 5 },
    ]);
    await period(t, siteId, "query", now, [
      ["plumber leeds", 8, 100, 3, 2, "https://acme-shop.test/plumbers/"],
      ["emergency plumber", 3, 100, 6, 1, "https://acme-shop.test/"],
      ["boiler repair", 1, 10, 9, 1, "https://acme-shop.test/boilers/"],
    ]);
    await period(t, siteId, "query", before, [["plumber leeds", 2, 20, 3, 1, "https://acme-shop.test/plumbers/"]]);
    return { t, companyId, siteId, reader: await person(t, companyId) };
  }

  test("a ready-made period is read by index, then searched, filtered, ordered and paged on the server", async () => {
    const { siteId, reader } = await withSearches();
    const list = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page });
    expect(list).toMatchObject({ preparing: false, live: false, total: 3, named: 12, comparable: true, from: "2026-09-20", to: "2026-09-26" });
    expect(list.rows.map((row) => [row.key, row.clicks, row.impressions, row.position, row.change, row.count, row.top])).toEqual([
      ["plumber leeds", 8, 100, 3, 6, 2, "https://acme-shop.test/plumbers/"],
      ["emergency plumber", 3, 100, 6, 3, 1, "https://acme-shop.test/"],
      ["boiler repair", 1, 10, 9, 1, 1, "https://acme-shop.test/boilers/"],
    ]);
    expect(list.rows[0]).toMatchObject({ previousClicks: 2, previousPosition: 3, ctr: 0.08 });
    expect(list.rows[0].share).toBeCloseTo(8 / 12);
    expect(list.rows[1].previousClicks).toBeNull();

    const byPosition = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page, sort: "position" });
    expect(byPosition.rows.map((row) => row.key)).toEqual(["plumber leeds", "emergency plumber", "boiler repair"]);
    const searched = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page, q: "plum" });
    expect(searched.rows.map((row) => row.key)).toEqual(["plumber leeds", "emergency plumber"]);
    // Every row's clicks still count towards the whole, searched or not.
    expect(searched.named).toBe(12);
    const topTen = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page, band: "4-10" });
    expect(topTen.rows.map((row) => row.key)).toEqual(["emergency plumber", "boiler repair"]);
    const paged = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, page: 2, rows: 2 });
    expect(paged).toMatchObject({ page: 2, pages: 2, total: 3 });
    expect(paged.rows.map((row) => row.key)).toEqual(["boiler repair"]);
  });

  test("a tracked search says so, and the list filters to the tracked or the rest", async () => {
    const { siteId, reader } = await withSearches();
    await reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "query", key: "boiler repair", track: true });
    const all = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page });
    expect(all.rows.map((row) => [row.key, row.tracked])).toEqual([["plumber leeds", false], ["emergency plumber", false], ["boiler repair", true]]);
    const tracked = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page, tracked: "yes" });
    expect(tracked.rows.map((row) => row.key)).toEqual(["boiler repair"]);
    const rest = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page, tracked: "no" });
    expect(rest.rows.map((row) => row.key)).toEqual(["plumber leeds", "emergency plumber"]);
  });

  test("a website connected but not yet added up says its lists are on their way", async () => {
    const t = harness();
    const companyId = await company(t, "Acme");
    const siteId = await hold(t, companyId, "acme-shop.test");
    await connected(t, companyId, siteId, { oldestDay: "2026-09-01", newestDay: "2026-09-26" }, []);
    const list = await (await person(t, companyId)).query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page });
    expect(list).toMatchObject({ preparing: true, live: false, total: 0, rows: [] });
  });

  test("with the period before not held, no change is claimed", async () => {
    const { t, siteId, reader } = await withSearches();
    const ninety = { period: "90" as const, which: "NOW" as const, from: "2026-09-01", to: "2026-09-26" };
    await period(t, siteId, "query", ninety, [["plumber leeds", 20, 300, 4, 2, "https://acme-shop.test/plumbers/"]]);
    const list = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, from: "2026-06-29", ...page });
    // The 90 days count only what is held, and say so.
    expect(list).toMatchObject({ comparable: false, from: "2026-09-01", to: "2026-09-26" });
    expect(list.rows.every((row) => row.change === null && row.previousClicks === null)).toBe(true);
  });

  test("the countries come whole, for a page of several short tables", async () => {
    const { t, siteId, reader } = await withSearches();
    await period(t, siteId, "country", now, [["gbr", 11, 300, 4], ["irl", 1, 100, 8]]);
    const split = await reader.query(api.searchConsoleLists.searchConsoleSplitList, { siteId, ...range, dimension: "country" });
    expect(split.rows.map((row) => [row.key, row.clicks, row.count, row.top])).toEqual([["gbr", 11, null, null], ["irl", 1, null, null]]);
    expect(split.comparable).toBe(false);
  });

  test("other dates are asked of Google when chosen: searches added up from the pairs, against the days before", async () => {
    const { siteId, reader } = await withSearches();
    const twoDays = { ...range, from: "2026-09-25", to: "2026-09-26" };
    expect(await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...twoDays, ...page })).toMatchObject({ live: true, preparing: false, total: 0 });

    const asks: Array<{ startDate: string; endDate: string; dimensions: string[] }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const ask = JSON.parse(String(init?.body)) as { startDate: string; endDate: string; dimensions: string[] };
      asks.push(ask);
      const pair = (query: string, page: string, clicks: number, impressions: number, position: number) =>
        ({ keys: [query, page], clicks, impressions, ctr: clicks / impressions, position });
      return Response.json({ rows: ask.startDate === "2026-09-25"
        ? [pair("plumber leeds", "https://acme-shop.test/plumbers/", 5, 50, 2), pair("plumber leeds", "https://acme-shop.test/", 3, 50, 4), pair("boiler repair", "https://acme-shop.test/boilers/", 1, 10, 9)]
        : [pair("plumber leeds", "https://acme-shop.test/plumbers/", 2, 20, 3)] });
    }));
    const live = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { siteId, ...twoDays });
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    expect(live).toMatchObject({ named: 9, comparable: true, cut: null });
    expect(live.rows.map((row) => [row.key, row.clicks, row.position, row.change, row.count, row.top])).toEqual([
      ["plumber leeds", 8, 3, 6, 2, "https://acme-shop.test/plumbers/"],
      ["boiler repair", 1, 9, 1, 1, "https://acme-shop.test/boilers/"],
    ]);
    expect(asks.map((ask) => `${ask.startDate} ${ask.endDate} ${ask.dimensions.join("+")}`)).toEqual([
      "2026-09-25 2026-09-26 query+page",
      "2026-09-23 2026-09-24 query+page",
    ]);
  });

  test("another company can neither read a list nor have Google asked for one", async () => {
    const { t, siteId } = await withSearches();
    const fetched = vi.fn(async () => Response.json({ rows: [] }));
    vi.stubGlobal("fetch", fetched);
    const otherReader = await person(t, await company(t, "Rival"));
    await expect(otherReader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page })).rejects.toThrow("not one your company holds");
    await expect(otherReader.query(api.searchConsoleLists.searchConsoleSplitList, { siteId, ...range, dimension: "country" })).rejects.toThrow("not one your company holds");
    expect(await otherReader.action(api.searchConsoleLists.searchConsoleLiveList, { siteId, ...range, from: "2026-09-25" })).toEqual({ ok: false, problem: "NOT_CONNECTED" });
    await expect(otherReader.action(api.searchConsoleLists.exportSearchConsoleList, { siteId, ...range, headers: ["Keyword"] })).rejects.toThrow("not one your company holds");
    expect(fetched).not.toHaveBeenCalled();
  });

  test("a download is the whole list in the order on screen, safe to open in a spreadsheet", async () => {
    const { t, siteId, reader } = await withSearches();
    await period(t, siteId, "query", now, [["=cmd", 2, 10, 1], ["plumber leeds", 8, 100, 3]]);
    const file = await reader.action(api.searchConsoleLists.exportSearchConsoleList, { siteId, ...range, headers: ["Keyword", "Clicks", "Change", "Impressions", "CTR", "Position"] });
    expect(file.fileName).toBe("acme-shop.test-search-console-query-2026-09-20-2026-09-26.csv");
    expect(file.csv.split("\n")).toEqual([
      "Keyword,Clicks,Change,Impressions,CTR,Position",
      "plumber leeds,8,6,100,8,3",
      "'=cmd,2,2,10,20,1",
    ]);
  });

  test("a website no longer held takes its lists, periods and tracked searches with it", async () => {
    const { t, siteId, reader } = await withSearches();
    await reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "query", key: "boiler repair", track: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await t.action(internal.searchConsoleConnect.forgetHold, { companyWebsiteId: siteId });
    await finishScheduled(t);
    const left = await t.run(async (ctx) => ({
      periods: (await ctx.db.query("searchConsolePeriods").collect()).length,
      tracked: (await ctx.db.query("searchConsoleTracked").collect()).length,
    }));
    expect(left).toEqual({ periods: 0, tracked: 0 });
  });
});

describe("tracking", () => {
  test("a search or page is ticked onto the website's list and off again, held to its limits", async () => {
    const t = harness();
    const companyId = await company(t, "Acme");
    const siteId = await hold(t, companyId, "acme-shop.test");
    const reader = await person(t, companyId);
    expect(await reader.query(api.searchConsoleTracking.searchConsoleTracking, { siteId })).toEqual({
      keywords: { count: 0, limit: 200 },
      pages: { count: 0, limit: 100 },
    });

    await reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "page", key: " https://acme-shop.test/ ", track: true });
    // Ticking twice keeps one.
    await reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "page", key: "https://acme-shop.test/", track: true });
    expect((await reader.query(api.searchConsoleTracking.searchConsoleTracking, { siteId }))?.pages).toEqual({ count: 1, limit: 100 });
    await reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "page", key: "https://acme-shop.test/", track: false });
    expect((await reader.query(api.searchConsoleTracking.searchConsoleTracking, { siteId }))?.pages).toEqual({ count: 0, limit: 100 });

    // At the limit, one more is refused in words that say where the limit is.
    await t.run(async (ctx) => {
      for (let index = 0; index < 200; index += 1) {
        await ctx.db.insert("searchConsoleTracked", { companyWebsiteId: siteId, kind: "query", key: `search ${index}`, createdAt: Date.now() });
      }
    });
    await expect(reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "query", key: "one more", track: true }))
      .rejects.toThrow("already tracks 200 keywords: its limit in Limits");
    const audits = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audits.map((entry) => entry.actionType)).toEqual(["TRACK_SEARCH_CONSOLE_ITEM", "UNTRACK_SEARCH_CONSOLE_ITEM"]);
  });

  test("a competitor's website has no Search Console list, and another company's is out of reach", async () => {
    const t = harness();
    const companyId = await company(t, "Acme");
    const siteId = await hold(t, companyId, "acme-shop.test");
    const rival = await hold(t, companyId, "rival-shop.test", "TRACKED");
    const reader = await person(t, companyId);
    expect(await reader.query(api.searchConsoleTracking.searchConsoleTracking, { siteId: rival })).toBeNull();
    await expect(reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId: rival, kind: "query", key: "plumber", track: true }))
      .rejects.toThrow("Only the company's own websites");
    const otherReader = await person(t, await company(t, "Rival"));
    await expect(otherReader.query(api.searchConsoleTracking.searchConsoleTracking, { siteId })).rejects.toThrow("not one your company holds");
    await expect(otherReader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "query", key: "plumber", track: true }))
      .rejects.toThrow("not one your company holds");
  });
});

describe("one search", () => {
  test("its own days against the days before, and the pages Google showed for it, asked of Google", async () => {
    const t = harness();
    const companyId = await company(t, "Acme");
    const siteId = await hold(t, companyId, "acme-shop.test");
    await connected(t, companyId, siteId, { oldestDay: "2026-09-01", newestDay: "2026-09-26" }, []);
    const reader = await person(t, companyId);

    const asks: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      asks.push({ url: String(input), body: String(init?.body) });
      const ask = JSON.parse(String(init?.body)) as { dimensions: string[] };
      if (ask.dimensions[0] === "date") {
        return Response.json({ rows: [
          { keys: ["2026-09-26"], clicks: 5, impressions: 50, ctr: 0.1, position: 2 },
          { keys: ["2026-09-23"], clicks: 1, impressions: 10, ctr: 0.1, position: 7 },
          { keys: ["2026-09-25"], clicks: 3, impressions: 50, ctr: 0.06, position: 4 },
        ] });
      }
      return Response.json({ rows: [
        { keys: ["https://acme-shop.test/other/"], clicks: 1, impressions: 20, ctr: 0.05, position: 9 },
        { keys: ["https://acme-shop.test/plumbers/"], clicks: 7, impressions: 80, ctr: 0.0875, position: 2.5 },
      ] });
    }));

    const series = await reader.action(api.searchConsoleLists.searchConsoleKeySeries, {
      siteId, searchType: "web", dimension: "query", key: "plumber leeds", from: "2026-09-25", to: "2026-09-26",
    });
    expect(series.ok).toBe(true);
    if (!series.ok) return;
    expect(series.days.map((day) => [day.day, day.clicks])).toEqual([["2026-09-25", 3], ["2026-09-26", 5]]);
    expect(series.totals).toEqual({ clicks: 8, impressions: 100, ctr: 0.08, position: 3 });
    expect(series.previous).toEqual({ clicks: 1, impressions: 10, ctr: 0.1, position: 7 });
    const dated = JSON.parse(asks[0].body) as { startDate: string; endDate: string; dimensions: string[]; dimensionFilterGroups: unknown };
    expect(dated).toMatchObject({ startDate: "2026-09-23", endDate: "2026-09-26", dimensions: ["date"] });
    expect(dated.dimensionFilterGroups).toEqual([{ filters: [{ dimension: "query", operator: "equals", expression: "plumber leeds" }] }]);

    const pairing = await reader.action(api.searchConsoleReads.searchConsolePairing, {
      siteId, searchType: "web", dimension: "query", key: "plumber leeds", from: "2026-09-25", to: "2026-09-26",
    });
    expect(pairing.ok && pairing.rows.map((row) => [row.key, row.clicks])).toEqual([
      ["https://acme-shop.test/plumbers/", 7],
      ["https://acme-shop.test/other/", 1],
    ]);
    const ask = JSON.parse(asks[1].body) as { dimensions: string[]; dimensionFilterGroups: unknown };
    expect(ask.dimensions).toEqual(["page"]);
    expect(ask.dimensionFilterGroups).toEqual([{ filters: [{ dimension: "query", operator: "equals", expression: "plumber leeds" }] }]);
    expect(asks[1].url).toContain(encodeURIComponent(PROPERTY));

    // Another company's reader is refused before Google is asked anything.
    const otherReader = await person(t, await company(t, "Rival"));
    const args = { siteId, searchType: "web" as const, dimension: "query" as const, key: "plumber leeds", from: "2026-09-25", to: "2026-09-26" };
    expect(await otherReader.action(api.searchConsoleReads.searchConsolePairing, args)).toEqual({ ok: false, problem: "NOT_CONNECTED" });
    expect(await otherReader.action(api.searchConsoleLists.searchConsoleKeySeries, args)).toEqual({ ok: false, problem: "NOT_CONNECTED" });
    expect(asks).toHaveLength(2);
  });
});
