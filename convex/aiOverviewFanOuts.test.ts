import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { parseAiOverviewFanOuts } from "./aiOverviewFanOuts";
import {
  AI_OVERVIEW_FAN_OUT_OPERATION,
  aiOverviewFanOutParams,
  aiOverviewPeriodStart,
  aiOverviewPlace,
  googleTopicOf,
} from "./dataForSeoAiOverviewOperations";
import { findSeoOperation, seoSiteOperations } from "./dataForSeoRegistry";
import { spendCategoryOf } from "./seoRunReports";

/**
 * Google's own fan-out searches (docs/plans/active/fan-out-angles-plan.md,
 * FA8): bought per question topic from DataForSEO's LLM Mentions, off unless a
 * company chooses how many of Google's AI Overviews to buy, held for 30 days
 * and shared, and read into the angles as their own source. Nothing here calls
 * DataForSEO: the answers are the documented shape, written by hand.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const QUESTION = "What is the best carp fishing rod for beginners?";
const TOPIC = "best carp fishing rod beginners";
const DAILY = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "09:00", timezone: "UTC" });
const LEEDS = 1006925;
const DAY_MS = 86_400_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A company collecting daily, with one owned website asking one question of one assistant. */
async function askingCompany(t: Harness, name: string, host: string, question = QUESTION) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
    await ctx.db.insert("schedules", { name: "Collection", companyId, intervalStr: DAILY, isActive: true, createdAt: Date.now() } as never);
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: LEEDS, createdAt: Date.now() });
    await ctx.db.insert("websiteQuestions", {
      websiteId, companyWebsiteId: holdId, prompt: question, engines: ["claude"], isActive: true, createdAt: Date.now(),
    });
    return { companyId, websiteId, holdId };
  });
}

/** The company's own choice of how many of Google's AI Overviews to buy per question. */
async function buyGoogle(t: Harness, companyId: Id<"companies">, rows: number) {
  await t.run(async (ctx) => await ctx.db.insert("fanOutLimits", { companyId, googleSearchesRead: rows, updatedAt: Date.now() }));
}

async function expand(t: Harness, companyId: Id<"companies">, startedAt: number) {
  const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
    companyId, trigger: "SCHEDULE", status: "EXPANDING", plannedCount: 0, reusedCount: 0, sentCount: 0,
    readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt,
  }));
  await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });
  return cycleId;
}

const googlePulls = (t: Harness) => t.run(async (ctx) =>
  (await ctx.db.query("seoDataPulls").collect()).filter((row) => row.operationId === AI_OVERVIEW_FAN_OUT_OPERATION));
const googleLines = (t: Harness) => t.run(async (ctx) =>
  (await ctx.db.query("seoCycleLines").collect()).filter((row) => row.operationId === AI_OVERVIEW_FAN_OUT_OPERATION));

/** An answer in LLM Mentions' documented shape: one result, its items each an AI Overview. */
const answer = (...overviews: Array<string[] | null>) => [{
  total_count: overviews.length,
  items_count: overviews.length,
  items: overviews.map((searches, index) => ({
    platform: "google", model_name: "google_ai_overview", question: `google search ${index}`,
    answer: "Page text that is never kept.", ai_search_volume: 1000 - index, fan_out_queries: searches,
  })),
}];

describe("what is sent", () => {
  test("a question's topic is its words that matter, in its own order", () => {
    expect(googleTopicOf(QUESTION)).toBe(TOPIC);
    expect(googleTopicOf("Who are the best web designers in Surrey?")).toBe("best web designers surrey");
    expect(googleTopicOf("What's the angler's best rig?")).toBe("anglers best rig");
    expect(googleTopicOf("What is it?")).toBe("");
  });

  test("one topic, searched in Google's own searches, for the country, the busiest first", () => {
    // Leeds is asked for as the United Kingdom: the overviews are bought by country.
    expect(aiOverviewFanOutParams(TOPIC, LEEDS, 100)).toEqual({
      target: [{ keyword: TOPIC, search_scope: ["question"], match_type: "word_match" }],
      platform: "google",
      location_code: 2826,
      language_code: "en",
      order_by: ["ai_search_volume,desc"],
      limit: 100,
    });
    expect(aiOverviewPlace(LEEDS)).toBe("GB");
    expect(aiOverviewPlace(undefined)).toBe("GB");
  });

  test("is an operation of its own, bought monthly, never per website, and counted as AI answers", () => {
    const operation = findSeoOperation(AI_OVERVIEW_FAN_OUT_OPERATION)!;
    expect(operation).toMatchObject({ mode: "LIVE", path: "/v3/ai_optimization/llm_mentions/search/live", refresh: { everyDays: 30 } });
    expect(seoSiteOperations().map((entry) => entry.id)).not.toContain(AI_OVERVIEW_FAN_OUT_OPERATION);
    expect(spendCategoryOf(AI_OVERVIEW_FAN_OUT_OPERATION)).toBe("AI_ANSWERS");
  });
});

