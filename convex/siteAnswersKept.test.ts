import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { answerPlace } from "./seoAiEngines";

/**
 * An AI answer's full wording is kept 90 days; who it named and cited, for
 * ever (docs/plans/active/dataforseo-cost-plan.md, B2). The hourly sweep
 * clears the wording and the light row that lists it, never the answer or its
 * citations; an older answer's screens show who it named and cited and say
 * the wording is kept 90 days.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-12-30T12:00:00Z");
const OLD_DAY = "2026-09-25";
const RECENT_DAY = "2026-12-25";
const PROMPT = "best carp rods";
const UK = 2826;
const PLACE = answerPlace("chatgpt", UK);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type Seeded = {
  companyId: Id<"companies">;
  websiteId: Id<"websites">;
  holdId: Id<"companyWebsites">;
  old: { pullId: Id<"seoDataPulls">; answerId: Id<"aiAnswers">; textId: Id<"aiAnswerTexts"> };
  recent: { pullId: Id<"seoDataPulls">; answerId: Id<"aiAnswers">; textId: Id<"aiAnswerTexts"> };
};

/** One answer as its filing writes it: the answer, its citations, its wording and the row that lists it. */
async function answered(t: Harness, websiteId: Id<"websites">, day: string, words: string) {
  return await t.run(async (ctx) => {
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_chatgpt", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY",
      tag: `t-${day}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(), completedAt: Date.now(),
    } as never);
    const answerId = await ctx.db.insert("aiAnswers", {
      prompt: PROMPT, engine: "chatgpt", locationCode: PLACE, day, pullId,
      named: [websiteId], recommended: [websiteId], warnedAgainst: [], createdAt: Date.now(),
    });
    const citation = { prompt: PROMPT, engine: "chatgpt" as const, locationCode: PLACE, day, pullId, createdAt: Date.now() };
    await ctx.db.insert("aiCitations", { ...citation, kind: "BRAND", mentionedWebsiteId: websiteId, mentionedText: "Korda", variantKind: "NAME", position: 1 });
    await ctx.db.insert("aiCitations", { ...citation, kind: "SOURCE", mentionedWebsiteId: websiteId, mentionedText: "kordatackle.com", url: "https://kordatackle.com/rods", position: 1 });
    await ctx.db.insert("aiCitations", { ...citation, kind: "SOURCE", mentionedText: "anglers.net", url: "https://anglers.net/best", position: 2 });
    const textId = await ctx.db.insert("aiAnswerTexts", {
      pullId, prompt: PROMPT, engine: "chatgpt", locationCode: PLACE, day, text: words,
      sources: ["https://kordatackle.com/rods", "https://anglers.net/best"], createdAt: Date.now(),
    });
    await ctx.db.insert("aiAnswerIndex", { textId, pullId, prompt: PROMPT, engine: "chatgpt", locationCode: PLACE, day });
    return { pullId, answerId, textId };
  });
}

/** Korda asking ChatGPT one question: an answer filed 96 days ago and one five days ago, written in that order. */
async function seed(t: Harness): Promise<Seeded> {
  vi.setSystemTime(Date.parse(`${OLD_DAY}T09:00:00Z`));
  const { companyId, websiteId, holdId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    await ctx.db.insert("websiteQuestions", { websiteId, companyWebsiteId: holdId, prompt: PROMPT, engines: ["chatgpt"], isActive: true, createdAt: Date.now() });
    return { companyId, websiteId, holdId };
  });
  const old = await answered(t, websiteId, OLD_DAY, "Korda makes the best carp rods.");
  vi.setSystemTime(Date.parse(`${RECENT_DAY}T09:00:00Z`));
  const recent = await answered(t, websiteId, RECENT_DAY, "Korda still makes the best carp rods.");
  vi.setSystemTime(NOW);
  return { companyId, websiteId, holdId, old, recent };
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

const purge = (t: Harness) => t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "purgeWording" });

describe("an AI answer's wording, kept 90 days (B2)", () => {
  test("the hourly sweep clears the wording older than 90 days, with the row that lists it, and keeps the newer; never the answer or its citations", async () => {
    const t = harness();
    const s = await seed(t);
    const counts = () => t.run(async (ctx) => ({
      answers: (await ctx.db.query("aiAnswers").collect()).length,
      citations: (await ctx.db.query("aiCitations").collect()).length,
    }));
    const before = await counts();

    expect(await purge(t)).toMatchObject({ more: false });

    expect(await t.run(async (ctx) => (await ctx.db.query("aiAnswerTexts").collect()).map((row) => row._id))).toEqual([s.recent.textId]);
    expect(await t.run(async (ctx) => (await ctx.db.query("aiAnswerIndex").collect()).map((row) => row.textId))).toEqual([s.recent.textId]);
    expect(await counts()).toEqual(before);
    expect(before).toEqual({ answers: 2, citations: 6 });
  });

  test("past them, the answer is still listed and opens: who it named and cited, and no wording; a search finds the 90 days'", async () => {
    const t = harness();
    const s = await seed(t);
    await purge(t);
    const asKorda = await member(t, s.companyId);
    const list = (search?: string) => asKorda.query(api.siteAnswers.listAnswers, {
      siteId: s.holdId, prompt: PROMPT, from: "2026-09-01", to: "2026-12-30", page: 1, rows: 25, ...(search ? { search } : {}),
    });

    const listed = await list();
    expect(listed.total).toBe(2);
    expect(listed.rows).toEqual([
      { _id: s.recent.textId, engine: "chatgpt", day: RECENT_DAY, text: "Korda still makes the best carp rods.", sources: ["https://kordatackle.com/rods", "https://anglers.net/best"], stance: "RECOMMENDED" },
      { _id: s.old.answerId, engine: "chatgpt", day: OLD_DAY, text: null, sources: ["https://kordatackle.com/rods", "https://anglers.net/best"], stance: "RECOMMENDED" },
    ]);

    const opened = await asKorda.query(api.siteAnswers.answerRecord, { siteId: s.holdId, answerId: s.old.answerId });
    expect(opened).toMatchObject({ prompt: PROMPT, engine: "chatgpt", day: OLD_DAY, text: null, stance: "RECOMMENDED" });
    expect(opened?.sources).toEqual([{ url: "https://kordatackle.com/rods", page: "/rods" }, { url: "https://anglers.net/best", page: null }]);
    // A newer answer opened by its own id still shows its words.
    expect(await asKorda.query(api.siteAnswers.answerRecord, { siteId: s.holdId, answerId: s.recent.answerId })).toMatchObject({
      text: "Korda still makes the best carp rods.",
    });

    expect((await list("korda")).rows.map((row) => row._id)).toEqual([s.recent.textId]);
  });

  test("an answer past the 90 days whose wording is not yet cleared is listed once, with it; one inside them never worded is not listed", async () => {
    const t = harness();
    const s = await seed(t);
    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "ai_citation_chatgpt", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY",
        tag: "t-unworded", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now() - DAY_MS,
      } as never);
      await ctx.db.insert("aiAnswers", {
        prompt: PROMPT, engine: "chatgpt", locationCode: PLACE, day: "2026-12-20", pullId,
        named: [], recommended: [], warnedAgainst: [], createdAt: Date.now(),
      });
    });
    const asKorda = await member(t, s.companyId);
    const listed = await asKorda.query(api.siteAnswers.listAnswers, { siteId: s.holdId, prompt: PROMPT, from: "2026-09-01", to: "2026-12-30", page: 1, rows: 25 });
    expect(listed.rows.map((row) => [row._id, row.text !== null])).toEqual([[s.recent.textId, true], [s.old.textId, true]]);
  });
});
