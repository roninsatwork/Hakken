/**
 * What the pages never talk about, and the parts they share, said once for every section's entries (`screens.ts`, split
 * by section on 2026-11-03 to keep each file inside the backend's size).
 */

/** Never money on the Conversions screens (Anthony, 2026-10-30: "i just dont want it focusing on money"). */
export const NO_MONEY = ["money: sales value or what anything earned. Speak in conversions and purchases"];
/**
 * Google Analytics' lists count a conversion each time it happens, not the visits that made one, so a rate can pass 100%
 * (ask-hakken-every-chart-page-plan-2026-11-03.md, section 5): said as conversions for every 100 visits.
 */
export const CONVERSIONS_AS_TIMES = "a conversion rate as a percentage from this page's lists: they count each time a conversion happened, so say conversions for every 100 visits";

/**
 * Clarity measures behaviour only (ask-hakken-every-chart-page-plan-2026-11-03.md, section 8): its screens never speak
 * of conversions, enquiries, money or Google's rankings, nor of another source's figures.
 */
export const CLARITY_NEVER = [
  "conversions, enquiries, sales or money: Clarity measures how people behave on the pages, not what they bought",
  "Google's rankings, searches or clicks, and any other source's figures: this section shows Clarity's own",
  "why a figure moved, unless the figures show it: never a guess at a release, a cause or a likely reason",
];

/**
 * What Bing Webmaster never counts (ask-hakken-every-chart-page-plan-2026-11-03.md, section 7): clicks and times shown
 * only, never visits, sales or guessed money; and Google's figures beside Bing's are the main home country's alone.
 */
export const BING_NEVER = [
  "money: sales, what a click is worth or what an advert would cost. Bing Webmaster counts clicks and times shown",
  "visits, conversions or enquiries: those are Google Analytics' figures, never this page's",
  "Google's figures as every country's: beside Bing's they are the website's main home country's web results only, while Bing's cover every country",
];

/**
 * What Search Console never counts (ask-hakken-every-chart-page-plan-2026-11-03.md, section 6): Google's clicks, times
 * shown and places only, for the website's main home country unless another is chosen; never visits, sales or guessed
 * money, and never another source's figures (Anthony, 2026-10-16: each source's screens show their own data only).
 */
export const SEARCH_CONSOLE_NEVER = [
  "money: sales, what a click is worth or what an advert would cost. Search Console counts clicks, times shown and places",
  "visits, conversions or enquiries: those are Google Analytics' figures, never this page's. A click is a visit to the website from Google, not a sale",
  "Bing, Microsoft Clarity or the Visibility estimates: each has its own pages",
  "asking the reader to sort, group or classify pages, or pages not sorted yet: that is done for them",
];

/**
 * What Visibility's Backlinks and Keywords pages never speak of (ask-hakken-every-chart-page-plan-2026-11-03.md, section
 * 10; decision 4, Anthony, 2026-11-03: "Yes, all of it"): no guessed money, and no figure another source measures. Their
 * figures are estimates from checks on set days, so a change is between checks, never a day's.
 */
export const LINKS_KEYWORDS_NEVER = [
  "money: what a click costs advertisers, what the visits would be worth as adverts, or any other money. These are our data supplier's guesses, never measured, and the pages no longer show them",
  "visits, clicks, conversions or enquiries: estimated visitors from Google are an estimate from the website's places, never Google Analytics' or Search Console's counts",
  "a day-by-day story: the figures come from checks on set days, so a change is between two checks",
];

/**
 * What Visibility's second half never speaks of (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10; decision
 * 4, Anthony, 2026-11-03: "Take it off", then "Yes, all of it"): no guessed money on any of its pages; and, on those whose
 * figures come from checks on set days, no figure another source measures and no day-by-day story.
 */
export const MARKET_MONEY = ["money: what adverts cost, what a click costs, or what the visits would be worth. These are our data supplier's guesses, never measured, and the pages no longer show them"];
export const MARKET_NEVER = [
  ...MARKET_MONEY,
  "visits, clicks, conversions or enquiries counted by Google Analytics or Search Console: estimated visitors from Google are an estimate from the website's places",
  "a day-by-day story: the figures come from checks on set days, so a change is between two checks",
];

/**
 * Never on any Insights page (ask-hakken-every-chart-page-plan-2026-11-03.md, section 9): money, which Insights never
 * measures; Hakken's own housekeeping; and an "enquiry" read as a person, when a website's counted conversions can be
 * events a visit does many times (More Handles' passed one a visit in 2026, so its rates pass 100%).
 */
export const INSIGHTS_NEVER = [
  "money: sales value, revenue, ad spend or what anything is worth. Speak in enquiries, visits and places",
  "pages not sorted yet, or asking the reader to sort or group pages: that is done for them",
  "enquiries as people: they count the conversions the website counts, which one visit can make more than once, so a rate can pass 100%",
];
/**
 * The pages that already show Hakken's advice (decision 2, Anthony, 2026-11-03: "replace whatever has gone before as it's
 * clearly broken"): the advice goes to the writer with the figures, as `advice`, so its piece builds on it.
 */
export const ADVICE_PART = "the advice already on the page, handed with its figures as advice: the piece builds on it";
export const ADVICE_NEVER = "anything that disagrees with the advice already on this page, handed with its figures as advice";
