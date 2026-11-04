import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { newestOfEach } from "../[siteId]/newestOfEach";

type Line = FunctionReturnType<typeof api.siteCharts.siteSeries>[number];
type Point = Line["points"][number];

/**
 * A Visibility page's figures for the eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10): the newest
 * check in the dates chosen, each figure from the newest day that has it as the panels read it (`newestOfEach`), and
 * the check before the dates — the panels' own "before" — or, where none came before, the first check in the dates,
 * which the chart draws. Only the figures named, by the names the rules read them under; never a guessed money figure
 * (decision 4: the adverts' cost and what visits would be worth stay stored, unshown). Null with no check in the dates.
 */
export function checksFor(line: Line | null | undefined, fields: Readonly<Record<string, (point: Point) => number | null | undefined>>, names: Record<string, string> = {}) {
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
export function rivalChecksFor(lines: readonly Line[] | null | undefined, fields: Readonly<Record<string, (point: Point) => number | null | undefined>>) {
  return (lines ?? []).filter((line) => !line.isYou).flatMap((line) => {
    const checks = checksFor(line, fields);
    return checks ? [{ name: line.host, now: checks.now, ...(checks.before ? { before: checks.before } : {}) }] : [];
  });
}
