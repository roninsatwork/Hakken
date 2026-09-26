import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { backfillAnswerIndex } from "./siteAnswers";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * The compact copies the big Sites lists are counted from, and what the
 * lists hold (docs/plans/active/sites-table-pages-plan.md §5, T8–T11): the
 * searches the latest check found, the moves at the latest check, exact
 * totals from copies written beside the last and switched in whole, built
 * when a table finds one missing, and gone with the website.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;

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

/** A ranked-keywords result that did not cover everything the site ranks for, filed as the parser files it. */
async function fileRanks(t: Harness, websiteId: Id<"websites">, day: string, positions: Array<{ keyword: string; position: number }>) {
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

describe("what All keywords counts (T9)", () => {
  test("the searches the latest check found; one still held from an older check under its own filter, counted nowhere", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await fileRanks(t, own.websiteId, "2026-09-20", [
      { keyword: "carp rods", position: 3 }, { keyword: "bait boats", position: 5 }, { keyword: "bivvies", position: 8 },
    ]);
    // The latest check did not hold "bivvies": the list was held to a limit, so it may still rank.
    await fileRanks(t, own.websiteId, "2026-09-23", [{ keyword: "carp rods", position: 2 }, { keyword: "bait boats", position: 5 }]);
    await rebuild(t, own.websiteId);

    const asKorda = await member(t, korda);
    const list = async (args: Record<string, unknown> = {}) =>
      await asKorda.query(api.siteKeywords.listKeywords, { siteId: own.holdId, page: 1, rows: 25, ...args });
    const current = await list();
    expect(current.rows.map((row) => row.keyword)).toEqual(["carp rods", "bait boats"]);
    expect(current.total).toBe(2);
    expect((await list({ older: true })).rows.map((row) => [row.keyword, row.day])).toEqual([["bivvies", "2026-09-20"]]);
    expect((await list({ status: "LOST" })).rows).toEqual([]);

    // The menu's count is the table's total.
    const day = await t.run(async (ctx) =>
      (await ctx.db.query("siteDaySummaries").collect()).find((row) => row.websiteId === own.websiteId && row.day === "2026-09-23"));
    expect(day?.keywords).toBe(2);
  });
});

describe("Wins and losses (T10)", () => {
  test("list the moves at the latest check, the ones the menu counts", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await fileRanks(t, own.websiteId, "2026-09-16", [{ keyword: "carp rods", position: 10 }, { keyword: "bait boats", position: 10 }]);
    await fileRanks(t, own.websiteId, "2026-09-20", [{ keyword: "carp rods", position: 5 }, { keyword: "bait boats", position: 5 }]);
    // The latest check: "carp rods" held its place; "bait boats" was not checked.
    await fileRanks(t, own.websiteId, "2026-09-23", [{ keyword: "carp rods", position: 5 }]);
    await rebuild(t, own.websiteId);

    const asKorda = await member(t, korda);
    const ups = await asKorda.query(api.siteKeywords.listMoves, { siteId: own.holdId, status: "UP", page: 1, rows: 25 });
    expect(ups.rows).toEqual([]);
    const day = await t.run(async (ctx) =>
      (await ctx.db.query("siteDaySummaries").collect()).find((row) => row.websiteId === own.websiteId && row.day === "2026-09-23"));
    expect(day?.rankedUp).toBe(0);
  });
});

