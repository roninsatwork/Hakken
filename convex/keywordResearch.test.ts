import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { removeSampleResearch } from "./keywordResearchSampleMigration";
import { AI_ENGINES, AI_ENGINE_CALLS } from "./seoAiEngines";

/**
 * Keyword research (docs/plans/active/keyword-research-plan.md): Look up
 * writes the company's lookups and starts the Keyword research agent; the
 * agent buys each keyword's overview, its 24 months and Google's top 100 —
 * live, always real figures (it has no Test mode) — files them and
 * writes each call's cost; what is held and fresh is opened, not bought
 * again. Lists, Track, and every read and write the company's own.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => {
  // Scheduled runs wait until a test runs them itself.
  vi.useFakeTimers();
  vi.stubEnv("DATAFORSEO_LOGIN", "login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "password");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const UK = 2826;
const US = 2840;

/** A company with its own website, ronins.co.uk, watching one competitor, and a member signed in to it. */
async function company(t: Harness, role: "USER" | "READ_ONLY" = "USER") {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    const rivalWebsiteId = await ctx.db.insert("websites", { host: "lightflows.co.uk", displayHost: "lightflows.co.uk", firstSeenAt: Date.now() });
    await ctx.db.insert("companyWebsites", { companyId, websiteId: rivalWebsiteId, relationship: "TRACKED", againstWebsiteId: websiteId, createdAt: Date.now() } as never);
    const userId = await ctx.db.insert("users", { name: "Anthony", email: `a-${Math.random()}@test.com`, role, companyId, createdAt: Date.now() });
    return { companyId, websiteId, siteId, userId };
  });
  return { ...ids, as: t.withIdentity({ subject: ids.userId }) };
}

async function researchAgent(t: Harness, maxCostUsd?: number) {
  return await t.run(async (ctx) => await ctx.db.insert("agents", {
    name: "Keyword research", modelId: "model-test", thinkingMode: false, isActive: true,
    systemKey: "KEYWORD_RESEARCH", ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
    createdAt: Date.now(), updatedAt: Date.now(),
  }));
}

const hostOfUrl = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0];

