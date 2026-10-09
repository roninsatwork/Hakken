import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { parseRadar } from "./brandRadar";
import { radarHostAskedFor, radarParams } from "./dataForSeoRadarOperations";
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
