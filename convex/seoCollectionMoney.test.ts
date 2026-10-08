import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { storedAnswer } from "@/src/test/storedAnswer";
import { RESULT_GAVE_UP, RETRY_RUN_ENDED, SEND_UNCERTAIN } from "./seoCollectionQueue";
import { dataForSeoCodeKind } from "./dataForSeoRest";
import { reusableByKey } from "./seoCollection";
import { finishScheduledInOrder } from "@/src/test/finishScheduled";

/**
 * The collection's money rules, against a stand-in for DataForSEO.
 *
 * What must hold (collection reliability plan, Stage 1, 2026-09-25): a
 * request DataForSEO may have taken is never sent again; a paid answer is
 * never thrown away while it is still coming; "not now" and a refused account
 * count no try and fail nothing; only one Collector sends at a time; and every
 * request is counted once.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;


beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubEnv("DATAFORSEO_LOGIN", "login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "password");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function collector(t: Harness, maxCostUsd?: number) {
  return await t.run(async (ctx) => {
    const agentId = await ctx.db.insert("agents", {
      name: "Collector", modelId: "model-test", thinkingMode: false, isActive: true,
      systemKey: "DATAFORSEO_COLLECTOR", createdAt: Date.now(), updatedAt: Date.now(),
      ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
    });
    const runId = await ctx.db.insert("agentRuns", {
      agentId, triggerType: "MANUAL", objective: "collect", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
    });
    return { agentId, runId };
  });
}

async function request(
  t: Harness,
  fields: Partial<{
    operationId: string;
    mode: "LIVE" | "QUEUED";
    status: "PENDING" | "CLAIMED" | "SUBMITTED" | "READY" | "FAILED";
    taskId: string;
    tag: string;
    error: string;
    cycleId: Id<"seoCollectionCycles">;
    postedAt: number;
    claimedAt: number;
  }> = {},
) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: fields.operationId ?? "backlinks_summary",
    family: "Backlinks",
    mode: fields.mode ?? "LIVE",
    taskArgsJson: JSON.stringify({ target: "kordatackle.com" }),
    status: fields.status ?? "PENDING",
    tag: fields.tag ?? `tag-${Math.random()}`,
    dueAt: Date.now() - 1000,
    attempts: 0,
    costUsd: 0,
    sandbox: false,
    submittedAt: Date.now(),
    ...(fields.taskId ? { taskId: fields.taskId } : {}),
    ...(fields.error ? { error: fields.error } : {}),
    ...(fields.cycleId ? { cycleId: fields.cycleId } : {}),
    ...(fields.postedAt !== undefined ? { postedAt: fields.postedAt, claimedBy: "gone" } : {}),
    ...(fields.claimedAt !== undefined ? { claimedAt: fields.claimedAt, claimedBy: "gone" } : {}),
  }));
}

const get = (t: Harness, id: Id<"seoDataPulls">) => t.run(async (ctx) => await ctx.db.get(id));
const scheduled = (t: Harness) => t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name));

describe("sending", () => {
  test("a live call that times out is failed, never sent again — it may have been charged", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const pullId = await request(t);
    const fetchSpy = vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); });
    vi.stubGlobal("fetch", fetchSpy);

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const pull = await get(t, pullId);
    expect(pull).toMatchObject({ status: "FAILED", attempts: 0 });
    expect(pull?.error?.startsWith(SEND_UNCERTAIN)).toBe(true);
  });

  test("a refused account stops the Collector, takes nothing and counts no try", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const pullId = await request(t);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { status_code: 40210, status_message: "insufficient funds. your account's balance is too low." },
    )));

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });

    expect(await get(t, pullId)).toMatchObject({ status: "PENDING", attempts: 0 });
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run?.finalOutput).toMatch(/refused the account/);
    expect(run?.finalOutput).toMatch(/insufficient funds/);
  });

  test("a task the reply does not mention is failed, not sent again", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const pullId = await request(t);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status_code: 20000, tasks: [] })));

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });

    const pull = await get(t, pullId);
    expect(pull?.status).toBe("FAILED");
    expect(pull?.error?.startsWith(SEND_UNCERTAIN)).toBe(true);
  });

  test("an answered live call is recorded, stored apart, and filed once from inside the record", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const pullId = await request(t);
    const tag = (await get(t, pullId))!.tag;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      status_code: 20000,
      tasks: [{ id: "task-1", status_code: 20000, cost: 0.02, data: { tag }, result: [{ backlinks: 12 }] }],
    })));

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });

    expect(await get(t, pullId)).toMatchObject({ status: "READY", taskId: "task-1", costUsd: 0.02 });
    const answers = await t.run(async (ctx) => await ctx.db.query("seoPullAnswers").collect());
    expect(answers.map((answer) => answer.pullId)).toEqual([pullId]);
    expect((await scheduled(t)).filter((name) => name.includes("parseSeoResult"))).toHaveLength(1);
  });

  test("live requests go five at once, each its own request", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const pulls = [await request(t), await request(t), await request(t)];
    const tags = await Promise.all(pulls.map(async (id) => (await get(t, id))!.tag));
    const bodies: unknown[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const tasks = JSON.parse(init.body) as Array<{ tag: string }>;
      bodies.push(tasks);
      return Response.json({
        status_code: 20000,
        tasks: tasks.map((task) => ({ id: `task-${task.tag}`, status_code: 20000, cost: 0.01, data: { tag: task.tag }, result: [{ n: 1 }] })),
      });
    }));

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });

    // One task a request — a live endpoint refuses more — and all three sent.
    expect(bodies.map((tasks) => tasks.length)).toEqual([1, 1, 1]);
    expect(new Set(bodies.map((tasks) => (tasks[0] as { tag: string }).tag))).toEqual(new Set(tags));
    for (const id of pulls) expect(await get(t, id)).toMatchObject({ status: "READY", costUsd: 0.01 });
  });

  test("a rate limit puts the batch back without counting a try", async () => {
    const t = harness();
    const pullId = await request(t, { status: "CLAIMED" });

    await t.mutation(internal.seoCollectionQueue.releaseSeoBatch, {
      pullIds: [pullId], attempt: 0, reason: "DataForSEO replied 429", countAttempt: false,
    });

    expect(await get(t, pullId)).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  test("a batch never spends past what is left of today's ceiling", async () => {
    const t = harness();
    const { agentId, runId } = await collector(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(agentId, { maxDailyCostUsd: 1 });
      await ctx.db.patch(runId, { costUsd: 0.9 });
      await ctx.db.insert("seoOperationCosts", {
        operationId: "serp_google_organic", charged: 10, totalUsd: 0.5, lastUsd: 0.05, updatedAt: Date.now(),
      });
    });
    for (let i = 0; i < 10; i++) await request(t, { operationId: "serp_google_organic", mode: "QUEUED" });

    const claim = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "w", runId });

    // $0.10 left at $0.05 each.
    expect(claim.pulls).toHaveLength(2);
  });
});

/**
 * DataForSEO's own supplier refusing — Google, over its limit for DataForSEO,
 * refused all ten of Ronins' questions to its engine on 2026-09-29, and each
 * was failed at once. Now asked again slowly, inside the same Collector run.
 */
