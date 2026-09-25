import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { siteRebuildKey } from "./siteRankings";

/**
 * One rebuild of a site's summaries — or of a hold's content gap — at a time.
 *
 * What must hold (collection reliability plan, 2.3): each rebuild deletes the
 * rows it did not write itself, so two at once deleted each other's, leaving
 * Pages, Sections and the Content gap part-empty. A rebuild asked for while
 * another runs waits its turn; a turn left by one that died frees itself.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a rebuild's turn", () => {
  test("is one at a time, given back when it ends, and freed if it died", async () => {
    const t = harness();
    const key = "site:test:2826";

    expect(await t.mutation(internal.siteSummaries.beginRebuild, { key })).toBe(true);
    expect(await t.mutation(internal.siteSummaries.beginRebuild, { key })).toBe(false);

    await t.mutation(internal.siteSummaries.endRebuild, { key });
    expect(await t.mutation(internal.siteSummaries.beginRebuild, { key })).toBe(true);

    // Held twelve minutes by a rebuild that never gave it back: past any action's life.
    vi.advanceTimersByTime(12 * 60 * 1000);
    expect(await t.mutation(internal.siteSummaries.beginRebuild, { key })).toBe(true);
  });

  test("a rebuild asked for while another runs waits and tries again, doing nothing meanwhile", async () => {
    const t = harness();
    const websiteId = await t.run(async (ctx) =>
      await ctx.db.insert("websites", { host: "korda.test", displayHost: "korda.test", firstSeenAt: Date.now() }));
    await t.mutation(internal.siteSummaries.beginRebuild, { key: siteRebuildKey(websiteId, 2826) });

    await t.action(internal.siteSummaries.rebuildSite, { websiteId, locationCode: 2826 });

    const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    const again = jobs.find((job) => job.name.includes("rebuildSite"));
    expect(again?.args[0]).toMatchObject({ websiteId, locationCode: 2826 });
    expect((again?.scheduledTime ?? 0) - (again?._creationTime ?? 0)).toBeGreaterThanOrEqual(55_000);
    // It did not rebuild: nothing else was started.
    expect(jobs.filter((job) => !job.name.includes("rebuildSite"))).toEqual([]);
  });
});