/** DataForSEO, answering each call as its docs show, at a cent a call. */
function dataForSeo(serpFor: (keyword: string) => Array<{ domain: string; position: number }> = () => []) {
  const months = (volume: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({ year: 2024 + Math.floor((index + 9) / 12), month: ((index + 9) % 12) + 1, search_volume: volume + index }));
  return vi.fn(async (url: string, init: { body: string }) => {
    const [task] = JSON.parse(init.body) as Array<{ tag: string; keywords?: string[]; keyword?: string }>;
    let result: unknown;
    if (url.includes("keyword_overview")) {
      result = [{ items: (task.keywords ?? []).map((keyword) => ({
        keyword,
        keyword_info: { search_volume: 3600, cpc: 6.2, competition_level: "HIGH", monthly_searches: months(3000, 12) },
        keyword_properties: { keyword_difficulty: 64 },
        serp_info: { serp_item_types: ["organic", "local_pack"], se_results_count: 1_000_000 },
        avg_backlinks_info: { referring_domains: 180 },
        search_intent_info: { main_intent: "commercial" },
      })) }];
    } else if (url.includes("bulk_traffic_estimation")) {
      result = [{ items: ((task as { targets?: string[] }).targets ?? []).map((target, index) => ({ target: target.replace(/^https:\/\//, ""), metrics: { organic: { etv: 9400 - index * 1000, count: 122 + index } } })) }];
    } else if (url.includes("bulk_ranks")) {
      result = [{ items: ((task as { targets?: string[] }).targets ?? []).map((target) => ({ target, rank: 720 })) }];
    } else if (url.includes("bulk_referring_domains")) {
      result = [{ items: ((task as { targets?: string[] }).targets ?? []).map((target) => ({ target, referring_domains: 2100 })) }];
    } else if (url.includes("ranked_keywords")) {
      const target = (task as { target?: string }).target ?? "";
      result = [{ items: [
        { keyword_data: { keyword: `${hostOfUrl(target)} top`, keyword_info: { search_volume: 900, cpc: 3 }, keyword_properties: { keyword_difficulty: 40 }, search_intent_info: { main_intent: "commercial" } } },
        { keyword_data: { keyword: "web design agency", keyword_info: { search_volume: 3600 } } },
      ] }];
    } else if (url.includes("llm_responses")) {
      const engine = url.split("/ai_optimization/")[1].split("/")[0];
      result = [{ items: [{ type: "message", sections: [{
        text: engine === "perplexity" ? "Try Lightflows or Ronins for this." : "Lightflows is a good choice.",
        annotations: [{ url: "https://lightflows.co.uk/web/", title: "Lightflows" }, { url: "https://www.ronins.co.uk/web-design/", title: "Ronins" }],
      }] }] }];
    } else if (url.includes("llm_mentions")) {
      result = [{ items: [{ fan_out_queries: ["web design agency uk", "best web designers"] }, { fan_out_queries: ["web design agency uk"] }] }];
    } else if (url.includes("keyword_suggestions")) {
      const asked = task as { keyword?: string; filters?: unknown[]; limit?: number };
      const words = asked.filters ? ["how much does a", "who is the best"] : ["cheap", "best"];
      result = [{ total_count: asked.filters ? 86 : 1000, items: words.map((word, index) => ({
        keyword: `${word} ${asked.keyword}`, keyword_info: { search_volume: 500 - index * 100, cpc: 2 }, keyword_properties: { keyword_difficulty: 30 }, search_intent_info: { main_intent: "informational" },
      })) }];
    } else if (url.includes("historical_search_volume")) {
      result = [{ items: (task.keywords ?? []).map((keyword) => ({ keyword, keyword_info: { monthly_searches: months(2000, 30) } })) }];
    } else {
      result = [{ items: serpFor(task.keyword ?? "").map(({ domain, position }) => ({ type: "organic", rank_group: position, domain, url: `https://${domain}/page/`, title: domain })) }];
    }
    return Response.json({ status_code: 20000, tasks: [{ id: "task", status_code: 20000, cost: 0.01, data: { tag: task.tag }, result }] });
  });
}

describe("Look up", () => {
  test("writes the company's lookups and starts the Keyword research agent for what is not held", async () => {
    const t = harness();
    const { as, siteId, companyId } = await company(t);
    const agentId = await researchAgent(t);

    const looked = await as.mutation(api.keywordResearch.lookUp, { keywords: ["Web design agency", "  seo   london ", "web design agency"], locationCode: UK, siteId });

    expect(looked.waiting).toBe(2);
    const { lookups, runs } = await t.run(async (ctx) => ({
      lookups: await ctx.db.query("keywordLookups").collect(),
      runs: await ctx.db.query("agentRuns").collect(),
    }));
    expect(lookups.map((lookup) => [lookup.keyword, lookup.text, lookup.overview])).toEqual([
      ["web design agency", "Web design agency", "WAITING"],
      ["seo london", "seo london", "WAITING"],
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ agentId, companyId, triggerType: "MANUAL", title: "Look up — 2 keywords" });
    // Each keyword is a job of the one run: what it buys for, and settles.
    const jobs = await t.run(async (ctx) => await ctx.db.query("researchJobs").collect());
    expect(jobs.map((job) => [job.lookupId, job.part, job.runId, job.again])).toEqual(lookups.map((lookup) => [lookup._id, "OVERVIEW", runs[0]._id, false]));
  });

  test("the agent buys each keyword's overview, 24 months and Google's top 100, files them, and writes each call's cost", async () => {
    const t = harness();
    const { as, siteId, companyId } = await company(t);
    await researchAgent(t);
    await as.mutation(api.keywordResearch.lookUp, { keywords: ["web design agency"], locationCode: UK, siteId });
    const runId = (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id;
    const fetch = dataForSeo(() => [{ domain: "madebyshape.co.uk", position: 1 }, { domain: "ronins.co.uk", position: 18 }]);
    vi.stubGlobal("fetch", fetch);

    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId });

    expect(fetch.mock.calls.map(([url]) => String(url).replace("https://api.dataforseo.com", ""))).toEqual([
      "/v3/dataforseo_labs/google/keyword_overview/live",
      "/v3/dataforseo_labs/google/historical_search_volume/live",
      "/v3/serp/google/organic/live/advanced",
      "/v3/dataforseo_labs/google/bulk_traffic_estimation/live",
    ]);
    const held = await t.run(async (ctx) => ({
      keyword: await ctx.db.query("researchKeywords").first(),
      serp: await ctx.db.query("researchSerps").first(),
      pulls: await ctx.db.query("seoDataPulls").collect(),
      lookup: await ctx.db.query("keywordLookups").first(),
      run: await ctx.db.get(runId),
    }));
    expect(held.keyword).toMatchObject({ keyword: "web design agency", locationCode: UK, sandbox: false, searchVolume: 3600, difficulty: 64, intent: "commercial", topTenLinkingSites: 180 });
    expect(held.keyword?.monthly).toHaveLength(24);
    expect(held.serp?.results.map((result) => [result.position, result.domain])).toEqual([[1, "madebyshape.co.uk"], [18, "ronins.co.uk"]]);
    // The top ten's visits come with the lookup: the overview's top five show them.
    expect(held.serp?.pages?.map((page) => [page.visits, page.keywords, page.strength])).toEqual([[9400, 122, null], [8400, 123, null]]);
    expect(held.pulls.map((pull) => [pull.operationId, pull.status, pull.costUsd, pull.companyId])).toEqual([
      ["research_keyword_overview", "READY", 0.01, companyId],
      ["research_search_history", "READY", 0.01, companyId],
      ["research_google_results", "READY", 0.01, companyId],
      ["research_page_traffic", "READY", 0.01, companyId],
    ]);
    expect(held.lookup?.overview).toBe("READY");
    expect(held.run?.status).toBe("SUCCESS");
    expect(held.run?.costUsd).toBeCloseTo(0.04);
    // What the lookup's header says it cost: its share of each call bought for it.
    expect(held.lookup?.spentUsd).toBeCloseTo(0.04);
  });

  test("always buys real figures: an agent saved with the old Test mode still asks DataForSEO itself, never its sandbox", async () => {
    const t = harness();
    const { as } = await company(t);
    await t.run(async (ctx) => await ctx.db.insert("agents", {
      name: "Keyword research", modelId: "model-test", thinkingMode: false, isActive: true,
      systemKey: "KEYWORD_RESEARCH", plannerMode: "TEST", createdAt: Date.now(), updatedAt: Date.now(),
    }));
    await as.mutation(api.keywordResearch.lookUp, { keywords: ["web designers surrey"], locationCode: UK });
    const runId = (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id;
    const fetch = dataForSeo(() => [{ domain: "acme-agency.test", position: 3 }]);
    vi.stubGlobal("fetch", fetch);

    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId });

    expect(fetch.mock.calls.every(([url]) => String(url).startsWith("https://api.dataforseo.com"))).toBe(true);
    const held = await t.run(async (ctx) => ({ keyword: await ctx.db.query("researchKeywords").first(), pulls: await ctx.db.query("seoDataPulls").collect() }));
    expect(held.keyword).toMatchObject({ keyword: "web designers surrey", sandbox: false });
    expect(held.pulls.every((pull) => pull.costUsd === 0.01 && !pull.sandbox)).toBe(true);
  });

  test("on the platform's own sandbox switch, calls cost $0 and a keyword the sandbox doesn't answer gets no stand-in", async () => {
    const t = harness();
    const { as } = await company(t);
    await researchAgent(t);
    vi.stubEnv("DATAFORSEO_SANDBOX", "1");
    await as.mutation(api.keywordResearch.lookUp, { keywords: ["anything at all"], locationCode: US });
    const runId = (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id;
    const sample = dataForSeo();
    // The sandbox answers about a keyword of its own, whatever is asked.
    const fetch = vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Array<{ keywords?: string[] }>;
      if (body[0].keywords) body[0].keywords = ["iphone"];
      return await sample(url, { body: JSON.stringify(body) });
    });
    vi.stubGlobal("fetch", fetch);

    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId });

    expect(fetch.mock.calls.every(([url]) => String(url).startsWith("https://sandbox.dataforseo.com"))).toBe(true);
    const held = await t.run(async (ctx) => ({
      keyword: await ctx.db.query("researchKeywords").first(),
      pulls: await ctx.db.query("seoDataPulls").collect(),
      lookup: await ctx.db.query("keywordLookups").first(),
    }));
    expect(held.keyword).toBeNull();
    expect(held.pulls.every((pull) => pull.costUsd === 0)).toBe(true);
    expect(held.lookup?.overview).toBe("FAILED");
  });

  test("a long Look up carries on in a fresh part of the run, buying only what is still missing", async () => {
    const t = harness();
    const { as } = await company(t);
    await researchAgent(t);
    const keywords = Array.from({ length: 6 }, (_, index) => `keyword ${index}`);
    await as.mutation(api.keywordResearch.lookUp, { keywords, locationCode: UK });
    const runId = (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id;
    const answer = dataForSeo(() => [{ domain: "madebyshape.co.uk", position: 1 }]);
    let slowed = false;
    const fetch = vi.fn(async (url: string, init: { body: string }) => {
      // The first of Google's results takes the part's time.
      if (url.includes("/serp/") && !slowed) {
        slowed = true;
        vi.setSystemTime(Date.now() + 7 * 60 * 1000);
      }
      return await answer(url, init);
    });
    vi.stubGlobal("fetch", fetch);
    // The run Look up scheduled is run here, by hand: only the part it schedules is left to run by itself.
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system.query("_scheduled_functions").collect()) await ctx.scheduler.cancel(job._id);
    });

    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId });
    const serps = () => fetch.mock.calls.filter(([url]) => String(url).includes("/serp/")).length;
    // Five at once, then the part's time was up: the run carries on rather than finishing.
    expect(serps()).toBe(5);
    expect((await t.run(async (ctx) => await ctx.db.get(runId)))?.status).toBe("RUNNING");

    await finishScheduled(t);
    expect(serps()).toBe(6);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("keyword_overview"))).toHaveLength(1);
    const after = await t.run(async (ctx) => ({ run: await ctx.db.get(runId), lookups: await ctx.db.query("keywordLookups").collect() }));
    expect(after.run?.status).toBe("SUCCESS");
    expect(after.lookups.map((lookup) => lookup.overview)).toEqual(Array(6).fill("READY"));
  });

  test("a lookup is ready only on what was bought for it: an old overview never stands in for a purchase that failed", async () => {
    const t = harness();
    const { as } = await company(t);
    await researchAgent(t);
    await t.run(async (ctx) => {
      const boughtAt = Date.now() - 40 * 24 * 60 * 60 * 1000;
      await ctx.db.insert("researchKeywords", {
        keyword: "seo", locationCode: UK, boughtAt, sandbox: false, searchVolume: 10, cpc: null, competitionLevel: null, difficulty: 5,
        intent: null, monthly: [], serpKinds: [], resultsCount: null, topTenLinkingSites: null,
      });
      await ctx.db.insert("researchSerps", { keyword: "seo", locationCode: UK, boughtAt, sandbox: false, results: [] });
    });
    await as.mutation(api.keywordResearch.lookUp, { keywords: ["seo"], locationCode: UK });
    const runId = (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status_code: 50000, status_message: "Internal error." })));

    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId });

    const lookup = await t.run(async (ctx) => await ctx.db.query("keywordLookups").first());
    expect(lookup?.overview).toBe("FAILED");
  });

  test("a keyword held and fresh is opened again, not bought; sample figures never count", async () => {
    const t = harness();
    const { as } = await company(t);
    await researchAgent(t);
    const hold = async (sandbox: boolean, boughtAt: number) => await t.run(async (ctx) => {
      await ctx.db.insert("researchKeywords", {
        keyword: "seo", locationCode: UK, boughtAt, sandbox, searchVolume: 10, cpc: null, competitionLevel: null, difficulty: 5,
        intent: null, monthly: [], serpKinds: [], resultsCount: null, topTenLinkingSites: null,
      });
      await ctx.db.insert("researchSerps", { keyword: "seo", locationCode: UK, boughtAt, sandbox, results: [] });
    });

    await hold(true, Date.now());
    expect((await as.mutation(api.keywordResearch.lookUp, { keywords: ["seo"], locationCode: UK })).waiting).toBe(1);
    // That run has finished, so the lookup is no longer waiting on one still buying.
    await t.run(async (ctx) => {
      for (const run of await ctx.db.query("agentRuns").collect()) await ctx.db.patch(run._id, { status: "SUCCESS" });
    });

    await hold(false, Date.now() - 1_000);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("researchKeywords").collect()) if (row.sandbox) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("researchSerps").collect()) if (row.sandbox) await ctx.db.delete(row._id);
    });
    expect((await as.mutation(api.keywordResearch.lookUp, { keywords: ["seo"], locationCode: UK })).waiting).toBe(0);
    const lookups = await t.run(async (ctx) => await ctx.db.query("keywordLookups").collect());
    expect(lookups).toHaveLength(1);
    expect(lookups[0].overview).toBe("READY");
  });

  test("refuses an oversight account, a country off the list, more keywords than the limit, and says when there is no agent", async () => {
    const t = harness();
    const { as } = await company(t);
    const reader = await company(t, "READ_ONLY");

    await expect(as.mutation(api.keywordResearch.lookUp, { keywords: ["seo"], locationCode: UK })).rejects.toThrow(/no Keyword research agent/);
    await researchAgent(t);
    await expect(reader.as.mutation(api.keywordResearch.lookUp, { keywords: ["seo"], locationCode: UK })).rejects.toThrow(/can read Keyword research/);
    await expect(as.mutation(api.keywordResearch.lookUp, { keywords: ["seo"], locationCode: 2250 })).rejects.toThrow(/can't look up that country/);
    const eleven = Array.from({ length: 11 }, (_, index) => `keyword ${index}`);
    await expect(as.mutation(api.keywordResearch.lookUp, { keywords: eleven, locationCode: UK })).rejects.toThrow(/at most 10 keywords/);
  });
});

