import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { UNKNOWN } from "./searchConsoleFacts";

/**
 * What Sites knows about Search Console's keywords and pages
 * (docs/plans/active/search-console-plan.md §14.3, item 4): a keyword's
 * intent and monthly searches, a page's type — looked up by its address
 * alone, never by the website's host.
 */

describe("Sites' facts", () => {
  test("a keyword's judged intent and measured searches; one never seen is not judged yet", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { websiteId } = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      await ctx.db.insert("seoKeywordIntents", { keyword: "plumber leeds", intent: "BUYING", judgedAt: 1 });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "keyword_search_volume", family: "Keywords Data", mode: "QUEUED", status: "READY", tag: "volumes",
        taskArgsJson: "{}", resultJson: "[]", attempts: 0, costUsd: 0, sandbox: false, submittedAt: 1, completedAt: 1,
      });
      await ctx.db.insert("searchVolumes", {
        keyword: "plumber leeds", locationCode: 2826, volume: 880, cpc: null, competition: null, trend: [], checkedDay: "2026-09-01", pullId, updatedAt: 1,
      });
      await ctx.db.insert("sitePageTypes", { websiteId, page: "/drains/", pageType: "SERVICE", judgedAt: 1 });
      return { websiteId };
    });
    const keywords = await t.query(internal.searchConsoleFacts.keyFacts, { websiteId, place: 2826, kind: "query", keys: ["Plumber  Leeds", "never seen"] });
    expect(keywords).toEqual({ kinds: ["BUYING", "UNJUDGED"], numbers: [880, UNKNOWN] });
    const pages = await t.query(internal.searchConsoleFacts.keyFacts, {
      websiteId, place: 2826, kind: "page", keys: ["https://www.acme-shop.test/", "https://www.acme-shop.test/drains/", "https://www.acme-shop.test/x/"],
    });
    expect(pages).toEqual({ kinds: ["HOME", "SERVICE", "UNJUDGED"], numbers: [UNKNOWN, UNKNOWN, UNKNOWN] });
  });
});
