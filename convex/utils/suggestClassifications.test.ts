import { describe, expect, test } from "vitest";
import { fileWords, guessType, isGenericFile, suggestClassifications } from "./suggestClassifications";

/**
 * The suggested start (docs/plans/active/page-groups-plan.md): sections read
 * from a website's own folders and sitemap files, named in words, with a
 * guessed type and the line that catches each.
 */

/** ronins.co.uk's pages as dev held them on 2026-10-03, cut down: [page, sitemap file]. */
const RONINS: Array<[string, string | null]> = [
  // The content hub: its own sitemap file, all in /hub/ — and a few pages Google showed that the sitemap leaves out.
  ...["wp-engine", "why-is-branding-important", "what-makes-a-good-app", "bad-websites", "brand-audit"].map((slug): [string, string] => [`/hub/${slug}/`, "content-hub-sitemap.xml"]),
  ["/hub/user-centric-web-design", null],
  // Case studies, and one listing page Google showed.
  ...["two-chics", "rumage", "cysiam", "globium"].map((slug): [string, string] => [`/case-study/${slug}/`, "case_study-sitemap.xml"]),
  ["/case-study/page/2/", null],
  // The journal's posts sit at the top level; its own listing page is in the posts sitemap.
  ["/journal/", "post-sitemap.xml"],
  ["/our-new-office-in-guildford/", "post-sitemap.xml"],
  ["/the-digital-planning-process-a-step-by-step-guide/", "post-sitemap.xml"],
  ["/why-just-ok-is-not-in-our-vocabulary/", "post-sitemap.xml"],
  // Service pages and the two insights folders: all in the generic page sitemap.
  ...["/", "/ai-agency/", "/venture-studio/", "/web-design-london/", "/privacy-policy/", "/cookies/"].map((page): [string, string] => [page, "page-sitemap.xml"]),
  ...["", "strategy/", "ecommerce/", "web-development/"].map((slug): [string, string] => [`/web-design-insights/${slug}`, "page-sitemap.xml"]),
  ...["", "strategy/", "development/"].map((slug): [string, string] => [`/mobile-app-insights/${slug}`, "page-sitemap.xml"]),
  // Archives and uploads Google found.
  ...["/author/anthony/", "/author/anthony/page/2/", "/author/saral/"].map((page): [string, null] => [page, null]),
  ...["/wp-content/uploads/a.png", "/wp-content/uploads/b.png", "/wp-content/uploads/c.pdf"].map((page): [string, null] => [page, null]),
  ["/ronins.co.uk/woocommerce-agency/", null],
];

const suggested = () => suggestClassifications(RONINS.map(([page, sitemapFile]) => ({ page, sitemapFile })));

describe("the suggested start", () => {
  test("ronins.co.uk: its content hub, insights, case studies and journal — the service pages left to classify", () => {
    expect(suggested().map((entry) => [entry.name, entry.type, entry.lines.map((line) => `${line.kind} ${line.value}`)])).toEqual([
      // A file whose pages all sit in one folder is that folder: named by the file, caught by the folder's line.
      ["Insights", "INFORMATIONAL", ["STARTS_WITH /mobile-app-insights/", "STARTS_WITH /web-design-insights/"]],
      ["Content hub", "INFORMATIONAL", ["STARTS_WITH /hub/"]],
      ["Case studies", "CASE_STUDY", ["STARTS_WITH /case-study/"]],
      // Posts at the top level: caught by their file, named by its own listing page.
      ["Journal", "INFORMATIONAL", ["SITEMAP_FILE post-sitemap.xml"]],
      // An archive of other pages is Other, whatever its name.
      ["Authors", "OTHER", ["STARTS_WITH /author/"]],
    ]);
    // Each counts the pages its lines catch: the hub's pages the sitemap leaves out among them.
    expect(suggested().find((entry) => entry.name === "Content hub")?.pages).toBe(6);
    expect(suggested().find((entry) => entry.name === "Case studies")?.pages).toBe(5);
  });

  test("a folder needs at least three pages; machinery, hosts and the top level are never sections", () => {
    const names = suggestClassifications([
      { page: "/team/anna/", sitemapFile: null },
      { page: "/team/bob/", sitemapFile: null },
      { page: "/wp-content/a/", sitemapFile: null },
      { page: "/wp-content/b/", sitemapFile: null },
      { page: "/wp-content/c/", sitemapFile: null },
      { page: "/plumbers/", sitemapFile: null },
      { page: "/heating/", sitemapFile: null },
    ]).map((entry) => entry.name);
    expect(names).toEqual([]);
  });

  test("files differing only by a number are one section, and WordPress's own sitemaps are read for their kind", () => {
    const posts = suggestClassifications([
      { page: "/a-post/", sitemapFile: "post-sitemap.xml" },
      { page: "/another-post/", sitemapFile: "post-sitemap2.xml" },
      { page: "/shop/kettle/", sitemapFile: "wp-sitemap-posts-product-1.xml" },
      { page: "/shop/toaster/", sitemapFile: "wp-sitemap-posts-product-1.xml" },
      { page: "/shop/", sitemapFile: "wp-sitemap-posts-page-1.xml" },
    ]);
    // The most pages first: the shop's folder catches its own page too.
    expect(posts.map((entry) => [entry.name, entry.type, entry.lines.map((line) => line.value)])).toEqual([
      ["Products", "PRODUCT", ["/shop/"]],
      ["Posts", "INFORMATIONAL", ["post-sitemap.xml", "post-sitemap2.xml"]],
    ]);
  });

  test("a sitemap file's words, and the generic files that list a bit of everything", () => {
    expect(fileWords("case_study-sitemap.xml")).toEqual(["case", "study"]);
    expect(fileWords("post-sitemap.xml.gz")).toEqual(["post"]);
    expect(fileWords("wp-sitemap-taxonomies-category-1.xml")).toEqual(["category"]);
    for (const file of ["page-sitemap.xml", "sitemap.xml", "sitemap_index.xml", "wp-sitemap-posts-page-1.xml", "main-sitemap.xml"]) {
      expect(isGenericFile(file)).toBe(true);
    }
    expect(isGenericFile("content-hub-sitemap.xml")).toBe(false);
  });

  test("a type guessed from the words", () => {
    expect(guessType(["content", "hub"])).toBe("INFORMATIONAL");
    expect(guessType(["blog"])).toBe("INFORMATIONAL");
    expect(guessType(["our", "work"])).toBe("CASE_STUDY");
    expect(guessType(["shop"])).toBe("PRODUCT");
    expect(guessType(["cookies"])).toBe("LEGAL");
    expect(guessType(["case", "study", "category"])).toBe("OTHER");
    expect(guessType(["team"])).toBe("OTHER");
  });
});
