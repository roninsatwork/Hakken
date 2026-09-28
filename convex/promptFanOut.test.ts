import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * One prompt's fan-out queries (docs/plans/active/prompt-fan-out-queries-plan.md),
 * opt-in (fan-out-opt-in-plan.md): every search the AIs run is listed and
 * checked on Google once; only the ticked ones are checked every run, up to
 * the website's limit for them. The company's own added on top, words edited,
 * and a delete that never comes back on its own. Always the company's own
 * prompt, through its own website.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-09-27";
const PROMPT = "who are the best web designers in Surrey, England";
const DAILY = JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: "09:00", timezone: "UTC" });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Anthony", email: `a-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

/** A company with one website of its own, asking one prompt of Claude, with the fan-out queries given. */
async function asking(t: Harness, name: string, host: string, fanOuts: Array<[string, number]>) {
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name, createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: Date.now() });
    const questionId = await ctx.db.insert("websiteQuestions", {
      websiteId, companyWebsiteId: holdId, prompt: PROMPT, engines: ["claude"], isActive: true, createdAt: Date.now(),
    });
    return { companyId, websiteId, holdId, questionId };
  });
  await ran(t, fanOuts);
  await rebuild(t, ids.holdId);
  return ids;
}

/** The fan-out queries Claude ran for the prompt, as a collection files them. */
async function ran(t: Harness, fanOuts: Array<[string, number]>) {
  await t.run(async (ctx) => {
    const pullId = await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}",
      status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    } as never);
    for (const [query, timesSeen] of fanOuts) {
      const held = await ctx.db
        .query("promptFanOutQueries")
        .withIndex("by_prompt_engine_place_query", (q) => q.eq("prompt", PROMPT).eq("engine", "claude").eq("place", undefined).eq("query", query))
        .unique();
      if (held) await ctx.db.patch(held._id, { timesSeen });
      else await ctx.db.insert("promptFanOutQueries", {
        prompt: PROMPT, engine: "claude", query, queryText: query, timesSeen, firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
      });
    }
  });
}

/** A collection's end: a minute on, so this rebuild's rows are newer than the last one's, as they always are. */
async function rebuild(t: Harness, holdId: Id<"companyWebsites">) {
  vi.setSystemTime(Date.now() + 60_000);
  await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId });
  await finishScheduled(t);
}

/** The company's tracked searches for the website: [phrase, checked every run, how it came]. */
const tracked = (t: Harness, holdId: Id<"companyWebsites">) =>
  t.run(async (ctx) => (await ctx.db.query("websiteKeywords").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).collect())
    .map((row) => [row.keyword, row.isActive, row.addedFrom]));

/** The website's first checks, A to Z: [query, bought, filed on]. */
const firstChecks = (t: Harness, holdId: Id<"companyWebsites">) =>
  t.run(async (ctx) => (await ctx.db.query("fanOutFirstChecks").withIndex("by_hold_query", (q) => q.eq("holdId", holdId)).collect())
    .map((row) => [row.query, row.pullId !== undefined, row.checkedDay ?? null]));

