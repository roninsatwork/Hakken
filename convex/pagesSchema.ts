import { defineTable } from "convex/server";
import { v } from "convex/values";
import { indexedValidator, pageFactsValidator, speedValidator } from "./utils/moneyPageChecks";

/**
 * A website's pages, and what each is in the company's own words
 * (docs/plans/active/page-groups-plan.md).
 *
 * - The **sitemap** is the website's own list of its pages, read at each
 *   collection: public, so kept by website and shared by every company that
 *   watches it, like the crawl and the rankings.
 * - **Every page, once** (`holdPages`) joins the sitemap with what was found —
 *   crawled, shown by Google (the company's own Search Console), visited (its
 *   own Google Analytics), ranking — per company hold, rebuilt after each
 *   collection. Google's jump links
 *   (`#…`) count with their page. Your pages in Sites and the admin Page
 *   classification page read it by index.
 * - **Classifications** are the company's own (per hold, set only in admin for
 *   now): a name and a type, the address lines that catch pages, and pages
 *   set by hand. Once a website has any, its charts and screens use them in
 *   place of Hakken's page kinds; a page none catches is Not sorted.
 */

/**
 * What a classification's type is: reports add up across classifications by
 * it. The type's key from the one list in System Settings → Classification
 * (docs/plans/active/classification-types-plan.md), checked against it on
 * every write (`classificationTypes.ts`): one of the seven shipped
 * (INFORMATIONAL, SERVICE, …), which reports read by name as they always
 * have, or an added type's own id, which reports count on its own.
 */
export const classificationTypeValidator = v.string();

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
    /** When this reading was taken: its pages carry the same stamp (`siteSitemapParts.readAt`). */
    readAt: v.number(),
    /**
     * The stamp its pages carry when it found exactly the pages of the
     * reading before, and kept them rather than writing them again
     * (dataforseo-cost-plan.md, A3); absent when its pages carry `readAt`.
     */
    pagesReadAt: v.optional(v.number()),
  }).index("by_website", ["websiteId"]),

  /**
   * The pages a sitemap reading listed, a thousand a record
   * (core-data-normalisation-plan.md §6.3): each page's address, the listing
   * file it came from as a place among the reading's files, and its
   * last-changed date as the sitemap wrote it. Written beside the last
   * reading and switched to in one step, as before (`sitemaps.ts`).
   */
  siteSitemapParts: defineTable({
    websiteId: v.id("websites"),
    readAt: v.number(),
    pages: v.array(v.string()),
    /** The listing files these pages came from, each once; `fileOf` is each page's place among them. */
    files: v.array(v.string()),
    fileOf: v.union(v.string(), v.array(v.union(v.number(), v.null()))),
    /** Null where the sitemap gave no date. */
    lastmods: v.array(v.union(v.string(), v.null())),
  }).index("by_website_read", ["websiteId", "readAt"]),

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
    /**
     * A page visits landed on in Google Analytics' last 90 days (the
     * company's own connection), and how many (google-analytics-plan.md
     * §4.6). Absent on a row written before 2026-10-10, or not rewritten
     * since, which reads as none: the next rebuild that changes the row
     * writes them.
     */
    visited: v.optional(v.boolean()),
    visits: v.optional(v.number()),
    /** Clicks from Bing in its last 90 days, beside Google's and Analytics' (bing-webmaster-plan.md §4.3); absent with Bing not connected, which reads as none. */
    bingClicks: v.optional(v.number()),
    /**
     * The page's title, as Google Analytics last saw it most viewed
     * (google-analytics-plan.md GA27, §18.6.3): kept once here, read by every
     * screen that lists the website's pages. Absent until Analytics has seen it.
     */
    title: v.optional(v.string()),
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
  })
    .index("by_hold", ["companyWebsiteId"])
    // The classifications of one type, across every company: System Settings → Classification counts them, and a type in use is not removed.
    .index("by_type", ["type"]),

  /**
   * The page types every company's classifications pick from (System
   * Settings → Classification, docs/plans/active/classification-types-plan.md):
   * a row for each type added there, and for each of the seven shipped types
   * once it is edited — until then a shipped type is as
   * `utils/classificationTypes.ts` writes it. The name is written once, in
   * English; the Translator writes the rest (owner `classificationTypes`).
   */
  classificationTypes: defineTable({
    /** A shipped type's own key (INFORMATIONAL, …), or an added type's own id. What a classification's `type` holds. */
    key: v.string(),
    nameEn: v.string(),
    builtIn: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  /** One address line of a classification: the pages it catches. The more exact line wins between classifications. */
  pageClassificationLines: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    classificationId: v.id("pageClassifications"),
    kind: classificationLineKindValidator,
    value: v.string(),
    createdAt: v.number(),
  })
    .index("by_hold", ["companyWebsiteId"])
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

  /**
   * The weekly checks on each money page of a website (insights-analyst-plan.md
   * §4.4, phase 8): whether Google has indexed it and when it last read it,
   * how fast it is for real visitors, and its structured data. One row a page,
   * replaced each week; a page no longer among the money pages is removed.
   */
  moneyPageChecks: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    page: v.string(),
    kind: v.union(v.string(), v.null()),
    /** Its clicks from Google over 90 days, when it was chosen: the order of the list. */
    clicks: v.number(),
    indexed: v.union(indexedValidator, v.null()),
    speed: v.union(speedValidator, v.null()),
    /** Its structured data's kinds; null when the page could not be read. */
    structured: v.union(v.array(v.string()), v.null()),
    /** What its words show — headline, price, proof, where it first asks — and its opening, for the Conversion specialist (phase 14). */
    facts: v.optional(v.union(pageFactsValidator, v.null())),
    checkedAt: v.number(),
  }).index("by_hold_page", ["companyWebsiteId", "page"]),
};
