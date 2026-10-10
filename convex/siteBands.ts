import { v } from "convex/values";
import { bandMovesSees, bandsSees } from "./utils/sees/organic";
import { seeing, seenValidator } from "./utils/hakkenSees";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireMySite } from "./siteAccess";
import { checkStarts } from "./siteFigures";
import { keywordStanding, readKeywordCopy, type KeywordCopy } from "./siteKeywordCopy";
import { heldTo, listWithCut } from "./siteListPages";
import { tenantQuery } from "./tenantFunctions";
import { bandForPosition, type RankBand } from "./utils/siteShapes";

/**
 * Position bands' view of the newest check (the design agreed with Anthony on
 * 2026-09-27, "B + C together"): how many searches moved from one band of
 * Google's results to another since the check before — a count that holds
 * level can hide two searches leaving the top three and two arriving — which
 * searches they were, and the searches just off page one. Read from the
 * keyword copy, as Wins and losses is, so every count and the list it opens
 * agree. A start — the site's first check, or the first day its whole list
 * was held — has nothing before it, and no moves (`checkStarts`).
 */

/** A band a ranking position falls in: every band but "no longer ranks". */
type Band = Exclude<RankBand, "zz_none">;

const bandValidator = v.union(v.literal("p01_03"), v.literal("p04_10"), v.literal("p11_20"), v.literal("p21_50"), v.literal("p51_up"));
/** Where a move came from: a band, or not ranking at all — a search newly ranking. */
const fromValidator = v.union(bandValidator, v.literal("none"));

/** The positions just off page one: the top of page two. */
const CLOSEST_FROM = 11;
const CLOSEST_TO = 13;

/** The searches just off page one listed, the most searched first. */
const CLOSEST_KEPT = 10;

/** Day rows read back from the newest check to find the one before it. */
const DAYS_BEFORE_READ = 30;

type BandMove = { keyword: string; was: number | null; now: number; from: Band | "none"; to: Band; volume: number | null; page: string };

/**
 * The searches whose band changed at the newest check: newly ranking, or up
 * or down across a band's edge. A move within a band — 5th to 8th — is not
 * one. `change` is the places gained, so the position before is now plus it.
 */
function bandMovesIn(copy: KeywordCopy, isStart: boolean): BandMove[] {
  if (isStart) return [];
  return copy.rows.flatMap((row) => {
    if (row.day !== copy.rankingDay || row.position === null) return [];
    if (row.status !== "NEW" && row.status !== "UP" && row.status !== "DOWN") return [];
    const was = row.status === "NEW" ? null : row.position + row.change;
    const from = was === null ? "none" as const : bandForPosition(was) as Band;
    const to = bandForPosition(row.position) as Band;
    return from === to ? [] : [{ keyword: row.keyword, was, now: row.position, from, to, volume: row.volume, page: row.page }];
  });
}

/**
 * The keyword copy, and what its newest check was when it had nothing before
 * it to move from: the site's first check, or its whole list's first.
 */
async function readNewest(ctx: QueryCtx, websiteId: Id<"websites">, place: number) {
  const [copy, starts] = await Promise.all([readKeywordCopy(ctx, websiteId, place), checkStarts(ctx, websiteId, place)]);
  const day = copy?.rankingDay ?? null;
  const start = day === null ? null : day === starts.firstCheck ? "FIRST" as const : day === starts.firstList ? "FIRST_LIST" as const : null;
  return { copy, start };
}

