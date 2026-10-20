import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { packNumbers, unpackNumbers } from "./utils/searchConsolePacks";
import { writeSitemapPart } from "./sitemapParts";
import { PAGE_RECORD } from "./holdPageRefs";
import { bookRecords } from "./searchConsolePeriodBooks";
import { holdPagesKey } from "./siteRankings";
import { packList, slotKey, type ListRow } from "./googleAnalyticsLists";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Every page of a company's website once (docs/plans/active/page-groups-plan.md,
 * decision 4), and Your pages read from it: the sitemap, the newest crawl's
 * HTML pages, the pages ranking from the company's place and its own Search
 * Console's last 90 days, joined and folded to their pages; the figures and
 * gaps counted once; the group the company's own classification, or Hakken's
 * kind until it has any; and another company's hold never read.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const www = (path: string) => `https://www.ronins.co.uk${path}`;
const PLACE = 2826;

/** ronins.co.uk in small: seven pages in three sitemap files. */
const SITEMAP: Array<[string, string]> = [
  ["/", "page-sitemap.xml"],
  ["/ai-agency/", "page-sitemap.xml"],
  ["/brand-design-agency/", "page-sitemap.xml"],
  ["/creative-digital-agency/", "page-sitemap.xml"],
  ["/hub/bad-websites/", "content-hub-sitemap.xml"],
  ["/hub/website-development-and-design-is-broken/", "content-hub-sitemap.xml"],
  ["/journal/", "post-sitemap.xml"],
];

/** The newest crawl: six HTML pages — one an author archive the sitemap leaves out — a redirect and a broken page, which are not pages. */
const CRAWLED: Array<[string, string, number]> = [
  [www("/"), "html", 200],
  [www("/ai-agency/"), "html", 200],
  [www("/brand-design-agency/"), "html", 200],
  [www("/hub/bad-websites/"), "html", 200],
  [www("/journal/"), "html", 200],
  [www("/author/anthony/"), "html", 200],
  [www("/old-page/"), "redirect", 301],
  [www("/gone/"), "broken", 404],
];

/**
 * Search Console's last 90 days: a jump link that counts with its page, the
 * home page, an author archive, an address without its slash, and a page on
 * a subdomain — another website.
 */
const SHOWN: Array<[string, number]> = [
  [www("/ai-agency/"), 400],
  [www("/ai-agency/#pricing"), 53],
  [www("/hub/bad-websites/"), 122],
  [www("/"), 150],
  ["https://ronins.co.uk/author/anthony/", 15],
  [www("/ai-agency"), 0],
  ["https://blog.ronins.co.uk/x/", 9],
];

async function company(t: Harness, name: string, websiteId?: Id<"websites">) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
    const site = websiteId ?? await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId: site, relationship: "OWNED", locationCode: PLACE, createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { name, email: `${name}-${Math.random()}@test.com`, role: "USER" as const, companyId, createdAt: Date.now() });
    return { companyId, websiteId: site, holdId, userId };
  });
  return { ...ids, member: t.withIdentity({ subject: ids.userId }) };
}