describe("a supplier's refusal", () => {
  const SUPPLIER_REFUSAL = "3rd Party API Service Unavailable (rate_limit_exceeded).";
  const refusal = (tag: string, cost = 0) => Response.json({
    status_code: 20000,
    tasks: [{ id: `task-${Math.random()}`, status_code: 50301, status_message: SUPPLIER_REFUSAL, cost, data: { tag } }],
  });

  test("is DataForSEO's 50301, 50302 or 50303, and nothing else", () => {
    expect([50301, 50302, 50303].map(dataForSeoCodeKind)).toEqual(["SUPPLIER_BUSY", "SUPPLIER_BUSY", "SUPPLIER_BUSY"]);
    expect(dataForSeoCodeKind(50000)).toBe("REFUSED");
    expect(dataForSeoCodeKind(40202)).toBe("RATE_LIMITED");
  });

  test("at no charge is asked again after a minute, two, then three, and then failed", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const pullId = await request(t);
    const tag = (await get(t, pullId))!.tag;
    const sentAt: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      sentAt.push(Date.now());
      return refusal(tag);
    }));

    // Each ask again is a step of the run booked for when it comes due, so
    // the steps run one at a time in the order they are due, the clock moving
    // only between them — never past a step's watch while it runs.
    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });
    await finishScheduledInOrder(t);

    expect(sentAt).toHaveLength(4);
    expect(sentAt.slice(1).map((at, index) => Math.round((at - sentAt[index]) / 60_000))).toEqual([1, 2, 3]);
    const pull = await get(t, pullId);
    expect(pull).toMatchObject({ status: "FAILED", attempts: 4, costUsd: 0 });
    expect(pull?.error).toBe(`${SUPPLIER_REFUSAL} Asked 4 times in this run; the next run asks again.`);
    expect(pull?.retryUntil).toBeUndefined();
  });

  test("that was charged is failed at once, never bought twice", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const pullId = await request(t);
    const tag = (await get(t, pullId))!.tag;
    const fetchSpy = vi.fn(async () => refusal(tag, 0.01));
    vi.stubGlobal("fetch", fetchSpy);

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await get(t, pullId)).toMatchObject({ status: "FAILED", costUsd: 0.01, error: SUPPLIER_REFUSAL });
  });

  test("is failed at once when the run cannot wait for the next try", async () => {
    const t = harness();
    const waiting = await request(t, { status: "CLAIMED" });
    const endingNow = await request(t, { status: "CLAIMED" });

    await t.mutation(internal.seoSupplierRetry.retrySupplierRefusals, {
      pullIds: [waiting], reason: SUPPLIER_REFUSAL, retryUntil: Date.now() + 7 * 60_000,
    });
    await t.mutation(internal.seoSupplierRetry.retrySupplierRefusals, {
      pullIds: [endingNow], reason: SUPPLIER_REFUSAL, retryUntil: Date.now() + 30_000,
    });

    const put = await get(t, waiting);
    expect(put).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(put!.dueAt! - Date.now()).toBeGreaterThan(55_000);
    expect(put!.retryUntil).toBeDefined();
    expect(await get(t, endingNow)).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  test("left waiting by a run that stopped early is failed by the next, never sent", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const pullId = await request(t);
    await t.run(async (ctx) => { await ctx.db.patch(pullId, { attempts: 1, retryUntil: Date.now() - 1_000 }); });

    const claim = await t.mutation(internal.seoCollectionQueue.claimSeoBatch, { workerId: "w", runId });

    expect(claim.pulls).toEqual([]);
    expect(await get(t, pullId)).toMatchObject({ status: "FAILED", error: RETRY_RUN_ENDED });
  });

  test("that cost nothing is asked again the same day; one that was paid for is not", async () => {
    const t = harness();
    const failed = (idempotencyKey: string, costUsd: number) => t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "ai_citation_chatgpt", family: "AI", mode: "LIVE", taskArgsJson: "{}", status: "FAILED",
      tag: idempotencyKey, idempotencyKey, taskId: "task-refused", attempts: 4, costUsd, sandbox: false,
      error: SUPPLIER_REFUSAL, submittedAt: Date.now(), completedAt: Date.now(),
    }));
    const free = await failed("free-today", 0);
    const paid = await failed("paid-today", 0.02);

    const reopened = await t.run(async (ctx) => await reusableByKey(ctx, "free-today"));
    const kept = await t.run(async (ctx) => await reusableByKey(ctx, "paid-today"));

    expect(reopened?._id).toBe(free);
    expect(await get(t, free)).toMatchObject({ status: "PENDING", attempts: 0 });
    expect((await get(t, free))?.taskId).toBeUndefined();
    expect(kept?._id).toBe(paid);
    expect(await get(t, paid)).toMatchObject({ status: "FAILED", taskId: "task-refused" });
  });
});

