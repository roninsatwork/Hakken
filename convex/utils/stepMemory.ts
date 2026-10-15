/**
 * How much memory a step holds, as its runtime says (collection-reliability-plan.md, RR5): the
 * Node runtime's resident size in MB, which Convex stops at 512; null in the default runtime,
 * which has no such count.
 */
export function memoryMb(): number | null {
  try {
    const usage = (globalThis as { process?: { memoryUsage?: () => { rss: number } } }).process?.memoryUsage?.();
    return usage ? Math.round(usage.rss / 1_048_576) : null;
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
