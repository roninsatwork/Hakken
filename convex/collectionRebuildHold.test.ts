import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishSeoCycle } from "./seoCollectionQueue";
import { COLLECTION_REBUILD_EVERY_MS, siteRebuildKey } from "./siteRankings";

/**
 * One rebuild at the end of each collection, not during it
 * (docs/plans/active/dataforseo-cost-plan.md, B4): a website rebuild asked
 * for while the website's collection runs waits for the collection to
 * finish, and one that runs long still rebuilds every few hours. Outside a
 * collection, a rebuild runs shortly, as it did.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;
const MINUTE = 60_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** The clock moved on, firing nothing. */
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

/** Korda's own website, and a collection of the company's, begun `ago` since and still running. */
async function collecting(t: Harness, ago = 0) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "kordatackle.com", displayHost: "kordatackle.com", firstSeenAt: Date.now() });
    await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    const cycleId = await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "SCHEDULE", status: "COLLECTING", plannedCount: 2, reusedCount: 0, sentCount: 2, readyCount: 1,
      failedCount: 0, totalCostUsd: 0.04, startedAt: Date.now() - ago,
    });
    const pull = (operationId: string) => ctx.db.insert("seoDataPulls", {
      operationId, family: "DataForSEO", mode: "QUEUED", websiteId, companyId, taskArgsJson: "{}", status: "READY",
      tag: `t-${Math.random()}`, attempts: 1, costUsd: 0.02, sandbox: false, submittedAt: Date.now(), cycleId,
    } as never);
    return { companyId, websiteId, cycleId, ranked: await pull("domain_ranked_keywords"), links: await pull("backlinks_summary") };
  });
}

/** A ranked-keywords answer filed, as the parser files it: it asks for the site's rebuild. */
async function fileRanks(t: Harness, websiteId: Id<"websites">, pullId: Id<"seoDataPulls">) {
  await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
    pullId, websiteId, operationId: "domain_ranked_keywords", day: "2026-10-05", locationCode: UK,
    metricsJson: JSON.stringify({ returnedKeywords: 1, rankedKeywords: 50 }),
    positions: [{ keyword: "carp rods", position: 3 }] as never,
  });
}

/** The jobs waiting to run, by name, with when each is due from now. */
async function waiting(t: Harness) {
  const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.state.kind === "pending")
    .map((job) => ({ name: job.name, args: job.args[0] as Record<string, unknown>, inMs: job.scheduledTime - Date.now() }));
}

type Job = { name: string; args: Record<string, unknown>; inMs: number };
const named = (jobs: Job[], part: string) => jobs.filter((job) => job.name.includes(part));

const request = (t: Harness, websiteId: Id<"websites">) =>
  t.run(async (ctx) => await ctx.db.query("siteSummaryRequests").withIndex("by_key", (q) => q.eq("key", siteRebuildKey(websiteId, UK))).unique());

describe("a website's rebuild during its collection", () => {
  test("waits for the collection, asked once however many filings land, and runs when it finishes", async () => {
    const t = harness();
    const korda = await collecting(t);

    await fileRanks(t, korda.websiteId, korda.ranked);
    // A site-wide figure's part waits too.
    await t.mutation(internal.seoCollectionParse.writeSeoMetrics, {
      pullId: korda.links, websiteId: korda.websiteId, operationId: "backlinks_summary", day: "2026-10-05",
      metricsJson: JSON.stringify({ backlinks: 1200 }), positions: [],
    });
    later(10 * MINUTE);
    await fileRanks(t, korda.websiteId, korda.ranked);

    let jobs = await waiting(t);
    expect(named(jobs, "rebuildSite")).toEqual([]);
    expect(named(jobs, "syncSiteDays")).toEqual([]);
    // Each held once, with a release a few hours on in case the collection runs long.
    expect(named(jobs, "releaseHeldRequest")).toHaveLength(2);
    expect(await request(t, korda.websiteId)).toMatchObject({ pending: true, heldFor: korda.cycleId });

    // The collection finishes: what waited for it runs, once each.
    await t.run(async (ctx) => await finishSeoCycle(ctx, korda.cycleId));
    expect(named(await waiting(t), "releaseHeldRebuilds").map((job) => job.args)).toEqual([{ cycleId: korda.cycleId }]);
    await t.mutation(internal.siteRankings.releaseHeldRebuilds, { cycleId: korda.cycleId });
    jobs = await waiting(t);
    expect(named(jobs, "rebuildSite").map((job) => job.args)).toEqual([{ websiteId: korda.websiteId, locationCode: UK }]);
    expect(named(jobs, "syncSiteDays")).toHaveLength(1);
    expect((await request(t, korda.websiteId))?.heldFor).toBeUndefined();

    // The release due later finds nothing held: it asks for nothing more.
    await t.mutation(internal.siteRankings.releaseHeldRequest, { key: siteRebuildKey(korda.websiteId, UK), cycleId: korda.cycleId });
    expect(named(await waiting(t), "rebuildSite")).toHaveLength(1);
  });

  test("a collection that runs long still rebuilds every few hours", async () => {
    const t = harness();
    // Three hours and more in, and not rebuilt since it began: rebuilt now.
    const korda = await collecting(t, COLLECTION_REBUILD_EVERY_MS + MINUTE);
    await fileRanks(t, korda.websiteId, korda.ranked);
    expect(named(await waiting(t), "rebuildSite")).toHaveLength(1);

    // That rebuild runs.
    later(MINUTE);
    const key = siteRebuildKey(korda.websiteId, UK);
    await t.mutation(internal.siteSummaries.beginRebuild, { key });
    await t.mutation(internal.siteSummaries.endRebuild, { key, done: true });

    // An hour on, the next filing waits — for the collection's end, or two hours more.
    later(60 * MINUTE);
    await fileRanks(t, korda.websiteId, korda.ranked);
    const jobs = await waiting(t);
    expect(named(jobs, "rebuildSite")).toHaveLength(1);
    const [release] = named(jobs, "releaseHeldRequest");
    expect(release.args).toEqual({ key, cycleId: korda.cycleId });
    expect(release.inMs).toBe(COLLECTION_REBUILD_EVERY_MS - 60 * MINUTE);

    // Its hours up with the collection still running: rebuilt then.
    later(release.inMs);
    await t.mutation(internal.siteRankings.releaseHeldRequest, { key, cycleId: korda.cycleId });
    expect(named(await waiting(t), "rebuildSite")).toHaveLength(2);
  });

  test("outside a collection, runs shortly, as before", async () => {
    const t = harness();
    const korda = await collecting(t);
    await t.run(async (ctx) => await ctx.db.patch(korda.cycleId, { status: "DONE", finishedAt: Date.now() }));

    await fileRanks(t, korda.websiteId, korda.ranked);
    const jobs = await waiting(t);
    expect(named(jobs, "rebuildSite").map((job) => job.inMs)).toEqual([20_000]);
    expect(named(jobs, "releaseHeldRequest")).toEqual([]);
  });
});
