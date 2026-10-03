import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

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
    for (const [page, file] of SITEMAP) await ctx.db.insert("siteSitemapPages", { websiteId, page, file, day: "2026-10-03", readAt });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "site_crawl", family: "On-Page", mode: "QUEUED", websiteId, taskArgsJson: "{}", status: "READY",
      tag: `crawl-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    await ctx.db.insert("siteCrawls", { websiteId, pullId, day: "2026-09-28", pagesCrawled: 8, issues: [], createdAt: Date.now() } as never);
    for (const [url, resourceType, statusCode] of CRAWLED) {
      await ctx.db.insert("siteCrawlPages", { websiteId, pullId, day: "2026-09-28", url, page: new URL(url).pathname, resourceType, statusCode, problems: [] });
    }
    const rank = (page: string, locationCode: number) => ctx.db.insert("sitePageRanks", {
      websiteId, locationCode, page, url: www(page), section: "/", keywords: 3, bestPosition: 4, top3: 0, volumeSum: 100,
      topKeyword: "ai agency", topKeywordVolume: 90, firstSeenDay: "2026-09-01", day: "2026-10-01", searchText: page, rebuildId: "r1", updatedAt: Date.now(),
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
      companyWebsiteId: at.holdId, searchType: "web", list: "page", period: "90", which: "NOW", part: 0, from: "2026-07-04", to: "2026-10-01",
      keys: shown.map(([key]) => key), clicks: shown.map(([, clicks]) => clicks), impressions: shown.map(() => 100), positionSums: shown.map(() => 500),
      builtAt: Date.now(),
    } as never);
  });
}

async function ronins(t: Harness) {
  const owner = await company(t, "Ronins");
  await collected(t, owner.websiteId);
  await console90(t, owner, SHOWN);
  await t.action(internal.holdPages.rebuildHoldPages, { holdId: owner.holdId });
  return owner;
}

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
      await ctx.db.patch(period!._id, { keys: period!.keys.filter((key) => !key.includes("/author/")), clicks: period!.clicks.slice(0, 4).concat(period!.clicks.slice(5)) });
    });
    await t.action(internal.holdPages.rebuildHoldPages, { holdId });

    const after = await holdRows(t, holdId);
    expect(after.some((row) => row.page === "/author/anthony/")).toBe(false);
    for (const row of after) expect(row.builtAt, row.page).toBe(before.get(row.page)?.builtAt);
  });

  test("the company's limit holds its list to its own share of the sitemap, and says so", async () => {
    const t = harness();
    const owner = await company(t, "Ronins");
    await t.run(async (ctx) => {
      const readAt = Date.now();
      await ctx.db.insert("siteSitemaps", { websiteId: owner.websiteId, source: "ROBOTS", pages: 1_005, cut: false, day: "2026-10-03", readAt, files: [{ url: www("/hub-sitemap.xml"), pages: 1_005 }] });
      for (let at = 0; at < 1_005; at += 1) {
        await ctx.db.insert("siteSitemapPages", { websiteId: owner.websiteId, page: `/hub/article-${at}/`, file: "hub-sitemap.xml", day: "2026-10-03", readAt });
      }
      await ctx.db.insert("fanOutLimits", { companyId: owner.companyId, companyWebsiteId: owner.holdId, sitemapPagesRead: 1_000, updatedAt: Date.now() } as never);
    });
    await t.action(internal.holdPages.rebuildHoldPages, { holdId: owner.holdId });

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

describe("only the company's own", () => {
  test("two companies owning the website each see only their own Search Console; neither can read the other's list", async () => {
    const t = harness();
    const ronin = await ronins(t);
    const other = await company(t, "Other", ronin.websiteId);
    await console90(t, other, [[www("/ai-agency/"), 7]]);
    await t.action(internal.holdPages.rebuildHoldPages, { holdId: other.holdId });

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
    await t.action(internal.holdPages.rebuildHoldPages, { holdId: rivalId });

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
      .filter((job) => job.name === "holdPages:rebuildHoldPages").map((job) => (job.args[0] as { holdId: string }).holdId));
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
