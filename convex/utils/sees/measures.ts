/**
 * The figures a page's findings may speak of, by the name its query gives them (docs/plans/active/sees-every-page-plan-2026-10-31.md,
 * phase 3): each in plain words, whether it is a count or a percentage, and its key in the panel's words
 * (`ui.hakkenSees.measures.<key>`). A figure not named here is never a finding: a finding in a name the reader does not
 * know is worse than none. One list for every section, so the same figure reads the same way on every page.
 */

export type Measure = {
  /** The words for the writer: "clicks from Google". */
  words: string;
  /**
   * A count or a percentage, which the general rules weigh; a place (a position on Google, lower the better), which they
   * weigh by the places it moved; or a score (a star rating, a spam score), which a page's own rules weigh
   * (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 5).
   */
  kind: "count" | "percent" | "place" | "score";
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
  /** A product's items added to baskets and never bought, as a share of those added (pageOwnFindings.ts). */
  leftInBasketPercent: { words: "of the items added were left in baskets", kind: "percent", lessIsBetter: true },
  /** Products put in a basket, every one: what Products' "added but never bought" is a share of (pageOwnFindings.ts). */
  productsAdded: { words: "products added to baskets", kind: "count" },
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
  // Shared work 5 (ask-hakken-every-chart-page-plan-2026-11-03.md): figures the rules could not name before.
  brandClicks: { words: "clicks on searches for the brand", kind: "count" },
  /** Visits on an average day of a part of the week: Visits' weekends against weekdays (pageOwnFindings.ts). */
  visitsADay: { words: "visits a day", kind: "count" },
  // Insights' own (own/insights.ts, ask-hakken-every-chart-page-plan-2026-11-03.md section 9): its screens count
  // enquiries, and its scorecard and leagues name figures no other section keeps. Last, so no other table's main figure changes.
  enquiries: { words: "enquiries", kind: "count" },
  visitors: { words: "visitors", kind: "count" },
  googleVisits: { words: "visits from Google", kind: "count" },
  googleEnquiries: { words: "enquiries from Google", kind: "count" },
  aiVisits: { words: "visits from AI assistants", kind: "count" },
  aiMentions: { words: "times AI answers name it", kind: "count" },
  aiOverviews: { words: "searches showing it in Google's AI Overviews", kind: "count" },
  aiCitedPages: { words: "pages AI assistants cite", kind: "count" },
  findings: { words: "findings", kind: "count" },
  checkedFindings: { words: "findings checked", kind: "count" },
  pagesToChange: { words: "pages the plan would change", kind: "count" },
  pagesGoing: { words: "pages to merge, redirect or remove", kind: "count" },
  // Bing Webmaster's own (own/bing.ts, ask-hakken-every-chart-page-plan-2026-11-03.md section 7): Bing set against Google,
  // its lists' churn, and its money pages. Last, and named for Bing alone, so no other table's main figure changes.
  searchClicks: { words: "clicks from Bing and Google", kind: "count" },
  searchesWithClicks: { words: "keywords that brought clicks", kind: "count" },
  pagesWithClicks: { words: "pages that brought clicks", kind: "count" },
  searchesOnBoth: { words: "keywords on both Bing and Google", kind: "count" },
  moneyPages: { words: "money pages", kind: "count" },
  robotsBlocked: { words: "pages blocked by robots.txt", kind: "count", lessIsBetter: true },
  daysSinceRead: { words: "days since the search engine last read it", kind: "count", lessIsBetter: true },
  // Visibility's second half (own/visibility.ts, ask-hakken-every-chart-page-plan-2026-11-03.md section 10): adverts by
  // their searches and visits, never their cost; rivals above you; the moves, features, AI asks and answers, mentions,
  // reviews and crawls its pages count. Last, so no other table's main figure changes.
  paidKeywords: { words: "searches with adverts", kind: "count" },
  paidTraffic: { words: "visits a month from adverts", kind: "count" },
  sharedKeywords: { words: "searches shared with you", kind: "count" },
  aboveYou: { words: "searches where it ranks above you", kind: "count", lessIsBetter: true },
  searchesChecked: { words: "searches checked", kind: "count" },
  featureShown: { words: "searches where it shows", kind: "count" },
  rankedUp: { words: "searches that moved up", kind: "count" },
  rankedDown: { words: "searches that moved down", kind: "count", lessIsBetter: true },
  newSearches: { words: "new searches ranked for", kind: "count" },
  websites: { words: "websites", kind: "count" },
  aiAsks: { words: "asks of AI a month", kind: "count" },
  questions: { words: "questions", kind: "count" },
  aiAnswers: { words: "AI answers", kind: "count" },
  newReviews: { words: "new reviews", kind: "count" },
  badMentions: { words: "pages speaking badly of it", kind: "count", lessIsBetter: true },
  brokenPages: { words: "broken pages", kind: "count", lessIsBetter: true },
  pagesCrawled: { words: "pages crawled", kind: "count" },
  localPacks: { words: "searches whose map of local businesses shows it", kind: "count" },
  featuredSnippets: { words: "searches whose answer box is one of its pages", kind: "count" },
  // Microsoft Clarity's own (own/clarity.ts, ask-hakken-every-chart-page-plan-2026-11-03.md section 8): visits that hit
  // a problem, and the pages with errors. Worked out by its rules, never a field a page hands. Last, so no other table's
  // main figure changes.
  errorVisits: { words: "visits that hit an error", kind: "count", lessIsBetter: true },
  wentBack: { words: "visits that went straight back", kind: "count", lessIsBetter: true },
  errorPages: { words: "pages with errors", kind: "count", lessIsBetter: true },
  // Search Console's own (own/searchConsole.ts, ask-hakken-every-chart-page-plan-2026-11-03.md section 6): a day's
  // clicks and times shown, inside the dates or at weekends; searches new and lost a day; searches on Google's first
  // page. Worked out by its rules, never a field a page hands. Last, so no other table's main figure changes.
  clicksADay: { words: "clicks a day", kind: "count" },
  impressionsADay: { words: "times shown a day", kind: "count" },
  lostADay: { words: "searches lost a day", kind: "count", lessIsBetter: true },
  newADay: { words: "new searches a day", kind: "count" },
  pageOne: { words: "searches on Google's first page", kind: "count" },
  /** New and lost's own: a part of the searches lost, and of those new (own/searchConsole.ts). */
  searchesLost: { words: "searches lost", kind: "count", lessIsBetter: true },
  searchesGained: { words: "new searches", kind: "count" },
  // Visibility's Backlinks and Keywords (own/visibility.ts, `linksAndKeywords`; ask-hakken-every-chart-page-plan-2026-11-03.md
  // section 10): links gained and lost, the servers links come from, the searches on Google's first page as each Keywords
  // page counts them, and the rivals you watch. Last, and named for these pages alone, so no other table's main figure changes.
  linksGained: { words: "links gained", kind: "count" },
  linksLost: { words: "links lost", kind: "count", lessIsBetter: true },
  linkServers: { words: "servers linking here", kind: "count" },
  pageOneSearches: { words: "searches on Google's first page", kind: "count" },
  rivalsWatched: { words: "rivals you watch", kind: "count" },
  // Google Analytics' own (own/googleAnalytics.ts, 2026-11-04): the visits or views a few pages lost or gained, as a share
  // of all a channel or the website lost, and Live's people in the last 30 minutes. Worked out by its rules, never a field.
  visitsLost: { words: "visits lost", kind: "count", lessIsBetter: true },
  viewsLost: { words: "views lost", kind: "count", lessIsBetter: true },
  viewsGained: { words: "views gained", kind: "count" },
  peopleInHalfHour: { words: "people in the last 30 minutes", kind: "count" },
};

