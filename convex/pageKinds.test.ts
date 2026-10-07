import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { NOT_SORTED_KIND } from "./utils/pageKinds";

/**
 * A website's own classifications on its charts and screens (docs/plans/
 * active/page-groups-plan.md, decisions 2 and 3): once it has any, every
 * read that hands a screen a page's kind hands it the page's classification
 * — or Not sorted, never an automatic kind — and the figures add up by the
 * classifications' type. Without any, nothing changes. Only ever the
 * caller's own company's classifications: another company holding the same
 * website never lends its own.
 */

const NOW = Date.parse("2026-09-27T09:30:00Z");
const UK = 2826;
const HOST = "acme-shop.test";
const url = (path: string) => `https://${HOST}${path}`;

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

/**
 * Two companies whose own website is the same one, each with its own hold;
 * the first connected to Search Console, with a week's pages as Sites judged
 * them, and its pages once (`holdPages`), the posts listed by their sitemap.
 */
async function setUp(t: Harness) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host: HOST, displayHost: HOST, firstSeenAt: NOW });
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: NOW });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other", createdAt: NOW });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: NOW });
    const otherHoldId = await ctx.db.insert("companyWebsites", { companyId: otherCompanyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: NOW });
    const userId = await ctx.db.insert("users", { name: "Member", email: "member@acme-shop.test", role: "USER", companyId, createdAt: NOW });
    const otherUserId = await ctx.db.insert("users", { name: "Other", email: "member@other.test", role: "USER", companyId: otherCompanyId, createdAt: NOW });
    await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: holdId, websiteId, status: "CONNECTED", googleAccount: "owner@acme-shop.test",
      property: `sc-domain:${HOST}`, permission: "siteOwner", dataProperty: `sc-domain:${HOST}`,
      oldestDay: "2026-09-01", newestDay: "2026-09-26", createdAt: NOW, updatedAt: NOW,
    });
    for (const [page, sitemapFile] of [["/hub/boilers/", "content-hub-sitemap.xml"], ["/our-new-van/", "post-sitemap.xml"], ["/plumbers/", "page-sitemap.xml"], ["/contact/", "page-sitemap.xml"]] as const) {
      for (const hold of [holdId, otherHoldId]) {
        await ctx.db.insert("holdPages", { companyWebsiteId: hold, page, sitemapFile, crawled: true, shown: true, clicks: 1, ranks: true });
      }
    }
    return { websiteId, companyId, holdId, otherHoldId, userId, otherUserId };
  });
}

/** The week's pages Google showed, with Sites' kinds beside them: [page, clicks, kind]. */
const PAGES: Array<[string, number, string]> = [
  ["/hub/boilers/", 40, "ARTICLE"],
  ["/plumbers/", 30, "SERVICE"],
  ["/our-new-van/", 20, "ARTICLE"],
  ["/contact/", 10, "CONTACT"],
];

async function pagesPeriod(t: Harness, holdId: Id<"companyWebsites">) {
  await t.mutation(internal.searchConsolePeriods.writePeriodPart, {
    companyWebsiteId: holdId, searchType: "web", list: "page", period: "7", which: "NOW", from: "2026-09-20", to: "2026-09-26", part: 0,
    keys: PAGES.map(([page]) => url(page)),
    clicks: PAGES.map(([, clicks]) => clicks),
    impressions: PAGES.map(([, clicks]) => clicks * 10),
    positionSums: PAGES.map(([, clicks]) => clicks * 10 * 4),
    kinds: PAGES.map(([, , kind]) => kind),
    builtAt: NOW,
  });
}

