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

/** Canonical series order. Charts may slice or reorder for local needs. */
export const CHART_SERIES_PALETTE = [
  CHART_SERIES_VIOLET,
  CHART_SERIES_EMERALD,
  CHART_SERIES_ROSE,
  CHART_SERIES_BLUE,
  CHART_SERIES_AMBER,
  CHART_SERIES_TEAL,
  CHART_SERIES_ORANGE,
  CHART_SERIES_SLATE,
] as const;
