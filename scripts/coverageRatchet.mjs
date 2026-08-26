/**
 * Which metrics have cleared the target the floors should climb to.
 *
 * Split out of the block below so it can be tested. `nextRatchet` sat unread
 * for months and then, once read, still had nothing proving it read correctly
 * — and a check nobody can demonstrate firing is indistinguishable from one
 * that does not. It has never fired in anger: on 2026-08-26 the measured
 * platform coverage was still short of every target, which is the honest
 * reason rather than a fault.
 */
export function metricsClearingRatchet(rows, nextRatchet) {
  if (!nextRatchet) return [];

  return rows
    .filter(({ metric, actual }) => nextRatchet[metric] !== undefined && actual >= nextRatchet[metric])
    .map(({ metric, actual }) => ({ metric, actual, target: nextRatchet[metric] }));
}
