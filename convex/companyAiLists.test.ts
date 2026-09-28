import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * AI questions and searches: a company's questions, Google searches and the
 * searches the AI ran, across all its own websites
 * (docs/plans/active/fan-out-angles-plan.md, FA9) — its own, never another
 * company's, and never its competitors'.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-09-27";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Anthony", email: `a-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

/** One of a company's websites: its own, or a competitor it watches. */
async function hold(t: Harness, companyId: Id<"companies">, host: string, relationship: "OWNED" | "TRACKED" = "OWNED") {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship, createdAt: Date.now() });
    return { websiteId, holdId };
  });
}

async function question(t: Harness, site: { websiteId: Id<"websites">; holdId: Id<"companyWebsites"> }, prompt: string, fanOuts: Array<[string, number]> = []) {
  await t.run(async (ctx) => {
    await ctx.db.insert("websiteQuestions", {
      websiteId: site.websiteId, companyWebsiteId: site.holdId, prompt, engines: ["claude"], isActive: true, createdAt: Date.now(),
    });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", websiteId: site.websiteId, taskArgsJson: "{}",
      status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    for (const [query, timesSeen] of fanOuts) {
      await ctx.db.insert("promptFanOutQueries", {
        prompt, engine: "claude", query, queryText: query, timesSeen, firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
      });
    }
  });
  await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: site.holdId });
  await finishScheduled(t);
}

describe("a company's AI questions and searches, across its own websites", () => {
  test("every question of every own website, with how many searches the AI ran for each — and nobody else's", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const other = await company(t, "Other");
    const main = await hold(t, korda, "korda.example");
    const second = await hold(t, korda, "korda-shop.example");
    const rival = await hold(t, korda, "rival.example", "TRACKED");
    const theirs = await hold(t, other, "other.example");
    await question(t, main, "What tackle do I need for carp fishing?", [["carp fishing tackle list", 3], ["essential carp fishing gear", 3]]);
    await question(t, second, "What is the best carp fishing luggage?", [["carp fishing luggage reviews", 3]]);
    await question(t, theirs, "Somebody else's question");
    await t.run(async (ctx) => await ctx.db.insert("websiteQuestions", {
      websiteId: rival.websiteId, companyWebsiteId: rival.holdId, prompt: "A competitor's own list", engines: ["claude"], isActive: true, createdAt: Date.now(),
    }));

    const admin = await superAdmin(t);
    const listed = await admin.query(api.companyAiLists.listCompanyQuestions, { companyId: korda, page: 1, pageSize: 15 });
    expect(listed.data.map((row) => [row.prompt, row.host, row.fanOutSearches, row.fanOutTicked])).toEqual([
      ["What tackle do I need for carp fishing?", "korda.example", 2, 0],
      ["What is the best carp fishing luggage?", "korda-shop.example", 1, 0],
    ]);
    expect(listed.engineCalls).toBe(2);

    const counts = await admin.query(api.companyAiLists.companyAiListCounts, { companyId: korda });
    // Nothing is tracked until it is ticked on its prompt's list (fan-out-opt-in-plan.md).
    expect(counts).toMatchObject({ questions: 2, searches: 0, fanOut: 3 });
    // Each website's prompts against its limit, for the add box: asking and paused alike count.
    expect(counts.websites.map((site) => [site.host, site.everydayKeywords, site.prompts, site.promptsPaused, site.promptsLimit])).toEqual([
      ["korda.example", 1_000, 1, 0, 10],
      ["korda-shop.example", 1_000, 1, 0, 10],
    ]);
  });

  test("the searches the AI ran, filtered, with where the website came in each one's newest check, and which are ticked", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const main = await hold(t, korda, "korda.example");
    const second = await hold(t, korda, "korda-shop.example");
    await question(t, main, "What tackle do I need for carp fishing?", [["carp fishing tackle list", 3], ["rod and reel for carp fishing", 1]]);
    await question(t, second, "What is the best carp fishing luggage?", [["top rated carp fishing luggage", 2]]);
    await t.run(async (ctx) => {
      await ctx.db.insert("seoKeywordIntents", { keyword: "rod and reel for carp fishing", intent: "BUYING", judgedAt: Date.now() });
      await ctx.db.insert("seoKeywordIntents", { keyword: "top rated carp fishing luggage", intent: "BUYING", judgedAt: Date.now() });
    });
    const admin = await superAdmin(t);
    const ask = (extra: Record<string, unknown> = {}) =>
      admin.query(api.companyAiLists.listCompanyFanOut, { companyId: korda, page: 1, pageSize: 15, ...extra });

    const all = await ask();
    expect(all.data.map((row) => [row.queryText, row.host, row.timesSeen, row.everyRun, row.google])).toEqual([
      ["carp fishing tackle list", "korda.example", 3, false, null],
      ["top rated carp fishing luggage", "korda-shop.example", 2, false, null],
      ["rod and reel for carp fishing", "korda.example", 1, false, null],
    ]);
    expect((await ask({ intent: "BUYING" })).data.map((row) => row.queryText)).toEqual(["top rated carp fishing luggage", "rod and reel for carp fishing"]);
    expect((await ask({ companyWebsiteId: second.holdId })).data.map((row) => row.queryText)).toEqual(["top rated carp fishing luggage"]);
    expect((await ask({ prompt: "What tackle do I need for carp fishing?" })).totalCount).toBe(2);

    // One ticked on its prompt's list: on Tracked keywords, and nothing else is.
    const questionId = await t.run(async (ctx) =>
      (await ctx.db.query("websiteQuestions").withIndex("by_hold", (q) => q.eq("companyWebsiteId", main.holdId)).first())!._id);
    await admin.mutation(api.promptFanOut.setPromptFanOutQueryTicked, { companyId: korda, questionId, queryText: "carp fishing tackle list", ticked: true });
    const searches = await admin.query(api.companyAiLists.listCompanySearches, { companyId: korda, page: 1, pageSize: 15 });
    expect(searches.data.map((row) => [row.keyword, row.host, row.addedFrom])).toEqual([["carp fishing tackle list", "korda.example", "AI_SEARCH"]]);

    // The checks come back: the ticked one 4th; another's first check did not find the site.
    const pull = () => t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "serp_google_organic", family: "SERP", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: `k-${Math.random()}`,
      attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never));
    const tracked = await pull();
    await t.mutation(internal.seoKeywordChecks.writeKeywordCheck, {
      pullId: tracked, keyword: "carp fishing tackle list", day: DAY, found: [{ websiteId: main.websiteId, position: 4 }],
    });
    const first = await pull();
    await t.run(async (ctx) => {
      const record = await ctx.db.query("fanOutFirstChecks").withIndex("by_hold_query", (q) => q.eq("holdId", main.holdId).eq("query", "rod and reel for carp fishing")).unique();
      await ctx.db.patch(record!._id, { pullId: first });
    });
    await t.mutation(internal.seoKeywordChecks.writeKeywordCheck, { pullId: first, keyword: "rod and reel for carp fishing", day: DAY, found: [] });

    expect((await ask()).data.map((row) => [row.queryText, row.everyRun, row.google])).toEqual([
      ["carp fishing tackle list", true, { position: 4, day: DAY }],
      ["top rated carp fishing luggage", false, null],
      ["rod and reel for carp fishing", false, { position: null, day: DAY }],
    ]);
    const prompts = await admin.query(api.companyAiLists.listCompanyQuestions, { companyId: korda, page: 1, pageSize: 15 });
    expect(prompts.data.map((row) => [row.fanOutSearches, row.fanOutTicked])).toEqual([[2, 1], [1, 0]]);
  });

  test("where a search came from: as recorded, or for an older one whether the AI ran it", async () => {
    const t = harness();
    const korda = await company(t, "Korda");
    const main = await hold(t, korda, "korda.example");
    await question(t, main, "What tackle do I need for carp fishing?", [["carp fishing tackle list", 3]]);
    await t.run(async (ctx) => {
      for (const keyword of ["carp fishing tackle list", "korda carp rods"]) {
        await ctx.db.insert("websiteKeywords", { websiteId: main.websiteId, companyWebsiteId: main.holdId, keyword, isActive: true, createdAt: Date.now() });
      }
    });
    const admin = await superAdmin(t);
    await admin.mutation(api.websiteCanonical.addWebsiteKeyword, { companyWebsiteId: main.holdId, keyword: "carp bivvy" });

    const searches = await admin.query(api.companyAiLists.listCompanySearches, { companyId: korda, page: 1, pageSize: 15 });
    expect(Object.fromEntries(searches.data.map((row) => [row.keyword, row.addedFrom]))).toEqual({
      "carp fishing tackle list": "AI_SEARCH",
      "korda carp rods": "HAND",
      "carp bivvy": "HAND",
    });
  });
});
