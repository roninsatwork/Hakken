/**
 * Finding the WHEN_RELEVANT memories for a message.
 *
 * This replaces two near-identical copies of the same broken lookup — one in
 * companyMemories.ts, one in agentMemories.ts. Both read the newest 100 rows,
 * counted how many of the message's words appeared anywhere in the memory as a
 * substring ("cat" matched "catalogue"), then added the memory's confidence to
 * that count *before* filtering on `score > 0`. Because confidence defaults
 * above zero, the filter passed everything: with five memories or fewer all of
 * them were sent every time, and past five the keyword count silently decided
 * which ones survived. Neither behaviour was the intended one.
 *
 * Convex's full-text search index does this properly and is indexed, so the
 * 100-row window and the hand-rolled scoring both go away.
 */

/**
 * Convex accepts at most 16 terms in a search query. A long message would
 * otherwise be truncated somewhere inside the query engine rather than here.
 */
const MAX_SEARCH_TERMS = 16;

/**
 * Words that appear in almost every message and so tell the index nothing.
 * Kept deliberately short: an over-eager stop list is how a genuine question
 * ends up with no searchable terms at all.
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "you", "your", "our", "are", "was", "were", "can", "could",
  "would", "should", "have", "has", "had", "with", "from", "this", "that", "these",
  "those", "there", "their", "what", "when", "where", "which", "who", "how", "why",
  "please", "thanks", "thank", "hello", "just", "about", "any", "all", "get", "got",
]);

/**
 * Turn a message into a search query, or "" when there is nothing worth
 * searching for.
 *
 * An empty result is no longer a dead end: ALWAYS memories reach the model
 * through the system instruction, so a visitor typing "hi" still gets the
 * company's boundaries. It only means there is nothing to look up.
 */
export function buildMemorySearchQuery(queryText: string): string {
  const terms: string[] = [];
  const seen = new Set<string>();

  for (const rawTerm of queryText.toLowerCase().split(/\s+/)) {
    const term = rawTerm.replace(/[^a-z0-9]/g, "");
    if (term.length < 3) continue;
    if (STOP_WORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }

  return terms.join(" ");
}

/**
 * A stand-in for relevance in the usage record.
 *
 * Convex does not expose the relevance score behind a search index, and the
 * usage tables have always stored a number. Recording position — 1 for the best
 * match, descending — is at least true, where storing the old hand-rolled score
 * would now be a number nothing computed.
 */
export function rankScore(index: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((total - index) / total).toFixed(4));
}
