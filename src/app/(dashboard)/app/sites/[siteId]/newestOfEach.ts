/**
 * The headline's figures: the newest day chosen, and any figure it has not got
 * taken from the newest day before it that has. A run that did not buy a
 * figure left the newest day without it, and the Overview showed a dash for a
 * number it held a day earlier (Anthony, 2026-09-25: "you are hiding stuff
 * from me"). A list the day holds nothing in — the AI answers, on a day with
 * a crawl but no answers — has not got it either (docs/plans/active/
 * sites-audit-fixes-plan.md, 2.5).
 */
export function newestOfEach<Point extends object>(points: readonly Point[]): Point | null {
  if (points.length === 0) return null;
  const missing = (value: unknown) => value === undefined || (Array.isArray(value) && value.length === 0);
  const filled: Record<string, unknown> = { ...(points[points.length - 1] as Record<string, unknown>) };
  for (let at = points.length - 2; at >= 0; at -= 1) {
    for (const [key, value] of Object.entries(points[at])) {
      if (missing(filled[key]) && !missing(value)) filled[key] = value;
    }
  }
  return filled as unknown as Point;
}
