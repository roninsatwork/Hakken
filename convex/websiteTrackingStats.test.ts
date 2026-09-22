import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * The summaries the Tracking screen reads, kept as results are filed.
 *
 * The behaviour worth more than the rest: **an answer that named nobody still
 * counts as asked.** `aiCitations` has a row per mention, so an answer naming
 * no one we know leaves nothing there — which is why "named in 3 of 14" needed
 * a record of the answer itself.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const UK = 2826;
const LEEDS = 1006925;

async function seedWebsite(t: Harness, host: string) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() }));
}

async function seedPull(t: Harness, operationId: string, taskArgs: Record<string, unknown>) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId,
    family: "AI Optimization",
    mode: "LIVE",
    taskArgsJson: JSON.stringify(taskArgs),
    status: "READY",
    tag: `t-${Math.random()}`,
    attempts: 0,
    costUsd: 0,
    sandbox: false,
    submittedAt: Date.now(),
  } as never));
}

async function answer(
  t: Harness,
  prompt: string,
  day: string,
  brands: Array<{ websiteId: Id<"websites">; stance?: "RECOMMENDED" | "MENTIONED" | "WARNED_AGAINST" }>,
) {
  const pullId = await seedPull(t, "ai_chatgpt", { user_prompt: prompt });
  await t.mutation(internal.seoCollectionParse.writeAiCitations, {
    pullId,
    prompt,
    engine: "chatgpt",
    day,
    brands: brands.map((brand) => ({ websiteId: brand.websiteId, text: "x", variantKind: "NAME" as const, ...(brand.stance ? { stance: brand.stance } : {}) })),
    sources: [],
  });
  return pullId;
}

const questionStats = (t: Harness) => t.run(async (ctx) => await ctx.db.query("websiteQuestionStats").collect());
const searchStats = (t: Harness) => t.run(async (ctx) => await ctx.db.query("websiteSearchStats").collect());

describe("question summaries", () => {
  test("an answer that named nobody still counts as asked", async () => {
    const t = harness();
    const ronins = await seedWebsite(t, "ronins.co.uk");
    const rival = await seedWebsite(t, "rival.co.uk");
    const prompt = "who is the best branding agency in Leeds";
    await t.run(async (ctx) => await ctx.db.insert("websiteQuestions", {
      websiteId: ronins, prompt, engines: ["chatgpt", "claude"], isActive: true, createdAt: Date.now(),
    }));

    await answer(t, prompt, "2026-09-01", [{ websiteId: ronins, stance: "RECOMMENDED" }, { websiteId: rival }]);
    await answer(t, prompt, "2026-09-08", []);
    await answer(t, prompt, "2026-09-15", [{ websiteId: rival }]);

    const [stats] = await questionStats(t);
    expect(stats).toMatchObject({
      websiteId: ronins,
      engine: "chatgpt",
      locationCode: UK,
      asked: 3,
      named: 1,
      recommended: 1,
      firstAskedDay: "2026-09-01",
      lastAskedDay: "2026-09-15",
      lastNamed: false,
      lastNamedDay: "2026-09-01",
    });
    // Who else the answers put forward, for the Competitors tab.
    expect(stats.othersNamed).toEqual([{ websiteId: rival, times: 2, lastDay: "2026-09-15" }]);
  });

  test("re-reading an answer changes nothing", async () => {
    const t = harness();
    const ronins = await seedWebsite(t, "ronins.co.uk");
    const prompt = "who is the best branding agency in Leeds";
    await t.run(async (ctx) => await ctx.db.insert("websiteQuestions", {
      websiteId: ronins, prompt, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
    }));
    const pullId = await answer(t, prompt, "2026-09-01", [{ websiteId: ronins }]);

    for (const _again of [1, 2]) {
      await t.mutation(internal.seoCollectionParse.writeAiCitations, {
        pullId, prompt, engine: "chatgpt", day: "2026-09-01",
        brands: [{ websiteId: ronins, text: "x", variantKind: "NAME" }], sources: [],
      });
    }

    const [stats] = await questionStats(t);
    expect(stats.asked).toBe(1);
    expect(stats.named).toBe(1);
  });

  test("a host that does not ask this engine gets no summary from it", async () => {
    const t = harness();
    const ronins = await seedWebsite(t, "ronins.co.uk");
    const prompt = "who is the best branding agency in Leeds";
    await t.run(async (ctx) => await ctx.db.insert("websiteQuestions", {
      websiteId: ronins, prompt, engines: ["claude"], isActive: true, createdAt: Date.now(),
    }));

    await answer(t, prompt, "2026-09-01", [{ websiteId: ronins }]);

    expect(await questionStats(t)).toHaveLength(0);
  });
});

