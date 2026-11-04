/**
 * The Visibility screens Ask Hakken reads (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10: "today it can't
 * read any Visibility list and draws only websites and positions at the newest check"): here, apart from the reads, so
 * the tool's handler names them without reaching a module that defines functions. `overview` is the website's Overview.
 * Built with Visibility's second half; Backlinks, Keywords and Keyword research are read from their own screens' reads
 * once added here.
 */
export const VISIBILITY_SCREENS = [
  "overview", "googleAbove", "googleFeatures", "googleMoves", "googleSearches",
  "competitors", "competitorsMap", "competitorsRival",
  "aiDemand", "aiMentions", "aiShare", "radar",
  "mentions", "mentionsRivals", "reviews", "reviewsRivals",
  "paid", "audit",
] as const;
export type VisibilityScreen = (typeof VISIBILITY_SCREENS)[number];

/** Each screen's address under the website's Visibility section. */
export const VISIBILITY_SEGMENT: Record<VisibilityScreen, string> = {
  overview: "", googleAbove: "google/above", googleFeatures: "google/features", googleMoves: "google/moves", googleSearches: "google/searches",
  competitors: "competitors", competitorsMap: "competitors/map", competitorsRival: "competitors/rival",
  aiDemand: "ai/demand", aiMentions: "ai/mentions", aiShare: "ai/share-of-voice", radar: "radar",
  mentions: "mentions", mentionsRivals: "mentions/rivals", reviews: "reviews", reviewsRivals: "reviews/rivals",
  paid: "paid", audit: "audit",
};

/**
 * The screens whose figures follow the date menu (`sitePages.ts`, `DATED_SEGMENTS`): read over the period asked. The
 * rest show their newest check, or the last 12 months, whatever the dates.
 */
export const VISIBILITY_DATED: ReadonlySet<VisibilityScreen> = new Set([
  "overview", "googleFeatures", "googleMoves", "googleSearches", "competitors", "competitorsRival", "aiMentions",
  "mentions", "mentionsRivals", "reviews", "reviewsRivals", "paid", "audit",
]);

/** The figures a Visibility line chart can draw for the website and its rivals over time. */
export const VISIBILITY_LINE_MEASURES = ["estimatedVisitors", "searches", "topThree", "linkingWebsites"] as const;
export type VisibilityLineMeasure = (typeof VISIBILITY_LINE_MEASURES)[number];
