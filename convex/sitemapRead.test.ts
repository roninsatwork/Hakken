import { gzipSync } from "node:zlib";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { SITEMAP_FILE_BYTES, SITEMAP_TEXT_BYTES } from "./utils/sitemapFetch";

/**
 * Reading a website's sitemap for Your pages (docs/plans/active/page-groups-
 * plan.md), end to end through the real fetcher: the platform's guard against
 * private and internal addresses runs as it does live — only DNS and the
 * connection are faked — so robots.txt, a redirect to the www twin, an index,
 * page files and a gzipped one are read as a website serves them, another
 * website is never reached, and the limit stops the reading.
 */
const { served, connected } = vi.hoisted(() => ({
  served: { pages: {} as Record<string, { status?: number; body?: string | Uint8Array<ArrayBuffer>; location?: string }> },
  connected: [] as string[],
}));

/** The names the faked DNS knows: public addresses, but one name that resolves inside a private network. */
const DNS: Record<string, string> = {
  "ronins.co.uk": "104.21.1.1",
  "www.ronins.co.uk": "104.21.1.2",
  "evil.test": "93.184.216.34",
  "intranet.example": "10.0.0.5",
};

vi.mock("./utils/safeWorkflowHttp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./utils/safeWorkflowHttp")>();
  return {
    ...actual,
    // The real check, against the faked DNS: a private answer is refused as it would be live.
    assertWorkflowTargetResolvesPublicly: (url: string) =>
      actual.assertWorkflowTargetResolvesPublicly(url, async (host: string) => (DNS[host] ? [{ address: DNS[host] }] : [])),
    fetchPinnedAddress: async (url: string) => {
      connected.push(url);
      const page = served.pages[url];
      if (!page) return new Response("Not found", { status: 404 });
      if (page.location) return new Response(null, { status: page.status ?? 301, headers: { location: page.location } });
      return new Response(page.body ?? "", { status: page.status ?? 200 });
    },
  };
});

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const urlset = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls
    .map((url) => `\n\t<url>\n\t\t<loc>${url}</loc>\n\t\t<image:image><image:loc>${url}image.webp</image:loc></image:image>\n\t</url>`)
    .join("")}\n</urlset>`;
const index = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="//www.ronins.co.uk/main-sitemap.xsl"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((url) => `<sitemap><loc>${url}</loc><lastmod>2026-10-02T15:13:07+00:00</lastmod></sitemap>`).join("")}</sitemapindex>`;

const www = (path: string) => `https://www.ronins.co.uk${path}`;

/** ronins.co.uk as it serves itself on 2026-10-03, in small: robots.txt on the bare host redirects to www, which names the index. */
function roninsWeb() {
  served.pages = {
    "https://ronins.co.uk/robots.txt": { status: 301, location: www("/robots.txt") },
    [www("/robots.txt")]: { body: "User-agent: *\nDisallow: /wp-admin/\nCrawl-delay: 10\n\nSitemap: https://www.ronins.co.uk/sitemap_index.xml" },
    [www("/sitemap_index.xml")]: {
      body: index([www("/post-sitemap.xml.gz"), www("/page-sitemap.xml"), www("/case_study-sitemap.xml"), www("/content-hub-sitemap.xml")]),
    },
    [www("/page-sitemap.xml")]: { body: urlset([www("/"), www("/ai-agency/"), www("/venture-studio/")]) },
    [www("/case_study-sitemap.xml")]: { body: urlset([www("/case-study/cysiam/")]) },
    [www("/content-hub-sitemap.xml")]: { body: urlset([www("/hub/bad-websites/"), www("/hub/brand-audit/")]) },
    // Gzipped, as large sites serve them.
    [www("/post-sitemap.xml.gz")]: { body: new Uint8Array(gzipSync(urlset([www("/journal/"), www("/our-new-office-in-guildford/")]))) },
  };
}

async function owned(t: Harness, host = "ronins.co.uk", limit?: number) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: host, createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
    if (limit) await ctx.db.insert("fanOutLimits", { companyId, companyWebsiteId: holdId, sitemapPagesRead: limit, updatedAt: Date.now() } as never);
    return { companyId, websiteId, holdId };
  });
}

async function stored(t: Harness, websiteId: Id<"websites">) {
  return await t.run(async (ctx) => ({
    reading: await ctx.db.query("siteSitemaps").withIndex("by_website", (q) => q.eq("websiteId", websiteId)).unique(),
    pages: await ctx.db.query("siteSitemapPages").withIndex("by_website_read", (q) => q.eq("websiteId", websiteId)).collect(),
    scheduled: (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => ({ name: job.name, args: job.args[0] })),
  }));
}

beforeEach(() => {
  served.pages = {};
  connected.length = 0;
});
// A test that moves the clock between readings puts it back.
afterEach(() => vi.useRealTimers());

