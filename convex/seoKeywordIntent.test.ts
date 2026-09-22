import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { TypesafeAskResult } from "./typesafeProviderService";
import { judgeNewKeywords, normaliseKeyword } from "./seoJudgments";

/**
 * What somebody means by a search, and what it costs to find out.
 *
 * The economics are the whole design: a phrase is judged once and the answer
 * kept forever, so a site with a thousand searches is a thousand questions on
 * its first collection and none on its next — and two clients in the same
 * trade share every answer between them.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super", email: `su-${Math.random()}@test.com`, role: "SUPER_ADMIN", createdAt: Date.now(),
    } as never));
  return t.withIdentity({ subject: userId });
}

function stubCtx(modes: Record<string, string>, t?: Harness) {
  const runQuery = vi.fn(async (_ref: unknown, queryArgs: unknown) => {
    const keys = (queryArgs as { decisionKeys?: string[] })?.decisionKeys;
    if (keys) return Object.fromEntries(keys.map((key) => [key, modes[key] ?? "OFF"]));
    const keywords = (queryArgs as { keywords?: string[] })?.keywords;
    if (keywords && t) return await t.query(internal.seoCollectionParse.findUnjudgedKeywords, { keywords });
    if (keywords) return keywords;
    return { modelId: "m1", providerKey: "typesafe", providerModelId: "jev-latest", source: "default" };
  });
  const runMutation = vi.fn(async (ref: unknown, mutationArgs: unknown) => {
    const judged = (mutationArgs as { judged?: unknown })?.judged;
    if (judged && t) await t.mutation(internal.seoCollectionParse.writeKeywordIntents, mutationArgs as never);
    return { runIds: [], costGBP: 0 };
  });
  return { runQuery, runMutation } as unknown as ActionCtx;
}

const chose = (choices: Record<string, string>): TypesafeAskResult => ({
  model: "jev-latest",
  answers: Object.fromEntries(Object.entries(choices).map(([id, choice]) => [
    id, { type: "choice", choice, probabilities: { [choice]: 0.95 }, confidence: 0.95 },
  ])) as TypesafeAskResult["answers"],
  usage: { inputTokens: 60, outputTokens: 6 },
});

describe("one phrase, one row", () => {
  test("differently typed spellings of one search are one phrase", () => {
    // Otherwise the same question is bought twice for the same meaning.
    expect(normaliseKeyword("  Emergency   Plumber  Leeds ")).toBe("emergency plumber leeds");
  });
});

describe("judging what people mean", () => {
  test("tells a ready buyer from someone just reading", async () => {
    const t = harness();
    await judgeNewKeywords(
      stubCtx({ "seo.keyword-intent": "ACT" }, t),
      { pullId: "p1" as Id<"seoDataPulls">, host: "ourshop.com", keywords: ["emergency plumber leeds", "how does a boiler work"] },
      { ask: async () => chose({ "0": "buying", "1": "researching" }) },
    );

    const rows = await t.run(async (ctx) => await ctx.db.query("seoKeywordIntents").collect());
    expect(rows.map((row) => [row.keyword, row.intent]).sort())
      .toEqual([["emergency plumber leeds", "BUYING"], ["how does a boiler work", "RESEARCHING"]]);
  });

  test("never pays twice for the same phrase", async () => {
    const t = harness();
    const ask = vi.fn(async () => chose({ "0": "buying" }));
    const args = {
      pullId: "p1" as Id<"seoDataPulls">, host: "ourshop.com",
      keywords: ["emergency plumber leeds"],
    };

    await judgeNewKeywords(stubCtx({ "seo.keyword-intent": "ACT" }, t), args, { ask: ask as never });
    await judgeNewKeywords(stubCtx({ "seo.keyword-intent": "ACT" }, t), args, { ask: ask as never });

    // The second collection finds it already judged and asks nothing. This is
    // what makes a thousand-search site affordable at all.
    expect(ask).toHaveBeenCalledTimes(1);
  });

  test("asks nothing while the Decision is switched off", async () => {
    const t = harness();
    const ask = vi.fn();
    await judgeNewKeywords(
      stubCtx({ "seo.keyword-intent": "OFF" }, t),
      { pullId: "p1" as Id<"seoDataPulls">, host: "ourshop.com", keywords: ["emergency plumber leeds"] },
      { ask: ask as never },
    );

    expect(ask).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => await ctx.db.query("seoKeywordIntents").collect())).toHaveLength(0);
  });

  test("caps how many one run judges, so a first collection is not one huge bill", async () => {
    const t = harness();
    const many = Array.from({ length: 80 }, (_, index) => `search number ${index}`);
    let askedCount = 0;
    await judgeNewKeywords(
      stubCtx({ "seo.keyword-intent": "ACT" }, t),
      { pullId: "p1" as Id<"seoDataPulls">, host: "ourshop.com", keywords: many },
      {
        ask: async ({ questions }) => {
          askedCount = Object.keys(questions).length;
          return chose(Object.fromEntries(Object.keys(questions).map((id) => [id, "buying"])));
        },
      },
    );

    // The rest arrive over the following collections; nothing is lost, and
    // since an answer is kept forever the backlog drains and never returns.
    expect(askedCount).toBe(50);
  });

  test("keeps nothing when the model could not be asked", async () => {
    const t = harness();
    await judgeNewKeywords(
      stubCtx({ "seo.keyword-intent": "ACT" }, t),
      { pullId: "p1" as Id<"seoDataPulls">, host: "ourshop.com", keywords: ["emergency plumber leeds"] },
      { ask: async () => { throw new Error("overloaded"); } },
    );

    // Unjudged searches are simply judged next time. Nothing is guessed.
    expect(await t.run(async (ctx) => await ctx.db.query("seoKeywordIntents").collect())).toHaveLength(0);
  });
});

describe("what a website ranks for", () => {
  test("shows the newest position per search, best first, with its intent", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const world = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", {
        host: "ourshop.com", displayHost: "ourshop.com", firstSeenAt: Date.now(),
      });
      const hold = await ctx.db.insert("companyWebsites", { companyId, websiteId, createdAt: Date.now() });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "domain_ranked_keywords", family: "DataForSEO Labs", mode: "LIVE",
        websiteId, taskArgsJson: "{}", status: "READY", tag: "t", costUsd: 0, sandbox: true,
        submittedAt: Date.now(), completedAt: Date.now(),
      });
      // The same phrase on two days, plus a second phrase ranking better.
      await ctx.db.insert("seoKeywordPositions", {
        websiteId, keyword: "emergency plumber leeds", day: "2026-09-20", position: 9, pullId, createdAt: Date.now(),
      });
      await ctx.db.insert("seoKeywordPositions", {
        websiteId, keyword: "emergency plumber leeds", day: "2026-09-22", position: 4, pullId, createdAt: Date.now(),
      });
      await ctx.db.insert("seoKeywordPositions", {
        websiteId, keyword: "boiler repair", day: "2026-09-22", position: 2, pullId, createdAt: Date.now(),
      });
      await ctx.db.insert("seoKeywordIntents", {
        keyword: "emergency plumber leeds", intent: "BUYING", judgedAt: Date.now(),
      });
      return { hold };
    });

    const listed = await admin.query(api.seoKeywordReports.listWebsiteKeywords, {
      companyWebsiteId: world.hold, page: 1, pageSize: 15,
    });

    // One row per search, the newest day's position, best position first.
    expect(listed.data.map((row) => [row.keyword, row.position, row.intent])).toEqual([
      ["boiler repair", 2, null],
      ["emergency plumber leeds", 4, "BUYING"],
    ]);
  });
});