/** What the collection keeps for the website, shared by everyone holding it: its sitemap, crawl and rankings. */
async function collected(t: Harness, websiteId: Id<"websites">) {
  await t.run(async (ctx) => {
    const readAt = Date.now();
    await ctx.db.insert("siteSitemaps", {
      websiteId, source: "ROBOTS", pages: SITEMAP.length, cut: false, day: "2026-10-03", readAt,
      files: [{ url: www("/page-sitemap.xml"), pages: 4 }, { url: www("/content-hub-sitemap.xml"), pages: 2 }, { url: www("/post-sitemap.xml"), pages: 1 }],
    });
    await writeSitemapPart(ctx, { websiteId, readAt }, SITEMAP.map(([page, file]) => ({ page, file })));
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "site_crawl", family: "On-Page", mode: "QUEUED", websiteId, taskArgsJson: "{}", status: "READY",
      tag: `crawl-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    await ctx.db.insert("siteCrawls", { websiteId, pullId, day: "2026-09-28", pagesCrawled: 8, issues: [], createdAt: Date.now() } as never);
    for (const [url, resourceType, statusCode] of CRAWLED) {
      await ctx.db.insert("siteCrawlPages", { websiteId, pullId, day: "2026-09-28", url, page: new URL(url).pathname, resourceType, statusCode, problems: [] });
    }
    const rank = (page: string, locationCode: number) => ctx.db.insert("sitePageRanks", {
      websiteId, locationCode, page, address: www(page), section: "/", keywords: 3, bestPosition: 4, top3: 0,
      topKeyword: "ai agency", topKeywordVolume: 90, firstSeenDay: "2026-09-01", day: "2026-10-01", rebuildId: "r1",
    } as never);
    await rank("/ai-agency/", PLACE);
    await rank("/hub/bad-websites/", PLACE);
    // Ranking from another place: not where this company watches from.
    await rank("/journal/", 2840);
    await ctx.db.insert("sitePageTypes", { websiteId, page: "/ai-agency/", pageType: "SERVICE", judgedAt: Date.now() });
  });
}

/** The company's own Search Console, connected, with its ready-made 90 days. */
async function console90(t: Harness, at: { companyId: Id<"companies">; websiteId: Id<"websites">; holdId: Id<"companyWebsites"> }, shown: Array<[string, number]>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("searchConsoleConnections", {
      companyId: at.companyId, companyWebsiteId: at.holdId, websiteId: at.websiteId, status: "CONNECTED", newestDay: "2026-10-01", oldestDay: "2025-06-01",
      createdAt: Date.now(), updatedAt: Date.now(),
    } as never);
    await ctx.db.insert("searchConsolePeriods", {
      companyWebsiteId: at.holdId, searchType: "web", list: "page", period: "thisQuarter", which: "NOW", part: 0, from: "2026-07-04", to: "2026-10-01",
      keys: shown.map(([key]) => key), clicks: shown.map(([, clicks]) => clicks), impressions: shown.map(() => 100), positionSums: shown.map(() => 500),
      builtAt: Date.now(),
    } as never);
  });
}

async function ronins(t: Harness) {
  const owner = await company(t, "Ronins");
  await collected(t, owner.websiteId);
  await console90(t, owner, SHOWN);
  await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId });
  return owner;
}

/** The company's own Google Analytics, connected with figures, or still being set up. */
async function analytics(t: Harness, at: { companyId: Id<"companies">; websiteId: Id<"websites">; holdId: Id<"companyWebsites"> }, status: "CONNECTED" | "COUNTING" = "CONNECTED") {
  return await t.run(async (ctx) => await ctx.db.insert("googleAnalyticsConnections", {
    companyId: at.companyId, companyWebsiteId: at.holdId, websiteId: at.websiteId, status, property: "properties/1", dataProperty: "properties/1",
    addresses: ["www.ronins.co.uk"], currency: "GBP", newestDay: "2026-10-08", oldestDay: "2026-08-10", createdAt: 1, updatedAt: 1,
  }));
}

/** Addresses as the hold's page numbers, as a collection numbers them: those it lacks put on the end. A test's few fit one record. */
async function numbersOf(ctx: Pick<MutationCtx, "db">, holdId: Id<"companyWebsites">, addresses: readonly string[]): Promise<number[]> {
  const record = await ctx.db.query("holdPageAddresses").withIndex("by_hold_record", (q) => q.eq("companyWebsiteId", holdId).eq("record", 0)).first();
  const held = [...(record?.addresses ?? [])];
  for (const address of addresses) if (!held.includes(address)) held.push(address);
  expect(held.length).toBeLessThanOrEqual(PAGE_RECORD);
  if (record) await ctx.db.patch(record._id, { addresses: held });
  else await ctx.db.insert("holdPageAddresses", { companyWebsiteId: holdId, record: 0, addresses: held });
  return addresses.map((address) => held.indexOf(address));
}

/**
 * Its ready-made 90 days of landing pages, as a collection keeps them: each
 * address by its number in the hold's numbering, Google's "(not set)" as it is.
 */
async function landing90(ctx: Pick<MutationCtx, "db">, holdId: Id<"companyWebsites">, landed: Array<[string, number]>) {
  const key = slotKey("landing", "90", "NOW", "");
  const named = landed.filter(([address]) => address !== "(not set)").map(([address]) => address);
  const numbers = await numbersOf(ctx, holdId, named);
  const refs = new Map(named.map((address, at) => [address, `~${numbers[at].toString(36)}`]));
  const rows: ListRow[] = landed.map(([address, visits]) => ({
    key: refs.get(address) ?? "(not set)", visits, engaged: 0, seconds: 0, views: visits, purchases: 0, revenue: 0, people: 0, newPeople: 0, length: 0, counts: new Map(), values: new Map(),
  }));
  for (const old of await ctx.db.query("googleAnalyticsPeriods").withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", holdId).eq("key", key)).collect()) {
    await ctx.db.delete(old._id);
  }
  for (const old of await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", holdId).eq("key", key)).collect()) {
    await ctx.db.delete(old._id);
  }
  const parts = packList("landing", rows, []);
  await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: holdId, key, slot: 0, parts: parts.length, from: "2026-07-11", to: "2026-10-08", hash: "x", builtAt: 1 });
  for (const [part, packed] of parts.entries()) await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: holdId, key, slot: 0, part, ...packed });
}

/** Analytics' last 90 days: the page Search Console shows most, a page it never showed, a page off the website, and visits Google could not name. */
const LANDED: Array<[string, number]> = [
  [www("/ai-agency/"), 120],
  [www("/journal/"), 4],
  ["https://blog.ronins.co.uk/x/", 30],
  ["(not set)", 50],
];

/** Whether the hold's pages are waiting on the nightly refresh: something they are built from changed since the last rebuild began. */
const notedChanged = (t: Harness, holdId: Id<"companyWebsites">) =>
  t.run(async (ctx) => {
    const row = await ctx.db.query("siteSummaryRequests").withIndex("by_key", (q) => q.eq("key", holdPagesKey(holdId))).unique();
    return row !== null && (row.changedAt ?? row.requestedAt) > (row.builtFrom ?? 0);
  });

const holdRows = (t: Harness, holdId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", holdId)).collect());

const list = (member: Awaited<ReturnType<typeof company>>["member"], siteId: Id<"companyWebsites">, extra: Record<string, unknown> = {}) =>
  member.query(api.yourPages.listYourPages, { siteId, page: 1, rows: 100, ...extra });

describe("every page once", () => {
  test("joins the sitemap, the crawl's HTML pages, the rankings and Search Console, each address folded to its page", async () => {
    const t = harness();
    const { holdId } = await ronins(t);

    const rows = await holdRows(t, holdId);
    expect(rows.map((row) => [row.page, row.sitemapFile ?? null, row.crawled, row.shown, row.clicks, row.ranks])).toEqual([
      ["/", "page-sitemap.xml", true, true, 150, false],
      ["/ai-agency", null, false, true, 0, false],
      // The jump link counts with its page: 400 + 53.
      ["/ai-agency/", "page-sitemap.xml", true, true, 453, true],
      ["/author/anthony/", null, true, true, 15, false],
      ["/brand-design-agency/", "page-sitemap.xml", true, false, 0, false],
      ["/creative-digital-agency/", "page-sitemap.xml", false, false, 0, false],
      ["/hub/bad-websites/", "content-hub-sitemap.xml", true, true, 122, true],
      ["/hub/website-development-and-design-is-broken/", "content-hub-sitemap.xml", false, false, 0, false],
      ["/journal/", "post-sitemap.xml", true, false, 0, false],
    ]);
    // The redirect, the broken page and the subdomain's page are none of the website's pages.
    expect(rows.some((row) => row.page === "/old-page/" || row.page === "/gone/" || row.page === "/x/")).toBe(false);
    // Hakken's kind: by the address, else as judged.
    expect(rows.find((row) => row.page === "/")?.pageType).toBe("HOME");
    expect(rows.find((row) => row.page === "/ai-agency/")?.pageType).toBe("SERVICE");
  });

  test("Search Console's pages kept as places in its build's book are named from the book, read once", async () => {
    // As a collection keeps them since 2026-10-08: the rebuild reads the book itself, once (collection-reliability-plan.md, RR3).
    const t = harness();
    const owner = await company(t, "Ronins");
    await collected(t, owner.websiteId);
    await console90(t, owner, []);
    await t.run(async (ctx) => {
      const period = (await ctx.db.query("searchConsolePeriods").withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", owner.holdId)).first())!;
      const { records, places } = bookRecords(SHOWN.map(([address]) => address));
      for (const { record, terms } of records) {
        await ctx.db.insert("searchConsolePeriodBooks", { companyWebsiteId: owner.holdId, searchType: "web", builtAt: period.builtAt, kind: "page", record, terms });
      }
      await ctx.db.patch(period._id, {
        keys: packNumbers(SHOWN.map(([address]) => places.get(address)!)),
        clicks: packNumbers(SHOWN.map(([, clicks]) => clicks)),
        impressions: packNumbers(SHOWN.map(() => 100)),
        positionSums: packNumbers(SHOWN.map(() => 500)),
      });
    });
    await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId });

    const rows = await holdRows(t, owner.holdId);
    expect(rows.filter((row) => row.shown).map((row) => [row.page, row.clicks])).toEqual([
      ["/", 150],
      ["/ai-agency", 0],
      ["/ai-agency/", 453],
      ["/author/anthony/", 15],
      ["/hub/bad-websites/", 122],
    ]);
  });

  test("counts the four figures and the four gaps once, for the screen to read", async () => {
    const t = harness();
    const { holdId, member } = await ronins(t);

    const read = await list(member, holdId);
    expect(read.own).toBe(true);
    expect(read.summary).toMatchObject({
      pages: 9, sitemap: 7, crawled: 6, shown: 5, ranking: 2,
      neverShown: 4, notInSitemap: 2, crawledNotInSitemap: 1, notCrawled: 2,
      sitemapRead: true, sitemapSource: "ROBOTS", sitemapFiles: 3, sitemapCut: false, sitemapLimit: 5_000,
      console: true, consoleFrom: "2026-07-04", consoleTo: "2026-10-01", crawlDay: "2026-09-28",
    });
    expect(read.total).toBe(9);
    // Every figure and gap narrows the list to exactly its count.
    for (const filter of ["sitemap", "crawled", "shown", "ranking", "neverShown", "notInSitemap", "crawledNotInSitemap", "notCrawled"] as const) {
      expect((await list(member, holdId, { filter })).total, filter).toBe(read.summary?.[filter]);
    }
    expect((await list(member, holdId, { filter: "notInSitemap" })).rows.map((row) => row.page)).toEqual(["/author/anthony/", "/ai-agency"]);
    // The menu's count beside Your pages.
    expect((await member.query(api.sites.getMySite, { siteId: holdId }))?.counts.yourPages).toBe(9);
  });

  test("searches by address and sorts the whole list by its headings, the most clicks first to open", async () => {
    const t = harness();
    const { holdId, member } = await ronins(t);

    expect((await list(member, holdId)).rows.slice(0, 3).map((row) => row.page)).toEqual(["/ai-agency/", "/", "/hub/bad-websites/"]);
    expect((await list(member, holdId, { search: "hub" })).rows.map((row) => row.page)).toEqual(["/hub/bad-websites/", "/hub/website-development-and-design-is-broken/"]);
    expect((await list(member, holdId, { sort: "page" })).rows[0].page).toBe("/");
    // A page with no sitemap file sorts last, whichever way.
    const byFile = (await list(member, holdId, { sort: "file", direction: "desc" })).rows.map((row) => row.file);
    expect(byFile.slice(-2)).toEqual([null, null]);
    expect((await list(member, holdId, { rows: 4, page: 3 })).rows).toHaveLength(1);
  });

  test("rebuilt, only what changed is written, and a page found nowhere any more goes", async () => {
    const t = harness();
    const { holdId, websiteId } = await ronins(t);
    const before = new Map((await holdRows(t, holdId)).map((row) => [row.page, row]));

    // The author archive drops out of the crawl and of Search Console.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("siteCrawlPages").withIndex("by_site", (q) => q.eq("websiteId", websiteId)).collect()) {
        if (row.url.includes("/author/")) await ctx.db.delete(row._id);
      }
      const period = await ctx.db.query("searchConsolePeriods").withIndex("by_hold_country_type_list_period", (q) => q.eq("companyWebsiteId", holdId)).first();
      const clicks = unpackNumbers(period!.clicks);
      // This test writes its period as text (its setup), not as places in a build's book.
      const keys = typeof period!.keys === "string" ? [] : period!.keys;
      await ctx.db.patch(period!._id, { keys: keys.filter((key) => !key.includes("/author/")), clicks: packNumbers(clicks.slice(0, 4).concat(clicks.slice(5))) });
    });
    const rebuilt = await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId });

    const after = await holdRows(t, holdId);
    expect(after.some((row) => row.page === "/author/anthony/")).toBe(false);
    // The author archive went, and no other page was written again: none of them changed.
    expect(rebuilt).toEqual({ written: 0, removed: 1 });
    for (const row of after) expect(row, row.page).toEqual(before.get(row.page));
  });

  test("the company's limit holds its list to its own share of the sitemap, and says so", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await t.run(async (ctx) => {
      const readAt = Date.now();
      await ctx.db.insert("siteSitemaps", { websiteId: owner.websiteId, source: "ROBOTS", pages: 1_005, cut: false, day: "2026-10-03", readAt, files: [{ url: www("/hub-sitemap.xml"), pages: 1_005 }] });
      const pages = Array.from({ length: 1_005 }, (_, at) => ({ page: `/hub/article-${at}/`, file: "hub-sitemap.xml" }));
      await writeSitemapPart(ctx, { websiteId: owner.websiteId, readAt }, pages.slice(0, 1_000));
      await writeSitemapPart(ctx, { websiteId: owner.websiteId, readAt }, pages.slice(1_000));
      await ctx.db.insert("fanOutLimits", { companyId: owner.companyId, companyWebsiteId: owner.holdId, sitemapPagesRead: 1_000, updatedAt: Date.now() } as never);
    });
    await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId });

    const read = await list(owner.member, owner.holdId);
    expect(read.summary).toMatchObject({ pages: 1_000, sitemap: 1_000, sitemapCut: true, sitemapLimit: 1_000, console: false, crawlDay: null });
  });
});

describe("the group", () => {
  test("Hakken's own kind until the website has classifications", async () => {
    const t = harness();
    const { holdId, member } = await ronins(t);

    const read = await list(member, holdId, { sort: "page" });
    expect(read.groupBy).toBe("KIND");
    expect(read.rows.find((row) => row.page === "/ai-agency/")).toMatchObject({ group: null, kind: "SERVICE" });
    expect(read.groups.map((entry) => entry.value)).toEqual(expect.arrayContaining(["HOME", "SERVICE", "UNJUDGED"]));
    expect((await list(member, holdId, { group: "HOME" })).rows.map((row) => row.page)).toEqual(["/"]);
  });

  test("then the company's own: by the more exact line, by hand, or Not sorted — filtered and sorted by it", async () => {
    const t = harness();
    const { holdId, member } = await ronins(t);
    const ids = await t.run(async (ctx) => {
      const make = (name: string, type: "INFORMATIONAL" | "SERVICE" | "COMPANY") =>
        ctx.db.insert("pageClassifications", { companyWebsiteId: holdId, name, type, createdAt: Date.now(), updatedAt: Date.now() });
      const hub = await make("Content hub", "INFORMATIONAL");
      const services = await make("AI services", "SERVICE");
      const company = await make("Company", "COMPANY");
      const line = (classificationId: Id<"pageClassifications">, kind: "STARTS_WITH" | "CONTAINS" | "EXACT" | "SITEMAP_FILE", value: string) =>
        ctx.db.insert("pageClassificationLines", { companyWebsiteId: holdId, classificationId, kind, value, createdAt: Date.now() });
      await line(hub, "STARTS_WITH", "/hub/");
      await line(services, "CONTAINS", "ai-");
      await line(company, "SITEMAP_FILE", "post-sitemap.xml");
      // Set by hand: the home page is the company's.
      await ctx.db.insert("pageClassificationPicks", { companyWebsiteId: holdId, page: "/", classificationId: company, updatedAt: Date.now() });
      return { hub, services, company };
    });

    const read = await list(member, holdId, { sort: "page" });
    expect(read.groupBy).toBe("CLASSIFICATION");
    expect(read.groups.map((entry) => entry.label)).toEqual(["AI services", "Company", "Content hub"]);
    const group = (page: string) => read.rows.find((row) => row.page === page)?.group;
    expect(group("/")).toBe("Company");
    expect(group("/ai-agency/")).toBe("AI services");
    expect(group("/hub/bad-websites/")).toBe("Content hub");
    expect(group("/journal/")).toBe("Company");
    expect(group("/brand-design-agency/")).toBeNull();

    expect((await list(member, holdId, { group: ids.hub })).total).toBe(2);
    expect((await list(member, holdId, { group: "none" })).rows.map((row) => row.page))
      .toEqual(expect.arrayContaining(["/author/anthony/", "/brand-design-agency/", "/creative-digital-agency/"]));
    // Not sorted last, whichever way the group is sorted.
    const sorted = (await list(member, holdId, { sort: "group" })).rows.map((row) => row.group);
    expect(sorted[0]).toBe("AI services");
    expect(sorted.at(-1)).toBeNull();
  });
});

/**
 * Analytics' visits beside Search Console's clicks (google-analytics-plan.md
 * §4.6): one row says what every source knows of a page.
 */
describe("visits", () => {
  test("a page in Search Console and Analytics shows its clicks and its visits on one row", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await collected(t, owner.websiteId);
    await console90(t, owner, SHOWN);
    await analytics(t, owner);
    await t.run(async (ctx) => await landing90(ctx, owner.holdId, LANDED));
    await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId });

    const rows = await holdRows(t, owner.holdId);
    const row = (page: string) => rows.find((one) => one.page === page);
    expect(row("/ai-agency/")).toMatchObject({ shown: true, clicks: 453, visited: true, visits: 120 });
    expect(row("/journal/")).toMatchObject({ shown: false, clicks: 0, visited: true, visits: 4 });
    // "/ai-agency" without its slash is another page; nothing landed on it.
    expect(row("/ai-agency")).toMatchObject({ visited: false, visits: 0 });
    // Another website's page and "(not set)" land on none, and add no page.
    expect(rows.reduce((sum, one) => sum + (one.visits ?? 0), 0)).toBe(124);
    expect(rows).toHaveLength(9);
    // Your pages reads as before: no visits on its list yet.
    expect((await list(owner.member, owner.holdId)).summary).toMatchObject({ pages: 9, shown: 5 });
  });

  test("each page's title, as Analytics saw it most, sits on its row; a title adds no page", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await collected(t, owner.websiteId);
    await console90(t, owner, SHOWN);
    await analytics(t, owner);
    await t.run(async (ctx) => {
      await landing90(ctx, owner.holdId, LANDED);
      // The week's titles, by the hold's page numbers (google-analytics-plan.md GA27).
      const titled: Array<[string, string]> = [
        [www("/ai-agency/"), "AI Agency | Agent Automation Company | London And Surrey"],
        [www("/only-titled/"), "A page no other source found"],
      ];
      const numbers = await numbersOf(ctx, owner.holdId, titled.map(([address]) => address));
      for (const [at, [, title]] of titled.entries()) {
        await ctx.db.insert("googleAnalyticsTitles", { companyWebsiteId: owner.holdId, page: `~${numbers[at].toString(36)}`, title, views: 10, askedAt: 1 });
      }
    });
    await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId });

    const rows = await holdRows(t, owner.holdId);
    expect(rows.find((one) => one.page === "/ai-agency/")?.title).toBe("AI Agency | Agent Automation Company | London And Surrey");
    expect(rows.find((one) => one.page === "/journal/")?.title).toBeUndefined();
    expect(rows.some((one) => one.page === "/only-titled/")).toBe(false);
    expect(rows).toHaveLength(9);
  });

  test("without Google Analytics connected with figures, no page was visited", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await collected(t, owner.websiteId);
    await analytics(t, owner, "COUNTING");
    await t.run(async (ctx) => await landing90(ctx, owner.holdId, LANDED));
    await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId });

    expect((await holdRows(t, owner.holdId)).every((row) => row.visited === false && row.visits === 0)).toBe(true);
  });

  test("rebuilt, a row is written again only when its visits moved", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await collected(t, owner.websiteId);
    await console90(t, owner, SHOWN);
    await analytics(t, owner);
    await t.run(async (ctx) => await landing90(ctx, owner.holdId, LANDED));
    await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId });
    const before = new Map((await holdRows(t, owner.holdId)).map((row) => [row.page, row]));

    expect(await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId })).toEqual({ written: 0, removed: 0 });

    // The next collection: two more visits landed on the journal.
    await t.run(async (ctx) => await landing90(ctx, owner.holdId, LANDED.map(([address, visits]) => [address, address === www("/journal/") ? visits + 2 : visits])));
    expect(await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId })).toEqual({ written: 1, removed: 0 });
    for (const row of await holdRows(t, owner.holdId)) {
      if (row.page === "/journal/") expect(row).toMatchObject({ _id: before.get(row.page)!._id, visits: 6 });
      else expect(row, row.page).toEqual(before.get(row.page));
    }
  });

  test("a row from before visits reads as none: rewritten only for a page visits landed on", async () => {
    const t = harness();
    const owner = await ronins(t);
    // As written before visits were added: no visited, no visits.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", owner.holdId)).collect()) {
        const { _id, _creationTime, visited: _visited, visits: _visits, ...rest } = row;
        await ctx.db.replace(_id, rest);
      }
    });
    expect(await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId })).toEqual({ written: 0, removed: 0 });

    await analytics(t, owner);
    await t.run(async (ctx) => await landing90(ctx, owner.holdId, LANDED));
    expect(await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId })).toEqual({ written: 2, removed: 0 });
    const rows = await holdRows(t, owner.holdId);
    expect(rows.filter((row) => row.visited !== undefined).map((row) => [row.page, row.visits])).toEqual([["/ai-agency/", 120], ["/journal/", 4]]);
  });

  test("a read part-way through a new build reads the new build from its start", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await analytics(t, owner);
    await t.run(async (ctx) => await landing90(ctx, owner.holdId, LANDED));

    const first = await t.query(internal.holdPages.landingVisits, { holdId: owner.holdId });
    expect(first).toMatchObject({ slot: 0, next: null });
    // "(not set)" is no page: only the three numbered.
    expect(first && "rows" in first ? first.rows : []).toHaveLength(3);
    // A collection swapped its new build into the other slot.
    await t.run(async (ctx) => {
      const slot = await ctx.db.query("googleAnalyticsPeriodSlots").withIndex("by_hold_key", (q) => q.eq("companyWebsiteId", owner.holdId)).first();
      await ctx.db.patch(slot!._id, { slot: 1 });
    });
    expect(await t.query(internal.holdPages.landingVisits, { holdId: owner.holdId, slot: 0, start: 0 })).toEqual({ moved: true });
  });
});

describe("when Google Analytics is collected, stopped or switched", () => {
  beforeEach(() => useFixedDay());
  afterEach(() => vi.useRealTimers());

  test("a finished collection asks for the website's pages, which then carry its visits", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await collected(t, owner.websiteId);
    const connectionId = await analytics(t, owner);
    await t.run(async (ctx) => await landing90(ctx, owner.holdId, LANDED));

    await t.mutation(internal.googleAnalyticsCollect.finishCollection, { connectionId, property: "properties/1", weekly: false, firstDone: false });
    const asked = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));
    expect(asked).toContain("holdPages:requestRebuild");
    await finishScheduled(t);

    expect((await holdRows(t, owner.holdId)).find((row) => row.page === "/ai-agency/")).toMatchObject({ visited: true, visits: 120 });
  });

  test("disconnecting it, or choosing another property than its figures came from, notes the website's pages for that night", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await collected(t, owner.websiteId);
    const connectionId = await analytics(t, owner);
    const admin = await t.run(async (ctx) => await ctx.db.insert("users", { name: "Admin", email: "admin@ronins.test", role: "ADMIN", companyId: owner.companyId, createdAt: Date.now() }));
    const asAdmin = t.withIdentity({ subject: admin });
    // Rebuilt, then a minute on: what changes next is after the rebuild began. The clock moves; nothing scheduled runs.
    const rebuilt = async () => {
      await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: owner.holdId });
      vi.setSystemTime(Date.now() + 60_000);
    };

    await rebuilt();
    expect(await notedChanged(t, owner.holdId)).toBe(false);
    await asAdmin.mutation(api.googleAnalyticsConnect.disconnectGoogleAnalytics, { siteId: owner.holdId });
    expect(await notedChanged(t, owner.holdId)).toBe(true);

    // Signed in again, the same property chosen: its figures stand, nothing to note.
    const choices = [
      { property: "properties/1", displayName: "Ronins", accountName: "Ronins", stream: null, checked: true },
      { property: "properties/2", displayName: "Ronins (old)", accountName: "Ronins", stream: null, checked: true },
    ];
    await rebuilt();
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { status: "CHOOSING", choices }));
    await asAdmin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId: owner.holdId, property: "properties/1" });
    expect(await notedChanged(t, owner.holdId)).toBe(false);
    // Another property: its figures go, and their visits with them.
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { status: "CHOOSING", choices }));
    await asAdmin.mutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty, { siteId: owner.holdId, property: "properties/2" });
    expect(await notedChanged(t, owner.holdId)).toBe(true);
  });
});

describe("only the company's own", () => {
  test("two companies owning the website each see only their own Search Console; neither can read the other's list", async () => {
    const t = harness();
    const ronin = await ronins(t);
    const other = await company(t, "Other", ronin.websiteId);
    await console90(t, other, [[www("/ai-agency/"), 7]]);
    await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: other.holdId });

    const mine = await list(ronin.member, ronin.holdId);
    const theirs = await list(other.member, other.holdId);
    expect(mine.rows.find((row) => row.page === "/ai-agency/")?.clicks).toBe(453);
    expect(theirs.rows.find((row) => row.page === "/ai-agency/")?.clicks).toBe(7);
    expect(theirs.summary?.shown).toBe(1);
    // The shared sitemap, crawl and rankings are the same for both.
    expect(theirs.summary).toMatchObject({ sitemap: 7, crawled: 6, ranking: 2 });

    await expect(list(other.member, ronin.holdId)).rejects.toThrow(/not one your company holds/);
    await expect(other.member.mutation(api.yourPages.ensureYourPages, { siteId: ronin.holdId })).rejects.toThrow(/not one your company holds/);
  });

  test("a competitor answers that Your pages is the company's own, and is never rebuilt", async () => {
    const t = harness();
    const ronin = await ronins(t);
    const rivalId = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "rival.example", displayHost: "rival.example", firstSeenAt: Date.now() });
      return await ctx.db.insert("companyWebsites", { companyId: ronin.companyId, websiteId, relationship: "TRACKED", againstWebsiteId: ronin.websiteId, createdAt: Date.now() });
    });
    await t.action(internal.holdPagesSteps.rebuildHoldPages, { holdId: rivalId });

    const read = await list(ronin.member, rivalId);
    expect(read).toMatchObject({ own: false, summary: null, rows: [], total: 0 });
    expect(await holdRows(t, rivalId)).toEqual([]);
    expect((await ronin.member.query(api.sites.getMySite, { siteId: rivalId }))?.counts.yourPages).toBeNull();
  });

  test("a sitemap, crawl or rankings change asks for every owner's rebuild, never a competitor's", async () => {
    const t = harness();
    const ronin = await company(t, "Ronins");
    const other = await company(t, "Other", ronin.websiteId);
    await t.run(async (ctx) => {
      await ctx.db.insert("companyWebsites", { companyId: other.companyId, websiteId: ronin.websiteId, relationship: "TRACKED", createdAt: Date.now() });
    });
    await t.mutation(internal.holdPages.requestWebsiteRebuilds, { websiteId: ronin.websiteId });
    await t.mutation(internal.holdPages.requestWebsiteRebuilds, { websiteId: ronin.websiteId });

    const asked = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name === "holdPagesSteps:rebuildHoldPages").map((job) => (job.args[0] as { holdId: string }).holdId));
    expect(asked.sort()).toEqual([ronin.holdId, other.holdId].sort());
  });

  test("every read of the rows goes through the company's hold", () => {
    // Read as source, like websiteTenancyGuard.test.ts: a read by page or by website
    // is one careless edit from showing another company's list.
    const dir = join(process.cwd(), "convex");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.startsWith("_generated"));
    const offenders = files.flatMap((file) => Array.from(readFileSync(join(dir, file), "utf8").matchAll(/\.query\(\s*["']holdPages["']\s*\)([\s\S]{0,200})/g))
      .flatMap((match) => {
        const index = /withIndex\(\s*["']([a-z_]+)["']/.exec(match[1])?.[1] ?? "(no index)";
        return index.startsWith("by_hold") ? [] : [`${file}: holdPages read by ${index}`];
      }));
    expect(offenders).toEqual([]);
  });
});

describe("the download", () => {
  test("is the whole list, made on the server, in the table's order", async () => {
    const t = harness();
    const { holdId, member } = await ronins(t);

    const file = await member.action(api.siteExports.exportSiteTable, { siteId: holdId, kind: "yourPages", sort: "clicks", direction: "desc" });
    const lines = file.csv.split("\n");
    expect(lines[0]).toBe("page,group,sitemap_file,crawled,shown_by_google,ranks,clicks_90_days");
    expect(lines[1]).toBe("/ai-agency/,SERVICE,page-sitemap.xml,true,true,true,453");
    expect(lines).toHaveLength(10);
    expect(file.complete).toBe(true);
  });
});

describe("a website Google shows many pages of", () => {
  test("every page its Search Console shows is read, more than one read may return (2026-10-06)", async () => {
    // morehandles.co.uk's 90 days showed 13,813 pages: one read holds at most 8,192, and its Your pages never rebuilt.
    const t = harness();
    const holdId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const pages = Array.from({ length: 4_500 }, (_, index) => `https://acme-shop.test/p/${String(index).padStart(5, "0")}`);
      for (let part = 0; part * 2_000 < pages.length; part += 1) {
        const keys = pages.slice(part * 2_000, (part + 1) * 2_000);
        await ctx.db.insert("searchConsolePeriods", {
          companyWebsiteId: holdId, searchType: "web", list: "page", period: "thisQuarter", which: "NOW", part, from: "2026-07-01", to: "2026-09-28",
          keys, clicks: keys.map(() => 1), impressions: keys.map(() => 10), positionSums: keys.map(() => 30), builtAt: 1,
        });
      }
      return holdId;
    });
    // Two parts a read, of one build (collection-reliability-plan.md, RR3): never the whole period at once.
    const first = await t.query(internal.holdPages.consolePagesPart, { holdId, period: "thisQuarter", start: 0 });
    if (!first || "moved" in first) throw new Error("expected the first parts");
    expect(first.rows).toHaveLength(4_000);
    expect(first.next).toBe(2);
    const second = await t.query(internal.holdPages.consolePagesPart, { holdId, period: "thisQuarter", builtAt: first.builtAt, start: first.next! });
    if (!second || "moved" in second) throw new Error("expected the last part");
    expect(second.rows).toHaveLength(500);
    expect(second.next).toBeNull();
    expect(new Set([...first.rows, ...second.rows].map((page) => page.key)).size).toBe(4_500);

    // A new build swapped in between reads is noticed, so a rebuild never joins two builds' pages.
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsolePeriods", {
        companyWebsiteId: holdId, searchType: "web", list: "page", period: "thisQuarter", which: "NOW", part: 0, from: "2026-07-02", to: "2026-09-29",
        keys: ["https://acme-shop.test/new"], clicks: [1], impressions: [10], positionSums: [30], builtAt: 2,
      });
    });
    expect(await t.query(internal.holdPages.consolePagesPart, { holdId, period: "thisQuarter", builtAt: first.builtAt, start: 2 })).toEqual({ moved: true });
  });
});