describe("one continuous send", () => {
  test("a send outlasting its step hands on to the next, and the run ends once, every request counted", async () => {
    const t = harness();
    const { runId } = await collector(t);
    const now = await request(t);
    const later = await request(t);
    // Due past the step's five minutes, within the ten it waits ahead.
    await t.run(async (ctx) => { await ctx.db.patch(later, { dueAt: Date.now() + 7 * 60_000 }); });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const [task] = JSON.parse(init.body) as Array<{ tag: string }>;
      return Response.json({ status_code: 20000, tasks: [{ id: `task-${task.tag}`, status_code: 20000, cost: 0.01, data: { tag: task.tag }, result: [{ n: 1 }] }] });
    }));

    await t.action(internal.seoAgentRuns.runSeoRoleNow, { role: "DATAFORSEO_COLLECTOR", runId });
    expect(await t.run(async (ctx) => (await ctx.db.get(runId))?.status)).toBe("RUNNING");
    expect(await get(t, later)).toMatchObject({ status: "PENDING" });

    await finishScheduledInOrder(t);

    expect(await get(t, now)).toMatchObject({ status: "READY" });
    expect(await get(t, later)).toMatchObject({ status: "READY" });
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run).toMatchObject({ status: "SUCCESS" });
    expect(run?.finalOutput).toBe("Sent 2 requests to DataForSEO and spent $0.02. Stopped because the queue is empty.");
    // Nothing of the send is left waiting to run: each watch went with its step.
    const pending = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.state.kind === "pending").map((job) => job.name));
    expect(pending.filter((name) => name.includes("seoCollectorRun"))).toEqual([]);
  });

  test("a step the platform stopped is carried on by its watch, saying so; a finished run's watch does nothing", async () => {
    const t = harness();
    const { runId } = await collector(t);
    // Still moving: a step the platform started late, still working, is left be.
    await t.run(async (ctx) => { await ctx.db.patch(runId, { status: "RUNNING", updatedAt: Date.now() - 60_000 }); });
    await t.mutation(internal.seoCollectorRun.watchCollector, { runId, step: 3, sent: 40, refusedSteps: 0 });
    expect(await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length)).toBe(0);

    // Quiet past any step: the platform stopped it, and the watch carries on.
    await t.run(async (ctx) => { await ctx.db.patch(runId, { startedAt: Date.now() - 30 * 60_000, updatedAt: Date.now() - 11 * 60_000 }); });
    await t.mutation(internal.seoCollectorRun.watchCollector, { runId, step: 3, sent: 40, refusedSteps: 0 });

    const steps = await t.run(async (ctx) => await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", runId)).collect());
    expect(steps.at(-1)).toMatchObject({ kind: "OBSERVE", output: "Step 3 was stopped by the platform before it finished, so sending carried on from where it was." });
    const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    const next = jobs.find((job) => job.name.includes("continueCollecting"));
    expect(next?.args[0]).toMatchObject({ runId, step: 4, sent: 40 });
    expect(jobs.some((job) => job.name.includes("watchCollector"))).toBe(true);

    await t.run(async (ctx) => { await ctx.db.patch(runId, { status: "SUCCESS", updatedAt: Date.now() - 11 * 60_000 }); });
    const before = jobs.length;
    await t.mutation(internal.seoCollectorRun.watchCollector, { runId, step: 4, sent: 40, refusedSteps: 0 });
    expect(await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length)).toBe(before);
  });

  test("the hourly check starts the Collector for requests left waiting, unless one is sending or today's ceiling holds them", async () => {
    const t = harness();
    const { agentId, runId } = await collector(t);
    const waiting = await request(t);
    await t.run(async (ctx) => { await ctx.db.patch(waiting, { dueAt: Date.now() - 20 * 60_000 }); });
    const runs = () => t.run(async (ctx) => await ctx.db.query("agentRuns").collect());

    // One is sending: it sends these too.
    await t.run(async (ctx) => { await ctx.db.patch(runId, { status: "RUNNING" }); });
    await t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "sendWaiting" });
    expect(await runs()).toHaveLength(1);

    // Today's ceiling reached: they wait for midnight, and the screen says so.
    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { status: "SUCCESS", costUsd: 5 });
      await ctx.db.patch(agentId, { maxDailyCostUsd: 5 });
    });
    await t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "sendWaiting" });
    expect(await runs()).toHaveLength(1);

    // Neither: a run of its own sends them.
    await t.run(async (ctx) => { await ctx.db.patch(agentId, { maxDailyCostUsd: 50 }); });
    await t.mutation(internal.seoCollectionSweep.sweepDuty, { duty: "sendWaiting" });
    const started = (await runs()).find((run) => run._id !== runId);
    expect(started).toMatchObject({ title: "Send what was waiting", status: "QUEUED" });
  });
});

