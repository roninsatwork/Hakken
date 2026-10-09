import type { SeoOperation } from "./dataForSeoRegistry";

/**
 * AI demand (docs/plans/active/discovery-local-reputation-ai-plan.md, step 3,
 * D8): how often each search is asked of AI tools a month, with its last
 * twelve months — DataForSEO's AI Keyword Data, up to 1,000 searches a call,
 * $0.0105 for 5 tried 2026-10-09. Built from Google's "People also ask", so a
 * local search ("web design guildford") is too few to count (§6A). Bought
 * monthly, for a company with "AI demand" on (D16).
 */
export const AI_DEMAND_OPERATION = "ai_keyword_volume";

/** The most searches one call takes. */
export const SEARCHES_PER_AI_DEMAND_REQUEST = 1_000;

export const AI_DEMAND_OPERATIONS: readonly SeoOperation[] = [{
  id: AI_DEMAND_OPERATION,
  question: "How often is each of these searches asked of AI tools a month?",
  family: "AI Optimization",
  mode: "LIVE",
  path: "/v3/ai_optimization/ai_keyword_data/keywords_search_volume/live",
  costBand: "low",
  params: {
    keywords: { kind: "keywords", required: true, description: "Up to 1,000 searches, separated by commas." },
    location_code: { kind: "number", required: false, description: "Where they are asked from. Leave unset for the United Kingdom.", default: 2826 },
    language_code: { kind: "keyword", required: false, description: "The language they are asked in. Leave unset for English.", default: "en" },
  },
}];

export function isAiDemandOperation(operationId: string): boolean {
  return operationId === AI_DEMAND_OPERATION;
}
