import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { stepChainValidator, type StepChain } from "./collectionStepsSchema";
import { closeRoleRun, writeRunLine } from "./roleRuns";
import { MEMORY_WARNING_MB, STEP_MEMORY_MB } from "./utils/stepMemory";

/**
 * Every step of a website's collection is watched, so a run always finishes
 * (docs/plans/active/collection-reliability-plan.md, RR1; Anthony, 2026-10-15:
 * "we need this reliable and scalable i cannot stress this highly enough").
 *
 * Until then a step the platform stopped — out of memory, past an action's
 * ten minutes, a restart — took the run's place with it: nothing carried the
 * run on, the hourly sweep marked it failed twenty minutes later, and its
 * closing never ran (kordatackle.com, 15 October: its page said "Collecting its
 * first 90 days" for good, and its two-year fill never started).
 *
 * Now each step is booked here, and **watched**: every two minutes the open
 * chains are looked at (`watchChains`, a cron), and one whose step Convex says
 * has ended — past the longest an action can live — without handing on or
 * closing its chain was stopped by the platform. The step's own arguments are
 * its place, saved here as it moves (`notePlace`), not only in the next step's
 * arguments, and the chain is started again from there. A check of the open
 * chains rather than a timer a step, as the DataForSEO Collector's steps have
 * (`seoCollectorRun.ts`): nothing to book or cancel with each step, and a
 * step's own clock never moves for it. A step started at the same place a second time goes carefully
 * (a job alone, in smaller pieces); a third time it skips that job and says
 * so; and past `MOST_RESUMES` the chain runs only its closing, saying why.
 * Each chain has one closing, run once whatever the ending.
 *
 * A booking carries its number to the step and its watch, so a step the watch
 * has started again never runs twice: the older one finds itself superseded.
 */

/** The longest an action lives on Convex. */
export const ACTION_LIFE_MS = 10 * 60 * 1000;

/** How long after a step was due to start the watch looks at it: past an action's life, so a step still alive is never started twice. */
export const STEP_WATCH_MS = 12 * 60 * 1000;

/** Steps the watch starts again in one chain before it runs only its closing. */
export const MOST_RESUMES = 8;

/** The try at one place that goes carefully, and the one that skips it. */
export const CAREFUL_TRY = 2;
export const SKIP_TRY = 3;

/** What a step needs to know as it starts: whether to go on, and how. */
export type StepStart = { go: boolean; careful: boolean; skip: boolean; tries: number };

/** A chain and the thing it collects, as one key: one row each, written over by each run. */
export function stepKey(chain: StepChain, ...parts: ReadonlyArray<string | undefined>): string {
  return [chain, ...parts.map((part) => part ?? "")].join(":");
}

/** The step a chain runs. */
function stepFunction(chain: StepChain) {
  switch (chain) {
    case "GA_RUN":
      return internal.googleAnalyticsSteps.collectSiteStep;
    case "GA_FILL_DAYS":
      return internal.googleAnalyticsSteps.fillHistory;
    case "GA_FILL_PAGES":
      return internal.googleAnalyticsSteps.fillPageHistory;
    case "SC_RUN":
      return internal.searchConsoleSteps.collectSiteStep;
    case "SC_FILL":
      return internal.searchConsoleSteps.fillSiteStep;
    case "SC_SETTLE":
      return internal.searchConsoleSettle.settlePart;
    case "INSIGHTS":
      return internal.insightsRunWorker.continueRun;
  }
}

export type Booking = {
  key: string;
  chain: StepChain;
  runId?: Id<"agentRuns">;
  /** The step's own arguments: its place. */
  args: Record<string, unknown>;
  place: string;
  delayMs?: number;
};

async function stepOf(ctx: { db: MutationCtx["db"] }, key: string): Promise<Doc<"collectionSteps"> | null> {
  return await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", key)).unique();
}

function going(run: Doc<"agentRuns"> | null): boolean {
  return run !== null && (run.status === "QUEUED" || run.status === "RUNNING");
}

/** The run marked as moving, so a run in many steps never reads as dead (RR1). */
async function touchRun(ctx: MutationCtx, runId: Id<"agentRuns"> | undefined, now: number) {
  if (!runId) return;
  const run = await ctx.db.get(runId);
  if (going(run)) await ctx.db.patch(runId, { updatedAt: now });
}

