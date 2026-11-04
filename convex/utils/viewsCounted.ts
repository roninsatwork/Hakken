/**
 * Whether a span's page views look counted differently from the span before: pages a visit jumping while the visits
 * themselves tell another story (Anthony, 2026-11-04). More Handles' tag most likely sent extra page views until 3
 * September 2026, so on Last 3 months views fell 31.4% while visits rose 6.8%: nearly every page looked like it fell, and
 * most of that was not real. Worked out from a website's own figures, so it needs no date written down and holds for
 * any website. Plain code, for the screen, the eye and Ask Hakken alike, so all three say the same.
 */

type Figures = { views: unknown; viewsBefore: unknown; visits: unknown; visitsBefore: unknown };

export type ViewsCounted = { pagesAVisit: number; pagesAVisitBefore: number };

/** Fewer visits than this in either span, and pages a visit moves by chance. */
const LEAST_VISITS = 500;
/** People rarely change how many pages they look at by a quarter in one go. */
const JUMP = 0.25;
/** A smaller jump counts when views and visits went opposite ways, as no change in what people do explains that. */
const JUMP_OPPOSITE = 0.15;

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

export function viewsCountedDifferently({ views, viewsBefore, visits, visitsBefore }: Figures): ViewsCounted | null {
  if (!positive(views) || !positive(viewsBefore) || !positive(visits) || !positive(visitsBefore)) return null;
  if (visits < LEAST_VISITS || visitsBefore < LEAST_VISITS) return null;
  const now = views / visits;
  const before = viewsBefore / visitsBefore;
  const jump = Math.abs(now - before) / before;
  const opposite = (views - viewsBefore) * (visits - visitsBefore) < 0;
  if (jump < JUMP && !(opposite && jump >= JUMP_OPPOSITE)) return null;
  return { pagesAVisit: oneDecimal(now), pagesAVisitBefore: oneDecimal(before) };
}
