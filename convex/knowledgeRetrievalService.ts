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
