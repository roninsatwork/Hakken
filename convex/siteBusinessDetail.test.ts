import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { AI_ENGINES } from "./seoAiEngines";
import { packColumn } from "./utils/packedColumns";

/**
 * One business (discovery-detail-and-hakken-sees-plan.md §3): a rival watched
 * — where Google's AI names it beside you, where ChatGPT shows it, the pages
 * naming it — and a business known only by its Google profile, joined by its
 * website or its profile, never by name alone.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useFixedDay("2026-10-09"));
afterEach(() => vi.useRealTimers());

const COST = "how much does a website cost in the uk";
const SURREY = "best web design agency in surrey";
const day = (iso: string) => Math.round(Date.parse(iso) / 86_400_000);

async function seed() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { name: "Member", email: "m@ronins.co.uk", role: "ADMIN" as const, companyId, createdAt: Date.now() });
    const own = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const rival = await ctx.db.insert("websites", { host: "brightside.co.uk", displayHost: "brightside.co.uk", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId: own, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
    const rivalHold = await ctx.db.insert("companyWebsites", { companyId, websiteId: rival, relationship: "TRACKED", againstWebsiteId: own, locationCode: 2826, createdAt: Date.now() });
    const pullId = await ctx.db.insert("seoDataPulls", { operationId: "radar_mentions", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: "r", attempts: 0, costUsd: 0.3, sandbox: false, submittedAt: Date.now() });
    const reading = async (websiteId: Id<"websites">, mentions: number, questions: Array<{ question: string; volume: number; firstAt?: number; pages: string[] }>) => {
      const pages = [...new Set(questions.flatMap((entry) => entry.pages))];
      const starts: number[] = [];
      const sourceOf: number[] = [];
      for (const entry of questions) {
        starts.push(sourceOf.length);
        sourceOf.push(...entry.pages.map((url) => pages.indexOf(url)));
      }
      await ctx.db.insert("brandRadarQuestionParts", {
        websiteId, locationCode: 2826, month: "2026-10", total: questions.length, questions: questions.map((entry) => entry.question),
        volumes: packColumn(questions.map((entry) => entry.volume)), firstAt: packColumn(questions.map((entry) => entry.firstAt)),
        pages, starts: packColumn(starts), sourceOf: packColumn(sourceOf), pullId, updatedAt: Date.now(),
      });
      await ctx.db.insert("brandRadarMonths", { websiteId, locationCode: 2826, months: ["2026-09", "2026-10"], mentions: packColumn([mentions - 9, mentions]), asks: packColumn([1000, 1200]), pages: packColumn([3, 4]), updatedAt: Date.now() });
    };
    await reading(own, 64, [{ question: SURREY, volume: 1300, firstAt: 40, pages: ["https://www.ronins.co.uk/web-design-surrey/"] }]);
    await reading(rival, 121, [
      { question: COST, volume: 2900, firstAt: 10, pages: ["https://brightside.co.uk/website-cost-guide/", "https://clutch.co/pricing/web-design"] },
      { question: SURREY, volume: 1300, firstAt: 5, pages: ["https://clutch.co/uk/web-designers/surrey"] },
    ]);
    // ChatGPT's app showed it first for one question; you second.
    const prompt = "Who is the best web design agency in Guildford?";
    await ctx.db.insert("websiteQuestions", { websiteId: own, companyWebsiteId: holdId, prompt, engines: [...AI_ENGINES], isActive: true, createdAt: Date.now() });
    const answerPull = await ctx.db.insert("seoDataPulls", { operationId: "ai_app_chatgpt", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: "a", attempts: 0, costUsd: 0.004, sandbox: false, submittedAt: Date.now() });
    const textId = await ctx.db.insert("aiAnswerTexts", { pullId: answerPull, prompt, engine: "chatgpt", locationCode: 2826, day: "2026-10-08", text: "An answer.", sources: [], createdAt: Date.now() });
    await ctx.db.insert("aiAnswerIndex", { textId, pullId: answerPull, prompt, engine: "chatgpt", locationCode: 2826, day: "2026-10-08" });
    await ctx.db.insert("aiAnswerExtras", {
      pullId: answerPull, prompt, engine: "chatgpt", locationCode: 2826, day: "2026-10-08", read: [], searches: [],
      businesses: [{ name: "Brightside Digital", host: "www.brightside.co.uk" }, { name: "Ronins", host: "ronins.co.uk" }],
    });
    // Two pages named it this month, one linking to it.
    await ctx.db.insert("webMentionParts", {
      websiteId: rival, urls: ["https://news.example/best", "https://forum.example/thread"], titles: ["The best agencies", null],
      days: packColumn([day("2026-10-07"), day("2026-09-30")]), kinds: packColumn([1, 3]), tones: packColumn([1, 0]), strength: packColumn([300, 20]), linked: packColumn([1, 0]), about: packColumn([1, 1]), updatedAt: Date.now(),
    } as never);
    const listing = await ctx.db.insert("listings", { source: "GOOGLE", key: "123", name: "Hilltop Websites", town: "Guildford", seenAt: Date.now() } as never);
    return { userId, holdId, rivalHold, listing };
  });
  return { as: t.withIdentity({ subject: ids.userId }), ...ids };
}

describe("One business", () => {
  test("a rival watched: Google's AI beside you, ChatGPT's answers, and the pages naming it", async () => {
    const { as, holdId, rivalHold } = await seed();
    const business = await as.query(api.siteBusinessDetail.businessDetail, { siteId: holdId, business: "brightside.co.uk" });
    expect(business).toMatchObject({ found: true, name: "brightside.co.uk", host: "brightside.co.uk", rivalId: rivalHold });
    expect(business.figures).toMatchObject({ named: 121, namedYou: 64, shown: 1, shownYou: 1, answers: 1, mentions: 2 });
    expect(business.questions).toEqual([
      { question: COST, volume: 2900, it: 1, you: null, page: "https://brightside.co.uk/website-cost-guide/" },
      { question: SURREY, volume: 1300, it: 1, you: 2, page: null },
    ]);
    expect(business.answers).toMatchObject([{ question: "Who is the best web design agency in Guildford?", it: 1, you: 2 }]);
    expect(business.mentions.map((row) => [row.url, row.linked])).toEqual([["https://news.example/best", 1], ["https://forum.example/thread", 0]]);
  });

  test("What Hakken sees: ahead in Google's AI, its biggest lead, and what to do first", async () => {
    const { as, holdId } = await seed();
    const { seen } = await as.query(api.siteBusinessDetail.businessDetail, { siteId: holdId, business: "brightside.co.uk" });
    expect(seen.says).toEqual([
      { code: "aheadInAi", text: "brightside.co.uk", a: 121, b: 64 },
      { code: "biggestLead", text: COST, a: 2900 },
    ]);
    expect(seen.steps).toEqual([
      { code: "answerQuestion", text: COST, link: "seeQuestion", to: { record: "question", key: COST } },
      { code: "getListedOn", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } },
    ]);
  });

  test("a business known only by its Google profile says so", async () => {
    const { as, holdId, listing } = await seed();
    const business = await as.query(api.siteBusinessDetail.businessDetail, { siteId: holdId, business: `listing:${listing}` });
    expect(business).toMatchObject({ found: true, name: "Hilltop Websites", host: null, rivalId: null, town: "Guildford" });
    expect(business.seen.says).toEqual([{ code: "notWatched", text: "Hilltop Websites" }]);
  });
});
