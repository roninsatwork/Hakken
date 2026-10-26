import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import { checkOpenFindings } from "./insightFindingChecks";
import { useFixedDay } from "@/src/test/realTime";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
beforeEach(() => useFixedDay("2026-10-26"));
afterEach(() => vi.useRealTimers());

test("checks older findings beyond the former cap, saves every batch and never counts a replay twice", async () => {
  const t = harness();
  const before = { key: "site.watch", label: "A figure", value: 100, unit: "count" as const, source: "analytics" as const };
  const seeded = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const row = { companyId, companyWebsiteId: holdId, specialist: "search" as const, pattern: "p", status: "PUBLISHED" as const, rank: 1, headline: "A finding", story: "s", action: "a", howWeKnow: "h", sure: "HIGH" as const, sources: [], facts: [before], comparisons: [], ruledOut: [], createdAt: 1, checkOn: "2026-10-01" };
    for (let at = 0; at < 501; at += 1) await ctx.db.insert("insightFindings", { ...row, week: "2026-10-19", outcome: "RIGHT" });
    const ids = [];
    for (let at = 0; at < 51; at += 1) ids.push(await ctx.db.insert("insightFindings", { ...row, week: "2026-09-01", watch: { key: before.key, direction: "UP" } }));
    return { companyId, holdId, ids };
  });
  expect((await t.query(internal.insightsTeam.openFindings, { holdId: seeded.holdId })).findings).toHaveLength(0);
  const facts = new Map([[before.key, { ...before, value: 200 }]]);
  expect(await t.action(async (ctx) => await checkOpenFindings(ctx, seeded, facts, "2026-10-26"))).toEqual({ judged: 51, restarted: 0 });
  expect(await t.action(async (ctx) => await checkOpenFindings(ctx, seeded, facts, "2026-10-26"))).toEqual({ judged: 0, restarted: 0 });
  await t.mutation(internal.insightsTeam.scoreFindings, { companyId: seeded.companyId, holdId: seeded.holdId, outcomes: [{ findingId: seeded.ids[0], specialist: "search", outcome: "RIGHT", note: "Replayed saved batch" }] });
  const tally = await t.run(async (ctx) => await ctx.db.query("insightTally").first());
  expect(tally).toMatchObject({ right: 51, wrong: 0, unclear: 0 });
});

test("a finding score cannot change another company's finding or tally", async () => {
  const t = harness();
  const seeded = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const otherId = await ctx.db.insert("companies", { name: "Other", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const findingId = await ctx.db.insert("insightFindings", { companyId, companyWebsiteId: holdId, week: "2026-10-19", specialist: "search", pattern: "p", status: "PUBLISHED", rank: 1, headline: "A finding", story: "s", action: "a", howWeKnow: "h", sure: "HIGH", sources: [], facts: [], comparisons: [], ruledOut: [], createdAt: 1 });
    return { otherId, findingId };
  });
  await t.mutation(internal.insightsTeam.scoreFindings, { companyId: seeded.otherId, outcomes: [{ findingId: seeded.findingId, specialist: "search", outcome: "RIGHT", note: "Wrong company" }] });
  const result = await t.run(async (ctx) => ({ finding: await ctx.db.get(seeded.findingId), tally: await ctx.db.query("insightTally").first() }));
  expect(result.finding?.outcome).toBeUndefined();
  expect(result.tally).toBeNull();
});
