/**
 * The colours this section is allowed to use.
 *
 * Never red against green. Anthony is red/green colour blind, and a compliance
 * screen that encodes "fine" and "not fine" on that axis is unreadable to the
 * person it was built for. Everything here sits on blue/amber/orange with a
 * brightness gap between neighbours, and every band on every chart carries a
 * text label and a figure beside it — the colour only draws the eye, the words
 * carry the meaning.
 *
 * Held in one place rather than inline so a later chart cannot quietly
 * reintroduce the pair.
 */

export const RUN_OUTCOME_COLOURS = {
  finished: "#2a78d6",
  waited: "#c98500",
  unfinished: "#d95926",
} as const;

/**
 * Deliberately no green.
 *
 * Green sitting next to amber and orange in the same bar is the one pairing
 * this palette exists to avoid, and the first build had it — the bar read as
 * three colours to me and two to the person it was built for.
 */
export const SIDE_EFFECT_COLOURS = {
  read: "#2a78d6",
  write: "#9085e9",
  external: "#c98500",
  destructive: "#d95926",
} as const;

export const RISK_COLOURS = {
  high: "#d95926",
  medium: "#c98500",
  low: "#2a78d6",
  unrated: "#898781",
} as const;
