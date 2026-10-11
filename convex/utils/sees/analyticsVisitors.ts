import { seen, toPage, type Seen } from "../hakkenSees";

/**
 * What Hakken sees on Visitors (docs/plans/active/google-analytics-plan.md
 * §18.7, GA24): fixed rules over the figures the screen's own read already
 * reads (`googleAnalyticsVisitorReads.ts`), as `analytics.ts` holds the other
 * screens' — apart to keep each module inside its size. Words under
 * `googleAnalytics.seen.visitors`.
 */

/** Returning visits under this are too few to weigh their conversions against new visitors'. */
export const RETURNING_VISITS_FLOOR = 30;
/** A browser with this share of visits or more is worth a sentence when it engages less. */
export const BROWSER_SHARE = 0.2;
/** Engagement this far under the website's reads as engaging less. */
export const BROWSER_GAP = 0.05;

/** Visits and conversions of new or of returning visitors. */
type Group = { visits: number; conversions: number };

export type VisitorFacts = {
  people: number;
  visits: number;
  /** Engaged visits, all told: the website's engagement a browser is weighed against. */
  engaged: number;
  newPeople: number;
  newVisitors: Group | null;
  returning: Group | null;
  browsers: ReadonlyArray<{ label: string; visits: number; engaged: number }>;
  /** Google signals, read from the age and gender lists: "off" when every row of both is unknown; null before they are read. */
  signals: "on" | "off" | null;
  /** Google held back small groups (`subjectToThresholding`). */
  thresholded: boolean;
};

const rateOf = (group: Group | null) => (group && group.visits > 0 ? group.conversions / group.visits : 0);

/**
 * Visitors: people and visits, and the share new; returning visitors
 * converting at least twice the new ones' rate (30 returning visits or more);
 * a browser with a fifth of visits or more engaging 5 points or more below
 * the website; age, gender and interests empty because Google signals is off;
 * groups hidden by Google. Then give returning visitors a reason to get in
 * touch, and check the website on that browser.
 */
export function visitorsSees(facts: VisitorFacts): Seen {
  const { people, visits, engaged, newPeople, newVisitors, returning, browsers, signals, thresholded } = facts;
  if (visits === 0) return seen([{ code: "none" }]);
  const returningRate = rateOf(returning);
  const newRate = rateOf(newVisitors);
  const comeBack = returning !== null && returning.visits >= RETURNING_VISITS_FLOOR && returningRate > 0 && returningRate >= 2 * newRate;
  const site = engaged / visits;
  const lagging = [...browsers]
    .filter((browser) => browser.visits > 0 && browser.visits / visits >= BROWSER_SHARE && site - browser.engaged / browser.visits >= BROWSER_GAP)
    .sort((left, right) => right.visits - left.visits)[0] ?? null;
  return seen([
    { code: "people", a: people, b: visits, c: people > 0 ? Math.min(1, newPeople / people) : 0 },
    comeBack && { code: "returnersConvert", a: returning.visits, b: returningRate, c: newRate },
    lagging && { code: "browserLags", text: lagging.label, a: lagging.visits / visits, b: lagging.engaged / lagging.visits, c: site },
    signals === "off" && { code: "signalsOff" },
    thresholded && { code: "hidden" },
  ], [
    comeBack && { code: "reasonToReturn", link: "conversions", to: toPage("conversions") },
    lagging && { code: "checkBrowser", text: lagging.label, link: "events", to: toPage("events") },
  ]);
}
