import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * A website's pages, and what each is in the company's own words
 * (docs/plans/active/page-groups-plan.md).
 *
 * - The **sitemap** is the website's own list of its pages, read at each
 *   collection: public, so kept by website and shared by every company that
 *   watches it, like the crawl and the rankings.
 * - **Every page, once** (`holdPages`) joins the sitemap with what was found —
 *   crawled, shown by Google (the company's own Search Console), ranking —
 *   per company hold, rebuilt after each collection. Google's jump links
 *   (`#…`) count with their page. Your pages in Sites and the admin Page
 *   classification page read it by index.
 * - **Classifications** are the company's own (per hold, set only in admin for
 *   now): a name and a type, the address lines that catch pages, and pages
 *   set by hand. Once a website has any, its charts and screens use them in
 *   place of Hakken's page kinds; a page none catches is Not sorted.
 */

/** What a classification's type is: reports add up across classifications by it. */
export const classificationTypeValidator = v.union(
  v.literal("INFORMATIONAL"),
  v.literal("SERVICE"),
  v.literal("PRODUCT"),
  v.literal("CASE_STUDY"),
  v.literal("COMPANY"),
  v.literal("LEGAL"),
  v.literal("OTHER"),
);

/** How a line catches a page: by the start of its address, a part of it, the whole of it, or the sitemap file that lists it. */
export const classificationLineKindValidator = v.union(
  v.literal("STARTS_WITH"),
  v.literal("CONTAINS"),
  v.literal("EXACT"),
  v.literal("SITEMAP_FILE"),
);

export const pagesTables = {
  /** The newest reading of a website's sitemap: which files, how many pages each, and what went wrong. */
  siteSitemaps: defineTable({
    websiteId: v.id("websites"),
    /** Where it was found: robots.txt's Sitemap line, or the usual addresses tried in turn. */
    source: v.union(v.literal("ROBOTS"), v.literal("USUAL_ADDRESS"), v.literal("NONE")),
    files: v.array(v.object({ url: v.string(), pages: v.number(), problem: v.optional(v.string()) })),
    pages: v.number(),
    /** True when the `sitemapPagesRead` limit stopped the reading. */
    cut: v.boolean(),
    /** Why no sitemap was read, in plain words, when none was: every address tried was missing or would not answer. */
    problem: v.optional(v.string()),
    day: v.string(),
    /** When this reading was taken: its pages carry the same stamp (`siteSitemapPages.readAt`). */
    readAt: v.number(),
    /**
     * The stamp its pages carry when it found exactly the pages of the
     * reading before, and kept them rather than writing them again
     * (dataforseo-cost-plan.md, A3); absent when its pages carry `readAt`.
     */
    pagesReadAt: v.optional(v.number()),
  }).index("by_website", ["websiteId"]),

  /** One page the sitemap lists: its path, the file that lists it, and its last change where given. */
  siteSitemapPages: defineTable({
    websiteId: v.id("websites"),
    page: v.string(),
    /** The listing file's own name, as a person reads it: `post-sitemap.xml`. */
    file: v.string(),
    lastmod: v.optional(v.string()),
    /**
     * The reading it came from (`siteSitemaps.readAt`). A new reading's pages
     * are written beside the last one's, the website's reading switched to
     * them in one step, and only then the last one's removed — so nothing
     * ever reads half of each (`sitemaps.ts`).
     */
    readAt: v.number(),
  })
    // By page and by file went on 2026-10-07, used by no query (keep-less-history-plan.md, 5.5).
    // One reading's pages, in the order they were read; and the older readings', to clear.
    .index("by_website_read", ["websiteId", "readAt"]),

  /** Every page of a company's website once, and where it was found. */
  holdPages: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    page: v.string(),
    /** The sitemap file that lists it; missing when the sitemap does not. */
    sitemapFile: v.optional(v.string()),
    crawled: v.boolean(),
    /** Shown by Google in Search Console's last 90 days (the company's own connection). */
    shown: v.boolean(),
    /** Search Console clicks in the last 90 days. */
    clicks: v.number(),
    ranks: v.boolean(),
    /**
     * Hakken's own kind of page — by its address, or as judged for the
     * ranking pages (`sitePageTypes`) — shown in place of the company's
     * classifications until it has any ("automated until they fill it out").
     * One of `PAGE_TYPES` (`utils/siteShapes.ts`), "UNJUDGED" for none yet.
     */
    pageType: v.optional(v.string()),
  })
    .index("by_hold_page", ["companyWebsiteId", "page"])
    .index("by_hold_clicks", ["companyWebsiteId", "clicks"])
    // The pages one sitemap file lists: what a "listed in sitemap file" line catches, read when a chart is (`pageKinds.ts`).
    .index("by_hold_file", ["companyWebsiteId", "sitemapFile"]),

  /** A company's own classification of a website's pages: its name and type. */
  pageClassifications: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    name: v.string(),
    type: classificationTypeValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_hold", ["companyWebsiteId"]),

  /** One address line of a classification: the pages it catches. The more exact line wins between classifications. */
  pageClassificationLines: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    classificationId: v.id("pageClassifications"),
    kind: classificationLineKindValidator,
    value: v.string(),
    createdAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
    .index("by_classification", ["classificationId"])
    // A classification's own lines, read within its website (pageClassifications.ts).
    .index("by_hold_classification", ["companyWebsiteId", "classificationId"]),

  /**
   * A page's classification set by hand, which beats every line — or, with
   * no classification, the page taken out of the line that caught it: Not
   * sorted until it is set again.
   */
  pageClassificationPicks: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    page: v.string(),
    classificationId: v.optional(v.id("pageClassifications")),
    updatedAt: v.number(),
  })
    .index("by_hold_page", ["companyWebsiteId", "page"])
    // The pages set to one classification by hand, cleared when it is removed (pageClassifications.ts).
    .index("by_hold_classification", ["companyWebsiteId", "classificationId"]),
};
