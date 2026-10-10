import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";

/** Each measure's colour, the same on every Analytics chart. */
export const MEASURE_COLOURS = {
  views: CHART_SERIES_ORANGE,
  reads: CHART_SERIES_BLUE,
  clicks: CHART_SERIES_VIOLET,
  answers: CHART_SERIES_AMBER,
  readers: CHART_SERIES_ORANGE,
  companies: CHART_SERIES_BLUE,
} as const;

/** A count in a table or figure. */
export const count = (value: number) => value.toLocaleString("en-GB");

/** The change on the period before, as a whole percentage; null when there was nothing before. */
export function changeOn(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

