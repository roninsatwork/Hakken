/**
 * The pace at which a streamed reply is revealed on screen.
 *
 * The database is written in lumps on purpose — at most one write per 250ms,
 * to keep a fast model from flooding it — so the raw arrivals read as blocks
 * landing, not as an answer being written. These functions turn those lumps
 * back into typing: reveal at a readable pace, speed up when the backlog
 * grows so the screen never trails far behind what has actually arrived, and
 * finish promptly once the stream closes instead of snapping.
 *
 * Pure so the pacing can be tested without a browser or a timer.
 */

/** Base reveal pace. Reading speed, not teletype cosplay. */
export const REVEAL_BASE_CHARS_PER_SECOND = 90;

/**
 * The screen may trail what has arrived by at most this long. A big lump
 * landing raises the pace until the lag is back under the ceiling.
 */
export const REVEAL_MAX_LAG_MS = 1200;

/**
 * Once the stream has closed there is nothing left to wait for; whatever
 * remains unrevealed is finished within this window.
 */
export const REVEAL_CLOSING_MS = 400;

export function nextRevealCount(args: {
  revealed: number;
  targetLength: number;
  elapsedMs: number;
  isStreamClosed: boolean;
}): number {
  const target = Math.max(0, args.targetLength);

  // The finish patch stores the trimmed text, which can be shorter than the
  // sum of the fragments; never hold the count above what now exists.
  if (args.revealed >= target) return target;

  const backlog = target - args.revealed;

  let charsPerSecond = Math.max(
    REVEAL_BASE_CHARS_PER_SECOND,
    (backlog * 1000) / REVEAL_MAX_LAG_MS,
  );
  if (args.isStreamClosed) {
    charsPerSecond = Math.max(charsPerSecond, (backlog * 1000) / REVEAL_CLOSING_MS);
  }

  const step = Math.floor((charsPerSecond * Math.max(0, args.elapsedMs)) / 1000);
  return Math.min(target, args.revealed + step);
}
