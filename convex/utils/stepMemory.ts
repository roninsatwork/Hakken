/**
 * How much memory a step holds, as its runtime says (collection-reliability-plan.md, RR5): in the
 * Node runtime, the memory the step's own objects take — the JavaScript heap in use and the
 * buffers beside it — in MB; null in the default runtime, which has no such count.
 *
 * Not the process's resident size, which this read until 2026-10-15: that counts Convex's own
 * loaded code and whatever an earlier action in the same warm runtime left behind, and stays at its
 * highest — a 50-page rehearsal's steps read 330 to 410 MB by it, so every website's run said it
 * was near its limit. What a website's size moves is the heap in use.
 */
export function memoryMb(): number | null {
  try {
    const usage = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number; arrayBuffers?: number } } }).process?.memoryUsage?.();
    return usage ? Math.round((usage.heapUsed + (usage.arrayBuffers ?? 0)) / 1_048_576) : null;
  } catch {
    return null;
  }
}

/** The most memory a step may hold: Convex's Node runtime stops an action past it. */
export const STEP_MEMORY_MB = 512;

/** Half of it: a step past this writes a warning line, so a website growing towards the limit shows long before it fails. */
export const MEMORY_WARNING_MB = STEP_MEMORY_MB / 2;

/** A step's memory as a field for its chain's notes (`collectionSteps.ts`): none in the default runtime. */
export function memoryNow(): { memoryMb?: number } {
  const mb = memoryMb();
  return mb === null ? {} : { memoryMb: mb };
}
