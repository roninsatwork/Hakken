import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { SearchConsolePeriod, SearchConsolePeriodList, SearchType } from "./searchConsoleSchema";
import { FROM_SEARCH_LINES, searchLinesCountry } from "./searchConsoleShrink";
import { decodePages, isPageRef, refFor } from "./searchConsolePageRefs";
import { rowsOf, type Row } from "./utils/searchConsolePacks";
import { PARTS_MOST } from "./searchConsoleRollups";
import { UNKNOWN } from "./searchConsoleFacts";

/**
 * Reading the ready-made periods (search-console-plan.md §14.3): a list
 * whole, or one keyword's pages and one page's keywords by index — always
 * from a period's newest complete build, so a list being built again is
 * never read half done. Apart from `searchConsolePeriods.ts`, which builds
 * them, to keep each file a size one can hold in mind.
 */

/** A ready-made period's parts, from its newest complete build only (`firstPartOf`). */
export async function periodParts(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
) {
  const parts = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", companyWebsiteId)
      .eq("country", country)
      .eq("searchType", searchType)
      .eq("list", list)
      .eq("period", period)
      .eq("which", which))
    .take(PARTS_MOST);
  // One read: an older build is beside the newest only while it is being cleared.
  const built = parts.filter((part) => part.part === 0).reduce((newest, part) => Math.max(newest, part.builtAt), -Infinity);
  return parts.filter((part) => part.builtAt === built);
}

/** First parts read for a period: the one being swapped in, and the one before it. */
export const FIRST_PARTS_READ = 3;

/**
 * A ready-made period's first part, which says its days: the newest complete
 * build's — a build writes its first part last, so a build being written is
 * not read until it is whole.
 */
export async function firstPartOf(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  country: string | undefined,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
) {
  const firsts = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period", (q) => q
      .eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType).eq("list", list).eq("period", period).eq("which", which).eq("part", 0))
    .take(FIRST_PARTS_READ);
  return firsts.reduce<(typeof firsts)[number] | null>((newest, part) => (newest === null || part.builtAt > newest.builtAt ? part : newest), null);
}

/**
 * Twelve months kept as the 90 days (`sameAsNinety`): given the first part
 * read for a period, the 90 days' first part when the period is twelve
 * months, its slot holds only the empty part saying its days, and the 90
 * days are those days. Null otherwise — the period is read as it is, with no
 * read more than before.
 */
async function ninetyInstead(
  ctx: { db: QueryCtx["db"] },
  scope: { companyWebsiteId: Id<"companyWebsites">; country: string | undefined; searchType: SearchType; list: SearchConsolePeriodList },
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
  first: { keys: string[]; from: string; to: string; part: number } | null,
  parts: number,
) {
  if (period !== "365" || which !== "NOW" || !first || first.keys.length > 0 || parts > 1) return null;
  const ninety = await firstPartOf(ctx, scope.companyWebsiteId, scope.country, scope.searchType, scope.list, "90", "NOW");
  return ninety && ninety.from === first.from && ninety.to === first.to ? ninety : null;
}

/** A row of a ready-made period: its figures, and — where kept — its count and top, and Sites' facts (UNKNOWN for none). */
export type PeriodRow = Row & { count?: number; top?: string; kind?: string; volume?: number; estimate?: number };

/** A ready-made period's list — all countries', or one country's kept ready — its parts put back together; null when nothing is built for it. */
export async function readPeriod(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  list: SearchConsolePeriodList,
  period: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
  country?: string,
): Promise<{ from: string; to: string; builtAt: number; shown: number | null; rows: PeriodRow[] } | null> {
  // Read only: a country nearly all of the searches reads its searches and pages as all countries (`searchConsoleShrink.ts`).
  const scope = FROM_SEARCH_LINES.has(list) ? await searchLinesCountry(ctx, companyWebsiteId, country) : country;
  let parts = (await periodParts(ctx, companyWebsiteId, scope, searchType, list, period, which)).sort((left, right) => left.part - right.part);
  if (parts.length === 0) return null;
  if (await ninetyInstead(ctx, { companyWebsiteId, country: scope, searchType, list }, period, which, parts[0], parts.length)) {
    parts = (await periodParts(ctx, companyWebsiteId, scope, searchType, list, "90", "NOW")).sort((left, right) => left.part - right.part);
  }
  const rows: PeriodRow[] = [];
  for (const part of parts) {
    let index = 0;
    for (const row of rowsOf(part)) {
      rows.push(withKept(row, part, index));
      index += 1;
    }
  }
  return { from: parts[0].from, to: parts[0].to, builtAt: parts[0].builtAt, shown: parts[0].shown ?? null, rows };
}

type KeptBeside = Pick<Doc<"searchConsolePeriods">, "counts" | "tops" | "kinds" | "volumes" | "estimates">;

