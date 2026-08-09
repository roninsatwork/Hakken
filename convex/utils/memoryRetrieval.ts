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

/*
 * Outcome-weighted ranking (self-improvement plan, Phase 2).
 *
 * The platform has stamped every consulted memory with how its run ended
 * since the usage table existed, and then ranked purely by search-index
 * position anyway. These functions close that loop: text relevance stays
 * dominant, outcome history is the tiebreaker, and nothing here ever
 * excludes a memory — the blend reorders, floors and nothing else.
 */

export const MEMORY_RANK_TEXT_WEIGHT = 0.7;
export const MEMORY_RANK_QUALITY_WEIGHT = 0.3;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Negative evidence older than this regresses halfway toward neutral… */
const QUALITY_DECAY_START_MS = 30 * DAY_MS;
/** …and past this it stops counting at all, so a memory can recover. */
const QUALITY_DECAY_END_MS = 90 * DAY_MS;

const NEUTRAL_QUALITY = 0.5;

/**
 * The dashboard's quality score, moved here so runtime ranking and the admin
 * screen compute the same number. `now` is a parameter rather than a
 * Date.now() inside, so tests control the clock and callers inside one
 * transaction agree on it.
 */
export function memoryQualityScore(args: {
  importance: number;
  usageCount: number;
  successCount: number;
  failureCount: number;
  cancelledCount: number;
  lastUsedAt?: number;
  updatedAt: number;
  now: number;
}) {
  const successSignal = args.usageCount > 0 ? args.successCount / args.usageCount : 0;
  const failureSignal = args.usageCount > 0 ? (args.failureCount + args.cancelledCount) / args.usageCount : 0;
  const ageMs = args.now - Math.max(args.lastUsedAt ?? 0, args.updatedAt);
  const stalePenalty = ageMs > QUALITY_DECAY_END_MS ? 0.15 : 0;
  return Math.min(Math.max(args.importance + successSignal * 0.35 - failureSignal * 0.45 - stalePenalty, 0), 1);
}

/**
 * The quality input the runtime blend actually uses: cold start is neutral
 * (a new memory must be able to earn a track record, so UNUSED is not
 * buried), and old evidence decays toward neutral (a demoted memory that
 * stops being picked must be able to climb back out).
 *
 * The dashboard keeps showing the undecayed truth via memoryQualityScore;
 * only ranking forgets.
 */
export function qualityForRanking(args: {
  importance: number;
  successCount?: number;
  failureCount?: number;
  cancelledCount?: number;
  lastOutcomeAt?: number;
  now: number;
}): number {
  const successCount = args.successCount ?? 0;
  const failureCount = args.failureCount ?? 0;
  const cancelledCount = args.cancelledCount ?? 0;
  const outcomes = successCount + failureCount + cancelledCount;
  if (outcomes === 0) return NEUTRAL_QUALITY;

  const evidenceAge = args.now - (args.lastOutcomeAt ?? 0);
  if (evidenceAge > QUALITY_DECAY_END_MS) return NEUTRAL_QUALITY;

  const raw = memoryQualityScore({
    importance: args.importance,
    usageCount: outcomes,
    successCount,
    failureCount,
    cancelledCount,
    // Recency is the evidence's own age here; the stale penalty is handled
    // by the decay windows above, not re-applied inside.
    lastUsedAt: args.now,
    updatedAt: args.now,
    now: args.now,
  });

  if (evidenceAge > QUALITY_DECAY_START_MS) {
    return NEUTRAL_QUALITY + (raw - NEUTRAL_QUALITY) / 2;
  }
  return raw;
}

/**
 * The company tier's ranking quality. Company memories ground chat answers,
 * which have no run outcome — end-user ratings are their outcome signal
 * (Phase 3 wires them). Until ratings exist for a memory the only signal is
 * recency: a memory nothing has consulted in 90 days drifts slightly below
 * neutral, matching the dashboard's stale rule, and that is all.
 */
export function companyQualityForRanking(args: {
  confidence: number;
  positiveFeedbackCount?: number;
  negativeFeedbackCount?: number;
  lastFeedbackAt?: number;
  lastUsedAt?: number;
  updatedAt: number;
  now: number;
}): number {
  const positive = args.positiveFeedbackCount ?? 0;
  const negative = args.negativeFeedbackCount ?? 0;
  const total = positive + negative;

  if (total === 0) {
    const idleMs = args.now - Math.max(args.lastUsedAt ?? 0, args.updatedAt);
    return idleMs > QUALITY_DECAY_END_MS ? NEUTRAL_QUALITY - 0.15 : NEUTRAL_QUALITY;
  }

  const evidenceAge = args.now - (args.lastFeedbackAt ?? 0);
  if (evidenceAge > QUALITY_DECAY_END_MS) return NEUTRAL_QUALITY;

  const raw = Math.min(
    Math.max(args.confidence + (positive / total) * 0.35 - (negative / total) * 0.45, 0),
    1
  );
  if (evidenceAge > QUALITY_DECAY_START_MS) {
    return NEUTRAL_QUALITY + (raw - NEUTRAL_QUALITY) / 2;
  }
  return raw;
}

/**
 * Final runtime rank: 70% where the text search put it, 30% track record.
 * Quality can move a memory past a neighbour, never past the whole list.
 */
export function blendedMemoryRank(args: {
  positionalScore: number;
  quality: number;
}): number {
  return Number(
    (MEMORY_RANK_TEXT_WEIGHT * args.positionalScore + MEMORY_RANK_QUALITY_WEIGHT * args.quality).toFixed(4)
  );
}