describe("a compact copy", () => {
  async function everyLink(t: Harness, websiteId: Id<"websites">, count: number) {
    const pullId = await pull(t, websiteId, "backlinks_all");
    for (let start = 0; start < count; start += 500) {
      await t.run(async (ctx) => {
        for (let index = start; index < Math.min(count, start + 500); index += 1) {
          // Long addresses, so the copy runs past one part.
          const path = `/${"deep-path-segment/".repeat(12)}${index}`;
          await ctx.db.insert("siteBacklinks", {
            websiteId, pass: "ALL", pullId, day: "2026-09-21", domainFrom: `linker-${index}.com`,
            urlFrom: `https://linker-${index}.com${path}`, urlTo: "https://kordatackle.com/", pageTo: "/",
            anchor: `anchor ${index}`, dofollow: index % 2 === 0, status: "LIVE", isBroken: false,
            domainRank: index, firstSeen: "2026-01-01", searchText: `linker-${index}.com`,
          });
        }
      });
    }
  }

  test("is split into parts, counted whole, and swapped in one step", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await everyLink(t, own.websiteId, 3_000);
    const build = () => t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "links", key: own.websiteId });
    await build();

    const copy = await t.run(async (ctx) => await ctx.db.query("siteListCopies").collect());
    expect(copy).toHaveLength(1);
    expect(copy[0]).toMatchObject({ kind: "links", rows: 3_000, cut: null });
    expect(copy[0].parts).toBeGreaterThan(1);

    const asKorda = await member(t, korda);
    const page = async (n: number) => await asKorda.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: n, rows: 25, every: true });
    expect(await page(1)).toMatchObject({ total: 3_000, pages: 120, page: 1 });
    const last = await page(120);
    expect(last.rows).toHaveLength(25);
    expect(last.rows.at(-1)?.domainFrom).toBe("linker-0.com");

    // Built again: the new parts in, the old ones gone.
    await build();
    const [headers, parts] = await t.run(async (ctx) => [
      await ctx.db.query("siteListCopies").collect(),
      await ctx.db.query("siteListCopyParts").collect(),
    ] as const);
    expect(headers).toHaveLength(1);
    expect(parts).toHaveLength(headers[0].parts);
    expect(new Set(parts.map((part) => part.buildId))).toEqual(new Set([headers[0].buildId]));

    // A copy written in another layout is as good as none.
    await t.run(async (ctx) => await ctx.db.patch(headers[0]._id, { fields: ["id", "domainFrom"] }));
    expect((await page(1)).preparing).toBe(true);
  });

  test("is built the first time a table finds it missing, asked for once", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await everyLink(t, own.websiteId, 30);
    const asKorda = await member(t, korda);
    expect((await asKorda.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: 1, rows: 25, every: true })).preparing).toBe(true);

    await asKorda.mutation(api.siteListCopyBuilders.ensureSiteListCopy, { siteId: own.holdId, list: "links" });
    await asKorda.mutation(api.siteListCopyBuilders.ensureSiteListCopy, { siteId: own.holdId, list: "links" });
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((job) => job.name.includes("buildListCopy"))).toHaveLength(1);

    await finishScheduled(t);
    expect(await asKorda.query(api.siteLinkLists.listBacklinks, { siteId: own.holdId, page: 2, rows: 25, every: true }))
      .toMatchObject({ total: 30, pages: 2, preparing: false });
  });

  test("goes with the website", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    await everyLink(t, own.websiteId, 30);
    await fileRanks(t, own.websiteId, "2026-09-23", [{ keyword: "carp rods", position: 2 }]);
    await rebuild(t, own.websiteId);
    await t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "links", key: own.websiteId });
    expect((await t.run(async (ctx) => await ctx.db.query("siteListCopies").collect())).length).toBeGreaterThanOrEqual(2);

    // Deleted as `deleteWebsite` deletes it: the record first, then everything
    // collected. Rebuilds asked for before it, run after, write nothing back.
    await t.run(async (ctx) => await ctx.db.delete(own.websiteId));
    await t.mutation(internal.websitePurge.purgeWebsiteCollectedDataInternal, { websiteId: own.websiteId });
    await finishScheduled(t);
    const [headers, parts] = await t.run(async (ctx) => [
      await ctx.db.query("siteListCopies").collect(),
      await ctx.db.query("siteListCopyParts").collect(),
    ] as const);
    expect(headers.filter((row) => row.key.startsWith(own.websiteId))).toEqual([]);
    expect(parts.filter((row) => row.key.startsWith(own.websiteId))).toEqual([]);
  });
});

describe("the content gap's copy", () => {
  test("leaves out a rival no longer tracked, and counts the rest again", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const rival = await hold(t, korda, "nashtackle.co.uk", "TRACKED", own.websiteId);
    await fileRanks(t, own.websiteId, "2026-09-23", [{ keyword: "carp rods", position: 2 }]);
    await fileRanks(t, rival.websiteId, "2026-09-23", [{ keyword: "carp rods", position: 1 }, { keyword: "bivvies", position: 3 }]);
    await t.action(internal.siteContentGap.rebuildGap, { companyWebsiteId: own.holdId });
    await t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "gap", key: own.holdId });

    const asKorda = await member(t, korda);
    const gap = async () => await asKorda.query(api.siteCompetitors.listContentGap, { siteId: own.holdId, page: 1, rows: 25 });
    expect((await gap()).rows.map((row) => [row.keyword, row.rivalsRanking])).toEqual([["bivvies", 1]]);

    // The rival is dropped: its searches are no gap against anyone tracked.
    await t.run(async (ctx) => await ctx.db.delete(rival.holdId));
    expect(await gap()).toMatchObject({ total: 0, rows: [] });
  });
});

