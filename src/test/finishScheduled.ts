import { vi } from "vitest";

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
 * Needs fake timers, like the call it replaces.
 */

/** The one piece of the test harness this needs. */
type ScheduledFunctionHarness = { finishInProgressScheduledFunctions: () => Promise<void> };

/** Real time allowed for one round's functions, however long their modules take to load. */
const ROUND_LIMIT_MS = 20_000;

/** Rounds of "these scheduled more". A chain deeper than this is looping. */
const MAX_ROUNDS = 100;

function elapsedMs(since: bigint): number {
  return Number(process.hrtime.bigint() - since) / 1_000_000;
}

/** One full turn of the event loop, on a queue fake timers do not touch. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port2.onmessage = () => {
      port1.close();
      port2.close();
      resolve();
    };
    port1.postMessage(null);
  });
}

export async function finishScheduled(t: ScheduledFunctionHarness): Promise<void> {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    vi.runAllTimers();

    let done = false;
    const settled = t.finishInProgressScheduledFunctions().then(() => {
      done = true;
    });

    // Keep the clock moving while waiting: an action may be sleeping on a
    // timer, and a follow-up it schedules should start rather than wait.
    const started = process.hrtime.bigint();
    while (!done) {
      vi.runAllTimers();
      await nextTurn();
      if (!done && elapsedMs(started) > ROUND_LIMIT_MS) {
        throw new Error(
          `finishScheduled: a scheduled function was still running after ${ROUND_LIMIT_MS / 1000}s. `
          + "Something is waiting on a timer that never fires, or on itself.",
        );
      }
    }
    await settled;

    if (vi.getTimerCount() === 0) return;
  }
  throw new Error(
    `finishScheduled: scheduled functions were still scheduling more after ${MAX_ROUNDS} rounds.`,
  );
}
