import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * Your searches' rows say which searches were ticked from a fan-out query, so
 * Tracked fan-out queries (Anthony, 2026-10-03) can show those alone.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-10-03";
const PROMPT = "who are the best web designers in Surrey, England";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A company with one website of its own, asking one prompt of Claude, which ran the fan-out queries given. */
async function asking(t: Harness, fanOuts: Array<[string, number]>) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    await ctx.db.insert("websiteQuestions", { websiteId, companyWebsiteId: holdId, prompt: PROMPT, engines: ["claude"], isActive: true, createdAt: Date.now() });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}",
      status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    for (const [query, timesSeen] of fanOuts) {
      await ctx.db.insert("promptFanOutQueries", {
        prompt: PROMPT, engine: "claude", query, queryText: query, timesSeen, firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
      });
    }
    return { companyId, websiteId, holdId };
  });
  vi.setSystemTime(Date.now() + 60_000);
  await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: ids.holdId });
  await finishScheduled(t);
  return ids;
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Staff", email: `s-${Math.random()}@test.com`, role: "USER" as const, companyId, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

describe("Your searches' rows", () => {
  test("mark the searches ticked from a fan-out query, and none typed in", async () => {
    const t = harness();
    const ronins = await asking(t, [["best web designers surrey england", 8]]);
    const staff = await member(t, ronins.companyId);
    await t.run(async (ctx) => {
      // Typed in on Tracked keywords, and one from before the field was kept.
      await ctx.db.insert("websiteKeywords", {
        websiteId: ronins.websiteId, companyWebsiteId: ronins.holdId, keyword: "web design surrey", isActive: true, createdAt: Date.now(), addedFrom: "HAND",
      });
      await ctx.db.insert("websiteKeywords", {
        websiteId: ronins.websiteId, companyWebsiteId: ronins.holdId, keyword: "web design guildford", isActive: true, createdAt: Date.now(),
      });
    });
    const row = (await staff.query(api.siteAngles.listAngles, { siteId: ronins.holdId })).rows[0];
    await staff.mutation(api.siteFanOutTracking.trackSiteFanOutQuery, { siteId: ronins.holdId, prompt: row.prompt, queries: [row.query], track: true });

    const rows = await staff.query(api.siteGoogle.listSearches, { siteId: ronins.holdId });
    expect(rows.map((entry) => [entry.keyword, entry.fromFanOut])).toEqual([
      ["best web designers surrey england", true],
      ["web design guildford", false],
      ["web design surrey", false],
    ]);
  });
});
