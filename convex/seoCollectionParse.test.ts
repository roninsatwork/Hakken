import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * A filing that lost a clash with another write to the same rows is filed
 * again by itself, a little later, from the saved answer — and nothing else is.
 * Korda's first full run (2026-09-24) left seven of 138 answers unfiled that
 * way until they were filed again by hand.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const CLASHED = 'Parse failed: Documents read from or written to the "siteContentGaps" table changed while this mutation '
  + "was being run and on every subsequent retry.";

async function pullWith(t: ReturnType<typeof harness>, error: string | undefined) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "domain_ranked_keywords_list", family: "DataForSEO Labs", mode: "LIVE", target: "gocatch.fish",
    taskArgsJson: "{}", status: "READY", tag: `t-${Math.random()}`, attempts: 1, costUsd: 0.13, sandbox: false,
    submittedAt: Date.now(), completedAt: Date.now(), resultJson: "[]", ...(error ? { error } : {}),
  } as never));
}

const refiles = (t: ReturnType<typeof harness>) =>
  t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
    .filter((job) => job.name.includes("parseSeoResult"))
    .map((job) => ({ args: job.args[0] as { retry?: number }, waitMs: job.scheduledTime - job._creationTime })));

describe("a filing that lost a clash", () => {
  test("is filed again 20 to 60 seconds later, counting its tries", async () => {
    const t = harness();
    const pullId = await pullWith(t, CLASHED);

    await t.mutation(internal.seoFiling.finishFiling, { pullId, retry: 0 });

    const [again] = await refiles(t);
    expect(again.args).toMatchObject({ pullId, retry: 1 });
    expect(again.waitMs).toBeGreaterThanOrEqual(19_000);
    expect(again.waitMs).toBeLessThanOrEqual(61_000);
  });

  test("gives up after three tries, and never retries any other failure or a filing that went in", async () => {
    const t = harness();
    await t.mutation(internal.seoFiling.finishFiling, { pullId: await pullWith(t, CLASHED), retry: 3 });
    await t.mutation(internal.seoFiling.finishFiling, { pullId: await pullWith(t, "Parse failed: no items"), retry: 0 });
    await t.mutation(internal.seoFiling.finishFiling, { pullId: await pullWith(t, undefined), retry: 0 });

    expect(await refiles(t)).toEqual([]);
  });

  test("a filing that went in is marked filed; one that failed is not", async () => {
    const t = harness();
    const filed = await pullWith(t, undefined);
    const failed = await pullWith(t, "Parse failed: no items");

    await t.mutation(internal.seoFiling.finishFiling, { pullId: filed, retry: 0 });
    await t.mutation(internal.seoFiling.finishFiling, { pullId: failed, retry: 0 });

    expect((await t.run(async (ctx) => await ctx.db.get(filed)))?.filedAt).toEqual(expect.any(Number));
    expect((await t.run(async (ctx) => await ctx.db.get(failed)))?.filedAt).toBeUndefined();
  });
});