describe("the sample figures of the Test mode he never asked for", () => {
  test("are removed, with a lookup left with no real figures and its jobs; real figures and lookups stay", async () => {
    const t = harness();
    const { as } = await company(t);
    await researchAgent(t);
    const overview = (keyword: string, sandbox: boolean) => ({
      keyword, locationCode: UK, boughtAt: Date.now(), sandbox, searchVolume: 10, cpc: null, competitionLevel: null, difficulty: 5,
      intent: null, monthly: [], serpKinds: [], resultsCount: null, topTenLinkingSites: null,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("researchKeywords", overview("web designers surrey", true));
      await ctx.db.insert("researchSerps", { keyword: "web designers surrey", locationCode: UK, boughtAt: Date.now(), sandbox: true, results: [{ position: 1, domain: "dominos.co.uk", url: "https://dominos.co.uk/", title: "Pizza" }] });
      await ctx.db.insert("researchKeywords", overview("seo", false));
      await ctx.db.insert("researchSerps", { keyword: "seo", locationCode: UK, boughtAt: Date.now(), sandbox: false, results: [] });
    });
    await as.mutation(api.keywordResearch.lookUp, { keywords: ["seo"], locationCode: UK });
    await t.run(async (ctx) => {
      const companyId = (await ctx.db.query("companies").first())!._id;
      const lookupId = await ctx.db.insert("keywordLookups", { companyId, keyword: "web designers surrey", text: "web designers surrey", locationCode: UK, createdAt: Date.now(), openedAt: Date.now(), overview: "READY" });
      const runId = (await ctx.db.query("agentRuns").first())?._id;
      if (runId) await ctx.db.insert("researchJobs", { runId, lookupId, companyId, part: "OVERVIEW", keyword: "web designers surrey", locationCode: UK, again: false, createdAt: Date.now() });
    });

    await t.run(async (ctx) => {
      let cursor: string | null = null;
      for (;;) {
        const step = await removeSampleResearch(ctx, cursor, 1);
        if (step.isDone) break;
        cursor = step.cursor;
      }
    });

    const left = await t.run(async (ctx) => ({
      keywords: (await ctx.db.query("researchKeywords").collect()).map((row) => row.keyword),
      serps: (await ctx.db.query("researchSerps").collect()).map((row) => row.keyword),
      lookups: (await ctx.db.query("keywordLookups").collect()).map((row) => row.keyword),
      jobs: (await ctx.db.query("researchJobs").collect()).length,
    }));
    expect(left).toEqual({ keywords: ["seo"], serps: ["seo"], lookups: ["seo"], jobs: 0 });
  });
});

