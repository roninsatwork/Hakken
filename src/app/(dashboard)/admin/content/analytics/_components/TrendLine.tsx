import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { everyDay } from "./ReadingChart";

const WIDTH = 96;
const HEIGHT = 24;

/**
 * A row's views by day across the period, as one small line (boards 8 and 10,
 * the Trend column) — new to the screen kit with Analytics. Days with nothing
 * draw as nought; a row with nothing at all draws flat.
 */
export function TrendLine({ days, range, label }: { days: ReadonlyArray<{ day: string; views: number }>; range: { from: string; to: string }; label: string }) {
  const byDay = new Map(days.map((day) => [day.day, day.views]));
  const values = everyDay(range.from, range.to).map((day) => byDay.get(day) ?? 0);
  const most = Math.max(1, ...values);
  const step = values.length > 1 ? WIDTH / (values.length - 1) : WIDTH;
  const points = values.map((value, index) => `${(index * step).toFixed(1)},${(HEIGHT - 2 - (value / most) * (HEIGHT - 4)).toFixed(1)}`).join(" ");
  return (
    <svg data-part="trend-line" role="img" aria-label={label} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block">
      <polyline points={points} fill="none" stroke={CHART_SERIES_ORANGE} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
