import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Missing angles on the website's to-do list (docs/plans/active/
 * fan-out-angles-plan.md, FA6): an angle no page answers becomes a move, the
 * most seen first, a few a collection; one decided never returns, and one
 * already suggested as an untracked search is that move, not a second.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-09-27";
const QUESTION = "What is the best carp fishing luggage?";

beforeEach(() => useFixedDay());
afterEach(() => vi.useRealTimers());

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Anthony", email: `a-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

/** Korda's own site asking one question, with its fan-out searches built into angles. */
async function kordaWithAngles(t: Harness, searches: Array<[string, number]>) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "korda.example", displayHost: "korda.example", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    await ctx.db.insert("websiteQuestions", { websiteId, companyWebsiteId: holdId, prompt: QUESTION, engines: ["claude"], isActive: true, createdAt: Date.now() });
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", websiteId, taskArgsJson: "{}",
      status: "READY", tag: "t-1", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    for (const [query, timesSeen] of searches) {
      await ctx.db.insert("promptFanOutQueries", {
        prompt: QUESTION, engine: "claude", query, queryText: query, timesSeen,
        firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
      });
    }
    return { companyId, websiteId, holdId };
  });
  await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: ids.holdId });
  await finishScheduled(t);
  return ids;
}

async function judge(t: Harness, holdId: Id<"companyWebsites">, verdicts: Record<string, ["NONE" | "ANSWERED" | "OFF_TOPIC", "SURE" | "NOT_SURE"]>) {
  await t.run(async (ctx) => {
    for (const [angle, [verdict, certainty]] of Object.entries(verdicts)) {
      await ctx.db.insert("fanOutPageJudgments", {
        holdId, angle, verdict, certainty, pagesStamp: "month:2026-09", judgedAt: Date.now(),
        ...(verdict === "ANSWERED" ? { page: "/knowledge/compac-luggage", url: "https://korda.example/knowledge/compac-luggage" } : {}),
      });
    }
  });
}

async function openMoves(t: Harness, holdId: Id<"companyWebsites">) {
  const admin = await superAdmin(t);
  return (await admin.query(api.websiteMoves.listSiteMoves, { companyWebsiteId: holdId })).moves;
}

const derive = (t: Harness, holdId: Id<"companyWebsites">) =>
  t.mutation(internal.websiteMoves.deriveSiteMoves, { companyWebsiteId: holdId });

describe("missing angles on the to-do list", () => {
  test("an angle no page answers, surely, becomes a move, the most seen first and three at most", async () => {
    const t = harness();
    const korda = await kordaWithAngles(t, [
      ["carp fishing luggage reviews", 3],
      ["best carp fishing luggage 2023 reviews", 2],
      ["carp rod reviews", 2],
      ["rod support system reviews", 1],
      ["best carp fishing luggage", 4],
      ["best dslr rod support system", 1],
      ["circle hooks carp", 1],
    ]);
    await judge(t, korda.holdId, {
      "carp fishing luggage review": ["NONE", "SURE"],
      "2023 best carp fishing luggage review": ["NONE", "SURE"],
      "carp review rod": ["NONE", "SURE"],
      "review rod support system": ["NONE", "SURE"],
      "best carp fishing luggage": ["ANSWERED", "SURE"],
      "best dslr rod support system": ["OFF_TOPIC", "SURE"],
      "carp circle hook": ["NONE", "NOT_SURE"],
    });

    await derive(t, korda.holdId);

    const moves = await openMoves(t, korda.holdId);
    expect(moves.filter((move) => move.kind === "MISSING_ANGLE").map((move) => move.evidence)).toEqual([
      { angle: "carp fishing luggage review", query: "carp fishing luggage reviews", timesSeen: 3, prompt: QUESTION },
      { angle: "2023 best carp fishing luggage review", query: "best carp fishing luggage 2023 reviews", timesSeen: 2, prompt: QUESTION },
      { angle: "carp review rod", query: "carp rod reviews", timesSeen: 2, prompt: QUESTION },
    ]);
  });

  test("taking one marks it done, dismissing one means it never returns, and the next takes its place", async () => {
    const t = harness();
    const korda = await kordaWithAngles(t, [["carp fishing luggage reviews", 3], ["carp rod reviews", 2], ["rod support system reviews", 1]]);
    await judge(t, korda.holdId, {
      "carp fishing luggage review": ["NONE", "SURE"],
      "carp review rod": ["NONE", "SURE"],
      "review rod support system": ["NONE", "SURE"],
    });
    const admin = await superAdmin(t);
    await admin.mutation(api.fanOutLimits.setCompanyFanOutLimits, { companyId: korda.companyId, limits: { missingAnglesSuggested: 1 } });

    await derive(t, korda.holdId);
    const [first] = await openMoves(t, korda.holdId);
    expect(first).toMatchObject({ kind: "MISSING_ANGLE", evidence: { query: "carp fishing luggage reviews" } });
    await admin.mutation(api.websiteMoves.actOnMove, { moveId: first._id, action: "DISMISS" });

    await derive(t, korda.holdId);
    const [second] = await openMoves(t, korda.holdId);
    expect(second).toMatchObject({ kind: "MISSING_ANGLE", evidence: { query: "carp rod reviews" } });
    await admin.mutation(api.websiteMoves.actOnMove, { moveId: second._id, action: "TAKE" });

    await derive(t, korda.holdId);
    expect((await openMoves(t, korda.holdId)).map((move) => move.evidence)).toEqual([
      expect.objectContaining({ query: "rod support system reviews" }),
    ]);
    const decided = await t.run(async (ctx) => (await ctx.db.query("websiteMoves").collect()).map((move) => [move.subject, move.state]).sort());
    expect(decided).toEqual([
      ["carp fishing luggage review", "DISMISSED"],
      ["carp review rod", "DONE"],
      ["review rod support system", "OPEN"],
    ]);
    // Taking it tracked nothing: the page is written by people. A prompt's
    // fan-out queries are checked every run only when ticked on its list
    // (fan-out-opt-in-plan.md), and nobody ticked one here.
    expect(await t.run(async (ctx) => await ctx.db.query("websiteKeywords").collect())).toEqual([]);
  });

  test("an angle already suggested as an untracked search is that move, not a second", async () => {
    const t = harness();
    const korda = await kordaWithAngles(t, [["top rated carp fishing luggage", 2]]);
    await judge(t, korda.holdId, { "carp fishing luggage rated top": ["NONE", "SURE"] });
    await t.run(async (ctx) => await ctx.db.insert("seoKeywordIntents", { keyword: "top rated carp fishing luggage", intent: "BUYING", judgedAt: Date.now() }));
    // Untracked though listed: a website at its tracked keywords limit (fanOutLimits.ts) takes no more.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("websiteKeywords").collect()) await ctx.db.delete(row._id);
    });

    await derive(t, korda.holdId);

    expect((await openMoves(t, korda.holdId)).map((move) => move.kind)).toEqual(["UNTRACKED_SEARCH"]);
  });
});
