import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * Tracked fan-out queries (Anthony, 2026-10-03): the fan-out queries a company
 * ticked to check on Google every run, with the assistants that ran each and
 * how often — read through its own website, never anyone else's.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-10-03";
const PROMPT = "who are the best web designers in Surrey, England";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A company with one website of its own, asking one prompt of Claude, which ran the fan-out queries given. */
async function asking(t: Harness, name: string, host: string, fanOuts: Array<[string, number]>) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    const questionId = await ctx.db.insert("websiteQuestions", {
      websiteId, companyWebsiteId: holdId, prompt: PROMPT, engines: ["claude"], isActive: true, createdAt: Date.now(),
    });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}",
      status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    for (const [query, timesSeen] of fanOuts) {
      await ctx.db.insert("promptFanOutQueries", {
        prompt: PROMPT, engine: "claude", query, queryText: query, timesSeen, firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
      });
    }
    return { companyId, websiteId, holdId, questionId };
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

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Anthony", email: `a-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

const byKeyword = <Row extends { keyword: string }>(rows: Row[]) => [...rows].sort((left, right) => left.keyword.localeCompare(right.keyword));

describe("the Tracked fan-out queries read", () => {
  test("lists the ticked and running fan-out queries, with who ran them and how often, and the company's own by its question", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers surrey england", 8],
      ["award winning web design surrey england", 2],
    ]);
    const staff = await member(t, ronins.companyId);
    const admin = await superAdmin(t);
    const siteId = ronins.holdId;

    const angle = (await staff.query(api.siteAngles.listAngles, { siteId })).rows.find((row) => row.query === "best web designers surrey england")!;
    await staff.mutation(api.siteFanOutTracking.trackSiteFanOutQuery, { siteId, prompt: angle.prompt, queries: [angle.query], track: true });
    // The company's own, added on the question's screen: no assistant ran it.
    await admin.mutation(api.promptFanOut.addPromptFanOutQuery, { companyId: ronins.companyId, questionId: ronins.questionId, queryText: "Web design agency  Guildford" });
    await t.run(async (ctx) => {
      // Typed in, and one ticked once but paused since: neither is checked from a fan-out query every run.
      await ctx.db.insert("websiteKeywords", {
        websiteId: ronins.websiteId, companyWebsiteId: siteId, keyword: "web design surrey", isActive: true, createdAt: Date.now(), addedFrom: "HAND",
      });
      await ctx.db.insert("websiteKeywords", {
        websiteId: ronins.websiteId, companyWebsiteId: siteId, keyword: "award winning web design surrey england", isActive: false, createdAt: Date.now(), addedFrom: "AI_SEARCH",
      });
    });

    const read = await staff.query(api.siteAngles.listTrackedFanOut, { siteId });
    expect(read.own).toBe(true);
    expect(read.tracking).toEqual({ count: 2, limit: 200 });
    expect(byKeyword(read.rows)).toEqual([
      { keyword: "best web designers surrey england", queryText: "best web designers surrey england", prompt: PROMPT, engines: ["claude"], timesSeen: 8 },
      { keyword: "web design agency guildford", queryText: "Web design agency Guildford", prompt: PROMPT, engines: [], timesSeen: null },
    ]);

    // The question it gives is the one unticking names: the row leaves.
    const own = read.rows.find((row) => row.keyword === "web design agency guildford")!;
    await staff.mutation(api.siteFanOutTracking.trackSiteFanOutQuery, { siteId, prompt: own.prompt!, queries: [own.keyword], track: false });
    const after = await staff.query(api.siteAngles.listTrackedFanOut, { siteId });
    expect(after.rows.map((row) => row.keyword)).toEqual(["best web designers surrey england"]);
    expect(after.tracking).toEqual({ count: 1, limit: 200 });
  });

  test("is the company's own: another company cannot read it, and a competitor shows its website's without ticks", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [["best web designers surrey england", 8]]);
    const other = await asking(t, "Other", "other.co.uk", [["best web designers surrey england", 3]]);
    const staff = await member(t, ronins.companyId);
    const outsider = await member(t, other.companyId);
    const angle = (await staff.query(api.siteAngles.listAngles, { siteId: ronins.holdId })).rows[0];
    await staff.mutation(api.siteFanOutTracking.trackSiteFanOutQuery, { siteId: ronins.holdId, prompt: angle.prompt, queries: [angle.query], track: true });

    await expect(outsider.query(api.siteAngles.listTrackedFanOut, { siteId: ronins.holdId })).rejects.toThrow();
    // The other company's own website tracks nothing of Ronins'.
    expect((await outsider.query(api.siteAngles.listTrackedFanOut, { siteId: other.holdId })).rows).toEqual([]);

    const rival = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "lightflows.co.uk", displayHost: "lightflows.co.uk", firstSeenAt: Date.now() });
      return await ctx.db.insert("companyWebsites", {
        companyId: ronins.companyId, websiteId, relationship: "TRACKED", againstWebsiteId: ronins.websiteId, createdAt: Date.now(),
      });
    });
    const compared = await staff.query(api.siteAngles.listTrackedFanOut, { siteId: rival });
    expect(compared).toMatchObject({ own: false, tracking: null });
    expect(compared.rows.map((row) => row.keyword)).toEqual(["best web designers surrey england"]);
  });
});