describe("Google's results", () => {
  test("opened, the agent buys the top ten's strength, linking websites and what each ranks for: its top keyword, and the also-rank-for ideas", async () => {
    const t = harness();
    const { as, siteId } = await company(t);
    await researchAgent(t);
    const { lookupIds: [lookupId] } = await as.mutation(api.keywordResearch.lookUp, { keywords: ["web design agency"], locationCode: UK, siteId });
    vi.stubGlobal("fetch", dataForSeo(() => [{ domain: "madebyshape.co.uk", position: 1 }, { domain: "lightflows.co.uk", position: 2 }]));
    const firstRun = (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id;
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: firstRun });

    await as.mutation(api.keywordResearch.openResults, { lookupId });
    const secondRun = (await t.run(async (ctx) => await ctx.db.query("agentRuns").order("desc").first()))!._id;
    expect(secondRun).not.toBe(firstRun);
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: secondRun });

    const results = await as.query(api.keywordResearch.lookupResults, { lookupId });
    expect(results?.state).toBe("READY");
    expect(results?.rows.map((row) => [row.position, row.domain, row.kind, row.strength, row.linkingSites, row.visits, row.topKeyword, row.who])).toEqual([
      [1, "madebyshape.co.uk", null, 72, 2100, 9400, "madebyshape.co.uk top", null],
      [2, "lightflows.co.uk", null, 72, 2100, 8400, "lightflows.co.uk top", "RIVAL"],
    ]);
    expect(results?.beyond).toEqual([
      { domain: "ronins.co.uk", who: "YOU", position: null, url: null },
      { domain: "lightflows.co.uk", who: "RIVAL", position: 2, url: "https://lightflows.co.uk/page/" },
    ]);
    const ideas = await t.run(async (ctx) => await ctx.db.query("researchIdeas").collect());
    // The keyword itself is never its own idea; each page's keywords once.
    expect(ideas.map((row) => [row.kind, row.rows.map((idea) => idea.keyword)])).toEqual([["ALSO_RANK", ["madebyshape.co.uk top", "lightflows.co.uk top"]]]);

    // Opened again while fresh: nothing more is bought.
    await as.mutation(api.keywordResearch.openResults, { lookupId });
    expect(await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).length)).toBe(2);
  });
});

