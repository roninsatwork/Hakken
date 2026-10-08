import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * A rebuild writes only what changed (docs/plans/active/dataforseo-cost-plan.md,
 * A3): run again over the same data it writes nothing — no gap row, no list
 * copy, no day figure, no fan-out angle — so nothing reading them is woken;
 * what did change is written, and what is gone is removed, as before.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;

beforeEach(() => {
  useFixedDay();
  // Midday UTC today: no move of the clock here crosses into another day.
  const now = new Date();
  vi.setSystemTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
});
afterEach(() => vi.useRealTimers());

/** The clock moved on, firing nothing: a second rebuild writing would show a later time. */
const later = (ms = 60_000) => vi.setSystemTime(Date.now() + ms);

async function hold(t: Harness, host: string, againstWebsiteId?: Id<"websites">) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: host, createdAt: Date.now() });
    const existing = await ctx.db.query("websites").withIndex("by_host", (q) => q.eq("host", host)).unique();
    const websiteId = existing?._id ?? await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship: againstWebsiteId ? "TRACKED" : "OWNED", createdAt: Date.now(),
      ...(againstWebsiteId ? { againstWebsiteId } : { locationCode: UK }),
    });
    return { companyId, websiteId, holdId };
  });
}

async function pull(t: Harness, websiteId: Id<"websites">, operationId: string) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId, family: "DataForSEO", mode: "LIVE", websiteId, taskArgsJson: "{}", status: "READY",
    tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.01, sandbox: false, submittedAt: Date.now(),
  } as never));
}

async function ranks(t: Harness, websiteId: Id<"websites">, day: string, positions: Array<{ keyword: string; position: number }>) {
  await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
    pullId: await pull(t, websiteId, "domain_ranked_keywords"),
    websiteId, operationId: "domain_ranked_keywords", day, locationCode: UK,
    metricsJson: JSON.stringify({ returnedKeywords: positions.length, rankedKeywords: 50, backlinks: 10 }),
    positions: positions as never,
  });
}

