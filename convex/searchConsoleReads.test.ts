import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { positionLookups } from "./fanOutPositions";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { encryptConnectorToken } from "./connectorTokenCrypto";

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
      property: PROPERTY,
      permission: "siteOwner",
      dataProperty: PROPERTY,
      ...held,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    for (const day of days) {
      await ctx.db.insert("searchConsoleDays", {
        companyWebsiteId: siteId, searchType: "web", day: day.day, clicks: day.clicks, impressions: day.impressions,
        ctr: day.clicks / day.impressions, position: day.position, namedClicks: day.namedClicks, fetchedAt: Date.now(),
      });
    }
  });
}

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
    // The hero boxes' figures: over the whole list, with the days before.
    expect(list.summary).toMatchObject({ rows: 3, of: 3, clicks: 12, gaining: 3, gained: 10, bands: { "1-3": 1, "4-10": 2 }, bandsBefore: { "1-3": 1 } });
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

  test("one keyword's pages and one page's keywords are asked of Google when opened, each row's count from the lists kept (keep-less-history-plan.md, 5.1)", async () => {
    const { t, siteId, reader } = await withSearches();
    // The page list kept for the 7 days: each page with how many keywords it has across the website.
    await period(t, siteId, "page", now, [["https://acme-shop.test/plumbers/", 8, 100, 3, 4], ["https://acme-shop.test/", 3, 100, 6, 7]]);
    // The server says to ask Google, for a ready-made period too.
    expect(await reader.query(api.searchConsoleLists.searchConsoleListPage, {
      siteId, ...range, within: { kind: "query", key: "plumber leeds" }, ...page,
    })).toMatchObject({ live: true, preparing: false, total: 0 });

    const pair = (query: string, address: string, clicks: number) => ({ keys: [query, address], clicks, impressions: clicks * 10, ctr: 0.1, position: 4 });
    let answer = [pair("plumber leeds", "https://acme-shop.test/plumbers/", 5), pair("plumber leeds", "https://acme-shop.test/", 3)];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rows: answer })));
    const pages = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { siteId, ...range, within: { kind: "query", key: "plumber leeds" } });
    expect(pages.ok).toBe(true);
    if (!pages.ok) return;
    // Each page's keywords across the website, from the page list kept for the dates.
    expect(pages.rows.flat().map((row) => [row.key, row.clicks, row.count])).toEqual([
      ["https://acme-shop.test/plumbers/", 5, 4],
      ["https://acme-shop.test/", 3, 7],
    ]);

    answer = [pair("emergency plumber", "https://acme-shop.test/", 3), pair("plumber leeds", "https://acme-shop.test/", 3)];
    const keywords = await reader.action(api.searchConsoleLists.searchConsoleLiveList, {
      siteId, ...range, dimension: "page", within: { kind: "page", key: "https://acme-shop.test/" },
    });
    if (!keywords.ok) throw new Error("Google was asked and answered");
    // Each keyword's pages across the website, from the keyword list kept for the dates.
    expect(keywords.rows.flat().map((row) => [row.key, row.count]).sort()).toEqual([["emergency plumber", 1], ["plumber leeds", 2]]);

    // Other dates keep nothing to count from: the column says so, as before.
    const otherDates = await reader.action(api.searchConsoleLists.searchConsoleLiveList, {
      siteId, ...range, from: "2026-09-25", dimension: "page", within: { kind: "page", key: "https://acme-shop.test/" },
    });
    if (!otherDates.ok) throw new Error("Google was asked and answered");
    expect(otherDates.rows.flat().map((row) => row.count)).toEqual([null, null]);
  });

  test("Pages competing over 12 months reads its own ready-made list, with how many pages Google showed (drift fixes, 2026-10-03)", async () => {
    const { t, siteId, reader } = await withSearches();
    const year = { period: "365" as const, which: "NOW" as const, from: "2026-09-01", to: "2026-09-26" };
    await period(t, siteId, "query", year, [
      ["plumber leeds", 10, 200, 3, 2, "https://acme-shop.test/plumbers/"],
      ["boiler repair", 1, 10, 9, 1, "https://acme-shop.test/boilers/"],
    ]);
    await t.mutation(internal.searchConsolePeriods.writePeriodPart, {
      companyWebsiteId: siteId,
      searchType: "web",
      list: "competing",
      ...year,
      part: 0,
      keys: ["plumber leeds", "plumber leeds"],
      pages: ["https://acme-shop.test/plumbers/", "https://acme-shop.test/"],
      clicks: [7, 3],
      impressions: [150, 50],
      positionSums: [450, 350],
      shown: 4,
      builtAt: Date.now(),
    });
    const competing = await reader.query(api.searchConsoleLists.searchConsoleListPage, {
      siteId, ...range, view: "competing", from: "2025-09-27", ...page,
    });
    expect(competing).toMatchObject({ live: false, preparing: false, total: 1 });
    expect(competing.rows[0]).toMatchObject({ key: "plumber leeds", count: 2, top: "https://acme-shop.test/plumbers/", next: "https://acme-shop.test/" });
    expect(competing.rows[0].topShare).toBeCloseTo(0.7);
    expect(competing.summary).toMatchObject({ rows: 1, of: 2, pagesInvolved: 2, pagesShown: 4 });
  });

  test("Fan-out's 14 and 28 days read their own ready-made lists, the 30 days until they are built (§15, decision 4)", async () => {
    const { t, siteId } = await withSearches();
    await t.mutation(internal.searchConsolePeriods.writePeriodPart, {
      companyWebsiteId: siteId, searchType: "web", list: "query", period: "28", which: "NOW", from: "2026-08-30", to: "2026-09-26", part: 0,
      keys: ["plumber leeds"], clicks: [8], impressions: [100], positionSums: [400], builtAt: Date.now(),
    });
    await period(t, siteId, "query", { period: "30", which: "NOW", from: "2026-08-28", to: "2026-09-26" }, [["plumber leeds", 9, 110, 6]]);
    const positions = await t.run(async (ctx) => {
      const site = (await ctx.db.get(siteId))!;
      return {
        twentyEight: (await positionLookups(ctx, site, 28)).consolePosition("plumber leeds"),
        fourteen: (await positionLookups(ctx, site, 14)).consolePosition("plumber leeds"),
      };
    });
    expect(positions).toEqual({ twentyEight: 4, fourteen: 6 });
  });

  test("a list asked of Google ticks its rows from the tracked list as it changes", async () => {
    const { siteId, reader } = await withSearches();
    await reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind: "query", key: "boiler repair", track: true });
    expect(await reader.query(api.searchConsoleTracking.searchConsoleTrackedKeys, { siteId, kind: "query" })).toEqual(["boiler repair"]);
    expect(await reader.query(api.searchConsoleTracking.searchConsoleTrackedKeys, { siteId, kind: "page" })).toEqual([]);
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

  test("a list longer than Convex carries in one array comes in parts, all of it", async () => {
    // 2026-10-03: the United Kingdom's 8,833 searches on ronins.co.uk broke the
    // 8,192 a Convex array holds, and the screen called it Google being busy.
    const { siteId, reader } = await withSearches();
    const twoDays = { ...range, from: "2026-09-25", to: "2026-09-26" };
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const ask = JSON.parse(String(init?.body)) as { startDate: string; startRow?: number };
      const rows = ask.startDate === "2026-09-25" && !ask.startRow
        ? Array.from({ length: 9_000 }, (_, at) => ({ keys: [`search ${at}`, "https://acme-shop.test/"], clicks: 1, impressions: 10, ctr: 0.1, position: 5 }))
        : [];
      return Response.json({ rows });
    }));
    const live = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { siteId, ...twoDays });
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    expect(live.rows.map((part) => part.length)).toEqual([8_000, 1_000]);
    expect(new Set(live.rows.flat().map((row) => row.key)).size).toBe(9_000);
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
    expect(live.rows.flat().map((row) => [row.key, row.clicks, row.position, row.change, row.count, row.top])).toEqual([
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
    await expect(otherReader.action(api.searchConsoleLists.exportSearchConsoleList, { siteId, ...range, headers: ["Keyword"], fields: ["key"] })).rejects.toThrow("not one your company holds");
    expect(fetched).not.toHaveBeenCalled();
  });

  test("a download is the whole list in the order on screen, safe to open in a spreadsheet", async () => {
    const { t, siteId, reader } = await withSearches();
    await period(t, siteId, "query", now, [["=cmd", 2, 10, 1], ["plumber leeds", 8, 100, 3]]);
    const file = await reader.action(api.searchConsoleLists.exportSearchConsoleList, {
      siteId, ...range, headers: ["Keyword", "Clicks", "Change", "Impressions", "CTR", "Position"], fields: ["key", "clicks", "change", "impressions", "ctr", "position"],
    });
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
    await t.action(internal.googleConnection.forgetHold, { companyWebsiteId: siteId });
    await finishScheduled(t);
    const left = await t.run(async (ctx) => ({
      periods: (await ctx.db.query("searchConsolePeriods").collect()).length,
      tracked: (await ctx.db.query("searchConsoleTracked").collect()).length,
    }));
    expect(left).toEqual({ periods: 0, tracked: 0 });
  });

  describe("the tracked lists (Tracked keywords, Tracked pages)", () => {
    const tracked = { ...range, view: "tracked" as const };
    const track = async (reader: Awaited<ReturnType<typeof person>>, siteId: Id<"companyWebsites">, kind: "query" | "page", key: string, on = true) =>
      await reader.mutation(api.searchConsoleTracking.trackSearchConsoleItem, { siteId, kind, key, track: on });

    test("list only what the company tracks, shown in the dates or not, with their figures together; an untick takes a row off", async () => {
      const { siteId, reader } = await withSearches();
      for (const key of ["plumber leeds", "boiler repair", "never shown"]) await track(reader, siteId, "query", key);

      const list = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...tracked, ...page });
      expect(list.rows.map((row) => [row.key, row.clicks, row.change, row.tracked])).toEqual([
        ["plumber leeds", 8, 6, true],
        ["boiler repair", 1, 1, true],
        ["never shown", 0, 0, true],
      ]);
      // The four figures: the tracked rows' together, the days before held, the position weighted by impressions.
      expect(list.summary).toMatchObject({ rows: 3, clicks: 9, impressions: 110, previousClicks: 2 });
      expect(list.summary?.position).toBeCloseTo((3 * 100 + 9 * 10) / 110);
      // Every other list still says the same of itself.
      const all = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...range, ...page });
      expect(all.summary).toMatchObject({ rows: 3, clicks: 12, impressions: 210, previousClicks: 2 });

      await track(reader, siteId, "query", "boiler repair", false);
      const after = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...tracked, ...page });
      expect(after.rows.map((row) => row.key)).toEqual(["plumber leeds", "never shown"]);
      expect(after.summary).toMatchObject({ clicks: 8, impressions: 100, previousClicks: 2, position: 3 });

      const searched = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...tracked, ...page, q: "never" });
      expect(searched.rows.map((row) => row.key)).toEqual(["never shown"]);
      // Ordered by position, a keyword Google did not show is a blank, last.
      const byPosition = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...tracked, ...page, sort: "position" });
      expect(byPosition.rows.map((row) => row.key)).toEqual(["plumber leeds", "never shown"]);

      const file = await reader.action(api.searchConsoleLists.exportSearchConsoleList, {
        siteId, ...tracked, headers: ["Keyword", "Clicks", "Change"], fields: ["key", "clicks", "change"],
      });
      expect(file.fileName).toBe("acme-shop.test-search-console-tracked-query-2026-09-20-2026-09-26.csv");
      expect(file.csv.split("\n")).toEqual(["Keyword,Clicks,Change", "plumber leeds,8,6", "never shown,0,0"]);
    });

    test("pages are tracked apart from keywords, and with the days before not held no clicks before are claimed", async () => {
      const { t, siteId, reader } = await withSearches();
      await period(t, siteId, "page", now, [
        ["https://acme-shop.test/plumbers/", 8, 100, 3, 1, "plumber leeds"],
        ["https://acme-shop.test/", 3, 100, 6, 1, "emergency plumber"],
      ]);
      await track(reader, siteId, "query", "plumber leeds");
      await track(reader, siteId, "page", "https://acme-shop.test/");

      const pages = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...tracked, dimension: "page", ...page });
      expect(pages.rows.map((row) => [row.key, row.clicks, row.count, row.top])).toEqual([["https://acme-shop.test/", 3, 1, "emergency plumber"]]);
      expect(pages.summary).toMatchObject({ rows: 1, clicks: 3, impressions: 100, previousClicks: null, position: 6 });
    });

    test("asked of Google for other dates, only the tracked are listed, against the days before", async () => {
      const { siteId, reader } = await withSearches();
      await track(reader, siteId, "query", "boiler repair");
      vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const ask = JSON.parse(String(init?.body)) as { startDate: string };
        const pair = (query: string, clicks: number, impressions: number, position: number) =>
          ({ keys: [query, "https://acme-shop.test/"], clicks, impressions, ctr: clicks / impressions, position });
        return Response.json({ rows: ask.startDate === "2026-09-25"
          ? [pair("plumber leeds", 8, 100, 3), pair("boiler repair", 2, 20, 7)]
          : [pair("boiler repair", 5, 40, 9)] });
      }));
      const live = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { siteId, ...tracked, from: "2026-09-25" });
      expect(live.ok).toBe(true);
      if (!live.ok) return;
      expect(live.rows.flat().map((row) => [row.key, row.clicks, row.change, row.tracked])).toEqual([["boiler repair", 2, -3, true]]);
      expect(live.summary).toMatchObject({ clicks: 2, impressions: 20, previousClicks: 5, position: 7 });
    });

    test("another company's tracked list is never read, even on the same website", async () => {
      const { t, siteId, reader } = await withSearches();
      await track(reader, siteId, "query", "plumber leeds");
      const rivalId = await company(t, "Rival");
      await t.run(async (ctx) => {
        const mine = (await ctx.db.get(siteId))!;
        const theirs = await ctx.db.insert("companyWebsites", { companyId: rivalId, websiteId: mine.websiteId, relationship: "OWNED", createdAt: Date.now() });
        await ctx.db.insert("searchConsoleTracked", { companyWebsiteId: theirs, kind: "query", key: "emergency plumber", createdAt: Date.now() });
      });

      const list = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...tracked, ...page });
      expect(list.rows.map((row) => row.key)).toEqual(["plumber leeds"]);
      expect(list.summary).toMatchObject({ rows: 1, tracked: 1 });

      const fetched = vi.fn(async () => Response.json({ rows: [] }));
      vi.stubGlobal("fetch", fetched);
      const rival = await person(t, rivalId);
      await expect(rival.query(api.searchConsoleLists.searchConsoleListPage, { siteId, ...tracked, ...page })).rejects.toThrow("not one your company holds");
      expect(await rival.action(api.searchConsoleLists.searchConsoleLiveList, { siteId, ...tracked, from: "2026-09-25" })).toEqual({ ok: false, problem: "NOT_CONNECTED" });
      await expect(rival.action(api.searchConsoleLists.exportSearchConsoleList, { siteId, ...tracked, headers: ["Keyword"], fields: ["key"] })).rejects.toThrow("not one your company holds");
      expect(fetched).not.toHaveBeenCalled();
    });
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
  test("its own days against the days before, asked of Google", async () => {
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
    expect(asks[0].url).toContain(encodeURIComponent(PROPERTY));

    // Another company's reader is refused before Google is asked anything.
    const otherReader = await person(t, await company(t, "Rival"));
    const args = { siteId, searchType: "web" as const, dimension: "query" as const, key: "plumber leeds", from: "2026-09-25", to: "2026-09-26" };
    expect(await otherReader.action(api.searchConsoleLists.searchConsoleKeySeries, args)).toEqual({ ok: false, problem: "NOT_CONNECTED" });
    expect(asks).toHaveLength(1);
  });
});
