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
  /**
   * A share of a whole (a device's share of the views): a list's shares always add up to the whole, so their average
   * says nothing (it gave "tablet: share 2.8%, against 33.3% on average" on every page). Set only against its own
   * reference where the row holds one: the whole website's (`website…`) or similar pages' (`group…`).
   */
  ofWhole?: boolean;
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
  // The Products screen's steps count looks, not visits: its visits are a list of their own (`visits.looked`).
  looked: { words: "product views", kind: "count" },
  itemsViewed: { words: "product views", kind: "count" },
  itemsPurchased: { words: "products bought", kind: "count" },
  // Products' items (products-screen-4-plan-2026-11-02.md): bought, put in a basket, and put in and not bought.
  itemsBought: { words: "items bought", kind: "count" },
  itemsAdded: { words: "items added to baskets", kind: "count" },
  itemsLeft: { words: "items left in baskets", kind: "count", lessIsBetter: true },
  // Products' four boxes (page-screen-redo-plan-2026-11-03.md, step 3): visits and products, never money.
  basketsLeft: { words: "baskets left behind", kind: "count", lessIsBetter: true },
  checkoutsLeft: { words: "checkouts not finished", kind: "count", lessIsBetter: true },
  visitsThatBought: { words: "visitors who bought", kind: "count" },
  productsNeverBought: { words: "products added but never bought", kind: "count", lessIsBetter: true },
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
  sharePercent: { words: "share", kind: "percent", ofWhole: true },
  engagementRatePercent: { words: "share of engaged visits", kind: "percent" },
  bounceRatePercent: { words: "share of visits that left at once", kind: "percent", lessIsBetter: true },
  // A page's own screen, redone (page-screen-redo-plan-2026-11-03.md, step 2): shares and rates handed as fractions,
  // read as percentages (`pageData.ts`), each beside the whole website's or similar pages' where the page shows it.
  viewsSharePercent: { words: "share of views", kind: "percent", ofWhole: true },
  peopleSharePercent: { words: "share of people", kind: "percent", ofWhole: true },
  boughtRatePercent: { words: "visitors who bought", kind: "percent", weighBy: "visits" },
  scrolledToBottomRatePercent: { words: "scrolled to the bottom", kind: "percent", weighBy: "visits" },
  cameBackRatePercent: { words: "came back later", kind: "percent", weighBy: "visits" },
};

export const MEASURES: Readonly<Record<string, Measure>> = { ...COUNTS, ...PERCENTS };
/** The counts in the order a table's main figure is chosen. */
export const COUNT_ORDER: readonly string[] = Object.keys(COUNTS);

/** A figure's words for the writer, or the field's own name where it has none. */
export const measureWords = (field: string | number | undefined): string => MEASURES[String(field)]?.words ?? String(field ?? "");