/** A company's own classifications of its hold: Content hub, Journal (by the posts sitemap) and Services, as admin sets them. */
async function classify(t: Harness, holdId: Id<"companyWebsites">, prefix = "") {
  return await t.run(async (ctx) => {
    const add = async (name: string, type: "INFORMATIONAL" | "SERVICE", kind: "STARTS_WITH" | "SITEMAP_FILE" | "EXACT", value: string) => {
      const classificationId = await ctx.db.insert("pageClassifications", { companyWebsiteId: holdId, name: `${prefix}${name}`, type, createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("pageClassificationLines", { companyWebsiteId: holdId, classificationId, kind, value, createdAt: NOW });
      return classificationId;
    };
    return {
      hub: await add("Content hub", "INFORMATIONAL", "STARTS_WITH", "/hub/"),
      journal: await add("Journal", "INFORMATIONAL", "SITEMAP_FILE", "post-sitemap.xml"),
      services: await add("Plumbing services", "SERVICE", "EXACT", "/plumbers/"),
    };
  });
}

const week = { searchType: "web" as const, dimension: "page" as const, from: "2026-09-20", to: "2026-09-26", page: 1, rows: 25 };
const kindsOf = (rows: Array<{ key: string; kind: string | null }>) => Object.fromEntries(rows.map((row) => [row.key.replace(url(""), ""), row.kind]));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", Buffer.from(new Uint8Array(32).fill(9)).toString("base64"));
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Search Console's lists of pages", () => {
  test("without classifications, every page keeps the kind Sites judged, and nothing adds up by type", async () => {
    const t = harness();
    const { holdId, userId } = await setUp(t);
    await pagesPeriod(t, holdId);
    const reader = t.withIdentity({ subject: userId });

    const list = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId: holdId, ...week });
    expect(kindsOf(list.rows)).toEqual({ "/hub/boilers/": "ARTICLE", "/plumbers/": "SERVICE", "/our-new-van/": "ARTICLE", "/contact/": "CONTACT" });
    expect(list.summary?.kinds).toEqual([
      { kind: "ARTICLE", rows: 2, clicks: 60 },
      { kind: "SERVICE", rows: 1, clicks: 30 },
      { kind: "CONTACT", rows: 1, clicks: 10 },
    ]);
    expect(list.summary?.types).toEqual([]);
    expect(await reader.query(api.pageKinds.pageKindChoices, { siteId: holdId })).toBeNull();
  });

  test("with classifications, each page is its classification or Not sorted — never an automatic kind — and the figures add up by type", async () => {
    const t = harness();
    const { holdId, userId } = await setUp(t);
    await pagesPeriod(t, holdId);
    const own = await classify(t, holdId);
    const reader = t.withIdentity({ subject: userId });

    const list = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId: holdId, ...week });
    // The post is caught by the sitemap file that lists it; the contact page by nothing.
    expect(kindsOf(list.rows)).toEqual({ "/hub/boilers/": own.hub, "/plumbers/": own.services, "/our-new-van/": own.journal, "/contact/": NOT_SORTED_KIND });
    expect(list.summary?.kinds).toEqual(expect.arrayContaining([
      { kind: own.hub, rows: 1, clicks: 40 },
      { kind: own.journal, rows: 1, clicks: 20 },
      { kind: own.services, rows: 1, clicks: 30 },
      { kind: NOT_SORTED_KIND, rows: 1, clicks: 10 },
    ]));
    // The hero figures by type: the company's own names still add up — Content hub and Journal are both informational content.
    expect(list.summary?.types).toEqual([
      { type: "INFORMATIONAL", rows: 2, clicks: 60 },
      { type: "SERVICE", rows: 1, clicks: 30 },
    ]);

    // Filtered to one classification, or to Not sorted.
    const hub = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId: holdId, ...week, kind: own.hub });
    expect(hub.rows.map((row) => row.key)).toEqual([url("/hub/boilers/")]);
    const notSorted = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId: holdId, ...week, kind: NOT_SORTED_KIND });
    expect(notSorted.rows.map((row) => row.key)).toEqual([url("/contact/")]);
    // An automatic kind no longer matches anything.
    const articles = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId: holdId, ...week, kind: "ARTICLE" });
    expect(articles.total).toBe(0);

    // By the classification's name, A to Z, Not sorted last.
    const byKind = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId: holdId, ...week, sort: "kind", direction: "asc" });
    expect(byKind.rows.map((row) => row.key)).toEqual([url("/hub/boilers/"), url("/our-new-van/"), url("/plumbers/"), url("/contact/")]);

    // The screens' names for them, A to Z.
    expect((await reader.query(api.pageKinds.pageKindChoices, { siteId: holdId }))?.map((choice) => choice.name)).toEqual(["Content hub", "Journal", "Plumbing services"]);
  });

  test("asked of Google for other dates, the pages are classified the same way, and add up by type", async () => {
    const t = harness();
    const { holdId, userId } = await setUp(t);
    const own = await classify(t, holdId);
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first())!;
      await ctx.db.insert("searchConsoleTokens", {
        connectionId: connection._id,
        accessTokenCiphertext: await encryptConnectorToken("ya29.stored"),
        refreshTokenCiphertext: await encryptConnectorToken("1//refresh"),
        expiresAt: Date.now() + 3_000_000, scopes: [], createdAt: NOW, updatedAt: NOW,
      });
    });
    // Google's pairs and pages for any dates: the same four pages.
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const ask = JSON.parse(String(init?.body)) as { dimensions: string[] };
      const row = ([page, clicks]: [string, number, string]) => ({
        keys: ask.dimensions.length === 2 ? ["plumber", url(page)] : [url(page)], clicks, impressions: clicks * 10, ctr: 0.1, position: 4,
      });
      return Response.json({ rows: PAGES.map(row) });
    }));
    const live = await t.withIdentity({ subject: userId }).action(api.searchConsoleLists.searchConsoleLiveList, {
      siteId: holdId, searchType: "web", dimension: "page", from: "2026-09-25", to: "2026-09-26",
    });
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    expect(kindsOf(live.rows.flat())).toEqual({ "/hub/boilers/": own.hub, "/plumbers/": own.services, "/our-new-van/": own.journal, "/contact/": NOT_SORTED_KIND });
    expect(live.summary.types).toEqual([{ type: "INFORMATIONAL", rows: 2, clicks: 60 }, { type: "SERVICE", rows: 1, clicks: 30 }]);
  });

  test("a download names each page's classification, and Not sorted in words", async () => {
    const t = harness();
    const { holdId, companyId } = await setUp(t);
    await pagesPeriod(t, holdId);
    await classify(t, holdId);
    const { page: _page, rows: _rows, ...dates } = week;
    const found = await t.query(internal.searchConsoleLists.exportRows, { siteId: holdId, companyId, ...dates });
    expect(Object.fromEntries((found?.rows.flat() ?? []).map((row) => [row.key.replace(url(""), ""), row.kind]))).toEqual({
      "/hub/boilers/": "Content hub", "/plumbers/": "Plumbing services", "/our-new-van/": "Journal", "/contact/": "Not sorted",
    });
  });

  test("another company's classifications of the same website are never read", async () => {
    const t = harness();
    const { holdId, otherHoldId, userId, otherUserId } = await setUp(t);
    await pagesPeriod(t, holdId);
    // Only the other company has classified the website.
    await classify(t, otherHoldId, "Theirs: ");
    const reader = t.withIdentity({ subject: userId });

    const list = await reader.query(api.searchConsoleLists.searchConsoleListPage, { siteId: holdId, ...week });
    expect(kindsOf(list.rows)).toEqual({ "/hub/boilers/": "ARTICLE", "/plumbers/": "SERVICE", "/our-new-van/": "ARTICLE", "/contact/": "CONTACT" });
    expect(list.summary?.types).toEqual([]);
    expect(await reader.query(api.pageKinds.pageKindChoices, { siteId: holdId })).toBeNull();
    // Nor can a company read another's choices by naming its hold.
    await expect(reader.query(api.pageKinds.pageKindChoices, { siteId: otherHoldId })).rejects.toThrow();
    expect(await t.withIdentity({ subject: otherUserId }).query(api.pageKinds.pageKindChoices, { siteId: otherHoldId })).toHaveLength(3);
  });
});