describe("planning it", () => {
  test("buys nothing until the company chooses how many AI Overviews", async () => {
    const t = harness();
    const korda = await askingCompany(t, "Korda", "korda.example");

    await expand(t, korda.companyId, Date.now());

    expect(await googlePulls(t)).toEqual([]);
  });

  test("once chosen, one purchase per question topic, shared for 30 days by every company asking it", async () => {
    const t = harness();
    const period = aiOverviewPeriodStart(Date.now());
    const korda = await askingCompany(t, "Korda", "korda.example");
    const other = await askingCompany(t, "Other Tackle", "other.example", "What's the best carp fishing rod for beginners");
    await buyGoogle(t, korda.companyId, 100);
    await buyGoogle(t, other.companyId, 100);

    await expand(t, korda.companyId, period + DAY_MS);
    // Another company, ten days on, asking the same topic from the same country: the same purchase.
    await expand(t, other.companyId, period + 11 * DAY_MS);

    const bought = await googlePulls(t);
    expect(bought).toHaveLength(1);
    expect(JSON.parse(bought[0].taskArgsJson)).toMatchObject({ target: [{ keyword: TOPIC }], limit: 100, location_code: 2826 });
    expect(bought[0].websiteId).toBeUndefined();
    expect((await googleLines(t)).map((row) => row.reused).sort()).toEqual([false, true]);

    // The next period buys it again.
    await expand(t, korda.companyId, period + 31 * DAY_MS);
    expect(await googlePulls(t)).toHaveLength(2);
  });
});

describe("filing it", () => {
  test("keeps each search once per AI Overview that ran it, the most run first", () => {
    expect(parseAiOverviewFanOuts(answer(
      ["Best carp rods 2026", "carp rod  length guide", "best carp rods 2026"],
      ["best carp rods 2026"],
      null,
    ))).toEqual([
      { query: "best carp rods 2026", queryText: "Best carp rods 2026", times: 2 },
      { query: "carp rod length guide", queryText: "carp rod length guide", times: 1 },
    ]);
    expect(parseAiOverviewFanOuts({ unexpected: true })).toEqual([]);
  });

  test("filing one purchase twice counts it once, and the next adds", async () => {
    const t = harness();
    const pullOf = (tag: string) => t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: AI_OVERVIEW_FAN_OUT_OPERATION, family: "AI Optimization", mode: "LIVE", tag, attempts: 0, costUsd: 0,
      sandbox: false, submittedAt: Date.now(), status: "READY",
      taskArgsJson: JSON.stringify(aiOverviewFanOutParams(TOPIC, undefined, 25)),
    } as never));
    const first = await pullOf("first");
    const file = (pullId: Id<"seoDataPulls">, day: string) => t.mutation(internal.aiOverviewFanOuts.writeAiOverviewFanOuts, {
      pullId, topic: TOPIC, place: "GB", day, searches: [{ query: "best carp rods 2026", queryText: "Best carp rods 2026", times: 2 }],
    });

    await file(first, "2026-09-01");
    await file(first, "2026-09-01");
    await file(await pullOf("second"), "2026-10-01");

    const [row] = await t.run(async (ctx) => await ctx.db.query("aiOverviewFanOuts").collect());
    expect([row.timesSeen, row.firstSeenDay, row.lastSeenDay]).toEqual([4, "2026-09-01", "2026-10-01"]);
  });
});

describe("reading it into the angles", () => {
  async function held(t: Harness) {
    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: AI_OVERVIEW_FAN_OUT_OPERATION, family: "AI Optimization", mode: "LIVE", tag: "held", attempts: 0,
        costUsd: 0, sandbox: false, submittedAt: Date.now(), status: "READY", taskArgsJson: "{}",
      } as never);
      await ctx.db.insert("aiOverviewFanOuts", {
        topic: TOPIC, place: "GB", query: "best carp rods for beginners", queryText: "Best carp rods for beginners",
        timesSeen: 3, firstSeenDay: "2026-09-27", lastSeenDay: "2026-09-27", lastPullId: pullId,
      });
    });
  }

  const angles = (t: Harness, holdId: Id<"companyWebsites">) => t.run(async (ctx) =>
    await ctx.db.query("fanOutAngles").withIndex("by_hold_seen", (q) => q.eq("holdId", holdId)).collect());

  test("a website that buys them sees Google's searches as their own source", async () => {
    const t = harness();
    const korda = await askingCompany(t, "Korda", "korda.example");
    await buyGoogle(t, korda.companyId, 100);
    await held(t);

    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: korda.holdId });
    await finishScheduled(t);

    const rows = await angles(t, korda.holdId);
    expect(rows.map((row) => [row.angle, row.engines, row.timesSeen])).toEqual([["beginner best carp rod", ["google_ai_overview"], 3]]);
  });

  test("one that does not buy them sees none, though another company bought the topic", async () => {
    const t = harness();
    const korda = await askingCompany(t, "Korda", "korda.example");
    await held(t);

    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: korda.holdId });
    await finishScheduled(t);

    expect(await angles(t, korda.holdId)).toEqual([]);
  });
});
