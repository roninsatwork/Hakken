/**
 * The Search Console screens Ask Hakken reads (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6: "Ask Hakken
 * reads only the website's totals and can't read a keyword at all"): here, apart from the reads, so the tool's handler
 * names them without reaching a module that defines functions. `performance` is the overview.
 */
export const SEARCH_CONSOLE_SCREENS = [
  "performance", "keywords", "pages", "brand", "bands", "ctrCurve", "services", "updates", "newLost", "volatility", "keyword", "page",
] as const;
export type SearchConsoleScreen = (typeof SEARCH_CONSOLE_SCREENS)[number];

/** Each screen's address under the website's Search Console section. */
export const SEARCH_CONSOLE_SEGMENT: Record<SearchConsoleScreen, string> = {
  performance: "", keywords: "keywords", pages: "pages", brand: "brand-and-non-brand", bands: "position-bands", ctrCurve: "click-rate-by-position",
  services: "demand-by-service", updates: "google-updates", newLost: "new-and-lost", volatility: "volatility", keyword: "keywords/keyword", page: "pages/page",
};
