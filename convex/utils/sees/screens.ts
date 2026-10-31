import type { InsightsRole } from "../agentRoles";
import type { FactSource } from "../insightFacts";

/**
 * Every page's eye, described once (docs/plans/active/sees-every-page-plan-2026-10-31.md, phase 1; Anthony: "extend
 * the eye and side bar to every page … so we can test and refine"). A page's key is its section and its screen
 * ("searchConsole.keywords"); its entry says who writes the words when the eye is pressed (Anthony, 2026-10-31: the
 * writers as proposed, a new specialist where none matches), what the page is for the writer, the parts it should
 * cover before it digs, what it must never talk about, and whether pressing writes anything at all (Insights' weekly
 * boxes are already the team's words). The writer, the Editor's checks and the panel read this list, so a page joins
 * the eye with a few lines here and its own figures handed over, never new code. No database here.
 */

export const SEES_SECTIONS = ["googleAnalytics", "searchConsole", "bing", "clarity", "visibility", "insights"] as const;
export type SeesSection = (typeof SEES_SECTIONS)[number];

export type SeesScreen = {
  section: SeesSection;
  /** The specialist who writes the page's words. */
  writer: InsightsRole;
  /** What the page is, for the writer: "the searches that bring the website visitors from Google". */
  about: string;
  /** The page's parts, top to bottom, for the writer to cover before it digs; none, and it covers what the figures hold. */
  parts?: readonly string[];
  /** Subjects the page never speaks about, said in the brief (money on the Conversions screens). */
  never?: readonly string[];
  /** False where pressing writes nothing: the page's words are already the team's (Insights' weekly boxes). */
  writes?: boolean;
};

/** Each section's writer and the source its figures are filed under, for a page the list does not name yet. */
const SECTION: Record<SeesSection, { writer: InsightsRole; source: FactSource; name: string }> = {
  googleAnalytics: { writer: "INSIGHTS_CONVERSION", source: "analytics", name: "Google Analytics" },
  searchConsole: { writer: "INSIGHTS_SEARCH", source: "searchConsole", name: "Search Console" },
  bing: { writer: "INSIGHTS_SEARCH", source: "searchConsole", name: "Bing Webmaster" },
  clarity: { writer: "INSIGHTS_BEHAVIOUR", source: "analytics", name: "Microsoft Clarity" },
  visibility: { writer: "INSIGHTS_SEARCH", source: "market", name: "Visibility" },
  insights: { writer: "INSIGHTS_ANALYST", source: "analytics", name: "Insights" },
};

/** Never money on the Conversions screens (Anthony, 2026-10-30: "i just dont want it focusing on money"). */
const NO_MONEY = ["money: sales value or what anything earned. Speak in conversions and purchases"];

/**
 * The pages, by key: the section, then the screen as the section's own words name it (`googleAnalytics.seen.<screen>`,
 * `searchConsole.seen.<screen>`, `sites.seen.<screen>`…). A key ending in ":" is a family (a conversion's own screen,
 * `googleAnalytics.event:purchase`). A page missing here still has an eye, written by its section's specialist.
 */
