/**
 * The Bing Webmaster screens Ask Hakken reads (docs/plans/active/
 * bing-webmaster-plan.md BW13): here, apart from the reads, so the tool's
 * handler names them without reaching a module that defines functions.
 */
export const BING_SCREENS = ["performance", "keywords", "pages", "versus", "crawling"] as const;
export type BingScreen = (typeof BING_SCREENS)[number];
