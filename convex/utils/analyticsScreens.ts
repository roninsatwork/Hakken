/**
 * The Google Analytics screens Ask Hakken reads, by the names its tool offers
 * (docs/plans/active/google-analytics-plan.md §18.6.8): shared by the tool's
 * handler and its read (`assistantAnalyticsReads.ts`), so the handler never
 * reaches a module that defines functions.
 */
export const ANALYTICS_SCREENS = [
  "overview", "channels", "channel", "campaigns", "adKeywords", "landingPages", "landingPage", "allPages", "page",
  "events", "event", "conversions", "visitors", "products",
] as const;
export type AnalyticsScreen = (typeof ANALYTICS_SCREENS)[number];

/** Every further read a screen may have, each asked on its own after the screen's first. */
export const ANALYTICS_PARTS = ["pages", "boxes", "story"] as const;

/**
 * The further reads a screen's figures come in, each with Convex's second to itself: overview's page panels
 * (calendar-periods audit, 2026-10-21), and a page's four boxes and its story (page-screen-redo-plan-2026-11-03.md),
 * as its screen reads them. Read whole, a page ran past the second.
 */
export function analyticsPartsOf(screen: string): ReadonlyArray<(typeof ANALYTICS_PARTS)[number]> {
  return screen === "overview" ? ["pages"] : screen === "page" ? ["boxes", "story"] : [];
}
