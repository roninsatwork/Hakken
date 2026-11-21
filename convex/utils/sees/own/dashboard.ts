import { changeOf, wholeFrom } from "./insightsShared";
import { isNumber, isRow, type OwnFound, type Row } from "./shared";

/**
 * The client Dashboard's own findings (docs/plans/active/dashboard-way-1-plan-2026-11-21.md, "The eye"). It reads the
 * figures the page hands its eye, the `dashboard.dashboardFigures` answer: Google Analytics' visits and what was bought or
 * done, and Search Console's clicks and times shown, each added up over the company's own websites, with the span before.
 * From those it also works out what the four numbers say together: the visits it took for one sale (or one event, with no
 * shop), and the clicks for every 1,000 times shown. Each figure goes by its box's name: sales, events, clicks, times shown. Each is set against the span before and ranked by how far it
 * moved, so the biggest change leads whatever the dates. No database here.
 *
 * A move is kept when it's big enough to trust (`MOVE_LEAST`) on a figure big enough to mean something (`LEAST`), never
 * because the period was quiet. A source switched off for the company hands nothing, so nothing is said about it.
 */
const MOVE_LEAST = 0.02;
/** The least a count must reach, now or before, for its move to be worth saying; and for a rate, its parts' counts. */
const LEAST: Readonly<Record<string, number>> = { visits: 50, events: 5, sales: 5, clicks: 20, impressions: 200 };
const SPAN = "the span before";

type Measure = { now: number; before: number | null };

const measureOf = (value: unknown): Measure | null => {
  if (!isRow(value) || !isNumber(value.now)) return null;
  return { now: value.now, before: isNumber(value.before) ? value.before : null };
};

/** A rate from two counts, now and before: null where either part is too small to trust or has no span before. */
function rateOf(part: Measure | null, whole: Measure | null, partMeasure: string, wholeMeasure: string, scale: number, perPart = false): Measure | null {
  if (!part || !whole || part.before === null || whole.before === null) return null;
  if (part.now < LEAST[partMeasure] || part.before < LEAST[partMeasure] || whole.now < LEAST[wholeMeasure] || whole.before < LEAST[wholeMeasure]) return null;
  // Visits for one purchase divides the whole by the part; clicks for every 1,000 times shown the part by the whole.
  return perPart
    ? { now: whole.now / part.now, before: whole.before / part.before }
    : { now: (scale * part.now) / whole.now, before: (scale * part.before) / whole.before };
}

export function dashboardFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const shop = data.shop === true;
  const add = (list: string, measure: string, figure: Measure | null, counted = true) => {
    if (!figure || figure.before === null || figure.before <= 0) return;
    if (counted && Math.max(figure.now, figure.before) < (LEAST[measure] ?? 0)) return;
    const change = changeOf(figure.now, figure.before);
    if (Math.abs(change) < MOVE_LEAST) return;
    found.push(wholeFrom(list, measure, figure.now, figure.before, Math.min(2, Math.abs(change)), SPAN));
  };
  const analytics = isRow(data.analytics) ? data.analytics : null;
  const console = isRow(data.searchConsole) ? data.searchConsole : null;
  if (analytics) {
    const visits = measureOf(analytics.visits);
    const done = measureOf(analytics.done);
    // The box's own name: Bought counts sales, Events counts events, never "purchases" or "conversions" beside it.
    const doneMeasure = shop ? "sales" : "events";
    add("analytics", "visits", visits);
    add("analytics", doneMeasure, done);
    add("analytics", shop ? "visitsPerSale" : "visitsPerEvent", rateOf(done, visits, doneMeasure, "visits", 1, true), false);
  }
  if (console) {
    const clicks = measureOf(console.clicks);
    const impressions = measureOf(console.impressions);
    add("searchConsole", "clicks", clicks);
    add("searchConsole", "impressions", impressions);
    add("searchConsole", "clicksPerThousand", rateOf(clicks, impressions, "clicks", "impressions", 1000), false);
  }
  return found.sort((a, b) => b.score - a.score);
}

export const DASHBOARD_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "dashboard.home": { general: false, find: dashboardFindings },
};