describe("Sites' pages", () => {
  /** Four ranking pages, as the rebuild files them, and Top pages' compact copy of them. */
  async function ranking(t: Harness, websiteId: Id<"websites">) {
    await t.run(async (ctx) => {
      const rows: Array<[string, "ARTICLE" | "SERVICE" | "CONTACT", number]> = [["/hub/boilers/", "ARTICLE", 400], ["/plumbers/", "SERVICE", 300], ["/our-new-van/", "ARTICLE", 20], ["/contact/", "CONTACT", 5]];
      for (const [page, pageType, traffic] of rows) {
        await ctx.db.insert("sitePageRanks", {
          websiteId, locationCode: UK, page, url: url(page), section: page.split("/")[1] || "/", keywords: Math.round(traffic / 10), bestPosition: 3, top3: 1,
          topKeyword: "plumber", topKeywordVolume: 100, firstSeenDay: "2026-09-01", day: "2026-09-26",
          traffic, pageType, rebuildId: "r1",
        });
      }
    });
    await t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "pages", key: `${websiteId}:${UK}` });
  }

  test("the Overview's pages by kind become pages by classification, Not sorted among them", async () => {
    const t = harness();
    const { websiteId, holdId, userId } = await setUp(t);
    await ranking(t, websiteId);
    const reader = t.withIdentity({ subject: userId });

    const before = await reader.query(api.siteOverview.overviewExtras, { siteId: holdId });
    expect(before.pages.classified).toBeNull();
    expect(before.pages.kinds.map((row) => [row.pageType, row.pages])).toEqual([["ARTICLE", 2], ["SERVICE", 1], ["CONTACT", 1]]);

    const own = await classify(t, holdId);
    const after = await reader.query(api.siteOverview.overviewExtras, { siteId: holdId });
    expect(after.pages.classified).toEqual([
      { kind: own.hub, pages: 1, visits: 400 },
      { kind: own.services, pages: 1, visits: 300 },
      { kind: own.journal, pages: 1, visits: 20 },
      { kind: NOT_SORTED_KIND, pages: 1, visits: 5 },
    ]);
  });

  test("Top pages and a page's own screen show its classification, and filter by one", async () => {
    const t = harness();
    const { websiteId, holdId, userId } = await setUp(t);
    await ranking(t, websiteId);
    const reader = t.withIdentity({ subject: userId });
    const list = (extra: { pageType?: string } = {}) => reader.query(api.siteKeywords.listPages, { siteId: holdId, page: 1, rows: 25, ...extra });

    // Without classifications, the page types as before.
    expect(Object.fromEntries((await list()).rows.map((row) => [row.page, row.kind]))).toEqual({ "/hub/boilers/": "ARTICLE", "/plumbers/": "SERVICE", "/our-new-van/": "ARTICLE", "/contact/": "CONTACT" });
    expect((await list({ pageType: "ARTICLE" })).total).toBe(2);
    expect(await reader.query(api.siteRecords.pageRecord, { siteId: holdId, page: "/our-new-van/" })).toMatchObject({ kind: null, rank: { pageType: "ARTICLE" } });

    const own = await classify(t, holdId);
    expect(Object.fromEntries((await list()).rows.map((row) => [row.page, row.kind]))).toEqual({
      "/hub/boilers/": own.hub, "/plumbers/": own.services, "/our-new-van/": own.journal, "/contact/": NOT_SORTED_KIND,
    });
    expect((await list({ pageType: own.journal })).rows.map((row) => row.page)).toEqual(["/our-new-van/"]);
    expect((await list({ pageType: NOT_SORTED_KIND })).rows.map((row) => row.page)).toEqual(["/contact/"]);
    expect((await list({ pageType: "ARTICLE" })).total).toBe(0);
    // One page's screen looks up its own sitemap file alone.
    expect((await reader.query(api.siteRecords.pageRecord, { siteId: holdId, page: "/our-new-van/" })).kind).toBe(own.journal);
    expect((await reader.query(api.siteRecords.pageRecord, { siteId: holdId, page: "/contact/" })).kind).toBe(NOT_SORTED_KIND);
  });
});
