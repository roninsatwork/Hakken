import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { MOST_RESUMES, STEP_WATCH_MS, bookStep } from "./collectionSteps";
import { MEMORY_WARNING_MB } from "./utils/stepMemory";

/**
 * The watch on every step of a website's collection (collection-reliability-plan.md,
 * RR1): a step the platform stopped — out of memory, past an action's ten
 * minutes, a restart — is carried on from its saved place; the second try at
 * one place goes carefully and the third leaves it out; past the most carries
 * only the chain's closing runs; and a step the watch replaced never runs as a
 * second copy of its chain. The platform stopping a step is its booking ended
 * on the scheduler without handing on, as Convex reports it.
 */

const NOW = Date.parse("2026-10-16T02:00:00Z");
const KEY = "SC_SETTLE:test";
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function aRun(t: Harness): Promise<Id<"agentRuns">> {
  return await t.run(async (ctx) => {
    const agentId = await ctx.db.insert("agents", { name: "Collector", modelId: "model-test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
    return await ctx.db.insert("agentRuns", { agentId, triggerType: "SCHEDULE", objective: "Collect", title: "Search Console: acme-shop.test", status: "RUNNING", startedAt: NOW, updatedAt: NOW });
  });
}

/** A chain's first step, booked. It is never run here: each test says what the platform did to it. */
async function book(t: Harness, runId: Id<"agentRuns"> | undefined, place = "the 90 days' keywords") {
  return await t.run(async (ctx) => await bookStep(ctx, { key: KEY, chain: "SC_SETTLE", ...(runId ? { runId } : {}), args: { job: 1 }, place }));
}

const held = (t: Harness) => t.run(async (ctx) => (await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", KEY)).unique())!);

/** The platform stops the chain's step: Convex ends its booking, and nothing handed on. */
async function stopped(t: Harness) {
  const row = await held(t);
  await t.run(async (ctx) => await ctx.scheduler.cancel(row.stepJobId!));
}

/** The watch's next look, once the step is past its watch: a second past, as a saved time is a few milliseconds past the frozen clock (`aboutMs`). */
async function watchLater(t: Harness): Promise<number> {
  vi.setSystemTime(Date.now() + STEP_WATCH_MS + 1_000);
  return await t.mutation(internal.collectionSteps.watchChains, {});
}

const started = (t: Harness, booking: number) => t.mutation(internal.collectionSteps.stepStarted, { key: KEY, booking });

const linesOf = (t: Harness, runId: Id<"agentRuns">) => t.run(async (ctx) => (await ctx.db.query("agentRunSteps").collect())
  .filter((step) => step.runId === runId)
  .map((step) => ({ heading: step.input, detail: step.output ?? "", failed: step.status === "FAILED" })));

describe("a step the platform stopped (RR1)", () => {
  test("is carried on from its saved place: the second try goes carefully, the third leaves the place out, and the run says so each time", async () => {
    const t = harness();
    const runId = await aRun(t);
    await book(t, runId);
    expect(await started(t, 1)).toEqual({ go: true, careful: false, skip: false, tries: 1 });
    // The step saves its place as it goes: the watch starts it again from there, not from where it began.
    expect(await t.mutation(internal.collectionSteps.notePlace, { key: KEY, booking: 1, args: { job: 2 }, place: "the 90 days' pages" })).toBe(true);
    await stopped(t);

    expect(await watchLater(t)).toBe(1);
    let row = await held(t);
    expect(row).toMatchObject({ booking: 2, place: "the 90 days' pages", tries: 1, resumes: 1, args: { job: 2, booking: 2 } });
    expect(await started(t, 2)).toEqual({ go: true, careful: true, skip: false, tries: 2 });
    await stopped(t);

    expect(await watchLater(t)).toBe(1);
    expect(await started(t, 3)).toEqual({ go: true, careful: false, skip: true, tries: 3 });
    row = await held(t);
    expect(row).toMatchObject({ booking: 3, resumes: 2 });

    // The first step, started late after all, finds the chain has gone on without it, so the chain never runs twice.
    expect((await started(t, 1)).go).toBe(false);
    expect(await t.mutation(internal.collectionSteps.handOn, { key: KEY, chain: "SC_SETTLE", runId, args: { job: 3 }, place: "the 12 months", from: 1 })).toBe(false);

    const lines = await linesOf(t, runId);
    expect(lines.map((line) => line.heading)).toEqual(["Carried on", "Carried on"]);
    expect(lines[0].detail).toContain("at the 90 days' pages, so the run carried on from there, that part alone and in smaller pieces");
    expect(lines[1].detail).toContain("again, so that part is left out and the run goes on past it");
    // Carrying on is not failing: the run reads as going, moved on by each step.
    expect((await t.run(async (ctx) => await ctx.db.get(runId)))?.status).toBe("RUNNING");
  });

  test("a step still waiting to start, or not yet past its watch, is left to go on", async () => {
    const t = harness();
    const runId = await aRun(t);
    await book(t, runId);
    // Not past its watch: not looked at.
    expect(await t.mutation(internal.collectionSteps.watchChains, {})).toBe(0);
    // Past it, but Convex says the step is still waiting to start — a busy scheduler — so it is not started twice.
    expect(await watchLater(t)).toBe(0);
    expect((await held(t)).booking).toBe(1);
  });

  test("past the most carries only the chain's closing runs, saying why; stopped there too, the run ends failed and the chain closes", async () => {
    const t = harness();
    const runId = await aRun(t);
    await book(t, runId);
    for (let resume = 0; resume < MOST_RESUMES; resume += 1) {
      await stopped(t);
      expect(await watchLater(t)).toBe(1);
    }
    expect((await held(t)).resumes).toBe(MOST_RESUMES);
    await stopped(t);
    expect(await watchLater(t)).toBe(1);
    const closing = await held(t);
    expect(closing.args).toMatchObject({ closeOnly: true });
    expect(closing.gaveUp).toContain(`stopped this run's steps ${MOST_RESUMES} times`);
    expect((await linesOf(t, runId)).at(-1)).toMatchObject({ heading: "Carried on", failed: true });

    // The closing step is stopped too: the run ends here, saying so, and the watch looks at the chain no more.
    await stopped(t);
    expect(await watchLater(t)).toBe(1);
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run?.status).toBe("FAILED");
    expect(run?.finalOutput ?? "").toContain("It ended without its closing");
    expect((await held(t)).closedAt).toBeDefined();
    expect(await watchLater(t)).toBe(0);
  });

  test("a chain whose run has ended — cancelled from Admin, say — is closed, not carried on", async () => {
    const t = harness();
    const runId = await aRun(t);
    await book(t, runId);
    await t.run(async (ctx) => await ctx.db.patch(runId, { status: "CANCELLED" }));
    await stopped(t);
    expect(await watchLater(t)).toBe(1);
    const row = await held(t);
    expect(row.closedAt).toBeDefined();
    expect(row.booking).toBe(1);
    expect(await linesOf(t, runId)).toEqual([]);
  });
});

describe("a chain's bookings", () => {
  test("a step hands on only while it is the chain's booking, and a closed chain is neither going nor watched", async () => {
    const t = harness();
    const runId = await aRun(t);
    await book(t, runId);
    expect(await t.mutation(internal.collectionSteps.handOn, { key: KEY, chain: "SC_SETTLE", runId, args: { job: 2 }, place: "the 90 days' pages", from: 1 })).toBe(true);
    expect((await held(t)).booking).toBe(2);
    // The same step handing on twice — retried by the platform — books nothing more.
    expect(await t.mutation(internal.collectionSteps.handOn, { key: KEY, chain: "SC_SETTLE", runId, args: { job: 3 }, place: "the 12 months", from: 1 })).toBe(false);
    expect((await held(t)).booking).toBe(2);

    const going = () => t.run(async (ctx) => {
      const { chainGoing, runWatched } = await import("./collectionSteps");
      return { going: await chainGoing(ctx, KEY), watched: await runWatched(ctx, runId) };
    });
    expect(await going()).toEqual({ going: true, watched: true });
    await t.mutation(internal.collectionSteps.closeChain, { key: KEY, booking: 2 });
    expect(await going()).toEqual({ going: false, watched: false });
    // A booking for a new run starts the chain afresh: its tries and carries from nothing.
    const next = await aRun(t);
    await book(t, next, "the 90 days' keywords");
    expect(await held(t)).toMatchObject({ booking: 3, tries: 0, resumes: 0, runId: next });
    expect((await held(t)).closedAt).toBeUndefined();
  });

  test("a step the watch replaced cannot close the chain that replaced it, and carries are counted afresh once it moves on", async () => {
    const t = harness();
    const runId = await aRun(t);
    await book(t, runId);
    await started(t, 1);
    await stopped(t);
    await watchLater(t);
    expect(await held(t)).toMatchObject({ booking: 2, resumes: 1 });
    // The first step was not dead after all: finishing late, it closes only its own booking — not the one carrying on.
    await t.mutation(internal.collectionSteps.closeChain, { key: KEY, booking: 1 });
    expect((await held(t)).closedAt).toBeUndefined();
    // The carried-on step moves past the place it was stopped at: its carries count from nothing again.
    await started(t, 2);
    expect(await t.mutation(internal.collectionSteps.handOn, { key: KEY, chain: "SC_SETTLE", runId, args: { job: 2 }, place: "the 90 days' pages", from: 2 })).toBe(true);
    expect(await held(t)).toMatchObject({ booking: 3, resumes: 0, place: "the 90 days' pages" });
    await t.mutation(internal.collectionSteps.closeChain, { key: KEY, booking: 3 });
    expect((await held(t)).closedAt).toBeDefined();
  });

  test("a step's memory is kept as the chain's peak, with one warning line on the run past half of what a step may hold (RR5)", async () => {
    const t = harness();
    const runId = await aRun(t);
    await book(t, runId);
    await t.mutation(internal.collectionSteps.notePlace, { key: KEY, booking: 1, args: { job: 1 }, place: "the 90 days' keywords", memoryMb: 120 });
    await t.mutation(internal.collectionSteps.notePlace, { key: KEY, booking: 1, args: { job: 2 }, place: "the 90 days' pages", memoryMb: MEMORY_WARNING_MB + 40 });
    await t.mutation(internal.collectionSteps.notePlace, { key: KEY, booking: 1, args: { job: 3 }, place: "the 12 months", memoryMb: MEMORY_WARNING_MB + 60 });
    expect((await held(t)).peakMb).toBe(MEMORY_WARNING_MB + 60);
    const lines = await linesOf(t, runId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ heading: "Memory", failed: true });
    expect(lines[0].detail).toContain(`held ${MEMORY_WARNING_MB + 40} MB of the 512 MB a step may have`);
  });
});
