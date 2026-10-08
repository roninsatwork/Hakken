import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { pagesOfPart, sitemapPagesPage, writeSitemapPart } from "./sitemapParts";

/** A sitemap reading's pages, a thousand a record (core-data-normalisation-plan.md §6.3). */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("a sitemap reading's pages, a record", () => {
  test("each page with its file and date as listed, each file kept once, read back in order", async () => {
    const t = harness();
    const websiteId = await t.run(async (ctx) => await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: 1 }));
    const rows = [
      { page: "/", file: "page-sitemap.xml", lastmod: "2026-10-04T02:00:33+00:00" },
      { page: "/journal/", file: "post-sitemap.xml.gz" },
      { page: "/about-us/", file: "page-sitemap.xml", lastmod: "2026-02-27" },
    ];
    await t.run(async (ctx) => {
      await writeSitemapPart(ctx, { websiteId, readAt: 5 }, rows);
      await writeSitemapPart(ctx, { websiteId, readAt: 5 }, [{ page: "/later/", file: "post-sitemap.xml.gz" }]);
      await writeSitemapPart(ctx, { websiteId, readAt: 9 }, [{ page: "/another-reading/", file: "x.xml" }]);
    });
    const parts = await t.run(async (ctx) => await ctx.db.query("siteSitemapParts").collect());
    expect(parts[0].files).toEqual(["page-sitemap.xml", "post-sitemap.xml.gz"]);
    expect(pagesOfPart(parts[0])).toEqual(rows);
    const read = await t.run(async (ctx) => await sitemapPagesPage(ctx, { websiteId, readAt: 5, cursor: null }));
    expect(read.rows.map((row) => row.page)).toEqual(["/", "/journal/", "/about-us/", "/later/"]);
    expect(read.isDone).toBe(true);
  });
});
