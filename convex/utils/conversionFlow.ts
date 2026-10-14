/**
 * Conversions' flow and Visitors' grid (docs/plans/active/ga-conversions-visitors-plan.md
 * CV3, CV7): the keys the read and the screens share — a box past the busiest
 * channels or groups, and the visits that ended without any listed event.
 * Plain values, no Convex, so the screens can name them.
 */

/** The flow's and grid's box past the busiest channels or visitor groups. */
export const FLOW_MORE = "~more";

/** How a visit ended without any listed event. */
export const FLOW_LEFT = "~left";
