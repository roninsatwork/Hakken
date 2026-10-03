/**
 * The limits as the Limits screens group them (docs/plans/active/
 * platform-limits-plan.md): four topics an admin team can find their way
 * round, rather than the two sets the numbers happen to be stored in. Anthony,
 * 2026-09-28, of the first wording: "can we make it easier to understand for an
 * admin team to look after the platform".
 *
 * One list for the platform's Limits, a company's and a website's, so a limit
 * sits in the same place and reads the same on all three. Every key the
 * backend lists (`LIMIT_KEYS` in `convex/platformLimits.ts`) is in exactly one
 * topic; `convex/platformLimits.test.ts` fails a limit added without one, or
 * without its words in English and Italian.
 */

export type LimitTopic = { id: "google" | "ai" | "matching" | "searchConsole" | "pages" | "company" | "shared"; keys: readonly string[] };

export const LIMIT_TOPICS: readonly LimitTopic[] = [
  {
    id: "google",
    keys: ["keywordsPerSite", "everydayKeywords", "trackedPerSite", "backlinksPerSite", "competitorsPerSite", "consoleDays"],
  },
  { id: "ai", keys: ["promptsPerSite", "fanOutTrackedPerSite", "searchesPerEngine", "wordingsPerAngle", "anglesShown", "googleSearchesRead"] },
  {
    id: "matching",
    keys: ["anglesJudgedPerRun", "anglesJudgedPerCollection", "pagesOffered", "auditPagesRead", "rankedPagesRead", "missingAnglesSuggested"],
  },
  // Search Console's tracked lists (search-console-plan.md §13.2): free, a company's own websites only.
  { id: "searchConsole", keys: ["consoleTrackedKeywordsPerSite", "consoleTrackedPagesPerSite", "consoleCountriesPerSite"] },
  // A website's pages and their classifications (page-groups-plan.md): free, set only in admin for now.
  { id: "pages", keys: ["sitemapPagesRead", "classificationsPerSite", "classificationLinesPerSite", "classifiedPagesPerSite"] },
  { id: "company", keys: ["purchasesPerCollection", "companyRowsRead"] },
  // Only the platform sets these (`convex/sharedLimits.ts`): a company's Limits
  // shows them, with where they are set, and a website's does not.
  {
    id: "shared",
    keys: ["fanOutPerAnswer", "sourcesPerAnswer", "businessesPerAnswer", "newWebsitesPerPurchase", "overviewSearchesPerPurchase", "rowsPerDownload"],
  },
];

/** What a limit counts, so every choice says it: "1,000 keywords", never a bare "1,000". */
export type LimitUnit =
  | "keywords"
  | "backlinks"
  | "days"
  | "prompts"
  | "fanOutQueries"
  | "searches"
  | "wordings"
  | "topics"
  | "overviews"
  | "pages"
  | "suggestions"
  | "purchases"
  | "rows"
  | "competitors"
  | "sources"
  | "businesses"
  | "websites"
  | "countries"
  | "classifications"
  | "lines";

export const LIMIT_UNITS: Record<string, LimitUnit> = {
  keywordsPerSite: "keywords",
  everydayKeywords: "keywords",
  trackedPerSite: "keywords",
  backlinksPerSite: "backlinks",
  consoleDays: "days",
  promptsPerSite: "prompts",
  fanOutTrackedPerSite: "fanOutQueries",
  searchesPerEngine: "searches",
  wordingsPerAngle: "wordings",
  anglesShown: "topics",
  googleSearchesRead: "overviews",
  anglesJudgedPerRun: "topics",
  anglesJudgedPerCollection: "topics",
  pagesOffered: "pages",
  auditPagesRead: "pages",
  rankedPagesRead: "pages",
  missingAnglesSuggested: "suggestions",
  purchasesPerCollection: "purchases",
  companyRowsRead: "rows",
  competitorsPerSite: "competitors",
  consoleTrackedKeywordsPerSite: "keywords",
  consoleTrackedPagesPerSite: "pages",
  consoleCountriesPerSite: "countries",
  classificationsPerSite: "classifications",
  classificationLinesPerSite: "lines",
  classifiedPagesPerSite: "pages",
  sitemapPagesRead: "pages",
  fanOutPerAnswer: "searches",
  sourcesPerAnswer: "sources",
  businessesPerAnswer: "businesses",
  newWebsitesPerPurchase: "websites",
  overviewSearchesPerPurchase: "searches",
  rowsPerDownload: "rows",
};