export const SEES_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  // Google Analytics.
  "googleAnalytics.conversions": {
    writer: "INSIGHTS_CONVERSION",
    about: "Conversions: every conversion this website counts",
    parts: [
      "the chart: how many visits it took for one conversion, day by day",
      "the map: each conversion by kind of page, channel, device or country, as visits, a rate or events",
      "the table: each event the website counts, with its conversions, visits and change",
    ],
    never: NO_MONEY,
  },
  "googleAnalytics.event:": {
    writer: "INSIGHTS_CONVERSION",
    about: "one conversion's own screen",
    parts: ["the chart: the share of each day's visits that did it", "the lines: the conversion by channel, day by day", "when people convert: by hour and day of the week"],
    never: NO_MONEY,
  },
  "googleAnalytics.event": { about: "one event's own screen: how often it happened, and where" },
  "googleAnalytics.websites": { about: "the company's websites in Google Analytics" },
  "googleAnalytics.overview": { about: "the Google Analytics overview: visits, conversions and where they came from" },
  // Live's figures are asked of Google each minute, never saved: its eye shows findings and the chat, and writes nothing.
  "googleAnalytics.live": { about: "the visits on the website right now", writes: false },
  "googleAnalytics.channelsPage": { about: "the channels visits came by, each with its conversions" },
  "googleAnalytics.channels": { about: "the channels visits came by, each with its conversions" },
  "googleAnalytics.channelPage": { about: "one channel's own screen: its visits, pages and conversions" },
  "googleAnalytics.channel": { about: "one channel's own screen: its visits, pages and conversions" },
  "googleAnalytics.campaigns": { about: "the website's campaigns and the visits and conversions each brought" },
  "googleAnalytics.landing": { about: "landing pages as a flow: where visits start and how many go on to convert" },
  "googleAnalytics.landingPage": { about: "one landing page's own screen" },
  "googleAnalytics.allPages": { about: "every page of the website, with its visits and conversions" },
  "googleAnalytics.page": { about: "one page's own screen: its visits, where they came from and what they did" },
  "googleAnalytics.conversionPages": { about: "the pages behind one square of the Conversions map" },
  "googleAnalytics.products": { about: "the shop's products: viewed, added to basket and bought", never: NO_MONEY },
  "googleAnalytics.visitors": { about: "who the visitors are: their ages, interests, devices and places" },
  "googleAnalytics.trackingHealth": { writer: "INSIGHTS_MEASUREMENT", about: "tracking health: whether the website's Google Analytics figures can be trusted" },

  // Search Console.
  "searchConsole.websites": { about: "the company's websites in Search Console" },
  "searchConsole.performance": { about: "the website's clicks and times shown in Google, day by day" },
  "searchConsole.keywords": { about: "the searches that bring the website visitors from Google" },
  "searchConsole.pages": { about: "the website's pages in Google: clicks, times shown and position" },
  "searchConsole.record": { about: "one search's or one page's own screen in Search Console" },
  "searchConsole.almost": { about: "searches just off Google's first page, where a small rise would bring visitors" },
  "searchConsole.brand": { about: "searches for the business's own name against every other search" },
  "searchConsole.ctrCurve": { about: "how often each Google position is clicked on this website" },
  "searchConsole.places": { about: "clicks from Google by country and device" },
  "searchConsole.services": { about: "demand for each of the business's services on Google" },
  "searchConsole.updates": { about: "Google's announced updates and what moved around them" },
  "searchConsole.indexing": { writer: "INSIGHTS_TECHNICAL", about: "which pages Google has in its index, and why others are left out" },
  "searchConsole.demand": { about: "searches people make that the website barely shows for" },
  "searchConsole.newLost": { about: "searches and pages new this period, and those lost" },
  "searchConsole.competing": { writer: "INSIGHTS_CANNIBALISATION", about: "pages of the website competing for the same searches" },
  "searchConsole.bands": { about: "searches by their place on Google: top 3, first page, second page" },
  "searchConsole.estimates": { about: "Google's real clicks against Visibility's estimate for the same searches" },
  "searchConsole.appearance": { writer: "INSIGHTS_TECHNICAL", about: "rich results: how the website's listings appear in Google" },
  "searchConsole.lowCtr": { about: "searches where the website is shown often but rarely clicked" },
  "searchConsole.trackedKeywords": { about: "the searches the company tracks in Search Console" },
  "searchConsole.trackedPages": { about: "the pages the company tracks in Search Console" },
  "searchConsole.types": { about: "clicks from Google's web, image, video and news results" },
  "searchConsole.volatility": { about: "how much the website's places on Google moved day to day" },
  "searchConsole.moves": { about: "the searches and pages that won and lost the most clicks" },

  // Bing Webmaster.
  "bing.websites": { about: "the company's websites in Bing Webmaster" },
  "bing.performance": { about: "the website's clicks and times shown in Bing, beside Google's" },
  "bing.versus": { about: "Bing against Google: where each ranks the website higher" },
  "bing.crawling": { writer: "INSIGHTS_TECHNICAL", about: "how Bing reads the website: pages crawled, errors and pages in its index" },
  "bing.keywords": { about: "the searches that bring the website visitors from Bing" },
  "bing.pages": { about: "the website's pages in Bing" },
  "bing.record": { about: "one search's or one page's own screen in Bing" },

  // Microsoft Clarity: how people behave on the pages (a specialist of its own, 2026-10-31).
  "clarity.websites": { about: "the company's websites in Microsoft Clarity" },
  "clarity.overview": { about: "how people behave on the website: scrolling, quick backs, angry and dead clicks, errors" },
  "clarity.pages": { about: "each page's visits and how people behave on it" },
  "clarity.page": { about: "one page's own screen in Clarity" },
  "clarity.errors": { about: "the pages where visitors hit errors, and where they happen" },
  "clarity.recordings": { about: "recordings of visits that show where people give up" },

  // Visibility: the pages the prefixes below don't already describe.
  "visibility.websites": { about: "the company's websites and its competitors in Visibility" },
  "visibility.overview": { about: "the website on Google at a glance, against its competitors" },
  "visibility.keywords": { about: "the searches the website ranks for on Google" },
  "visibility.keywordRecord": { about: "one search's own screen: who ranks and how it moved" },
  "visibility.keywordsBands": { about: "the website's searches by their place on Google" },
  "visibility.keywordsBandsMoved": { about: "the searches that moved between places on Google" },
  "visibility.keywordsPages": { about: "the website's pages that rank on Google" },
  "visibility.pageRecord": { about: "one page's own screen: the searches it ranks for" },
  "visibility.keywordsStructure": { about: "the website's sections and how each ranks on Google" },
  "visibility.yourPages": { about: "the pages the company chose to watch" },
  "visibility.draft": { about: "a draft written for the business by the team" },

  // Insights: its weekly boxes are the team's words already; the rest by the specialist whose work it is.
  "insights.aiSearch": { writer: "INSIGHTS_AI_VISIBILITY", about: "AI search: how AI answers treat the business", writes: false },
  "insights.enquiries": { writer: "INSIGHTS_ANALYST", about: "enquiries and where they came from", writes: false },
  "insights.funnel": { writer: "INSIGHTS_CONVERSION", about: "the funnel from search to enquiry", writes: false },
  "insights.leaderboards": { writer: "INSIGHTS_MARKET", about: "leaderboards: the business against its market", writes: false },
  "insights.measurement": { writer: "INSIGHTS_MEASUREMENT", about: "measurement: whether the figures can be trusted", writes: false },
  "insights.opportunities": { writer: "INSIGHTS_SEARCH", about: "the opportunities the team found", writes: false },
  "insights.pagePlan": { writer: "INSIGHTS_PAGE_DECISIONS", about: "the page plan: what to do with each page", writes: false },
  "insights.strategy": { writer: "INSIGHTS_ANALYST", about: "the strategy: each service and what to do for it", writes: false },
  "insights.trackRecord": { writer: "INSIGHTS_ANALYST", about: "the team's track record: what it advised and what happened", writes: false },
  "insights.cannibalisation": { writer: "INSIGHTS_CANNIBALISATION", about: "searches where the website's pages compete" },
  "insights.cannibalisationGroup": { writer: "INSIGHTS_CANNIBALISATION", about: "one group of pages competing for the same searches" },
  "insights.pageReviews": { writer: "INSIGHTS_PAGE_DECISIONS", about: "page reviews: each page's verdict" },
  "insights.pageReview": { writer: "INSIGHTS_PAGE_DECISIONS", about: "one page's review: its verdict and first steps" },
  "insights.sources": { writer: "INSIGHTS_MEASUREMENT", about: "the data sources Insights reads, and their health" },
  "insights.leaderboard": { writer: "INSIGHTS_MARKET", about: "one league of the business's market" },
  "insights.experiments": { writer: "INSIGHTS_ANALYST", about: "the experiments the team suggested and how they went" },
  "insights.findings": { writer: "INSIGHTS_ANALYST", about: "every finding the team made" },
  "insights.finding": { writer: "INSIGHTS_ANALYST", about: "one finding the team made, with its evidence" },
  "insights.findingsSection": { writer: "INSIGHTS_ANALYST", about: "the team's findings in one section" },
  "insights.thisWeek": { writer: "INSIGHTS_ANALYST", about: "this week: what changed and what to do first" },
  "insights.report": { writer: "INSIGHTS_ANALYST", about: "one of the team's reports" },
  "insights.yourMonth": { writer: "INSIGHTS_ANALYST", about: "the month's report" },
  "insights.strategyService": { writer: "INSIGHTS_ANALYST", about: "one service in the strategy" },
  "insights.enquiriesSource": { writer: "INSIGHTS_ANALYST", about: "one source of enquiries and what it brought" },
  "insights.reports": { writer: "INSIGHTS_ANALYST", about: "the team's reports, newest first" },
  // The Summary's own words are the Head of Strategy's note: pressing writes nothing new.
  "insights.summary": { writer: "INSIGHTS_ANALYST", about: "the summary: the business at a glance and the strategy's note", writes: false },
};

