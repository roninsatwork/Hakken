import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * Clearing collected DataForSEO data from a test database.
 *
 * What must hold: it refuses where it is not allowed, it only counts without
 * the confirm word, and it clears the collected data while leaving the setup —
 * the website, its searches — exactly where it was.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function seed(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    await ctx.db.insert("websiteKeywords", { websiteId, keyword: "ai agency", isActive: true, createdAt: Date.now() });
    for (let index = 0; index < 20; index += 1) {
      await ctx.db.insert("seoDataPulls", {
        operationId: "serp_google_organic", family: "SERP", mode: "QUEUED", taskArgsJson: "{}",
        status: "READY", tag: `t${index}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      } as never);
    }
    return websiteId;
  });
}

describe("clearing collected SEO data", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("refuses where it is not allowed", async () => {
    const t = harness();
    await expect(t.action(internal.seoTestDataReset.clearCollectedSeoData, {})).rejects.toThrow(/switched off/);
  });

  test("counts without the confirm word, and clears with it — leaving the setup alone", async () => {
    vi.stubEnv("SEO_TEST_DATA_RESET", "allowed");
    const t = harness();
    await seed(t);

    const dryRun = await t.action(internal.seoTestDataReset.clearCollectedSeoData, {});
    expect(dryRun.dryRun).toBe(true);
    expect(dryRun.tables.find((entry) => entry.table === "seoDataPulls")?.rows).toBe(20);
    expect(await t.run(async (ctx) => (await ctx.db.query("seoDataPulls").collect()).length)).toBe(20);

    const cleared = await t.action(internal.seoTestDataReset.clearCollectedSeoData, { confirm: "DELETE_SEO_DATA" });
    expect(cleared).toMatchObject({ dryRun: false, finished: true });
    const left = await t.run(async (ctx) => ({
      pulls: (await ctx.db.query("seoDataPulls").collect()).length,
      websites: (await ctx.db.query("websites").collect()).length,
      searches: (await ctx.db.query("websiteKeywords").collect()).length,
    }));
    expect(left).toEqual({ pulls: 0, websites: 1, searches: 1 });
  });
});
