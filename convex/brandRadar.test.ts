import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { chatGptRadarSteps, parseRadar } from "./brandRadar";
import { CHATGPT_RADAR_OPERATION, chatGptCovers, radarHostAskedFor, radarParams } from "./dataForSeoRadarOperations";
import { discoveryPartOf } from "./discoveryParts";
import { siteKindOf } from "./utils/siteKinds";
import { unpackColumn } from "./utils/packedColumns";

/**
 * Brand radar (discovery-local-reputation-ai-plan.md, step 4): a website's
 * monthly reading of Google's AI answers, each question once with where the
 * website is first named, its pages kept once a record, and the month's
 * figures in a series — nothing rewritten when nothing moved (rule 11). The
 * answers are the shapes bought on 2026-10-09, written by hand.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useFixedDay("2026-10-09"));
afterEach(() => vi.useRealTimers());

const answer = [{ total_count: 222, items: [
  { question: "web app", ai_search_volume: 90_500, answer: "A web app runs in a browser. Lightflows and Ronins build them.", sources: [{ url: "https://www.lightflows.co.uk/blog/web-apps/" }, { url: "https://ronins.co.uk/hub/web-apps/" }] },
  { question: "Web App", ai_search_volume: 90_500, answer: "Again.", sources: [] },
  { question: "ronins", ai_search_volume: 9_900, answer: "A rōnin is a masterless samurai.", sources: [{ url: "https://ronins.co.uk/" }, { url: "https://www.lightflows.co.uk/blog/web-apps/" }] },
] }];

describe("reading", () => {
  test("each question once, where the website is first named, and the pages quoted", () => {
    const parsed = parseRadar(answer, [{ name: "Ronins", isPrimary: true }]);
    expect(parsed.total).toBe(222);
    expect(parsed.items.map((item) => item.question)).toEqual(["web app", "ronins"]);
    expect(parsed.items[0].firstAt).toBe("A web app runs in a browser. Lightflows and ".length);
    expect(parsed.items[1].sources).toEqual(["https://ronins.co.uk/", "https://www.lightflows.co.uk/blog/web-apps/"]);
  });

  test("a website is sent as text, read back from what was sent", () => {
    const params = radarParams("ronins.co.uk", undefined, 200);
    expect(params).toEqual({ target: [{ domain: "ronins.co.uk" }], platform: "google", location_code: 2826, language_code: "en", limit: 200 });
    expect(radarHostAskedFor(params)).toBe("ronins.co.uk");
  });

  test("a cited website's kind from its address", () => {
    expect(siteKindOf("www.clutch.co")).toBe("DIRECTORY");
    expect(siteKindOf("uk.trustpilot.com")).toBe("REVIEWS");
    expect(siteKindOf("old.reddit.com")).toBe("FORUM");
    expect(siteKindOf("surreybusinessnews.co.uk")).toBe("NEWS");
    expect(siteKindOf("brightsidedigital.co.uk")).toBe("WEBSITE");
  });
});

describe("keeping", () => {
  test("the questions once a record, pages once, the month in the series, and nothing rewritten when nothing moved", async () => {
    const t = harness();
    const { websiteId, pullId } = await t.run(async (ctx) => ({
      websiteId: await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() }),
      pullId: await ctx.db.insert("seoDataPulls", { operationId: "radar_mentions", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: "r", attempts: 0, costUsd: 0.3, sandbox: false, submittedAt: Date.now() }),
    }));
    const { total, items } = parseRadar(answer, [{ name: "Ronins", isPrimary: true }]);
    const args = { websiteId, locationCode: 2826, month: "2026-10", total, items, pullId };
    await t.mutation(internal.brandRadar.writeRadar, args);
    const [part] = await t.run(async (ctx) => await ctx.db.query("brandRadarQuestionParts").collect());
    expect(part.pages).toEqual(["https://www.lightflows.co.uk/blog/web-apps/", "https://ronins.co.uk/hub/web-apps/", "https://ronins.co.uk/"]);
    expect(unpackColumn(part.sourceOf)).toEqual([0, 1, 2, 0]);
    const [series] = await t.run(async (ctx) => await ctx.db.query("brandRadarMonths").collect());
    expect(series.months).toEqual(["2026-10"]);
    expect(unpackColumn(series.mentions)).toEqual([222]);
    expect(unpackColumn(series.pages)).toEqual([2]);

    vi.advanceTimersByTime(60_000);
    await t.mutation(internal.brandRadar.writeRadar, args);
    const [again] = await t.run(async (ctx) => await ctx.db.query("brandRadarQuestionParts").collect());
    const [seriesAgain] = await t.run(async (ctx) => await ctx.db.query("brandRadarMonths").collect());
    expect(again.updatedAt).toBe(part.updatedAt);
    expect(seriesAgain.updatedAt).toBe(series.updatedAt);
  });
});

describe("ChatGPT mentions (insights-intelligence-plan.md phase 5)", () => {
  test("asked of ChatGPT's answers in the United States only, the home country it must match", () => {
    expect(radarParams("ronins.co.uk", 2826, 200, "chat_gpt")).toMatchObject({ platform: "chat_gpt", location_code: 2840, language_code: "en" });
    expect(radarParams("ronins.co.uk", 2826, 200)).toMatchObject({ platform: "google", location_code: 2826 });
    expect(chatGptCovers(2826)).toBe(false);
    expect(chatGptCovers(2840)).toBe(true);
    expect(discoveryPartOf(CHATGPT_RADAR_OPERATION)).toBe("chatGptMentions");
    expect(discoveryPartOf("radar_mentions")).toBe("brandRadar");
  });

  test("planned only with its switch on, and never for a website outside the United States", async () => {
    const t = harness();
    // Planning only counts the steps: no purchase is made here.
    const plan = async () => ({ reused: false, pullId: "pull_1" as Id<"seoDataPulls">, pull: null });
    const steps = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const ukSite = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
      const usSite = await ctx.db.insert("websites", { host: "acme-shop-us.test", displayHost: "acme-shop-us.test", firstSeenAt: 1 });
      const uk = (await ctx.db.get(await ctx.db.insert("companyWebsites", { companyId, websiteId: ukSite, relationship: "OWNED", locationCode: 2826, createdAt: 1 })))!;
      const us = (await ctx.db.get(await ctx.db.insert("companyWebsites", { companyId, websiteId: usSite, relationship: "OWNED", locationCode: 2840, createdAt: 1 })))!;
      const cycle = { companyId, startedAt: Date.now() };
      const off = await chatGptRadarSteps(ctx, cycle, us, plan);
      await ctx.db.insert("collectionParts", { companyId, chatGptMentions: true, updatedAt: 1 });
      return { off: off.length, uk: (await chatGptRadarSteps(ctx, cycle, uk, plan)).length, us: (await chatGptRadarSteps(ctx, cycle, us, plan)).length };
    });
    expect(steps).toEqual({ off: 0, uk: 0, us: 1 });
  });

  test("a month of ChatGPT's answers kept in its own series, Google's apart", async () => {
    const t = harness();
    const websiteId = await t.run(async (ctx) => await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() }));
    await t.mutation(internal.brandRadar.writeChatGptRadar, { websiteId, month: "2026-10", mentions: 40, asks: 9_000 });
    await t.mutation(internal.brandRadar.writeChatGptRadar, { websiteId, month: "2026-09", mentions: 31, asks: 8_000 });
    const [series] = await t.run(async (ctx) => await ctx.db.query("chatGptRadarMonths").take(5));
    expect(series.months).toEqual(["2026-09", "2026-10"]);
    expect(unpackColumn(series.mentions)).toEqual([31, 40]);
    expect(await t.run(async (ctx) => await ctx.db.query("brandRadarMonths").take(5))).toEqual([]);
  });
});
