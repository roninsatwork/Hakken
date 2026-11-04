import type { SeesScreen } from "../screens";
import { SEARCH_CONSOLE_NEVER } from "./never";

/** Search Console's pages in the eye's screen list (`screens.ts`), by key. */
export const SEARCH_CONSOLE_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  // Search Console.
  // Search Console's chart pages (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6): each with its own rules.
  "searchConsole.performance": {
    about: "Search Console's overview: how often Google showed the website and how often people clicked, for the dates chosen against the span before",
    parts: [
      "the four boxes: clicks, times shown, the share clicked and Google's average place, each against the span before",
      "how many of the clicks came from searches Google names; it hides the rest",
      "the chart: clicks, times shown, the share clicked and the average place, day by day",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  "searchConsole.keywords": { about: "the searches that bring the website visitors from Google" },
  "searchConsole.pages": { about: "the website's pages in Google: clicks, times shown and position" },
  "searchConsole.record": { about: "one search's or one page's own screen in Search Console" },
  // A search's and a page's own screens, each its own key (section 6: "separate screen keys"); their words stay `record`.
  "searchConsole.keyword": {
    about: "one search's own screen: how often Google showed the website for it and people clicked, its place, where its clicks came from, and the website's pages Google showed for it",
    parts: [
      "the four boxes: clicks, times shown, the share clicked and Google's average place, against the span before",
      "the chart: its clicks and times shown, day by day",
      "where the clicks came from: the top countries and each device",
      "the website's pages Google showed for this search, with their clicks and places",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "other searches than this one, except as the whole website's figures it is set against"],
  },
  "searchConsole.page": {
    about: "one page's own screen in Search Console: how often Google showed it and people clicked, its place, where its clicks came from, and the searches it was shown for",
    parts: [
      "the four boxes: clicks, times shown, the share clicked and Google's average place, against the span before",
      "the chart: its clicks and times shown, day by day",
      "where the clicks came from: the top countries and each device",
      "the searches Google showed this page for, with their clicks and places",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "other pages than this one, except as the whole website's figures it is set against"],
  },
  "searchConsole.almost": { about: "searches just off Google's first page, where a small rise would bring visitors" },
  "searchConsole.brand": {
    about: "Brand and non-brand: clicks from searches using the business's own name (its brand words, set in its Profile) against every other search",
    parts: [
      "the four boxes: brand clicks, non-brand clicks, the brand's share of the clicks and non-brand times shown, against the span before",
      "the chart: brand and non-brand clicks in each day, week or month",
      "the table: each search, marked brand or not, with its clicks, times shown, share clicked and place",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  "searchConsole.ctrCurve": {
    about: "Click rate by position: how often people clicked the website at each of Google's places, 1 to 20, from its own searches",
    parts: [
      "the chart: the share clicked at each place",
      "the table: each place with its searches, times shown, clicks and share clicked",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "other websites' click rates or any rate the page does not show: the page is the website's own"],
  },
  "searchConsole.places": { about: "clicks from Google by country and device" },
  "searchConsole.services": {
    about: "Demand by service: how often Google showed the website for each of its services (its own page classifications) and how often people clicked, against the span before",
    parts: [
      "the chart: times shown for each of the ten biggest services, against the span before",
      "the table: each service with its times shown and clicks, and their change",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  "searchConsole.updates": {
    about: "Google updates: what each of Google's announced updates in the dates did to the website, the 14 days after it finished against the 14 before it began",
    parts: [
      "the chart: clicks day by day, each update marked",
      "the table: each update with its days, clicks before and after, the change, the place before and after, and how much the places moved",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "why Google made an update, or guesses at what it targets: only what the website's figures did"],
  },
  "searchConsole.indexing": { writer: "INSIGHTS_TECHNICAL", about: "which pages Google has in its index, and why others are left out" },
  "searchConsole.demand": { about: "searches people make that the website barely shows for" },
  "searchConsole.newLost": {
    about: "New and lost: searches Google started showing the website for in the dates, and those it stopped (lost once 14 days pass without one), and the same for pages",
    parts: [
      "the four boxes: new searches, lost searches, new pages and lost pages",
      "the chart: searches gained and lost in each day, week or month",
      "the table: each new or lost search, newest first, with its day, clicks, times shown and place",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  "searchConsole.competing": { writer: "INSIGHTS_CANNIBALISATION", about: "pages of the website competing for the same searches" },
  "searchConsole.bands": {
    about: "Position bands: how many of the website's searches Google shows in each band of places (the top 3, 4 to 10, 11 to 20, 21 and below), against the span before",
    parts: [
      "the four boxes: searches in the top 3, in 4 to 10, in 11 to 20, and 21 and below, against the span before",
      "the chart: the searches in each band, day, week or month",
      "the table: each search with its band, place, the places it moved, clicks and times shown",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  "searchConsole.estimates": { about: "Google's real clicks against Visibility's estimate for the same searches" },
  "searchConsole.appearance": { writer: "INSIGHTS_TECHNICAL", about: "rich results: how the website's listings appear in Google" },
  "searchConsole.lowCtr": { about: "searches where the website is shown often but rarely clicked" },
  "searchConsole.trackedKeywords": { about: "the searches the company tracks in Search Console" },
  "searchConsole.trackedPages": { about: "the pages the company tracks in Search Console" },
  "searchConsole.types": { about: "clicks from Google's web, image, video and news results" },
  "searchConsole.volatility": {
    about: "Volatility: how much the website's places on Google moved each day, out of 10, against its own usual — is it Google, or is it the website?",
    parts: [
      "the four boxes: the newest complete day's score and level, the last 7 days' (or Google's update's), the searches that moved 5 places or more, and clicks over the last 7 days against the 7 before",
      "the chart: the score each day, week or month, Google's updates marked",
      "the table: the searches counted on the newest complete day, the most moved first, with their place before and now",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "the score as a rating of the website: it says how much places moved, not whether the website is good"],
  },
  "searchConsole.moves": { about: "the searches and pages that won and lost the most clicks" },
};
