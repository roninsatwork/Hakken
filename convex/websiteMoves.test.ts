import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * The moves: the Brief's worklist, refilled by every collection.
 *
 * The risk the plan names is a Brief that nags — the same suggestion back every
 * cycle until the page is ignored. So the behaviour worth more than the rest
 * is that **a dismissed move never returns**, and close behind it that taking
 * a move does the thing it offered, on the server, and that a move the results
 * no longer support goes away on its own.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const UK = 2826;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Super", email: `su-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now(),
    }));
  return t.withIdentity({ subject: userId });
}

async function world(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Test Agency", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", {
      host: "ourshop.com", displayHost: "ourshop.com", firstSeenAt: Date.now(),
      brandNames: [{ name: "Our Shop", isPrimary: true }],
    });
    const holdId = await ctx.db.insert("companyWebsites", {
      companyId, websiteId, relationship: "OWNED", createdAt: Date.now() - 90 * 86_400_000,
    });
    return { companyId, websiteId, holdId };
  });
}

async function askedAndNamed(
  t: Harness,
  websiteId: Id<"websites">,
  fields: { asked: number; named: number; firstAskedDay: string; othersNamed?: Array<{ websiteId: Id<"websites">; times: number; lastDay: string }> },
) {
  const prompt = "who is the best shop in town";
  return await t.run(async (ctx) => {
    const questionId = await ctx.db.insert("websiteQuestions", {
      websiteId, prompt, engines: ["chatgpt"], isActive: true, createdAt: Date.now(),
    });
    await ctx.db.insert("websiteQuestionStats", {
      websiteId, prompt, engine: "chatgpt", locationCode: UK,
      asked: fields.asked, named: fields.named, recommended: 0, warnedAgainst: 0,
      firstAskedDay: fields.firstAskedDay, lastAskedDay: today(), lastNamed: false,
      othersNamed: fields.othersNamed ?? [], updatedAt: Date.now(),
    });
    return questionId;
  });
}

const derive = (t: Harness, companyWebsiteId: Id<"companyWebsites">) =>
  t.mutation(internal.websiteMoves.deriveSiteMoves, { companyWebsiteId });
const moves = (t: Harness) => t.run(async (ctx) => await ctx.db.query("websiteMoves").collect());

