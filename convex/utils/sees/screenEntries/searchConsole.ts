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
      "the chart: clicks, times shown, the share clicked or the average place, day by day, with the span before laid under it",
      "out of every 100 clicks or times shown: brand searches, the other searches Google names and the ones it hides; or each device, Classification or kind of rich result, against the span before where it's kept",
      "two rows of 100, impressions above and clicks or pages below, for each Classification or device: which Google shows a lot but people click less",
      "a dot for each of the 300 keywords Google showed most, in four groups by impressions and clicks for every 100; keywords with no clicks are left off",
      // The country's own pages since 18 November 2026 (review fixes), as Pages and Demand by Classification read them.
      "every figure is the country chosen in the menu's, the Classifications' pages too: they share out only the clicks Google ties to a page, fewer than the boxes', as Demand by Classification's do",
    ],
    // Its pages are the country's own, never every country's: the section's line about a page's figures doesn't hold here.
    never: [
      ...SEARCH_CONSOLE_NEVER.filter((line) => !line.startsWith("a page's clicks as a share")),
      "which page or search a hidden search was: Google keeps them private and says neither",
    ],
  },
  // Keywords as Anthony chose it on 17 November 2026 (search-console-keywords-way-2-plan-2026-11-17.md).
  "searchConsole.keywords": {
    about: "every keyword Google showed the website for in the dates chosen: its clicks, times shown, share clicked and place, each against the span before",
    parts: [
      "the four boxes: the whole website's clicks, times shown, the share clicked and Google's average place, each against the span before",
      "a line under them: how many of those clicks came from searches Google names, and how many from searches it hides for privacy",
      "the chart: clicks, times shown or the average place, day by day, for each keyword ticked in the table (five at most) and for the whole website",
      "the table: every keyword, its clicks and how they moved since the span before, its times shown, share clicked and place; its pages are on its own screen",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  // Pages as Anthony chose it on 17 November 2026 (search-console-pages-way-1-plan-2026-11-17.md); its figures follow the
  // country menu since 18 November 2026, as Demand by Classification's do.
  "searchConsole.pages": {
    about: "every page Google showed the website for in the dates chosen, in the country chosen in the menu: its clicks, times shown, share clicked and place, each against the span before. The boxes are the country's own clicks; the pages share out only the clicks Google ties to a page, as Keywords' table does the searches Google names",
    parts: [
      "the four boxes: the country's clicks, times shown, share clicked and average place, each against the span before",
      "the chart: clicks, times shown or the average place, day by day, for each page ticked in the table (five at most), with the span before under each; it opens on the three pages with most clicks",
      "the table: every page, its clicks and how they moved since the span before, its times shown, share clicked and place; its keywords and Track are on its own screen",
    ],
    // Its pages are the country's own, never every country's: the section's line about a page's figures doesn't hold here.
    never: [
      ...SEARCH_CONSOLE_NEVER.filter((line) => !line.startsWith("a page's clicks as a share")),
      "which page or search a hidden search was: Google keeps them private and says neither",
      "any country but the one chosen in the menu: every figure on the page is that country's, its pages too",
    ],
  },
  "searchConsole.record": { about: "one search's or one page's own screen in Search Console" },
  // A search's and a page's own screens, each its own key (section 6: "separate screen keys"); their words stay `record`.
  // A keyword's own screen as Anthony chose it on 17 November 2026 (search-console-keyword-screen-way-2-plan-2026-11-17.md).
  "searchConsole.keyword": {
    about: "one search's own screen: how often Google showed the website for it and people clicked, its place, and which of the website's pages Google showed for it and which got the clicks",
    parts: [
      "the four boxes: clicks, times shown, the share clicked and Google's average place, against the span before",
      "the chart: its clicks, times shown, the share clicked or the average place, day by day, with the span before laid under it",
      "two rows of 100, impressions above and clicks below, for the six pages Google showed most for this search and the rest: which page Google shows, and which gets clicked",
      "the table: each page Google showed for this search, with its clicks and how they moved since the span before, its times shown, share clicked and place",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "other searches than this one, except as the whole website's figures it is set against", "the countries or devices its clicks came from, which this screen doesn't show"],
  },
  "searchConsole.page": {
    // A page's own screen as the keyword screen's Way 2, turned round (Anthony, 17 November 2026: "just build it").
    about: "one page's own screen in Search Console: how often Google showed it and people clicked, its place, and which keywords Google showed it for and which got clicked",
    parts: [
      "the four boxes: clicks, times shown, the share clicked and Google's average place, in the country chosen in the menu, against the span before",
      "the chart: clicks, times shown, the share clicked or the average place, day by day, with the span before laid under it",
      "two rows of 100, impressions above and clicks below, for the six keywords Google showed this page for most and the rest: which keyword shows it, and which brings the clicks",
      "the table: every keyword Google showed this page for, its clicks and how they moved since the span before, its times shown, share clicked and place",
    ],
    // Its figures are the country's since 18 November 2026, as Pages' are: the section's line about a page's figures doesn't hold.
    never: [
      ...SEARCH_CONSOLE_NEVER.filter((line) => !line.startsWith("a page's clicks as a share")),
      "other pages than this one, except as the whole website's figures it is set against",
      "any country but the one chosen in the menu: every figure on the screen is that country's",
    ],
  },
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
  // Countries and devices as Anthony chose it on 18 November 2026 (search-console-countries-and-devices-way-1-plan-2026-11-18.md).
  "searchConsole.places": {
    about: "every country Google showed the website in for the dates chosen, and the devices people used in the country chosen in the menu: clicks, times shown, share clicked and place, against the span before",
    parts: [
      "the four boxes, all about the country chosen in the menu: its clicks, its share of every 100 clicks, the clicks from every other country, and how many countries sent a click out of all Google showed the website in, each against the span before",
      "the chart: clicks, times shown or the average place, day by day, for each country ticked in the table (five at most), with the span before under each; it opens on the three countries with most clicks after the one chosen",
      "the countries table: every country Google showed the website in, its clicks and how they moved since the span before, its times shown, share clicked and place",
      "the devices table: each device in the country chosen, its clicks and how they moved since the span before, its times shown, share clicked and place",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "where in a country people searched from, or a map: Google gives countries only", "devices in any country but the one chosen in the menu: the devices table counts that country alone",
      // The eye's first press sent the reader to Wins and losses for the United States (18 November 2026), which no screen can show.
      "a step to another screen for a country abroad: the other screens show only the website's home countries, in the menu beside the dates"],
  },
  // Demand by Classification as Anthony chose it on 18 November 2026 (search-console-demand-by-classification-way-2-plan-2026-11-18.md).
  "searchConsole.services": {
    about: "Classifications: how often Google showed each of the website's Classifications in the country chosen in the menu, and the clicks they got, against the span before. The boxes are the country's own clicks; the Classifications share out only the clicks Google ties to a page, as Keywords' table does the searches Google names",
    parts: [
      "the four boxes: the country's clicks, times shown, share clicked and average place, each against the span before",
      "what Google shows, and what gets clicked: a row of 100 for where the pages' times shown went and one for where their clicks (or the pages) went, a band for each of the six Classifications shown most, the rest together",
      "out of every 100 of the pages' clicks (or times shown): squares for the four biggest Classifications and the rest, with the span before's squares beside them",
      "the table: each Classification with its times shown and clicks, how each moved since the span before, and how many of its pages Google showed",
    ],
    // Its pages are the country's own, never every country's: the section's line about a page's figures doesn't hold here.
    never: [
      ...SEARCH_CONSOLE_NEVER.filter((line) => !line.startsWith("a page's clicks as a share")),
      "which page or search a hidden search was: Google keeps them private and says neither",
      "any country but the one chosen in the menu: every figure on the page is that country's, its pages too",
      // The eye's first press sent More Handles' Brand Classification to Brand and non-brand (18 November 2026).
      "a step to Brand and non-brand for a Classification, whatever its name: that page splits searches by whether they name the website, never pages by Classification",
    ],
  },
  "searchConsole.updates": {
    about: "Google updates: what each of Google's announced updates in the dates did to the website, the 14 days after it finished against the 14 before it began",
    parts: [
      "the chart: clicks day by day, each update marked",
      "the table: each update with its days, clicks before and after, the change, the place before and after, and how much the places moved",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "why Google made an update, or guesses at what it targets: only what the website's figures did"],
  },
  // Indexing as Anthony chose it on 18 November 2026: the canvas's V1, problems only (search-console-indexing-v1-plan-2026-11-18.md).
  "searchConsole.indexing": {
    writer: "INSIGHTS_TECHNICAL",
    about: "Indexing: which of the website's pages are in Google, and why some aren't, from Google's answer for each page checked one at a time (its URL inspection), in Google's own words for each reason; only the problems, never the pages that are fine",
    parts: [
      "the four boxes: pages not indexed and how many reasons Google gave; pages indexed, a count only; the biggest reason, in Google's words, with its pages out of all not indexed; and the clicks on pages not indexed in the dates chosen, against all the clicks on the website's pages",
      "a line on how far the checks have got: how many of the website's pages are checked so far, and about when the rest will be, up to 1,600 a day; then a link to Google's own Page indexing report",
      "the chart, Pages not indexed each day: a bar for each day since the checks began, split into the reasons in the table, each reason ticked in its Show menu; it shows the days kept, whatever the dates chosen",
      "the table, Why pages aren't indexed: each reason in Google's words, its Source (the website or Google systems), its pages, their clicks and times shown in the dates chosen, and the newest day Google visited one; each reason opens a page of its own",
    ],
    never: [
      ...SEARCH_CONSOLE_NEVER,
      "Google's own totals for the website, which apps aren't given: every count is of the pages checked so far",
      "a reason's pages as a trend before a week of daily counts is kept",
      "indexed pages one by one: they live on Pages",
    ],
  },
  // A reason's own page under Indexing (search-console-indexing-v1-plan-2026-11-18.md, "A reason's own page").
  "searchConsole.indexingReason": {
    writer: "INSIGHTS_TECHNICAL",
    about: "one of Google's reasons for pages not in Google, on a page of its own: what the reason means in plain words, the four boxes that matter for its kind, and its pages, from Google's answer for each page checked",
    parts: [
      "the title: the reason in Google's own words, and one plain line under it saying what it means",
      "the four boxes, chosen by the kind of reason: for an error, its pages, when they were last shown, the clicks they still got and how many the sitemap lists; for pages kept out, its pages, the sitemap's, their clicks and when Google last visited; for duplicates and redirects, its pages, those Google shows another page for, those that go to a page in Google, and their clicks; for pages Google chose not to show, its pages, the sitemap's, those linked from the website's own pages and when Google last visited; for pages unknown to Google, its pages, those still shown this month, their clicks and how many the website's sitemap lists",
      "the chart: the times shown, or the clicks, each day for the reason's pages, over the days kept",
      "the table, Examples: each page, then what tells its pages apart (the page Google shows instead, the day Google last visited, the last day it was shown, the days it was shown), its clicks and times shown in the dates chosen; each page opens its own screen",
    ],
    never: [
      ...SEARCH_CONSOLE_NEVER,
      "Google's own totals for the website, which apps aren't given: every count is of the pages checked so far",
      "any other reason's pages: this page is one reason's alone",
    ],
  },
  "searchConsole.newLost": {
    about: "New and lost: searches Google started showing the website for in the dates, and those it stopped (lost once 14 days pass without one), and the same for pages",
    parts: [
      "the four boxes: new searches, lost searches, new pages and lost pages",
      "the chart: searches gained and lost in each day, week or month",
      "the table: each new or lost search, newest first, with its day, clicks, times shown and place",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  "searchConsole.competing": {
    writer: "INSIGHTS_CANNIBALISATION",
    about: "Keyword cannibalisation (called Pages competing until 20 November 2026): keywords two or more of the website's pages each took at least 1 in 10 of the impressions of, the home page and searches for its own name left out, as Insights' Keyword cannibalisation counts them",
    parts: [
      "the four boxes: the keywords two pages share, the pages competing out of every page Google showed, the times Google showed them, and their clicks",
      "the chart: which of its pages Google showed for the keyword ticked in the table, each day, by impressions or position, with a menu of the pages it competed with",
      "the table: each keyword with how many pages compete for it, the days Google swapped the page it showed most (Swaps, counted for a month or less), its impressions, clicks and position",
    ],
    never: [
      ...SEARCH_CONSOLE_NEVER,
      // One voice (insights-one-voice-plan.md phase 5): the specialist decides, and Insights' screens say it.
      "which page should own a keyword, or what to do with the others: that's Insights' Keyword cannibalisation to say",
      "the home page or searches for the website's own name: the rule leaves them out",
      "Swaps for dates longer than a month: they aren't counted, never guessed",
      "the word showings: always say impressions, as the page does",
      // The first press, 20 November 2026: "handles had 3,355 impressions split across its competing pages", when 3,355 is
      // every impression Google counted for the keyword, its home page's among them.
      "a keyword's impressions as split across its competing pages: Shown is every impression Google counted for it, the home page's too",
      "the word place for a spot in Google's results: always say position, as the page does",
    ],
  },
  "searchConsole.bands": {
    about: "Position bands: how many of the website's searches Google shows in each band of places (the top 3, 4 to 10, 11 to 20, 21 and below), against the span before",
    parts: [
      "the four boxes: searches in the top 3, in 4 to 10, in 11 to 20, and 21 and below, against the span before",
      "the chart: the searches in each band, day, week or month; 21 and below off as it opens, as older weeks miss some of it",
      "the table: each search with its band, place, the places it moved, clicks and times shown",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  "searchConsole.estimates": { about: "Google's real clicks against Visibility's estimate for the same searches" },
  "searchConsole.appearance": { writer: "INSIGHTS_TECHNICAL", about: "rich results: how the website's listings appear in Google" },
  // Shown but not clicked as Anthony chose it on 20 November 2026 (search-console-shown-but-not-clicked-way-2-plan-2026-11-20.md).
  "searchConsole.lowCtr": {
    about: "Low click rate (called Shown but not clicked until 20 November 2026): pages Google showed a lot that people rarely clicked, in the country chosen in the menu. Each page is set against what the website usually gets at the same position on Google, from Click rate by position: the clicks it got against the clicks it would usually get there",
    parts: [
      "the four boxes: how many pages got fewer clicks than usual, out of every page Google showed; the times Google showed them; the clicks they got; and the clicks they'd usually get, with how many more that is",
      "the chart: each position on Google from 1 at the top to 20, with the clicks these pages got there above the line and the clicks they'd usually get below it; Count shows the pages with few clicks above every page Google showed there instead",
      "the table: each of these pages, the most clicks short first, with its times shown, position, clicks and the clicks it would usually get",
    ],
    // Its figures are the country's own pages, as Pages' are: the section's line about a page's figures doesn't hold.
    never: [
      ...SEARCH_CONSOLE_NEVER.filter((line) => !line.startsWith("a page's clicks as a share")),
      "a click rate as a target or a promise: what the website usually gets at a position is its own past, not what a page will get",
      "any page that isn't on the list: only pages that got fewer clicks than usual are listed",
      // Anthony, 20 November 2026, of the canvas's "place on Google": "is this a place on google maps", then "Place seems to
      // have failed on all accounts". The first press still wrote "your other first-page places".
      "the word place for a spot in Google's results: always say position, as the page does",
    ],
  },
  // Tracked keywords and Tracked pages since 18 November 2026 (search-console-tracked-way-1-plan-2026-11-18.md).
  "searchConsole.trackedKeywords": {
    about: "only the keywords the company tracks in Search Console, in the country chosen in the menu: their clicks, times shown, share clicked and place together and one by one, each against the span before, and what Google's updates did to the ones ticked onto the chart",
    parts: [
      "the four boxes: the tracked keywords' clicks, times shown, share clicked and average place together, each against the span before",
      "the chart: clicks, times shown or the average place, day by day, for each keyword ticked in the table (five at most), with the span before under each and Google's updates marked; it opens on the three with most clicks",
      "the table: every tracked keyword, its clicks and how they moved since the span before, its times shown and place, and Track to stop tracking it; its pages are on its own screen",
      "the newest Google update that finished inside the dates (`update`): each ticked keyword's clicks in the 14 days before it began (`before`) and in the 14 days after it finished (`after`), each 14 days' total, never a day's",
      "to track another keyword, the reader opens it from Keywords and presses Track this keyword on its own screen; a tick on Keywords only draws it on Keywords' chart",
    ],
    never: SEARCH_CONSOLE_NEVER,
  },
  "searchConsole.trackedPages": {
    about: "only the pages the company tracks in Search Console, in the country chosen in the menu as Pages counts them: their clicks, times shown, share clicked and place together and one by one, each against the span before, and what Google's updates did to the ones ticked onto the chart",
    parts: [
      "the four boxes: the tracked pages' clicks, times shown, share clicked and average place together, each against the span before",
      "the chart: clicks, times shown or the average place, day by day, for each page ticked in the table (five at most), with the span before under each and Google's updates marked; it opens on the three with most clicks",
      "the table: every tracked page, its clicks and how they moved since the span before, its times shown and place, and Track to stop tracking it; its keywords are on its own screen",
      "the newest Google update that finished inside the dates (`update`): each ticked page's clicks in the 14 days before it began (`before`) and in the 14 days after it finished (`after`), each 14 days' total, never a day's",
      "to track another page, the reader opens it from Pages and presses Track this page on its own screen; a tick on Pages only draws it on Pages' chart",
    ],
    // Its pages are the country's own, as Pages' are: the section's line about a page's figures doesn't hold here.
    never: [
      ...SEARCH_CONSOLE_NEVER.filter((line) => !line.startsWith("a page's clicks as a share")),
      "any country but the one chosen in the menu: every figure on the page is that country's, its pages too",
    ],
  },
  "searchConsole.types": { about: "clicks from Google's web, image, video and news results" },
  "searchConsole.volatility": {
    about: "Volatility: how much the website's places on Google moved each day, out of 10, against its own usual — is it Google, or is it the website?",
    parts: [
      "the four boxes: the newest complete day's score and level, the last 7 days' (or Google's update's), the searches that moved 5 places or more, and clicks over the last 7 days against the 7 before",
      "the chart: the score each day, week or month, Google's updates marked, with its two parts, Positions improved (what the searches that climbed moved) and Positions declined (what those that fell moved), which add up to the score; a Show menu picks the lines",
      "the table: the searches counted on the newest complete day, the most moved first, with their place before and now",
    ],
    never: [...SEARCH_CONSOLE_NEVER, "the score as a rating of the website: it says how much places moved, not whether the website is good"],
  },
};
