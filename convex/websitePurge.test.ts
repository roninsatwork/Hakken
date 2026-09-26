import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { listOwnerOf } from "@/src/test/listOwner";

/**
 * Deleting a website takes everything about it (Anthony, 2026-09-24: "delete
 * everything about the website") — including the answers to its questions and
 * the results pages for its searches, which are bought once and shared with
 * every website asking or tracking the same, and so are saved without a
 * website. What another website still asks or tracks stays: it is that
 * website's too.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const DAY = "2026-09-23";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function purchase(t: Harness, operationId: string) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId, family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY",
    tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.02, sandbox: false, submittedAt: Date.now(),
  } as never));
}

/** An answer to a question, as the parser files it: the answer, its words, a citation and a search the engine ran. */
async function answer(t: Harness, prompt: string, named: Id<"websites">[], citedPageOf?: Id<"websites">) {
  const pullId = await purchase(t, "ai_citation_perplexity");
  await t.run(async (ctx) => {
    await ctx.db.insert("aiAnswers", {
      prompt, engine: "perplexity", locationCode: UK, day: DAY, pullId, named, recommended: [], warnedAgainst: [], createdAt: Date.now(),
    });
    await ctx.db.insert("aiAnswerTexts", {
      pullId, prompt, engine: "perplexity", locationCode: UK, day: DAY, text: "An answer.", sources: [], createdAt: Date.now(),
    });
    for (const websiteId of named) {
      await ctx.db.insert("aiCitations", {
        prompt, engine: "perplexity", locationCode: UK, day: DAY, pullId, kind: "BRAND",
        mentionedWebsiteId: websiteId, mentionedText: "A name", position: 1, createdAt: Date.now(),
      });
    }
    if (citedPageOf) {
      await ctx.db.insert("aiCitations", {
        prompt, engine: "perplexity", locationCode: UK, day: DAY, pullId, kind: "SOURCE",
        mentionedWebsiteId: citedPageOf, mentionedText: "kept.co.uk", url: "https://kept.co.uk/services/", position: 1, createdAt: Date.now(),
      });
      await ctx.db.insert("siteCitedPages", {
        websiteId: citedPageOf, url: "https://kept.co.uk/services/", page: "/services/", prompt, engine: "perplexity",
        locationCode: UK, times: 1, firstDay: DAY, lastDay: DAY, updatedAt: Date.now(),
      });
    }
    await ctx.db.insert("promptFanOutQueries", {
      prompt, engine: "perplexity", query: `${prompt} search`, queryText: `${prompt} search`, timesSeen: 1,
      firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
    } as never);
    await ctx.db.insert("promptFanOutDays", { prompt, engine: "perplexity", query: `${prompt} search`, day: DAY, pullId, createdAt: Date.now() } as never);
  });
  return pullId;
}

async function resultsPage(t: Harness, keyword: string) {
  const pullId = await purchase(t, "serp_google_organic");
  await t.run(async (ctx) => {
    await ctx.db.insert("siteSerpPages", {
      keyword, locationCode: UK, day: DAY, pullId, resultCount: 1, results: [{ position: 1, domain: "kept.co.uk" }],
      features: [], aiOverviewDomains: [], localPackDomains: [], questions: [], related: [], createdAt: Date.now(),
    });
  });
  return pullId;
}

describe("deleting a website", () => {
  test("takes the answers and results pages only it used, keeps what another website shares, and leaves no one naming it", async () => {
    const t = harness();
    const { gone, kept } = await t.run(async (ctx) => ({
      gone: await ctx.db.insert("websites", { host: "gone.co.uk", displayHost: "gone.co.uk", firstSeenAt: Date.now() }),
      kept: await ctx.db.insert("websites", { host: "kept.co.uk", displayHost: "kept.co.uk", firstSeenAt: Date.now() }),
    }));
    await t.run(async (ctx) => {
      for (const [websiteId, prompt] of [[gone, "only gone asks"], [gone, "both ask"], [kept, "both ask"], [kept, "only kept asks"]] as const) {
        await ctx.db.insert("websiteQuestions", { websiteId, companyWebsiteId: await listOwnerOf(ctx, websiteId), prompt, engines: ["perplexity"], isActive: true, createdAt: Date.now() });
      }
      for (const [websiteId, keyword] of [[gone, "only gone tracks"], [gone, "both track"], [kept, "both track"]] as const) {
        await ctx.db.insert("websiteKeywords", { websiteId, companyWebsiteId: await listOwnerOf(ctx, websiteId), keyword, isActive: true, createdAt: Date.now() });
      }
    });
    const goneOnly = await answer(t, "only gone asks", [gone], kept);
    const shared = await answer(t, "both ask", [gone, kept]);
    const keptOnly = await answer(t, "only kept asks", [kept, gone]);
    const goneSearch = await resultsPage(t, "only gone tracks");
    const sharedSearch = await resultsPage(t, "both track");

    // Deleted as the website delete does it: the record, then its purges.
    await t.run(async (ctx) => await ctx.db.delete(gone));
    await t.mutation(internal.websitePurge.purgeWebsiteListsInternal, { websiteId: gone });
    await t.mutation(internal.websitePurge.purgeWebsiteCollectedDataInternal, { websiteId: gone });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const left = await t.run(async (ctx) => ({
      answers: (await ctx.db.query("aiAnswers").collect()).map((row) => [row.prompt, row.named]),
      texts: (await ctx.db.query("aiAnswerTexts").collect()).map((row) => row.prompt).sort(),
      searches: (await ctx.db.query("promptFanOutQueries").collect()).map((row) => row.prompt).sort(),
      searchDays: (await ctx.db.query("promptFanOutDays").collect()).map((row) => row.prompt).sort(),
      citations: (await ctx.db.query("aiCitations").collect()).map((row) => [row.prompt, row.kind]),
      cited: await ctx.db.query("siteCitedPages").collect(),
      pages: (await ctx.db.query("siteSerpPages").collect()).map((row) => row.keyword),
      purchases: {
        goneOnly: await ctx.db.get(goneOnly), shared: await ctx.db.get(shared), keptOnly: await ctx.db.get(keptOnly),
        goneSearch: await ctx.db.get(goneSearch), sharedSearch: await ctx.db.get(sharedSearch),
      },
    }));

    // The question only it asked is gone, with everything its answers filed.
    expect(left.answers.map(([prompt]) => prompt).sort()).toEqual(["both ask", "only kept asks"]);
    expect(left.texts).toEqual(["both ask", "only kept asks"]);
    expect(left.searches).toEqual(["both ask", "only kept asks"]);
    expect(left.searchDays).toEqual(["both ask", "only kept asks"]);
    expect(left.purchases.goneOnly).toBeNull();
    // The page it cited is no longer counted as cited.
    expect(left.cited).toEqual([]);
    // Its search's results page and purchase are gone; the shared search stays.
    expect(left.pages).toEqual(["both track"]);
    expect(left.purchases.goneSearch).toBeNull();
    expect(left.purchases.sharedSearch).not.toBeNull();
    // What another website still asks stays, and no answer still names it.
    expect(left.purchases.shared).not.toBeNull();
    expect(left.purchases.keptOnly).not.toBeNull();
    for (const [, named] of left.answers) expect(named).not.toContain(gone);
    expect(left.citations.every(([prompt]) => prompt !== "only gone asks")).toBe(true);
  });
});
