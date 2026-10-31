/**
 * The figures a page's findings may speak of, by the name its query gives them (docs/plans/active/sees-every-page-plan-2026-10-31.md,
 * phase 3): each in plain words, whether it is a count or a percentage, and its key in the panel's words
 * (`ui.hakkenSees.measures.<key>`). A figure not named here is never a finding: a finding in a name the reader does not
 * know is worse than none. One list for every section, so the same figure reads the same way on every page.
 */

export type Measure = {
  /** The words for the writer: "clicks from Google". */
  words: string;
  kind: "count" | "percent";
  /** A figure where less is better (errors, angry clicks): its rise is the bad news. */
  lessIsBetter?: boolean;
  /** A percentage's own base, where its row holds it: a click rate is of the times shown, a conversion rate of the visits. */
  weighBy?: string;
};

/** Counts, most telling first: a table's main figure is the first of these it holds. */
const COUNTS: Record<string, Measure> = {
  conversions: { words: "conversions", kind: "count" },
  purchases: { words: "purchases", kind: "count" },
  visitsThatDidIt: { words: "visits that converted", kind: "count" },
  clicks: { words: "clicks", kind: "count" },
  visits: { words: "visits", kind: "count" },
  sessions: { words: "visits", kind: "count" },
  views: { words: "views", kind: "count" },
  users: { words: "people", kind: "count" },
  people: { words: "people", kind: "count" },
  estimatedTraffic: { words: "estimated visitors from Google", kind: "count" },
  traffic: { words: "estimated visitors from Google", kind: "count" },
  etv: { words: "estimated visitors from Google", kind: "count" },
  impressions: { words: "times shown", kind: "count" },
  keywords: { words: "searches ranked for", kind: "count" },
  searches: { words: "searches", kind: "count" },
  rankedKeywordsTotal: { words: "searches ranked for", kind: "count" },
  top3: { words: "searches in Google's top 3", kind: "count" },
  pages: { words: "pages", kind: "count" },
  backlinks: { words: "links", kind: "count" },
  referringDomains: { words: "linking websites", kind: "count" },
  linkingWebsites: { words: "linking websites", kind: "count" },
  domains: { words: "linking websites", kind: "count" },
  mentions: { words: "mentions", kind: "count" },
  named: { words: "AI answers naming it", kind: "count" },
  recommended: { words: "AI answers recommending it", kind: "count" },
  cited: { words: "AI answers citing it", kind: "count" },
  reviews: { words: "reviews", kind: "count" },
  volume: { words: "monthly searches", kind: "count" },
  searchVolume: { words: "monthly searches", kind: "count" },
  addToCarts: { words: "basket additions", kind: "count" },
  // A shop's steps, as the Products screen names them.
  bought: { words: "purchases", kind: "count" },
  checkout: { words: "checkouts started", kind: "count" },
  basket: { words: "basket additions", kind: "count" },
  looks: { words: "product views", kind: "count" },
  looked: { words: "visits that looked at a product", kind: "count" },
  itemsViewed: { words: "product views", kind: "count" },
  itemsPurchased: { words: "products bought", kind: "count" },
  crawled: { words: "pages read by the search engine", kind: "count" },
  inIndex: { words: "pages in the index", kind: "count" },
  errors: { words: "errors", kind: "count", lessIsBetter: true },
  errorClicks: { words: "clicks that hit an error", kind: "count", lessIsBetter: true },
  quickBack: { words: "quick backs", kind: "count", lessIsBetter: true },
  rage: { words: "angry clicks", kind: "count", lessIsBetter: true },
  dead: { words: "dead clicks", kind: "count", lessIsBetter: true },
  brokenBacklinks: { words: "broken links", kind: "count", lessIsBetter: true },
  issues: { words: "problems", kind: "count", lessIsBetter: true },
};

/** Percentages, each weighed by its row's main count. */
const PERCENTS: Record<string, Measure> = {
  ctrPercent: { words: "share clicked", kind: "percent", weighBy: "impressions" },
  conversionRatePercent: { words: "conversion rate", kind: "percent", weighBy: "visits" },
  ratePercent: { words: "conversion rate", kind: "percent", weighBy: "visits" },
  scroll: { words: "how far people scroll", kind: "percent", weighBy: "visits" },
  sharePercent: { words: "share", kind: "percent" },
  engagementRatePercent: { words: "share of engaged visits", kind: "percent" },
  bounceRatePercent: { words: "share of visits that left at once", kind: "percent", lessIsBetter: true },
};

export const MEASURES: Readonly<Record<string, Measure>> = { ...COUNTS, ...PERCENTS };
/** The counts in the order a table's main figure is chosen. */
export const COUNT_ORDER: readonly string[] = Object.keys(COUNTS);

/** A figure's words for the writer, or the field's own name where it has none. */
export const measureWords = (field: string | number | undefined): string => MEASURES[String(field)]?.words ?? String(field ?? "");
