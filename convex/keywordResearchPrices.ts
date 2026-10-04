import { SERP_DEPTH, TOP_PAGES } from "./keywordResearchCalls";

/**
 * What each part of a lookup costs (docs/plans/active/keyword-research-
 * plan.md, "What each lookup buys"), worked out from DataForSEO's published
 * prices — checked 2026-10-04 — and the company's own limits, so a screen
 * says what opening a part will cost rather than a figure written into its
 * words. In whole cents, never less than one: a guide, since a call that
 * returns fewer rows than asked for costs a little less.
 */

/** DataForSEO Labs: a call, and each row it returns. */
const LABS_CALL_USD = 0.012;
const LABS_ROW_USD = 0.00012;
/** A live Google results page of ten, and each further page of ten. */
const SERP_FIRST_PAGE_USD = 0.002;
const SERP_NEXT_PAGE_USD = 0.0015;
/** Backlinks: a call, and each row it returns. */
const BACKLINKS_CALL_USD = 0.024;
const BACKLINKS_ROW_USD = 0.000036;
/** LLM Mentions, for Google's AI Overview searches: a call, and each search it returns. */
const MENTIONS_CALL_USD = 0.1;
const MENTIONS_ROW_USD = 0.001;
/** The four assistants' answers together, as charged on dev: 7.4 cents, each between 0.6 and 3.8. */
const ASSISTANTS_USD = 0.074;

const labs = (rows: number) => LABS_CALL_USD + rows * LABS_ROW_USD;
const cents = (usd: number) => Math.max(1, Math.round(usd * 100));

export type ResearchCosts = {
  /** A keyword looked up: its overview, its 24 months, Google's top 100, and the top ten's visits. */
  lookUp: number;
  /** Google's results opened: the top ten's strength, linking websites and what each ranks for. */
  results: number;
  /** Keyword ideas opened: terms match and questions, the company's number of each. */
  ideas: number;
  /** What the AI says opened: four assistants and Google's AI Overview searches. */
  answers: number;
  /** Another country picked: its overview alone. */
  country: number;
};

export function researchCosts(limits: { researchIdeasPerKind: number; researchOverviewSearches: number }): ResearchCosts {
  const serp = SERP_FIRST_PAGE_USD + (SERP_DEPTH / 10 - 1) * SERP_NEXT_PAGE_USD;
  // Each top page's keywords, enough that the ten together make the company's number of "also rank for" ideas.
  const perPage = Math.max(1, Math.ceil(limits.researchIdeasPerKind / TOP_PAGES));
  const searches = limits.researchOverviewSearches;
  return {
    lookUp: cents(labs(1) + labs(1) + serp + labs(TOP_PAGES)),
    results: cents(2 * (BACKLINKS_CALL_USD + TOP_PAGES * BACKLINKS_ROW_USD) + TOP_PAGES * labs(perPage)),
    ideas: cents(2 * labs(limits.researchIdeasPerKind)),
    answers: cents(ASSISTANTS_USD + (searches > 0 ? MENTIONS_CALL_USD + searches * MENTIONS_ROW_USD : 0)),
    country: cents(labs(1)),
  };
}