describe("Full answers", () => {
  test("are counted from the light index, and older answers are indexed by the backfill", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    const prompt = "best carp rods";
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", { websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt, engines: ["perplexity"], isActive: true, createdAt: Date.now() } as never);
    });
    // Answers filed before the index existed.
    const pullId = await pull(t, own.websiteId, "ai_citation_perplexity");
    await t.run(async (ctx) => {
      for (let day = 1; day <= 30; day += 1) {
        await ctx.db.insert("aiAnswerTexts", {
          pullId, prompt, engine: "perplexity", locationCode: UK, day: `2026-09-${String(day).padStart(2, "0")}`,
          text: day % 2 === 0 ? "Try the Korda Kaizen rods." : "Nash rods are popular.", sources: [], createdAt: Date.now(),
        });
      }
    });
    const asKorda = await member(t, korda);
    const list = async (args: Record<string, unknown> = {}) =>
      await asKorda.query(api.siteAnswers.listAnswers, { siteId: own.holdId, prompt, from: "2026-09-01", to: "2026-09-30", page: 1, rows: 25, ...args });
    expect((await list()).total).toBe(0);

    await t.run(async (ctx) => {
      for (let cursor: string | null = null; ;) {
        const batch = await backfillAnswerIndex(ctx, cursor, 100);
        if (batch.isDone) break;
        cursor = batch.cursor;
      }
    });
    const first = await list();
    expect(first).toMatchObject({ total: 30, pages: 2, cut: null });
    expect(first.rows[0].day).toBe("2026-09-30");
    expect((await list({ page: 2 })).rows).toHaveLength(5);
    // Word starts, every word typed.
    expect((await list({ search: "korda kai" })).total).toBe(15);
    expect((await list({ search: "kai" })).rows.every((row) => row.text.includes("Kaizen"))).toBe(true);
  });
});

describe("a feature's searches", () => {
  test("count each search once, from its newest list, most searched first", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const own = await hold(t, korda, "kordatackle.com");
    // Each search's ordinary ranking and volume come from the site's keyword
    // copy, which the site rebuild writes (docs/plans/active/
    // sites-table-sorting-plan.md §4.6).
    await fileRanks(t, own.websiteId, "2026-09-21", [
      { keyword: "carp rods", position: 4, searchVolume: 480 },
      { keyword: "bait boats", position: 2, searchVolume: 90 },
    ] as never);
    await rebuild(t, own.websiteId);
    const pullId = await pull(t, own.websiteId, "domain_ranked_keywords_list");
    await t.run(async (ctx) => {
      for (const [keyword, day, position] of [
        ["carp rods", "2026-09-14", 3], ["carp rods", "2026-09-21", 1], ["bait boats", "2026-09-21", 2], ["zig rigs", "2026-09-21", null],
      ] as const) {
        await ctx.db.insert("siteKeywordFeatures", {
          websiteId: own.websiteId, locationCode: UK, keyword, feature: "featured_snippet", day, pullId, updatedAt: Date.now(),
          ...(position === null ? {} : { position }),
        });
      }
    });
    const asKorda = await member(t, korda);
    const list = async (args: Record<string, unknown> = {}) =>
      await asKorda.query(api.siteRecords.featureKeywords, { siteId: own.holdId, feature: "featured_snippet", page: 1, rows: 25, ...args });
    const found = await list();
    expect(found.total).toBe(3);
    // Most searched first; a search the keyword list does not hold has no
    // volume or ranking, so comes last whichever way.
    expect(found.rows.map((row) => [row.keyword, row.day, row.volume, row.organicPosition])).toEqual([
      ["carp rods", "2026-09-21", 480, 4], ["bait boats", "2026-09-21", 90, 2], ["zig rigs", "2026-09-21", null, null],
    ]);
    const order = async (args: Record<string, unknown>) => (await list(args)).rows.map((row) => row.keyword);
    expect(await order({ direction: "asc" })).toEqual(["bait boats", "carp rods", "zig rigs"]);
    expect(await order({ sort: "organic" })).toEqual(["bait boats", "carp rods", "zig rigs"]);
    expect(await order({ sort: "position" })).toEqual(["carp rods", "bait boats", "zig rigs"]);
    expect(await order({ sort: "keyword", direction: "desc" })).toEqual(["zig rigs", "carp rods", "bait boats"]);
  });
});