describe("search summaries", () => {
  async function check(t: Harness, keyword: string, day: string, locationCode: number, found: Array<{ websiteId: Id<"websites">; position: number }>) {
    const pullId = await seedPull(t, "serp_google_organic", { keyword, location_code: locationCode });
    await t.mutation(internal.seoKeywordChecks.writeKeywordCheck, { pullId, keyword, locationCode, day, found });
  }

  test("the last check, the one before, and whether it ever ranked", async () => {
    const t = harness();
    const ronins = await seedWebsite(t, "ronins.co.uk");
    await t.run(async (ctx) => await ctx.db.insert("websiteKeywords", {
      websiteId: ronins, keyword: "branding agency leeds", isActive: true, createdAt: Date.now(),
    }));

    await check(t, "branding agency leeds", "2026-09-01", LEEDS, [{ websiteId: ronins, position: 4 }]);
    await check(t, "branding agency leeds", "2026-09-08", LEEDS, []);

    const [stats] = await searchStats(t);
    expect(stats).toMatchObject({
      websiteId: ronins,
      keyword: "branding agency leeds",
      locationCode: LEEDS,
      firstCheckedDay: "2026-09-01",
      lastCheckedDay: "2026-09-08",
      previousCheckedDay: "2026-09-01",
      previousPosition: 4,
      bestPosition: 4,
      everRanked: true,
    });
    // Checked and not on the page: absent, never a position.
    expect(stats.lastPosition).toBeUndefined();
  });

  test("one place's checks never touch another's summary", async () => {
    const t = harness();
    const ronins = await seedWebsite(t, "ronins.co.uk");
    await t.run(async (ctx) => await ctx.db.insert("websiteKeywords", {
      websiteId: ronins, keyword: "branding agency leeds", isActive: true, createdAt: Date.now(),
    }));

    await check(t, "branding agency leeds", "2026-09-01", LEEDS, [{ websiteId: ronins, position: 4 }]);
    await check(t, "branding agency leeds", "2026-09-01", UK, [{ websiteId: ronins, position: 19 }]);

    const byPlace = new Map((await searchStats(t)).map((row) => [row.locationCode, row.lastPosition]));
    expect(byPlace.get(LEEDS)).toBe(4);
    expect(byPlace.get(UK)).toBe(19);
  });
});

describe("what an operation costs", () => {
  test("a paid send adds to the running mean, and the sandbox says nothing", async () => {
    const t = harness();
    const paid = async (costUsd: number, sandbox = false) => {
      const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
        operationId: "serp_google_organic", family: "SERP", mode: "QUEUED", taskArgsJson: "{}",
        status: "CLAIMED", tag: `c-${Math.random()}`, attempts: 0, costUsd: 0, sandbox, submittedAt: Date.now(),
      } as never));
      await t.mutation(internal.seoCollectionQueue.settleSeoSend, {
        pullId, taskId: "task", costUsd, sandbox, ready: false,
      });
    };

    await paid(0.0006);
    await paid(0.0008);
    await paid(0.5, true);

    const [row] = await t.run(async (ctx) => await ctx.db.query("seoOperationCosts").collect());
    expect(row.charged).toBe(2);
    expect(row.totalUsd).toBeCloseTo(0.0014, 6);
    expect(row.lastUsd).toBe(0.0008);
  });
});
