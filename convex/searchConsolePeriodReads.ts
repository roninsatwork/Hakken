import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { SearchConsolePeriod, SearchConsolePeriodList, SearchType } from "./searchConsoleSchema";
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
  const scope = country;
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