describe("one Collector at a time", () => {
  test("the earliest live run sends; a later one stands down, saying so", async () => {
    const t = harness();
    const { agentId, runId: first } = await collector(t);
    const second = await t.run(async (ctx) => {
      await ctx.db.patch(first, { status: "RUNNING" });
      return await ctx.db.insert("agentRuns", {
        agentId, triggerType: "SCHEDULE", objective: "collect", status: "RUNNING", startedAt: Date.now() + 1000, updatedAt: Date.now(),
      });
    });

    expect(await t.mutation(internal.seoAgentRuns.takeCollectorTurn, { runId: first })).toMatchObject({ ok: true });
    const later = await t.mutation(internal.seoAgentRuns.takeCollectorTurn, { runId: second });
    expect(later.ok).toBe(false);
    expect(later.message).toMatch(/already sending/);
  });

  test("a run started long ago that is still moving holds up a new one; one silent a quarter of an hour does not", async () => {
    const t = harness();
    const { agentId, runId: long } = await collector(t);
    const hourAgo = Date.now() - 60 * 60_000;
    await t.run(async (ctx) => { await ctx.db.patch(long, { status: "RUNNING", startedAt: hourAgo, updatedAt: Date.now() - 60_000 }); });
    const next = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId, triggerType: "SCHEDULE", objective: "collect", status: "RUNNING", startedAt: Date.now(), updatedAt: Date.now(),
    }));

    expect((await t.mutation(internal.seoAgentRuns.takeCollectorTurn, { runId: next })).ok).toBe(false);

    await t.run(async (ctx) => { await ctx.db.patch(long, { updatedAt: Date.now() - 16 * 60_000 }); });
    expect((await t.mutation(internal.seoAgentRuns.takeCollectorTurn, { runId: next })).ok).toBe(true);
  });
});

