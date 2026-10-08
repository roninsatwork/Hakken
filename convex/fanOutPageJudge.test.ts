import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { offeredPages, verdictOf, PAGES_OFFERED } from "./fanOutPageJudge";
import { wordsThatMatter } from "./utils/fanOutAngle";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Which of a site's own pages answers each angle, judged by the
 * `seo.angle-page` Decision (docs/plans/active/fan-out-angles-plan.md, FA4):
 * from the pages' addresses and the searches they rank for, never their
 * words, and only when the Decision is switched on.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-09-27";
const QUESTION = "Which lead system should I use for carp fishing?";
const OPTIONS = [
  "page-a", "page-b", "page-c", "page-d", "page-e", "page-f", "page-g", "page-h", "page-i", "page-j", "page-k", "page-l",
  "none", "off-topic", "other",
];

beforeEach(() => useFixedDay());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const page = (path: string, ranked = false, keywords = 0) => ({
  page: path,
  url: `https://korda.example${path}`,
  ranked,
  keywords,
  words: wordsThatMatter(path),
  topKeyword: null,
});

describe("the pages offered for an angle", () => {
  test("those sharing the most of its words, ranked pages first among equals, none that share nothing", () => {
    const pages = [
      page("/knowledge/heli-safe-lead-systems"),
      page("/knowledge/which-carp-fishing-lead-system-should-i-use", true, 12),
      page("/products/lead-clip"),
      page("/knowledge/polarised-sunglasses"),
      page("/knowledge/carp-lead-system-guide"),
    ];
    const offered = offeredPages(wordsThatMatter("carp fishing lead systems"), pages).map((entry) => entry.page);
    expect(offered).toEqual([
      "/knowledge/which-carp-fishing-lead-system-should-i-use",
      "/knowledge/carp-lead-system-guide",
      "/knowledge/heli-safe-lead-systems",
      "/products/lead-clip",
    ]);
  });

  test("never more than the labels there are", () => {
    const pages = Array.from({ length: 30 }, (_, index) => page(`/carp/rig-${index}`));
    expect(offeredPages(["carp"], pages)).toHaveLength(PAGES_OFFERED);
  });
});

describe("what the judge's answer means", () => {
  const offered = [{ page: "/a", url: "https://x/a" }, { page: "/b", url: "https://x/b" }];
  test("a label names the page offered under it", () => {
    expect(verdictOf("x", "page-b", offered, "SURE")).toEqual({ angle: "x", verdict: "ANSWERED", page: "/b", url: "https://x/b", certainty: "SURE" });
  });
  test("none, off topic, cannot tell — and a label past the pages offered is cannot tell", () => {
    expect(verdictOf("x", "none", offered).verdict).toBe("NONE");
    expect(verdictOf("x", "off-topic", offered).verdict).toBe("OFF_TOPIC");
    expect(verdictOf("x", "other", offered).verdict).toBe("UNSURE");
    expect(verdictOf("x", "page-k", offered).verdict).toBe("UNSURE");
  });
});

async function kordaSite(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "korda.example", displayHost: "korda.example", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    await ctx.db.insert("websiteQuestions", {
      websiteId, companyWebsiteId: holdId, prompt: QUESTION, engines: ["claude"], isActive: true, createdAt: Date.now(),
    });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", websiteId, taskArgsJson: "{}",
      status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    for (const [query, timesSeen] of [["carp fishing lead systems", 3], ["helicopter rig lead system carp fishing", 2], ["best dslr rod support system", 1]] as const) {
      await ctx.db.insert("promptFanOutQueries", {
        prompt: QUESTION, engine: "claude", query, queryText: query, timesSeen,
        firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
      });
    }
    await ctx.db.insert("sitePageRanks", {
      websiteId, locationCode: DEFAULT_LOCATION_CODE, page: "/knowledge/which-carp-fishing-lead-system-should-i-use",
      url: "https://korda.example/knowledge/which-carp-fishing-lead-system-should-i-use", section: "/knowledge", keywords: 12,
      bestPosition: 3, top3: 1, topKeyword: "carp lead systems", topKeywordVolume: 200, firstSeenDay: DAY, day: DAY,
      rebuildId: "r1",
    });
    return { companyId, websiteId, holdId, pullId };
  });
}

async function crawled(t: Harness, websiteId: Id<"websites">, paths: string[]) {
  return await t.run(async (ctx) => {
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "site_crawl", family: "On-Page", mode: "QUEUED", websiteId, taskArgsJson: "{}",
      status: "READY", tag: `c-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    await ctx.db.insert("siteCrawls", { websiteId, pullId, day: DAY, pagesCrawled: paths.length, issues: [], createdAt: Date.now() });
    for (const path of paths) {
      await ctx.db.insert("siteCrawlPages", {
        websiteId, pullId, day: DAY, url: `https://korda.example${path}`, page: path, statusCode: 200, resourceType: "html", problems: [],
      });
    }
    return pullId;
  });
}

