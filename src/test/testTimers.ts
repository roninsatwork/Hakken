import { promisify } from "node:util";
import { afterEach, beforeEach } from "vitest";

/**
 * No timer outlives its test (AGENTS.md, "Tests that never flake").
 *
 * A screen that clears its "Saved" note two seconds later, closed before
 * then, left its timer running past the end of its test. On GitHub's slower
 * runner it fired after the test's window was gone, React threw "window is not
 * defined", and a run whose every test had passed failed (CI #26, 2026-10-05).
 * Thirty-odd screens set timers like it; fixing them one at a time is the
 * habit this replaces.
 *
 * So every timer and interval a test starts — its screens' included — is
 * cleared when the test ends, once its screens are unmounted. Timers set while
 * a file loads, or in `beforeAll`, are not the test's and are left alone. Fake
 * timers are untouched: `vi.useFakeTimers()` replaces these while it is on.
 */
export function clearTimersAfterEachTest(unmount: () => void): void {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const started = new Set<ReturnType<typeof setTimeout>>();

  const setTimeoutTracked = ((handler: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    const id = realSetTimeout((...callArgs: unknown[]) => {
      started.delete(id);
      handler(...callArgs);
    }, delay, ...args);
    started.add(id);
    return id;
  }) as typeof setTimeout;
  // `util.promisify(setTimeout)` keeps working.
  Object.defineProperty(setTimeoutTracked, promisify.custom, {
    value: (realSetTimeout as unknown as Record<symbol, unknown>)[promisify.custom],
  });

  const setIntervalTracked = ((handler: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    const id = realSetInterval(handler, delay, ...args);
    started.add(id);
    return id;
  }) as typeof setInterval;

  globalThis.setTimeout = setTimeoutTracked;
  globalThis.setInterval = setIntervalTracked;
  globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
    if (id !== undefined) started.delete(id);
    realClearTimeout(id);
  }) as typeof clearTimeout;
  globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
    if (id !== undefined) started.delete(id);
    realClearInterval(id);
  }) as typeof clearInterval;

  beforeEach(() => {
    started.clear();
  });
  afterEach(() => {
    unmount();
    for (const id of started) realClearTimeout(id);
    started.clear();
  });
}
