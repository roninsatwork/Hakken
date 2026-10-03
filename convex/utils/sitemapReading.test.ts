import { describe, expect, test } from "vitest";
import {
  MAX_INDEX_DEPTH,
  fileNameOf,
  onWebsite,
  parseSitemap,
  readSitemap,
  robotsSitemaps,
  sitemapAddress,
  type FetchText,
} from "./sitemapReading";

/**
 * Reading a website's sitemap (docs/plans/active/page-groups-plan.md):
 * where it is found, what may be read, how deep, and where it stops — driven
 * here with a faked web, as `sitemapRead.test.ts` drives the real fetcher.
 */

/** A web of addresses and their texts; anything else is a 404. Records what was asked for. */
function web(pages: Record<string, string>) {
  const asked: string[] = [];
  const fetchText: FetchText = async (url) => {
    asked.push(url);
    return url in pages ? { ok: true, url, text: pages[url] } : { ok: false, problem: "MISSING:404", missing: true };
  };
  return { fetchText, asked };
}

const urlset = (urls: string[]) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls
    .map((url) => `<url><loc>${url}</loc><lastmod>2026-09-01T10:00:00+00:00</lastmod><image:image><image:loc>${url}hero.png</image:loc></image:image></url>`)
    .join("")}</urlset>`;
const index = (urls: string[]) =>
  `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<sitemap><loc>${url}</loc></sitemap>`).join("")}</sitemapindex>`;

