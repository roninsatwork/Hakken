import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Every Sites list sorts by any of its headings, either way round, over the
 * whole list and before the page is cut — blanks last whichever way, and an
 * order a list does not offer refused rather than guessed at
 * (docs/plans/active/sites-table-sorting-plan.md §8).
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const DAY = "2026-09-23";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now(),
    }));
  return t.withIdentity({ subject: userId });
}

async function hold(t: Harness, companyId: Id<"companies">, host: string, relationship: "OWNED" | "TRACKED" = "OWNED", againstWebsiteId?: Id<"websites">) {
  return await t.run(async (ctx) => {
    const existing = await ctx.db.query("websites").withIndex("by_host", (q) => q.eq("host", host)).unique();
    const websiteId = existing?._id ?? await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship, createdAt: Date.now(),
      ...(againstWebsiteId ? { againstWebsiteId } : {}),
      ...(relationship === "OWNED" ? { locationCode: UK } : {}),
    });
    return { websiteId, holdId };
  });
}

async function pull(t: Harness, websiteId: Id<"websites">, operationId = "domain_ranked_keywords") {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId, family: "DataForSEO Labs", mode: "LIVE", websiteId, taskArgsJson: "{}",
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.02, sandbox: false, submittedAt: Date.now(),
  } as never));
}

/** A ranked-keywords answer, filed as the parser files it. */
async function fileRanks(t: Harness, websiteId: Id<"websites">, day: string, positions: Array<Record<string, unknown>>) {
  await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
    pullId: await pull(t, websiteId),
    websiteId,
    operationId: "domain_ranked_keywords",
    day,
    locationCode: UK,
    metricsJson: JSON.stringify({ returnedKeywords: positions.length, estimatedTraffic: 100, rankedKeywords: 50 }),
    positions: positions as never,
  });
}

const rebuild = (t: Harness, websiteId: Id<"websites">) => t.action(internal.siteSummaries.rebuildSite, { websiteId, locationCode: UK });

describe("Wins and losses", () => {
  test("open on the biggest move, a rise or a drop, and sort by any heading", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await fileRanks(t, own.websiteId, "2026-09-16", [
      { keyword: "carp rods", position: 20 }, { keyword: "bait boats", position: 9 }, { keyword: "bivvies", position: 4 }, { keyword: "zig rigs", position: 30 },
    ]);
    await fileRanks(t, own.websiteId, DAY, [
      { keyword: "carp rods", position: 5 }, { keyword: "bait boats", position: 3 }, { keyword: "bivvies", position: 12 }, { keyword: "zig rigs", position: 29 },
    ]);
    await rebuild(t, own.websiteId);

    const asKorda = await member(t, korda);
    const moves = async (status: "UP" | "DOWN", args: Record<string, unknown> = {}) =>
      (await asKorda.query(api.siteKeywords.listMoves, { siteId: own.holdId, status, page: 1, rows: 25, ...args })).rows.map((row) => row.keyword);
    // Up 15, 6 and 1: the biggest first, and turned round.
    expect(await moves("UP")).toEqual(["carp rods", "bait boats", "zig rigs"]);
    expect(await moves("UP", { direction: "asc" })).toEqual(["zig rigs", "bait boats", "carp rods"]);
    // Where each stands now, from the top; and A to Z.
    expect(await moves("UP", { sort: "fromTo" })).toEqual(["bait boats", "carp rods", "zig rigs"]);
    expect(await moves("UP", { sort: "keyword" })).toEqual(["bait boats", "carp rods", "zig rigs"]);
    // A drop is a move too: the biggest first.
    expect(await moves("DOWN")).toEqual(["bivvies"]);
  });
});

describe("Content gap", () => {
  test("sorts by the search, its volume, how many competitors rank and their best position", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const nash = await hold(t, korda, "nashtackle.co.uk", "TRACKED", own.websiteId);
    const fox = await hold(t, korda, "foxint.com", "TRACKED", own.websiteId);
    await fileRanks(t, own.websiteId, DAY, [{ keyword: "carp rods", position: 2 }]);
    await fileRanks(t, nash.websiteId, DAY, [
      { keyword: "bivvies", position: 3, searchVolume: 900 },
      { keyword: "bait boats", position: 7, searchVolume: 2400 },
      { keyword: "zig rigs", position: 1 },
    ]);
    await fileRanks(t, fox.websiteId, DAY, [{ keyword: "bivvies", position: 5, searchVolume: 900 }]);
    await t.action(internal.siteContentGap.rebuildGap, { companyWebsiteId: own.holdId });
    await t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "gap", key: own.holdId });

    const asKorda = await member(t, korda);
    const gap = async (args: Record<string, unknown> = {}) =>
      (await asKorda.query(api.siteCompetitors.listContentGap, { siteId: own.holdId, page: 1, rows: 25, ...args })).rows.map((row) => row.keyword);
    // Most searched first; a search with no volume last, whichever way.
    expect(await gap()).toEqual(["bait boats", "bivvies", "zig rigs"]);
    expect(await gap({ direction: "asc" })).toEqual(["bivvies", "bait boats", "zig rigs"]);
    expect(await gap({ sort: "rivals" })).toEqual(["bivvies", "bait boats", "zig rigs"]);
    expect(await gap({ sort: "best" })).toEqual(["zig rigs", "bivvies", "bait boats"]);
    expect(await gap({ sort: "keyword", direction: "desc" })).toEqual(["zig rigs", "bivvies", "bait boats"]);
    // A page at a time, the order the whole list's: the last page is its other end.
    const last = await asKorda.query(api.siteCompetitors.listContentGap, { siteId: own.holdId, page: 2, rows: 2, sort: "best" });
    expect(last.rows.map((row) => row.keyword)).toEqual(["bait boats"]);
  });
});