describe("fetching an answer", () => {
  const answerFor = (statusCode: number, extra: Record<string, unknown> = {}) =>
    vi.fn(async () => Response.json({ status_code: 20000, tasks: [{ id: "task-1", status_code: statusCode, ...extra }] }));

  test("an answer DataForSEO is still working on is waited for, not thrown away", async () => {
    const t = harness();
    const pullId = await request(t, { operationId: "serp_google_organic", mode: "QUEUED", status: "SUBMITTED", taskId: "task-1" });
    vi.stubGlobal("fetch", answerFor(40602, { status_message: "Task In Queue." }));

    await t.action(internal.seoCollectionActions.fetchSeoResult, { pullId });

    const pull = await get(t, pullId);
    expect(pull).toMatchObject({ status: "SUBMITTED" });
    // And says why it is still waiting (reliability plan V1).
    expect(pull?.lastFetch?.said).toBe("DataForSEO is still working on it (Task In Queue.).");
  });

  test("a network blip on a free fetch leaves the answer waiting", async () => {
    const t = harness();
    const pullId = await request(t, { operationId: "serp_google_organic", mode: "QUEUED", status: "SUBMITTED", taskId: "task-1" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));

    await t.action(internal.seoCollectionActions.fetchSeoResult, { pullId });

    const pull = await get(t, pullId);
    expect(pull).toMatchObject({ status: "SUBMITTED" });
    expect(pull?.lastFetch?.said).toMatch(/did not get through: .*fetch failed/);
  });

  test("a definite task error fails it", async () => {
    const t = harness();
    const pullId = await request(t, { operationId: "serp_google_organic", mode: "QUEUED", status: "SUBMITTED", taskId: "task-1" });
    vi.stubGlobal("fetch", answerFor(40501, { status_message: "Invalid Field: 'keyword'." }));

    await t.action(internal.seoCollectionActions.fetchSeoResult, { pullId });

    expect(await get(t, pullId)).toMatchObject({ status: "FAILED", error: "Invalid Field: 'keyword'." });
  });

  test("an answer fetched twice — pingback and hourly check — is filed once", async () => {
    const t = harness();
    const pullId = await request(t, { operationId: "serp_google_organic", mode: "QUEUED", status: "SUBMITTED", taskId: "task-1" });
    vi.stubGlobal("fetch", answerFor(20000, { result: [{ items: [] }] }));

    await t.run(async (ctx) => await ctx.db.patch(pullId, { lastFetch: { at: Date.now(), said: "DataForSEO said not now." } }));
    await t.action(internal.seoCollectionActions.fetchSeoResult, { pullId });
    await t.action(internal.seoCollectionActions.fetchSeoResult, { pullId });

    expect(await get(t, pullId)).toMatchObject({ status: "READY" });
    // Answered: the waiting and its last word are over.
    expect((await get(t, pullId))?.lastFetch).toBeUndefined();
    expect((await scheduled(t)).filter((name) => name.includes("parseSeoResult"))).toHaveLength(1);
  });
});