describe("a prompt's fan-out queries", () => {
  test("every one the AIs run is listed unticked with one first check to come; the company's own arrives ticked; nobody else's prompt", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers surrey england", 8],
      ["award winning web design surrey england", 2],
      ["top web design companies surrey england", 1],
    ]);
    const other = await asking(t, "Other", "other.example", []);
    const admin = await superAdmin(t);
    const args = { companyId: ronins.companyId, questionId: ronins.questionId };

    const before = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(before.question).toMatchObject({ prompt: PROMPT, host: "ronins.co.uk", engines: ["claude"], isActive: true });
    expect(before.rows.map((row) => [row.queryText, row.own, row.ticked, row.timesSeen])).toEqual([
      ["best web designers surrey england", false, false, 8],
      ["award winning web design surrey england", false, false, 2],
      ["top web design companies surrey england", false, false, 1],
    ]);
    expect(before.ticked).toEqual({ count: 0, limit: 200 });
    // Nothing is checked every run until it is ticked; each is checked once.
    expect(await tracked(t, ronins.holdId)).toEqual([]);
    expect(await firstChecks(t, ronins.holdId)).toEqual([
      ["award winning web design surrey england", false, null],
      ["best web designers surrey england", false, null],
      ["top web design companies surrey england", false, null],
    ]);

    expect(await admin.mutation(api.promptFanOut.addPromptFanOutQuery, { ...args, queryText: "Web design agency  Guildford" })).toEqual({ ticked: true });
    const after = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(after.rows[0]).toEqual({ query: "web design agency guildford", queryText: "Web design agency Guildford", own: true, ticked: true, timesSeen: null });
    expect(after.ticked).toEqual({ count: 1, limit: 200 });
    expect(await tracked(t, ronins.holdId)).toEqual([["web design agency guildford", true, "AI_SEARCH"]]);
    // The same words twice are one fan-out query.
    await expect(admin.mutation(api.promptFanOut.addPromptFanOutQuery, { ...args, queryText: "best web designers Surrey England" }))
      .rejects.toThrow(/already on this prompt's list/);

    // Another company's prompt is not this company's to read or change.
    await expect(admin.query(api.promptFanOut.getPromptFanOut, { companyId: ronins.companyId, questionId: other.questionId }))
      .rejects.toThrow(/not one of this company's/);
    await expect(admin.mutation(api.promptFanOut.setPromptFanOutQueryTicked, {
      companyId: ronins.companyId, questionId: other.questionId, queryText: "anything", ticked: true,
    })).rejects.toThrow(/not one of this company's/);
  });

  test("ticking puts one on Tracked keywords, within the website's limit — typed-in keywords don't count — and Tracked keywords can untick it", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers surrey england", 8],
      ["award winning web design surrey england", 2],
    ]);
    const admin = await superAdmin(t);
    const args = { companyId: ronins.companyId, questionId: ronins.questionId };
    await admin.mutation(api.fanOutLimits.setSiteFanOutLimits, { companyWebsiteId: ronins.holdId, limits: { fanOutTrackedPerSite: 50 } });
    // 49 ticked on the website's other prompts, and 3 typed in on Tracked keywords.
    await t.run(async (ctx) => {
      for (let index = 0; index < 52; index += 1) {
        await ctx.db.insert("websiteKeywords", {
          websiteId: ronins.websiteId, companyWebsiteId: ronins.holdId, keyword: `search ${index}`, isActive: true, createdAt: Date.now(),
          addedFrom: index < 49 ? "AI_SEARCH" : "HAND",
        });
      }
    });
    const tick = (queryText: string, ticked = true) => admin.mutation(api.promptFanOut.setPromptFanOutQueryTicked, { ...args, queryText, ticked });

    await tick("best web designers surrey england");
    expect((await admin.query(api.promptFanOut.getPromptFanOut, args)).ticked).toEqual({ count: 50, limit: 50 });
    await expect(tick("award winning web design surrey england"))
      .rejects.toThrow(/ronins\.co\.uk already checks 50 fan-out queries every run: its limit in Limits/);

    // Unticked: off Tracked keywords, still listed, and its one first check to come.
    await tick("best web designers surrey england", false);
    expect(await tracked(t, ronins.holdId)).not.toContainEqual(expect.arrayContaining(["best web designers surrey england"]));
    expect(await firstChecks(t, ronins.holdId)).toContainEqual(["best web designers surrey england", false, null]);
    await tick("award winning web design surrey england");

    // Paused on Tracked keywords: unticked here. Resumed there, it meets the same limit.
    const keywordId = await t.run(async (ctx) => (await ctx.db
      .query("websiteKeywords")
      .withIndex("by_hold_keyword", (q) => q.eq("companyWebsiteId", ronins.holdId).eq("keyword", "award winning web design surrey england"))
      .unique())!._id);
    await admin.mutation(api.websiteCanonical.setWebsiteKeywordActive, { keywordId, isActive: false });
    let read = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(read.rows.map((row) => [row.query, row.ticked])).toEqual([
      ["best web designers surrey england", false],
      ["award winning web design surrey england", false],
    ]);
    await tick("best web designers surrey england");
    await expect(admin.mutation(api.websiteCanonical.setWebsiteKeywordActive, { keywordId, isActive: true })).rejects.toThrow(/its limit in Limits/);

    // Removed on Tracked keywords: unticked, and still on the prompt's list.
    const best = await t.run(async (ctx) => (await ctx.db
      .query("websiteKeywords")
      .withIndex("by_hold_keyword", (q) => q.eq("companyWebsiteId", ronins.holdId).eq("keyword", "best web designers surrey england"))
      .unique())!._id);
    await admin.mutation(api.websiteCanonical.removeWebsiteKeyword, { keywordId: best });
    await finishScheduled(t);
    read = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(read.rows.map((row) => [row.query, row.ticked])).toEqual([
      ["best web designers surrey england", false],
      ["award winning web design surrey england", false],
    ]);
    expect(await firstChecks(t, ronins.holdId)).toContainEqual(["best web designers surrey england", false, null]);
  });

  test("a deleted one is off the list for good — unticked, and no first check — until the delete is undone, ticked again as it was", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers surrey england", 8],
      ["award winning web design surrey england", 2],
    ]);
    const admin = await superAdmin(t);
    const args = { companyId: ronins.companyId, questionId: ronins.questionId };
    await admin.mutation(api.promptFanOut.setPromptFanOutQueryTicked, { ...args, queryText: "award winning web design surrey england", ticked: true });

    expect(await admin.mutation(api.promptFanOut.removePromptFanOutQuery, { ...args, queryText: "award winning web design surrey england" }))
      .toEqual({ wasTicked: true });
    let read = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(read.rows.map((row) => row.query)).toEqual(["best web designers surrey england"]);
    expect(await tracked(t, ronins.holdId)).toEqual([]);
    expect(await firstChecks(t, ronins.holdId)).toEqual([["best web designers surrey england", false, null]]);

    // The next collection: Claude runs it again. It stays gone — here, on AI searches and in the count.
    await ran(t, [["award winning web design surrey england", 3]]);
    await rebuild(t, ronins.holdId);
    read = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(read.rows.map((row) => row.query)).toEqual(["best web designers surrey england"]);
    expect(await firstChecks(t, ronins.holdId)).toEqual([["best web designers surrey england", false, null]]);
    const searches = await admin.query(api.companyAiLists.listCompanyFanOut, { companyId: ronins.companyId, page: 1, pageSize: 15 });
    expect(searches.data.map((row) => row.query)).toEqual(["best web designers surrey england"]);
    const prompts = await admin.query(api.companyAiLists.listCompanyQuestions, { companyId: ronins.companyId, page: 1, pageSize: 15 });
    expect(prompts.data.map((row) => [row.fanOutSearches, row.fanOutTicked])).toEqual([[1, 0]]);

    // Undo: back on the list, and ticked again, as it was.
    vi.setSystemTime(Date.now() + 60_000);
    expect(await admin.mutation(api.promptFanOut.restorePromptFanOutQuery, { ...args, queryText: "award winning web design surrey england", ticked: true }))
      .toEqual({ ticked: true });
    await finishScheduled(t);
    read = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(read.rows.map((row) => [row.query, row.ticked])).toEqual([
      ["best web designers surrey england", false],
      ["award winning web design surrey england", true],
    ]);
    expect(await tracked(t, ronins.holdId)).toEqual([["award winning web design surrey england", true, "AI_SEARCH"]]);
  });

  test("an edit keeps the tick: the new words ticked if the old were, else their own first check; the AI's original stays off the list", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers in surrey england 2023", 2],
      ["web design surrey 2023", 1],
    ]);
    const admin = await superAdmin(t);
    const args = { companyId: ronins.companyId, questionId: ronins.questionId };
    await admin.mutation(api.promptFanOut.setPromptFanOutQueryTicked, { ...args, queryText: "best web designers in surrey england 2023", ticked: true });

    await admin.mutation(api.promptFanOut.editPromptFanOutQuery, {
      ...args, from: "best web designers in surrey england 2023", queryText: "best web designers in Surrey England 2026",
    });
    await admin.mutation(api.promptFanOut.editPromptFanOutQuery, { ...args, from: "web design surrey 2023", queryText: "web design Surrey 2026" });
    await rebuild(t, ronins.holdId);

    const read = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(read.rows.map((row) => [row.queryText, row.own, row.ticked]).sort()).toEqual([
      ["best web designers in Surrey England 2026", true, true],
      ["web design Surrey 2026", true, false],
    ]);
    expect(await tracked(t, ronins.holdId)).toEqual([["best web designers in surrey england 2026", true, "AI_SEARCH"]]);
    expect(await firstChecks(t, ronins.holdId)).toEqual([["web design surrey 2026", false, null]]);
  });

  test("the first check: planned once for each unticked query, filed as not found when the site is not on the page, bought again only after a failure", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers surrey england", 8],
      ["award winning web design surrey england", 2],
      ["top web design companies surrey england", 1],
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("schedules", { name: "Collection", companyId: ronins.companyId, intervalStr: DAILY, isActive: true, createdAt: Date.now() } as never);
    });
    const admin = await superAdmin(t);
    const args = { companyId: ronins.companyId, questionId: ronins.questionId };
    await admin.mutation(api.promptFanOut.setPromptFanOutQueryTicked, { ...args, queryText: "top web design companies surrey england", ticked: true });
    // One left over from a list it is no longer on: never bought, and cleared.
    await t.run(async (ctx) => await ctx.db.insert("fanOutFirstChecks", {
      holdId: ronins.holdId, websiteId: ronins.websiteId, query: "a query no list has", locationCode: 2826, createdAt: Date.now(),
    }));

    /** A collection run: the Google checks it planned, by search. */
    const collect = async () => {
      const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
        companyId: ronins.companyId, trigger: "MANUAL", status: "EXPANDING", plannedCount: 0, reusedCount: 0, sentCount: 0,
        readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
      }));
      await t.mutation(internal.seoCollection.expandSeoCycle, { cycleId });
      return new Map(await t.run(async (ctx) => {
        const lines = await ctx.db.query("seoCycleLines").withIndex("by_cycle", (q) => q.eq("cycleId", cycleId)).collect();
        const pulls = await Promise.all(lines.map((line) => ctx.db.get(line.pullId)));
        return pulls.flatMap((pull) => pull?.operationId === "serp_google_organic"
          ? [[JSON.parse(pull.taskArgsJson).keyword as string, pull._id] as [string, Id<"seoDataPulls">]]
          : []);
      }));
    };

    const first = await collect();
    // The ticked one every run; the other two once each.
    expect([...first.keys()].sort()).toEqual([
      "award winning web design surrey england",
      "best web designers surrey england",
      "top web design companies surrey england",
    ]);
    expect(await firstChecks(t, ronins.holdId)).toEqual([
      ["award winning web design surrey england", true, null],
      ["best web designers surrey england", true, null],
    ]);

    // One comes back without the site on the page: filed as checked, not found. The other fails.
    await t.mutation(internal.seoKeywordChecks.writeKeywordCheck, {
      pullId: first.get("best web designers surrey england")!, keyword: "best web designers surrey england", day: DAY, found: [],
    });
    await t.run(async (ctx) => await ctx.db.patch(first.get("award winning web design surrey england")!, { status: "FAILED" }));
    expect(await firstChecks(t, ronins.holdId)).toEqual([
      ["award winning web design surrey england", true, null],
      ["best web designers surrey england", true, DAY],
    ]);
    const searches = await admin.query(api.companyAiLists.listCompanyFanOut, { companyId: ronins.companyId, page: 1, pageSize: 15 });
    expect(searches.data.map((row) => [row.query, row.google])).toContainEqual(["best web designers surrey england", { position: null, day: DAY }]);

    // The next day: the ticked one again, the failed one again, and the first-checked one never.
    vi.setSystemTime(Date.now() + 86_400_000);
    expect([...(await collect()).keys()].sort()).toEqual([
      "award winning web design surrey england",
      "top web design companies surrey england",
    ]);
  });

  test("the migration takes off Tracked keywords only the fan-out queries no person put there, and gives each its first check", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers surrey england", 8],
      ["award winning web design surrey england", 2],
    ]);
    const admin = await superAdmin(t);
    const userId = await t.run(async (ctx) => (await ctx.db.query("users").first())!._id);
    // As the lists' automatic tracking left them, beside one a person tracked and one typed in.
    await t.run(async (ctx) => {
      for (const [keyword, addedFrom, actorId] of [
        ["best web designers surrey england", "AI_SEARCH", undefined],
        ["award winning web design surrey england", "AI_SEARCH", userId],
        ["web designers guildford", "HAND", userId],
      ] as const) {
        const keywordId = await ctx.db.insert("websiteKeywords", {
          websiteId: ronins.websiteId, companyWebsiteId: ronins.holdId, keyword, isActive: true, createdAt: Date.now(), addedFrom,
        });
        await ctx.db.insert("auditLogs", {
          actorId, actionType: "ADD_WEBSITE_KEYWORD", entityId: keywordId, entityType: "websiteKeywords", metadata: "{}", timestamp: Date.now(),
        });
      }
      for (const row of await ctx.db.query("fanOutFirstChecks").collect()) await ctx.db.delete(row._id);
    });

    await t.mutation(internal.dataMigrations.run, { name: "2026-09-28-untick-fan-out-queries" });
    await finishScheduled(t);

    expect(await tracked(t, ronins.holdId)).toEqual([
      ["award winning web design surrey england", true, "AI_SEARCH"],
      ["web designers guildford", true, "HAND"],
    ]);
    expect(await firstChecks(t, ronins.holdId)).toEqual([["best web designers surrey england", false, null]]);
    const read = await admin.query(api.promptFanOut.getPromptFanOut, { companyId: ronins.companyId, questionId: ronins.questionId });
    expect(read.rows.map((row) => [row.query, row.ticked])).toEqual([
      ["best web designers surrey england", false],
      ["award winning web design surrey england", true],
    ]);
  });

  test("Generate asks each assistant the prompt now, reuses an answer bought today, and is refused while collection is off", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", []);
    const admin = await superAdmin(t);
    const args = { companyId: ronins.companyId, questionId: ronins.questionId };

    await expect(admin.mutation(api.promptFanOut.generatePromptFanOut, args)).rejects.toThrow(/switched off for Ronins/);

    const collectorId = await t.run(async (ctx) => {
      await ctx.db.patch(ronins.questionId, { engines: ["chatgpt", "claude"] });
      const userId = await ctx.db.insert("users", { name: "Super", email: "su@test.com", role: "SUPER_ADMIN" as const, createdAt: Date.now() });
      await ctx.db.insert("schedules", {
        name: "SEO data — Ronins", companyId: ronins.companyId, intervalStr: "monthly", isActive: true, createdAt: Date.now(), createdBy: userId,
      });
      return await ctx.db.insert("agents", {
        name: "Agent Collector", modelId: "model-test", thinkingMode: false, isActive: true, systemKey: "DATAFORSEO_COLLECTOR",
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    });

    expect(await admin.mutation(api.promptFanOut.generatePromptFanOut, args)).toEqual({ asked: 2, reused: 0, sending: true });
    const pulls = await t.run(async (ctx) => await ctx.db.query("seoDataPulls").withIndex("by_status_due", (q) => q.eq("status", "PENDING")).collect());
    // One answer from each assistant, outside any collection, sent by the Collector now.
    expect(pulls.map((pull) => [pull.operationId, pull.cycleId ?? null, JSON.parse(pull.taskArgsJson ?? "{}").user_prompt])).toEqual(
      expect.arrayContaining([["ai_citation_chatgpt", null, PROMPT], ["ai_citation_claude", null, PROMPT]]),
    );
    const runs = await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect()).filter((run) => run.agentId === collectorId));
    expect(runs.map((run) => run.title)).toEqual(["Generate fan-out queries — Ronins"]);

    // The same day again: the same answers, nothing bought twice.
    await t.run(async (ctx) => {
      for (const pull of pulls) await ctx.db.patch(pull._id, { status: "READY" });
    });
    expect(await admin.mutation(api.promptFanOut.generatePromptFanOut, args)).toEqual({ asked: 0, reused: 2, sending: false });
    const read = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(read.generating).toMatchObject({ waiting: 0, failed: 0, asked: 2 });
  });

  test("editing a prompt's words keeps its place, assistants and state; its old words' choices and first checks not yet bought go, and it starts fresh", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers surrey england", 8],
      ["award winning web design surrey england", 2],
    ]);
    const admin = await superAdmin(t);
    const args = { companyId: ronins.companyId, questionId: ronins.questionId };
    const second = await admin.mutation(api.websiteCanonical.addWebsiteQuestion, {
      companyWebsiteId: ronins.holdId, prompt: "who builds the best websites in Leeds", engines: ["claude"],
    });
    await admin.mutation(api.promptFanOut.addPromptFanOutQuery, { ...args, queryText: "web designers woking" });
    await admin.mutation(api.websiteCanonical.setWebsiteQuestionActive, { questionId: ronins.questionId, isActive: false });

    // The same words as another of the website's questions: refused.
    await expect(admin.mutation(api.websiteCanonical.editWebsiteQuestion, { questionId: ronins.questionId, prompt: "Who builds the best websites in Leeds" }))
      .rejects.toThrow(/already asked for this website/);

    await admin.mutation(api.websiteCanonical.editWebsiteQuestion, { questionId: ronins.questionId, prompt: "who are the best web designers in  Surrey, UK" });
    await finishScheduled(t);

    const questions = await t.run(async (ctx) => await ctx.db.query("websiteQuestions").withIndex("by_hold", (q) => q.eq("companyWebsiteId", ronins.holdId)).collect());
    expect(questions.map((row) => [row._id, row.prompt, row.engines, row.isActive])).toEqual([
      [ronins.questionId, "who are the best web designers in Surrey, UK", ["claude"], false],
      [second, "who builds the best websites in Leeds", ["claude"], true],
    ]);
    // The new words start fresh: no fan-out queries until the AIs are asked them.
    const read = await admin.query(api.promptFanOut.getPromptFanOut, args);
    expect(read.rows).toEqual([]);
    // What the company chose for the old words went, and so did their first checks not yet bought.
    expect(await t.run(async (ctx) => await ctx.db.query("fanOutQueryChoices").collect())).toEqual([]);
    expect(await firstChecks(t, ronins.holdId)).toEqual([]);
    // Its own, ticked, stays on Tracked keywords: checked every run until unticked there.
    expect(await tracked(t, ronins.holdId)).toEqual([["web designers woking", true, "AI_SEARCH"]]);
    const edits = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).filter((row) => row.actionType === "EDIT_WEBSITE_QUESTION"));
    expect(edits.map((row) => JSON.parse(row.metadata ?? "{}"))).toEqual([
      expect.objectContaining({ from: PROMPT, to: "who are the best web designers in Surrey, UK" }),
    ]);
  });

  test("removing the prompt takes its choices with it, and the first checks not yet bought for its queries", async () => {
    const t = harness();
    const ronins = await asking(t, "Ronins", "ronins.co.uk", [
      ["best web designers surrey england", 8],
      ["award winning web design surrey england", 2],
    ]);
    const admin = await superAdmin(t);
    const args = { companyId: ronins.companyId, questionId: ronins.questionId };
    await admin.mutation(api.promptFanOut.removePromptFanOutQuery, { ...args, queryText: "best web designers surrey england" });
    await admin.mutation(api.promptFanOut.addPromptFanOutQuery, { ...args, queryText: "web designers woking" });
    await admin.mutation(api.promptFanOut.setPromptFanOutQueryTicked, { ...args, queryText: "web designers woking", ticked: false });
    expect(await firstChecks(t, ronins.holdId)).toEqual([
      ["award winning web design surrey england", false, null],
      ["web designers woking", false, null],
    ]);

    await admin.mutation(api.websiteCanonical.removeWebsiteQuestion, { questionId: ronins.questionId });
    await finishScheduled(t);

    expect(await t.run(async (ctx) => await ctx.db.query("fanOutQueryChoices").collect())).toEqual([]);
    expect(await firstChecks(t, ronins.holdId)).toEqual([]);
  });
});
