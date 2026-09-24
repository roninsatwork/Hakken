/**
 * The side menu of one site: every page, in the order the plan lists them,
 * and which of them exist yet.
 *
 * One shape from day one (docs/plans/active/user-sites-plan.md, Phase 1):
 * a page that is not built yet still appears, greyed and labelled, so
 * nothing moves when it arrives. `built` is the only thing that changes
 * as pages land. Copy lives in `messages/*.json` under `sites.menu`.
 */

export type SitePageGroup = "site" | "ai" | "google" | "keywords" | "paid" | "competitors" | "backlinks";

export type SitePage = {
  id: string;
  group: SitePageGroup;
  /** The path under `/app/sites/[siteId]`; empty for the Overview. */
  segment: string;
  built: boolean;
  /** Which of the menu's stored counts sits beside the label. */
  count?:
    | "keywords"
    | "pages"
    | "top3"
    | "referringDomains"
    | "brokenBacklinks"
    | "aiNamed"
    | "trackedSearches"
    | "moves"
    | "suggestions"
    | "citedPages";
  /**
   * What the page cannot show anything without, set up by the team for the
   * site: the questions asked of AI assistants, or the searches checked one
   * by one on Google. Unmet, the page shows one note saying so instead of an
   * empty screen, and the menu marks it (docs/plans/active/
   * sites-ux-updates-plan.md §3, "an empty section says so once").
   */
  needs?: SiteSetup;
};

export type SiteSetup = "questions" | "trackedSearches";

/** Whether a page's setup is in place, from the counts in the site's header. */
export function setupMet(page: SitePage, counts: { questionsSetUp: boolean; trackedSearches: number }): boolean {
  if (page.needs === "questions") return counts.questionsSetUp;
  if (page.needs === "trackedSearches") return counts.trackedSearches > 0;
  return true;
}

export const SITE_PAGE_GROUPS: SitePageGroup[] = ["site", "ai", "google", "keywords", "paid", "competitors", "backlinks"];

export const SITE_PAGES: SitePage[] = [
  { id: "overview", group: "site", segment: "", built: true },
  { id: "calendar", group: "site", segment: "calendar", built: true },
  { id: "siteAudit", group: "site", segment: "audit", built: true },

  { id: "aiMentions", group: "ai", segment: "ai/mentions", built: true, count: "aiNamed", needs: "questions" },
  { id: "aiShareOfVoice", group: "ai", segment: "ai/share-of-voice", built: true, needs: "questions" },
  { id: "aiAnswers", group: "ai", segment: "ai/answers", built: true, needs: "questions" },
  { id: "aiSources", group: "ai", segment: "ai/sources", built: true, count: "citedPages", needs: "questions" },
  { id: "aiSearched", group: "ai", segment: "ai/searched", built: true, needs: "questions" },

  // Wins and losses and Search features read every keyword the site ranks
  // for as well, so they have something to show without tracked searches.
  { id: "googleSearches", group: "google", segment: "google/searches", built: true, count: "trackedSearches", needs: "trackedSearches" },
  { id: "googleMoves", group: "google", segment: "google/moves", built: true, count: "moves" },
  { id: "googleAbove", group: "google", segment: "google/above", built: true, needs: "trackedSearches" },
  { id: "googleFeatures", group: "google", segment: "google/features", built: true },
  { id: "googleQuestions", group: "google", segment: "google/questions", built: true, needs: "trackedSearches" },

  { id: "keywordsAll", group: "keywords", segment: "keywords", built: true, count: "keywords" },
  { id: "keywordsPages", group: "keywords", segment: "keywords/pages", built: true, count: "pages" },
  { id: "keywordsBands", group: "keywords", segment: "keywords/bands", built: true, count: "top3" },
  { id: "keywordsNewLost", group: "keywords", segment: "keywords/new-lost", built: true },
  { id: "keywordsStructure", group: "keywords", segment: "keywords/structure", built: true },

  // Phase 5: paid search, read from the ranked-keywords answers already bought.
  { id: "paidSummary", group: "paid", segment: "paid", built: true },
  { id: "paidKeywords", group: "paid", segment: "paid/keywords", built: true },

  { id: "competitorsSideBySide", group: "competitors", segment: "competitors", built: true },
  { id: "competitorsOrganic", group: "competitors", segment: "competitors/organic", built: true },
  { id: "competitorsGap", group: "competitors", segment: "competitors/gap", built: true },
  { id: "competitorsMap", group: "competitors", segment: "competitors/map", built: true },
  { id: "competitorsSuggested", group: "competitors", segment: "competitors/suggested", built: true, count: "suggestions" },

  { id: "backlinksSummary", group: "backlinks", segment: "backlinks", built: true, count: "referringDomains" },
  { id: "backlinksCompared", group: "backlinks", segment: "backlinks/compared", built: true },
  { id: "backlinksQuality", group: "backlinks", segment: "backlinks/quality", built: true, count: "brokenBacklinks" },
  { id: "backlinksWhere", group: "backlinks", segment: "backlinks/where", built: true },
  { id: "backlinksAll", group: "backlinks", segment: "backlinks/all", built: true },
  { id: "backlinksDomains", group: "backlinks", segment: "backlinks/domains", built: true },
  { id: "backlinksAnchors", group: "backlinks", segment: "backlinks/anchors", built: true },
  { id: "backlinksIps", group: "backlinks", segment: "backlinks/ips", built: true },
  { id: "backlinksBroken", group: "backlinks", segment: "backlinks/broken", built: true },
  { id: "backlinksNewLost", group: "backlinks", segment: "backlinks/new-lost", built: true },
];

/** The part of a path after the site, without its slashes: "keywords/pages" for Top pages. */
function restOf(pathname: string, siteId: string): string {
  const base = `/app/sites/${siteId}`;
  return pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "").replace(/\/$/, "") : "";
}

/**
 * The page a path under the site opens, or the Overview.
 *
 * A record's own screen — a keyword, a page (docs/plans/active/
 * sites-ux-updates-plan.md §3) — sits under the menu page it belongs to, so it
 * answers that page: the longest page path it sits under.
 */
export function sitePageForPath(pathname: string, siteId: string): SitePage {
  const rest = restOf(pathname, siteId);
  const exact = SITE_PAGES.find((page) => page.segment === rest);
  if (exact) return exact;
  const under = SITE_PAGES
    .filter((page) => page.segment !== "" && rest.startsWith(`${page.segment}/`))
    .sort((left, right) => right.segment.length - left.segment.length);
  return under[0] ?? SITE_PAGES[0];
}

/** Whether a path is one of the menu's own pages, rather than a record's screen under one. */
export function isSiteMenuPath(pathname: string, siteId: string): boolean {
  const rest = restOf(pathname, siteId);
  return SITE_PAGES.some((page) => page.segment === rest);
}
