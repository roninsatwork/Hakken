import type { SeesScreen } from "../screens";
import { BING_NEVER } from "./never";

/** Bing Webmaster's pages in the eye's screen list (`screens.ts`), by key. */
export const BING_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  // Bing Webmaster.
  // Every chart page (ask-hakken-every-chart-page-plan-2026-11-03.md, section 7): its parts as drawn, top to bottom, and
  // what Bing Webmaster never counts. A keyword's and a page's own screens each have their own key since 2026-11-04.
  "bing.performance": {
    about: "Performance: Bing's own clicks and times shown for the website, each beside Google's for the same days, and Bing's share of the clicks from both",
    parts: [
      "the four boxes: clicks, times shown, the share clicked, and Bing's share of the clicks from Bing and Google, each beside Google's",
      "clicks and times shown over time, by the day, week or month chosen",
      "Bing's share of the clicks from Bing and Google, week by week",
      "clicks each week, Bing against Google",
    ],
    never: BING_NEVER,
  },
  "bing.versus": {
    about: "Bing against Google: Bing's share of the website's clicks from search, and the keywords where each engine ranks the website higher",
    parts: [
      "the four boxes: Bing's share of the clicks from Bing and Google, keywords Bing ranks higher, keywords Google ranks higher, keywords only on Bing",
      "Bing's share of the clicks, week by week",
      "the table: the page of keywords on screen, each with both engines' places and clicks and who ranks the website higher",
    ],
    never: BING_NEVER,
  },
  "bing.crawling": {
    writer: "INSIGHTS_TECHNICAL",
    about: "Crawling and indexing: whether the website's money pages are in Bing's index, the pages Bing read each day, its errors and what robots.txt blocked",
    parts: [
      "the four boxes: money pages in Bing's index beside Google's, pages Bing read, errors reading the website, pages blocked by robots.txt",
      "pages Bing read each day, and its errors",
      "the table: every money page, in Bing's index or not, with the day Bing last read it beside the day Google did",
    ],
    never: [...BING_NEVER, "clicks, times shown or places: this page is about how Bing reads the website, not how people find it"],
  },
  "bing.keywords": {
    about: "Keywords: every keyword Bing showed the website for, a week at a time, each beside Google's place for the same search",
    parts: [
      "the four boxes: clicks, times shown, the share clicked, and Bing's share of the clicks from Bing and Google, each beside Google's",
      "clicks and times shown each week",
      "the table: the page of keywords on screen, with Bing's clicks, times shown, share clicked and place, and Google's place",
    ],
    never: BING_NEVER,
  },
  "bing.pages": {
    about: "Pages: every page Bing showed in its results, a week at a time, each beside Google's clicks to the same page",
    parts: [
      "the four boxes: clicks, times shown, the share clicked, and Bing's share of the clicks from Bing and Google, each beside Google's",
      "clicks and times shown each week",
      "the table: the page of pages on screen, with Bing's clicks, times shown, share clicked and place, and Google's clicks",
    ],
    never: [...BING_NEVER, "asking the reader to sort or classify pages: that is done for them"],
  },
  "bing.keyword": {
    about: "one keyword's own screen in Bing: its clicks, times shown, share clicked and place, each beside Google's for the same search",
    parts: [
      "the four boxes: clicks, times shown, the share clicked and the place, each beside Google's",
      "its place on Bing each week, for its last six months",
      "the table: the pages Bing showed for it",
    ],
    never: BING_NEVER,
  },
  "bing.page": {
    about: "one page's own screen in Bing: its clicks, times shown, share clicked and place, each beside Google's for the same page",
    parts: [
      "the four boxes: clicks, times shown, the share clicked and the place, each beside Google's",
      "its clicks and times shown on Bing each week, for its last six months",
      "the table: the keywords Bing showed it for",
    ],
    never: BING_NEVER,
  },
};