/**
 * Book a chain's next step, with its watch, in one transaction: the step's
 * place saved, the last booking's watch cancelled. A booking for another run,
 * or after the chain closed, starts the chain afresh. `keepTries` is the
 * watch's own: the same place started again counts as another try.
 */
export async function bookStep(ctx: MutationCtx, booking: Booking, keepTries = false): Promise<number> {
  const now = Date.now();
  const held = await stepOf(ctx, booking.key);
  const fresh = !held || held.closedAt !== undefined || held.runId !== booking.runId;
  const number = (held?.booking ?? 0) + 1;
  const startsAt = now + Math.max(0, booking.delayMs ?? 0);
  const args = { ...booking.args, booking: number };
  const tries = keepTries && held && !fresh && held.place === booking.place ? held.tries : 0;
  const fields = {
    chain: booking.chain,
    ...(booking.runId ? { runId: booking.runId } : {}),
    booking: number,
    args,
    place: booking.place,
    tries,
    // Carries are counted since the chain last moved on (RR1): one that has moved past a stopped place is not
    // charged for it, so a run of many heavy jobs is not given up after eight carries in all.
    resumes: fresh || held.place !== booking.place ? 0 : held.resumes,
    peakMb: fresh ? undefined : held.peakMb,
    bookedAt: startsAt,
    startedAt: undefined,
    stepJobId: await ctx.scheduler.runAt(startsAt, stepFunction(booking.chain), args as never),
    closedAt: undefined,
    gaveUp: undefined,
    updatedAt: now,
  };
  if (held) await ctx.db.patch(held._id, { ...fields, runId: booking.runId });
  else await ctx.db.insert("collectionSteps", { key: booking.key, ...fields });
  await touchRun(ctx, booking.runId, now);
  return number;
}

const bookingArgs = {
  key: v.string(),
  chain: stepChainValidator,
  runId: v.optional(v.id("agentRuns")),
  args: v.any(),
  place: v.string(),
  delayMs: v.optional(v.number()),
  /** The memory the step handing on held, in MB (`stepMemory.ts`): kept as the chain's peak (RR5). */
  memoryMb: v.optional(v.number()),
};

/**
 * A step's memory noted (RR5): the chain's peak kept, and a warning line on the
 * run past half of what a step may hold — once a run, at its first step past it.
 */
export async function noteStepMemory(ctx: MutationCtx, held: Doc<"collectionSteps">, memory: number | undefined, now: number): Promise<number | undefined> {
  if (memory === undefined) return held.peakMb;
  const peak = Math.max(held.peakMb ?? 0, memory);
  if (memory > MEMORY_WARNING_MB && (held.peakMb ?? 0) <= MEMORY_WARNING_MB && held.runId) {
    const run = await ctx.db.get(held.runId);
    if (going(run)) {
      await writeRunLine(ctx, {
        runId: held.runId,
        ...(run?.companyId ? { companyId: run.companyId } : {}),
        heading: "Memory",
        detail: `A step at ${held.place} held ${memory} MB of the ${STEP_MEMORY_MB} MB a step may have. The run goes on; this website is near the size its steps can hold.`,
        failed: true,
      });
    }
  }
  if (peak !== held.peakMb) await ctx.db.patch(held._id, { peakMb: peak, updatedAt: now });
  return peak;
}

/**
 * A step hands on to the next, from inside its action. Refused (false) when
 * the step is not the chain's current booking — the watch started it again
 * meanwhile — so a chain never runs as two.
 */
export const handOn = internalMutation({
  args: { ...bookingArgs, from: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { from, memoryMb, ...booking } = args;
    const held = await stepOf(ctx, booking.key);
    if (from !== undefined && (!held || held.booking !== from || held.closedAt !== undefined)) return false;
    if (held) await noteStepMemory(ctx, held, memoryMb, Date.now());
    await bookStep(ctx, { ...booking, args: withoutBooking(booking.args) });
    return true;
  },
});

/** A chain's first step, booked from an action: a fill, or an adding-up job, started by a step. */
export const startChain = internalMutation({
  args: bookingArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await bookStep(ctx, { ...args, args: withoutBooking(args.args) });
    return null;
  },
});