describe("Paid keywords", () => {
  test("sort by any heading, the advert with no place last either way", async () => {
    const t = harness();
    const acme = await company(t, "Acme");
    const own = await hold(t, acme, "advertiser.co.uk");
    const pullId = await pull(t, own.websiteId);
    await t.run(async (ctx) => {
      for (const [keyword, position, volume, cpc, traffic, trafficCost] of [
        ["emergency plumber", 1, 500, 3.5, 40, 140],
        ["boiler repair", 3, 1200, 2.1, 25, 52],
        ["plumber leeds", undefined, 90, undefined, 5, 9],
      ] as const) {
        await ctx.db.insert("sitePaidKeywords", {
          websiteId: own.websiteId, locationCode: UK, pullId, day: DAY, keyword, page: "/offer", volume, traffic, trafficCost, searchText: keyword,
          ...(position === undefined ? {} : { position }),
          ...(cpc === undefined ? {} : { cpc }),
        });
      }
    });
    const asAcme = await member(t, acme);
    const paid = async (args: Record<string, unknown> = {}) =>
      (await asAcme.query(api.sitePaid.listPaidKeywords, { siteId: own.holdId, page: 1, rows: 25, ...args })).rows.map((row) => row.keyword);
    expect(await paid()).toEqual(["emergency plumber", "boiler repair", "plumber leeds"]);
    expect(await paid({ sort: "volume" })).toEqual(["boiler repair", "emergency plumber", "plumber leeds"]);
    expect(await paid({ sort: "position" })).toEqual(["emergency plumber", "boiler repair", "plumber leeds"]);
    expect(await paid({ sort: "position", direction: "desc" })).toEqual(["boiler repair", "emergency plumber", "plumber leeds"]);
    expect(await paid({ sort: "cpc", direction: "asc" })).toEqual(["boiler repair", "emergency plumber", "plumber leeds"]);
    expect(await paid({ sort: "cost" })).toEqual(["emergency plumber", "boiler repair", "plumber leeds"]);
    expect(await paid({ sort: "keyword" })).toEqual(["boiler repair", "emergency plumber", "plumber leeds"]);
    // The dropdown's old orders are not the headings': refused.
    await expect(asAcme.query(api.sitePaid.listPaidKeywords, { siteId: own.holdId, page: 1, rows: 25, sort: "dearest" } as never)).rejects.toThrow();
  });
});

describe("Broken backlinks and one link per website", () => {
  test("sort by the linking website, the answer, the strength and the day first seen", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const pullId = await pull(t, own.websiteId, "backlinks_backlinks");
    await t.run(async (ctx) => {
      for (const [pass, domainFrom, domainRank, statusCode, firstSeen] of [
        ["BROKEN", "b-blog.com", 300, 404, "2026-02-01"],
        ["BROKEN", "a-news.com", 120, 500, undefined],
        ["BROKEN", "c-shop.com", 40, 410, "2026-06-01"],
        ["ONE_PER_DOMAIN", "b-blog.com", 300, undefined, "2026-02-01"],
        ["ONE_PER_DOMAIN", "a-news.com", 120, undefined, undefined],
        ["ONE_PER_DOMAIN", "c-shop.com", 40, undefined, "2026-06-01"],
      ] as const) {
        await ctx.db.insert("siteBacklinks", {
          websiteId: own.websiteId, pass, pullId, day: DAY, domainFrom, urlFrom: `https://${domainFrom}/post`, urlTo: "https://ronins.co.uk/gone",
          pageTo: "/gone", dofollow: true, status: "LIVE", isBroken: pass === "BROKEN", domainRank, searchText: domainFrom,
          ...(statusCode === undefined ? {} : { statusCode }),
          ...(firstSeen === undefined ? {} : { firstSeen }),
        });
      }
    });
    const asRonins = await member(t, ronins);
    const broken = async (args: Record<string, unknown> = {}) =>
      (await asRonins.query(api.siteLinkLists.listBrokenBacklinks, { siteId: own.holdId, page: 1, rows: 25, ...args })).rows.map((row) => row.domainFrom);
    expect(await broken()).toEqual(["b-blog.com", "a-news.com", "c-shop.com"]);
    expect(await broken({ direction: "asc" })).toEqual(["c-shop.com", "a-news.com", "b-blog.com"]);
    expect(await broken({ sort: "code" })).toEqual(["a-news.com", "c-shop.com", "b-blog.com"]);
    expect(await broken({ sort: "from" })).toEqual(["a-news.com", "b-blog.com", "c-shop.com"]);

    const links = async (args: Record<string, unknown> = {}) =>
      (await asRonins.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: 1, rows: 25, ...args })).rows.map((row) => row.domainFrom);
    // Newest first, and oldest first: the link with no day last both ways.
    expect(await links({ sort: "firstSeen" })).toEqual(["c-shop.com", "b-blog.com", "a-news.com"]);
    expect(await links({ sort: "firstSeen", direction: "asc" })).toEqual(["b-blog.com", "c-shop.com", "a-news.com"]);
    await expect(asRonins.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: 1, rows: 25, sort: "newest" } as never)).rejects.toThrow();
  });
});
