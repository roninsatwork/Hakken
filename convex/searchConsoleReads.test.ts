import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * What the Search Console section reads (docs/plans/active/
 * search-console-plan.md §5): the company's own websites, a website's
 * figures for the dates chosen, its tables worked out into copies, one
 * search's own days, and the pages Google showed for it — asked of Google,
 * faked here at the network. None of it reaches another company.
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
  days: Array<{ day: string; clicks: number; impressions: number; position: number; namedClicks?: number; queries?: Array<[string, number, number, number]> }>,
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
      for (const [key, clicks, impressions, position] of day.queries ?? []) {
        await ctx.db.insert("searchConsoleRows", {
          companyWebsiteId: siteId, searchType: "web", dimension: "query", key, day: day.day, clicks, impressions,
          ctr: clicks / impressions, position, fetchedAt: Date.now(),
        });
      }
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

describe("the tables", () => {
  const range = { searchType: "web" as const, dimension: "query" as const, from: "2026-09-25", to: "2026-09-26" };
  const page = { page: 1, rows: 25 };

  async function withSearches() {
    const t = harness();
    const companyId = await company(t, "Acme");
    const siteId = await hold(t, companyId, "acme-shop.test");
    await connected(t, companyId, siteId, { oldestDay: "2026-09-01", newestDay: "2026-09-26" }, [
      { day: "2026-09-26", clicks: 12, impressions: 400, position: 5, queries: [["plumber leeds", 5, 50, 2], ["emergency plumber", 3, 100, 6]] },
      { day: "2026-09-25", clicks: 6, impressions: 200, position: 5, queries: [["plumber leeds", 3, 50, 4], ["boiler repair", 1, 10, 9]] },
      // The two days before: for the change.
      { day: "2026-09-24", clicks: 2, impressions: 40, position: 5, queries: [["plumber leeds", 2, 20, 3]] },
    ]);
    return { t, companyId, siteId, reader: await person(t, companyId) };
  }

  test("a list is prepared the first time, then added up, counted and ordered over all of it", async () => {
    const { t, siteId, reader } = await withSearches();
    const first = await reader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...range, ...page });
    expect(first.preparing).toBe(true);

    await reader.mutation(api.searchConsoleCopies.ensureSearchConsoleCopy, { siteId, ...range });
    await finishScheduled(t);

    const list = await reader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...range, ...page });
    expect(list).toMatchObject({ preparing: false, current: true, total: 3, named: 12, comparable: true });
    expect(list.rows.map((row) => [row.key, row.clicks, row.impressions, row.position, row.change])).toEqual([
      ["plumber leeds", 8, 100, 3, 6],
      ["emergency plumber", 3, 100, 6, 3],
      ["boiler repair", 1, 10, 9, 1],
    ]);
    expect(list.rows[0].share).toBeCloseTo(8 / 12);
    expect(list.rows[1].previousClicks).toBeNull();

    const byPosition = await reader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...range, ...page, sort: "position" });
    expect(byPosition.rows.map((row) => row.key)).toEqual(["plumber leeds", "emergency plumber", "boiler repair"]);
    const searched = await reader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...range, ...page, q: "plum" });
    expect(searched.rows.map((row) => row.key)).toEqual(["plumber leeds", "emergency plumber"]);
    const paged = await reader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...range, page: 2, rows: 2 });
    expect(paged).toMatchObject({ page: 2, pages: 2, total: 3 });
    expect(paged.rows.map((row) => row.key)).toEqual(["boiler repair"]);
  });

  test("a list goes behind when Google's next day lands, and shows the last one while it is built again", async () => {
    const { t, siteId, reader } = await withSearches();
    await reader.mutation(api.searchConsoleCopies.ensureSearchConsoleCopy, { siteId, ...range });
    await finishScheduled(t);
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query("searchConsoleConnections").first())!;
      await ctx.db.patch(connection._id, { newestDay: "2026-09-27" });
    });
    const behind = await reader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...range, ...page });
    expect(behind).toMatchObject({ current: false, total: 3 });
    await reader.mutation(api.searchConsoleCopies.ensureSearchConsoleCopy, { siteId, ...range });
    await finishScheduled(t);
    expect((await reader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...range, ...page })).current).toBe(true);
  });

  test("with the days before not held, no change is claimed", async () => {
    const { t, siteId, reader } = await withSearches();
    const early = { ...range, from: "2026-09-01", to: "2026-09-26" };
    await reader.mutation(api.searchConsoleCopies.ensureSearchConsoleCopy, { siteId, ...early });
    await finishScheduled(t);
    const list = await reader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...early, ...page });
    expect(list.comparable).toBe(false);
    expect(list.rows.every((row) => row.change === null && row.previousClicks === null)).toBe(true);
  });

  test("another company can neither read a list nor ask for one", async () => {
    const { t, siteId } = await withSearches();
    const otherReader = await person(t, await company(t, "Rival"));
    await expect(otherReader.query(api.searchConsoleCopies.searchConsoleListPage, { siteId, ...range, ...page })).rejects.toThrow("not one your company holds");
    await expect(otherReader.mutation(api.searchConsoleCopies.ensureSearchConsoleCopy, { siteId, ...range })).rejects.toThrow("not one your company holds");
  });

  test("a website no longer held takes its lists with it", async () => {
    const { t, siteId, reader } = await withSearches();
    await reader.mutation(api.searchConsoleCopies.ensureSearchConsoleCopy, { siteId, ...range });
    await finishScheduled(t);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await t.action(internal.searchConsoleConnect.forgetHold, { companyWebsiteId: siteId });
    await finishScheduled(t);
    const copies = await t.run(async (ctx) => await ctx.db.query("siteListCopies").withIndex("by_kind_key", (q) => q.eq("kind", "gsc")).collect());
    expect(copies).toEqual([]);
  });
});