/**
 * Visibility's screens by the start of their name, each part by the specialist whose discipline it is (Anthony,
 * 2026-10-31: the writers as proposed): links, the market, local, AI answers, the audit.
 */
const VISIBILITY_PREFIXES: ReadonlyArray<{ prefix: string; writer: InsightsRole; about: string }> = [
  { prefix: "backlinks", writer: "INSIGHTS_LINKS", about: "the websites linking to this one" },
  { prefix: "competitors", writer: "INSIGHTS_MARKET", about: "the website against its competitors on Google" },
  { prefix: "paid", writer: "INSIGHTS_MARKET", about: "the searches the business and its rivals pay for on Google" },
  { prefix: "local", writer: "INSIGHTS_LOCAL", about: "the business's Google profiles and local rankings" },
  { prefix: "reviews", writer: "INSIGHTS_LOCAL", about: "the business's reviews against its rivals" },
  { prefix: "business", writer: "INSIGHTS_LOCAL", about: "one business in the local market" },
  { prefix: "ai", writer: "INSIGHTS_AI_VISIBILITY", about: "how AI answers name, cite and send people to the business" },
  { prefix: "radar", writer: "INSIGHTS_AI_VISIBILITY", about: "Brand radar: the questions where AI answers name the business" },
  { prefix: "question", writer: "INSIGHTS_AI_VISIBILITY", about: "one question asked of the AI answers, and who they name" },
  { prefix: "website", writer: "INSIGHTS_AI_VISIBILITY", about: "one website the AI answers cite" },
  { prefix: "overviewGaps", writer: "INSIGHTS_AI_VISIBILITY", about: "the questions where AI answers name rivals and not the business" },
  { prefix: "mentions", writer: "INSIGHTS_AI_VISIBILITY", about: "pages across the web naming the business" },
  { prefix: "audit", writer: "INSIGHTS_TECHNICAL", about: "the site audit: problems Google may trip on" },
  { prefix: "assets", writer: "INSIGHTS_TECHNICAL", about: "the business's assets across the web" },
  { prefix: "google", writer: "INSIGHTS_SEARCH", about: "the company's tracked searches on Google" },
];

