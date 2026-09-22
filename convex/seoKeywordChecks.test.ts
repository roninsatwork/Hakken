import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * One checked search, filed against every site it answers for.
 *
 * The behaviour worth more than the rest: **a host that tracks a search and is
 * not on the page gets a row saying so.** Without it, "checked and not found"
 * and "never checked" look identical, and a verdict like *never ranked* cannot
 * be told from a search nobody has asked yet.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const LEEDS = 1006925;

async function seedWebsite(t: Harness, host: string) {
  return await t.run(async (ctx) =>
    await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() }));
}

async function track(t: Harness, websiteId: Id<"websites">, keyword: string, isActive = true) {
  await t.run(async (ctx) =>
    await ctx.db.insert("websiteKeywords", { websiteId, keyword, isActive, createdAt: Date.now() }));
}

async function seedCheck(t: Harness, keyword: string, locationCode: number, items: unknown[]) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "serp_google_organic",
    family: "SERP",
    mode: "QUEUED",
    taskArgsJson: JSON.stringify({ keyword, location_code: locationCode, language_code: "en" }),
    resultJson: JSON.stringify([{ keyword, se_results_count: 1000, items }]),
    status: "READY",
    tag: `check-${Math.random()}`,
    attempts: 0,
    costUsd: 0,
    sandbox: false,
    submittedAt: Date.now(),
    completedAt: Date.parse("2026-09-21T09:00:00Z"),
  } as never));
}

const positions = (t: Harness) =>
  t.run(async (ctx) => await ctx.db.query("seoKeywordPositions").collect());

describe("filing a checked search", () => {
  test("every known site on the page gets its place, and a tracker missing from it gets a row saying so", async () => {
    const t = harness();
    const ronins = await seedWebsite(t, "ronins.co.uk");
    const rival = await seedWebsite(t, "rival.co.uk");
    const absent = await seedWebsite(t, "absent.co.uk");
    await track(t, ronins, "branding agency leeds");
    await track(t, absent, "branding agency leeds");

    const pull = await seedCheck(t, "branding agency leeds", LEEDS, [
      { type: "organic", domain: "rival.co.uk", rank_absolute: 2, url: "https://rival.co.uk/" },
      { type: "organic", domain: "www.ronins.co.uk", rank_absolute: 5, url: "https://ronins.co.uk/" },
      { type: "organic", domain: "unknown-site.com", rank_absolute: 7 },
    ]);
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId: pull });

    const rows = await positions(t);
    const byWebsite = new Map(rows.map((row) => [row.websiteId, row]));
    // The rival tracks nothing and still gets its place: the page was bought
    // once and answers for everyone on it.
    expect(byWebsite.get(rival)?.position).toBe(2);
    expect(byWebsite.get(ronins)?.position).toBe(5);
    // Checked, not on the page — kept as absent, never as position 100.
    expect(byWebsite.has(absent)).toBe(true);
    expect(byWebsite.get(absent)?.position).toBeUndefined();
    // A domain no website record matches is not invented into one.
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.locationCode === LEEDS && row.day === "2026-09-21")).toBe(true);
  });

  test("a re-parse replaces what the last one wrote", async () => {
    const t = harness();
    const ronins = await seedWebsite(t, "ronins.co.uk");
    await track(t, ronins, "branding agency leeds");
    const pull = await seedCheck(t, "branding agency leeds", LEEDS, [
      { type: "organic", domain: "ronins.co.uk", rank_absolute: 5 },
    ]);

    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId: pull });
    await t.action(internal.seoCollectionParse.parseSeoResult, { pullId: pull });

    expect(await positions(t)).toHaveLength(1);
  });

  test("the same search from another place is another fact, and both are kept", async () => {
    const t = harness();
    const ronins = await seedWebsite(t, "ronins.co.uk");
    await track(t, ronins, "branding agency leeds");

    await t.action(internal.seoCollectionParse.parseSeoResult, {
      pullId: await seedCheck(t, "branding agency leeds", LEEDS, [
        { type: "organic", domain: "ronins.co.uk", rank_absolute: 5 },
      ]),
    });
    await t.action(internal.seoCollectionParse.parseSeoResult, {
      pullId: await seedCheck(t, "branding agency leeds", 2826, [
        { type: "organic", domain: "ronins.co.uk", rank_absolute: 14 },
      ]),
    });

    const rows = await positions(t);
    expect(rows.map((row) => [row.locationCode, row.position]).sort())
      .toEqual([[1006925, 5], [2826, 14]]);
  });

  test("a paused search is not answered for", async () => {
    const t = harness();
    const paused = await seedWebsite(t, "paused.co.uk");
    await track(t, paused, "branding agency leeds", false);

    await t.action(internal.seoCollectionParse.parseSeoResult, {
      pullId: await seedCheck(t, "branding agency leeds", LEEDS, []),
    });

    expect(await positions(t)).toHaveLength(0);
  });
});
