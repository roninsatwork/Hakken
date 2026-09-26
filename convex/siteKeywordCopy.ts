import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { keywordsCopyKey, readListCopy } from "./siteListCopies";

/**
 * The compact copy of a site's keywords (docs/plans/active/
 * sites-table-pages-plan.md §5.2): every search it has a row for, from one
 * place, with what All keywords, a page's keywords, Wins and losses and a
 * competitor's shared searches are searched, filtered and sorted by. Written
 * by the site rebuild, which reads every keyword already
 * (`siteSummaries.rebuildSiteNow`), and read here.
 *
 * The copy keeps the rebuild's two days beside it: the ranking day, whose
 * moves Wins and losses shows (T10), and the latest check, before which a
 * search still held was not seen again (T9).
 */

/**
 * The row's id leads, so the rows on screen are read in full by id — the
 * cheapest read there is — rather than looked up by keyword one by one.
 */
export const KEYWORD_COPY_FIELDS = [
  "id", "keyword", "position", "band", "page", "volume", "intent", "status", "change", "day", "kdBand", "cpc", "traffic",
] as const;

export type KeywordCopyRow = {
  id: Id<"siteKeywordRanks">;
  keyword: string;
  position: number | null;
  band: Doc<"siteKeywordRanks">["band"];
  page: string;
  /** Null when the search's volume is not known. */
  volume: number | null;
  intent: Doc<"siteKeywordRanks">["intent"];
  status: Doc<"siteKeywordRanks">["status"];
  change: number;
  day: string;
  kdBand: NonNullable<Doc<"siteKeywordRanks">["kdBand"]> | null;
  cpc: number | null;
  traffic: number | null;
};

/** A keyword as its row stands, or as the rebuild is about to mark it lost. */
export function keywordCopyTuple(row: Doc<"siteKeywordRanks">, lostOn?: string): unknown[] {
  if (lostOn !== undefined) {
    return [row._id, row.keyword, null, "zz_none", row.page, row.volumeKnown ? row.volume : null, row.intent, "LOST", 0, lostOn, row.kdBand ?? null, row.cpc ?? null, null];
  }
  return [
    row._id, row.keyword, row.position ?? null, row.band, row.page, row.volumeKnown ? row.volume : null, row.intent, row.status,
    row.change, row.day, row.kdBand ?? null, row.cpc ?? null, row.traffic ?? null,
  ];
}

function decode(tuple: unknown[]): KeywordCopyRow {
  const [id, keyword, position, band, page, volume, intent, status, change, day, kdBand, cpc, traffic] = tuple;
  return {
    id: id as Id<"siteKeywordRanks">,
    keyword: keyword as string,
    position: position as number | null,
    band: band as KeywordCopyRow["band"],
    page: page as string,
    volume: volume as number | null,
    intent: intent as KeywordCopyRow["intent"],
    status: status as KeywordCopyRow["status"],
    change: change as number,
    day: day as string,
    kdBand: kdBand as KeywordCopyRow["kdBand"],
    cpc: cpc as number | null,
    traffic: traffic as number | null,
  };
}

export type KeywordCopy = {
  rows: KeywordCopyRow[];
  /** The day of the rebuild's last check: the moves Wins and losses shows, as the menu counts them. */
  rankingDay: string | null;
  /** The day of the latest keyword check that has fully arrived (T9), or null when there is none to judge by. */
  latestCheckDay: string | null;
};

/** A site's keyword copy from one place, or null while it has none yet. */
export async function readKeywordCopy(ctx: QueryCtx, websiteId: Id<"websites">, locationCode: number): Promise<KeywordCopy | null> {
  const copy = await readListCopy(ctx, "keywords", keywordsCopyKey(websiteId, locationCode), KEYWORD_COPY_FIELDS);
  if (!copy) return null;
  const rankingDay = typeof copy.meta.rankingDay === "string" ? copy.meta.rankingDay : null;
  const latestCheckDay = typeof copy.meta.latestCheckDay === "string" ? copy.meta.latestCheckDay : null;
  return { rows: copy.rows.map(decode), rankingDay, latestCheckDay };
}

/**
 * Where a keyword stands against the latest check (T9): `lost`, known to
 * rank no longer; `older`, still held from a check before the latest, not
 * seen since — kept, and never called lost, for a list held below the site's
 * real total says nothing of the searches it left out; or `current`.
 */
export function keywordStanding(row: { status: KeywordCopyRow["status"]; position: number | null; day: string }, latestCheckDay: string | null): "lost" | "older" | "current" {
  if (row.status === "LOST" || row.position === null) return "lost";
  if (latestCheckDay !== null && row.day < latestCheckDay) return "older";
  return "current";
}
