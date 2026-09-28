import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { requireMySite } from "./siteAccess";
import { bucketOf, checkStarts, stepValidator, type CheckStarts } from "./siteFigures";
import { listDayComplete, listDayReach, pagesByDay, type ListPageFigures } from "./siteSummaries";
import { tenantQuery } from "./tenantFunctions";

/**
 * Each keyword check of a site in the dates chosen, as New and lost keywords
 * lists them (the design agreed with Anthony on 2026-09-27): what it covered
 * — the site's first check, the first day its whole list was held, the whole
 * list, or the everyday check — how many searches that was, and its moves
 * against the check before. A start has nothing before it and is not counted
 * as moves (`checkStarts` in `siteFigures.ts`).
 */

type Reader = { db: QueryCtx["db"] };

/** Day rows read for one range: two years of daily checks and more. */
const DAYS_READ = 800;

/** A day's figures read per kind of request: an everyday call a day, or up to ten list pages a day, from every place. */
const METRICS_READ = 4_000;

/** Day rows read back to find the site's newest check. */
const NEWEST_READ = 30;

/** Held within this share of the whole, a day's list pages covered the whole list kept. */
const WHOLE_SHARE = 0.9;

export const checkKindValidator = v.union(
  v.literal("FIRST"),
  v.literal("FIRST_LIST"),
  v.literal("WHOLE"),
  v.literal("EVERYDAY"),
);

const counted = v.union(v.number(), v.null());

/** One kind of request's figures from this place in the dates, newest last. */
async function figuresIn(ctx: Reader, websiteId: Id<"websites">, operationId: string, place: number, from: string, to: string) {
  return (await ctx.db
    .query("seoWebsiteMetrics")
    .withIndex("by_website_operation_day", (q) => q.eq("websiteId", websiteId).eq("operationId", operationId).gte("day", from).lte("day", to))
    .take(METRICS_READ))
    .filter((row) => row.locationCode === undefined || row.locationCode === place);
}

/** How many searches the everyday call brought on each day. */
function everydayReturned(rows: Doc<"seoWebsiteMetrics">[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const figures = JSON.parse(row.metricsJson) as { returnedKeywords?: number };
    if (typeof figures.returnedKeywords === "number") byDay.set(row.day, Math.max(byDay.get(row.day) ?? 0, figures.returnedKeywords));
  }
  return byDay;
}

type Kind = "FIRST" | "FIRST_LIST" | "WHOLE" | "EVERYDAY";
type Moves = { rankedNew: number | null; rankedUp: number | null; rankedDown: number | null; rankedLost: number | null; rankedLeft: number | null };
type Check = Moves & { day: string; kind: Kind; checked: number | null; held: number; complete: boolean };

const MOVES = ["rankedNew", "rankedUp", "rankedDown", "rankedLost", "rankedLeft"] as const;

/**
 * One day's check: what it covered, how many searches, and its moves — none
 * for a start. A start or a whole list is as many searches as it held, as the
 * Calendar counts them; an everyday check, as many as it checked again.
 */
function checkOf(
  row: Doc<"siteDaySummaries">,
  starts: CheckStarts,
  coverage: Coverage,
): Check | null {
  if (row.keywords === undefined) return null;
  const dayPages = coverage.pages.get(row.day) ?? [];
  const reach = listDayReach(dayPages);
  // A list's pages filed before they recorded how far they reached were
  // always the whole list: the everyday check's pages came after.
  const whole = coverage.listDays.has(row.day)
    && (reach === null || reach === Number.POSITIVE_INFINITY || reach >= row.keywords * WHOLE_SHARE);
  const kind: Kind = row.day === starts.firstCheck ? "FIRST"
    : row.day === starts.firstList ? "FIRST_LIST"
      : whole ? "WHOLE" : "EVERYDAY";
  const start = kind === "FIRST" || kind === "FIRST_LIST";
  const rechecked = Math.max(coverage.returned.get(row.day) ?? 0, 0, ...dayPages.map((page) => page.listOffset + page.listItems));
  const checked = kind === "EVERYDAY" ? rechecked : row.keywords;
  return {
    day: row.day,
    kind,
    checked: checked > 0 ? checked : null,
    held: row.keywords,
    // A list that held everything the site ranks for — "Whole list" — and
    // not one held to its limit, "the list kept" (sites-data-completeness-plan.md, §4.F).
    complete: coverage.listDays.has(row.day) && listDayComplete(dayPages),
    rankedNew: start ? null : row.rankedNew ?? 0,
    rankedUp: start ? null : row.rankedUp ?? 0,
    rankedDown: start ? null : row.rankedDown ?? 0,
    rankedLost: start ? null : row.rankedLost ?? 0,
    rankedLeft: start ? null : row.rankedLeft ?? 0,
  };
}

