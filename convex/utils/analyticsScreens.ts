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
export const ANALYTICS_PARTS = ["pages", "boxes", "story", "website", "chart", "did"] as const;

/**
 * The orders Ask Hakken can read All pages in, each as the screen's own headings sort it (Anthony, 2026-11-04): read only
 * by most views, it could miss the pages that fell most when they weren't among the most viewed.
 */
export const ALL_PAGES_ORDERS = {
  mostViews: { sort: "views", direction: "desc" },
  mostVisits: { sort: "visits", direction: "desc" },
  lostMostViews: { sort: "viewsChange", direction: "asc" },
  gainedMostViews: { sort: "viewsChange", direction: "desc" },
  lostMostConversions: { sort: "conversionsChange", direction: "asc" },
  gainedMostConversions: { sort: "conversionsChange", direction: "desc" },
} as const;
export type AllPagesOrder = keyof typeof ALL_PAGES_ORDERS;
export const ALL_PAGES_ORDER_NAMES = Object.keys(ALL_PAGES_ORDERS) as AllPagesOrder[];

/** Funnel's orders (funnel-way-1-plan-2026-11-05.md, step 8), by how many people, so a page's size counts: the table's own headings sort by share. */
export const FUNNEL_ORDERS = {
  mostVisits: { sort: "visits", direction: "desc" },
  mostPeopleLeft: { sort: "leftVisits", direction: "desc" },
  mostPeopleStayed: { sort: "onwardVisits", direction: "desc" },
  mostConversions: { sort: "conversions", direction: "desc" },
} as const;
export type FunnelOrder = keyof typeof FUNNEL_ORDERS;
export const FUNNEL_ORDER_NAMES = Object.keys(FUNNEL_ORDERS) as FunnelOrder[];
/** Campaigns' orders (campaigns-new-page-plan-2026-11-05.md, step 9). */
export const CAMPAIGN_ORDERS = {
  mostVisits: { sort: "visits", direction: "desc" },
  gainedMostVisits: { sort: "visitsChange", direction: "desc" },
  lostMostVisits: { sort: "visitsChange", direction: "asc" },
  mostBought: { sort: "bought", direction: "desc" },
  mostConversions: { sort: "conversions", direction: "desc" },
} as const;
export type CampaignOrder = keyof typeof CAMPAIGN_ORDERS;
export const CAMPAIGN_ORDER_NAMES = Object.keys(CAMPAIGN_ORDERS) as CampaignOrder[];
/** Every order Ask Hakken can name, on any list. */
export const LIST_ORDER_NAMES = [...new Set<AllPagesOrder | FunnelOrder | CampaignOrder>([...ALL_PAGES_ORDER_NAMES, ...FUNNEL_ORDER_NAMES, ...CAMPAIGN_ORDER_NAMES])];

/**
 * The further reads a screen's figures come in, each with Convex's second to itself: overview's page panels
 * (calendar-periods audit, 2026-10-21), and a page's four boxes and its story (page-screen-redo-plan-2026-11-03.md),
 * as its screen reads them, and All pages' whole website. Read whole, a page ran past the second.
 */
export function analyticsPartsOf(screen: string): ReadonlyArray<(typeof ANALYTICS_PARTS)[number]> {
  return screen === "overview" ? ["pages"] : screen === "page" ? ["boxes", "story"] : screen === "allPages" ? ["website"] : screen === "landingPages" ? ["boxes", "chart"] : screen === "campaigns" ? ["boxes", "chart", "did"] : [];
}
