/**
 * When the Live page asks Google (docs/plans/active/google-analytics-plan.md
 * GA34, §18.6.7; Anthony, 2026-10-11: "when the pge is not open it does not
 * poll at all right" — right): once a minute, and only while the page is open
 * and in front. Behind another tab, or closed, it asks nothing; after 30
 * minutes with nobody touching it, it pauses until someone carries on. One
 * rule, worked out from the moment, so it can be held exactly by a test.
 */

/** Asked of Google at most this often. */
export const ASK_EVERY_MS = 60_000;
/** Untouched this long, the page stops asking until someone carries on. */
export const PAUSE_AFTER_MS = 30 * 60_000;
/** How often the page checks whether it is time: cheap, never an ask of its own. */
export const CHECK_EVERY_MS = 5_000;

export type LiveMoment = {
  /** Whether the page is in front (`document.visibilityState`). */
  visible: boolean;
  paused: boolean;
  /** An ask already on its way. */
  asking: boolean;
  /** When Google was last asked; null before the first ask, and after a change of what is asked. */
  askedAt: number | null;
  /** When someone last moved, typed, scrolled or touched on the page. */
  touchedAt: number;
  now: number;
};

/** What the page does at this moment: ask Google, wait, or pause. */
export function liveStep(moment: LiveMoment): "ask" | "wait" | "pause" {
  if (moment.paused || moment.asking || !moment.visible) return "wait";
  if (moment.now - moment.touchedAt >= PAUSE_AFTER_MS) return "pause";
  return moment.askedAt === null || moment.now - moment.askedAt >= ASK_EVERY_MS ? "ask" : "wait";
}