export const bandMoves = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    /** The newest check, and the one before it the moves are counted from. */
    rankingDay: v.union(v.string(), v.null()),
    previousDay: v.union(v.string(), v.null()),
    /** What the newest check was when it had nothing before it: the first check, or the whole list's first. */
    start: v.union(v.literal("FIRST"), v.literal("FIRST_LIST"), v.null()),
    /** Searches in each band after the newest check. */
    bands: v.object({ p01_03: v.number(), p04_10: v.number(), p11_20: v.number(), p21_50: v.number(), p51_up: v.number() }),
    /** How many searches moved from one band to another; only the pairs that happened. */
    moves: v.array(v.object({ from: fromValidator, to: bandValidator, count: v.number() })),
    /** The searches at positions 11 to 13, the most searched first. */
    closest: v.object({
      rows: v.array(v.object({
        keyword: v.string(),
        position: v.number(),
        volume: v.union(v.number(), v.null()),
        traffic: v.union(v.number(), v.null()),
        page: v.string(),
      })),
      total: v.number(),
    }),
    seen: seenValidator,
  }),
  handler: seeing(async (ctx, args: { siteId: Id<"companyWebsites"> }) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const { copy, start } = await readNewest(ctx, websiteId, site.place);
    const bands = { p01_03: 0, p04_10: 0, p11_20: 0, p21_50: 0, p51_up: 0 };
    if (!copy?.rankingDay) {
      return { rankingDay: null, previousDay: null, start: null, bands, moves: [], closest: { rows: [], total: 0 } };
    }
    const rankingDay = copy.rankingDay;

    const current = copy.rows.filter((row) => row.position !== null && keywordStanding(row, copy.latestCheckDay) === "current");
    for (const row of current) bands[bandForPosition(row.position as number) as Band] += 1;

    const counts = new Map<string, { from: Band | "none"; to: Band; count: number }>();
    for (const move of bandMovesIn(copy, start !== null)) {
      const key = `${move.from}>${move.to}`;
      const held = counts.get(key) ?? { from: move.from, to: move.to, count: 0 };
      held.count += 1;
      counts.set(key, held);
    }

    const closest = current
      .filter((row) => (row.position as number) >= CLOSEST_FROM && (row.position as number) <= CLOSEST_TO)
      .sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1) || left.keyword.localeCompare(right.keyword));

    const before = await ctx.db
      .query("siteDaySummaries")
      .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", site.place).lt("day", rankingDay))
      .order("desc")
      .take(DAYS_BEFORE_READ);
    return {
      rankingDay,
      previousDay: before.find((row) => row.keywords !== undefined)?.day ?? null,
      start,
      bands,
      moves: [...counts.values()],
      closest: {
        rows: closest.slice(0, CLOSEST_KEPT).map((row) => ({
          keyword: row.keyword, position: row.position as number, volume: row.volume, traffic: row.traffic, page: row.page,
        })),
        total: closest.length,
      },
    };
  }, bandsSees),
});

/**
 * Moved searches sent at once, the most searched first: more than any site
 * has shown at one check, and the page says the list is longer past it.
 */
const MOVED_KEPT = 5_000;

/**
 * The searches that changed band at the newest check, the most searched
 * first: all of them, or one square of the grid — from one band (or not
 * ranking) to another. Sent whole, for the page to sort, page and download.
 */
export const listBandMoves = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    from: v.optional(fromValidator),
    to: v.optional(bandValidator),
  },
  returns: v.object({
    ...listWithCut(v.object({
      keyword: v.string(),
      was: v.union(v.number(), v.null()),
      now: v.number(),
      from: fromValidator,
      to: bandValidator,
      volume: v.union(v.number(), v.null()),
      page: v.string(),
    })).fields,
    /** The newest check the moves were made at. */
    day: v.union(v.string(), v.null()),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const { copy, start } = await readNewest(ctx, site.website._id, site.place);
    if (!copy) return { rows: [], cut: null, day: null, seen: bandMovesSees([]) };
    const list = bandMovesIn(copy, start !== null)
      .filter((row) => (args.from === undefined || row.from === args.from) && (args.to === undefined || row.to === args.to))
      .sort((left, right) => (right.volume ?? -1) - (left.volume ?? -1) || left.keyword.localeCompare(right.keyword));
    return { ...heldTo(list, MOVED_KEPT), day: copy.rankingDay, seen: bandMovesSees(list) };
  },
});
