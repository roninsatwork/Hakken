/**
 * The headline's figures: the newest day chosen, and any figure it has not got
 * taken from the newest day before it that has. A run that did not buy a
 * figure left the newest day without it, and the Overview showed a dash for a
 * number it held a day earlier (Anthony, 2026-09-25: "you are hiding stuff
 * from me").
 */
export function newestOfEach<Point extends object>(points: readonly Point[]): Point | null {
  if (points.length === 0) return null;
  const filled: Record<string, unknown> = { ...(points[points.length - 1] as Record<string, unknown>) };
  for (let at = points.length - 2; at >= 0; at -= 1) {
    for (const [key, value] of Object.entries(points[at])) {
      if (filled[key] === undefined && value !== undefined) filled[key] = value;
    }
  }
  return filled as unknown as Point;
}
