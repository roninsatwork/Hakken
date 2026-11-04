import type { SeesScreen } from "../screens";
import { LINKS_KEYWORDS_NEVER, MARKET_MONEY, MARKET_NEVER } from "./never";

/** Visibility's pages in the eye's screen list (`screens.ts`), by key. */
export const VISIBILITY_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  // Visibility's Overview (the second half's, section 10): its panels, chart and sections top to bottom.
  "visibility.overview": {
    about: "Overview: the website on Google at a glance — its searches ranked for, estimated visitors, adverts, links and AI answers at the newest check in the dates, each against the check before them, and beside its rivals",
    parts: [
      "the Search panel: searches ranked for with those in the top 3, visits a month, searches with adverts and visits from adverts",
      "the Backlink profile panel: website strength, home page strength, links and linking websites",
      "the AI answers panel: searches whose AI Overview names the website, and each assistant naming it",
      "the performance chart: the figures ticked over the dates, the rivals on one figure, or this year against last",
      "organic positions: the searches in each band of Google's results",
      "pages by kind and by visits, and the searches by what they are for",
      "the top competitors: their visitors and searches, and the searches and visits you share",
    ],
    never: MARKET_NEVER,
  },
  // Visibility's Backlinks and Keywords (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10): each page's parts top
  // to bottom; their own rules in `own/visibility.ts` (`linksAndKeywords`) set yours against your rivals' at the same check.
  "visibility.backlinks": {
    writer: "INSIGHTS_LINKS",
    about: "Backlinks › Summary: the websites and links pointing to this one, as they stood at the end of the dates, set against the rivals you watch",
    parts: [
      "four boxes: domain rank, links, linking websites and broken links, each as it stood at the end of the dates",
      "the chart: linking websites, links and domain rank at each check in the dates, each ticked on or off",
    ],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.backlinksCompared": {
    writer: "INSIGHTS_LINKS",
    about: "Backlinks › Compared with rivals: this website's links beside each rival's, as each stood at its newest check",
    parts: ["the chart: each website's linking websites, side by side", "the table: each website's domain rank, links and linking websites"],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.backlinksQuality": {
    writer: "INSIGHTS_LINKS",
    about: "Backlinks › Link quality: how clean the links are, set against the rivals you watch",
    parts: [
      "four boxes: spam score, broken links, broken pages others link to, and linking websites whose links Google is told not to follow",
      "the chart: spam score, broken links and broken pages at each check in the dates",
      "the table: each check's figures",
    ],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.backlinksWhere": {
    writer: "INSIGHTS_LINKS",
    about: "Backlinks › Where links come from: the links by country, domain ending, kind of site, kind of link and link attribute, against the rivals you watch",
    parts: [
      "the picker: one breakdown at a time, each of the five handed to the eye",
      "the chart: the largest groups of the breakdown chosen",
      "the table: every group with its links and its share of them",
    ],
    never: [...LINKS_KEYWORDS_NEVER, "links placed nowhere: the supplier could not tell where they come from, so they count in no group's share"],
  },
  "visibility.backlinksAnchors": {
    writer: "INSIGHTS_LINKS",
    about: "Backlinks › Anchors: the words other websites link here with, over the whole list",
    parts: ["the chart: the most-used words on the page shown, with their links and linking websites", "the table: every anchor with its links, linking websites, first seen and status"],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.backlinksIps": {
    writer: "INSIGHTS_LINKS",
    about: "Backlinks › Referring IPs: the servers links come from and the networks they sit in, over every server",
    parts: ["the chart: the networks holding the most linking websites", "the table: every server with its network, linking websites and links"],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.backlinksNewLost": {
    writer: "INSIGHTS_LINKS",
    about: "Backlinks › New and lost links: links and linking websites gained and lost in the dates, against the same span before",
    parts: ["the chart: links or linking websites gained and lost, each day, week or month", "the table: each day, week or month with its four counts"],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.keywords": {
    about: "Keywords: every search the website ranks for on Google, with what rose and fell at the newest check, against the rivals you watch",
    parts: [
      "the chart: the website's searches by place on Google (top 3, 4 to 10, page two, further down) at each check in the dates",
      "the table: each search with its place, its move, monthly searches, estimated visitors and ranking page",
    ],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.keywordRecord": {
    about: "one search's own screen: where the website ranks for it, how that moved over the dates, and where the rivals you watch rank",
    parts: [
      "three figures: its place, monthly searches and estimated visitors",
      "the chart: its place at each check in the dates",
      "the ranking page, the rivals on the same search, and how AI answers ran it",
    ],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.keywordsBands": {
    about: "Keywords › Position bands: the searches on Google's first page, in its top three, on page two and further down, against the rivals you watch",
    parts: [
      "three boxes: page one with its top three, page two, and further down",
      "the chart: page one, page two and further down at each check in the dates",
      "the grid of moves between bands at the newest check, the searches that moved, and those just off page one",
    ],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.keywordsNewLost": {
    about: "Keywords › New and lost: the searches gained, up, down and lost at each check in the dates, against the rivals you watch",
    parts: [
      "the chart: searches new, up, down and lost at each check",
      "the newest check's moves, one list at a time",
      "the table: each check with its four counts and the net",
    ],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.keywordsBandsMoved": { about: "the searches that moved between places on Google" },
  "visibility.keywordsPages": {
    about: "Keywords › Top pages: the website's pages that rank on Google, each with its searches and estimated visitors, and each classification",
    parts: ["the chart: ranking pages and estimated visitors at each check in the dates", "the table: each page with its kind, estimated visitors, searches, best place and linking websites"],
    never: [...LINKS_KEYWORDS_NEVER, "asking the reader to sort, group or classify pages, or pages not sorted yet: that is done for them"],
  },
  "visibility.pageRecord": { about: "one page's own screen: the searches it ranks for" },
  "visibility.keywordsStructure": {
    about: "Keywords › Site structure: the website's sections, each with its pages, searches, top-three places and estimated visitors",
    parts: ["the sections as a map, each sized by its searches", "the table: each section with its pages, searches, top three and estimated visitors"],
    never: LINKS_KEYWORDS_NEVER,
  },
  "visibility.yourPages": { about: "the pages the company chose to watch" },
  // Visibility's second half (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10): Google results, Competitors, AI
  // answers, Brand radar, Web mentions, Reviews, Paid search and Site audit, each page's parts top to bottom; their own
  // rules in `own/visibility.ts` (the second half's block). Each writer as its prefix below named it.
  "visibility.googleAbove": {
    about: "Google results › Who ranks above you: for each search the company tracks, the websites Google puts above this one at the newest check, rivals marked, and where this website stands",
    parts: [
      "the chart: the searches with the most websites above you, how many and how many of them rivals",
      "the table: each search, your place, the websites above you and the rivals among them",
    ],
    never: [...MARKET_NEVER, "how the websites above moved: the page shows the newest check of each search only"],
  },
  "visibility.googleFeatures": {
    about: "Google results › Search features: what Google shows on the website's searches besides the links — an AI Overview, a map of local businesses, an answer box — and whether this website is in them",
    parts: [
      "the three boxes, across everything the website ranks for: searches whose AI Overview, map pack or featured snippet shows it",
      "the chart: for each feature, the searches checked showing it and those with this website in it",
      "the table: each tracked search with its features, and whether this website is in each that names websites",
    ],
    never: MARKET_NEVER,
  },
  // Described as the company's tracked searches until 2026-11-03: it reads every search the website ranks for.
  "visibility.googleMoves": {
    about: "Google results › Wins and losses: the searches across everything the website ranks for that moved up or down at their last check, with the chart counting moves up against moves down in each step of the dates",
    parts: [
      "the chart: searches that moved up and searches that moved down in each day, week or month of the dates",
      "the table: the searches that moved the way chosen (up, down, new or lost), each from its place before to its place now, with its page",
    ],
    never: [...MARKET_NEVER, "the company's tracked searches: this page reads every search the website ranks for; Your searches has the tracked ones"],
  },
  "visibility.googleSearches": {
    about: "Google results › Your searches: where the website ranks on each search the company tracks, how each is doing, and the five best-placed drawn over the dates",
    parts: [
      "the chart: the places of the five best-placed searches over the dates, higher on the chart better",
      "the table: each search, its place, its move since the check before, its best place, how it is doing, and its last check",
    ],
    never: MARKET_NEVER,
  },
  "visibility.competitors": {
    writer: "INSIGHTS_MARKET",
    about: "Competitors › Side by side: this website beside the rivals in its group — estimated visitors, searches ranked for, linking websites and the searches compared — each at its newest check, their estimated visitors over the dates, and what the rivals did lately",
    parts: [
      "the chart: the estimated visitors of this website and its rivals over the dates",
      "the table: each website's estimated visitors, searches ranked for and linking websites, the searches it ranks above you on, and its verdict",
      "what your rivals did lately: each rival's new searches, climbs and falls, and visits a month",
    ],
    never: MARKET_NEVER,
  },
  "visibility.competitorsMap": {
    writer: "INSIGHTS_MARKET",
    about: "Competitors › Market map: every website in this one's market by how many searches it ranks for and the estimated visitors those bring — this website, the rivals it watches, and the websites found ranking for the same searches",
    parts: [
      "the chart: each website a dot, its searches ranked for against its estimated visitors",
      "the table: each website with its searches, estimated visitors and the searches it shares with you",
    ],
    never: [...MARKET_NEVER, "how the market moved: the map shows each website's newest check"],
  },
  "visibility.competitorsRival": {
    writer: "INSIGHTS_MARKET",
    about: "Competitors › a rival's own screen: its estimated visitors, searches ranked for, linking websites and domain rank beside this website's, both lines of visitors over the dates, the searches you both rank for and who is ahead, and its pages AI answers cite",
    parts: [
      "the four boxes: the rival's figures, with yours under each",
      "the chart: Google visitors, the rival against you, over the dates",
      "the table: the searches you both rank for — where they lead, where you lead, or all — with both places",
      "the rival's pages that AI answers cite",
    ],
    never: MARKET_NEVER,
  },
  "visibility.aiDemand": {
    writer: "INSIGHTS_AI_VISIBILITY",
    about: "AI answers › AI demand: how often the website's searches are asked of AI tools a month, beside how often they are searched on Google, over the last 12 months",
    parts: [
      "the four boxes: asked of AI a month and searched on Google a month, each against 11 months before; searches rising in AI; the search asked of AI most",
      "the chart: AI against Google a month, for the tracked searches",
      "the table: each search with its AI asks, AI trend, Google searches and the share asked of AI",
    ],
    never: [...MARKET_MONEY, "the date menu: this page shows the last 12 months whatever dates are chosen"],
  },
  "visibility.aiMentions": {
    writer: "INSIGHTS_AI_VISIBILITY",
    about: "AI answers › Mentions: how each AI assistant treats this website on each question it is measured on, how often each named it, and the answers naming it over the dates",
    parts: [
      "the chart: the answers naming the website, per assistant, in each step of the dates",
      "the table: each question and assistant, named of asked, recommended, and its latest answer",
    ],
    never: [...MARKET_MONEY, "rivals named in the answers: this page is about this website only; Share of voice sets it beside its rivals"],
  },
  "visibility.aiShare": {
    writer: "INSIGHTS_AI_VISIBILITY",
    about: "AI answers › Share of voice: how often each AI assistant names this website against the rivals it watches, at the newest answers",
    parts: [
      "the note: counted against the websites tracked only",
      "the chart: each website's share of the times the group was named, on each assistant",
      "the table: each website's share on each assistant and on all of them",
    ],
    never: [...MARKET_MONEY, "how the shares moved: this page counts the newest answers"],
  },
  "visibility.radarOverview": {
    writer: "INSIGHTS_AI_VISIBILITY",
    about: "Brand radar › Overview: how often Google's AI Overviews name this website beside the rivals watched with it, month by month over the last 12 months, and the real questions behind them",
    parts: [
      "the four boxes: AI answers naming you against the month before, how often those questions are asked, your share of voice and place, and your pages cited",
      "the chart: each business's share of voice a month",
      "you against rivals: each business's mentions, change, share, asks and pages cited",
      "the questions: each with how often it is searched, your place, and the rivals named",
    ],
    never: [...MARKET_MONEY, "the date menu: this page shows the last 12 months whatever dates are chosen"],
  },
  "visibility.mentions": {
    writer: "INSIGHTS_AI_VISIBILITY",
    about: "Web mentions › All mentions: the pages across the web naming the business in the dates, how they speak of it and whether they link to it, against the span before",
    parts: [
      "the four boxes: new mentions against the span before, the share speaking well, those speaking badly, those naming you without a link",
      "the chart: new mentions by how they speak of you, in each step of the dates",
      "the table: every page held from the last 12 months, newest first, with its kind, tone and link",
    ],
    never: MARKET_MONEY,
  },
  "visibility.mentionsRivals": {
    writer: "INSIGHTS_AI_VISIBILITY",
    about: "Web mentions › Against rivals: how often the web names the business and each rival watched beside it in the dates, against the span before, and how it speaks of each",
    parts: [
      "the four boxes: your share of the mentions and your place, the business talked about most, the one growing fastest, and the one spoken of badly most",
      "the chart: each business's mentions in each step of the dates",
      "the table: each business's mentions, change, those speaking well and badly, those without a link, and its share",
    ],
    never: MARKET_MONEY,
  },
  "visibility.reviews": {
    writer: "INSIGHTS_LOCAL",
    about: "Reviews › Your reviews: every review on the business's linked listings, the new ones in the dates against the span before, the stars they gave, and whether each has an answer",
    parts: [
      "the four boxes: the rating, new reviews against the span before, reviews not answered and how long the oldest has waited, and days to answer",
      "the chart: new reviews and their average stars in each step of the dates",
      "the table: every review, newest first, with its stars and its answer",
    ],
    never: [...MARKET_MONEY, "the people who wrote reviews: never name or quote a reviewer"],
  },
  "visibility.reviewsRivals": {
    writer: "INSIGHTS_LOCAL",
    about: "Reviews › Against rivals: the business's reviews beside the rivals watched against the office — how many, how good, how many new in the dates, and how fast each answers",
    parts: [
      "the four boxes: your place on reviews, the gap to the leader, the fastest to answer, and the best rated",
      "the chart: the Google reviews each business has, in each step of the dates",
      "the table: each business's rating, reviews, new reviews in the dates, answered and days to answer",
    ],
    never: [...MARKET_MONEY, "the people who wrote reviews: never name or quote a reviewer"],
  },
  "visibility.paid": {
    writer: "INSIGHTS_MARKET",
    about: "Paid search › Summary: whether the website buys Google adverts, on how many searches, and the visits they bring, at the newest check against the check before the dates",
    parts: ["the two boxes: searches with adverts and visits a month from adverts", "the chart: each over the dates"],
    never: [...MARKET_NEVER, "rivals' adverts: this page shows the website's own"],
  },
  "visibility.paidKeywords": {
    writer: "INSIGHTS_MARKET",
    about: "Paid search › Paid keywords: the searches the website buys adverts on, each advert's place, how often the search is made, and the visits it brings",
    parts: ["the table: each search with its advert's place, its monthly searches and its visits"],
    never: MARKET_NEVER,
  },
  "visibility.audit": {
    writer: "INSIGHTS_TECHNICAL",
    about: "Site audit: what the newest crawl of the website found — its technical score, the pages crawled, and each problem as a count of pages, worst first — with the crawls over the dates",
    parts: [
      "the money pages, when shown: their speed for real visitors, structured data, and pages nothing links to",
      "the boxes: the technical score, pages crawled, errors, warnings and notices",
      "the chart: pages crawled and the technical score at each crawl",
      "the table: each problem, how serious it is, and its pages",
    ],
    never: [...MARKET_MONEY, "a crawl the website turned away: say only that too little was read to judge"],
  },
};
