import { bestFor, biggestChange } from "./channelPicks";

/**
 * Channels' four boxes (channels-new-page-plan-2026-11-06.md, step 3), worked out in one place from the list of channels and Google's
 * own total for the whole website, so the page, the eye and Ask Hakken can't disagree. Biggest change and the best for its visits are
 * the rule Overview shares (`channelPicks.ts`). A shop counts what was bought; any other website counts its events. A box with
 * nothing true to say is null, for the page to show a dash.
 */

export type ChannelBoxRow = {
  key: string;
  visits: number;
  /** Null when the dates before aren't held. */
  visitsBefore: number | null;
  /** What was bought, on a shop; events, on any other website. */
  done: number;
};

export type ChannelBoxes = {
  mostVisits: { key: string; visits: number; sharePercent: number | null } | null;
  mostDone: { key: string; done: number; sharePercent: number | null } | null;
  bestFor: { key: string; per100: number; sitePer100: number | null } | null;
  biggestChange: { key: string; change: number } | null;
};

/** A part of Google's own whole, as a percentage: a list counted on its own can come to a little more than the whole, so never past 100. */
function sharePercent(part: number, whole: number | null): number | null {
  return whole !== null && whole > 0 ? Math.min(100, (100 * part) / whole) : null;
}

/** The biggest by a figure, the bigger channel first in a tie, then the name. None if nothing has any. */
function biggestBy(rows: readonly ChannelBoxRow[], figure: (row: ChannelBoxRow) => number): ChannelBoxRow | null {
  const ranked = rows.filter((row) => figure(row) > 0).sort((left, right) => figure(right) - figure(left) || right.visits - left.visits || left.key.localeCompare(right.key));
  return ranked[0] ?? null;
}

export function channelBoxes(rows: readonly ChannelBoxRow[], site: { visits: number | null; done: number | null }): ChannelBoxes {
  const mostVisits = biggestBy(rows, (row) => row.visits);
  const mostDone = biggestBy(rows, (row) => row.done);
  const picks = rows.map((row) => ({ key: row.key, visits: row.visits, visitsBefore: row.visitsBefore, wins: row.done }));
  const best = bestFor(picks);
  return {
    mostVisits: mostVisits ? { key: mostVisits.key, visits: mostVisits.visits, sharePercent: sharePercent(mostVisits.visits, site.visits) } : null,
    mostDone: mostDone ? { key: mostDone.key, done: mostDone.done, sharePercent: sharePercent(mostDone.done, site.done) } : null,
    bestFor: best ? { key: best.key, per100: best.per100, sitePer100: site.visits && site.done !== null ? (100 * site.done) / site.visits : null } : null,
    biggestChange: biggestChange(picks),
  };
}

/**
 * A figure for every 100 visits as the page says it: whole from 10 up, to one decimal under it (`formatPer100`), so the box, the
 * eye and Ask Hakken read the same.
 */
export function per100Words(per100: number): string {
  return per100 >= 10 ? String(Math.round(per100)) : per100.toFixed(1);
}