function withoutBooking(args: Record<string, unknown>): Record<string, unknown> {
  const { booking: _booking, ...rest } = args;
  return rest;
}

/**
 * A step begins: its try at the chain's place counted, the run marked moving.
 * A step booked before the watch existed (no booking) runs as it always did.
 */
export const stepStarted = internalMutation({
  args: { key: v.string(), booking: v.optional(v.number()) },
  returns: v.object({ go: v.boolean(), careful: v.boolean(), skip: v.boolean(), tries: v.number() }),
  handler: async (ctx, args): Promise<StepStart> => {
    if (args.booking === undefined) return { go: true, careful: false, skip: false, tries: 1 };
    const held = await stepOf(ctx, args.key);
    // Superseded, closed, or this booking already started once: the chain goes on elsewhere.
    if (!held || held.closedAt !== undefined || held.booking !== args.booking || held.startedAt !== undefined) {
      return { go: false, careful: false, skip: false, tries: 0 };
    }
    const now = Date.now();
    const tries = held.tries + 1;
    await ctx.db.patch(held._id, { startedAt: now, tries, updatedAt: now });
    await touchRun(ctx, held.runId, now);
    return { go: true, careful: tries === CAREFUL_TRY, skip: tries >= SKIP_TRY, tries };
  },
});

/**
 * Where a step has got to, saved as it goes — after each job — so a watch
 * starts the chain again from there. A new place starts its tries again: this
 * step is its first. False when the step is no longer the chain's booking.
 */
export const notePlace = internalMutation({
  args: { key: v.string(), booking: v.optional(v.number()), args: v.any(), place: v.string(), memoryMb: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (args.booking === undefined) return true;
    const held = await stepOf(ctx, args.key);
    if (!held || held.closedAt !== undefined || held.booking !== args.booking) return false;
    const now = Date.now();
    await noteStepMemory(ctx, held, args.memoryMb, now);
    await ctx.db.patch(held._id, {
      args: { ...withoutBooking(args.args), booking: args.booking },
      place: args.place,
      tries: args.place === held.place ? held.tries : 1,
      // Moved on: its carries are counted afresh from here.
      ...(args.place === held.place ? {} : { resumes: 0 }),
      updatedAt: now,
    });
    await touchRun(ctx, held.runId, now);
    return true;
  },
});

/** A chain ended, by its own closing: the watch looks at it no more. */
export async function closeStep(ctx: MutationCtx, key: string, booking?: number): Promise<void> {
  const held = await stepOf(ctx, key);
  if (!held || held.closedAt !== undefined) return;
  if (booking !== undefined && held.booking !== booking) return;
  const now = Date.now();
  await ctx.db.patch(held._id, { closedAt: now, updatedAt: now });
}

export const closeChain = internalMutation({
  args: { key: v.string(), booking: v.optional(v.number()), memoryMb: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const held = await stepOf(ctx, args.key);
    if (held && held.closedAt === undefined) await noteStepMemory(ctx, held, args.memoryMb, Date.now());
    await closeStep(ctx, args.key, args.booking);
    return null;
  },
});

/** Whether a chain is going: booked, not closed, and its step not dead. Started fills and adding-up check it before starting another. */
export async function chainGoing(ctx: { db: MutationCtx["db"] }, key: string, now = Date.now()): Promise<boolean> {
  const held = await stepOf(ctx, key);
  return held !== null && held.closedAt === undefined && now - (held.startedAt ?? held.bookedAt) < 2 * STEP_WATCH_MS;
}

/**
 * What Convex says of a chain's step: still waiting to start, running, or
 * ended — by itself or by the platform. A step that ended without handing on
 * or closing its chain was stopped (out of memory, past its ten minutes, a
 * restart), or threw past its own catch.
 */
async function stepState(ctx: { db: MutationCtx["db"] }, held: Doc<"collectionSteps">): Promise<"WAITING" | "RUNNING" | "ENDED"> {
  if (!held.stepJobId) return "ENDED";
  const job = await ctx.db.system.get(held.stepJobId);
  if (job?.state.kind === "pending") return "WAITING";
  if (job?.state.kind === "inProgress") return "RUNNING";
  return "ENDED";
}