describe("a rebuild writes only what changed", () => {
  test("content gap: nothing is written at all, since it is worked out when read (2026-10-06)", async () => {
    const t = harness();
    const own = await hold(t, "kordatackle.com");
    const rival = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "nashtackle.co.uk", displayHost: "nashtackle.co.uk", firstSeenAt: Date.now() });
      const companyId = (await ctx.db.get(own.holdId))!.companyId;
      await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "TRACKED", againstWebsiteId: own.websiteId, createdAt: Date.now() });
      return websiteId;
    });
    await ranks(t, own.websiteId, "2026-10-01", [{ keyword: "carp rods", position: 2 }]);
    await ranks(t, rival, "2026-10-01", [{ keyword: "bivvies", position: 3 }, { keyword: "bait boats", position: 5 }]);

    for (const websiteId of [own.websiteId, rival]) await t.action(internal.siteSummaries.rebuildSite, { websiteId, locationCode: UK });

    const stored = await t.run(async (ctx) => ({
      rows: (await ctx.db.query("siteContentGaps").collect()).length,
      copies: (await ctx.db.query("siteListCopies").collect()).filter((copy) => copy.kind === "gap").length,
    }));
    expect(stored).toEqual({ rows: 0, copies: 0 });
  });

  test("a list's copy: the same rows write nothing, so a table reading it is not woken; new rows are written", async () => {
    const t = harness();
    const own = await hold(t, "kordatackle.com");
    const link = async (domain: string) => {
      const pullId = await pull(t, own.websiteId, "backlinks_all");
      await t.run(async (ctx) => await ctx.db.insert("siteBacklinks", {
        websiteId: own.websiteId, pass: "ALL", pullId, day: "2026-10-01", domainFrom: domain, urlFrom: `https://${domain}/a`,
        urlTo: "https://kordatackle.com/", pageTo: "/", dofollow: true, status: "LIVE", isBroken: false, domainRank: 10, searchText: domain,
      }));
    };
    await link("linker.com");
    const build = () => t.action(internal.siteListCopyBuilders.buildListCopy, { kind: "links", key: own.websiteId });
    const copy = () => t.run(async (ctx) => ({
      headers: await ctx.db.query("siteListCopies").collect(),
      parts: await ctx.db.query("siteListCopyParts").collect(),
    }));
    await build();
    const first = await copy();
    expect(first.headers[0].hash).toMatch(/^[0-9a-f]{64}$/);

    later();
    await build();
    expect(await copy()).toEqual(first);

    later();
    await link("another.com");
    await build();
    const third = await copy();
    expect(third.headers[0]).toMatchObject({ rows: 2 });
    expect(third.headers[0].buildId).not.toBe(first.headers[0].buildId);
    expect(third.parts.map((part) => part.buildId)).toEqual([third.headers[0].buildId]);
  });

  test("the day figures: a figure the same is not written again, a changed one is", async () => {
    const t = harness();
    const own = await hold(t, "kordatackle.com");
    const day = new Date().toISOString().slice(0, 10);
    await ranks(t, own.websiteId, day, [{ keyword: "carp rods", position: 2 }]);
    const window = { websiteId: own.websiteId, locationCode: UK, fromDay: day, toDay: day };
    const row = () => t.run(async (ctx) => (await ctx.db.query("siteDaySummaries").collect()).find((summary) => summary.day === day));
    await t.mutation(internal.siteSummaries.syncDays, window);
    const first = await row();
    expect(first?.rankedKeywordsTotal).toBe(50);

    later();
    await t.mutation(internal.siteSummaries.syncDays, window);
    expect(await row()).toEqual(first);

    later();
    await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
      pullId: await pull(t, own.websiteId, "backlinks_summary"), websiteId: own.websiteId, operationId: "backlinks_summary", day,
      metricsJson: JSON.stringify({ backlinks: 1200 }), positions: [],
    });
    await t.mutation(internal.siteSummaries.syncDays, window);
    const third = await row();
    expect(third).toMatchObject({ rankedKeywordsTotal: 50, backlinks: 1200 });
    expect(third!.updatedAt).toBeGreaterThan(first!.updatedAt);
  });

  test("fan-out angles: an angle the same keeps its stamp; a changed one is written, a gone one and a removed question's cleared", async () => {
    const t = harness();
    const own = await hold(t, "korda.example");
    const day = "2026-09-27";
    const ask = async (prompt: string) => await t.run(async (ctx) => await ctx.db.insert("websiteQuestions", {
      websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt, engines: ["claude"], isActive: true, createdAt: Date.now(),
    }));
    const pullId = await pull(t, own.websiteId, "ai_citation_claude");
    const search = async (prompt: string, query: string, timesSeen = 1) => await t.run(async (ctx) => await ctx.db.insert("promptFanOutQueries", {
      prompt, engine: "claude", query, queryText: query, timesSeen, firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: day, lastPullId: pullId,
    }));
    // No place chosen, as the searches are filed here.
    await t.run(async (ctx) => await ctx.db.patch(own.holdId, { locationCode: undefined }));
    const rods = await ask("best carp rods?");
    await ask("best bait?");
    const reviews = await search("best carp rods?", "carp rod reviews");
    await search("best carp rods?", "cheap carp rods");
    await search("best bait?", "boilies for carp");
    const rebuild = async () => {
      await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: own.holdId });
      await finishScheduled(t);
    };
    const angles = () => t.run(async (ctx) => (await ctx.db.query("fanOutAngles").collect())
      .map((row) => ({ prompt: row.prompt, angle: row.angle, timesSeen: row.timesSeen, rebuiltAt: row.rebuiltAt }))
      .sort((a, b) => `${a.prompt}${a.angle}`.localeCompare(`${b.prompt}${b.angle}`)));
    await rebuild();
    const first = await angles();
    expect(first).toHaveLength(3);

    later(2 * 60 * 60 * 1000);
    await rebuild();
    expect(await angles()).toEqual(first);

    // Seen again; another search stops; the bait question is taken off the list.
    later(2 * 60 * 60 * 1000);
    await t.run(async (ctx) => {
      await ctx.db.patch(reviews, { timesSeen: 4 });
      const cheap = (await ctx.db.query("promptFanOutQueries").collect()).find((row) => row.query === "cheap carp rods");
      await ctx.db.delete(cheap!._id);
      const bait = (await ctx.db.query("websiteQuestions").collect()).find((row) => row._id !== rods);
      await ctx.db.delete(bait!._id);
    });
    await rebuild();
    const third = await angles();
    expect(third.map((row) => [row.prompt, row.timesSeen])).toEqual([["best carp rods?", 4]]);
    expect(third[0].rebuiltAt).toBeGreaterThan(first.find((row) => row.prompt === "best carp rods?")!.rebuiltAt);
  });
});
