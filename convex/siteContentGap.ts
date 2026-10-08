import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { keywordStanding, readKeywordCopy, type KeywordCopyRow } from "./siteKeywordCopy";
import { GAP_KEYWORDS_PER_RIVAL, type RankIntent } from "./utils/siteShapes";

/**
 * The content gap: searches a company's own website's competitors rank for
 * and it does not.
 *
 * **Worked out when it is read, from what is already kept** (Anthony,
 * 2026-10-06: "we already track the keywords for 5 competitors and then ours,
 * why do we need to store it again"). Each website's keywords are kept once,
 * in its compact copy (`siteKeywordCopy.ts`); a gap is the competitors'
 * copies less the website's own, so it is never stored. Until then every hold
 * kept its own gap rows and a copy of them, rebuilt whenever any website in
 * its group was: on dev, 177,033 rows from 31,830 keywords, and about a third
 * of all Hakken's database reading and writing.
 *
 * **For a company's own websites only** (Anthony, 2026-10-06: "we don't need
 * content gap for sites we track — that's a report for owned only"). A
 * competitor's Content gap says so and leads to its own website's.
 *
 * "Ranks for" means at the latest check, on both sides, as a competitor's
 * shared searches read it (`keywordStanding`): a search a rival was last seen
 * on before its latest check is not one it ranks for, and one the site held
 * only before its own latest check is not one the site has
 * (docs/plans/active/sites-audit-fixes-plan.md, 4.10).
 *
 * **Bounded, and says so.** A rival is read to its `GAP_KEYWORDS_PER_RIVAL`
 * most-searched keywords, and the gap to `GAP_MAX` searches, the most
 * searched first; the screen names the ceiling.
 */

/** Rivals compared for one site. More than this is a plan conversation. */
export const MAX_RIVALS = 25;

/** Searches a gap keeps, most-searched first; past this the screen says the list is longer. */
export const GAP_MAX = 50_000;

/** One search the site's competitors rank for and it does not. */
export type GapRow = {
  keyword: string;
  /** The most any rival's row says it is searched; null when none knows. */
  volume: number | null;
  intent: RankIntent;
  /** How hard the search is, 0–100: the first ranking that knows says. */
  difficulty: number | null;
  rivals: Array<{ websiteId: Id<"websites">; position: number; traffic: number | null }>;
  /** The newest day a rival was seen ranking for it. */
  day: string;
};

/** The ranking rows of a copy that stand at its latest check. */
function rankingNow(rows: KeywordCopyRow[], latestCheckDay: string | null): KeywordCopyRow[] {
  return rows.filter((row) => keywordStanding(row, latestCheckDay) === "current");
}

/**
 * A site's content gap against these rivals, from the place it is watched
 * from, the most searched first: null while the site's own keyword copy is
 * not built yet. A rival with no copy yet adds nothing until it has one.
 */
export async function contentGapOf(
  ctx: QueryCtx,
  site: { websiteId: Id<"websites">; place: number },
  rivalIds: readonly Id<"websites">[],
): Promise<{ rows: GapRow[]; cut: number | null } | null> {
  const own = await readKeywordCopy(ctx, site.websiteId, site.place);
  if (!own) return null;
  const ours = new Set(rankingNow(own.rows, own.latestCheckDay).map((row) => row.keyword));

  const gaps = new Map<string, GapRow>();
  for (const rivalId of rivalIds.slice(0, MAX_RIVALS)) {
    const copy = await readKeywordCopy(ctx, rivalId, site.place);
    if (!copy) continue;
    const ranking = rankingNow(copy.rows, copy.latestCheckDay)
      .sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1))
      .slice(0, GAP_KEYWORDS_PER_RIVAL);
    for (const row of ranking) {
      if (ours.has(row.keyword)) continue;
      const gap = gaps.get(row.keyword) ?? {
        keyword: row.keyword, volume: null, intent: row.intent, difficulty: null, rivals: [], day: row.day,
      };
      gap.rivals.push({ websiteId: rivalId, position: row.position as number, traffic: row.traffic });
      // A search is as hard whoever ranks for it: the first ranking that knows says.
      if (gap.difficulty === null) gap.difficulty = row.difficulty;
      if (row.volume !== null && (gap.volume === null || row.volume > gap.volume)) gap.volume = row.volume;
      if (row.day > gap.day) gap.day = row.day;
      gaps.set(row.keyword, gap);
    }
  }
  const rows = [...gaps.values()].sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1));
  return rows.length > GAP_MAX ? { rows: rows.slice(0, GAP_MAX), cut: GAP_MAX } : { rows, cut: null };
}