describe("reading a website's sitemap", () => {
  test("robots.txt, redirected to www, then its index and four files — one gzipped — every page kept with the file that lists it", async () => {
    const t = harness();
    roninsWeb();
    const { websiteId, holdId } = await owned(t);

    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });

    const { reading, pages, scheduled } = await stored(t, websiteId);
    expect(reading).toMatchObject({ source: "ROBOTS", pages: 8, cut: false });
    expect(reading?.files).toEqual([
      { url: www("/post-sitemap.xml.gz"), pages: 2 },
      { url: www("/page-sitemap.xml"), pages: 3 },
      { url: www("/case_study-sitemap.xml"), pages: 1 },
      { url: www("/content-hub-sitemap.xml"), pages: 2 },
    ]);
    expect(pages.map((row) => [row.page, row.file])).toEqual([
      ["/journal/", "post-sitemap.xml.gz"],
      ["/our-new-office-in-guildford/", "post-sitemap.xml.gz"],
      ["/", "page-sitemap.xml"],
      ["/ai-agency/", "page-sitemap.xml"],
      ["/venture-studio/", "page-sitemap.xml"],
      ["/case-study/cysiam/", "case_study-sitemap.xml"],
      ["/hub/bad-websites/", "content-hub-sitemap.xml"],
      ["/hub/brand-audit/", "content-hub-sitemap.xml"],
    ]);
    expect(pages.every((row) => row.readAt === reading?.readAt)).toBe(true);
    // The company's Your pages is asked for, from the new reading.
    expect(scheduled).toContainEqual({ name: "holdPages:rebuildHoldPages", args: { holdId } });
  });

  test("another website is never reached — not through robots.txt, not through a redirect — nor a host inside a private network", async () => {
    const t = harness();
    const { websiteId } = await owned(t);
    served.pages = {
      "https://ronins.co.uk/robots.txt": { body: "Sitemap: https://evil.test/sitemap.xml\nSitemap: https://www.ronins.co.uk/sitemap.xml" },
      // A file on the website that sends the reading elsewhere, and one sent to plain http.
      [www("/sitemap.xml")]: { body: index([www("/moved.xml"), www("/insecure.xml"), www("/pages.xml")]) },
      [www("/moved.xml")]: { status: 302, location: "https://evil.test/pages.xml" },
      [www("/insecure.xml")]: { status: 301, location: "http://www.ronins.co.uk/pages.xml" },
      [www("/pages.xml")]: { body: urlset([www("/"), "https://evil.test/not-ours/"]) },
      "https://evil.test/sitemap.xml": { body: urlset(["https://evil.test/a/"]) },
      "https://evil.test/pages.xml": { body: urlset(["https://evil.test/b/"]) },
    };

    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });

    expect(connected.some((url) => url.includes("evil.test"))).toBe(false);
    expect(connected.some((url) => url.startsWith("http:"))).toBe(false);
    const { reading, pages } = await stored(t, websiteId);
    expect(reading?.files).toEqual([
      { url: "https://evil.test/sitemap.xml", pages: 0, problem: "OTHER_WEBSITE" },
      { url: www("/moved.xml"), pages: 0, problem: "OTHER_WEBSITE" },
      { url: www("/insecure.xml"), pages: 0, problem: "OTHER_WEBSITE" },
      { url: www("/pages.xml"), pages: 1 },
    ]);
    expect(pages.map((row) => row.page)).toEqual(["/"]);

    // A website whose name resolves to a private address: nothing is fetched, and the reading says none was reached.
    const inside = await owned(t, "intranet.example");
    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId: inside.websiteId });
    expect(connected.some((url) => url.includes("intranet.example"))).toBe(false);
    const refused = await stored(t, inside.websiteId);
    expect(refused.reading).toMatchObject({ source: "NONE", pages: 0, problem: "UNREACHABLE" });
    expect(refused.pages).toEqual([]);
  });

  test("stops at the company's limit and says so, and a second reading replaces the first", async () => {
    const t = harness();
    const { websiteId } = await owned(t, "ronins.co.uk", 1_000);
    const many = Array.from({ length: 1_200 }, (_unused, at) => www(`/hub/article-${at}/`));
    served.pages = {
      "https://ronins.co.uk/robots.txt": { body: "Sitemap: https://www.ronins.co.uk/sitemap.xml" },
      [www("/sitemap.xml")]: { body: urlset(many) },
    };

    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });
    const first = await stored(t, websiteId);
    expect(first.reading).toMatchObject({ pages: 1_000, cut: true });
    expect(first.pages).toHaveLength(1_000);

    served.pages[www("/sitemap.xml")] = { body: urlset([www("/"), www("/about-us/")]) };
    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });
    const second = await stored(t, websiteId);
    expect(second.reading).toMatchObject({ pages: 2, cut: false });
    expect(second.pages.map((row) => row.page)).toEqual(["/", "/about-us/"]);
  });

  test("a reading that lists the same pages keeps the ones held: none written or removed, and Your pages reads them", async () => {
    const t = harness();
    roninsWeb();
    const { websiteId, holdId } = await owned(t);
    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });
    const first = await stored(t, websiteId);

    // Each reading a minute apart, as readings are hours apart.
    vi.setSystemTime(Date.now() + 60_000);
    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });
    const second = await stored(t, websiteId);
    // The same rows, not written again (dataforseo-cost-plan.md, A3); the reading itself is the newer one.
    expect(second.pages).toEqual(first.pages);
    expect(second.reading?.readAt).toBeGreaterThan(first.reading!.readAt);
    expect(second.reading?.pagesReadAt).toBe(first.reading!.readAt);
    const head = await t.query(internal.holdPages.rebuildHead, { holdId });
    expect(head?.sitemap?.readAt).toBe(first.reading!.readAt);

    // A page added: the new reading's pages written, the kept ones gone.
    served.pages[www("/case_study-sitemap.xml")] = { body: urlset([www("/case-study/cysiam/"), www("/case-study/korda/")]) };
    vi.setSystemTime(Date.now() + 60_000);
    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });
    const third = await stored(t, websiteId);
    expect(third.pages).toHaveLength(9);
    expect(third.reading?.pagesReadAt).toBeUndefined();
    expect(third.pages.every((row) => row.readAt === third.reading?.readAt)).toBe(true);
  });

  test("a file past its size cap is noted, not read: one too big to fetch, and a gzip that unzips past 50 MB", async () => {
    const t = harness();
    const { websiteId } = await owned(t);
    served.pages = {
      "https://ronins.co.uk/robots.txt": { body: "Sitemap: https://www.ronins.co.uk/big.xml\nSitemap: https://www.ronins.co.uk/bomb.xml.gz\nSitemap: https://www.ronins.co.uk/ok.xml" },
      [www("/big.xml")]: { body: new Uint8Array(SITEMAP_FILE_BYTES + 1) },
      [www("/bomb.xml.gz")]: { body: new Uint8Array(gzipSync(new Uint8Array(SITEMAP_TEXT_BYTES + 1))) },
      [www("/ok.xml")]: { body: urlset([www("/")]) },
    };

    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });

    const { reading } = await stored(t, websiteId);
    expect(reading?.files).toEqual([
      { url: www("/big.xml"), pages: 0, problem: "TOO_LARGE" },
      { url: www("/bomb.xml.gz"), pages: 0, problem: "TOO_LARGE" },
      { url: www("/ok.xml"), pages: 1 },
    ]);
  });

  test("a website that answers nothing leaves its last reading in place", async () => {
    const t = harness();
    roninsWeb();
    const { websiteId } = await owned(t);
    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });
    const before = await stored(t, websiteId);

    served.pages = {
      "https://ronins.co.uk/robots.txt": { status: 503 },
      "https://ronins.co.uk/sitemap_index.xml": { status: 503 },
      "https://ronins.co.uk/sitemap.xml": { status: 503 },
      "https://ronins.co.uk/wp-sitemap.xml": { status: 503 },
    };
    await t.action(internal.sitemapRead.readWebsiteSitemap, { websiteId });
    const after = await stored(t, websiteId);
    expect(after.reading?.readAt).toBe(before.reading?.readAt);
    expect(after.pages).toHaveLength(8);
  });

  test("a finished collection reads each of the company's own websites, once — never a competitor's", async () => {
    const t = harness();
    const { companyId, websiteId } = await owned(t);
    const { rivalWebsite, cycleId } = await t.run(async (ctx) => {
      const rivalWebsite = await ctx.db.insert("websites", { host: "rival.example", displayHost: "rival.example", firstSeenAt: Date.now() });
      await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalWebsite, relationship: "TRACKED", againstWebsiteId: websiteId, createdAt: Date.now() });
      const cycleId = await ctx.db.insert("seoCollectionCycles", {
        companyId, trigger: "MANUAL", status: "DONE", plannedCount: 0, reusedCount: 0, sentCount: 0, readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
      } as never);
      return { rivalWebsite, cycleId };
    });

    await t.mutation(internal.sitemaps.readCycleSitemaps, { cycleId });
    // Asked again while the first is waiting: still once.
    await t.mutation(internal.sitemaps.readCycleSitemaps, { cycleId });

    const reads = (await stored(t, websiteId)).scheduled.filter((job) => job.name === "sitemapRead:readWebsiteSitemap");
    expect(reads).toEqual([{ name: "sitemapRead:readWebsiteSitemap", args: { websiteId } }]);
    expect(reads.some((job) => (job.args as { websiteId: string }).websiteId === rivalWebsite)).toBe(false);
  });
});
