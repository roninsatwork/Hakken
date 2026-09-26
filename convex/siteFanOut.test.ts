import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { AI_ENGINE_CALLS, AI_ENGINES, answerPlace, fanOutPlace, type AiEngine } from "./seoAiEngines";

/**
 * Fan-out searches on the Sites screens come from every engine that sends
 * them, read by the place the question was asked from — exactly as it was
 * sent, which is nothing when the watcher chose no place. They were read by
 * the place a screen shows instead, which falls back to the United Kingdom, so
 * every search from an engine that takes a place was hidden, and only the
 * searches of the engine that never takes one showed (Anthony, 2026-09-26,
 * asking why the page showed only one engine's).
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-09-26";
const LONDON = 1006886;
/** The engine asked with no place ever, whatever the watcher chose — from the engine table, not named. */
const PLACELESS = AI_ENGINES.find((engine) => !AI_ENGINE_CALLS[engine].takesLocation && AI_ENGINE_CALLS[engine].hasWebSearchSwitch) as AiEngine;

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

/** An owned website with its question, from a chosen place or from none. */
async function askedSite(t: Harness, companyId: Id<"companies">, host: string, prompt: string, locationCode?: number) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship: "OWNED", createdAt: Date.now(), ...(locationCode === undefined ? {} : { locationCode }),
    });
    await ctx.db.insert("websiteQuestions", {
      websiteId, companyWebsiteId: holdId, prompt, engines: ["chatgpt", "claude", PLACELESS], isActive: true, createdAt: Date.now(),
    });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_chatgpt", family: "AI Optimization", mode: "LIVE", websiteId, taskArgsJson: "{}",
      status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    return { websiteId, holdId, pullId };
  });
}

/** A fan-out search, filed as the collection files it: under the place that was sent. */
async function fanOut(t: Harness, pullId: Id<"seoDataPulls">, prompt: string, engine: AiEngine, query: string, locationCode?: number) {
  const place = fanOutPlace(engine, locationCode);
  await t.run(async (ctx) => await ctx.db.insert("promptFanOutQueries", {
    prompt, engine, query, queryText: query, timesSeen: 1, firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
    ...(place === undefined ? {} : { place }),
  }));
}

describe("fan-out searches on the Sites screens", () => {
  test("show every engine's, for a website with no place chosen", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const prompt = "who are the best web designers in Surrey, England";
    const own = await askedSite(t, ronins, "ronins.co.uk", prompt);
    // Asked with no country: each filed under no place.
    await fanOut(t, own.pullId, prompt, PLACELESS, "top web design agencies surrey");
    await fanOut(t, own.pullId, prompt, "chatgpt", "best web designers surrey");
    await fanOut(t, own.pullId, prompt, "claude", "award winning web design surrey");

    const asRonins = await member(t, ronins);
    const found = (await asRonins.query(api.siteAi.listSearched, { siteId: own.holdId })).rows
      .map((row) => [row.query, row.engines.join(",")]).sort();
    expect(found).toEqual([
      ["award winning web design surrey", "claude"],
      ["best web designers surrey", "chatgpt"],
      ["top web design agencies surrey", PLACELESS],
    ]);
  });

  test("read a chosen place's the way it was sent: a country and a city", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const prompt = "who are the best web designers in London";
    const own = await askedSite(t, ronins, "ronins.london", prompt, LONDON);
    await fanOut(t, own.pullId, prompt, "chatgpt", "best web designers london", LONDON);
    // One engine takes no place, so it is asked, and filed, with none.
    await fanOut(t, own.pullId, prompt, PLACELESS, "top web design agencies london", LONDON);

    const asRonins = await member(t, ronins);
    const found = (await asRonins.query(api.siteAi.listSearched, { siteId: own.holdId })).rows
      .map((row) => [row.query, row.engines.join(",")]).sort();
    expect(found).toEqual([["best web designers london", "chatgpt"], ["top web design agencies london", PLACELESS]]);
  });

  test("list an answer's own searches beside it, for any engine", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const prompt = "who are the best web designers in Surrey, England";
    const own = await askedSite(t, ronins, "ronins.co.uk", prompt);
    await fanOut(t, own.pullId, prompt, "chatgpt", "best web designers surrey");
    const answerId = await t.run(async (ctx) => {
      await ctx.db.insert("aiAnswers", {
        prompt, engine: "chatgpt", locationCode: answerPlace("chatgpt", undefined), day: DAY, pullId: own.pullId,
        named: [own.websiteId], recommended: [], warnedAgainst: [], createdAt: Date.now(),
      } as never);
      return await ctx.db.insert("aiAnswerTexts", {
        prompt, engine: "chatgpt", locationCode: answerPlace("chatgpt", undefined), day: DAY, pullId: own.pullId,
        text: "Ronins is a Surrey web design agency.", sources: [], createdAt: Date.now(),
      });
    });

    const asRonins = await member(t, ronins);
    const answer = await asRonins.query(api.siteAnswers.answerRecord, { siteId: own.holdId, answerId });
    expect(answer?.searches.map((entry) => entry.query)).toEqual(["best web designers surrey"]);
  });
});
