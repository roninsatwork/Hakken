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

export async function heldBy<T>(make: () => Promise<T>): Promise<{ value: T; bytes: number }> {
  collect();
  const before = inUse();
  const value = await make();
  collect();
  return { value, bytes: inUse() - before };
}