describe("Google's results on the platform's sandbox", () => {
  test("sample details never land on real results: the sandbox's own results are bought first, the real ones left as they were", async () => {
    const t = harness();
    const { as, siteId } = await company(t);
    await researchAgent(t);
    vi.stubEnv("DATAFORSEO_SANDBOX", "1");
    await t.run(async (ctx) => {
      await ctx.db.insert("researchKeywords", {
        keyword: "web design agency", locationCode: UK, boughtAt: Date.now(), sandbox: false, searchVolume: 3600, cpc: null, competitionLevel: null,
        difficulty: 64, intent: null, monthly: [], serpKinds: [], resultsCount: null, topTenLinkingSites: null,
      });
      await ctx.db.insert("researchSerps", {
        keyword: "web design agency", locationCode: UK, boughtAt: Date.now() - 1_000, sandbox: false,
        results: [{ position: 1, domain: "kota.co.uk", url: "https://kota.co.uk/", title: "Kota" }],
      });
    });
    const { lookupIds: [lookupId] } = await as.mutation(api.keywordResearch.lookUp, { keywords: ["web design agency"], locationCode: UK, siteId });
    // Real figures, held and fresh, open a lookup on the sandbox too: nothing was bought.
    expect(await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).length)).toBe(0);
    const fetch = dataForSeo(() => [{ domain: "madebyshape.co.uk", position: 1 }]);
    vi.stubGlobal("fetch", fetch);

    await as.mutation(api.keywordResearch.openResults, { lookupId });
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id });

    expect(fetch.mock.calls.some(([url]) => String(url).includes("/serp/"))).toBe(true);
    const serps = await t.run(async (ctx) => await ctx.db.query("researchSerps").collect());
    expect(serps.map((serp) => [serp.sandbox, Boolean(serp.detailsBoughtAt)])).toEqual([[false, false], [true, true]]);
    expect((await as.query(api.keywordResearch.lookupResults, { lookupId }))?.state).toBe("READY");
  });
});

