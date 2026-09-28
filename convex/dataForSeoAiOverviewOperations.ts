import type { SeoOperation } from "./dataForSeoRegistry";
import { wordsOf } from "./utils/wordStarts";
import { countryCodeOf, DEFAULT_LOCATION_CODE, findSeoLocation } from "./utils/seoLocations";

/**
 * Google's own fan-out searches (docs/plans/active/fan-out-angles-plan.md,
 * FA8): what Google's AI Overviews searched to answer Google searches on one
 * of a company's question topics, bought from DataForSEO's LLM Mentions. The
 * assistants' fan-outs come with every answer we already buy; Google's AI
 * Overviews are asked no question of ours, so they are found by topic instead.
 *
 * Read from DataForSEO's documentation on 2026-09-28
 * (`/v3/ai_optimization/llm_mentions/search/live`): live only; a target of up
 * to 10 entities, which narrow one another, so one topic is one request; a
 * keyword entity searched in Google's searches themselves (`search_scope`
 * `question`), matched as whole words with other words allowed before,
 * between and after (`word_match`); up to 1,000 rows a request (default 100),
 * each an AI Overview with its `fan_out_queries`. Priced at $0.10 a request
 * and $0.001 a row — the documented example of three rows cost $0.103 — so a
 * topic at 100 rows is about $0.20. Google's platform takes a location code
 * and a language; ChatGPT's data there is the United States only, which is
 * why only Google's is bought.
 *
 * Off unless a company chooses how many rows to buy per question on its
 * Fan-out limits (`googleSearchesRead`, `fanOutLimits.ts`); bought at most
 * once every 30 days per topic, place and size, and shared by every company
 * whose question has the topic, as an answer is.
 */

export const AI_OVERVIEW_FAN_OUT_OPERATION = "ai_overview_fan_out";

/** How long a topic's purchase is held before it is bought again. */
export const AI_OVERVIEW_REFRESH_DAYS = 30;

/**
 * The start of the 30-day period a run falls in, which a topic's purchase is
 * keyed on in place of the run's day: every run in the period finds the one
 * purchase by its key, whichever company's run it is. A topic first bought
 * late in a period is bought again when the next begins, and then once a period.
 */
export function aiOverviewPeriodStart(startedAt: number): number {
  const period = AI_OVERVIEW_REFRESH_DAYS * 86_400_000;
  return Math.floor(startedAt / period) * period;
}

export const AI_OVERVIEW_OPERATIONS: readonly SeoOperation[] = [
  {
    id: AI_OVERVIEW_FAN_OUT_OPERATION,
    question: "What did Google's AI Overviews search, for Google searches on this topic?",
    family: "AI Optimization",
    mode: "LIVE",
    path: "/v3/ai_optimization/llm_mentions/search/live",
    costBand: "medium",
    refresh: { everyDays: AI_OVERVIEW_REFRESH_DAYS },
    params: {
      keyword: {
        kind: "keyword",
        required: true,
        description: "The topic, as a few words: 'best carp fishing rod'. Searched for in Google's own searches that showed an AI Overview.",
      },
    },
  },
];

/** Words that make a question a question rather than its topic. */
const QUESTION_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "for", "of", "to", "in", "on", "at", "by", "with", "and", "or", "vs", "versus", "from", "into", "per",
  "what", "whats", "which", "who", "whom", "whose", "where", "when", "why", "how",
  "is", "are", "was", "were", "be", "do", "does", "did", "can", "could", "should", "would", "will",
  "i", "me", "my", "we", "us", "our", "you", "your", "it", "its", "there", "any", "some",
]);

/** A topic's most words: every one must appear in a Google search that matches it, so fewer finds more. */
const TOPIC_WORDS = 6;

/**
 * A question's topic, as Google's searches would word it: its words without
 * the ones that make it a question, in its own order, at most six —
 * "What is the best carp fishing rod for beginners?" is "best carp fishing
 * rod beginners". Word forms are kept: DataForSEO matches whole words.
 * Empty when a question is nothing but those words.
 */
export function googleTopicOf(question: string): string {
  return wordsOf(question.replace(/['’]/g, "")).filter((word) => !QUESTION_WORDS.has(word)).slice(0, TOPIC_WORDS).join(" ");
}

/** The country a watcher's Google fan-outs are bought for, as rows are keyed: `GB`. */
export function aiOverviewPlace(locationCode: number | undefined): string {
  const country = countryCodeOf(locationCode ?? DEFAULT_LOCATION_CODE);
  return findSeoLocation(country)?.countryIso ?? findSeoLocation(DEFAULT_LOCATION_CODE)!.countryIso;
}

/**
 * What one topic's purchase is sent — byte for byte the same for every
 * company asking the same topic from the same country at the same size,
 * which is what makes it one purchase. The busiest of Google's searches first.
 */
export function aiOverviewFanOutParams(topic: string, locationCode: number | undefined, rows: number): Record<string, unknown> {
  return {
    target: [{ keyword: topic, search_scope: ["question"], match_type: "word_match" }],
    platform: "google",
    location_code: countryCodeOf(locationCode ?? DEFAULT_LOCATION_CODE),
    language_code: "en",
    order_by: ["ai_search_volume,desc"],
    limit: rows,
  };
}
