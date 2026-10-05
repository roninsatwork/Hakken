import { vi } from "vitest";

/**
 * The one way a test waits while the clock is fake (AGENTS.md, "Tests that
 * never flake"): by real time, never by a count of turns.
 *
 * In a full run some seven hundred files load at once, and the first call into
 * a Convex module really reads and compiles it — seconds, on a busy machine,
 * for work that takes milliseconds alone. A wait bounded by a count of turns
 * ("pump the clock two thousand times") runs out before the work has begun;
 * the test then asserts too early, or hangs on a timer nobody moves until the
 * thirty-second limit. Every flake of 2026-09 and 2026-10 was that shape.
 *
 * Vitest 4's fake timers replace every clock — `Date`, `performance.now` and
 * `process.hrtime` too — so a deadline read from any of them is fake time, and
 * one jump of the fake clock spends it. These are kept from when this module
 * loads, before any test fakes them, and stay real.
 */
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

/**
 * Real time a test may wait on its work, however slowly the work's code loads:
 * well inside the test's own limit (thirty seconds here, three minutes on
 * GitHub, which runs ten times slower), so a genuine hang fails with its own
 * words rather than as a timeout.
 */
export const REAL_WAIT_LIMIT_MS = process.env.GITHUB_ACTIONS ? 120_000 : 20_000;

/**
 * How long a screen test waits for something to appear (`findBy…`,
 * `waitFor`), set once in `vitest.setup.ts`: Testing Library's own second ran
 * out in a busy full run while a part loaded on demand. Only as long as it
 * takes when all is well; the full time only for a test that is failing.
 */
export const SCREEN_WAIT_MS = process.env.GITHUB_ACTIONS ? 60_000 : 10_000;

/** One full turn of the event loop, on a queue fake timers do not touch, so a dynamic import can land. */
export function nextTurn(): Promise<void> {
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

/**
 * A deadline in real time: `passed()` turns true once `ms` of real time has
 * gone, whatever the fake clock does. `stop()` when done.
 */
export function realDeadline(ms = REAL_WAIT_LIMIT_MS): { passed: () => boolean; stop: () => void } {
  let passed = false;
  const timer = realSetTimeout(() => {
    passed = true;
  }, ms);
  return { passed: () => passed, stop: () => realClearTimeout(timer) };
}

/**
 * Wait for `work` while moving the fake clock, until it settles or real time
 * runs out. `"next"` moves the clock to the next timer only, each turn — for a
 * test that checks when each wait ended (a retry after a minute, then two);
 * `"all"` runs every timer due, each turn. Returns what `work` returns, and
 * rethrows what it throws.
 *
 * Needs fake timers.
 */
export async function whileMovingClock<T>(work: Promise<T>, step: "next" | "all" = "all", what = "the work"): Promise<T> {
  let settled = false;
  const watched = work.finally(() => {
    settled = true;
  });
  // A rejection is the caller's to see, below; not an unhandled one meanwhile.
  watched.catch(() => undefined);
  const deadline = realDeadline();
  try {
    while (!settled) {
      if (deadline.passed()) {
        throw new Error(
          `${what} was still running after ${REAL_WAIT_LIMIT_MS / 1000}s of real time while the fake clock moved: `
          + "it waits on something no timer will bring, or on itself.",
        );
      }
      if (step === "next") await vi.advanceTimersToNextTimerAsync();
      else vi.runAllTimers();
      await nextTurn();
    }
  } finally {
    deadline.stop();
  }
  return await watched;
}

/**
 * Keep a test about days away from midnight: the date set to midday UTC on
 * today's date, moving on with real time from there. A test that works out
 * "today" or "yesterday" itself, beside code that works it out again a moment
 * later, otherwise fails on the run that crosses midnight. Only `Date` is
 * faked — timers stay real — so `vi.useRealTimers()` after each test.
 */
export function useMiddayUtc(): void {
  const now = new Date();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
}