async function switchOn(t: Harness) {
  vi.stubEnv("TYPESAFE_API_KEY", "typesafe-test-key");
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("aiProviders", {
      providerKey: "typesafe", displayName: "TypeSafe", isEnabled: true, authMode: "environment", status: "healthy", createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("aiModels", {
      modelId: "typesafe:jev-latest", providerKey: "typesafe", providerModelId: "jev-latest", displayName: "Jev Latest",
      isEnabled: true, isDefault: false, capabilities: ["decision"], supportedUseCases: ["decision"],
      standardInputCostBelow200k: 1, standardInputCostAbove200k: 1, outputResponseCost: 2, lastSyncedAt: now,
    });
    await ctx.db.insert("aiModelDefaults", { scope: "global", useCase: "decision", providerKey: "typesafe", modelId: "typesafe:jev-latest", updatedAt: now });
    await ctx.db.insert("decisionSettings", { scope: "global", decisionKey: "seo.angle-page", mode: "ACT", updatedAt: now });
  });
}

/** TypeSafe answering from what each search is: the lead system searches have a page, the camera one is off topic. */
function stubJudge() {
  const states: Array<{ search: { text: string }; pages: Record<string, { address: string; ranksFor?: string[] }> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("api.typesafe.ai")) throw new Error(`Unexpected request to ${String(input)}`);
    const body = JSON.parse(String(init?.body ?? "{}")) as { state: (typeof states)[number] };
    states.push(body.state);
    const text = body.state.search.text;
    const chosen = text.includes("dslr") ? "off-topic" : text.includes("helicopter") ? "none" : "page-a";
    const probabilities = Object.fromEntries(OPTIONS.map((option) => [option, option === chosen ? 0.86 : 0.01]));
    return Response.json({
      model: "jev-latest",
      answers: { "seo.angle-page": { type: "choice", choice: chosen, probabilities, confidence: 0.9 } },
      usage: { input_tokens: 300, output_tokens: 20 },
    });
  }));
  return states;
}

async function judgments(t: Harness, holdId: Id<"companyWebsites">) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("fanOutPageJudgments").withIndex("by_hold_angle", (q) => q.eq("holdId", holdId)).collect())
      .map((row) => ({ angle: row.angle, verdict: row.verdict, page: row.page ?? null, pagesStamp: row.pagesStamp })));
}

describe("judging which page answers each angle", () => {
  test("switched off, nothing is asked and nothing is judged", async () => {
    const t = harness();
    const site = await kordaSite(t);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: site.holdId });
    await finishScheduled(t);
    expect(fetch).not.toHaveBeenCalled();
    expect(await judgments(t, site.holdId)).toEqual([]);
  });

  test("switched on, each angle is judged once from addresses and searches, and again after a new site audit", async () => {
    const t = harness();
    const site = await kordaSite(t);
    const firstCrawl = await crawled(t, site.websiteId, ["/knowledge/heli-safe-lead-systems", "/knowledge/polarised-sunglasses"]);
    await switchOn(t);
    const states = stubJudge();

    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: site.holdId });
    await finishScheduled(t);

    expect((await judgments(t, site.holdId)).sort((left, right) => left.angle.localeCompare(right.angle))).toEqual([
      { angle: "best dslr rod support system", verdict: "OFF_TOPIC", page: null, pagesStamp: `crawl:${firstCrawl}` },
      { angle: "carp fishing helicopter lead rig system", verdict: "NONE", page: null, pagesStamp: `crawl:${firstCrawl}` },
      { angle: "carp fishing lead system", verdict: "ANSWERED", page: "/knowledge/which-carp-fishing-lead-system-should-i-use", pagesStamp: `crawl:${firstCrawl}` },
    ]);
    // Addresses and the searches pages rank for — never a page's words.
    const leadSystems = states.find((state) => state.search.text === "carp fishing lead systems");
    expect(leadSystems?.pages["page-a"]).toEqual({ address: "/knowledge/which-carp-fishing-lead-system-should-i-use" });
    expect(Object.values(leadSystems?.pages ?? {}).map((entry) => entry.address)).toContain("/knowledge/heli-safe-lead-systems");
    expect(JSON.stringify(states)).not.toContain("title");

    // Judged against the same pages: not asked again.
    const asked = states.length;
    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: site.holdId });
    await finishScheduled(t);
    expect(states).toHaveLength(asked);

    // A new site audit: every angle is judged again, against the pages it read.
    vi.advanceTimersByTime(60 * 60 * 1000);
    const secondCrawl = await crawled(t, site.websiteId, ["/knowledge/heli-safe-lead-systems"]);
    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: site.holdId });
    await finishScheduled(t);
    expect(states).toHaveLength(asked * 2);
    expect(new Set((await judgments(t, site.holdId)).map((row) => row.pagesStamp))).toEqual(new Set([`crawl:${secondCrawl}`]));
  });
});
