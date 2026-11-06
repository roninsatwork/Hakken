/**
 * Which channel a box names, in one place (overview-new-page-plan-2026-11-06.md,
 * step 5; channels-new-page-plan-2026-11-06.md, step 3): Overview's and Channels'
 * boxes, the eye and Ask Hakken all read these, so they can't disagree.
 */

/** Under this many visits a channel's rate moves by chance: 1 sale from 9 visits isn't "sells best". */
export const BEST_FOR_FLOOR = 100;

export type ChannelFigures = {
  key: string;
  visits: number;
  /** Null when the dates before aren't held. */
  visitsBefore: number | null;
  /** What it's being judged on: sales on a shop, events on a service website. */
  wins: number;
};

/** The channel whose visits moved most against the dates before, up or down. The bigger channel wins a tie, then the name. */
export function biggestChange(rows: readonly ChannelFigures[]): { key: string; change: number } | null {
  let best: { key: string; change: number; visits: number } | null = null;
  for (const row of rows) {
    if (row.visitsBefore === null) continue;
    const change = row.visits - row.visitsBefore;
    if (change === 0) continue;
    const better = best === null
      || Math.abs(change) > Math.abs(best.change)
      || (Math.abs(change) === Math.abs(best.change) && (row.visits > best.visits || (row.visits === best.visits && row.key < best.key)));
    if (better) best = { key: row.key, change, visits: row.visits };
  }
  return best ? { key: best.key, change: best.change } : null;
}

/** The channel with the most wins for every 100 visits, among those with enough visits to trust. None if nothing was won. */
export function bestFor(rows: readonly ChannelFigures[], floor = BEST_FOR_FLOOR): { key: string; per100: number } | null {
  let best: { key: string; per100: number; visits: number } | null = null;
  for (const row of rows) {
    if (row.visits < floor || row.wins <= 0) continue;
    const per100 = (row.wins / row.visits) * 100;
    const better = best === null || per100 > best.per100 || (per100 === best.per100 && (row.visits > best.visits || (row.visits === best.visits && row.key < best.key)));
    if (better) best = { key: row.key, per100, visits: row.visits };
  }
  return best ? { key: best.key, per100: best.per100 } : null;
}
