import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

/**
 * What a function's answer holds in memory, as Convex's 64 MB a query counts
 * it (core-data-normalisation-plan.md, step 4b): the objects it keeps and the
 * typed arrays behind them, once every piece of garbage is collected. A list
 * read as columns keeps everything it worked with until its rows are asked
 * for (`ListRows`), so what it holds is what it held at its fullest.
 *
 * Node's own `gc`, switched on for the test that asks; the figure is the
 * difference, so the rest of the test's memory is not counted.
 */
let collector: (() => void) | null = null;

function collect(): void {
  if (!collector) {
    setFlagsFromString("--expose-gc");
    collector = runInNewContext("gc") as () => void;
  }
  collector();
}

const inUse = () => {
  const memory = process.memoryUsage();
  return memory.heapUsed + memory.arrayBuffers;
};

/** How many times `heldBy` measures: the least is the answer's own, as anything else alive in the worker only adds. */
export const HELD_MEASURES = 3;

/**
 * Measured `HELD_MEASURES` times, keeping the least (20 November 2026): in a full run, other work still alive in the same
 * worker is counted with the answer. Pages competing for the last 12 months held 24.8 MB alone and read 33.7 MB once in a
 * full run, past its 33.5 MB line, and passed the run before. `make` is asked each time, so it may only read; a test that
 * also counts what it reads (`metered`) counts it in a call of its own, outside this.
 */
export async function heldBy<T>(make: () => Promise<T>): Promise<{ value: T; bytes: number }> {
  let least: { value: T; bytes: number } | null = null;
  for (let at = 0; at < HELD_MEASURES; at += 1) {
    collect();
    const before = inUse();
    const value = await make();
    collect();
    const bytes = inUse() - before;
    if (least === null || bytes < least.bytes) least = { value, bytes };
  }
  return least!;
}
