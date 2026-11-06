/**
 * Whole numbers that add up to exactly `cells`: each value's share, with the biggest leftovers given the spare ones, so
 * nothing rounds past or short of the total (overview-new-page-plan-2026-11-06.md, shared parts). The squares, the bands,
 * the eye and Ask Hakken all use it, so they say the same whole numbers. All nought comes back all nought.
 */
export function outOfTotal(values: readonly number[], cells = 100): number[] {
  const whole = values.reduce((total, value) => total + Math.max(0, value), 0);
  if (whole <= 0 || cells <= 0) return values.map(() => 0);
  const exact = values.map((value) => (cells * Math.max(0, value)) / whole);
  const counts = exact.map(Math.floor);
  let spare = cells - counts.reduce((total, value) => total + value, 0);
  // The biggest leftover first; a tie goes to the bigger value, then the one earlier in the list, so the answer never changes.
  const order = exact
    .map((value, at) => ({ at, left: value - Math.floor(value), value }))
    .sort((one, other) => other.left - one.left || other.value - one.value || one.at - other.at);
  for (const { at } of order) {
    if (spare <= 0) break;
    counts[at] += 1;
    spare -= 1;
  }
  return counts;
}