describe("one search", () => {
  test("its own days, and the pages Google showed for it, asked of Google", async () => {
    const t = harness();
    const companyId = await company(t, "Acme");
    const siteId = await hold(t, companyId, "acme-shop.test");
    await connected(t, companyId, siteId, { oldestDay: "2026-09-01", newestDay: "2026-09-26" }, [
      { day: "2026-09-26", clicks: 12, impressions: 400, position: 5, queries: [["plumber leeds", 5, 50, 2]] },
      { day: "2026-09-25", clicks: 6, impressions: 200, position: 5, queries: [["plumber leeds", 3, 50, 4]] },
    ]);
    const reader = await person(t, companyId);

    const days = await reader.query(api.searchConsoleReads.searchConsoleKeyDays, {
      siteId, searchType: "web", dimension: "query", key: "plumber leeds", from: "2026-09-25", to: "2026-09-26",
    });
    expect(days.totals).toEqual({ clicks: 8, impressions: 100, ctr: 0.08, position: 3 });
    expect(days.days.map((day) => day.clicks)).toEqual([3, 5]);

    const asks: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      asks.push({ url: String(input), body: String(init?.body) });
      return Response.json({ rows: [
        { keys: ["https://acme-shop.test/other/"], clicks: 1, impressions: 20, ctr: 0.05, position: 9 },
        { keys: ["https://acme-shop.test/plumbers/"], clicks: 7, impressions: 80, ctr: 0.0875, position: 2.5 },
      ] });
    }));
    const pairing = await reader.action(api.searchConsoleReads.searchConsolePairing, {
      siteId, searchType: "web", dimension: "query", key: "plumber leeds", from: "2026-09-25", to: "2026-09-26",
    });
    expect(pairing.ok && pairing.rows.map((row) => [row.key, row.clicks])).toEqual([
      ["https://acme-shop.test/plumbers/", 7],
      ["https://acme-shop.test/other/", 1],
    ]);
    const ask = JSON.parse(asks[0].body) as { dimensions: string[]; dimensionFilterGroups: unknown };
    expect(ask.dimensions).toEqual(["page"]);
    expect(ask.dimensionFilterGroups).toEqual([{ filters: [{ dimension: "query", operator: "equals", expression: "plumber leeds" }] }]);
    expect(asks[0].url).toContain(encodeURIComponent(PROPERTY));

    // Another company's reader is refused before Google is asked anything.
    const otherReader = await person(t, await company(t, "Rival"));
    const refused = await otherReader.action(api.searchConsoleReads.searchConsolePairing, {
      siteId, searchType: "web", dimension: "query", key: "plumber leeds", from: "2026-09-25", to: "2026-09-26",
    });
    expect(refused).toEqual({ ok: false, problem: "NOT_CONNECTED" });
    expect(asks).toHaveLength(1);
  });
});
