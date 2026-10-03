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
      judged: [],
    });
    expect(pages.map((row) => row.page)).toEqual(["/hub/kapferer/"]);
    expect(counts).toMatchObject({ pages: 1, sitemap: 1, shown: 1, ranking: 0 });
  });
});