describe("answers arriving late", () => {
  test("a request given up at twelve hours is brought back by its pingback", async () => {
    const t = harness();
    const pullId = await request(t, { status: "FAILED", taskId: "task-9", error: RESULT_GAVE_UP });

    expect(await t.mutation(internal.seoCollectionQueue.markSeoPinged, { taskId: "task-9" })).toBe(pullId);
    expect(await get(t, pullId)).toMatchObject({ status: "SUBMITTED", taskId: "task-9" });
  });

  test("a send we could not confirm is found by its tag when DataForSEO pings after all", async () => {
    const t = harness();
    const pullId = await request(t, { status: "FAILED", tag: "our-tag", error: `${SEND_UNCERTAIN} (timeout).` });

    expect(await t.mutation(internal.seoCollectionQueue.markSeoPinged, { taskId: "task-7", tag: "our-tag" })).toBe(pullId);
    expect(await get(t, pullId)).toMatchObject({ status: "SUBMITTED", taskId: "task-7" });
  });

  test("a forged pingback for a request that failed for its own reasons changes nothing", async () => {
    const t = harness();
    const pullId = await request(t, { status: "FAILED", tag: "our-tag", error: "Invalid Field: 'target'." });

    expect(await t.mutation(internal.seoCollectionQueue.markSeoPinged, { taskId: "task-7", tag: "our-tag" })).toBeNull();
    expect(await get(t, pullId)).toMatchObject({ status: "FAILED" });
  });
});

describe("a Collector that died", () => {
  test("a claim that reached the send is failed; one that never did goes back in the queue", async () => {
    const t = harness();
    const long = Date.now() - 60 * 60 * 1000;
    const sent = await request(t, { status: "CLAIMED", claimedAt: long, postedAt: long });
    const neverSent = await request(t, { status: "CLAIMED", claimedAt: long });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    const failed = await get(t, sent);
    expect(failed?.status).toBe("FAILED");
    expect(failed?.error?.startsWith(SEND_UNCERTAIN)).toBe(true);
    expect(await get(t, neverSent)).toMatchObject({ status: "PENDING" });
  });
});

describe("counting", () => {
  test("a queued request is counted as sent once, and answered once", async () => {
    const t = harness();
    const companyId = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() }));
    const cycleId = await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "MANUAL", status: "SENDING", plannedCount: 1, reusedCount: 0, sentCount: 0,
      readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(),
    }));
    const pullId = await request(t, { operationId: "serp_google_organic", mode: "QUEUED", status: "CLAIMED", cycleId });

    await t.mutation(internal.seoCollectionQueue.settleSeoSend, { pullId, taskId: "task-1", costUsd: 0.002, sandbox: false, ready: false });
    await t.mutation(internal.seoCollectionQueue.settleSeoResult, { pullId, resultFile: await storedAnswer(t, "{}") });

    expect(await t.run(async (ctx) => await ctx.db.get(cycleId))).toMatchObject({ sentCount: 1, readyCount: 1, failedCount: 0 });
    const platform = await t.run(async (ctx) => (await ctx.db.query("seoDayRollups").collect()).find((row) => row.scopeKey === "platform"));
    expect(platform).toMatchObject({ pulls: 1, sent: 1, ready: 1 });
  });
});

