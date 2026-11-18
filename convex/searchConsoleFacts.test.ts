import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { ActionCtx } from "./_generated/server";
import { EVERY_FACT, UNKNOWN, factsFor, factsWanted } from "./searchConsoleFacts";

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

  test("a live list looks up only the facts its screen shows (speed fixes, 18 November 2026)", () => {
    // Every list of keywords has the Intent chip; only Almost there and Missed demand show the searches a month.
    expect(factsWanted("query", "all", false)).toEqual({ kind: true, number: false });
    expect(factsWanted("query", "almost", true)).toEqual({ kind: true, number: true });
    expect(factsWanted("query", "missed", false)).toEqual({ kind: true, number: true });
    // A page's type until the website has Classifications, which name every page in its place; its estimate only on Real against estimated.
    expect(factsWanted("page", "all", false)).toEqual({ kind: true, number: false });
    expect(factsWanted("page", "all", true)).toBeNull();
    expect(factsWanted("page", "tracked", true)).toBeNull();
    expect(factsWanted("page", "estimates", true)).toEqual({ kind: false, number: true });
    expect(factsWanted("page", "estimates", false)).toEqual(EVERY_FACT);
  });

  test("a lookup reads only what is wanted, and what it reads is the same", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const websiteId = await seeded(t);
    const ask = (kind: "query" | "page", keys: string[], want?: { kind: boolean; number: boolean }) => t.query(internal.searchConsoleFacts.keyFacts, { websiteId, place: 2826, kind, keys, ...(want ? { want } : {}) });
    expect(await ask("query", ["Plumber  Leeds", "never seen"], { kind: true, number: false })).toEqual({ kinds: ["BUYING", "UNJUDGED"], numbers: [UNKNOWN, UNKNOWN] });
    expect(await ask("query", ["Plumber  Leeds"], { kind: false, number: true })).toEqual({ kinds: ["UNJUDGED"], numbers: [880] });
    expect(await ask("page", PAGES, { kind: true, number: false })).toEqual({ kinds: (await ask("page", PAGES)).kinds, numbers: PAGES.map(() => UNKNOWN) });
    expect(await ask("page", PAGES, { kind: false, number: true })).toEqual({ kinds: PAGES.map(() => "UNJUDGED"), numbers: (await ask("page", PAGES)).numbers });
  });

  test("a long list of pages reads the website's page facts whole, with the same answer as a lookup a page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const websiteId = await seeded(t);
    // More than a lookup at a time is kept for: 600 pages, most of them unknown to Sites.
    const keys = [...PAGES, ...Array.from({ length: 600 }, (_, at) => `https://www.acme-shop.test/blog/post-${at}/`)];
    // An action's `runQuery`, answered by the test database: the lookups the action makes, as they run on Convex.
    const query = t.query as unknown as (reference: unknown, args: unknown) => Promise<unknown>;
    const ctx = { runQuery: (reference: unknown, args: unknown) => query(reference, args) } as unknown as ActionCtx;
    // As a build hands it over (`factsTarget`), brand words and all: passed whole, the read refused them, and every
    // website's 7- and 30-day lists stopped building (18 November 2026).
    const target = { websiteId, place: 2826, brandWords: ["Acme"] };
    for (const want of [EVERY_FACT, { kind: true, number: false }, { kind: false, number: true }]) {
      const whole = await factsFor(ctx, target, "page", keys, want);
      const oneByOne = await t.query(internal.searchConsoleFacts.keyFacts, { websiteId, place: 2826, kind: "page", keys, want });
      expect(keys.map((key) => whole.get(key))).toEqual(keys.map((_, at) => ({ kind: oneByOne.kinds[at], number: oneByOne.numbers[at] })));
    }
    expect((await factsFor(ctx, target, "page", keys)).get("https://www.acme-shop.test/drain-repairs/")).toEqual({ kind: "SERVICE", number: 120 });
  });
});

/** The pages the lookups are asked about: the home page, one judged, one ranked with a type, one ranked with none, one unknown. */
const PAGES = [
  "https://www.acme-shop.test/", "https://www.acme-shop.test/drains/", "https://www.acme-shop.test/drain-repairs/",
  "https://www.acme-shop.test/boilers/", "https://www.acme-shop.test/x/",
];

/** A website Sites knows: a keyword judged and measured, a page judged, two ranked at its place and one at another. */
async function seeded(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
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
    const rank = (page: string, locationCode: number, more: Record<string, unknown>) => ctx.db.insert("sitePageRanks", {
      websiteId, locationCode, page, section: "/", keywords: 3, bestPosition: 4, top3: 0,
      topKeyword: "drains", topKeywordVolume: 90, firstSeenDay: "2026-09-01", day: "2026-10-01", rebuildId: "r1", ...more,
    } as never);
    await rank("/drain-repairs/", 2826, { pageType: "SERVICE", traffic: 120 });
    await rank("/boilers/", 2826, { traffic: 40 });
    // Ranked from another place: not where the website is watched from.
    await rank("/x/", 2840, { pageType: "PRODUCT", traffic: 9 });
    return websiteId;
  });
}
