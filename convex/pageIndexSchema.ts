import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Search Console's page checks (search-console-indexing-v1-plan-2026-11-18.md, "Reads, and the new collector"):
 * Google's URL inspection answer for each page of a company's own website, one row a page, replaced at each check; and
 * one small row a day for each website with the count for each of Google's reasons, kept up as the checks are saved.
 * Google gives apps no Page indexing totals, so these are what Indexing reads. Every row is one company's alone: filed
 * against its owned hold and read only through it, as the rest of Search Console.
 */
export const pageIndexTables = {
  /**
   * One page's newest answer from Google's URL inspection (`searchConsolePageChecks.ts`). A page Google couldn't answer
   * for is kept too, with `problem` and no reason, so it waits its turn rather than being asked again the same day.
   */
  pageIndexChecks: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    /** The page as the website's own list of pages names it (`holdPages`): its path, folded. */
    page: v.string(),
    /** The link asked of Google: the address the website really uses, and the page. */
    address: v.string(),
    /** Its title, as the list of pages held it when asked. */
    title: v.optional(v.string()),
    /** Google's words for where the page stands (`coverageState`), exactly as it gave them; null when Google gave none. */
    reason: v.union(v.string(), v.null()),
    /** Google's own verdict (PASS for a page in Google). */
    verdict: v.union(v.string(), v.null()),
    /** In Google, on Google's verdict or its words (`isIndexed`). */
    indexed: v.boolean(),
    /** The day Google last visited the page (`lastCrawlTime`); null when it gave none. */
    crawled: v.union(v.string(), v.null()),
    /** The page Google chose to show for it, and the page the website names as its main one, as Google gave them. */
    googleCanonical: v.union(v.string(), v.null()),
    userCanonical: v.union(v.string(), v.null()),
    /** Google found it in one of the website's sitemaps. */
    inSitemap: v.boolean(),
    /** Google named one of the website's own pages among those linking to it. */
    linkedOwn: v.boolean(),
    /** Why Google gave no answer: busy or failing, or it refused the ask. A row with a problem counts as unchecked. */
    problem: v.optional(v.union(v.literal("GOOGLE_ERROR"), v.literal("REFUSED"))),
    checkedAt: v.number(),
  })
    .index("by_hold_page", ["companyWebsiteId", "page"])
    // The oldest check first: what is asked again once every page has an answer.
    .index("by_hold_checked", ["companyWebsiteId", "checkedAt"])
    // A reason's pages, and the pages not in Google, without the ones that are.
    .index("by_hold_indexed_reason", ["companyWebsiteId", "indexed", "reason"]),

  /**
   * One day of a website's checks, by Google's own day (Pacific time, when its allowance comes back): how many pages
   * Google gave each reason, across every page checked so far, as the day's checks left them; how many asks the day
   * made, against the daily limit; and why the day's checks stopped early, when they did. Copied forward from the day
   * before when a day's first check is saved, so the newest row always holds the whole count, and a week of them the
   * trend (`pageIndexDays` is read for the Trend column once a week is kept, not before).
   */
  pageIndexDays: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    day: v.string(),
    /** Pages not in Google, by Google's words for why. */
    reasons: v.array(v.object({ reason: v.string(), pages: v.number() })),
    /** Pages in Google. */
    indexed: v.number(),
    /** Pages the website's own list held when the day's checks began. */
    known: v.number(),
    /** Asks made of Google this day, answered or not, and those Google couldn't answer. */
    asked: v.number(),
    failed: v.number(),
    /** Why the day's checks stopped before its limit: Google's allowance used up, the sign-in no good, or Google failing. */
    stopped: v.optional(v.union(v.literal("ALLOWANCE"), v.literal("SIGN_IN"), v.literal("BUSY"))),
    updatedAt: v.number(),
  }).index("by_hold_day", ["companyWebsiteId", "day"]),
};
