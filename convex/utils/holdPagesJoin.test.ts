import { describe, expect, test } from "vitest";
import { isWebPage, joinHoldPages } from "./holdPagesJoin";

/**
 * Every page once is pages only (his call, 2026-10-03): a PDF or an image
 * Google showed in search, or a sitemap listed, is a file on the website, not
 * one of its pages — tried on ronins.co.uk's own.
 */
describe("pages only", () => {
  test("a known file ending is a file; anything else is a page", () => {
    expect(isWebPage("/wp-content/uploads/2024/07/brand-audit-checklist-ronins.pdf")).toBe(false);
    expect(isWebPage("https://www.ronins.co.uk/wp-content/uploads/2024/02/coca-cola-brand-identity-prism.PNG")).toBe(false);
    expect(isWebPage("/hub/kapferer/")).toBe(true);
    expect(isWebPage("/about-us.html")).toBe(true);
    expect(isWebPage("/hub/node.js-guide")).toBe(true);
    expect(isWebPage("/v2.0/")).toBe(true);
    expect(isWebPage("/hub/kapferer/#prism.png")).toBe(true);
  });

  test("files are left out of the list wherever they come from", () => {
    const pdf = "https://www.ronins.co.uk/wp-content/uploads/2024/07/brand-audit-checklist-ronins.pdf";
    const { pages, counts } = joinHoldPages({
      host: "ronins.co.uk",
      sitemap: [{ page: "/hub/kapferer/", file: "content-hub-sitemap.xml" }, { page: "/files/brochure.pdf", file: "page-sitemap.xml" }],
      sitemapLimit: 1,
      crawled: [],
      ranked: [{ page: "/files/price-list.docx", url: "https://www.ronins.co.uk/files/price-list.docx" }],
      shown: [{ key: "https://www.ronins.co.uk/hub/kapferer/", clicks: 12 }, { key: pdf, clicks: 3 }],
      visited: null,
      judged: [],
    });
    expect(pages.map((row) => row.page)).toEqual(["/hub/kapferer/"]);
    expect(counts).toMatchObject({ pages: 1, sitemap: 1, shown: 1, ranking: 0 });
  });
});

/**
 * Google Analytics' visits beside Search Console's clicks
 * (docs/plans/active/google-analytics-plan.md §4.6): each landing page's
 * visits over the last 90 days, folded to its page as every source is.
 */
describe("visits", () => {
  const base = {
    host: "ronins.co.uk",
    sitemap: [{ page: "/ai-agency/", file: "page-sitemap.xml" }, { page: "/hub/bad-websites/", file: "content-hub-sitemap.xml" }],
    sitemapLimit: 100,
    crawled: [],
    ranked: [],
    shown: [{ key: "https://www.ronins.co.uk/ai-agency/", clicks: 400 }],
    judged: [],
  };

  test("land on the page they belong to, beside its clicks: case, query and www folded, as Search Console's are", () => {
    const { pages, counts } = joinHoldPages({
      ...base,
      visited: [
        { key: "https://www.ronins.co.uk/ai-agency/", visits: 90 },
        { key: "https://ronins.co.uk/AI-Agency/", visits: 10 },
        { key: "https://www.ronins.co.uk/hub/bad-websites/", visits: 7 },
      ],
    });
    expect(pages.map((row) => [row.page, row.shown, row.clicks, row.visited, row.visits])).toEqual([
      ["/ai-agency/", true, 400, true, 100],
      ["/hub/bad-websites/", false, 0, true, 7],
    ]);
    // Visits are no figure or gap of their own: Your pages counts as before.
    expect(counts).toMatchObject({ pages: 2, sitemap: 2, shown: 1 });
  });

  test("add to the pages found and none of their own; another website's page or a file never lands", () => {
    const { pages } = joinHoldPages({
      ...base,
      visited: [
        { key: "https://www.ronins.co.uk/only-visited/", visits: 5 },
        { key: "https://blog.ronins.co.uk/ai-agency/", visits: 9 },
        { key: "https://www.ronins.co.uk/ai-agency/brochure.pdf", visits: 2 },
        { key: "~1f", visits: 4 },
      ],
    });
    expect(pages.map((row) => row.page)).toEqual(["/ai-agency/", "/hub/bad-websites/"]);
    expect(pages.every((row) => !row.visited && row.visits === 0)).toBe(true);
  });

  test("without Google Analytics connected, no page was visited", () => {
    const { pages } = joinHoldPages({ ...base, visited: null });
    expect(pages.map((row) => [row.visited, row.visits])).toEqual([[false, 0], [false, 0]]);
  });
});
