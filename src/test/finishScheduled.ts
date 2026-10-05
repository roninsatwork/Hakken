import { vi } from "vitest";
import { nextTurn, realDeadline, REAL_WAIT_LIMIT_MS } from "./realTime";

/**
 * Run every scheduled function to completion, and whatever those schedule.
 *
 * `convex-test`'s own `finishAllScheduledFunctions` waits on a running function
 * by pumping the fake clock a fixed ten thousand event-loop turns, then gives
 * up. That is a turn count standing in for a clock, and it is wrong in one
 * situation that a full suite reaches often: the first time a function runs in
 * a worker its module is really loaded — read and compiled from disk — and with
 * five hundred test files running in parallel that can take longer than ten
 * thousand fast turns. The test then fails with "did not complete after 10000
 * timer pumps" while nothing is wrong, and passes when run alone.
 * `agentRuntime.test.ts` met it and worked round it at one call site; it was
 * still failing elsewhere on 2026-09-22.
 *
 * This keeps the same loop — advance the fake clock, yield a whole event-loop
 * turn so a dynamic import can land, repeat until nothing is running — and
 * bounds it by elapsed real time instead. A genuine hang still fails, says so,
 * and does it well inside the thirty-second test timeout. A cold module no
 * longer does.
 *
 * Needs fake timers, like the call it replaces. Its deadline is real time
 * (`realTime.ts`): until 2026-10-05 it was read from `process.hrtime`, which
 * Vitest 4's fake timers replace too, so a clock jump spent it and a cold
 * load never did — the helper meant to fail a hang in its own words ran on
 * to the thirty-second limit instead.
 */

/** The one piece of the test harness this needs. */
type ScheduledFunctionHarness = { finishInProgressScheduledFunctions: () => Promise<void> };

/** Rounds of "these scheduled more". A chain deeper than this is looping. */
const MAX_ROUNDS = 100;

export async function finishScheduled(t: ScheduledFunctionHarness): Promise<void> {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    vi.runAllTimers();

    let done = false;
    const settled = t.finishInProgressScheduledFunctions().then(() => {
      done = true;
    });

    // Keep the clock moving while waiting: an action may be sleeping on a
    // timer, and a follow-up it schedules should start rather than wait.
    const deadline = realDeadline();
    try {
      while (!done) {
        vi.runAllTimers();
        await nextTurn();
        if (!done && deadline.passed()) {
          throw new Error(
            `finishScheduled: a scheduled function was still running after ${REAL_WAIT_LIMIT_MS / 1000}s of real time. `
            + "Something is waiting on a timer that never fires, or on itself.",
          );
        }
      }
    } finally {
      deadline.stop();
    }
    await settled;

    if (vi.getTimerCount() === 0) return;
  }
  throw new Error(
    `finishScheduled: scheduled functions were still scheduling more after ${MAX_ROUNDS} rounds.`,
  );
}

/** A harness that can also read the scheduler's own table. */
type DueHarness = ScheduledFunctionHarness & {
  run: <T>(handler: (ctx: { db: { system: { query: (table: "_scheduled_functions") => { collect: () => Promise<Array<{ scheduledTime: number; state: { kind: string } }>> } } } }) => Promise<T>) => Promise<T>;
};

/**
 * Run the scheduled functions due now, and those they schedule for now, until
 * none is left due — a writer that pages itself through a long list — but
 * none set for later, which `finishScheduled` would run too. Bounded by real
 * time, never by a guess at how many pages the chain takes: the five rounds
 * `seoKeywordIntent.test.ts` once counted were right only for 1,200 rows.
 */
export async function finishDueNow(t: DueHarness): Promise<void> {
  const deadline = realDeadline();
  try {
    for (;;) {
      const due = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((job) => job.state.kind === "pending" && job.scheduledTime <= Date.now()).length);
      if (due === 0) return;
      if (deadline.passed()) {
        throw new Error(
          `finishDueNow: functions were still due after ${REAL_WAIT_LIMIT_MS / 1000}s of real time. `
          + "Something keeps scheduling itself for now.",
        );
      }
      vi.advanceTimersByTime(1);
      await t.finishInProgressScheduledFunctions();
    }
  } finally {
    deadline.stop();
  }
}

/** A harness that can read each scheduled function's name and time. */
type InOrderHarness = ScheduledFunctionHarness & {
  run: <T>(handler: (ctx: { db: { system: { query: (table: "_scheduled_functions") => { collect: () => Promise<Array<{ name: string; scheduledTime: number; state: { kind: string } }>> } } } }) => Promise<T>) => Promise<T>;
};

/**
 * Run the scheduled functions one at a time, in the order they are due, each
 * to completion before the clock moves on to the next — as real time does.
 *
 * For a chain whose steps each book a watch far ahead (the DataForSEO
 * Collector's, `convex/seoCollectorRun.ts`): `finishScheduled` moves the clock
 * past every timer at once, so a watch set ten minutes on fired while the step
 * it watched was still running, which no real clock allows. Bounded by real
 * time, never by a count of rounds.
 */
export async function finishScheduledInOrder(t: InOrderHarness): Promise<void> {
  const deadline = realDeadline();
  try {
    for (;;) {
      const pending = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((job) => job.state.kind === "pending")
        .map((job) => job.scheduledTime));
      if (pending.length === 0) return;
      if (deadline.passed()) {
        throw new Error(
          `finishScheduledInOrder: functions were still scheduled after ${REAL_WAIT_LIMIT_MS / 1000}s of real time. `
          + "Something keeps scheduling itself.",
        );
      }
      vi.advanceTimersByTime(Math.max(1, Math.min(...pending) - Date.now()));
      await t.finishInProgressScheduledFunctions();
      await nextTurn();
    }
  } finally {
    deadline.stop();
  }
}
