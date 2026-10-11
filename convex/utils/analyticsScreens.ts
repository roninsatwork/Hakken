/**
 * The Google Analytics screens Ask Hakken reads, by the names its tool offers
 * (docs/plans/active/google-analytics-plan.md §18.6.8): shared by the tool's
 * handler and its read (`assistantAnalyticsReads.ts`), so the handler never
 * reaches a module that defines functions.
 */
export const ANALYTICS_SCREENS = [
  "overview", "channels", "channel", "campaigns", "adKeywords", "landingPages", "landingPage", "allPages", "page",
  "events", "event", "conversions", "visitors", "products", "heroes",
] as const;
export type AnalyticsScreen = (typeof ANALYTICS_SCREENS)[number];
