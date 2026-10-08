import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { useFixedDay } from "@/src/test/realTime";

/**
 * The fan-out searches as angles, with where the site stands for each
 * (docs/plans/active/fan-out-angles-plan.md, FA2 and FA5), built after a
 * collection and read by the Sites Fan-out queries page. The searches are
 * Korda's real ones.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-09-27";
const QUESTION = "What tackle do I need for carp fishing?";

beforeEach(() => useFixedDay());
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

/** An owned website asking one question of two assistants, with no place chosen. */
async function askedSite(t: Harness, companyId: Id<"companies">, host: string) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    const questionId = await ctx.db.insert("websiteQuestions", {
      websiteId, companyWebsiteId: holdId, prompt: QUESTION, engines: ["claude", "perplexity"], isActive: true, createdAt: Date.now(),
    });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", websiteId, taskArgsJson: "{}",
      status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    return { websiteId, holdId, questionId, pullId };
  });
}

/** A fan-out search as the collection files it; Claude and Perplexity both file under the place sent, here none. */
async function fanOut(t: Harness, pullId: Id<"seoDataPulls">, engine: "claude" | "perplexity", query: string, timesSeen = 1, prompt = QUESTION) {
  return await t.run(async (ctx) => await ctx.db.insert("promptFanOutQueries", {
    prompt, engine, query, queryText: query, timesSeen, firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
  }));
}

async function rebuild(t: Harness, holdId: Id<"companyWebsites">) {
  await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId });
  await finishScheduled(t);
}

async function angles(t: Harness, holdId: Id<"companyWebsites">) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("fanOutAngles").withIndex("by_hold_seen", (q) => q.eq("holdId", holdId)).collect())
      .sort((left, right) => right.timesSeen - left.timesSeen || left.angle.localeCompare(right.angle)));
}

async function ranked(t: Harness, websiteId: Id<"websites">, keyword: string, position: number) {
  await t.run(async (ctx) => await ctx.db.insert("siteKeywordRanks", {
    websiteId, locationCode: DEFAULT_LOCATION_CODE, keyword, position, band: position <= 3 ? "p01_03" : "p04_10",
    page: "/knowledge/a-guide", volume: 0, volumeKnown: false, intent: "UNJUDGED", status: "SAME", change: 0,
    day: DAY, firstSeenDay: DAY,
  }));
}