/** A page's entry: its own, its family's, or its section's defaults; null for a key in no section. */
export function seesScreenFor(key: string): (SeesScreen & { key: string }) | null {
  const section = SEES_SECTIONS.find((one) => key.startsWith(`${one}.`));
  if (!section) return null;
  const family = Object.keys(SEES_SCREENS).find((one) => one.endsWith(":") && key.startsWith(one));
  const screen = key.slice(section.length + 1);
  const byPrefix = section === "visibility" && !SEES_SCREENS[key] ? VISIBILITY_PREFIXES.find((one) => screen.startsWith(one.prefix)) : undefined;
  const own = SEES_SCREENS[key] ?? (family ? SEES_SCREENS[family] : undefined) ?? (byPrefix ? { writer: byPrefix.writer, about: `${byPrefix.about} (${spaced(screen)})` } : undefined);
  return {
    key,
    section,
    writer: own?.writer ?? SECTION[section].writer,
    about: own?.about ?? `the ${spaced(screen)} page of ${SECTION[section].name}`,
    ...(own?.parts ? { parts: own.parts } : {}),
    ...(own?.never ? { never: own.never } : {}),
    writes: own?.writes ?? true,
  };
}

/** A screen's name as words: "keywordsBandsMoved" → "keywords bands moved". */
const spaced = (screen: string) => screen.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** The source a section's figures are filed under, for its facts. */
export const sourceOfSection = (section: SeesSection): FactSource => SECTION[section].source;
/** A section's name, as its menu says it. */
export const nameOfSection = (section: SeesSection): string => SECTION[section].name;

/** Whether pressing the eye on this page writes new words: every page of a section, except the weekly boxes'. */
export function seesWrites(key: string): boolean {
  return seesScreenFor(key)?.writes ?? false;
}
