import type { SeesScreen } from "../screens";
import { CLARITY_NEVER } from "./never";

/** Microsoft Clarity's pages in the eye's screen list (`screens.ts`), by key. */
export const CLARITY_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  // Microsoft Clarity: how people behave on the pages (a specialist of its own, 2026-10-31).
  // Its four chart pages, each with its own rules (own/clarity.ts; ask-hakken-every-chart-page-plan-2026-11-03.md,
  // section 8). Clarity measures behaviour only, and its section shows only its own figures (Anthony: source sections
  // show their own data only; joining sources is for Insights).
  "clarity.overview": {
    about: "Clarity's Overview: how people behave on the website — how far down they scroll, who goes straight back, angry and dead clicks, and errors — against the span before where Clarity holds it",
    parts: [
      "the eight boxes: visits, how far people scroll, time engaged, went straight back, visits with an error, pages a visit, dead clicks and angry clicks, each against the span before where Clarity holds it",
      "how far down visitors scroll, day by day, against the span before",
      "the pages with errors, each with the browser and device it mostly happens on",
      "recordings worth watching",
      "the busiest pages, with how far each is scrolled and who went straight back",
      "how far each page group is scrolled",
      "phones, computers and tablets",
      "where visitors came from: a row for each source",
      "where visitors get stuck: dead clicks, angry clicks, too much scrolling and quick backs",
    ],
    never: CLARITY_NEVER,
  },
  "clarity.pages": {
    about: "Clarity's Pages: each page's visits, how far down it is scrolled and how that changed, time engaged, who went straight back and errors",
    parts: [
      "the chart: how far down the ten busiest pages are scrolled",
      "the table: every page with its visits, scroll and its change, time engaged, went straight back and errors, with a filter for page group and for pages scrolled less than a quarter of the way",
    ],
    never: CLARITY_NEVER,
  },
  "clarity.page": {
    about: "one page's own screen in Clarity: how far down it is scrolled against the span before, similar pages and the whole website, and who on it hits errors or goes straight back",
    parts: [
      "the four boxes: visits, how far people scroll, time engaged and went straight back, each against the span before and the whole website",
      "how far down the page is scrolled day by day, against the whole website",
      "its errors by browser and device",
      "its recordings",
      "phones, computers and tablets on it",
      "where its visitors came from",
    ],
    never: CLARITY_NEVER,
  },
  "clarity.errors": {
    about: "Clarity's Errors: the visits that hit a JavaScript error or a click that failed, the days they happened, the browsers they happen on and the pages with them",
    parts: [
      "the four boxes: visits with an error, clicks that failed, pages with errors and days with errors, against the span before where Clarity holds it",
      "the visits with an error, day by day",
      "errors by browser, as a share of each browser's visits",
      "the pages with errors, each with the browser and device it mostly happens on and a recording to watch",
    ],
    never: CLARITY_NEVER,
  },

  // Visibility: the pages the prefixes below don't already describe. The websites list and a draft carry no eye
  // (Anthony, 2026-11-03: "We dont need the eye on non website data related pages").,
};
