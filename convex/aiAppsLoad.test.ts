import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { metered, readBy } from "@/src/test/readMeter";
import { loadSite } from "./websiteSiteRows";
import { workOutAssets } from "./assetSummaries";
import budgets from "../code-ratchets.json";
import schema from "./schema";
import { packColumn } from "./utils/packedColumns";
import { AI_ENGINES } from "./seoAiEngines";

/**
 * Visibility's AI app screens at five times a large client
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, step 3 and rule
 * 6): fifty questions, each with four answers read from the ChatGPT app —
 * twenty businesses, fifty pages read, eight cited and five searches each —
 * five hundred tracked searches each with two Google checks a month apart,
 * and AI demand for six hundred searches.
 *
 * Counted, not timed: what each screen reads, as Convex counts it, against
 * its budget in `code-ratchets.json` (`aiAppsReadKiB`, which may shrink,
 * never grow), and under half of what one read may hold.
 * AI_APPS_READ_REPORT=1 prints what each reads.
 *
 * One website seeded for every screen, and a test a screen: as one test
 * reading all eight, and two of them again for what they say, it took 8.5s
 * on its own, past the five-second line (AGENTS.md, "Test time limits";
 * 2026-10-11). What a screen says is checked from the call that measured it.
 */

const QUESTIONS = 50;
const ANSWERS = 4;
const SEARCHES = 500;
const KEYWORDS = 100;
const HALF_A_READ = 8 * 1024 * 1024;

const dayOf = (offset: number) => new Date(Date.UTC(2026, 9, 9) - offset * 86_400_000).toISOString().slice(0, 10);
const words = (count: number, seed: number) => Array.from({ length: count }, (_, at) => `word${(at + seed) % 97}`).join(" ");