describe("keyword ideas", () => {
  test("opened, the agent buys terms match and questions, the company's number of each, and the top ten in full for also-rank-for", async () => {
    const t = harness();
    const { as, siteId, websiteId } = await company(t);
    await researchAgent(t);
    const { lookupIds: [lookupId] } = await as.mutation(api.keywordResearch.lookUp, { keywords: ["web design agency"], locationCode: UK, siteId });
    const fetch = dataForSeo(() => [{ domain: "madebyshape.co.uk", position: 1 }]);
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id });
    // The website ranks for one of the ideas: the idea says where.
    await t.run(async (ctx) => {
      await ctx.db.insert("siteKeywordRanks", {
        websiteId, locationCode: UK, keyword: "best web design agency", position: 7, url: "https://ronins.co.uk/web/", band: "p04_10", page: "/web/",
        volume: 400, volumeKnown: true, intent: "BUYING", status: "SAME", change: 0, day: "2026-10-01", firstSeenDay: "2026-09-01",
        searchText: "best web design agency", updatedAt: Date.now(),
      });
    });

    await as.mutation(api.keywordResearchIdeas.openIdeas, { lookupId });
    const runId = (await t.run(async (ctx) => await ctx.db.query("agentRuns").order("desc").first()))!._id;
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId });

    const asked = fetch.mock.calls.filter(([url]) => String(url).includes("keyword_suggestions")).map(([, init]) => JSON.parse((init as { body: string }).body)[0]);
    expect(asked.map((task) => [task.limit, Boolean(task.filters)])).toEqual([[100, false], [100, true]]);
    const terms = await as.query(api.keywordResearchIdeas.lookupIdeas, { lookupId, kind: "TERMS" });
    expect(terms?.state).toBe("READY");
    expect(terms?.counts).toEqual({ TERMS: 1000, QUESTIONS: 86, ALSO_RANK: 1 });
    expect(terms?.rows.map((row) => [row.keyword, row.volume, row.position])).toEqual([["cheap web design agency", 500, null], ["best web design agency", 400, 7]]);
    const questions = await as.query(api.keywordResearchIdeas.lookupIdeas, { lookupId, kind: "QUESTIONS" });
    expect(questions?.rows.map((row) => row.keyword)).toEqual(["how much does a web design agency", "who is the best web design agency"]);
    const alsoRank = await as.query(api.keywordResearchIdeas.lookupIdeas, { lookupId, kind: "ALSO_RANK" });
    expect(alsoRank?.rows.map((row) => row.keyword)).toEqual(["madebyshape.co.uk top"]);
  });

  test("opened while Google's results are being bought, the ideas are bought by a run of their own, and each run settles only its own part", async () => {
    const t = harness();
    const { as, siteId } = await company(t);
    await researchAgent(t);
    const { lookupIds: [lookupId] } = await as.mutation(api.keywordResearch.lookUp, { keywords: ["web design agency"], locationCode: UK, siteId });
    const fetch = dataForSeo(() => [{ domain: "madebyshape.co.uk", position: 1 }]);
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id });

    await as.mutation(api.keywordResearch.openResults, { lookupId });
    await as.mutation(api.keywordResearchIdeas.openIdeas, { lookupId });
    const [, resultsRun, ideasRun] = await t.run(async (ctx) => await ctx.db.query("agentRuns").collect());
    const jobs = await t.run(async (ctx) => await ctx.db.query("researchJobs").collect());
    expect(jobs.slice(1).map((job) => [job.part, job.runId])).toEqual([["RESULTS", resultsRun._id], ["IDEAS", ideasRun._id]]);

    // The ideas' run finishes first, and leaves Google's results to their own run.
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: ideasRun._id });
    let lookup = await t.run(async (ctx) => await ctx.db.get(lookupId));
    expect([lookup?.ideas, lookup?.results]).toEqual(["READY", "WAITING"]);
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: resultsRun._id });
    lookup = await t.run(async (ctx) => await ctx.db.get(lookupId));
    expect([lookup?.ideas, lookup?.results]).toEqual(["READY", "READY"]);
    // The top ten in full was bought once.
    expect(fetch.mock.calls.filter(([url]) => String(url).includes("bulk_ranks"))).toHaveLength(1);
  });
});

