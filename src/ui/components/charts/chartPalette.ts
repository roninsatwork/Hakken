/**
 * Shared ordered series palette for dashboard charts (Recharts pies, bars,
 * lines). Colours are assigned to series by index; keep the order stable so
 * existing charts do not reshuffle.
 */

export const CHART_SERIES_VIOLET = "#8b5cf6";
export const CHART_SERIES_EMERALD = "#10b981";
export const CHART_SERIES_ROSE = "#f43f5e";
export const CHART_SERIES_BLUE = "#3b82f6";
export const CHART_SERIES_AMBER = "#f59e0b";
export const CHART_SERIES_TEAL = "#14b8a6";
export const CHART_SERIES_ORANGE = "#f97316";
export const CHART_SERIES_SLATE = "#94a3b8";

/**
 * Canonical series order. Charts may slice or reorder for local needs.
 *
 * Ordered so no two adjacent series are a red/green pair. The owner cannot
 * tell red from green, and the previous order put emerald at index 1 directly
 * before rose at index 2 — the first two slices of every pie and the first two
 * bars of every stack, in the one combination he cannot read. The engagement
 * ramp below was designed around that from the start; this had not been.
 *
 * Reordering reshuffles the colours of existing charts once. That is the cost,
 * and it is worth paying: the alternative is a legend that only works for
 * other people.
 */
export const CHART_SERIES_PALETTE = [
  CHART_SERIES_VIOLET,
  CHART_SERIES_AMBER,
  CHART_SERIES_BLUE,
  CHART_SERIES_ROSE,
  CHART_SERIES_TEAL,
  CHART_SERIES_ORANGE,
  CHART_SERIES_SLATE,
  CHART_SERIES_EMERALD,
] as const;

/**
 * The admin dashboard's engagement ramp: no sign-in through five-plus
 * sessions, dark to light. Blue on purpose — the owner cannot tell red from
 * green, so intensity carries the scale and the grey marks absence.
 */
export const CHART_ENGAGEMENT_NONE = "#4d4d52";
export const CHART_ENGAGEMENT_RAMP = [
  "#256abf",
  "#3987e5",
  "#6da7ec",
  "#9ec5f4",
  "#cde2fb",
] as const;

/** The dashboard's primary line/area series, and its muted comparator. */
export const CHART_PRIMARY_BLUE = "#3987e5";
export const CHART_COMPARATOR_GREY = "#8a8a90";

/**
 * Recharts prop colours for the board report. Kept as literal hex because the
 * report renders inside ChartExportWrapper: Tailwind v4 compiles opacity
 * shorthands to color-mix(in oklab, …), which html2canvas cannot parse, so
 * anything inside an export boundary paints from these values instead.
 */
export const CHART_EXPORT_BACKGROUND = "#0d0d0d";
export const CHART_AXIS_TICK = "#a3a3a3";
export const CHART_LEGEND_TEXT = "#888";
export const CHART_RISK_RED = "#ef4444";
