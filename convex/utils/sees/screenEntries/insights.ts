import type { SeesScreen } from "../screens";
import { ADVICE_NEVER, ADVICE_PART, INSIGHTS_NEVER } from "./never";

/** Insights' pages in the eye's screen list (`screens.ts`), by key. */
export const INSIGHTS_SCREENS: Readonly<Record<string, Partial<SeesScreen> & { about: string }>> = {
  // Insights (ask-hakken-every-chart-page-plan-2026-11-03.md, section 9): each page by the specialist whose work it is,
  // its parts top to bottom, every one with its own findings (own/insights.ts). The pages showing a weekly box write
  // nothing new: their words are the specialist's already. The five that show Hakken's advice write, building on it
  // (decision 2, Anthony, 2026-11-03: "replace whatever has gone before as it's clearly broken").
  "insights.summary": {
    writer: "INSIGHTS_ANALYST",
    about: "the Executive summary: the business at a glance for the period chosen at the top — enquiries, visitors and the share of visits that enquired, against the period before and a year ago — with the strategy's note, what moved and why, the market share, the leagues and the scorecard",
    parts: [
      "the strategy's note: the Head of Strategy's words for the week",
      "the boxes: enquiries, visitors (or visits) and the share that enquired, the period chosen against the period before and a year ago; the place in organic traffic",
      "what moved, by classification and source, and why the enquiries moved",
      "pages competing for the same searches, summed up",
      "each month's share of the market's visitors from Google, against each rival",
      "visitors for each enquiry, month by month",
      "the leagues: the website's place in each",
      "the scorecard: the last 90 days against the same 90 days a year before",
      "what the team did this week and does next",
    ],
    never: INSIGHTS_NEVER,
    // Its own words are the Head of Strategy's note: pressing writes nothing new.
    writes: false,
  },
  "insights.thisWeek": {
    writer: "INSIGHTS_ANALYST",
    about: "This week: the findings the team wrote in its newest run, most at stake first, with how much it checked and ruled out, and visitors and Google clicks for each enquiry against a year before",
    parts: [
      `${ADVICE_PART} (the strategy's verdict, and each finding's headline and first step)`,
      "the boxes: new findings, what is at stake, figures checked and explanations ruled out",
      "visitors and Google clicks for each enquiry: the last 90 days against the same weeks a year before",
      "the table: each finding, how sure the team is and when it is checked again",
    ],
    never: [...INSIGHTS_NEVER, ADVICE_NEVER],
    writes: true,
  },
  "insights.yourMonth": {
    writer: "INSIGHTS_ANALYST",
    about: "Your month: the newest monthly report as written — the month's enquiries, visits and Google clicks against the month before, its enquiries a month, and what the team did",
    parts: [
      `${ADVICE_PART} (the report's headline, summary and every section's words)`,
      "the boxes: enquiries, visits and Google clicks in the month, against the month before",
      "enquiries a month, as the report holds them",
      "what the team did that month",
    ],
    never: [...INSIGHTS_NEVER, ADVICE_NEVER],
    writes: true,
  },
  "insights.report": {
    writer: "INSIGHTS_ANALYST",
    about: "one of the team's reports, exactly as written: its figures against the period before, its enquiries a month and every section's words",
    parts: [
      `${ADVICE_PART} (the report's headline, summary and every section's words)`,
      "the boxes: a monthly report's enquiries, visits and Google clicks against the month before; a weekly or board report's scorecard, the last 90 days against the same 90 a year before",
      "enquiries a month, as the report holds them",
      "the report's sections, each line of its words",
    ],
    never: [...INSIGHTS_NEVER, ADVICE_NEVER],
    writes: true,
  },
  "insights.findings": {
    writer: "INSIGHTS_ANALYST",
    about: "Findings: every finding the team wrote for the company, newest first, by the week it was found and the section of the menu it is filed under, and when each is checked again",
    parts: [
      `${ADVICE_PART} (each section's biggest finding and its first step)`,
      "findings each week, by section, the newest twelve weeks",
      "checks due, by month",
      "the table: every finding, its week, its section and how sure the team is",
    ],
    never: [...INSIGHTS_NEVER, ADVICE_NEVER],
    writes: true,
  },
  "insights.finding": {
    writer: "INSIGHTS_ANALYST",
    about: "one finding, its whole case: the story and what to do first, the figures it rests on against what each is set against, every piece of evidence by its source, what the team ruled out, and when the team checks it again",
    parts: [
      `${ADVICE_PART} (the finding's headline, story, first step and how we'll know)`,
      "the boxes and the chart: each figure the finding rests on, against what it is set against",
      "the evidence, by its source",
      "what the specialists ruled out, and why",
      "when the team checks again, and its figure so far",
    ],
    never: [...INSIGHTS_NEVER, ADVICE_NEVER],
    writes: true,
  },
  "insights.enquiries": {
    writer: "INSIGHTS_ANALYST",
    about: "What brings enquiries: the period chosen at the top against the period before and a year ago — enquiries by classification, by source (each by its own name), by search and page, and by kind of enquiry",
    parts: [
      "the boxes: enquiries, those from service pages and from articles, and service visits for each enquiry",
      "enquiries by classification month by month, against the period compared, the share that enquired, and each kind's share of visits against its share of enquiries",
      "the table of classifications",
      "enquiries by source against the period compared, and the table of sources",
      "the searches behind the enquiries (estimated), the searches whose pages brought none, the pages behind them and the pages read on the way",
      "each kind of enquiry, month by month, and its table",
    ],
    never: [...INSIGHTS_NEVER, "a search's enquiries as counted: they are estimated from its page's enquiries from Google"],
    writes: false,
  },
  "insights.enquiriesSource": {
    writer: "INSIGHTS_ANALYST",
    about: "one source's enquiries, by its own name: its visits and enquiries month by month, the period chosen against the period before and a year ago, beside the whole website's, and the classifications and pages it sent people to",
    parts: [
      "the boxes: its visits and enquiries in the period chosen against the period compared, and the share of its visits that enquired",
      "its visits and enquiries, month by month",
      "the classifications it sent people to, visits against enquiries",
      "the pages it sent people to",
    ],
    never: [...INSIGHTS_NEVER, "other sources: this page is about one"],
  },
  "insights.funnel": {
    writer: "INSIGHTS_CONVERSION",
    about: "the funnel, from being shown on Google to enquiring: each step over the last 90 days against the same days a year before, the share that enquired by classification for the period chosen, and each source's enquiry rate over the last 12 months against the 12 before",
    parts: [
      "each step's share going on to the next, the last 90 days against the same days a year before",
      "visits that enquired, by classification, for the period chosen at the top",
      "the steps: shown on Google, clicked, visited, enquired",
      "each source's visits, enquiries and enquiry rate, the last 12 months against the 12 before",
    ],
    never: INSIGHTS_NEVER,
    writes: false,
  },
  "insights.aiSearch": {
    writer: "INSIGHTS_AI_VISIBILITY",
    about: "AI search: the visits and enquiries each AI assistant sent, month by month, the last three months against the three before and a year ago, the classifications they land on, and how each AI engine names the business against its rivals",
    parts: [
      "visits and enquiries from AI assistants: the last three months against the three before and a year ago",
      "visits from each assistant, month by month, and each against the period compared",
      "the classifications AI visitors land on, visits against enquiries",
      "each AI engine's answers naming, recommending and citing the business against each rival, in the newest month",
      "the pages AI assistants cite",
      "mentions in AI answers, and how often the searches are asked of AI, where bought",
    ],
    never: INSIGHTS_NEVER,
    writes: false,
  },
  "insights.cannibalisation": {
    writer: "INSIGHTS_CANNIBALISATION",
    about: "Keyword cannibalisation: groups of the website's pages Google shows for the same searches, biggest first — the searches they share and split, times shown against clicks, the enquiries they bring, the page that should own them and how sure the team is",
    parts: [
      "each group's times shown, Google clicks, and clicks with the right page in the top three",
      "the table: each group's pages, shared and split searches, times shown, clicks, recent enquiries against the same three months a year before, and its owner",
    ],
    never: [...INSIGHTS_NEVER, "the clicks or enquiries the right page would win as if measured: they are estimates"],
  },
  "insights.cannibalisationGroup": {
    writer: "INSIGHTS_CANNIBALISATION",
    about: "one group of pages competing for the same searches: each page's clicks, times shown and enquiries, the page that should own the searches, and every search with the page Google shows",
    parts: [
      "who decided the group, and the page that should own its searches",
      "each page's Google clicks and times shown",
      "the searches where the right page in the top three would win most",
      "the table of pages: their clicks, times shown, enquiries and what to do with each",
      "the table of searches: each with its place, the page Google shows and the page that should own it",
    ],
    never: [...INSIGHTS_NEVER, "the clicks or enquiries the right page would win as if measured: they are estimates"],
  },
  "insights.leaderboards": {
    writer: "INSIGHTS_MARKET",
    about: "Leaderboards: the business against its rivals in each league — domain authority, organic traffic, AI mindshare, share of voice, links, AI Overviews, AI recommendations, pages AI cites and reviews — each with every website's figure and place",
    parts: [
      "the boxes: leagues led, the best place, the league climbing most, the weakest place",
      "the main leagues, each website's figure on its bar",
      "every other league",
    ],
    never: [...INSIGHTS_NEVER, "estimated visitors from Google as measured visits: they are our data supplier's estimate"],
    writes: false,
  },
  "insights.leaderboard": {
    writer: "INSIGHTS_MARKET",
    about: "one league: the website's place and figure, the gap to the place above and to the leader, and every website in it with its figure, its move since a year before where held, and its gap to the place above",
    parts: [
      "the boxes: the place, the figure, the gap to the place above",
      "the league as a chart, each website's figure on its bar",
      "the table: every website, its figure, move and gap",
    ],
    never: [...INSIGHTS_NEVER, "estimated visitors from Google as measured visits: they are our data supplier's estimate"],
  },
  "insights.measurement": {
    writer: "INSIGHTS_MEASUREMENT",
    about: "the Measurement check: whether the website's figures can be trusted — Google's clicks against Analytics' visits from Google day by day, and each check of how enquiries and visits are counted, with where each is put right",
    parts: [
      "Google's clicks against Analytics' visits from Google, day by day, the last eight weeks",
      "the table: each check, what it found and whether it needs a look",
    ],
    never: INSIGHTS_NEVER,
    writes: false,
  },
  "insights.opportunities": {
    writer: "INSIGHTS_SEARCH",
    about: "Opportunities: searches within reach, ranked by how often they are made, where the website stands and how well the page they land on turns visitors into enquiries",
    parts: [
      "each search's place against its times shown, the pages enquiring at least as well as the whole website apart",
      "opportunities by classification",
      "the table: each search, its page, place, times shown, monthly searches and the page's enquiry rate",
    ],
    never: [...INSIGHTS_NEVER, "what a click costs, or what a search is worth in money: searches are weighed by how often they are made"],
    writes: false,
  },
  "insights.pagePlan": {
    writer: "INSIGHTS_PAGE_DECISIONS",
    about: "Page decisions: what to do with each page — improve, merge, redirect, remove or keep — the pages in the plan with the search each should win, and the pages to create",
    parts: [
      "the page plan: each planned page, why, and its one thing to do",
      "enquiries a year, the pages in the plan: the last 12 months against the 12 before",
      "verdicts by classification",
      "every page decided, with its verdict and why",
      "the pages to create, for searches the website has no page for",
    ],
    never: INSIGHTS_NEVER,
    writes: false,
  },
  "insights.pageReviews": {
    writer: "INSIGHTS_PAGE_DECISIONS",
    about: "Page reviews: each money page reviewed, with its visitors for each enquiry over the last 12 months against the 12 before, and the Conversion specialist's verdict",
    parts: [
      "visitors for each enquiry, each page: the last 12 months against the 12 before",
      "the table: each page, its visitors, enquiries and verdict",
    ],
    never: [...INSIGHTS_NEVER, "visitors as visits: these pages count people over the year"],
  },
  "insights.pageReview": {
    writer: "INSIGHTS_PAGE_DECISIONS",
    about: "one page's review: its visitors for each enquiry against a year before and over the last 90 days, its enquiries, visitors and Google clicks, the verdict and first steps, the searches that bring people to it with the best rival on each, where its visitors came from just before, and the rivals' pages AI cites for it",
    parts: [
      "the boxes: visitors for each enquiry, enquiries, visitors and Google clicks, each against before",
      "visitors for each enquiry: the year before, the last year and the last 90 days",
      "the searches that bring people to it, with the best rival on each",
      "where its visitors were just before",
      "the rivals' pages AI assistants cite for it",
    ],
    never: [...INSIGHTS_NEVER, "visitors as visits: this page counts people over the year"],
  },
  "insights.strategy": {
    writer: "INSIGHTS_ANALYST",
    about: "the strategy for the quarter: each service with its Google clicks, times shown and enquiries over the last 12 months against the 12 before, and the call made for it, with the roadmap",
    parts: [
      "enquiries by service: the last 12 months against the 12 before",
      "the table: each service's clicks, times shown, visits, enquiries and the call",
      "the roadmap: what to do, what we expect and how we'll know",
    ],
    never: INSIGHTS_NEVER,
    writes: false,
  },
  "insights.trackRecord": { writer: "INSIGHTS_ANALYST", about: "the team's track record: what it advised and what happened", writes: false },
  "insights.experiments": { writer: "INSIGHTS_ANALYST", about: "the experiments the team suggested and how they went" },
  "insights.findingsSection": { writer: "INSIGHTS_ANALYST", about: "the team's findings in one section" },
  "insights.strategyService": { writer: "INSIGHTS_ANALYST", about: "one service in the strategy" },
};
