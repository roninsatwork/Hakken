/**
 * A record of which bounded reads ran out of room.
 *
 * Every analytics figure on this platform is worked out by reading a batch of
 * rows under a cap, and a cap that is reached looks exactly like a cap that is
 * not: `.take(n)` returning n rows cannot tell a busy month from an exhausted
 * one. So a screen showing a short number and a screen showing a true number
 * were indistinguishable, and the short one never said so.
 *
 * The fix is one row: ask for `limit + 1` and keep the extra only as evidence.
 * Getting it back is the only proof there was more. The figures are still
 * returned when that happens — an incomplete month is worth more than a blank
 * screen, and the numbers stay directionally true — but they stop claiming to
 * be totals, and the screen can say so.
 *
 * Labels are deduplicated because a capped read inside a loop would otherwise
 * report itself once per iteration.
 */
export type ReadCoverage = {
  complete: boolean;
  incomplete: string[];
};

export function createCoverage() {
  const incomplete = new Set<string>();

  return {
    /** Returns the rows without the evidence row, noting the label if it was there. */
    cap<T>(label: string, limit: number, rows: T[]): T[] {
      if (rows.length <= limit) return rows;
      incomplete.add(label);
      return rows.slice(0, limit);
    },
    result(): ReadCoverage {
      return {
        complete: incomplete.size === 0,
        incomplete: Array.from(incomplete).sort(),
      };
    },
  };
}