/** What says how far each day's check reached: the everyday call's count, and the list's pages. */
type Coverage = { returned: Map<string, number>; pages: Map<string, ListPageFigures[]>; listDays: Set<string> };

/** The figures that say what a check covered, from one place over the days given. */
async function coverageIn(ctx: Reader, websiteId: Id<"websites">, place: number, from: string, to: string): Promise<Coverage> {
  const [everyday, lists] = await Promise.all([
    figuresIn(ctx, websiteId, "domain_ranked_keywords", place, from, to),
    figuresIn(ctx, websiteId, KEYWORD_LIST_OPERATION_ID, place, from, to),
  ]);
  return { returned: everydayReturned(everyday), pages: pagesByDay(lists), listDays: new Set(lists.map((row) => row.day)) };
}

const checkFields = {
  kind: checkKindValidator,
  /** Searches the check covered — those held, for a start or the whole list; null when it said nothing of it. */
  checked: counted,
  /** Searches held after it. */
  held: v.number(),
  /** A list that held everything the site ranks for, not one held to its limit. */
  complete: v.boolean(),
  /** Its moves against the check before; null for a start, which has none. */
  rankedNew: counted,
  rankedUp: counted,
  rankedDown: counted,
  rankedLost: counted,
  /** Searches that left a list held in part: never lost, for each may still rank below its limit. */
  rankedLeft: counted,
};

export const siteChecks = tenantQuery({
  args: { siteId: v.id("companyWebsites"), from: v.string(), to: v.string(), step: stepValidator },
  returns: v.object({
    /**
     * The checks in the dates, a day, week or month a row: its newest
     * check's kind and coverage, and the moves of every check in it but a
     * start's — null when each was a start.
     */
    steps: v.array(v.object({
      /** The step's first day: a check's own day, stepping daily. */
      day: v.string(),
      /** Its newest check. */
      lastDay: v.string(),
      checks: v.number(),
      /** A start in the step, whose searches are not counted as moves. */
      start: v.union(v.literal("FIRST"), v.literal("FIRST_LIST"), v.null()),
      ...checkFields,
    })),
    /** The site's newest check, in the dates or not: the one Wins and losses lists. */
    newest: v.union(v.null(), v.object({ day: v.string(), ...checkFields })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const [starts, days, newestRows] = await Promise.all([
      checkStarts(ctx, websiteId, site.place),
      ctx.db
        .query("siteDaySummaries")
        .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", site.place).gte("day", args.from).lte("day", args.to))
        .take(DAYS_READ),
      ctx.db
        .query("siteDaySummaries")
        .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", site.place))
        .order("desc")
        .take(NEWEST_READ),
    ]);
    const newestRow = newestRows.find((row) => row.keywords !== undefined) ?? null;
    const inDates = await coverageIn(ctx, websiteId, site.place, args.from, args.to);
    const newestCoverage = newestRow && (newestRow.day < args.from || newestRow.day > args.to)
      ? await coverageIn(ctx, websiteId, site.place, newestRow.day, newestRow.day)
      : inDates;

    const steps = new Map<string, Check & { lastDay: string; checks: number; start: "FIRST" | "FIRST_LIST" | null }>();
    for (const row of days) {
      const check = checkOf(row, starts, inDates);
      if (!check) continue;
      const key = bucketOf(check.day, args.step);
      const start = check.kind === "FIRST" || check.kind === "FIRST_LIST" ? check.kind : null;
      const held = steps.get(key);
      if (!held) {
        steps.set(key, { ...check, day: key, lastDay: check.day, checks: 1, start });
        continue;
      }
      // Days arrive oldest first: the newest check says what the step was.
      held.lastDay = check.day;
      held.checks += 1;
      held.kind = check.kind;
      held.checked = check.checked;
      held.held = check.held;
      held.complete = check.complete;
      held.start = held.start ?? start;
      for (const move of MOVES) {
        if (check[move] !== null) held[move] = (held[move] ?? 0) + check[move];
      }
    }

    const newest = newestRow ? checkOf(newestRow, starts, newestCoverage) : null;
    return { steps: [...steps.values()], newest };
  },
});
