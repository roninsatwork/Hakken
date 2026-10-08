import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { storedAnswer } from "@/src/test/storedAnswer";
import { ANSWER_PART_BYTES, MAX_ANSWER_BYTES, moveAnswersOffRequests, storePullAnswer, utf8Length } from "./seoPullAnswers";

/**
 * DataForSEO's answers, kept apart from the requests that bought them.
 *
 * What must hold: an answer never sits on its request, so reading requests
 * never reads answers — kept there, one company's answers came to more than a
 * function may read, and its collection could never close (2026-09-25). Each
 * is a file, its row a pointer (core-data plan §6.5, N7); the parse still
 * finds every answer, a file or rows kept before; the sweep clears them after
 * their time, files and all; and a file no request took is never left behind.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY_MS = 24 * 60 * 60 * 1000;

// Held still, so nothing a settle schedules runs behind the test.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function request(t: Harness, fields: { status: "SUBMITTED" | "READY"; resultJson?: string }) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "domain_ranked_keywords", family: "DataForSEO Labs", mode: "QUEUED", taskArgsJson: "{}",
    tag: `t-${Math.random()}`, costUsd: 0.1, sandbox: false, submittedAt: Date.now(), ...fields,
  }));
}

const answersOf = (t: Harness, pullId: Id<"seoDataPulls">) =>
  t.run(async (ctx) => await ctx.db.query("seoPullAnswers").withIndex("by_pull", (q) => q.eq("pullId", pullId)).collect());



/** What a stored file holds, or null once it has gone. */
const fileText = (t: Harness, file: Id<"_storage">) => t.run(async (ctx) => {
  const blob = await ctx.storage.get(file);
  return blob ? await blob.text() : null;
});

/** An answer as filing reads it: its file's text, or its parts joined. */
async function parsed(t: Harness, pullId: Id<"seoDataPulls">): Promise<string | null> {
  const read = await t.query(internal.seoCollectionParse.getPullForParse, { pullId });
  const answer = read?.answer ?? null;
  if (!answer) return null;
  return "parts" in answer ? answer.parts.join("") : await fileText(t, answer.file);
}

describe("an answer, kept apart from its request", () => {
  test("is stored as a file when it arrives, its row a pointer, and the parse reads it", async () => {
    const t = harness();
    const pullId = await request(t, { status: "SUBMITTED" });
    const answer = await storedAnswer(t, "{\"items\":[1,2,3]}");

    await t.mutation(internal.seoCollectionQueue.settleSeoResult, { pullId, resultFile: answer });

    const pull = await t.run(async (ctx) => await ctx.db.get(pullId));
    expect(pull).toMatchObject({ status: "READY" });
    expect(pull?.resultJson).toBeUndefined();
    expect((await answersOf(t, pullId)).map((row) => [row.file, row.bytes, row.resultJson])).toEqual([[answer.file, 17, undefined]]);
    expect(await parsed(t, pullId)).toBe("{\"items\":[1,2,3]}");
  });

  test("a file its request did not take goes — a second answer to one settled — and one an answer names stays", async () => {
    const t = harness();
    const pullId = await request(t, { status: "SUBMITTED" });
    const first = await storedAnswer(t, "[1]");
    const second = await storedAnswer(t, "[2]");

    await t.mutation(internal.seoCollectionQueue.settleSeoResult, { pullId, resultFile: first });
    // The pingback and the hourly sweep both reached it; and a retried record of the first.
    await t.mutation(internal.seoCollectionQueue.settleSeoResult, { pullId, resultFile: second });
    await t.mutation(internal.seoCollectionQueue.settleSeoResult, { pullId, resultFile: first });

    expect(await fileText(t, first.file)).toBe("[1]");
    expect(await fileText(t, second.file)).toBeNull();
  });

  test("an answer still on its request is read there until the move", async () => {
    const t = harness();
    const pullId = await request(t, { status: "READY", resultJson: "{\"old\":true}" });

    expect(await t.query(internal.seoCollectionParse.getPullForParse, { pullId })).toMatchObject({ answer: { parts: ["{\"old\":true}"] } });
  });

  test("the move takes every answer across and empties its request, and is safe to run twice", async () => {
    const t = harness();
    const carrying = await request(t, { status: "READY", resultJson: "{\"old\":true}" });
    const empty = await request(t, { status: "SUBMITTED" });

    const moveAll = async () => {
      let cursor: string | null = null;
      for (;;) {
        const batch = await t.run(async (ctx) => await moveAnswersOffRequests(ctx, cursor, 200));
        if (batch.isDone) break;
        cursor = batch.cursor;
      }
    };
    await moveAll();
    await moveAll();

    expect((await t.run(async (ctx) => await ctx.db.get(carrying)))?.resultJson).toBeUndefined();
    expect((await answersOf(t, carrying)).map((answer) => answer.resultJson)).toEqual(["{\"old\":true}"]);
    expect(await answersOf(t, empty)).toEqual([]);
    expect(await t.query(internal.seoCollectionParse.getPullForParse, { pullId: carrying })).toMatchObject({ answer: { parts: ["{\"old\":true}"] } });
  });

  test("the sweep clears answers past their days, files and all, and keeps the rest", async () => {
    const t = harness();
    const oldPull = await request(t, { status: "READY" });
    const newPull = await request(t, { status: "READY" });
    const oldFile = await storedAnswer(t, "{}");
    await t.run(async (ctx) => {
      await ctx.db.insert("seoPullAnswers", { pullId: oldPull, file: oldFile.file, bytes: 2, storedAt: Date.now() - 31 * DAY_MS });
      await ctx.db.insert("seoPullAnswers", { pullId: newPull, resultJson: "{}", storedAt: Date.now() - DAY_MS });
    });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    expect(await answersOf(t, oldPull)).toEqual([]);
    expect(await fileText(t, oldFile.file)).toBeNull();
    expect(await answersOf(t, newPull)).toHaveLength(1);
    // The request itself stays: it is the cost record.
    expect(await t.run(async (ctx) => await ctx.db.get(oldPull))).not.toBeNull();
  });
});