describe("reading a sitemap", () => {
  test("robots.txt, then its index, then each file — every page once, with the file that lists it", async () => {
    const { fetchText, asked } = web({
      "https://ronins.co.uk/robots.txt": "User-agent: *\nDisallow: /wp-admin/\n\nSitemap: https://www.ronins.co.uk/sitemap_index.xml\n",
      "https://www.ronins.co.uk/sitemap_index.xml": index([
        "https://www.ronins.co.uk/page-sitemap.xml",
        "https://www.ronins.co.uk/post-sitemap.xml",
      ]),
      "https://www.ronins.co.uk/page-sitemap.xml": urlset(["https://www.ronins.co.uk/", "https://www.ronins.co.uk/ai-agency/"]),
      // The home page again, a jump link and a query: each folds into a page already listed.
      "https://www.ronins.co.uk/post-sitemap.xml": urlset(["https://www.ronins.co.uk/journal/", "https://ronins.co.uk/#top", "https://www.ronins.co.uk/AI-Agency/?utm=x"]),
    });
    const reading = await readSitemap({ host: "ronins.co.uk", limit: 5_000, fetchText });

    expect(reading.source).toBe("ROBOTS");
    expect(reading.cut).toBe(false);
    expect(reading.pages).toEqual([
      { page: "/", file: "page-sitemap.xml", lastmod: "2026-09-01T10:00:00+00:00" },
      { page: "/ai-agency/", file: "page-sitemap.xml", lastmod: "2026-09-01T10:00:00+00:00" },
      { page: "/journal/", file: "post-sitemap.xml", lastmod: "2026-09-01T10:00:00+00:00" },
    ]);
    expect(reading.files).toEqual([
      { url: "https://www.ronins.co.uk/page-sitemap.xml", pages: 2 },
      { url: "https://www.ronins.co.uk/post-sitemap.xml", pages: 1 },
    ]);
    // An image's address is never a page.
    expect(reading.pages.some((row) => row.page.endsWith("hero.png"))).toBe(false);
    expect(asked[0]).toBe("https://ronins.co.uk/robots.txt");
  });

  test("with no Sitemap line, the usual addresses in turn: /sitemap_index.xml, /sitemap.xml, /wp-sitemap.xml", async () => {
    const { fetchText, asked } = web({
      "https://example.com/robots.txt": "User-agent: *\nDisallow:\n",
      "https://example.com/wp-sitemap.xml": urlset(["https://example.com/about/"]),
    });
    const reading = await readSitemap({ host: "example.com", limit: 5_000, fetchText });

    expect(reading.source).toBe("USUAL_ADDRESS");
    expect(reading.pages).toEqual([{ page: "/about/", file: "wp-sitemap.xml", lastmod: "2026-09-01T10:00:00+00:00" }]);
    expect(asked).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/sitemap_index.xml",
      "https://example.com/sitemap.xml",
      "https://example.com/wp-sitemap.xml",
    ]);
  });

  test("none anywhere is said so; a website that answers nothing at all is told apart", async () => {
    const missing = await readSitemap({ host: "example.com", limit: 5_000, fetchText: web({}).fetchText });
    expect(missing).toMatchObject({ source: "NONE", pages: [], cut: false, problem: "NONE_FOUND" });

    const down = await readSitemap({ host: "example.com", limit: 5_000, fetchText: async () => ({ ok: false, problem: "TIMEOUT", missing: false }) });
    expect(down.problem).toBe("UNREACHABLE");
    // An HTML page where the sitemap should be is not a sitemap.
    const html = await readSitemap({ host: "example.com", limit: 5_000, fetchText: web({ "https://example.com/sitemap.xml": "<html><body>Not found</body></html>" }).fetchText });
    expect(html.source).toBe("NONE");
  });

  test("only the website's own host and its twin are read: another website's file is noted, never fetched", async () => {
    const { fetchText, asked } = web({
      "https://shop.example/robots.txt": "Sitemap: https://cdn.elsewhere.net/sitemap.xml\nSitemap: http://www.shop.example/sitemap.xml\n",
      "https://www.shop.example/sitemap.xml": index(["https://evil.test/inner.xml", "https://www.shop.example/inner.xml"]),
      "https://www.shop.example/inner.xml": urlset(["https://www.shop.example/a/", "https://other.example/b/"]),
    });
    const reading = await readSitemap({ host: "shop.example", limit: 5_000, fetchText });

    expect(asked).not.toContain("https://cdn.elsewhere.net/sitemap.xml");
    expect(asked).not.toContain("https://evil.test/inner.xml");
    // Its own http address is read over https.
    expect(asked).toContain("https://www.shop.example/sitemap.xml");
    expect(reading.files).toEqual(expect.arrayContaining([
      { url: "https://cdn.elsewhere.net/sitemap.xml", pages: 0, problem: "OTHER_WEBSITE" },
      { url: "https://evil.test/inner.xml", pages: 0, problem: "OTHER_WEBSITE" },
      { url: "https://www.shop.example/inner.xml", pages: 1 },
    ]));
    // A page on another website listed in its sitemap is not one of its pages.
    expect(reading.pages.map((row) => row.page)).toEqual(["/a/"]);
  });

  test("stops at the limit and says so", async () => {
    const urls = Array.from({ length: 30 }, (_unused, at) => `https://example.com/p${at}/`);
    const { fetchText, asked } = web({
      "https://example.com/robots.txt": "Sitemap: https://example.com/index.xml",
      "https://example.com/index.xml": index(["https://example.com/one.xml", "https://example.com/two.xml", "https://example.com/three.xml"]),
      "https://example.com/one.xml": urlset(urls.slice(0, 10)),
      "https://example.com/two.xml": urlset(urls.slice(10, 20)),
      "https://example.com/three.xml": urlset(urls.slice(20)),
    });
    const reading = await readSitemap({ host: "example.com", limit: 15, fetchText });

    expect(reading.cut).toBe(true);
    expect(reading.pages).toHaveLength(15);
    expect(reading.files).toEqual([{ url: "https://example.com/one.xml", pages: 10 }, { url: "https://example.com/two.xml", pages: 5 }]);
    expect(asked).not.toContain("https://example.com/three.xml");

    // Exactly the limit, with nothing left to read, is the whole sitemap.
    const whole = await readSitemap({ host: "example.com", limit: 30, fetchText });
    expect(whole.cut).toBe(false);
    expect(whole.pages).toHaveLength(30);
  });

  test(`follows indexes ${MAX_INDEX_DEPTH} levels deep and no further`, async () => {
    const { fetchText, asked } = web({
      "https://example.com/robots.txt": "Sitemap: https://example.com/a.xml",
      "https://example.com/a.xml": index(["https://example.com/b.xml"]),
      "https://example.com/b.xml": index(["https://example.com/c.xml", "https://example.com/pages.xml"]),
      "https://example.com/c.xml": index(["https://example.com/deep.xml"]),
      "https://example.com/pages.xml": urlset(["https://example.com/x/"]),
      "https://example.com/deep.xml": urlset(["https://example.com/too-deep/"]),
    });
    const reading = await readSitemap({ host: "example.com", limit: 5_000, fetchText });

    expect(reading.pages.map((row) => row.page)).toEqual(["/x/"]);
    expect(reading.files).toContainEqual({ url: "https://example.com/c.xml", pages: 0, problem: "TOO_DEEP" });
    expect(asked).not.toContain("https://example.com/deep.xml");
  });

  test("stops at its file cap and its time budget, noting what was left once", async () => {
    const files = Array.from({ length: 5 }, (_unused, at) => `https://example.com/s${at}.xml`);
    const pages: Record<string, string> = {
      "https://example.com/robots.txt": "Sitemap: https://example.com/index.xml",
      "https://example.com/index.xml": index(files),
    };
    files.forEach((file, at) => { pages[file] = urlset([`https://example.com/p${at}/`]); });

    const capped = await readSitemap({ host: "example.com", limit: 5_000, fetchText: web(pages).fetchText, maxFiles: 3 });
    expect(capped.pages).toHaveLength(2);
    expect(capped.files.at(-1)).toEqual({ url: "https://example.com/s2.xml", pages: 0, problem: "UNREAD:3" });

    let clock = 0;
    const late = await readSitemap({ host: "example.com", limit: 5_000, fetchText: web(pages).fetchText, budgetMs: 10, now: () => (clock += 4) });
    expect(late.files.at(-1)?.problem).toMatch(/^UNREAD:/);
  });
});