/**
 * Places, lower the better: a search's place on Google or Bing (`position`, Search Console's `averagePosition`). Weighed
 * by the places moved, never as a count, so a move from 9th to 4th reads as a climb.
 */
const PLACES: Record<string, Measure> = {
  position: { words: "place in search results", kind: "place" },
  averagePosition: { words: "place in search results", kind: "place" },
  // Visibility's second half (own/visibility.ts): a search's place set beside another (its best, a rival's), where the
  // higher number is the worse, so its colour turns round. Not one of the general rules' places, which move.
  placeOnGoogle: { words: "place on Google", kind: "place", lessIsBetter: true },
};

/** Scores, each on its own scale: weighed by a page's own rules, against before or a rival. */
const SCORES: Record<string, Measure> = {
  // All pages' second box: the whole website's views for each visit, to a tenth.
  pagesAVisit: { words: "pages a visit", kind: "score" },
  rating: { words: "star rating", kind: "score" },
  spamScore: { words: "spam score", kind: "score", lessIsBetter: true },
  domainRank: { words: "domain rank", kind: "score" },
  difficulty: { words: "how hard it is to rank for", kind: "score", lessIsBetter: true },
  volatility: { words: "how much the results moved", kind: "score" },
  // Insights' (own/insights.ts): how many it takes for one enquiry, a visit counted for each Google click, a league's strength.
  visitsPerEnquiry: { words: "visits for one enquiry", kind: "score", lessIsBetter: true },
  visitorsPerEnquiry: { words: "visitors for one enquiry", kind: "score", lessIsBetter: true },
  googleClicksPerEnquiry: { words: "Google clicks for one enquiry", kind: "score", lessIsBetter: true },
  peoplePerConversion: { words: "people for one conversion", kind: "score", lessIsBetter: true },
  visitsPerHundredClicks: { words: "visits for every 100 Google clicks", kind: "score" },
  strength: { words: "strength in Google's eyes, out of 1,000", kind: "score" },
  // Visibility's second half (own/visibility.ts).
  visitsPerSearch: { words: "estimated visitors for each search ranked for", kind: "score" },
  daysToAnswer: { words: "days to answer a review", kind: "score", lessIsBetter: true },
  onPageScore: { words: "technical score, out of 100", kind: "score" },
  paidVisitsPerSearch: { words: "visits a month for each search with adverts", kind: "score" },
  // Search Console's (own/searchConsole.ts): a click rate under 2%, said as clicks for every 1,000 times shown, since a
  // percentage keeps one decimal and 0.85% against 0.92% read "0.9% against 0.9%".
  clicksPerThousand: { words: "clicks for every 1,000 times shown", kind: "score" },
  // Visibility's Backlinks and Keywords (own/visibility.ts, `linksAndKeywords`): how many links each linking website gives,
  // on average, beside a typical rival's (many links from few websites: one site's footer on every page).
  linksPerWebsite: { words: "links from each linking website, on average", kind: "score" },
  // Google Analytics' (own/googleAnalytics.ts, 2026-11-04): its lists count conversions as times, so a rate can pass 100%:
  // said as conversions for every 100 visits, never a percentage (ask-hakken-every-chart-page-plan-2026-11-03.md, section 5).
  conversionsPerHundred: { words: "conversions for every 100 visits", kind: "score" },
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
  // Insights' (own/insights.ts): its enquiries as a share of visits, of the whole and of the market.
  enquiryRatePercent: { words: "enquiry rate", kind: "percent", weighBy: "visits" },
  enquiriesSharePercent: { words: "share of enquiries", kind: "percent", ofWhole: true },
  visitsSharePercent: { words: "share of visits", kind: "percent", ofWhole: true },
  marketSharePercent: { words: "share of the market's visitors from Google", kind: "percent", ofWhole: true },
  namedSharePercent: { words: "share of its answers naming the website", kind: "percent" },
  // Bing Webmaster's (own/bing.ts): Bing's share of a page's or a week's clicks from Bing and Google, and a kind of
  // page's share of each engine's clicks.
  bingSharePercent: { words: "share of its clicks from Bing and Google that came from Bing", kind: "percent", ofWhole: true },
  clicksSharePercent: { words: "share of Bing's clicks", kind: "percent", ofWhole: true },
  // Visibility's second half (own/visibility.ts): worked out by its rules, never a field a page hands.
  aiSharePercent: { words: "of the asks made to AI", kind: "percent" },
  voiceSharePercent: { words: "of the mentions in AI answers", kind: "percent" },
  noLinkSharePercent: { words: "of the pages naming it have no link", kind: "percent", lessIsBetter: true },
  answeredSharePercent: { words: "of the new reviews answered", kind: "percent" },
  // Microsoft Clarity's own (own/clarity.ts): each problem as a share of the visits it could happen on, set against the
  // whole website, another device or the span before. Worked out by its rules, never a field a page hands.
  wentBackPercent: { words: "share of visits that went straight back", kind: "percent", lessIsBetter: true, weighBy: "visits" },
  errorPercent: { words: "share of visits that hit an error", kind: "percent", lessIsBetter: true, weighBy: "visits" },
  deadPercent: { words: "share of visits with a dead click", kind: "percent", lessIsBetter: true, weighBy: "visits" },
  ragePercent: { words: "share of visits with an angry click", kind: "percent", lessIsBetter: true, weighBy: "visits" },
  errorClicksPercent: { words: "share of visits with a click that failed", kind: "percent", lessIsBetter: true, weighBy: "visits" },
  // Search Console's (own/searchConsole.ts): a device's or a country's share of one search's or page's clicks from
  // Google, set beside the whole website's.
  ownClicksSharePercent: { words: "of its clicks from Google", kind: "percent", ofWhole: true },
  // Visibility's Backlinks and Keywords (own/visibility.ts, `linksAndKeywords`): shares worked out beside each page's
  // figures (`linkSees.ts`, `keywordSees.ts`), each set against a typical rival's or the share it is of something else.
  nofollowWebsitesPercent: { words: "of linking websites ask Google not to follow their links", kind: "percent" },
  linksSharePercent: { words: "of the links", kind: "percent" },
  pageOnePercent: { words: "of its searches on Google's first page", kind: "percent" },
  top3Percent: { words: "of its searches in Google's top 3", kind: "percent" },
  furtherPercent: { words: "of its searches past Google's second page", kind: "percent", lessIsBetter: true },
  pageTwoPercent: { words: "of its searches on Google's second page", kind: "percent" },
  trafficPercent: { words: "of the estimated visitors from Google", kind: "percent" },
  searchesPercent: { words: "of the searches ranked for", kind: "percent" },
  fellPercent: { words: "of its searches fell at the newest check", kind: "percent", lessIsBetter: true },
  newPercent: { words: "of its searches were new at the newest check", kind: "percent" },
  // Google Analytics' (own/googleAnalytics.ts, 2026-11-04): the share of visits that left at once, as it moved against the
  // span before; and a landing page's visits that left without seeing another page. Worked out by its rules.
  leftAtOncePercent: { words: "share of visits that left at once", kind: "percent", lessIsBetter: true },
  leftWithoutAnotherPercent: { words: "share who left without seeing another page", kind: "percent", lessIsBetter: true, weighBy: "visits" },
};

export const MEASURES: Readonly<Record<string, Measure>> = { ...COUNTS, ...PERCENTS, ...PLACES, ...SCORES };
/** The counts in the order a table's main figure is chosen. */
export const COUNT_ORDER: readonly string[] = Object.keys(COUNTS);

/** A figure's words for the writer, or the field's own name where it has none. */
export const measureWords = (field: string | number | undefined): string => MEASURES[String(field)]?.words ?? String(field ?? "");
