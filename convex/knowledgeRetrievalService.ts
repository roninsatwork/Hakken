/**
 * Hybrid ranking for knowledge retrieval: meaning + keywords, one list.
 *
 * Retrieval was similarity-only, which fails in a predictable way: a query
 * naming something exactly — a product code, a person, "SO-4417" — loses to
 * chunks that are *about* similar things, because an exact name is a poor
 * neighbour in embedding space. Keyword search has the opposite failure mode.
 * Running both and fusing the rankings covers each search's blind spot with
 * the other's strength.
 *
 * The fusion is reciprocal rank fusion (RRF): each list contributes
 * `1 / (K + rank)` per chunk, summed across lists. Rank-based rather than
 * score-based on purpose — vector scores are cosine similarities and keyword
 * relevance is unitless, so the scores cannot be compared, but their *ranks*
 * can. K dampens the head of each list so one list's first place cannot
 * steamroll agreement further down.
 *
 * This module is pure. The searches themselves live with their owners (vector
 * search in the calling action, keyword search in `convex/knowledge.ts`);
 * this decides only how the two lists become one.
 */

/** Standard RRF dampening constant; the literature's default. */
export const RRF_K = 60;

export type FusedMatch<IdType extends string = string> = {
  _id: IdType;
  /**
   * Fused score. Comparable only within one fusion call — it is a function of
   * ranks in these lists, not of any absolute relevance.
   */
  _score: number;
};

/**
 * Fuse a vector-ranked list and a keyword-ranked list into one ranking.
 *
 * Both inputs are best-first. Chunks found by both searches sum their
 * contributions, which is the property doing the real work: agreement between
 * two different kinds of evidence outranks a high placement in either alone.
 */
export function fuseRetrievalRankings<IdType extends string>(args: {
  vectorRanked: ReadonlyArray<{ _id: IdType }>;
  keywordRanked: ReadonlyArray<{ _id: IdType }>;
}): FusedMatch<IdType>[] {
  const scores = new Map<IdType, number>();

  const contribute = (list: ReadonlyArray<{ _id: IdType }>) => {
    list.forEach((entry, index) => {
      scores.set(entry._id, (scores.get(entry._id) ?? 0) + 1 / (RRF_K + index + 1));
    });
  };

  contribute(args.vectorRanked);
  contribute(args.keywordRanked);

  return [...scores.entries()]
    .map(([_id, _score]) => ({ _id, _score }))
    .sort((a, b) => b._score - a._score);
}

/*
 * Evidence priors (self-improvement plan, Phase 4).
 *
 * Every rated answer records which chunks grounded it; the evidence sweep
 * folds those ratings into per-chunk counts, and retrieval adds a bounded
 * prior to the fused score. The cap is four head-adjacent rank gaps — the
 * distance from first to fifth place — so history moves a chunk a handful of
 * places and can never overturn clear relevance (RRF scores compress toward
 * the tail, so any cap sized off the *top* contribution would quietly
 * dominate ordering further down; this one is sized off the top *gap*). A
 * chunk with only negative evidence still appears when it is the only
 * relevant source, because the prior reorders and nothing else.
 */

export const CHUNK_PRIOR_CAP = 4 * (1 / (RRF_K + 1) - 1 / (RRF_K + 2));
/** Laplace-style damping so two ratings do not swing like two hundred. */
export const CHUNK_PRIOR_SMOOTHING = 5;
const CHUNK_PRIOR_DECAY_MS = 90 * 24 * 60 * 60 * 1000;

export function chunkPrior(args: {
  positiveEvidence: number;
  negativeEvidence: number;
  lastEvidenceAt: number;
  now: number;
}): number {
  // Old evidence decays to nothing rather than steering forever.
  if (args.now - args.lastEvidenceAt > CHUNK_PRIOR_DECAY_MS) return 0;
  const total = args.positiveEvidence + args.negativeEvidence;
  if (total === 0) return 0;
  const ratio = (args.positiveEvidence - args.negativeEvidence) / (total + CHUNK_PRIOR_SMOOTHING);
  return ratio * CHUNK_PRIOR_CAP;
}

/** Fold priors into a fused ranking. No priors, or all-zero priors: unchanged. */
export function applyChunkPriors<IdType extends string>(
  fused: FusedMatch<IdType>[],
  priors: ReadonlyMap<IdType, number> | undefined
): FusedMatch<IdType>[] {
  if (!priors || priors.size === 0) return fused;
  return fused
    .map((match) => ({ _id: match._id, _score: match._score + (priors.get(match._id) ?? 0) }))
    .sort((a, b) => b._score - a._score);
}

/**
 * The scopes a retrieval may search. Explicit and closed on purpose: the old
 * per-site copies included one that searched with *no* filter when a company
 * was missing, which would have read every tenant's chunks. With this type an
 * unscoped search cannot be expressed — an empty scope set retrieves nothing.
 */
export type KnowledgeRetrievalScope =
  | { kind: "company"; companyId: string }
  | { kind: "agent"; agentId: string }
  | { kind: "thread"; threadId: string }
  | { kind: "global" };