describe("an answer kept in rows before 2026-10-08", () => {
  const inParts = (t: Harness, pullId: Id<"seoDataPulls">, parts: string[]) => t.run(async (ctx) => {
    for (const [part, resultJson] of parts.entries()) {
      await ctx.db.insert("seoPullAnswers", { pullId, resultJson, storedAt: Date.now(), part, parts: parts.length });
    }
  });

  test("is read back in order, and replaced whole by a file", async () => {
    const t = harness();
    const pullId = await request(t, { status: "READY" });
    await inParts(t, pullId, ["[{\"a\":", "1},{\"b\"", ":2}]"]);

    expect(await t.query(internal.seoCollectionParse.getPullForParse, { pullId })).toMatchObject({
      answer: { parts: ["[{\"a\":", "1},{\"b\"", ":2}]"] },
    });

    const file = await storedAnswer(t, "{}");
    await t.run(async (ctx) => await storePullAnswer(ctx, pullId, file));
    expect((await answersOf(t, pullId)).map((row) => [row.file, row.resultJson, row.part])).toEqual([[file.file, undefined, undefined]]);
  });

  test("is moved into a file, keeping its age, and a second move changes nothing", async () => {
    const t = harness();
    const whole = await request(t, { status: "READY" });
    const split = await request(t, { status: "READY" });
    const storedAt = Date.now() - 2 * DAY_MS;
    await t.run(async (ctx) => await ctx.db.insert("seoPullAnswers", { pullId: whole, resultJson: "{\"whole\":1}", storedAt }));
    await inParts(t, split, ["[1,", "2]"]);

    await t.action(internal.seoPullAnswers.moveAnswersToFiles, {});
    const moved = await t.run(async (ctx) => await ctx.db.query("seoPullAnswers").collect());
    await t.action(internal.seoPullAnswers.moveAnswersToFiles, {});

    expect(await t.run(async (ctx) => await ctx.db.query("seoPullAnswers").collect())).toEqual(moved);
    expect(moved.map((row) => [row.resultJson, row.part, Boolean(row.file)])).toEqual([[undefined, undefined, true], [undefined, undefined, true]]);
    expect((await answersOf(t, whole))[0].storedAt).toBe(storedAt);
    expect(await parsed(t, whole)).toBe("{\"whole\":1}");
    expect(await parsed(t, split)).toBe("[1,2]");
    expect(await t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length)).toBe(2);
  });

  test("missing a part — the purge takes a few rows at a time — reads as no answer, never half of one", async () => {
    const t = harness();
    const pullId = await request(t, { status: "READY" });
    await inParts(t, pullId, ["[1,", "2,", "3]"]);

    await t.run(async (ctx) => {
      const middle = (await ctx.db.query("seoPullAnswers").withIndex("by_pull", (q) => q.eq("pullId", pullId)).collect())
        .find((row) => row.part === 1);
      await ctx.db.delete(middle!._id);
    });

    expect(await t.query(internal.seoCollectionParse.getPullForParse, { pullId })).toMatchObject({ answer: null });
  });
});