/** A chain whose step died, carried on — or, past `MOST_RESUMES`, ended by its own closing. The hourly sweep calls it too. */
export async function carryOn(ctx: MutationCtx, held: Doc<"collectionSteps">, now: number): Promise<void> {
  const run = held.runId ? await ctx.db.get(held.runId) : null;
  const args = withoutBooking(held.args as Record<string, unknown>);
  // An Analytics run's collecting mark goes when its run ends without its own closing, so its page never says it is
  // collecting for good: cancelled while its step was stopped, or given up and stopped in its closing.
  const clearCollecting = async () => {
    if (held.chain === "GA_RUN" && held.runId && typeof args.connectionId === "string") {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsRunEnd.clearCollecting, { connectionId: args.connectionId as Id<"googleAnalyticsConnections">, runId: held.runId });
    }
  };
  if (held.runId && !going(run)) {
    await clearCollecting();
    await closeStep(ctx, held.key);
    return;
  }
  const line = async (detail: string, failed: boolean) => {
    if (held.runId) await writeRunLine(ctx, { runId: held.runId, ...(run?.companyId ? { companyId: run.companyId } : {}), heading: "Carried on", detail, failed });
  };
  if (held.resumes >= MOST_RESUMES) {
    // Its closing already failed once: the run ends here, saying so, and the chain closes.
    if (args.closeOnly === true) {
      const why = `The platform stopped this run's steps ${held.resumes + 1} times, the last at ${held.place}. It ended without its closing; the next run starts again from what is held.`;
      if (held.runId) await closeRoleRun(ctx, { runId: held.runId, status: "FAILED", summary: why });
      await clearCollecting();
      await ctx.db.patch(held._id, { gaveUp: why, updatedAt: now });
      await closeStep(ctx, held.key);
      return;
    }
    const why = `The platform stopped this run's steps ${held.resumes} times, the last at ${held.place}, so it ends here with what it has.`;
    await line(why, true);
    await ctx.db.patch(held._id, { resumes: held.resumes + 1, updatedAt: now });
    await bookStep(ctx, { key: held.key, chain: held.chain, runId: held.runId, args: { ...args, closeOnly: true }, place: held.place }, true);
    // After the booking, which clears it: why the chain is ending stays on it.
    await ctx.db.patch(held._id, { gaveUp: why });
    return;
  }
  const next = held.tries + 1;
  await line(next >= SKIP_TRY
    ? `A step was stopped by the platform at ${held.place} again, so that part is left out and the run goes on past it.`
    : next === CAREFUL_TRY
      ? `A step was stopped by the platform at ${held.place}, so the run carried on from there, that part alone and in smaller pieces.`
      : `A step was stopped by the platform at ${held.place}, so the run carried on from there.`, false);
  await ctx.db.patch(held._id, { resumes: held.resumes + 1, updatedAt: now });
  await bookStep(ctx, { key: held.key, chain: held.chain, runId: held.runId, args, place: held.place }, true);
}

/** Open chains looked at a watch. */
const OPEN_CHAINS_READ = 200;

/**
 * The watch, every two minutes (`crons.ts`, through the job ledger): each open
 * chain whose step was due more than `STEP_WATCH_MS` ago and that Convex says
 * has ended — neither waiting to start nor running — is carried on. A step
 * still waiting (started late) or running is left to go on.
 */
export async function carryOnStopped(ctx: MutationCtx, now: number): Promise<number> {
  const open = await ctx.db
    .query("collectionSteps")
    .withIndex("by_open_booked", (q) => q.eq("closedAt", undefined).lt("bookedAt", now - STEP_WATCH_MS))
    .take(OPEN_CHAINS_READ);
  let carried = 0;
  for (const held of open) {
    if ((await stepState(ctx, held)) !== "ENDED") continue;
    await carryOn(ctx, held, now);
    carried += 1;
  }
  return carried;
}

export const watchChains = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => await carryOnStopped(ctx, Date.now()),
});

/** Whether a run is carried by a watched chain still open: the sweep leaves those to their watch. */
export async function runWatched(ctx: { db: MutationCtx["db"] }, runId: Id<"agentRuns">): Promise<boolean> {
  const chains = await ctx.db.query("collectionSteps").withIndex("by_run", (q) => q.eq("runId", runId)).take(20);
  return chains.some((held) => held.closedAt === undefined);
}
