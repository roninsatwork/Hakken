import type { SeesScreen } from "../screens";
import { CONVERSIONS_AS_TIMES, NO_MONEY } from "./never";

/** Google Analytics' pages in the eye's screen list (`screens.ts`), by key. */
export const GOOGLE_ANALYTICS_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  // Google Analytics.
  "googleAnalytics.conversions": {
    writer: "INSIGHTS_CONVERSION",
    about: "Conversions: every conversion this website counts",
    parts: [
      "the chart: how many visits it took for one conversion, day by day",
      "the map: each conversion by classification, channel, device or country, as visits, a rate or events",
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
  "googleAnalytics.event": { about: "one event's own screen: how often it happened, and where", never: NO_MONEY },
  // Google Analytics' chart pages, each with its own rules (ask-hakken-every-chart-page-plan-2026-11-03.md, section 5;
  // own/googleAnalytics.ts, 2026-11-04). Money never, on any of them (decision 1, Anthony, 2026-11-03: "Take money off").
  "googleAnalytics.overview": {
    about: "the Google Analytics overview: the whole website's visits and conversions against the span before, where visits came from, where they landed, who visited and what counts",
    parts: [
      "the boxes: visits, page views, people, engaged visits, time a visit, pages a visit, visits that left at once and conversions, each against the span before",
      "visits a day",
      "where visits came from: the busiest channels, with their visits, change and conversions",
      "the page groups people landed on most",
      "the landing pages with the most visits",
      "conversions: what counts, and the key events not counted",
      "who visited: the biggest group of each kind and how its share moved",
      "the shop, on a website that sells: its best sellers by items bought",
      "tracking health: the checks that need a look",
    ],
    never: [...NO_MONEY, "Search Console's clicks: they are on Search Console's own pages, never this one", CONVERSIONS_AS_TIMES],
  },
  // Live's figures are asked of Google each minute and never saved: pressing writes a piece about right now against a
  // usual half hour last month, worked out from saved figures (decision 3, Anthony, 2026-11-03: "Yes, write one").
  "googleAnalytics.live": {
    writer: "INSIGHTS_BEHAVIOUR",
    about: "Live: who is on the website right now and what they did in the last 30 minutes, against a usual half hour last month",
    parts: [
      "the boxes: people on the website now, people and page views in the last 30 minutes, and conversions in them",
      "people each minute over the last 30 minutes",
      "the countries and the towns they are in",
      "the table: the list chosen, pages by title, places, devices or events, with its people",
    ],
    never: [
      ...NO_MONEY,
      "why it is busy or quiet: the figures say what is happening now, never its cause (an advert, a sale, a post)",
      "a usual half hour as an exact count: it is last month's visitors spread evenly over every half hour, night and day",
    ],
  },
  "googleAnalytics.channelsPage": {
    about: "Channels: the channels visits came by, each with its visits and conversions against the span before and the whole website",
    parts: [
      "the four boxes: visits, conversions, the channel converting best over 12 months, the key events not counted, and time a visit",
      "visits a day by channel, with a dot on each day with a conversion",
      "each channel by the page groups its visits land on",
      "how often a visit converts, by channel, over 12 months",
      "the table: each channel with its visits, time a visit, conversions, conversions it started, change and the page group it lands on most",
    ],
    never: [...NO_MONEY, CONVERSIONS_AS_TIMES],
  },
  "googleAnalytics.channels": { about: "the channels visits came by, each with its conversions", never: NO_MONEY },
  "googleAnalytics.channelPage": {
    about: "one channel's own screen: its visits and conversions against the span before and the whole website, where it lands, and the pages behind its change",
    parts: [
      "the four boxes: the channel's visits, conversions, conversions it started and its visits that stayed to look around",
      "the channel's visits a day against the span before (AI assistants: each assistant over time)",
      "where its visits land, by page group",
      "the pages behind the change: the biggest gains and losses",
      "the table: its landing pages, page groups, key events or sources",
    ],
    never: [...NO_MONEY, CONVERSIONS_AS_TIMES],
  },
  "googleAnalytics.channel": { about: "one channel's own screen: its visits, pages and conversions", never: NO_MONEY },
  "googleAnalytics.campaigns": {
    about: "Campaigns: people who came from a link tagged for a campaign (an ad, an email, a social post), each campaign against the span before, and all of them against the whole website. A campaign's name is what its link was tagged with. A website with nothing bought shows conversions in place of what was bought",
    parts: [
      "the four boxes: visits from campaigns, their share of all visits, what was bought from campaigns, and its share of everything bought, each against the span before",
      "visits from campaigns each day, against the same days of the span before, with up or down under it in whole weeks",
      "a map of the campaigns, each box sized by its visits, orange if it went up and grey if it went down",
      "what people did after they arrived: the busiest campaigns and each counted thing, as the times it happened, those for every 100 visits, or the conversion rate, which is the share of a campaign's visits that did it at least once. Only that rate is a percentage",
      "the table: each campaign with where its link came from, its visits, the span before, up or down, what was bought and its conversions, each for every 100 visits; or the words tagged links carry",
      "the visits from no campaign, beside the table",
    ],
    never: [
      ...NO_MONEY,
      "what a campaign cost or earned: no ad spend is held",
      CONVERSIONS_AS_TIMES,
      "a step asking the reader to look at one campaign on another screen: Funnel, All pages, Products and Conversions show the whole website and can't be split by campaign. For one campaign, a step says what to check in the ad account, or what to change about its link, and names the screen only for what that screen really shows",
    ],
  },
  // Funnel (was Landing pages: its eye key kept).
  "googleAnalytics.landing": {
    about: "Funnel: where people arrive on the website and what they do next. Two figures say leaving. Left straight away is people who stayed under 10 seconds and did nothing. Left in the table is people who saw one page, however long they stayed",
    parts: [
      "the four boxes: visits, left straight away, pages a visit and conversions, each against the span before",
      "people who left straight away each day, or those who stayed, or conversions, against the same days of the span before",
      "where people went next: the first page and the four after it, ten pages by name in each column and every other page in its Classification. Ticks in the table choose the pages in the first column",
      "the table: each page people started on, with its visits, those that left, those that stayed, the page most went to next, and its conversions per 100 visits",
    ],
    never: [...NO_MONEY, CONVERSIONS_AS_TIMES, "pages not sorted into a group yet: they are sorted for the reader", "search, basket or account pages as a page people left: only ever together"],
  },
  "googleAnalytics.landingPage": { about: "one landing page's own screen", never: NO_MONEY },
  "googleAnalytics.allPages": {
    about: "All pages: how often people looked at each page of the website, and whether that went up or down against the span before. It opens with the shop's own search, basket and account pages left out",
    parts: [
      "the four boxes: page views and pages a visit for the whole website, then busy pages with fewer views and quiet pages with more views",
      "a map of the 40 most viewed or visited pages: orange went up and grey went down, deeper for a bigger move",
      "views each day: the whole website's line, with a line added for each page the reader ticks in the table, or visits or conversions if the reader chooses",
      "the table: each page with its visits, views and their up or down, time on page, conversions with how many per 100 visits, and their up or down",
      "how many pages gained, dropped, stayed the same or had no visits",
    ],
    never: [
      ...NO_MONEY,
      CONVERSIONS_AS_TIMES,
      "search, basket or account pages as a page that moved: only ever together",
    ],
  },
  // A page's own screen, redone (page-screen-redo-plan-2026-11-03.md, step 2; boards 2 and 3, approved 2026-11-03).
  "googleAnalytics.page": {
    about: "one page's own screen: how often it was seen, the visitors who started on it and where they came from, who looks at it, and on a product's page the items added to baskets and bought",
    parts: [
      "the four boxes: on a product's page views, items added to basket, items bought and visits that started here; on any other page views, visits that started here, visitors who bought and how many scrolled to the bottom",
      "views each day",
      "visitors each day, a line for each channel they came by",
      "the websites that sent visitors",
      "who looks at the page: by device, country, age or gender, against the whole website",
      "the busiest days of the week",
      "where visitors came from: a row for each source",
    ],
    never: [
      ...NO_MONEY,
      "people as a count of persons, time spent, pages a visit, the page before or links clicked: this page no longer shows them",
    ],
  },
  "googleAnalytics.conversionPages": {
    about: "the pages behind one square of the Conversions map: for one conversion and one group (a channel, a classification, a device or a country), each page its visits that did it came through",
    parts: [
      "the title: the conversion and the group of the square",
      "the table: each page with its visits, the visits that did the conversion, and their share",
    ],
    never: [...NO_MONEY, "the span before: this page holds only the dates chosen"],
  },
  // Screen 4 of the canvas "Products page, three ways" (products-screen-4-plan-2026-11-02.md): visits and items, never money.
  "googleAnalytics.products": {
    about: "the shop's products: the visits left at each of the shop's steps before a sale, and the products bought, left in baskets, and selling more or less",
    // Its figures as the page hands them (page-screen-redo-plan-2026-11-03.md, step 3): the boxes with the period before,
    // the shop's steps, Selling more and Selling less with each product's items bought now and before, the table's page.
    parts: [
      "the four boxes: baskets left behind, checkouts not finished, visits that bought, products added and never bought",
      "Bought or left behind, for the steps and sale the shop picked",
      "the products chart: the view on screen, and the products selling more and selling less than before",
      "the products table: the page of products on screen",
    ],
    // Seen on MoreHandles, 2026-11-02: the writer brought in Referral and Paid Search, which this page never shows.
    never: [...NO_MONEY, "where visits came from: channels, sources and campaigns are on their own pages, never on this one"],
  },
  // Visits (visits-redo-plan-2026-11-03.md, step 2): every figure in visits or views, never people. Written by the Visitor
  // behaviour specialist, as the page is about who visits and what they look at (the plan's question 8, my recommendation).
  "googleAnalytics.visitors": {
    writer: "INSIGHTS_BEHAVIOUR",
    about: "Visits: how many visits the website had, new and returning, who made them where Google can tell, what they used, and the classifications people looked at",
    parts: [
      "the four boxes: visits, new visits, returning visits and visits a person, each against the span before",
      "new and returning visits by day, with the span before to compare",
      "what people looked at: each page group's views, Not sorted among them",
      "who visits: the visits of each group in the list chosen (new or returning, age, gender, browser, operating system or interest), against the span before",
      "the table: each group in the list chosen, with its people, visits and the page group it lands on most",
    ],
    never: [
      ...NO_MONEY,
      "where visits came from: channels, sources and campaigns are on their own pages, never on this one",
      "conversion rates from this page's lists: they count every conversion, not visits that converted, so a rate can pass 100%",
      "people as a total: the page counts visits, and one person can be new and returning in the same span",
      "asking the reader to sort or group pages: that is done for them",
    ],
  },
  // The websites list and Tracking health carry no eye (Anthony, 2026-11-03: "We dont need the eye on non website data
  // related pages"), so neither has an entry here.,
};