describe("AI app screens at five times a large client", () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  let seeded: { userId: Id<"users">; holdId: Id<"companyWebsites">; firstText: Id<"aiAnswerTexts"> };
  const readBudgets: Record<string, number> = budgets.aiAppsReadKiB;
  const read: Record<string, number> = {};

  beforeAll(async () => {
    seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Co", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Member", email: "big@test.com", role: "ADMIN" as const, companyId, createdAt: Date.now() });
      const websiteId = await ctx.db.insert("websites", { host: "big.co.uk", displayHost: "big.co.uk", firstSeenAt: Date.now() });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
      await ctx.db.insert("fanOutLimits", { companyId, promptsPerSite: QUESTIONS, trackedPerSite: SEARCHES, updatedAt: Date.now() });
      let firstText: Id<"aiAnswerTexts"> | null = null;
      for (let question = 0; question < QUESTIONS; question += 1) {
        const prompt = `Who is the best agency for thing ${question}?`;
        await ctx.db.insert("websiteQuestions", { websiteId, companyWebsiteId: holdId, prompt, engines: [...AI_ENGINES], isActive: true, createdAt: Date.now() });
        for (let answer = 0; answer < ANSWERS; answer += 1) {
          const day = dayOf(answer);
          const pullId = await ctx.db.insert("seoDataPulls", {
            operationId: "ai_app_chatgpt", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY",
            tag: `${question}-${answer}`, attempts: 0, costUsd: 0.004, sandbox: false, submittedAt: Date.now(),
          });
          const sources = Array.from({ length: 8 }, (_, at) => `https://cited${at}.co.uk/page-${question}/`);
          const textId = await ctx.db.insert("aiAnswerTexts", { pullId, prompt, engine: "chatgpt", locationCode: 2826, day, text: words(500, question), sources, createdAt: Date.now() });
          firstText ??= textId;
          await ctx.db.insert("aiAnswerIndex", { textId, pullId, prompt, engine: "chatgpt", locationCode: 2826, day });
          for (const [at, url] of sources.entries()) {
            await ctx.db.insert("aiCitations", { prompt, engine: "chatgpt", locationCode: 2826, day, pullId, kind: "SOURCE", mentionedText: `cited${at}.co.uk`, url, position: at + 1, createdAt: Date.now() });
          }
          await ctx.db.insert("aiAnswerExtras", {
            pullId, prompt, engine: "chatgpt", locationCode: 2826, day,
            businesses: Array.from({ length: 20 }, (_, at) => ({ name: `Business ${(question + at) % 60}`, host: `business${(question + at) % 60}.co.uk`, rating: 4.7, reviews: 100 + at, address: `${at} High Street, Guildford` })),
            read: Array.from({ length: 50 }, (_, at) => (at < 8 ? sources[at] : `https://read${at}.co.uk/a-long-page-address/${question}/`)),
            searches: Array.from({ length: 5 }, (_, at) => `best agency for thing ${question} ${at}`),
          });
        }
      }
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "serp_google_organic", family: "SERP", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: "serp", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      });
      for (let search = 0; search < SEARCHES + KEYWORDS; search += 1) {
        const keyword = `search ${search}`;
        if (search < SEARCHES) await ctx.db.insert("websiteKeywords", { websiteId, companyWebsiteId: holdId, keyword, isActive: true, createdAt: Date.now() });
        await ctx.db.insert("siteKeywordRanks", {
          websiteId, locationCode: 2826, keyword, position: 1 + (search % 30), band: "p04_10", page: "/a-page/", volume: search >= SEARCHES ? 5_000 + search : 1_000 - search, volumeKnown: true,
          intent: "BUYING", status: "SAME", change: 0, day: dayOf(0), firstSeenDay: dayOf(300), trend: Array.from({ length: 12 }, (_, at) => 900 + at),
        } as never);
        await ctx.db.insert("aiSearchVolumes", { keyword, locationCode: 2826, volume: 100 + search, months: packColumn(Array.from({ length: 12 }, (_, at) => 50 + at)), month: "2026-09", updatedAt: Date.now() });
        if (search >= SEARCHES) continue;
        for (const day of [dayOf(0), dayOf(31)]) {
          await ctx.db.insert("siteSerpPages", {
            keyword, locationCode: 2826, day, pullId, resultCount: 1_000_000,
            results: Array.from({ length: 100 }, (_, at) => ({ position: at + 1, domain: `result${at}.co.uk`, url: `https://result${at}.co.uk/a-page-of-results/${at}/` })),
            features: ["ai_overview", "organic", "people_also_ask"], aiOverviewDomains: ["rival.co.uk", "clutch.co"], aiOverviewPages: ["rival.co.uk/pricing/"],
            localPackDomains: [], questions: [], related: [], createdAt: Date.now(),
          });
          await ctx.db.insert("serpOverviews", { keyword, locationCode: 2826, day, pullId, overview: true, domains: ["rival.co.uk", "clutch.co"] });
        }
      }
      return { userId, holdId, firstText: firstText! };
    });
  });

  afterAll(() => {
    if (process.env.AI_APPS_READ_REPORT) process.stdout.write(`${JSON.stringify(read, null, 2)}\n`);
  });

  /** A screen's read against its budget and half of what one read may hold. */
  const withinBudget = (name: string, bytes: number) => {
    read[name] = Math.ceil(bytes / 1024);
    expect(bytes, `${name}: ${read[name]} KiB, past half of what one read may hold`).toBeLessThanOrEqual(HALF_A_READ);
    expect(read[name], `${name}: ${read[name]} KiB read, its budget ${readBudgets[name] ?? "not set"}`).toBeLessThanOrEqual(readBudgets[name] ?? -1);
  };

  const screens: Array<[string, () => [FunctionReference<"query">, Record<string, unknown>], ((answer: unknown) => void)?]> = [
    ["one answer, five ways", () => [api.siteAnswerShown.answerShown, { siteId: seeded.holdId, answerId: seeded.firstText }]],
    // What the screen says at this size: every question's answers counted.
    ["businesses recommended", () => [api.siteAiApps.businessesRecommended, { siteId: seeded.holdId }], (answer) => expect((answer as { answers: number }).answers).toBe(QUESTIONS)],
    ["read but not cited", () => [api.siteAiApps.readNotCited, { siteId: seeded.holdId }]],
    // The page it opens (discovery-detail-and-hakken-sees-plan.md §3): every answer read, and the Brand radar readings.
    ["one page", () => [api.siteAiPageDetail.aiPageDetail, { siteId: seeded.holdId, url: "https://read12.co.uk/a-long-page-address/0/" }]],
    // One business, shown on every answer's cards.
    ["one business", () => [api.siteBusinessDetail.businessDetail, { siteId: seeded.holdId, business: "business1.co.uk" }]],
    // Every tracked search and every searched keyword with AI demand.
    ["ai demand", () => [api.siteAiDemand.aiDemand, { siteId: seeded.holdId }], (answer) => expect((answer as { rows: unknown[] }).rows).toHaveLength(SEARCHES + KEYWORDS)],
    ["ai overview gaps", () => [api.siteAiOverviewGaps.overviewGaps, { siteId: seeded.holdId }]],
  ];
  const modules = import.meta.glob("./*.ts");

  test.each(screens)("%s reads within its budget and half of Convex's limit", async (name, ask, says) => {
    const [query, args] = ask();
    const [file, exported] = getFunctionName(query).split(":");
    const loaded = (await modules[`./${file}.ts`]()) as Record<string, { _handler?: unknown }>;
    const { bytes, answer } = await readBy(t, seeded.userId, loaded[exported], args);
    withinBudget(name, bytes);
    says?.(answer);
  });

  // And Your assets, worked out after each collection from what these screens read (`assetSummaries.ts`).
  test("your assets reads within its budget and half of Convex's limit", async () => {
    const assetBytes = await t.run(async (ctx) => {
      const meter = metered(ctx.db);
      const site = await loadSite({ db: meter.db } as never, seeded.holdId);
      if (site) await workOutAssets({ db: meter.db } as never, site);
      return meter.bytes();
    });
    withinBudget("your assets", assetBytes);
  });
});