describe("a large answer, as it arrives", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubEnv("DATAFORSEO_LOGIN", "login");
    vi.stubEnv("DATAFORSEO_PASSWORD", "password");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const volumes = (count: number) => Array.from({ length: count }, (_, index) => ({
    keyword: `search number ${index} for carp tackle and bait`, location_code: 2826, language_code: "en",
    search_volume: 1_000 + index, cpc: 0.4, competition: "LOW",
    monthly_searches: Array.from({ length: 12 }, (_, month) => ({ year: 2026, month: month + 1, search_volume: 1_000 + index })),
  }));
  const answered = (result: unknown) => vi.fn(async () => Response.json({
    status_code: 20000, tasks: [{ id: "task-1", status_code: 20000, result }],
  }));
  const submitted = (t: Harness) => t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "keyword_search_volume", family: "Keywords Data", mode: "QUEUED", taskArgsJson: "{}",
    tag: "tag-1", taskId: "task-1", status: "SUBMITTED", costUsd: 0.05, sandbox: false, submittedAt: Date.now(),
  }));

  test("over a megabyte, it is kept whole and filed — it used to be dropped, paid for", async () => {
    const t = harness();
    const pullId = await submitted(t);
    const result = [{ items: volumes(3_000) }];
    const size = JSON.stringify(result).length;
    expect(size).toBeGreaterThan(2 * ANSWER_PART_BYTES);
    vi.stubGlobal("fetch", answered(result));

    await t.action(internal.seoCollectionActions.fetchSeoResult, { pullId });

    const pull = await t.run(async (ctx) => await ctx.db.get(pullId));
    expect(pull).toMatchObject({ status: "READY" });
    expect(pull?.rawTruncated).toBeUndefined();
    expect(JSON.parse((await parsed(t, pullId))!)).toEqual(result);
    const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.filter((job) => job.name.includes("parseSeoResult"))).toHaveLength(1);
  });

  test("past the ceiling, the request says so, and nothing half-kept is filed", async () => {
    const t = harness();
    const pullId = await submitted(t);
    vi.stubGlobal("fetch", answered([{ items: volumes(12_000) }]));

    await t.action(internal.seoCollectionActions.fetchSeoResult, { pullId });

    expect(await t.run(async (ctx) => await ctx.db.get(pullId))).toMatchObject({ status: "READY", rawTruncated: true });
    expect(await answersOf(t, pullId)).toEqual([]);
    const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs.filter((job) => job.name.includes("parseSeoResult"))).toHaveLength(0);
  });

  test("a list with rows left off to fit says how many on its request", async () => {
    const t = harness();
    const runId = await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "Collector", modelId: "model-test", thinkingMode: false, isActive: true,
        systemKey: "DATAFORSEO_COLLECTOR", createdAt: Date.now(), updatedAt: Date.now(),
      });
      return await ctx.db.insert("agentRuns", {
        agentId, triggerType: "MANUAL", objective: "collect", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
      });
    });
    const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "backlinks_list", family: "Backlinks", mode: "LIVE", taskArgsJson: JSON.stringify({ target: "big.co.uk" }),
      tag: "tag-links", status: "PENDING", dueAt: Date.now() - 1_000, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
    }));
    // A thousand links from addresses of four thousand characters: past what a list may take.
    const links = Array.from({ length: 1_000 }, (_, index) => ({
      domain_from: `linker-${index}.example.com`, url_from: `https://linker-${index}.example.com/${"a".repeat(4_000)}`,
      url_to: "https://big.co.uk/", domain_from_rank: 1_000 - index, dofollow: true,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      status_code: 20000,
      tasks: [{ id: "task-links", status_code: 20000, cost: 0.02, data: { tag: "tag-links" }, result: [{ total_count: 1_000, items: links }] }],
    })));

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });

    const pull = await t.run(async (ctx) => await ctx.db.get(pullId));
    expect(pull).toMatchObject({ status: "READY" });
    expect(pull?.rowsLeftOff).toBeGreaterThan(0);
    expect(pull?.rowsLeftOff).toBeLessThan(1_000);
    const text = (await parsed(t, pullId))!;
    const kept = JSON.parse(text) as Array<{ packedItems: { rows: unknown[]; dropped: number } }>;
    expect(kept[0].packedItems.rows.length + (pull?.rowsLeftOff ?? 0)).toBe(1_000);
    expect(utf8Length(text)).toBeLessThanOrEqual(MAX_ANSWER_BYTES);
  });
});