describe("fan-out searches as angles", () => {
  test("wordings that say the same thing are one angle, with every engine and time seen", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const site = await askedSite(t, korda, "korda.example");
    await fanOut(t, site.pullId, "claude", "best carp fishing bait", 2);
    await fanOut(t, site.pullId, "perplexity", "best bait for carp fishing");
    await fanOut(t, site.pullId, "claude", "carp rod reviews");

    await rebuild(t, site.holdId);

    const rows = await angles(t, site.holdId);
    expect(rows.map((row) => [row.wordings.map((wording) => wording.query), row.engines, row.timesSeen])).toEqual([
      [["best carp fishing bait", "best bait for carp fishing"], ["claude", "perplexity"], 3],
      [["carp rod reviews"], ["claude"], 1],
    ]);
    const list = await t.run(async (ctx) => await ctx.db.query("fanOutAngleLists").withIndex("by_hold", (q) => q.eq("holdId", site.holdId)).unique());
    expect(list).toMatchObject({ angles: 2, wordings: 3, cut: false });
    expect(list?.building).toBeUndefined();
  });

  test("an engine the question is not asked of is not this company's: its searches are left out", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const site = await askedSite(t, korda, "korda.example");
    await fanOut(t, site.pullId, "claude", "carp rod reviews");
    // Another company asks the same question of ChatGPT, under the same place.
    await t.run(async (ctx) => await ctx.db.insert("promptFanOutQueries", {
      prompt: QUESTION, engine: "chatgpt", query: "someone else's search", queryText: "someone else's search", timesSeen: 5,
      firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: site.pullId,
    }));

    await rebuild(t, site.holdId);

    expect((await angles(t, site.holdId)).map((row) => row.wordings[0].query)).toEqual(["carp rod reviews"]);
  });

  test("where the site stands: its own check first, then the ranked list, then Search Console", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const site = await askedSite(t, korda, "korda.example");
    await fanOut(t, site.pullId, "claude", "best hooks for carp fishing", 3);
    await fanOut(t, site.pullId, "claude", "carp hook sizes", 2);
    await fanOut(t, site.pullId, "claude", "barbless hooks for carp");
    await fanOut(t, site.pullId, "claude", "circle hooks carp");
    // Ranked 8 in the list, but the company tracks it and its own check found nothing.
    await ranked(t, site.websiteId, "best hooks for carp fishing", 8);
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteKeywords", {
        websiteId: site.websiteId, companyWebsiteId: site.holdId, keyword: "best hooks for carp fishing", isActive: true, createdAt: Date.now(),
      });
      await ctx.db.insert("websiteSearchStats", {
        websiteId: site.websiteId, keyword: "best hooks for carp fishing", locationCode: DEFAULT_LOCATION_CODE,
        firstCheckedDay: DAY, lastCheckedDay: DAY, everRanked: false, updatedAt: Date.now(),
      });
    });
    await ranked(t, site.websiteId, "carp hook sizes", 5);
    // Search Console's own average for a search nobody tracks and the list does not hold.
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsoleConnections", {
        companyId: korda, companyWebsiteId: site.holdId, websiteId: site.websiteId, status: "CONNECTED", newestDay: DAY,
        createdAt: Date.now(), updatedAt: Date.now(),
      } as never);
      // The ready-made thirty days, as the collection adds them up: two days, at 12 for 10 impressions and 14 for 30.
      await ctx.db.insert("searchConsolePeriods", {
        companyWebsiteId: site.holdId, searchType: "web", list: "query", period: "30", which: "NOW", part: 0,
        from: "2026-08-29", to: DAY, keys: ["barbless hooks for carp"], clicks: [0], impressions: [40], positionSums: [10 * 12 + 30 * 14],
        builtAt: Date.now(),
      });
    });

    await rebuild(t, site.holdId);

    const byQuery = new Map((await angles(t, site.holdId)).map((row) => [row.wordings[0].query, row.position]));
    expect(byQuery.get("best hooks for carp fishing")).toMatchObject({ value: null, from: "CHECKED", day: DAY });
    expect(byQuery.get("carp hook sizes")).toMatchObject({ value: 5, from: "RANKED" });
    // Weighted by impressions, as Google averages it: (10×12 + 30×14) ÷ 40.
    expect(byQuery.get("barbless hooks for carp")).toMatchObject({ value: 13.5, from: "SEARCH_CONSOLE" });
    expect(byQuery.get("circle hooks carp")).toBeUndefined();
  });

  test("a rebuild clears the angles it no longer finds", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const site = await askedSite(t, korda, "korda.example");
    await fanOut(t, site.pullId, "claude", "carp rod reviews");
    const gone = await fanOut(t, site.pullId, "claude", "circle hooks carp");
    await rebuild(t, site.holdId);
    expect(await angles(t, site.holdId)).toHaveLength(2);

    await t.run(async (ctx) => await ctx.db.delete(gone));
    vi.advanceTimersByTime(1_000);
    await rebuild(t, site.holdId);

    expect((await angles(t, site.holdId)).map((row) => row.wordings[0].query)).toEqual(["carp rod reviews"]);
  });

  test("the Sites page reads its own company's angles, and never another company's", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const other = await company(t, "Other");
    const site = await askedSite(t, korda, "korda.example");
    await fanOut(t, site.pullId, "claude", "best carp fishing bait", 2);
    await fanOut(t, site.pullId, "perplexity", "best bait for carp fishing");
    await rebuild(t, site.holdId);
    await t.run(async (ctx) => {
      await ctx.db.insert("fanOutPageJudgments", {
        holdId: site.holdId, angle: "bait best carp fishing", verdict: "NONE", pagesStamp: "month:2026-09", judgedAt: Date.now(),
      });
    });

    const asKorda = await member(t, korda);
    const listed = await asKorda.query(api.siteAngles.listAngles, { siteId: site.holdId });
    expect(listed).toMatchObject({ own: true, built: true, wordings: 2, cut: null });
    expect(listed.rows).toEqual([expect.objectContaining({
      queryText: "best carp fishing bait",
      otherWordings: ["best bait for carp fishing"],
      timesSeen: 3,
      page: { verdict: "NONE", page: null, url: null },
      // On the prompt's list, but tracked only once ticked there (fan-out-opt-in-plan.md).
      tracked: false,
    })]);

    const asOther = await member(t, other);
    await expect(asOther.query(api.siteAngles.listAngles, { siteId: site.holdId })).rejects.toThrow();
  });

  test("tracking a wording shows at once, and a removed question takes its angles with it", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const site = await askedSite(t, korda, "korda.example");
    await fanOut(t, site.pullId, "claude", "carp rod reviews");
    await rebuild(t, site.holdId);
    const asKorda = await member(t, korda);

    await t.run(async (ctx) => await ctx.db.insert("websiteKeywords", {
      websiteId: site.websiteId, companyWebsiteId: site.holdId, keyword: "carp rod reviews", isActive: true, createdAt: Date.now(),
    }));
    expect((await asKorda.query(api.siteAngles.listAngles, { siteId: site.holdId })).rows[0].tracked).toBe(true);

    await t.run(async (ctx) => await ctx.db.delete(site.questionId));
    expect((await asKorda.query(api.siteAngles.listAngles, { siteId: site.holdId })).rows).toEqual([]);
  });
});