/** A row of a part, with the figures kept beside it at its place. */
function withKept(row: Row, part: KeptBeside, index: number): PeriodRow {
  return {
    ...row,
    ...(part.counts ? { count: part.counts[index] ?? 0 } : {}),
    ...(part.tops ? { top: part.tops[index] ?? "" } : {}),
    ...(part.kinds ? { kind: part.kinds[index] ?? "UNJUDGED" } : {}),
    ...(part.volumes ? { volume: part.volumes[index] ?? UNKNOWN } : {}),
    ...(part.estimates ? { estimate: part.estimates[index] ?? UNKNOWN } : {}),
  };
}

/**
 * One keyword's pages (`pair`, kept by keyword) or one page's keywords
 * (`pairByPage`, kept by page) from a ready-made period: the parts starting
 * with the key and the one just before, which may hold its first rows — read
 * by index, never the whole period. Each row is the other side — a
 * keyword's pages keyed by page — with the figures kept beside it. Null when
 * the period is not built, or was built before the pairs were kept in key
 * order (2026-10-03): the screen says it is being prepared until the next
 * build.
 */
export async function readKeyed(
  ctx: { db: QueryCtx["db"] },
  companyWebsiteId: Id<"companyWebsites">,
  searchType: SearchType,
  list: "pair" | "pairByPage",
  askedPeriod: SearchConsolePeriod,
  which: "NOW" | "BEFORE",
  askedKey: string,
  asked?: string,
): Promise<{ from: string; to: string; rows: PeriodRow[] } | null> {
  // As `readPeriod`: a country nearly all of the searches reads all countries', and twelve months kept as the 90 days reads them.
  const country = await searchLinesCountry(ctx, companyWebsiteId, asked);
  const own = await firstPartOf(ctx, companyWebsiteId, country, searchType, list, askedPeriod, which);
  const ninety = await ninetyInstead(ctx, { companyWebsiteId, country, searchType, list }, askedPeriod, which, own, own && own.keys.length === 0 ? 1 : 2);
  const period: SearchConsolePeriod = ninety ? "90" : askedPeriod;
  const first = ninety ?? own;
  if (!first || (first.firstKey === undefined && first.keys.length > 0)) return null;
  // A period built since round two C keeps each page as its number: a page asked for is found by it.
  const pagesNumbered = first.firstKey !== undefined && isPageRef(first.firstKey);
  const key = list === "pairByPage" && pagesNumbered ? await refFor(ctx, companyWebsiteId, askedKey) : askedKey;
  if (key === null) return { from: first.from, to: first.to, rows: [] };
  const before = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period_first", (q) => q
      .eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType).eq("list", list).eq("period", period).eq("which", which)
      .gte("firstKey", "").lt("firstKey", key))
    .order("desc")
    // The part just before, of the build read — an older build being cleared may sit beside it.
    .take(1)
    .then(async (parts) => (parts[0] === undefined || parts[0].builtAt === first.builtAt ? parts[0] ?? null : (await ctx.db
      .query("searchConsolePeriods")
      .withIndex("by_hold_country_type_list_period_first", (q) => q
        .eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType).eq("list", list).eq("period", period).eq("which", which)
        .gte("firstKey", "").lt("firstKey", key))
      .order("desc")
      .take(FIRST_PARTS_READ)).find((part) => part.builtAt === first.builtAt) ?? null));
  const starting = await ctx.db
    .query("searchConsolePeriods")
    .withIndex("by_hold_country_type_list_period_first", (q) => q
      .eq("companyWebsiteId", companyWebsiteId).eq("country", country).eq("searchType", searchType).eq("list", list).eq("period", period).eq("which", which)
      .eq("firstKey", key))
    .take(PARTS_MOST);
  const byKeyword = list === "pair";
  const rows: PeriodRow[] = [];
  const built = starting.filter((part) => part.builtAt === first.builtAt);
  for (const part of [...(before ? [before] : []), ...built.sort((left, right) => left.part - right.part)]) {
    let index = 0;
    for (const row of rowsOf(part)) {
      if ((byKeyword ? row.key : row.page) === key) {
        rows.push(withKept({ key: byKeyword ? (row.page ?? "") : row.key, clicks: row.clicks, impressions: row.impressions, positionSum: row.positionSum }, part, index));
      }
      index += 1;
    }
  }
  // A keyword's pages are its few rows' numbers: back to addresses here.
  if (byKeyword) {
    const addresses = await decodePages(ctx, companyWebsiteId, rows.map((row) => row.key));
    return { from: first.from, to: first.to, rows: rows.map((row, index) => ({ ...row, key: addresses[index] })) };
  }
  return { from: first.from, to: first.to, rows };
}