describe("the parts of a reading", () => {
  test("robots.txt's Sitemap lines, whatever their case, comments left out", () => {
    expect(robotsSitemaps("User-agent: *\nsitemap: https://a.com/one.xml # main\nSITEMAP:https://a.com/two.xml\nSitemap: https://a.com/one.xml\n"))
      .toEqual(["https://a.com/one.xml", "https://a.com/two.xml"]);
  });

  test("a sitemap's own entries — CDATA and entities read — not its images'", () => {
    expect(parseSitemap(`<urlset><url><loc><![CDATA[https://a.com/x?a=1&amp;b=2]]></loc><image:image><image:loc>https://a.com/i.png</image:loc></image:image></url><!-- <url><loc>https://a.com/hidden/</loc></url> --></urlset>`))
      .toEqual({ kind: "urlset", entries: [{ loc: "https://a.com/x?a=1&b=2" }] });
    expect(parseSitemap("https://a.com/one/\nhttps://a.com/two/\n")).toEqual({ kind: "urlset", entries: [{ loc: "https://a.com/one/" }, { loc: "https://a.com/two/" }] });
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://a.com/s.xml</loc></sitemap></sitemapindex>")).toEqual({ kind: "index", locs: ["https://a.com/s.xml"] });
    expect(parseSitemap("<html></html>")).toEqual({ kind: "other" });
  });

  test("which addresses are the website's, and the https address a sitemap is read from", () => {
    expect(onWebsite("https://www.ronins.co.uk/hub/", "ronins.co.uk")).toBe(true);
    expect(onWebsite("http://ronins.co.uk/hub/", "ronins.co.uk")).toBe(true);
    expect(onWebsite("/hub/", "ronins.co.uk")).toBe(true);
    expect(onWebsite("https://blog.ronins.co.uk/hub/", "ronins.co.uk")).toBe(false);
    expect(onWebsite("ftp://ronins.co.uk/hub/", "ronins.co.uk")).toBe(false);
    expect(sitemapAddress("http://www.ronins.co.uk:8080/s.xml#x", "ronins.co.uk")).toBe("https://www.ronins.co.uk/s.xml");
    expect(sitemapAddress("https://ronins.co.uk.evil.test/s.xml", "ronins.co.uk")).toBeNull();
    expect(sitemapAddress("javascript:alert(1)", "ronins.co.uk")).toBeNull();
    expect(fileNameOf("https://www.ronins.co.uk/case_study-sitemap.xml")).toBe("case_study-sitemap.xml");
    expect(fileNameOf("https://a.com/sitemap.xml?page=2")).toBe("sitemap.xml?page=2");
  });
});