describe("collections that stop part-way", () => {
  async function company(t: Harness) {
    return await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() }));
  }
  async function cycle(t: Harness, companyId: Id<"companies">, fields: Record<string, unknown>) {
    return await t.run(async (ctx) => await ctx.db.insert("seoCollectionCycles", {
      companyId, trigger: "MANUAL", status: "SENDING", plannedCount: 1, reusedCount: 0, sentCount: 0,
      readyCount: 0, failedCount: 0, totalCostUsd: 0, startedAt: Date.now(), ...fields,
    } as never));
  }

  test("a collection capped at its plan limit holds up the next while it still has requests to send", async () => {
    const t = harness();
    const companyId = await company(t);
    const capped = await cycle(t, companyId, { status: "CAPPED_PLAN" });
    const waiting = await request(t, { cycleId: capped });

    const blocked = await t.mutation(internal.seoTools.startSeoCollection, { companyId, trigger: "MANUAL" });
    expect(blocked).toMatchObject({ ok: false, cycleId: capped });

    await t.run(async (ctx) => await ctx.db.patch(waiting, { status: "READY" }));
    const opened = await t.mutation(internal.seoTools.startSeoCollection, { companyId, trigger: "MANUAL" });
    expect(opened.ok).toBe(true);
  });

  test("a work list that stopped being written is restarted from where it got to", async () => {
    const t = harness();
    const companyId = await company(t);
    const stalled = await cycle(t, companyId, { status: "EXPANDING", startedAt: Date.now() - 20 * 60 * 1000, cursorCreatedAt: 123 });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    expect(await t.run(async (ctx) => await ctx.db.get(stalled))).toMatchObject({ status: "EXPANDING", expandRestarts: 1 });
    const restart = (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect()))
      .find((job) => job.name.includes("expandSeoCycle"));
    expect(restart?.args[0]).toMatchObject({ cycleId: stalled, cursorCreatedAt: 123 });
  });

  test("one that keeps stopping is closed, saying so, and no longer holds up the next", async () => {
    const t = harness();
    const companyId = await company(t);
    const stalled = await cycle(t, companyId, { status: "EXPANDING", startedAt: Date.now() - 60 * 60 * 1000, expandRestarts: 3 });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    const closed = await t.run(async (ctx) => await ctx.db.get(stalled));
    expect(closed?.status).toBe("FAILED");
    expect(closed?.error).toMatch(/work list stopped 4 times/);
    expect((await t.mutation(internal.seoTools.startSeoCollection, { companyId, trigger: "MANUAL" })).ok).toBe(true);
  });
});

describe("answers never filed", () => {
  test("the hourly check files again an answer recorded and never filed, up to three tries", async () => {
    // A day after filings began to be marked.
    vi.setSystemTime(Date.parse("2026-09-26T12:00:00Z"));
    const t = harness();
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const insert = (fields: Record<string, unknown>) => t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
      operationId: "backlinks_summary", family: "Backlinks", mode: "LIVE", taskArgsJson: "{}", status: "READY",
      tag: `t-${Math.random()}`, costUsd: 0.02, sandbox: false, submittedAt: hourAgo, completedAt: hourAgo, ...fields,
    } as never));
    const unfiled = await insert({});
    await insert({ filedAt: hourAgo });
    await insert({ fileAttempts: 3 });
    // Recorded before filings were marked: filed then, never taken for unfiled.
    await insert({ completedAt: Date.parse("2026-09-24T18:00:00Z") });

    await t.action(internal.seoCollectionSweep.sweepSeoCollection, {});

    const refiled = (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect()))
      .filter((job) => job.name.includes("parseSeoResult"))
      .map((job) => (job.args[0] as { pullId: string }).pullId);
    expect(refiled).toEqual([unfiled]);
  });
});