describe("a lookup's overview", () => {
  async function lookedUp(t: Harness, results: Array<{ domain: string; position: number }>, domainRank?: number) {
    const ids = await company(t);
    await researchAgent(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("researchKeywords", {
        keyword: "web design agency", locationCode: UK, boughtAt: Date.now(), sandbox: false, searchVolume: 3600, cpc: 6.2,
        competitionLevel: "HIGH", difficulty: 64, intent: "commercial", monthly: [], serpKinds: [], resultsCount: null, topTenLinkingSites: 180,
        topTenDomainStrength: 40,
      });
      await ctx.db.insert("researchSerps", {
        keyword: "web design agency", locationCode: UK, boughtAt: Date.now(), sandbox: false,
        results: results.map(({ domain, position }) => ({ position, domain, url: `https://${domain}/web/`, title: domain })),
      });
      if (domainRank !== undefined) {
        await ctx.db.insert("siteDaySummaries", { websiteId: ids.websiteId, locationCode: UK, day: "2026-10-01", domainRank, referringDomains: 5_000, updatedAt: Date.now() } as never);
      }
    });
    const { lookupIds } = await ids.as.mutation(api.keywordResearch.lookUp, { keywords: ["web design agency"], locationCode: UK, siteId: ids.siteId });
    return { ...ids, lookupId: lookupIds[0] };
  }

  test("says what it means for the website: its page and position, its competitors, and one of four answers", async () => {
    const t = harness();
    const { as, lookupId } = await lookedUp(t, [{ domain: "madebyshape.co.uk", position: 1 }, { domain: "lightflows.co.uk", position: 4 }, { domain: "ronins.co.uk", position: 18 }]);
    const overview = await as.query(api.keywordResearch.lookupOverview, { lookupId });
    expect(overview?.forWebsite).toMatchObject({
      host: "ronins.co.uk", position: 18, url: "https://ronins.co.uk/web/", verdict: "IMPROVE",
      competitors: [{ host: "lightflows.co.uk", position: 4 }],
    });
    expect(overview?.top?.map((result) => result.domain)).toEqual(["madebyshape.co.uk", "lightflows.co.uk", "ronins.co.uk"]);
  });

  test("with no page of its own, a new page is worth it when the website is as strong as the top ten's websites, too hard when not — like for like", async () => {
    const reach = async (domainRank: number) => {
      const t = harness();
      const { as, lookupId } = await lookedUp(t, [{ domain: "madebyshape.co.uk", position: 1 }], domainRank);
      return (await as.query(api.keywordResearch.lookupOverview, { lookupId }))?.forWebsite;
    };
    // Strength 0 to 100 against the top ten's 40: never the website's linking websites against the top ten's pages'.
    expect(await reach(400)).toMatchObject({ strength: 40, verdict: "NEW_PAGE" });
    expect(await reach(390)).toMatchObject({ strength: 39, verdict: "TOO_HARD" });
  });

  test("another country picked buys its overview alone, and the website's own positions show only for the country it is watched from", async () => {
    const t = harness();
    const { as, lookupId, websiteId } = await lookedUp(t, [{ domain: "madebyshape.co.uk", position: 1 }]);
    const fetch = dataForSeo();
    vi.stubGlobal("fetch", fetch);
    await as.mutation(api.keywordResearch.lookUpInCountry, { lookupId, locationCode: US });
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id });
    expect(fetch.mock.calls.map(([url]) => String(url).replace("https://api.dataforseo.com", ""))).toEqual(["/v3/dataforseo_labs/google/keyword_overview/live"]);
    expect((await as.query(api.keywordResearch.lookupOverview, { lookupId }))?.countries.find((country) => country.code === US)).toMatchObject({ state: "READY", volume: 3600 });

    // Looked up in the United States, the website — watched from the United Kingdom — has no positions to show.
    await t.run(async (ctx) => {
      await ctx.db.insert("researchIdeas", { keyword: "web design agency", locationCode: US, kind: "TERMS", boughtAt: Date.now(), sandbox: false, limit: 100, total: 1, rows: [{ keyword: "best web design agency", volume: 400, difficulty: 30, intent: null, cpc: null }] });
      await ctx.db.insert("siteKeywordRanks", {
        websiteId, locationCode: UK, keyword: "best web design agency", position: 7, url: "https://ronins.co.uk/web/", band: "p04_10", page: "/web/",
        volume: 400, volumeKnown: true, intent: "BUYING", status: "SAME", change: 0, day: "2026-10-01", firstSeenDay: "2026-09-01",
        searchText: "best web design agency", updatedAt: Date.now(),
      });
    });
    const { lookupIds: [usLookup] } = await as.mutation(api.keywordResearch.lookUp, { keywords: ["web design agency"], locationCode: US });
    const ideas = await as.query(api.keywordResearchIdeas.lookupIdeas, { lookupId: usLookup, kind: "TERMS" });
    expect(ideas?.rows.map((row) => [row.keyword, row.position])).toEqual([["best web design agency", null]]);
  });

  test("is the company's own: another company reads nothing of it", async () => {
    const t = harness();
    const { lookupId } = await lookedUp(t, []);
    const other = await company(t);
    expect(await other.as.query(api.keywordResearch.lookupOverview, { lookupId })).toBeNull();
    await expect(other.as.mutation(api.keywordResearch.lookUpAgain, { lookupId })).rejects.toThrow(/not your company's/);
  });
});

describe("research lists", () => {
  test("add keywords once, take them off, and Track copies them into the website's tracked searches, leaving the list", async () => {
    const t = harness();
    const { as, siteId } = await company(t);
    const { listId } = await as.mutation(api.keywordResearch.addToResearchList, {
      newList: { name: "Web design – London", siteId },
      items: [{ keyword: "web design agency", locationCode: UK }, { keyword: "Web Design Agency", locationCode: UK }, { keyword: "logo design", locationCode: UK }],
    });
    let list = await as.query(api.keywordResearch.researchList, { listId });
    expect(list?.rows.map((row) => row.keyword)).toEqual(["web design agency", "logo design"]);

    expect(await as.mutation(api.keywordResearch.trackFromResearchList, { listId, keywords: ["web design agency"] })).toEqual({ tracked: 1 });
    await as.mutation(api.keywordResearch.removeFromResearchList, { listId, items: [{ keyword: "web design agency", locationCode: UK }] });
    list = await as.query(api.keywordResearch.researchList, { listId });
    expect(list?.rows.map((row) => row.keyword)).toEqual(["logo design"]);
    const tracked = await t.run(async (ctx) => await ctx.db.query("websiteKeywords").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).collect());
    expect(tracked.map((row) => row.keyword)).toEqual(["web design agency"]);
  });

  test("are the company's own", async () => {
    const t = harness();
    const { as } = await company(t);
    const { listId } = await as.mutation(api.keywordResearch.addToResearchList, { newList: { name: "Ideas" }, items: [] });
    const other = await company(t);
    expect(await other.as.query(api.keywordResearch.researchList, { listId })).toBeNull();
    expect(await other.as.query(api.keywordResearch.researchLists, {})).toEqual([]);
    await expect(other.as.mutation(api.keywordResearch.deleteResearchList, { listId })).rejects.toThrow(/not your company's/);
  });
});

