import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The parts of a site rebuild each filing needs
 * (docs/plans/active/dataforseo-cost-plan.md, A2): an AI answer changes only
 * the AI lines of the websites asking it, and a site-wide figure only the day
 * figures — so neither asks for the whole rebuild, which reads every keyword
 * again. Each part is asked once for a burst, shortly, from every place the
 * website is watched from, as the rebuild was.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const LEEDS = 1006925;

beforeEach(() => {
  vi.useFakeTimers();
  // Midday UTC today: no move of the clock here crosses into another day.
  const now = new Date();
  vi.setSystemTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
});
afterEach(() => vi.useRealTimers());

const today = () => new Date().toISOString().slice(0, 10);

/** kordatackle.com, owned by two companies watching it from two places. */
async function korda(t: Harness) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: Date.now() });
    const holds: Array<Id<"companyWebsites">> = [];
    for (const [name, place] of [["Korda", UK], ["Agency", LEEDS]] as const) {
      const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
      holds.push(await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: place, createdAt: Date.now() }));
    }
    return { websiteId, holdId: holds[0] };
  });
}

async function pull(t: Harness, operationId: string, websiteId?: Id<"websites">) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId, family: "DataForSEO", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: `t-${Math.random()}`,
    attempts: 0, costUsd: 0.01, sandbox: false, submittedAt: Date.now(), ...(websiteId ? { websiteId } : {}),
  } as never));
}

/** The jobs waiting to run, by name and arguments. */
async function waiting(t: Harness) {
  const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.state.kind === "pending").map((job) => ({ name: job.name, args: job.args[0] as Record<string, unknown> }));
}

type Job = { name: string; args: Record<string, unknown> };
const named = (jobs: Job[], part: string) => jobs.filter((job) => job.name.includes(part));

describe("the parts of a site rebuild", () => {
  test("an AI answer syncs the AI lines of the websites asking it, in each place, and nothing else", async () => {
    const t = harness();
    const site = await korda(t);
    const prompt = "best carp rods";
    await t.run(async (ctx) => await ctx.db.insert("websiteQuestions", {
      websiteId: site.websiteId, companyWebsiteId: site.holdId, prompt, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
    }));

    await t.mutation(internal.seoCollectionParse.writeAiCitations, {
      pullId: await pull(t, "ai_chatgpt"),
      prompt,
      engine: "chatgpt",
      day: today(),
      brands: [{ websiteId: site.websiteId, text: "Korda", variantKind: "NAME" as const }],
      sources: [],
    });

    const jobs = await waiting(t);
    expect(named(jobs, "rebuildSite")).toEqual([]);
    expect(named(jobs, "syncSiteAiLines").map((job) => job.args)).toEqual(expect.arrayContaining([
      { websiteId: site.websiteId, locationCode: UK }, { websiteId: site.websiteId, locationCode: LEEDS },
    ]));
    expect(named(jobs, "syncSiteAiLines")).toHaveLength(2);

    // A second answer in the burst asks again for nothing.
    await t.mutation(internal.seoCollectionParse.writeAiCitations, {
      pullId: await pull(t, "ai_chatgpt"), prompt, engine: "chatgpt", day: today(), brands: [], sources: [],
    });
    expect(named(await waiting(t), "syncSiteAiLines")).toHaveLength(2);

    // The part does what the rebuild did for it: the list's AI line, counted from its answers.
    await t.action(internal.siteDayFigures.syncSiteAiLines, { websiteId: site.websiteId, locationCode: UK });
    const lines = await t.run(async (ctx) => await ctx.db.query("siteListAiDays").collect());
    expect(lines.find((line) => line.companyWebsiteId === site.holdId && line.websiteId === site.websiteId)?.ai)
      .toEqual([{ engine: "chatgpt", asked: 2, named: 1, recommended: 0 }]);
  });

  test("a site-wide figure syncs the day figures, in each place, and a keyword total with no rankings still rebuilds the site", async () => {
    const t = harness();
    const site = await korda(t);

    await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
      pullId: await pull(t, "backlinks_summary", site.websiteId),
      websiteId: site.websiteId,
      operationId: "backlinks_summary",
      day: today(),
      metricsJson: JSON.stringify({ backlinks: 1200, referringDomains: 80 }),
      positions: [],
    });
    let jobs = await waiting(t);
    expect(named(jobs, "rebuildSite")).toEqual([]);
    expect(named(jobs, "syncSiteDays").map((job) => job.args.locationCode).sort()).toEqual([UK, LEEDS].sort());

    // The part does what the rebuild did for it: the day's figures, in that place.
    for (const place of [UK, LEEDS]) await t.mutation(internal.siteDayFigures.syncSiteDays, { websiteId: site.websiteId, locationCode: place });
    const days = await t.run(async (ctx) => await ctx.db.query("siteDaySummaries").collect());
    expect(days.filter((row) => row.day === today()).map((row) => [row.locationCode, row.backlinks, row.referringDomains]).sort())
      .toEqual([[UK, 1200, 80], [LEEDS, 1200, 80]].sort());

    // A bulk count is a site-wide figure too.
    await t.mutation(internal.seoCollectionParse.writeBulkMetrics, {
      pullId: await pull(t, "bulk_ranks"),
      operationId: "bulk_ranks",
      day: today(),
      rows: [{ host: "kordatackle.com", metricsJson: JSON.stringify({ rank: 310 }) }],
    });
    jobs = await waiting(t);
    expect(named(jobs, "rebuildSite")).toEqual([]);
    expect(named(jobs, "syncSiteDays")).toHaveLength(4);

    // A ranked-keywords total with no rankings still says what the latest check is: the whole rebuild.
    await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
      pullId: await pull(t, "domain_ranked_keywords", site.websiteId),
      websiteId: site.websiteId,
      operationId: "domain_ranked_keywords",
      day: today(),
      locationCode: UK,
      metricsJson: JSON.stringify({ rankedKeywords: 0, returnedKeywords: 0 }),
      positions: [],
    });
    expect(named(await waiting(t), "rebuildSite")).toHaveLength(2);
  });
});
