/**
 * Why a part of a lookup failed, as a code the Keyword research screens put
 * into words of their own (`keywordResearch.problems` in messages). The
 * server never sends a screen its own sentence: that would reach a client
 * untranslated, and could name the data supplier, which a client screen
 * never does (Anthony, 2026-10-04: "why have you violated a rule by naming
 * DataForSEO").
 */
export const RESEARCH_PROBLEMS = ["NO_ANSWER", "NOT_CONNECTED", "SPEND_LIMIT", "TOO_LONG", "STOPPED"] as const;
export type ResearchProblem = (typeof RESEARCH_PROBLEMS)[number];

/** A stored problem as a code a screen can word, or null for anything else — an older row's sentence is never shown. */
export function researchProblemOf(stored: string | null | undefined): ResearchProblem | null {
  return RESEARCH_PROBLEMS.find((code) => code === stored) ?? null;
}
