import { seen, toPage, type Seen } from "../hakkenSees";

/**
 * What Hakken sees on Visits (docs/plans/active/visits-redo-plan-2026-11-03.md, step 2; before that Visitors,
 * google-analytics-plan.md §18.7, GA24): fixed rules over the figures the screen's own read already reads
 * (`googleAnalyticsVisitorReads.ts`), as `analytics.ts` holds the other screens' — apart to keep each module inside its
 * size. Every figure in visits, never people (Anthony, 2026-11-03: "change the page to visits"). Words under
 * `googleAnalytics.seen.visitors`.
 *
 * No rule weighs new against returning visitors' conversions: the lists count every conversion, not visits that
 * converted, so a rate could pass 100% (More Handles' returning visits, October 2026: 11,809 from 9,510). It comes back
 * once visits that converted are kept for new and returning visitors.
 */

/** A browser with this share of visits or more is worth a sentence when it engages less. */
export const BROWSER_SHARE = 0.2;
/** Engagement this far under the website's reads as engaging less. */
export const BROWSER_GAP = 0.05;
/** Returning visits under this are too few to say where they land. */
export const RETURNING_VISITS_FLOOR = 30;
/** A returning visitors' landing worth a sentence: this share of their visits on one kind of page, or more. */
export const RETURNING_LAND_SHARE = 0.4;

export type VisitorFacts = {
  visits: number;
  /** Visits from people new to the website. */
  newVisits: number;
  /** Engaged visits, all told: the website's engagement a browser is weighed against. */
  engaged: number;
  browsers: ReadonlyArray<{ label: string; visits: number; engaged: number }>;
  /** Google signals, read from the age and gender lists: "off" when every row of both is unknown; null before they are read. */
  signals: "on" | "off" | null;
  /** Google held back small groups (`subjectToThresholding`). */
  thresholded: boolean;
  /**
   * The classification most of the returning visitors' visits started on, and its share
   * (ga-conversions-visitors-plan.md CV7); null before landing pages by new or returning are kept.
   */
  returningLands?: { kind: string; share: number; visits: number } | null;
};

/**
 * Visits: the visits and the share from new visitors; a browser with a fifth of visits or more engaging 5 points or
 * more below the website; age, gender and interests empty because Google signals is off; where returning visits start
 * most; groups Google held back. Then check the website on that browser.
 */
export function visitorsSees(facts: VisitorFacts): Seen {
  const { visits, newVisits, engaged, browsers, signals, thresholded } = facts;
  const lands = facts.returningLands ?? null;
  const landed = lands && lands.visits >= RETURNING_VISITS_FLOOR && lands.share >= RETURNING_LAND_SHARE ? lands : null;
  if (visits === 0) return seen([{ code: "none" }]);
  const site = engaged / visits;
  const lagging = [...browsers]
    .filter((browser) => browser.visits > 0 && browser.visits / visits >= BROWSER_SHARE && site - browser.engaged / browser.visits >= BROWSER_GAP)
    .sort((left, right) => right.visits - left.visits)[0] ?? null;
  return seen([
    { code: "visits", a: visits, b: Math.min(1, newVisits / visits) },
    lagging && { code: "browserLags", text: lagging.label, a: lagging.visits / visits, b: lagging.engaged / lagging.visits, c: site },
    signals === "off" && { code: "signalsOff" },
    // Where returning visitors land (CV7): after what is wrong or missing, before the groups Google held back.
    landed && { code: "returningLand", text: landed.kind, a: landed.share },
    thresholded && { code: "hidden" },
  ], [
    // Events are part of Conversions (ga-conversions-visitors-plan.md CV1).
    lagging && { code: "checkBrowser", text: lagging.label, link: "conversions", to: toPage("conversions") },
  ]);
}