describe("drawing the moves", () => {
  test("a rival the answers keep naming becomes a move, and taking it tracks the rival", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { companyId, websiteId, holdId } = await world(t);
    const rival = await t.run(async (ctx) => await ctx.db.insert("websites", {
      host: "northgate.co.uk", displayHost: "northgate.co.uk", firstSeenAt: Date.now(),
    }));
    await askedAndNamed(t, websiteId, {
      asked: 6, named: 3, firstAskedDay: daysAgo(40), othersNamed: [{ websiteId: rival, times: 4, lastDay: today() }],
    });

    await derive(t, holdId);
    const { moves: open } = await admin.query(api.websiteMoves.listSiteMoves, { companyWebsiteId: holdId });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ kind: "RIVAL", evidence: { host: "northgate.co.uk", times: 4 } });

    await admin.mutation(api.websiteMoves.actOnMove, { moveId: open[0]._id, action: "TAKE" });

    // Tracked against this site, as the company's own choice.
    const tracked = await t.run(async (ctx) => await ctx.db
      .query("companyWebsites")
      .withIndex("by_company_website", (q) => q.eq("companyId", companyId).eq("websiteId", rival))
      .first());
    expect(tracked).toMatchObject({ relationship: "TRACKED", againstWebsiteId: websiteId });
    // Held now, so the next collection has nothing to suggest about it.
    await derive(t, holdId);
    expect((await moves(t)).filter((move) => move.state === "OPEN")).toHaveLength(0);
  });

  test("a dismissed move never comes back", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    await askedAndNamed(t, websiteId, { asked: 10, named: 0, firstAskedDay: daysAgo(70) });

    await derive(t, holdId);
    const [move] = await moves(t);
    expect(move).toMatchObject({ kind: "DEAD_QUESTION", state: "OPEN" });
    await admin.mutation(api.websiteMoves.actOnMove, { moveId: move._id, action: "DISMISS" });

    for (const _cycle of [1, 2, 3]) await derive(t, holdId);

    const all = await moves(t);
    expect(all).toHaveLength(1);
    expect(all[0].state).toBe("DISMISSED");
  });

  test("taking a dead question pauses it", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    const questionId = await askedAndNamed(t, websiteId, { asked: 10, named: 0, firstAskedDay: daysAgo(70) });

    await derive(t, holdId);
    const [move] = await moves(t);
    await admin.mutation(api.websiteMoves.actOnMove, { moveId: move._id, action: "TAKE" });

    expect((await t.run(async (ctx) => await ctx.db.get(questionId)))?.isActive).toBe(false);
  });

  test("a move the results no longer support goes away on its own", async () => {
    const t = harness();
    const { websiteId, holdId } = await world(t);
    await askedAndNamed(t, websiteId, { asked: 10, named: 0, firstAskedDay: daysAgo(70) });
    await derive(t, holdId);
    expect(await moves(t)).toHaveLength(1);

    // It landed after all.
    await t.run(async (ctx) => {
      const stats = await ctx.db.query("websiteQuestionStats").first();
      await ctx.db.patch(stats!._id, { named: 6 });
    });
    await derive(t, holdId);

    expect(await moves(t)).toHaveLength(0);
  });

  test("a near-miss spelling becomes a move, and taking it adds the name", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    await t.run(async (ctx) => {
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}",
        status: "READY", tag: "t", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      } as never);
      for (const day of [daysAgo(7), daysAgo(1)]) {
        await ctx.db.insert("aiCitations", {
          prompt: "who is the best shop in town", engine: "claude", day, pullId, kind: "BRAND",
          mentionedWebsiteId: websiteId, mentionedText: "Our Shopp", variantKind: "MISSPELLING",
          position: 1, createdAt: Date.now(),
        });
      }
    });

    await derive(t, holdId);
    const [move] = await moves(t);
    expect(move).toMatchObject({ kind: "NAME", subject: "our shopp" });
    expect(JSON.parse(move.evidenceJson)).toEqual({ text: "Our Shopp", times: 2 });

    await admin.mutation(api.websiteMoves.actOnMove, { moveId: move._id, action: "TAKE" });
    const website = await t.run(async (ctx) => await ctx.db.get(websiteId));
    expect(website?.brandNames?.map((entry) => entry.name)).toEqual(["Our Shop", "Our Shopp"]);
  });

  test("a slip handled once reopens only when it slips again later", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { websiteId, holdId } = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteKeywords", { websiteId, keyword: "shop in town", isActive: true, createdAt: Date.now() });
      await ctx.db.insert("websiteSearchStats", {
        websiteId, keyword: "shop in town", locationCode: UK, firstCheckedDay: daysAgo(90),
        lastCheckedDay: daysAgo(2), lastPosition: 14, previousCheckedDay: daysAgo(9), previousPosition: 4,
        everRanked: true, updatedAt: Date.now(),
      });
    });

    await derive(t, holdId);
    const [move] = await moves(t);
    expect(move.kind).toBe("SLIPPING_SEARCH");
    await admin.mutation(api.websiteMoves.actOnMove, { moveId: move._id, action: "TAKE" });

    // The same slip, derived again: already handled.
    await derive(t, holdId);
    expect((await moves(t))[0].state).toBe("DONE");

    // A later slip is a new event.
    await t.run(async (ctx) => {
      const stats = await ctx.db.query("websiteSearchStats").first();
      await ctx.db.patch(stats!._id, {
        lastCheckedDay: daysAgo(-1), lastPosition: 30, previousCheckedDay: daysAgo(2), previousPosition: 14,
      });
    });
    await derive(t, holdId);
    expect((await moves(t))[0].state).toBe("OPEN");
  });

  test("a tracked site gets no moves of its own", async () => {
    const t = harness();
    const { companyId } = await world(t);
    const trackedHold = await t.run(async (ctx) => {
      const websiteId = await ctx.db.insert("websites", { host: "rival.com", displayHost: "rival.com", firstSeenAt: Date.now() });
      await ctx.db.insert("websiteQuestions", { websiteId, prompt: "p", engines: ["chatgpt"], isActive: true, createdAt: Date.now() });
      return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "TRACKED", createdAt: Date.now() });
    });

    expect(await derive(t, trackedHold)).toBe(0);
    expect(await moves(t)).toHaveLength(0);
  });
});

describe("when moves are drawn", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("a closing cycle draws them for each of the company's own sites", async () => {
    const t = harness();
    const { companyId, websiteId } = await world(t);
    await askedAndNamed(t, websiteId, { asked: 10, named: 0, firstAskedDay: daysAgo(70) });
    const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "SCHEDULE", status: "DONE", plannedCount: 0, reusedCount: 0, sentCount: 0,
      readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
    }));

    await t.mutation(internal.websiteMoves.deriveCycleMoves, { cycleId });
    await finishScheduled(t);

    const drawn = await moves(t);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].cycleId).toBe(cycleId);
  });

  test("the company list counts what is waiting, and removing a site takes its moves", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const { companyId, websiteId, holdId } = await world(t);
    await askedAndNamed(t, websiteId, { asked: 10, named: 0, firstAskedDay: daysAgo(70) });
    await derive(t, holdId);

    const list = await admin.query(api.websites.getCompanyWebsites, {
      companyId, paginationOpts: { numItems: 15, cursor: null },
    });
    expect(list.page[0].movesWaiting).toBe(1);

    await admin.mutation(api.websites.removeCompanyWebsite, { id: holdId });
    expect(await moves(t)).toHaveLength(0);
  });
});