describe("start from a competitor", () => {
  test("lists each competitor's gap from Content gap's copy — nothing bought — the most searched first", async () => {
    const t = harness();
    const { as, siteId } = await company(t);
    const rival = await t.run(async (ctx) => {
      const hold = (await ctx.db.query("companyWebsites").collect()).find((row) => row.relationship === "TRACKED")!;
      const rows = [
        ["g1", "web agency surrey", 300, "BUYING", 20, [0, 4, 120], "2026-10-01"],
        ["g2", "brand agency", 900, "BUYING", 45, [0, 9, 40], "2026-10-01"],
      ];
      await ctx.db.insert("siteListCopies", {
        kind: "gap", key: siteId, buildId: "b1", fields: ["id", "keyword", "volume", "intent", "difficulty", "rivals", "day"],
        rows: rows.length, parts: 1, cut: null, meta: { rivalIds: JSON.stringify([hold.websiteId]) }, builtAt: Date.now(),
      });
      await ctx.db.insert("siteListCopyParts", { kind: "gap", key: siteId, buildId: "b1", part: 0, data: JSON.stringify(rows) });
      return hold._id;
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    expect(await as.query(api.keywordResearchCompetitors.competitorStarts, { siteId })).toEqual({
      preparing: false,
      rivals: [{ rivalSiteId: rival, host: "lightflows.co.uk", gap: 2 }],
    });
    const gap = await as.query(api.keywordResearchCompetitors.competitorGap, { siteId, rivalSiteId: rival });
    expect(gap?.rows.map((row) => [row.keyword, row.position, row.volume])).toEqual([["brand agency", 9, 900], ["web agency surrey", 4, 300]]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("what the AI says", () => {
  test("opened, the four assistants are asked the question at once, each answer read for who it names, and Google's AI Overview searches bought", async () => {
    const t = harness();
    const { as, siteId, websiteId, companyId } = await company(t);
    await researchAgent(t);
    // On the platform's sandbox the question is a plain sentence, not written by a model.
    vi.stubEnv("DATAFORSEO_SANDBOX", "1");
    await t.run(async (ctx) => {
      const rival = (await ctx.db.query("companyWebsites").collect()).find((row) => row.relationship === "TRACKED")!;
      for (const [hold, website, name] of [[siteId, websiteId, "Ronins"], [rival._id, rival.websiteId, "Lightflows"]] as const) {
        await ctx.db.insert("holdProfiles", { companyWebsiteId: hold, companyId, websiteId: website, brandNames: [{ name, isPrimary: true }], hasBrandNames: true, updatedAt: Date.now() });
      }
    });
    const { lookupIds: [lookupId] } = await as.mutation(api.keywordResearch.lookUp, { keywords: ["web design agency"], locationCode: UK, siteId });
    const fetch = dataForSeo(() => [{ domain: "madebyshape.co.uk", position: 1 }]);
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: (await t.run(async (ctx) => await ctx.db.query("agentRuns").first()))!._id });

    await as.mutation(api.keywordResearchAnswers.openAnswers, { lookupId });
    await t.action(internal.keywordResearchRun.runKeywordResearchNow, { runId: (await t.run(async (ctx) => await ctx.db.query("agentRuns").order("desc").first()))!._id });

    const asked = fetch.mock.calls.filter(([url]) => String(url).includes("llm_responses")).map(([url, init]) => [String(url).split("/ai_optimization/")[1].split("/")[0], JSON.parse((init as { body: string }).body)[0].user_prompt]);
    // Each of the four assistants, once, the same question.
    expect(asked.sort()).toEqual(AI_ENGINES.map((engine) => [AI_ENGINE_CALLS[engine].platform, "Who is the best web design agency in United Kingdom?"]).sort());
    const answers = await as.query(api.keywordResearchAnswers.lookupAnswers, { lookupId });
    expect(answers?.state).toBe("READY");
    expect(answers?.figures).toEqual({ answered: 4, nameYou: 1, nameARival: 4, rivalMost: "lightflows.co.uk", businessesNamed: 2, pagesCited: 8, pagesCitedYours: 4 });
    expect(answers?.engines.find((engine) => engine.engine === "perplexity")).toMatchObject({ yourPlace: 2, rivalsNamed: ["lightflows.co.uk"] });
    expect(answers?.mostNamed.map((row) => [row.host, row.who, row.count])).toEqual([["lightflows.co.uk", "RIVAL", 4], ["ronins.co.uk", "YOU", 1]]);
    expect(answers?.searches.map((row) => [row.query, row.times])).toEqual([["web design agency uk", 2], ["best web designers", 1]]);

    // Opened again while fresh: nothing bought. Ask again buys afresh.
    await as.mutation(api.keywordResearchAnswers.openAnswers, { lookupId });
    expect(await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).length)).toBe(2);
    await as.mutation(api.keywordResearchAnswers.openAnswers, { lookupId, again: true });
    expect(await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).length)).toBe(3);
  });
});

