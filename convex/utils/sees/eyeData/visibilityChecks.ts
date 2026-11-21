import type { Point } from "../../../siteFigures";

/**
 * A Visibility screen's checks, as its panels and its eye read them: the newest figures of the dates chosen and the
 * check before them. Shared by the screens and by a chat app's question (`chatAppEyes/visibility.ts`), so the two read a
 * line the same way (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B).
 */

/** A website's line as `siteCharts.siteSeries` answers it. */
export type SiteLine = { host: string; isYou: boolean; points: Point[]; before: Point | null };
export type SitePoint = Point;

/**
 * The headline's figures: the newest day chosen, and any figure it has not got
 * taken from the newest day before it that has. A run that did not buy a
 * figure left the newest day without it, and the Overview showed a dash for a
 * number it held a day earlier (Anthony, 2026-09-25: "you are hiding stuff
 * from me"). A list the day holds nothing in — the AI answers, on a day with
 * a crawl but no answers — has not got it either (docs/plans/active/
 * sites-audit-fixes-plan.md, 2.5).
 */
export function newestOfEach<Shape extends object>(points: readonly Shape[]): Shape | null {
  if (points.length === 0) return null;
  const missing = (value: unknown) => value === undefined || (Array.isArray(value) && value.length === 0);
  const filled: Record<string, unknown> = { ...(points[points.length - 1] as Record<string, unknown>) };
  for (let at = points.length - 2; at >= 0; at -= 1) {
    for (const [key, value] of Object.entries(points[at])) {
      if (missing(filled[key]) && !missing(value)) filled[key] = value;
    }
  }
  return filled as unknown as Shape;
}

/**
 * A Visibility page's figures for the eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10): the newest
 * check in the dates chosen, each figure from the newest day that has it as the panels read it (`newestOfEach`), and
 * the check before the dates — the panels' own "before" — or, where none came before, the first check in the dates,
 * which the chart draws. Only the figures named, by the names the rules read them under; never a guessed money figure
 * (decision 4: the adverts' cost and what visits would be worth stay stored, unshown). Null with no check in the dates.
 */
export function checksFor(line: SiteLine | null | undefined, fields: Readonly<Record<string, (point: Point) => number | null | undefined>>, names: Record<string, string> = {}) {
  const points = line?.points ?? [];
  const now = newestOfEach(points);
  if (!line || !now) return null;
  const before = line.before ?? (points.length > 1 ? points[0] : null);
  const pick = (point: Point) => Object.fromEntries(Object.entries(fields).flatMap(([name, read]) => {
    const value = read(point);
    return value === null || value === undefined ? [] : [[name, value]];
  }));
  return {
    now: { day: now.lastDay, ...pick(now) },
    ...(before ? { before: { day: before.lastDay, ...pick(before) } } : {}),
    names,
  };
}

/** The same check for a rival's line, named by its host: the side-by-side pages' rivals. */
export function rivalChecksFor(lines: readonly SiteLine[] | null | undefined, fields: Readonly<Record<string, (point: Point) => number | null | undefined>>) {
  return (lines ?? []).filter((line) => !line.isYou).flatMap((line) => {
    const checks = checksFor(line, fields);
    return checks ? [{ name: line.host, now: checks.now, ...(checks.before ? { before: checks.before } : {}) }] : [];
  });
}
